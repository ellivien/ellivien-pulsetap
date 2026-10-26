IMPORTANT COPY/PASTE WARNING
============================

Some examples in this guide are displayed in Markdown code blocks. If you are
copying code into index.html, JavaScript, TOML, or a worker file, copy only the
actual code inside the example.

Do not copy any line made of three backtick characters. Those are guide
formatting marks, not portal code. If they are pasted into index.html, the portal
may deploy but then open with only the header and no chat interface.

Before deploying, search index.html for any line containing three backtick
characters. If you find one, delete that line.

# PulseTap index integration notes

These notes show the browser-side pieces to add to `index.html` or the portal's main client script. Adapt naming to the target portal rather than pasting blindly.

The only normal-chat integration is posting a small recent-context snapshot after conversation state changes.

## Endpoints

```js
const PULSETAP_ENDPOINTS = {
  config: '/.netlify/functions/pulsetap-config',
  subscription: '/.netlify/functions/pulsetap-subscription',
  context: '/.netlify/functions/pulsetap-context',
  inbox: '/.netlify/functions/pulsetap-inbox',
  state: '/.netlify/functions/pulsetap-state',
  test: '/.netlify/functions/pulsetap-test'
};
```

## Auth header

Use the portal's existing authenticated session contract. The function below is
a placeholder and must be adapted to the host portal's real session lookup.

```js
function getPulseTapAuthHeaders() {
  const token = getExistingPortalSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
```

The supplied server verifier expects a signed token with an `ellivien-portal`
scope as one reference pattern. Adapt both sides to the target portal's existing
authentication. Never add a public bypass token.

## Utilities

```js
function base64UrlToUint8Array(base64Url) {
  const padding = '='.repeat((4 - base64Url.length % 4) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}

async function pulseTapJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getPulseTapAuthHeaders(),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `PulseTap request failed: ${response.status}`);
  return data;
}
```

## Register the service worker

The portal must already be PWA-capable. Add the push and click handlers from `service-worker-pulsetap-snippet.js` to the existing service worker.

```js
if ('serviceWorker' in navigator) {
  await navigator.serviceWorker.register('/service-worker.js');
}
```

For iPhone and iPad, the portal must be installed to the Home Screen before Web Push works.

## Enable PulseTap

```js
async function enablePulseTapNotifications(settings = {}) {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('This browser does not support Web Push.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed.');

  const [{ publicKey }, registration] = await Promise.all([
    pulseTapJson(PULSETAP_ENDPOINTS.config),
    navigator.serviceWorker.ready
  ]);

  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(publicKey)
  });

  await pulseTapJson(PULSETAP_ENDPOINTS.subscription, {
    method: 'POST',
    body: JSON.stringify({
      subscription,
      settings: {
        enabled: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London',
        quietHoursStart: 22,
        quietHoursEnd: 8,
        maxPerDay: 2,
        minHoursBetween: 3,
        ...settings
      }
    })
  });
}
```

## Disable PulseTap

```js
async function disablePulseTapNotifications() {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const endpoint = existing?.endpoint || '';
  if (existing) await existing.unsubscribe();
  await pulseTapJson(PULSETAP_ENDPOINTS.subscription, {
    method: 'DELETE',
    body: JSON.stringify({ endpoint })
  });
}
```

## Save settings

```js
async function savePulseTapSettings(settings) {
  await pulseTapJson(PULSETAP_ENDPOINTS.subscription, {
    method: 'POST',
    body: JSON.stringify({ settings })
  });
}
```

## Send a test PulseTap

```js
async function syncThisDevicePulseTapSubscription() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) throw new Error('This browser is not subscribed to PulseTap.');
  await pulseTapJson(PULSETAP_ENDPOINTS.subscription, {
    method: 'POST',
    body: JSON.stringify({ subscription })
  });
}

async function sendPulseTapTest() {
  await syncThisDevicePulseTapSubscription();
  await pulseTapJson(PULSETAP_ENDPOINTS.test, {
    method: 'POST',
    body: JSON.stringify({ message: 'PulseTap test received.' })
  });
}
```

The backend stores multiple device subscriptions. If a user enables PulseTap on desktop and then on phone, both can remain active. The test endpoint sends to all saved devices and returns how many accepted the push.

The included functions keep the companion's latest decision and inbox tap even when the push service rejects delivery. They retain the available HTTP status for diagnosis, remove expired `404`/`410` subscriptions, and clear an old delivery error after a later successful push or test.

## Sync recent context

Call this after messages are saved or after a thread changes. Keep it small. PulseTap only needs enough context for a grounded reach/no-reach decision.

The current version sends a timestamp for real chat activity. This lets the scheduled function pause for a short window after recent conversation. Merely opening, focusing or tapping the portal must not reset that window.

Keep message timestamps in this snapshot. The scheduled function turns them into local times and ages before asking the companion to decide, so stale present-tense wording such as "just went to sleep" is not mistaken for the user's current state hours later.

```js
const PULSETAP_RECENT_CHAT_WINDOW_MS = 5 * 60 * 1000;
const PULSETAP_CONTEXT_MESSAGES = 10;
let lastPulseTapChatActivityAt = 0;

function markPulseTapChatActivity() {
  lastPulseTapChatActivityAt = Date.now();
}

function getCurrentThreadId() {
  return window.currentThreadId || localStorage.getItem('current-thread-id') || null;
}

function getRecentPulseTapMessages() {
  const messages = Array.isArray(window.currentMessages) ? window.currentMessages : [];
  return messages
    .filter(message => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
    .slice(-PULSETAP_CONTEXT_MESSAGES)
    .map(message => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || message.createdAt || null
    }));
}

function getPulseTapSummary() {
  return window.currentThreadSummary || '';
}

async function queuePulseTapContextSync() {
  const now = Date.now();
  try {
    await pulseTapJson(PULSETAP_ENDPOINTS.context, {
      method: 'POST',
      body: JSON.stringify({
        threadId: getCurrentThreadId(),
        summary: getPulseTapSummary(),
        messages: getRecentPulseTapMessages(),
        lastChatActivityAt: lastPulseTapChatActivityAt || null,
        recentChatWindowMs: PULSETAP_RECENT_CHAT_WINDOW_MS
      })
    });
  } catch (error) {
    console.warn('PulseTap context sync failed:', error);
  }
}
```

Add the call wherever the portal already saves chat messages:

```js
await saveMessagesForCurrentThread();
markPulseTapChatActivity();
queuePulseTapContextSync();
```

If the portal already has a central "message saved" or "thread saved" function, call `markPulseTapChatActivity()` there only when an actual user/assistant message was added or edited. It should not be triggered by simply opening the portal settings.

## Deep link from a notification

On page load, check whether the notification opened a specific PulseTap message.

```js
function handlePulseTapDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const pulseTapId = params.get('pulseTap');
  const threadId = params.get('thread');
  if (!pulseTapId) return;

  if (threadId && typeof openThreadById === 'function') openThreadById(threadId);
  if (typeof showPulseTapModal === 'function') showPulseTapModal({ highlightId: pulseTapId });
}

window.addEventListener('DOMContentLoaded', handlePulseTapDeepLink);
```

## Minimal modal shape

The UI can be styled to match the portal. At minimum it should expose:

- enable / disable
- quiet hours in 30-minute steps. Store half-past times as decimals, e.g. `22.5` for 22:30
- max reaches per day. The backend accepts `1` to `12`
- minimum hours between reaches. The backend accepts `1` to `24`
- test notification button
- status panel showing last ask, last decision/reason, next ask, sent today and last sent
- latest push error when present; this should disappear after the next fully successful push or test
- inbox list
- delete / mark read controls
- open-thread/add-to-thread action for saved PulseTaps

```js
async function loadPulseTapModalData() {
  const [subscription, inbox] = await Promise.all([
    pulseTapJson(PULSETAP_ENDPOINTS.subscription),
    pulseTapJson(PULSETAP_ENDPOINTS.inbox)
  ]);
  return { subscription, inbox };
}

async function showPulseTapModal({ highlightId } = {}) {
  const { subscription, inbox } = await loadPulseTapModalData();
  console.log('Render these in your portal modal:', { subscription, inbox, highlightId });
  console.log('Decision state is available at subscription.state:', subscription.state);
}
```

## Add a PulseTap to the thread

When the user chooses to add a saved PulseTap to the matching thread, store it as a normal assistant message, but keep its PulseTap id:

```js
thread.messages.push({
  role: 'assistant',
  content: pulseTap.body,
  timestamp: new Date(Number(pulseTap.sentAt || pulseTap.createdAt || Date.now())).toISOString(),
  pulseTapId: pulseTap.id
});
```

Before adding it, check whether the thread already contains that `pulseTapId`. This prevents duplicate copies if the user opens the inbox twice.

If the portal has message rendering badges, use `pulseTapId` to show a small `PulseTap` marker, coloured message bubble, or gentle pulse effect. This is visual only; it should not change the stored message content or cause an extra model call.

If the portal supports dark mode, do not let the PulseTap bubble inherit the normal dark-mode assistant text colour when the PulseTap bubble uses a pale gradient. Give the PulseTap bubble an explicit readable text colour:

```css
.message.assistant.pulse-tap-message {
  background: linear-gradient(135deg, #ecfeff 0%, #fdf2f8 100%);
  border: 1px solid rgba(20, 184, 166, 0.38);
  border-left: 4px solid #14b8a6;
  color: #1f2937;
}

.message.assistant.pulse-tap-message .message-text {
  color: #1f2937;
}

.pulse-tap-badge {
  background: rgba(20, 184, 166, 0.14);
  border: 1px solid rgba(20, 184, 166, 0.28);
  color: #0f766e;
}
```

If you are adding PulseTap to a portal that may already have PulseTaps copied into threads, add a text fallback too. Some older inserts may have content such as `PulseTap from [companion name]: ...` but no stored `pulseTapId`, so a renderer that checks only `pulseTapId` will miss them.

```js
function isPulseTapThreadMessage(role, content, pulseTapId = null, companionName = 'Companion') {
  const escapedName = String(companionName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fallbackPattern = new RegExp(`^PulseTap from ${escapedName}:`, 'i');
  return Boolean(pulseTapId) || (role === 'assistant' && fallbackPattern.test(String(content || '').trim()));
}
```

Use that helper, or the portal's equivalent, before adding the visual class or badge:

```js
const isPulseTap = isPulseTapThreadMessage(message.role, message.content, message.pulseTapId, companionName);
if (isPulseTap) {
  messageElement.classList.add('pulse-tap-message');
  if (message.pulseTapId) messageElement.dataset.pulseTapId = message.pulseTapId;
}
```

Do not inject PulseTap status into every normal chat prompt. The scheduled function handles the private reach/no-reach decision separately.

