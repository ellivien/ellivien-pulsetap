const crypto = require('crypto');

const {
  CONTEXT_KEY,
  INBOX_KEY,
  SETTINGS_KEY,
  STATE_KEY,
  deletePulseTapSubscription,
  getPulseTapStore,
  getPulseTapSubscriptions,
  isAuthorisedPortalRequest,
  jsonResponse,
  sendPulseTapNotification
} = require('./pulsetap-common.cjs');

const DEFAULT_SETTINGS = {
  enabled: false,
  timezone: 'Europe/London',
  quietHoursStart: 22,
  quietHoursEnd: 8,
  maxPerDay: 2,
  minHoursBetween: 3
};

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.round(number));
}

function normalizeSettings(value = {}) {
  return {
    enabled: Boolean(value.enabled),
    timezone: typeof value.timezone === 'string' && value.timezone.length <= 80 ? value.timezone : DEFAULT_SETTINGS.timezone,
    quietHoursStart: Math.round(clampNumber(value.quietHoursStart, DEFAULT_SETTINGS.quietHoursStart, 0, 23.5) * 2) / 2,
    quietHoursEnd: Math.round(clampNumber(value.quietHoursEnd, DEFAULT_SETTINGS.quietHoursEnd, 0, 23.5) * 2) / 2,
    maxPerDay: positiveInteger(value.maxPerDay, DEFAULT_SETTINGS.maxPerDay),
    minHoursBetween: Math.round(clampNumber(value.minHoursBetween, DEFAULT_SETTINGS.minHoursBetween, 1, 24))
  };
}

function getLocalParts(timezone) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const now = new Date();
  const parts = formatter.formatToParts(now);

  const pick = type => parts.find(part => part.type === type)?.value || '';
  return {
    hour: Number(pick('hour')) + (Number(pick('minute') || 0) / 60),
    dayKey: `${pick('year')}-${pick('month')}-${pick('day')}`,
    localTime: `${pick('hour')}:${pick('minute')}`,
    localDateTime: formatter.format(now)
  };
}

function formatLocalDateTime(timestamp, timezone) {
  const value = Number(timestamp || 0);
  if (!value) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatDuration(ms) {
  const value = Math.max(0, Number(ms || 0));
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (value < minute) return 'less than 1 minute ago';
  if (value < hour) {
    const minutes = Math.round(value / minute);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (value < day) {
    const hours = Math.round(value / hour);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.round(value / day);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function isQuietHour(settings) {
  const { hour } = getLocalParts(settings.timezone);
  if (!Number.isFinite(hour)) return false;
  if (settings.quietHoursStart === settings.quietHoursEnd) return false;
  if (settings.quietHoursStart < settings.quietHoursEnd) {
    return hour >= settings.quietHoursStart && hour < settings.quietHoursEnd;
  }
  return hour >= settings.quietHoursStart || hour < settings.quietHoursEnd;
}

function stripMarkdown(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateAtWordBoundary(text, limit) {
  const cleaned = String(text || '').trim();
  if (!cleaned || cleaned.length <= limit) return cleaned;
  const clipped = cleaned.slice(0, limit - 1).trim();
  const lastSpace = clipped.lastIndexOf(' ');
  const shortened = lastSpace > Math.floor(limit * 0.6) ? clipped.slice(0, lastSpace).trim() : clipped;
  return `${shortened || clipped}…`;
}

function normalizeInbox(value) {
  return (Array.isArray(value) ? value : [])
    .filter(message => message && typeof message.id === 'string' && typeof message.body === 'string')
    .slice(0, 100);
}

function normalizeContext(value) {
  if (!value || typeof value !== 'object') return null;
  const now = Date.now();
  const savedAt = Number(value.savedAt || 0);
  const ageMs = now - savedAt;
  if (!savedAt || ageMs > 36 * 60 * 60 * 1000) return null;
  const portalActiveUntil = Number(value.portalActiveUntil || 0) || null;
  const lastChatActivityAt = Number(value.lastChatActivityAt || 0) || null;
  const recentChatWindowMs = clampNumber(value.recentChatWindowMs, 5 * 60 * 1000, 0, 30 * 60 * 1000);

  const messages = (Array.isArray(value.messages) ? value.messages : [])
    .filter(message => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
    .slice(-8)
    .map(message => ({
      role: message.role,
      content: message.content.slice(0, 1000),
      timestamp: Number(message.timestamp || 0) || null,
      ageMs: Number(message.timestamp || 0) ? now - Number(message.timestamp || 0) : null,
      age: Number(message.timestamp || 0) ? formatDuration(now - Number(message.timestamp || 0)) : 'unknown'
    }));

  return {
    threadId: value.threadId ? String(value.threadId).slice(0, 200) : null,
    summary: value.summary ? String(value.summary).slice(0, 600) : '',
    messages,
    savedAt,
    portalActiveUntil,
    lastChatActivityAt,
    recentChatWindowMs,
    contextAgeMs: ageMs,
    contextAge: formatDuration(ageMs),
    lastChatActivityAgeMs: lastChatActivityAt ? now - lastChatActivityAt : null,
    lastChatActivityAge: lastChatActivityAt ? formatDuration(now - lastChatActivityAt) : null
  };
}

function buildDailyReachContext(settings, state, context) {
  const { dayKey, localTime, localDateTime } = getLocalParts(settings.timezone);
  const sentToday = state.sentDay === dayKey ? Number(state.sentToday || 0) : 0;
  return {
    now: new Date().toISOString(),
    timezone: settings.timezone,
    localDateTime,
    localTime,
    localDay: dayKey,
    sentToday,
    maxPerDay: settings.maxPerDay,
    lastDecision: state.lastDecision || '',
    lastDecisionReason: state.lastDecisionReason || '',
    lastSentAt: state.lastSentAt ? new Date(Number(state.lastSentAt)).toISOString() : null,
    contextSavedAt: context?.savedAt ? new Date(Number(context.savedAt)).toISOString() : null,
    contextSavedAtLocal: context?.savedAt ? formatLocalDateTime(context.savedAt, settings.timezone) : null,
    contextAge: context?.contextAge || null,
    lastChatActivityAt: context?.lastChatActivityAt ? new Date(Number(context.lastChatActivityAt)).toISOString() : null,
    lastChatActivityAtLocal: context?.lastChatActivityAt ? formatLocalDateTime(context.lastChatActivityAt, settings.timezone) : null,
    lastChatActivityAge: context?.lastChatActivityAge || null,
    recentThreadSummary: context?.summary || '',
    recentMessages: context?.messages || []
  };
}

function parseDecisionJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || '').match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function askCompanionWhetherToReach(context, dailyContext) {
  const apiKey = process.env.PULSETAP_API_KEY;
  if (!apiKey) throw new Error('Missing PULSETAP_API_KEY');

  const companionName = process.env.PULSETAP_COMPANION_NAME || 'your companion';
  const model = process.env.PULSETAP_MODEL || 'gpt-4.1-mini';
  const basePrompt = String(process.env.PULSETAP_BASE_PROMPT || '').trim();

  const system = [
    basePrompt,
    `You are ${companionName}. PulseTap is a private opt-in chance to decide whether to send one short push notification while the portal is closed.`,
    'Pay close attention to current local time, context age, last chat activity age, and individual message ages.',
    'If a recent message says something like "just went to sleep" but its timestamp/age shows it was hours ago or yesterday, treat it as past context, not proof the user is sleeping now.',
    'Do not assume the user is currently asleep, awake, upset, or available unless the timing context supports that interpretation.',
    'This is not a reminder system and not scheduled affection. Silence is valid and often correct.',
    'The schedule creates an opportunity, not an obligation. You may choose silence/no at any check.',
    'Only send if there is a specific, grounded reason to reach now. Aim for 1-2 sentences and under 320 characters. Finish the thought cleanly. No Markdown.',
    'Reply with strict JSON only: {"send":true|false,"body":"...","reason":"..."}'
  ].filter(Boolean).join('\n\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 260,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: JSON.stringify({
            pulseTapContext: dailyContext,
            latestPortalContext: context || null
          })
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PulseTap model call failed: ${response.status} ${text.slice(0, 180)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const decision = parseDecisionJson(content) || {};
  return {
    send: Boolean(decision.send),
    body: truncateAtWordBoundary(stripMarkdown(decision.body), 600),
    reason: stripMarkdown(decision.reason).slice(0, 240)
  };
}

function isScheduledOrAuthorised(event) {
  const eventName = event.headers?.['x-netlify-event'] || event.headers?.['X-Netlify-Event'] || '';
  return eventName === 'schedule' || isAuthorisedPortalRequest(event);
}

async function saveSkipDecision(store, state, dayKey, sentToday, now, reason, skipped) {
  const nextDecisionAt = now + 10 * 60 * 1000;
  await store.setJSON(STATE_KEY, {
    ...state,
    lastDecisionAt: now,
    lastDecision: 'silent',
    lastDecisionReason: reason,
    nextDecisionAt,
    sentDay: dayKey,
    sentToday
  });
  return jsonResponse(200, { skipped, reason });
}

function getPushFailureDetails(error) {
  const statusCode = Number(error?.statusCode || 0);
  const responseBody = String(error?.body || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  const parts = [String(error?.message || 'PulseTap notification failed')];
  if (statusCode) parts.push(`HTTP ${statusCode}`);
  if (responseBody && responseBody !== parts[0]) parts.push(responseBody);
  return {
    statusCode,
    message: parts.join(' - '),
    subscriptionExpired: statusCode === 404 || statusCode === 410
  };
}

exports.handler = async (event) => {
  if (!isScheduledOrAuthorised(event)) return jsonResponse(401, { error: 'Unauthorized' });

  const store = getPulseTapStore(event);
  const [subscriptions, savedSettings, savedState, savedContext, savedInbox] = await Promise.all([
    getPulseTapSubscriptions(store),
    store.get(SETTINGS_KEY, { type: 'json' }),
    store.get(STATE_KEY, { type: 'json' }),
    store.get(CONTEXT_KEY, { type: 'json' }),
    store.get(INBOX_KEY, { type: 'json' })
  ]);

  const settings = normalizeSettings(savedSettings || DEFAULT_SETTINGS);
  const state = savedState && typeof savedState === 'object' ? savedState : {};
  const now = Date.now();
  const { dayKey } = getLocalParts(settings.timezone);
  const sentToday = state.sentDay === dayKey ? Number(state.sentToday || 0) : 0;

  if (!settings.enabled) return jsonResponse(200, { skipped: 'disabled' });
  if (!subscriptions.length) return jsonResponse(200, { skipped: 'no-subscription' });
  if (isQuietHour(settings)) return jsonResponse(200, { skipped: 'quiet-hours' });
  if (sentToday >= settings.maxPerDay) return jsonResponse(200, { skipped: 'daily-limit' });
  if (Number(state.nextDecisionAt || 0) > now) return jsonResponse(200, { skipped: 'waiting' });
  if (Number(state.lastSentAt || 0) && now - Number(state.lastSentAt) < settings.minHoursBetween * 60 * 60 * 1000) {
    return jsonResponse(200, { skipped: 'min-gap' });
  }

  const context = normalizeContext(savedContext);
  if (context?.lastChatActivityAt && now - context.lastChatActivityAt < context.recentChatWindowMs) {
    return saveSkipDecision(store, state, dayKey, sentToday, now, 'Recent conversation inside the PulseTap pause window.', 'recent-chat');
  }

  const dailyContext = buildDailyReachContext(settings, { ...state, sentDay: dayKey, sentToday }, context);

  let decisionState = null;

  try {
    const decision = await askCompanionWhetherToReach(context, dailyContext);
    const nextDecisionAt = now + (decision.send ? (3 + Math.random() * 2) * 60 * 60 * 1000 : 60 * 60 * 1000);

    decisionState = {
      ...state,
      lastDecisionAt: now,
      lastDecision: decision.send ? 'send' : 'silent',
      lastDecisionReason: decision.reason || '',
      nextDecisionAt,
      sentDay: dayKey,
      sentToday
    };

    if (!decision.send || !decision.body) {
      await store.setJSON(STATE_KEY, decisionState);
      return jsonResponse(200, { decision: 'silent', reason: decision.reason || '' });
    }

    const id = crypto.randomUUID();
    const companionName = process.env.PULSETAP_COMPANION_NAME || 'PulseTap';
    const url = context?.threadId
      ? `/?pulseTap=${encodeURIComponent(id)}&thread=${encodeURIComponent(context.threadId)}`
      : `/?pulseTap=${encodeURIComponent(id)}`;
    const message = {
      id,
      body: decision.body,
      reason: decision.reason || '',
      createdAt: now,
      read: false,
      source: 'scheduled',
      threadId: context?.threadId || null
    };
    const inbox = [message, ...normalizeInbox(savedInbox)].slice(0, 100);

    const pendingDeliveryState = {
      ...decisionState,
      lastMessage: decision.body,
      lastDeliveryAt: now,
      lastDeliveryStatus: 'pending'
    };

    // Persist the companion's decision before Web Push so a delivery error
    // cannot roll Last ask / Last decision back to the previous check.
    await store.setJSON(STATE_KEY, pendingDeliveryState);
    await store.setJSON(INBOX_KEY, inbox);
    const notificationBody = truncateAtWordBoundary(stripMarkdown(decision.body), 220) || decision.body;
    const pushPayload = {
      title: companionName,
      body: notificationBody,
      url,
      tag: `pulsetap-${id}`,
      timestamp: now,
      data: { id, threadId: context?.threadId || null }
    };
    const results = await Promise.allSettled(subscriptions.map(subscription => sendPulseTapNotification(subscription, pushPayload)));
    const fulfilled = results.filter(result => result.status === 'fulfilled');
    const staleDeletes = [];
    results.forEach((result, index) => {
      if (result.status !== 'rejected') return;
      const statusCode = Number(result.reason?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) staleDeletes.push(deletePulseTapSubscription(store, subscriptions[index]?.endpoint));
    });
    await Promise.all(staleDeletes);
    if (!fulfilled.length) {
      const failure = getPushFailureDetails(
        results.find(result => result.status === 'rejected')?.reason || new Error('No PulseTap subscriptions accepted the notification')
      );
      await store.setJSON(STATE_KEY, {
        ...pendingDeliveryState,
        lastDeliveryStatus: 'notification_failed',
        lastErrorAt: now,
        lastError: failure.message
      });
      return jsonResponse(502, {
        error: failure.message,
        decision: 'saved',
        id,
        statusCode: failure.statusCode || null,
        subscriptionExpired: failure.subscriptionExpired
      });
    }

    const rejected = results.filter(result => result.status === 'rejected');
    const partialFailure = rejected.length ? getPushFailureDetails(rejected[0].reason) : null;
    const partialError = partialFailure
      ? `PulseTap reached ${fulfilled.length} of ${subscriptions.length} devices - ${partialFailure.message}`
      : '';

    await store.setJSON(STATE_KEY, {
      ...pendingDeliveryState,
      lastSentAt: now,
      lastMessage: decision.body,
      lastDeliveryStatus: rejected.length ? 'partially_sent' : 'sent',
      sentToday: sentToday + 1,
      sentDay: dayKey,
      lastErrorAt: partialError ? now : 0,
      lastError: partialError
    });

    return jsonResponse(200, { decision: 'sent', id, sent: fulfilled.length, attempted: subscriptions.length });
  } catch (error) {
    const failure = getPushFailureDetails(error);
    const preservedState = decisionState || state;
    await store.setJSON(STATE_KEY, {
      ...preservedState,
      lastErrorAt: now,
      lastError: failure.message,
      nextDecisionAt: Number(preservedState.nextDecisionAt || 0) || now + 60 * 60 * 1000
    });
    return jsonResponse(500, { error: failure.message });
  }
};

