const {
  SETTINGS_KEY,
  STATE_KEY,
  deletePulseTapSubscription,
  getPulseTapStore,
  getPulseTapSubscriptions,
  isAuthorisedPortalRequest,
  jsonResponse,
  savePulseTapSubscription,
  validateSubscription
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
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function sanitizeHalfHour(value, fallback) {
  const clamped = clampNumber(value, fallback, 0, 23.5);
  return Math.round(clamped * 2) / 2;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.round(parsed));
}

function sanitizeSettings(input = {}) {
  const timezone = typeof input.timezone === 'string' && input.timezone.length <= 80
    ? input.timezone
    : DEFAULT_SETTINGS.timezone;
  return {
    enabled: Boolean(input.enabled),
    timezone,
    quietHoursStart: sanitizeHalfHour(input.quietHoursStart ?? DEFAULT_SETTINGS.quietHoursStart, DEFAULT_SETTINGS.quietHoursStart),
    quietHoursEnd: sanitizeHalfHour(input.quietHoursEnd ?? DEFAULT_SETTINGS.quietHoursEnd, DEFAULT_SETTINGS.quietHoursEnd),
    maxPerDay: positiveInteger(input.maxPerDay ?? DEFAULT_SETTINGS.maxPerDay, DEFAULT_SETTINGS.maxPerDay),
    minHoursBetween: Math.round(clampNumber(input.minHoursBetween ?? DEFAULT_SETTINGS.minHoursBetween, DEFAULT_SETTINGS.minHoursBetween, 1, 24))
  };
}

exports.handler = async (event) => {
  if (!isAuthorisedPortalRequest(event)) return jsonResponse(401, { error: 'Unauthorized' });
  const store = getPulseTapStore(event);

  if (event.httpMethod === 'GET') {
    const [subscriptions, savedSettings, savedState] = await Promise.all([
      getPulseTapSubscriptions(store),
      store.get(SETTINGS_KEY, { type: 'json' }),
      store.get(STATE_KEY, { type: 'json' })
    ]);
    const state = savedState && typeof savedState === 'object' ? savedState : {};
    return jsonResponse(200, {
      subscribed: subscriptions.length > 0,
      subscriptionCount: subscriptions.length,
      settings: sanitizeSettings(savedSettings || DEFAULT_SETTINGS),
      state: {
        lastDecisionAt: Number(state.lastDecisionAt || 0),
        lastDecision: state.lastDecision || '',
        lastDecisionReason: state.lastDecisionReason || '',
        nextDecisionAt: Number(state.nextDecisionAt || 0),
        lastSentAt: Number(state.lastSentAt || 0),
        lastMessage: state.lastMessage || '',
        lastErrorAt: Number(state.lastErrorAt || 0),
        lastError: state.lastError || '',
        sentDay: state.sentDay || '',
        sentToday: Number(state.sentToday || 0)
      }
    });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON' });
    }

    if (body.subscription !== undefined) {
      if (!validateSubscription(body.subscription)) return jsonResponse(400, { error: 'Invalid push subscription' });
      await savePulseTapSubscription(store, body.subscription);
    }

    if (body.settings !== undefined) {
      await store.setJSON(SETTINGS_KEY, sanitizeSettings(body.settings));
    }

    return jsonResponse(200, { success: true });
  }

  if (event.httpMethod === 'DELETE') {
    let endpoint = '';
    try {
      endpoint = String(JSON.parse(event.body || '{}').endpoint || '');
    } catch {
      endpoint = '';
    }
    const updated = await deletePulseTapSubscription(store, endpoint);
    if (!endpoint) await store.setJSON(SETTINGS_KEY, DEFAULT_SETTINGS);
    return jsonResponse(200, { success: true, subscribed: updated.length > 0, subscriptionCount: updated.length });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

