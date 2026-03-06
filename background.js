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

let isOpening = false;

async function openSigningPage() {
  if (isOpening) return;
  isOpening = true;

  try {
    const assetId = await getAssetId();
    // Lokaal (zonder enterprise policies) mag hij null zijn, dan gebruiken we fallback ID op Dev machine
    const safeAssetId = assetId || 'fallback-scherm';

    const managedUrl = await getManagedUrl();
    let targetUrl;

    if (managedUrl) {
      targetUrl = managedUrl.replace('{assetId}', safeAssetId);
    } else if (safeAssetId === 'fallback-scherm') {
      targetUrl = 'http://mrgreenoffices.nl';
    } else {
      targetUrl = `https://signing.net-os.com/devices/nxd-${safeAssetId}-m/screen`;
    }

    // Kijk of the target URL al bestaat in een tab (om loops en spams te voorkomen)
    const tabs = await chrome.tabs.query({});
    const isTargetOpen = tabs.some(tab => tab.url && tab.url.startsWith(targetUrl));

    if (isTargetOpen) {
      return; // We zijn er al
    }

    // In Kiosk modus kan er al een default "webpage" (companion app/PWA) sneller geladen zijn 
    // dan de extensie-startup. In plaats van een nieuw fullscreen venster te forceren (wat kan botsen 
    // of op de achtergrond kan blijven), updaten we simpelweg de actieve tab.
    if (tabs.length > 0) {
      let tabToUpdate = tabs.find(t => t.active) || tabs[0];
      chrome.tabs.update(tabToUpdate.id, { url: targetUrl });
    } else {
      // Fallback voor als er wel echt nog geen windows/tabs zijn
      chrome.windows.create({
        url: targetUrl,
        state: 'fullscreen'
      });
    }

  } catch (error) {
    console.error("Error launching signing page:", error);
  } finally {
    // Release the lock slightly delayed to prevent double-firing from rapid events
    setTimeout(() => { isOpening = false; }, 1000);
  }
}

// 1. Trigger via standaard boot hooks
chrome.runtime.onStartup.addListener(openSigningPage);
chrome.runtime.onInstalled.addListener(openSigningPage);

// 2. Extra trigger voor Kiosk "Companion" modus waar een PWA eerst laadt
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  // Als een pagina volledig is geladen, maar het is NIET onze signing page, vuur de override
  if (changeInfo.status === 'complete' && tab.url && !tab.url.includes('signing.net-os.com') && !tab.url.includes('mrgreenoffices.nl')) {
    openSigningPage();
  }
});
