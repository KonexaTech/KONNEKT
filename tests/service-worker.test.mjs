import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function worker() {
  const events = {}, opened = [];
  const scope = 'https://example.test/KONNEKT/';
  const self = { location: { href: `${scope}sw.js`, origin: 'https://example.test' }, registration: { scope },
    addEventListener: (name, handler) => { events[name] = handler; },
    clients: { matchAll: async () => [], openWindow: async target => opened.push(target) } };
  vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), { self, URL, Response });
  return { events, opened, scope };
}

for (const target of ['https://attacker.test/phishing', 'javascript:alert(1)', '/other-app/']) test(`push link stays in app scope: ${target}`, async () => {
  const { events, opened, scope } = worker();
  let pending;
  events.notificationclick({ notification: { close() {}, data: { url: target } }, waitUntil: value => { pending = value; } });
  await pending;
  assert.deepEqual(opened, [scope]);
});

test('valid in-app push link is retained', async () => {
  const { events, opened, scope } = worker();
  let pending;
  events.notificationclick({ notification: { close() {}, data: { url: `${scope}?notification=1` } }, waitUntil: value => { pending = value; } });
  await pending;
  assert.deepEqual(opened, [`${scope}?notification=1`]);
});

test('worker leaves backend requests and mutations to the network', () => {
  const { events } = worker();
  for (const [method, url] of [['POST', 'https://example.test/KONNEKT/'], ['GET', 'https://backend.test/rest/v1/messages'], ['GET', 'https://example.test/other/']]) {
    events.fetch({ request: { method, url }, respondWith() { assert.fail('Worker must not intercept this request'); } });
  }
});
