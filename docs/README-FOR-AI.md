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

# PulseTap — README for AI-assisted implementation

## What this pack adds

PulseTap gives a companion a bounded, opt-in way to decide whether to send a private push notification while the portal is closed.

It is not a reminder system. It is not scheduled affection. Each scheduled check asks the companion whether they genuinely want to reach now. Silence is valid.

This is a self-supported reference implementation, not a drop-in universal package. Inspect the target portal's authentication, provider, storage, service worker and deployment environment before changing it. Diagnose that environment from its actual sanitised errors rather than repeatedly applying guessed configuration values.

## Provider scope

The scheduled decision function needs a provider call so the companion can decide whether to reach. The included implementation uses an OpenAI-compatible Chat Completions call as a portable default. If the portal uses Anthropic, OpenRouter or another provider, adapt `askCompanionWhetherToReach()` in `pulsetap-scheduled.js`.

## Storage

The included implementation uses Netlify Blobs for:

- push subscription
- PulseTap settings
- recent thread context
- last / next decision state
- inbox messages
- optional portal activity fields for the no-interrupt pause window

## Requirements

The target portal needs:

- PWA-capable deployment
- a service worker
- HTTPS in production
- Netlify Functions or equivalent server functions
- `@netlify/blobs`
- `web-push`
- a portal auth/session mechanism
- a way to post recent thread context from `index.html`
- a UI place to open the PulseTap settings/inbox modal

For iPhone/iPad Web Push, the portal must be installed to the Home Screen as a PWA.

## Files

- `PulseTap-Guide.html` — human-facing guide
- `relationship-mode-examples.md` — optional starting prompts for different chosen relationship and message styles
- `../assets/pulsetap-brand.png` — full-resolution optional PulseTap roundel
- `../assets/pulsetap-icon-512.png` — notification-ready optional PulseTap icon
- `../pulsetap-index-integration.md` — browser-side integration notes and code
- `../service-worker-pulsetap-snippet.js` — service worker push/click handlers
- `../netlify-toml-snippet.toml` — scheduled function snippet
- `../netlify/functions/pulsetap-common.cjs`
- `../netlify/functions/pulsetap-config.js`
- `../netlify/functions/pulsetap-subscription.js`
- `../netlify/functions/pulsetap-context.js`
- `../netlify/functions/pulsetap-inbox.js`
- `../netlify/functions/pulsetap-state.js`
- `../netlify/functions/pulsetap-test.js`
- `../netlify/functions/pulsetap-scheduled.js`

## Environment variables

Required:

- `AUTH_SESSION_SECRET` when using the supplied signed-session verifier; if the
  portal already has a different authentication contract, adapt the verifier
  rather than adding a second session system
- `PULSETAP_VAPID_PUBLIC_KEY`
- `PULSETAP_VAPID_PRIVATE_KEY`
- `PULSETAP_VAPID_SUBJECT`
- `PULSETAP_API_KEY`
- `PULSETAP_MODEL`

Generate VAPID keys with:

```bash
npx web-push generate-vapid-keys
```

Recommended:

- `PULSETAP_COMPANION_NAME`
- `PULSETAP_BASE_PROMPT`
- `PULSETAP_PUSH_HOSTS` only when a legitimate browser push service is not in
  the built-in allowlist; use hostnames only, never arbitrary URLs

Use `relationship-mode-examples.md` as an optional starting point for
`PULSETAP_BASE_PROMPT`. The user may select one example, combine compatible
parts or write a custom prompt. Never commit their real private prompt or
relationship details to the repository.

Auth:

- The included verifier is an example for a signed `Authorization: Bearer
  <session-token>` contract with an `ellivien-portal` scope.
- Adapt `isAuthorisedPortalRequest()` to the target portal's actual authenticated
  session contract. Do not weaken or bypass the portal's existing authentication.

## Netlify schedule

Add this to `netlify.toml`:

```toml
[functions."pulsetap-scheduled"]
  schedule = "*/30 * * * *"
```

Netlify documents that a deployed Scheduled Function cannot be invoked directly
by URL. The supplied handler also requires the scheduler's valid `next_run` JSON
payload and does not accept an ordinary portal session as a substitute. Preserve
the Scheduled Function configuration when adapting or deploying it.

## Implementation rules

- Keep PulseTap opt-in.
- Treat every example relationship mode as optional user-controlled configuration, never as permission to invent intimacy or authority.
- Respect quiet hours, including half-hour boundaries such as `22.5` for 22:30.
- Respect maximum reaches per day. The included backend accepts whole numbers from 1 to 12.
- Respect minimum gap between sent PulseTaps. The included backend accepts `1` to `24` hours.
- Treat the schedule, maximum reaches and minimum gap as opportunity bounds, not obligations. Preserve silence/no as a valid companion decision at every check.
- Keep push notifications short.
- Save a complete short PulseTap body to the inbox, then send a shorter notification preview if needed so the companion is not cut off mid-thought.
- Strip Markdown from push notification bodies.
- Save sent PulseTaps to the inbox before sending the push.
- Persist the companion's latest decision before attempting Web Push. A failed notification must not roll `lastDecisionAt`, `lastDecisionReason`, the inbox, or the next-check time back to an older state.
- On push failure, preserve the saved tap and record the available HTTP status. On a later successful push or test, clear the stored error. Remove expired subscriptions after HTTP `404` or `410`.
- Do not inject PulseTap state into every normal chat prompt.
- Store and expose the latest scheduled decision state so the user can see why the companion sent or stayed silent.
- Give the scheduled decision explicit timing context: current local time, timezone, recent-context age, last chat activity age, and timestamps/ages for recent messages.
- Treat stale present-tense wording as past context when timestamps show it is old. For example, a message saying the user "just went to sleep" last night should not be treated as proof that the user is asleep this morning.
- If the browser sends `lastChatActivityAt` and `recentChatWindowMs`, do not run the model during that recent-chat pause window.
- Do not skip a scheduled check merely because the portal was recently opened, focused, or tapped. Generic portal activity can become stale on PWAs; only real recent chat activity should pause PulseTap.
- When adding an inbox PulseTap into a thread, store the PulseTap id on the message and prevent duplicates.
- Install and call `addPulseTapMarker()` from the browser integration when rendering each message so added PulseTaps receive the supplied visible pill and bubble treatment.
- If the portal already has thread messages copied from PulseTap before this marker existed, add a render fallback for assistant messages beginning with `PulseTap from <companion name>:` so legacy thread copies are highlighted too.
- Copy the bundled PulseTap icon to the host portal's public assets or deliberately replace the default icon path with the adopter's own artwork.
- Do not require strong-consistency Blob reads unless the deployed environment demonstrably supplies the uncached endpoint they require. Standard reads are the portable default. If immediate read-after-update behaviour is essential, implement and test an explicit freshness strategy for that host.

## Test checklist

1. Generate VAPID keys.
2. Add environment variables.
3. Install the locked dependencies with `npm ci`.
4. Register or update the service worker.
5. Add the browser integration from `../pulsetap-index-integration.md`.
6. Deploy.
7. Open the portal as a PWA on the target device.
8. Enable notifications.
9. Send a test PulseTap.
10. Confirm the inbox receives the test or scheduled message.
11. Confirm quiet hours, including half-past boundaries, are respected.
12. Confirm daily limits and minimum-gap settings are respected.
13. Confirm the modal/status panel shows last ask, last decision/reason, next ask, sent-today count and last sent time.
14. Confirm PulseTap stays silent during the recent-chat pause window. Merely
    opening or focusing the portal must not manufacture chat activity.
15. Confirm a saved PulseTap can be added to the matching thread once, with duplicate protection and the supplied visible PulseTap pill.
16. If upgrading an existing portal, confirm any older thread message beginning with `PulseTap from <companion name>:` also renders with the PulseTap visual marker.
17. Simulate or observe a failed push and confirm the new tap and latest decision remain saved; then send a successful test and confirm the old error clears.

