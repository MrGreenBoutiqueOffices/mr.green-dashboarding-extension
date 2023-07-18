function openTabs() {
  // Default URLs
  const defaultUrl1 = 'http://mrgreenoffices.nl';
  const defaultUrl2 = 'http://google.com';
  const defaultFullscreen1 = 'false'
  const defaultFullscreen2 = 'false'

  // Retrieve the URLs from the configuration
  chrome.storage.managed.get(['url1', 'fullscreen1', 'url2', 'fullscreen2'], function(items) {
    // Use the URLs and fullscreen settings from the configuration, or the default values if they are not provided
    const url1 = items.url1 || defaultUrl1;
    const fullscreen1 = items.fullscreen1 || defaultFullscreen1;
    const url2 = items.url2 || defaultUrl2;
    const fullscreen2 = items.fullscreen2 || defaultFullscreen2;

    // Query the information about all connected displays
    new Promise((resolve, reject) => {
      chrome.system.display.getInfo((displays) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(displays);
        }
      });
    }).then((displays) => {
      console.log('Number of displays:', displays.length);
      console.log('Display details:', displays);
      if (displays && displays.length >= 2) {
        // Create a new window for the first display
        chrome.windows.create({url: url1, left: displays[0].bounds.left, top: displays[0].bounds.top}, function(window1) {
          // Change the state of the window to fullscreen
          if (fullscreen1 = true) {
          chrome.windows.update(window1.id, {state: 'fullscreen'});
          }
        });

        // Create a new window for the second display
        chrome.windows.create({url: url2, left: displays[1].bounds.left, top: displays[1].bounds.top}, function(window2) {
          // Change the state of the window to fullscreen
          if (fullscreen2 = true) {
          chrome.windows.update(window2.id, {state: 'fullscreen'});
          }
        });
      } else {
        console.log('Not enough displays connected');
      }
    }).catch((error) => {
      console.error('Error getting display info:', error);
    });
  }); 
}

// Open the tabs when Chrome starts up
chrome.runtime.onStartup.addListener(openTabs);

// Also open the tabs as soon as the extension is installed
chrome.runtime.onInstalled.addListener(openTabs);
