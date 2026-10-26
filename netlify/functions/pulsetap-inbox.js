const {
  INBOX_KEY,
  getPulseTapStore,
  isAuthorisedPortalRequest,
  jsonResponse
} = require('./pulsetap-common.cjs');

function normalizeMessages(value) {
  return (Array.isArray(value) ? value : [])
    .filter(message => message && typeof message.id === 'string' && typeof message.body === 'string')
    .slice(0, 100);
}

exports.handler = async (event) => {
  if (!isAuthorisedPortalRequest(event)) return jsonResponse(401, { error: 'Unauthorized' });
  const store = getPulseTapStore(event);
  const messages = normalizeMessages(await store.get(INBOX_KEY, { type: 'json' }));

  if (event.httpMethod === 'GET') return jsonResponse(200, { messages });

  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON' });
    }
    const id = String(body.id || '');
    const updated = messages.map(message => (
      !id || message.id === id ? { ...message, read: true, readAt: Date.now() } : message
    ));
    await store.setJSON(INBOX_KEY, updated);
    return jsonResponse(200, { success: true });
  }

  if (event.httpMethod === 'DELETE') {
    let id = '';
    try {
      id = String(JSON.parse(event.body || '{}').id || '');
    } catch {
      id = '';
    }
    const updated = id ? messages.filter(message => message.id !== id) : [];
    await store.setJSON(INBOX_KEY, updated);
    return jsonResponse(200, { success: true, remaining: updated.length });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};


