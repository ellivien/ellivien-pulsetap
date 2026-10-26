const {
  STATE_KEY,
  getPulseTapStore,
  isAuthorisedPortalRequest,
  jsonResponse
} = require('./pulsetap-common.cjs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });
  if (!isAuthorisedPortalRequest(event)) return jsonResponse(401, { error: 'Unauthorized' });

  const state = await getPulseTapStore(event).get(STATE_KEY, { type: 'json' });
  const safeState = state && typeof state === 'object' ? state : {};

  return jsonResponse(200, {
    lastDecisionAt: Number(safeState.lastDecisionAt || 0) || null,
    lastDecision: safeState.lastDecision || null,
    lastDecisionReason: safeState.lastDecisionReason || null,
    lastSentAt: Number(safeState.lastSentAt || 0) || null,
    lastMessage: safeState.lastMessage || null,
    nextDecisionAt: Number(safeState.nextDecisionAt || 0) || null,
    sentDay: safeState.sentDay || null,
    sentToday: Number(safeState.sentToday || 0) || 0,
    lastDailyContext: safeState.lastDailyContext || null
  });
};


