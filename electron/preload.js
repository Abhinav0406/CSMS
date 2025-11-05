// Secure, empty preload for now. You can expose safe APIs here later.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('csms', {
  // placeholder for future APIs
});




