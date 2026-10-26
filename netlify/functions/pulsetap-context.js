const {
  CONTEXT_KEY,
  getPulseTapStore,
  isAuthorisedPortalRequest,
  jsonResponse
} = require('./pulsetap-common.cjs');

const PULSETAP_CONTEXT_MESSAGES = 10;

function messageTimestamp(message) {
  const value = message?.timestamp || message?.createdAt || message?.time || 0;
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });
  if (!isAuthorisedPortalRequest(event)) return jsonResponse(401, { error: 'Unauthorized' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter(message => ['user', 'assistant'].includes(message?.role) && typeof message?.content === 'string')
    .slice(-PULSETAP_CONTEXT_MESSAGES)
    .map(message => ({
      role: message.role,
      content: message.content.slice(0, 3000),
      timestamp: messageTimestamp(message) || null
    }));

  const context = {
    threadId: String(body.threadId || '').slice(0, 200) || null,
    summary: String(body.summary || '').slice(0, 200),
    messages,
    savedAt: Date.now(),
    portalActiveUntil: Number(body.portalActiveUntil || 0) || null,
    lastChatActivityAt: Number(body.lastChatActivityAt || 0) || null,
    recentChatWindowMs: Math.max(0, Math.min(30 * 60 * 1000, Number(body.recentChatWindowMs || 0))) || null
  };
  await getPulseTapStore(event).setJSON(CONTEXT_KEY, context);
  return jsonResponse(200, { success: true });
};

