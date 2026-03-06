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

let isOpening = false;

async function openSigningPage() {
  if (isOpening) return;
  isOpening = true;

  try {
    const targetUrl = await getTargetUrl();

    const tabs = await chrome.tabs.query({});
    const isTargetOpen = tabs.some(tab => tab.url && tab.url.startsWith(targetUrl));

    if (isTargetOpen) return;

    if (tabs.length > 0) {
      const tabToUpdate = tabs.find(t => t.active) || tabs[0];
      chrome.tabs.update(tabToUpdate.id, { url: targetUrl });
    } else {
      chrome.windows.create({ url: targetUrl, state: 'fullscreen' });
    }

  } catch (error) {
    console.error("Error launching signing page:", error);
  } finally {
    setTimeout(() => { isOpening = false; }, 1000);
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

  const targetUrl = await getTargetUrl();
  if (tab.url.startsWith(targetUrl)) return;

  openSigningPage();
});
