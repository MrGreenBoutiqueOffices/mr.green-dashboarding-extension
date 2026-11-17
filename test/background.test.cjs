const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'background.js'), 'utf8');
const landing = 'https://signing.example.test/';
const screen = landing + 'screens/test-screen';

function kiosk(landingsBeforeSuccess) {
  const timers = [];
  const navigations = [];
  const events = {};
  const tab = { id: 1, url: landing, active: true };
  const event = name => ({ addListener: callback => { events[name] = callback; } });
  let now = 0;
  runInNewContext(source, {
    chrome: {
      enterprise: { deviceAttributes: { getDeviceAssetId: callback => callback('test-screen') } },
      runtime: { onStartup: event('startup'), onInstalled: event('installed') },
      storage: {
        managed: { get: (_keys, callback) => callback({ url: landing + 'screens/{assetId}' }) },
        session: { get: async () => ({}), set: async () => {} },
        onChanged: event('storageChanged'),
      },
      tabs: {
        query: async () => [tab],
        update: async (_id, { url }) => {
          navigations.push(url);
          tab.url = navigations.length <= landingsBeforeSuccess ? landing : url;
        },
        onUpdated: event('tabUpdated'),
      },
    },
    Date: { now: () => now },
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
  });

  async function drain() {
    await new Promise(resolve => setImmediate(resolve));
  }

  return {
    tab,
    navigations,
    startup: () => events.startup(),
    complete: async () => {
      await events.tabUpdated(tab.id, { status: 'complete' }, tab);
      await drain();
    },
    tick: async () => {
      const timer = timers.shift();
      if (timer) {
        now += timer.delay;
        timer.callback();
        await drain();
      }
    },
    elapse: ms => { now += ms; },
  };
}

test('retries the exact Asset ID URL when the landing page completes during startup', async () => {
  const device = kiosk(1);
  await device.startup();
  assert.equal(device.tab.url, landing);
  await device.complete();
  await device.tick();

  assert.equal(device.tab.url, screen);
  assert.deepEqual(device.navigations, [screen, screen]);
});

test('bounds repeated recovery attempts and allows a later reload to recover', async () => {
  const device = kiosk(3);
  await device.startup();
  for (let i = 0; i < 5; i++) {
    await device.complete();
    await device.tick();
  }
  assert.deepEqual(device.navigations, [screen, screen, screen]);
  assert.equal(device.tab.url, landing);

  device.elapse(30_000);
  await device.complete();
  assert.equal(device.tab.url, screen);
});
