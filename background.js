// Mr.Green Signing Extension
// Haalt het Asset ID op en opent fullscreen de juiste signing page.

function getAssetId() {
  return new Promise(function (resolve) {
    try {
      if (chrome.enterprise && chrome.enterprise.deviceAttributes && chrome.enterprise.deviceAttributes.getDeviceAssetId) {
        chrome.enterprise.deviceAttributes.getDeviceAssetId(function (assetId) {
          resolve(assetId || null);
        });
      } else {
        resolve(null);
      }
    } catch (e) {
      resolve(null);
    }
  });
}

function getManagedUrl() {
  return new Promise(function (resolve) {
    try {
      if (!chrome.storage || !chrome.storage.managed) {
        resolve(null);
        return;
      }
      chrome.storage.managed.get(['url'], function (items) {
        if (chrome.runtime.lastError || !items || !items.url) {
          resolve(null);
        } else {
          resolve(items.url);
        }
      });
    } catch (e) {
      resolve(null);
    }
  });
}

async function computeTargetUrl() {
  const assetId = await getAssetId();
  const safeAssetId = assetId || 'fallback-scherm';

  const managedUrl = await getManagedUrl();

  if (managedUrl) {
    return managedUrl.replace('{assetId}', safeAssetId);
  } else if (safeAssetId === 'fallback-scherm') {
    return 'http://mrgreenoffices.nl';
  } else {
    return `https://signing.net-os.com/devices/nxd-${safeAssetId}-m/screen`;
  }
}

async function getTargetUrl() {
  const session = await chrome.storage.session.get('targetUrl');
  if (session.targetUrl) return session.targetUrl;

  const targetUrl = await computeTargetUrl();
  await chrome.storage.session.set({ targetUrl });
  return targetUrl;
}

const navigationQuietPeriodMs = 1_000;
const navigationRetryCooldownMs = 30_000;
const maxNavigationAttempts = 3;
let isOpening = false;
let recheckAfterOpening = false;
let navigationAttempts = 0;
let lastNavigationAt = 0;

async function openSigningPage() {
  if (isOpening) {
    recheckAfterOpening = true;
    return;
  }
  if (Date.now() - lastNavigationAt >= navigationRetryCooldownMs) {
    navigationAttempts = 0;
  }
  if (navigationAttempts >= maxNavigationAttempts) return;
  isOpening = true;

  try {
    const tabs = await chrome.tabs.query({});
    let tabToUpdate;

    // Geen tabs: toon laadscherm alvast terwijl de target URL berekend wordt
    if (tabs.length === 0) {
      const loadingUrl = chrome.runtime.getURL('loading.html');
      const win = await chrome.windows.create({ url: loadingUrl, state: 'fullscreen' });
      tabToUpdate = win.tabs[0];
    } else {
      tabToUpdate = tabs.find(t => t.active) || tabs[0];
    }

    const targetUrl = await getTargetUrl();
    if (tabToUpdate.url?.startsWith(targetUrl)) return;

    navigationAttempts++;
    lastNavigationAt = Date.now();
    await chrome.tabs.update(tabToUpdate.id, { url: targetUrl });
  } catch {
    console.error("Error launching signing page");
  } finally {
    setTimeout(() => {
      isOpening = false;
      // A completion event can arrive while the previous navigation is still settling.
      if (recheckAfterOpening) {
        recheckAfterOpening = false;
        void openSigningPage();
      }
    }, navigationQuietPeriodMs);
  }
}

// Invalideer de cache als de managed URL verandert
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'managed' && changes.url) {
    chrome.storage.session.remove('targetUrl');
  }
});

// 1. Trigger via standaard boot hooks
chrome.runtime.onStartup.addListener(openSigningPage);
chrome.runtime.onInstalled.addListener(openSigningPage);

// 2. Extra trigger voor Kiosk "Companion" modus waar een PWA eerst laadt
chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  if (tab.url.startsWith('chrome-extension://') || tab.url.startsWith('chrome://')) return;

  const targetUrl = await getTargetUrl();
  if (tab.url.startsWith(targetUrl)) {
    if (tab.active) navigationAttempts = 0;
    return;
  }

  if (tab.active) await openSigningPage();
});
