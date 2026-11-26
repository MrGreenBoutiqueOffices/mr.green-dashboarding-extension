// Mr.Green Signing Extension
// Een onvolledige apparaatidentiteit mag nooit naar een ander scherm leiden.
const RETRY_ALARM = 'retry-signing-start';
const RETRY_DELAY_MINUTES = 0.5;
const ATTRIBUTE_TIMEOUT_MS = 5000;

function getAssetId() {
  return new Promise(function (resolve) {
    const timeout = setTimeout(() => resolve(null), ATTRIBUTE_TIMEOUT_MS);
    try {
      if (!chrome.enterprise?.deviceAttributes?.getDeviceAssetId) {
        clearTimeout(timeout);
        resolve(null);
        return;
      }
      chrome.enterprise.deviceAttributes.getDeviceAssetId(function (assetId) {
        clearTimeout(timeout);
        const failed = !!chrome.runtime.lastError;
        resolve(!failed && typeof assetId === 'string' ? assetId.trim() || null : null);
      });
    } catch {
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

function getManagedUrl() {
  return new Promise(function (resolve) {
    try {
      chrome.storage.managed.get(['url'], function (items) {
        const failed = !!chrome.runtime.lastError;
        resolve(!failed && typeof items?.url === 'string' ? items.url.trim() || null : null);
      });
    } catch {
      resolve(null);
    }
  });
}

async function getTargetUrl() {
  const managedUrl = await getManagedUrl();
  // Vaste URL's (zoals werkplekschermen) hebben geen Asset ID nodig.
  if (managedUrl && !managedUrl.includes('{assetId}')) return managedUrl;

  const assetId = await getAssetId();
  if (!assetId) return null;

  // Geen sessiecache: ook een aanvankelijk leeg of later gewijzigd Asset ID
  // moet bij de volgende poging opnieuw uit Google worden gelezen.
  return managedUrl
    ? managedUrl.replaceAll('{assetId}', assetId)
    : 'https://signing.net-os.com/devices/nxd-' + assetId + '-m/screen';
}

let isOpening = false;

async function openSigningPage() {
  if (isOpening) return;
  isOpening = true;

  try {
    const targetUrl = await getTargetUrl();
    if (targetUrl) {
      await chrome.alarms.clear(RETRY_ALARM);
    } else {
      // Een alarm kan de MV3-worker opnieuw activeren; een losse timer niet.
      await chrome.alarms.create(RETRY_ALARM, { delayInMinutes: RETRY_DELAY_MINUTES });
    }

    const url = targetUrl || chrome.runtime.getURL('loading.html');
    const tabs = await chrome.tabs.query({});
    if (tabs.some(tab => tab.url && tab.url.startsWith(url))) return;

    if (tabs.length === 0) {
      await chrome.windows.create({ url, state: 'fullscreen' });
    } else {
      const tab = tabs.find(t => t.active) || tabs[0];
      await chrome.tabs.update(tab.id, { url });
    }
  } catch {
    // Log nooit de doel-URL: die kan een schermtoken bevatten.
    console.error('Signing start failed; retrying.');
    await chrome.alarms.create(RETRY_ALARM, { delayInMinutes: RETRY_DELAY_MINUTES });
  } finally {
    isOpening = false;
  }
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'managed' && changes.url) return openSigningPage();
});

chrome.runtime.onStartup.addListener(openSigningPage);
chrome.runtime.onInstalled.addListener(openSigningPage);
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === RETRY_ALARM) return openSigningPage();
});

// Companion-modus: de PWA kan eerder laden dan de extensie.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  if (tab.url.startsWith('chrome-extension://') || tab.url.startsWith('chrome://')) return;
  return openSigningPage();
});
