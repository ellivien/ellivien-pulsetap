const {
  STATE_KEY,
  deletePulseTapSubscription,
  getPulseTapStore,
  getPulseTapSubscriptions,
  isAuthorisedPortalRequest,
  jsonResponse,
  sendPulseTapNotification
} = require('./pulsetap-common.cjs');

function getPushFailureDetails(error) {
  const statusCode = Number(error?.statusCode || 0);
  const parts = ['Test PulseTap failed'];
  if (statusCode) parts.push(`HTTP ${statusCode}`);
  return {
    statusCode,
    message: parts.join(' - '),
    subscriptionExpired: statusCode === 404 || statusCode === 410
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });
  if (!isAuthorisedPortalRequest(event)) return jsonResponse(401, { error: 'Unauthorized' });

  const store = getPulseTapStore(event);
  const [subscriptions, savedState] = await Promise.all([
    getPulseTapSubscriptions(store),
    store.get(STATE_KEY, { type: 'json' })
  ]);
  const state = savedState && typeof savedState === 'object' ? savedState : {};
  if (!subscriptions.length) return jsonResponse(409, { error: 'No device is subscribed to PulseTap' });

  const now = Date.now();
  try {
    const payload = {
      title: 'PulseTap',
      body: 'PulseTap test received. If your device tapped you, the doorbell works.',
      url: '/?pulseTapTest=1',
      tag: `pulsetap-test-${Date.now()}`,
      data: { kind: 'pulsetap-test' }
    };
    const results = await Promise.allSettled(subscriptions.map(subscription => sendPulseTapNotification(subscription, payload)));
    const sent = results.filter(result => result.status === 'fulfilled').length;
    const staleDeletes = [];
    results.forEach((result, index) => {
      if (result.status !== 'rejected') return;
      const statusCode = Number(result.reason?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) staleDeletes.push(deletePulseTapSubscription(store, subscriptions[index]?.endpoint));
    });
    await Promise.all(staleDeletes);
    if (!sent) {
      const failure = getPushFailureDetails(
        results.find(result => result.status === 'rejected')?.reason || new Error('No subscribed device accepted the test PulseTap')
      );
      await store.setJSON(STATE_KEY, {
        ...state,
        lastDeliveryAt: now,
        lastDeliveryStatus: 'test_failed',
        lastErrorAt: now,
        lastError: failure.message
      });
      return jsonResponse(502, {
        error: failure.message,
        statusCode: failure.statusCode || null,
        subscriptionExpired: failure.subscriptionExpired
      });
    }

    const rejected = results.filter(result => result.status === 'rejected');
    const partialFailure = rejected.length ? getPushFailureDetails(rejected[0].reason) : null;
    const partialError = partialFailure
      ? `Test reached ${sent} of ${subscriptions.length} devices - ${partialFailure.message}`
      : '';
    await store.setJSON(STATE_KEY, {
      ...state,
      lastDeliveryAt: now,
      lastDeliveryStatus: rejected.length ? 'test_partially_sent' : 'test_sent',
      lastErrorAt: partialError ? now : 0,
      lastError: partialError
    });
    return jsonResponse(200, { success: true, sent, attempted: subscriptions.length });
  } catch (error) {
    const failure = getPushFailureDetails(error);
    await store.setJSON(STATE_KEY, {
      ...state,
      lastDeliveryAt: now,
      lastDeliveryStatus: 'test_failed',
      lastErrorAt: now,
      lastError: failure.message
    });
    return jsonResponse(502, {
      error: failure.message,
      statusCode: failure.statusCode || null,
      subscriptionExpired: failure.subscriptionExpired
    });
  }
};

