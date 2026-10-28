'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const common = require('../netlify/functions/pulsetap-common.cjs');
const scheduled = require('../netlify/functions/pulsetap-scheduled.js');

function signedToken(secret, payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

test('session verification accepts only a valid unexpired portal token', () => {
  const secret = 'synthetic-test-secret';
  const valid = signedToken(secret, { scope: 'ellivien-portal', exp: Date.now() + 60_000 });
  const wrongScope = signedToken(secret, { scope: 'something-else', exp: Date.now() + 60_000 });
  const expired = signedToken(secret, { scope: 'ellivien-portal', exp: Date.now() - 1 });
  assert.equal(common.verifySessionToken(valid, secret), true);
  assert.equal(common.verifySessionToken(wrongScope, secret), false);
  assert.equal(common.verifySessionToken(expired, secret), false);
  assert.equal(common.verifySessionToken(valid, 'wrong-secret'), false);
});

test('public local bypass text is not accepted as a session token', () => {
  assert.equal(common.verifySessionToken('local-dev-bypass', 'secret'), false);
});

test('push subscriptions are limited to known or explicitly configured services', () => {
  const keys = { p256dh: 'synthetic', auth: 'synthetic' };
  assert.equal(common.validateSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/example', keys }), true);
  assert.equal(common.validateSubscription({ endpoint: 'https://android.googleapis.com/gcm/send/example', keys }), true);
  assert.equal(common.validateSubscription({ endpoint: 'https://internal.example/private', keys }), false);
  process.env.PULSETAP_PUSH_HOSTS = 'push.example.test';
  assert.equal(common.validateSubscription({ endpoint: 'https://push.example.test/send/1', keys }), true);
  delete process.env.PULSETAP_PUSH_HOSTS;
});

test('settings are bounded and half-hour quiet times are retained', () => {
  const value = scheduled._test.normalizeSettings({
    enabled: true,
    timezone: 'Europe/London',
    quietHoursStart: 22.5,
    quietHoursEnd: 7.5,
    maxPerDay: 999,
    minHoursBetween: 0
  });
  assert.deepEqual(value, {
    enabled: true,
    timezone: 'Europe/London',
    quietHoursStart: 22.5,
    quietHoursEnd: 7.5,
    maxPerDay: 12,
    minHoursBetween: 1
  });
});

test('overnight quiet hours include 22:30 and exclude midday', () => {
  const settings = scheduled._test.normalizeSettings({
    enabled: true,
    timezone: 'UTC',
    quietHoursStart: 22.5,
    quietHoursEnd: 7.5
  });
  assert.equal(scheduled._test.isQuietHour(settings, new Date('2026-10-26T22:30:00Z')), true);
  assert.equal(scheduled._test.isQuietHour(settings, new Date('2026-10-26T12:00:00Z')), false);
});

test('scheduled invocation requires the platform next_run payload, not a caller header', async () => {
  assert.equal(scheduled._test.isScheduledInvocation({
    headers: { 'x-netlify-event': 'schedule' },
    body: '{}'
  }), false);
  assert.equal(scheduled._test.isScheduledInvocation({
    headers: {},
    body: JSON.stringify({ next_run: '2026-10-27T12:00:00.000Z' })
  }), true);
  const response = await scheduled.handler({
    headers: { 'x-netlify-event': 'schedule' },
    body: '{}'
  });
  assert.equal(response.statusCode, 401);
});

test('decision parsing and notification text remain bounded', () => {
  const decision = scheduled._test.parseDecisionJson('prefix {"send":true,"body":"Hello","reason":"Grounded"} suffix');
  assert.equal(decision.send, true);
  assert.equal(scheduled._test.stripMarkdown('**Hello** [there](https://example.test)'), 'Hello there');
  assert.ok(scheduled._test.truncateAtWordBoundary('one two three four five', 14).endsWith('…'));
});

test('stored push failures expose only a generic message and status', () => {
  const details = scheduled._test.getPushFailureDetails({
    message: 'private endpoint and reflected request',
    body: 'provider secret detail',
    statusCode: 410
  });
  assert.deepEqual(details, {
    statusCode: 410,
    message: 'PulseTap notification failed - HTTP 410',
    subscriptionExpired: true
  });
});

test('browser guidance never manufactures current chat timestamps', () => {
  const guide = fs.readFileSync(path.join(__dirname, '../pulsetap-index-integration.md'), 'utf8');
  assert.doesNotMatch(guide, /lastPulseTapChatActivityAt\s*\|\|\s*now/);
  assert.doesNotMatch(guide, /message\.createdAt\s*\|\|\s*Date\.now/);
  assert.match(guide, /lastChatActivityAt:\s*lastPulseTapChatActivityAt\s*\|\|\s*null/);
});

test('browser integration supplies a real in-thread PulseTap pill renderer', () => {
  const guide = fs.readFileSync(path.join(__dirname, '../pulsetap-index-integration.md'), 'utf8');
  assert.match(guide, /function addPulseTapMarker\(messageElement, message, options = \{\}\)/);
  assert.match(guide, /badge\.className = 'pulse-tap-badge'/);
  assert.match(guide, /badge\.setAttribute\('aria-label', 'PulseTap message'\)/);
  assert.match(guide, /wave\.appendChild\(document\.createElement\('i'\)\)/);
  assert.match(guide, /messageElement\.insertAdjacentElement\('afterend', badge\)/);
  assert.match(guide, /addPulseTapMarker\(messageElement, message, \{ companionName \}\)/);
  assert.match(guide, /must retain\s+`pulseTapId`/);

  const fencedFunction = name => {
    const start = guide.indexOf(`function ${name}`);
    const end = guide.indexOf('\n```', start);
    assert.notEqual(start, -1, `${name} must be present in the browser integration`);
    assert.notEqual(end, -1, `${name} must remain inside an executable code block`);
    return guide.slice(start, end);
  };
  const createElement = tagName => {
    const classes = new Set();
    const element = {
      tagName,
      children: [],
      attributes: {},
      dataset: {},
      nextElementSibling: null,
      classList: {
        add: value => classes.add(value),
        contains: value => classes.has(value)
      },
      setAttribute(name, value) { this.attributes[name] = value; },
      append(...children) { this.children.push(...children); },
      appendChild(child) { this.children.push(child); return child; },
      insertAdjacentElement(position, child) {
        assert.equal(position, 'afterend');
        this.nextElementSibling = child;
        return child;
      }
    };
    Object.defineProperty(element, 'className', {
      get: () => [...classes].join(' '),
      set: value => String(value).split(/\s+/).filter(Boolean).forEach(item => classes.add(item))
    });
    return element;
  };
  const sandbox = { document: { createElement } };
  vm.runInNewContext(
    `${fencedFunction('isPulseTapThreadMessage')}\n${fencedFunction('addPulseTapMarker')}\nthis.addPulseTapMarker = addPulseTapMarker;`,
    sandbox
  );

  const bubble = createElement('article');
  const message = { role: 'assistant', content: 'A saved thought.', pulseTapId: 'tap-1' };
  const badge = sandbox.addPulseTapMarker(bubble, message, { companionName: 'Companion' });
  assert.equal(bubble.classList.contains('pulse-tap-message'), true);
  assert.equal(bubble.dataset.pulseTapId, 'tap-1');
  assert.equal(badge.attributes['aria-label'], 'PulseTap message');
  assert.equal(badge.children[0].children.length, 5);
  assert.equal(badge.children[1].textContent, 'PulseTap');
  assert.equal(sandbox.addPulseTapMarker(bubble, message), badge, 'the marker must not duplicate');

  const legacyBubble = createElement('article');
  const legacy = sandbox.addPulseTapMarker(legacyBubble, {
    role: 'assistant',
    content: 'PulseTap from Companion: An older saved thought.'
  });
  assert.equal(legacy?.classList.contains('pulse-tap-badge'), true);
  assert.equal(sandbox.addPulseTapMarker(createElement('article'), {
    role: 'assistant',
    content: 'An ordinary assistant message.'
  }), null);
});
