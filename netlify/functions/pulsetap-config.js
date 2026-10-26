const {
  getVapidPublicKey,
  isAuthorisedPortalRequest,
  jsonResponse
} = require('./pulsetap-common.cjs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });
  if (!isAuthorisedPortalRequest(event)) return jsonResponse(401, { error: 'Unauthorized' });

  const publicKey = getVapidPublicKey();
  return jsonResponse(200, {
    configured: Boolean(publicKey && process.env.PULSETAP_VAPID_PRIVATE_KEY),
    publicKey: publicKey || null
  });
};


