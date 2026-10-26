const crypto = require('crypto');
const fs = require('fs');

function loadWebPush() {
  return require('web-push');
}

function loadBlobSdk() {
  return require('@netlify/blobs');
}

const STORE_NAME = 'pulsetap';
const SUBSCRIPTION_KEY = 'primary-subscription';
const SUBSCRIPTIONS_KEY = 'subscriptions';
const SETTINGS_KEY = 'settings';
const STATE_KEY = 'state';
const CONTEXT_KEY = 'recent-context';
const INBOX_KEY = 'inbox';

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

function verifySessionToken(token, secret) {
  if (!token || !secret || typeof token !== 'string') return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

  const supplied = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.scope === 'ellivien-portal' && Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

function isAuthorisedPortalRequest(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const suppliedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const sessionSecret = process.env.AUTH_SESSION_SECRET;
  return verifySessionToken(suppliedToken, sessionSecret);
}

function getLocalPulseTapStore() {
  const path = '/tmp/ellivien-pulsetap-store.json';
  const readAll = () => {
    try {
      return JSON.parse(fs.readFileSync(path, 'utf8'));
    } catch {
      return {};
    }
  };
  const writeAll = data => fs.writeFileSync(path, JSON.stringify(data));
  return {
    async get(key, options = {}) {
      const value = readAll()[key];
      if (value === undefined) return null;
      return options.type === 'json' ? value : JSON.stringify(value);
    },
    async setJSON(key, value) {
      const data = readAll();
      data[key] = value;
      writeAll(data);
      return { modified: true };
    },
    async delete(key) {
      const data = readAll();
      delete data[key];
      writeAll(data);
    }
  };
}

function isLocalBlobFallback(event) {
  const host = event?.headers?.host || event?.headers?.Host || '';
  return host.startsWith('localhost:') || host.startsWith('127.0.0.1:') || host.startsWith('[::1]:');
}

function getPulseTapStore(event) {
  if (isLocalBlobFallback(event)) return getLocalPulseTapStore();
  const { connectLambda, getStore } = loadBlobSdk();
  if (event?.blobs) connectLambda(event);
  return getStore(STORE_NAME);
}

function validateSubscription(subscription) {
  return Boolean(
    subscription &&
    typeof subscription.endpoint === 'string' &&
    isAllowedPushEndpoint(subscription.endpoint) &&
    subscription.keys &&
    typeof subscription.keys.p256dh === 'string' &&
    typeof subscription.keys.auth === 'string'
  );
}

function isAllowedPushEndpoint(endpoint) {
  let hostname;
  try {
    const url = new URL(String(endpoint || ''));
    if (url.protocol !== 'https:') return false;
    hostname = url.hostname.toLowerCase();
  } catch {
    return false;
  }
  const defaults = [
    'android.googleapis.com',
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    'notify.windows.com',
    'web.push.apple.com'
  ];
  const configured = String(process.env.PULSETAP_PUSH_HOSTS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return [...defaults, ...configured].some(allowed =>
    hostname === allowed || hostname.endsWith(`.${allowed}`)
  );
}

function normalizeSubscriptionList(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .filter(validateSubscription)
    .filter(subscription => {
      if (seen.has(subscription.endpoint)) return false;
      seen.add(subscription.endpoint);
      return true;
    })
    .slice(0, 12);
}

async function getPulseTapSubscriptions(store) {
  const [savedList, primary] = await Promise.all([
    store.get(SUBSCRIPTIONS_KEY, { type: 'json' }),
    store.get(SUBSCRIPTION_KEY, { type: 'json' })
  ]);
  return normalizeSubscriptionList([
    ...normalizeSubscriptionList(savedList),
    ...(validateSubscription(primary) ? [primary] : [])
  ]);
}

async function savePulseTapSubscription(store, subscription) {
  if (!validateSubscription(subscription)) return normalizeSubscriptionList(await store.get(SUBSCRIPTIONS_KEY, { type: 'json' }));
  const existing = await getPulseTapSubscriptions(store);
  const updated = normalizeSubscriptionList([
    subscription,
    ...existing.filter(item => item.endpoint !== subscription.endpoint)
  ]);
  await Promise.all([
    store.setJSON(SUBSCRIPTIONS_KEY, updated),
    store.setJSON(SUBSCRIPTION_KEY, subscription)
  ]);
  return updated;
}

async function deletePulseTapSubscription(store, endpoint = '') {
  const trimmedEndpoint = String(endpoint || '').trim();
  if (!trimmedEndpoint) {
    await Promise.all([
      store.delete(SUBSCRIPTIONS_KEY),
      store.delete(SUBSCRIPTION_KEY)
    ]);
    return [];
  }
  const updated = (await getPulseTapSubscriptions(store)).filter(subscription => subscription.endpoint !== trimmedEndpoint);
  await store.setJSON(SUBSCRIPTIONS_KEY, updated);
  const primary = await store.get(SUBSCRIPTION_KEY, { type: 'json' });
  if (primary?.endpoint === trimmedEndpoint) {
    if (updated[0]) await store.setJSON(SUBSCRIPTION_KEY, updated[0]);
    else await store.delete(SUBSCRIPTION_KEY);
  }
  return updated;
}

function getVapidPublicKey() {
  return String(process.env.PULSETAP_VAPID_PUBLIC_KEY || '').trim();
}

function configureWebPush() {
  const publicKey = getVapidPublicKey();
  const privateKey = String(process.env.PULSETAP_VAPID_PRIVATE_KEY || '').trim();
  const subject = String(process.env.PULSETAP_VAPID_SUBJECT || 'mailto:hello@example.com').trim();
  if (!publicKey || !privateKey) throw new Error('PulseTap VAPID keys are not configured');
  const webpush = loadWebPush();
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return webpush;
}

async function sendPulseTapNotification(subscription, payload) {
  const webpush = configureWebPush();
  const notification = {
    title: String(payload.title || 'PulseTap').slice(0, 80),
    body: String(payload.body || '').slice(0, 240),
    icon: String(payload.icon || '/assets/pulsetap-icon-512.png'),
    url: String(payload.url || '/'),
    tag: String(payload.tag || `pulsetap-${Date.now()}`),
    timestamp: Number(payload.timestamp || Date.now()),
    requireInteraction: false,
    data: payload.data && typeof payload.data === 'object' ? payload.data : {}
  };
  return webpush.sendNotification(subscription, JSON.stringify(notification), {
    TTL: 60 * 60,
    urgency: 'high'
  });
}

module.exports = {
  CONTEXT_KEY,
  INBOX_KEY,
  SETTINGS_KEY,
  STATE_KEY,
  SUBSCRIPTION_KEY,
  SUBSCRIPTIONS_KEY,
  deletePulseTapSubscription,
  getPulseTapStore,
  getPulseTapSubscriptions,
  getVapidPublicKey,
  isAllowedPushEndpoint,
  isAuthorisedPortalRequest,
  jsonResponse,
  savePulseTapSubscription,
  sendPulseTapNotification,
  validateSubscription,
  verifySessionToken
};

