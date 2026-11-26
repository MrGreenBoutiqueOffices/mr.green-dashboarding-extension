const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../background.js'), 'utf8');
const template = 'https://signing.the-green.nl/screen?kiosk=1#asset={assetId}';
const asset = 'sk_sign_' + 'A'.repeat(43);

function event() {
  const listeners = [];
  return { addListener(fn) { listeners.push(fn); }, async emit(...args) {
    await Promise.all(listeners.map(fn => fn(...args)));
  } };
}

function kiosk(options = {}) {
  const state = {
    asset: '', managedUrl: template, tabs: [{ id: 1, active: true, url: 'https://signing.the-green.nl/screen' }],
    alarms: new Map(), navigations: [], session: {}, assetError: false, assetCalls: 0,
    ...options,
  };
  const chrome = {
    runtime: { onStartup: event(), onInstalled: event(), getURL: p => 'chrome-extension://test/' + p },
    enterprise: { deviceAttributes: { getDeviceAssetId(cb) {
      state.assetCalls++;
      if (state.hangAsset) return;
      if (state.assetError) chrome.runtime.lastError = { message: 'Not ready' };
      cb(state.asset);
      delete chrome.runtime.lastError;
    } } },
    storage: {
      managed: { get(keys, cb) { cb({ url: state.managedUrl }); } },
      session: { async get() { return state.session; }, async set(v) { Object.assign(state.session, v); }, async remove(k) { delete state.session[k]; } },
      onChanged: event(),
    },
    alarms: {
      async create(name, info) { state.alarms.set(name, info); },
      async clear(name) { return state.alarms.delete(name); },
      onAlarm: event(),
    },
    tabs: {
      async query() { return state.tabs.map(t => ({ ...t })); },
      async update(id, { url }) {
        state.navigations.push(url);
        state.tabs.find(t => t.id === id).url = url;
      },
      onUpdated: event(),
    },
    windows: { async create({ url }) {
      const tab = { id: 1, active: true, url };
      state.tabs.push(tab);
      state.navigations.push(url);
      return { tabs: [tab] };
    } },
  };
  const timers = new Map();
  let timerId = 0;
  const context = vm.createContext({ chrome, console,
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(source, context);
  return { state, chrome,
    start: () => chrome.runtime.onStartup.emit(),
    expireTimeouts() {
      for (const [id, fn] of timers) { timers.delete(id); fn(); }
    },
    async retry() {
      assert.equal(state.alarms.size, 1, 'missing Asset ID must schedule recovery');
      const [name] = state.alarms.keys();
      state.alarms.delete(name);
      await chrome.alarms.onAlarm.emit({ name });
    },
  };
}

test('empty Asset ID waits and recovers on an alarm without another tab load', async () => {
  const k = kiosk();
  await k.start();
  assert.deepEqual(k.state.navigations, ['chrome-extension://test/loading.html']);
  k.state.asset = asset;
  await k.retry();
  assert.equal(k.state.tabs[0].url, template.replace('{assetId}', asset));
  assert.equal(k.state.alarms.size, 0);
});

test('repeated empty reads keep the loading screen and another retry', async () => {
  const k = kiosk({ tabs: [] });
  await k.start();
  await k.retry();
  await k.retry();
  assert.equal(k.state.tabs.length, 1);
  assert.deepEqual(k.state.navigations, ['chrome-extension://test/loading.html']);
  assert.equal(k.state.alarms.size, 1);
});

test('a cached fallback from an older version cannot override a ready Asset ID', async () => {
  const k = kiosk({ asset, session: { targetUrl: template.replace('{assetId}', 'fallback-scherm') } });
  await k.start();
  assert.equal(k.state.tabs[0].url, template.replace('{assetId}', asset));
});

test('a changed Asset ID is read again on the next launch event', async () => {
  const k = kiosk({ asset });
  await k.start();
  k.state.asset = 'different-device-asset';
  await k.start();
  assert.equal(k.state.tabs[0].url, template.replace('{assetId}', k.state.asset));
});

test('static managed URLs work immediately without a device attribute lookup', async () => {
  const k = kiosk({ managedUrl: 'https://mrgreenoffices.nl' });
  await k.start();
  assert.equal(k.state.tabs[0].url, 'https://mrgreenoffices.nl');
  assert.equal(k.state.assetCalls, 0);
  assert.equal(k.state.alarms.size, 0);
});

test('an attribute API error cannot navigate using its invalid result', async () => {
  const k = kiosk({ asset, assetError: true });
  await k.start();
  assert.equal(k.state.tabs[0].url, 'chrome-extension://test/loading.html');
  k.state.assetError = false;
  await k.retry();
  assert.equal(k.state.tabs[0].url, template.replace('{assetId}', asset));
});

test('the legacy target still works once its Asset ID is available', async () => {
  const k = kiosk({ managedUrl: undefined, asset: 'legacy-office' });
  await k.start();
  assert.equal(k.state.tabs[0].url, 'https://signing.net-os.com/devices/nxd-legacy-office-m/screen');
});

test('managed policy changes immediately retry the target selection', async () => {
  const k = kiosk({ asset });
  await k.start();
  k.state.managedUrl = 'https://example.com/screen/{assetId}';
  await k.chrome.storage.onChanged.emit({ url: { newValue: k.state.managedUrl } }, 'managed');
  assert.equal(k.state.tabs[0].url, k.state.managedUrl.replace('{assetId}', asset));
});

test('a missing attribute callback times out and can recover on the next alarm', async () => {
  const k = kiosk({ hangAsset: true });
  const started = k.start();
  await new Promise(setImmediate);
  k.expireTimeouts();
  await started;
  assert.equal(k.state.tabs[0].url, 'chrome-extension://test/loading.html');
  k.state.hangAsset = false;
  k.state.asset = asset;
  await k.retry();
  assert.equal(k.state.tabs[0].url, template.replace('{assetId}', asset));
});

test('the alarm can recover after a fresh service worker starts', async () => {
  const before = kiosk();
  await before.start();
  const after = kiosk({ asset, alarms: before.state.alarms, tabs: before.state.tabs });
  await after.retry();
  assert.equal(after.state.tabs[0].url, template.replace('{assetId}', asset));
  assert.equal(after.state.alarms.size, 0);
});

test('overlapping startup events and a completed target load do not reload the screen', async () => {
  const k = kiosk({ asset });
  await Promise.all([k.start(), k.chrome.runtime.onInstalled.emit()]);
  await k.chrome.tabs.onUpdated.emit(1, { status: 'complete' }, k.state.tabs[0]);
  assert.deepEqual(k.state.navigations, [template.replace('{assetId}', asset)]);
});
