const { contextBridge, ipcRenderer } = require('electron');

const windowChannels = Object.freeze({
  minimize: 'window:minimize',
  toggleMaximize: 'window:toggle-maximize',
  close: 'window:close',
  getState: 'window:get-state',
  stateChanged: 'window:state-changed',
});

const desktopWindow = Object.freeze({
  platform: process.platform,
  minimize: () => ipcRenderer.invoke(windowChannels.minimize),
  toggleMaximize: () => ipcRenderer.invoke(windowChannels.toggleMaximize),
  close: () => ipcRenderer.invoke(windowChannels.close),
  getState: () => ipcRenderer.invoke(windowChannels.getState),
  onStateChanged(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on(windowChannels.stateChanged, listener);
    return () => ipcRenderer.removeListener(windowChannels.stateChanged, listener);
  },
});

contextBridge.exposeInMainWorld('echoLangDesktop', desktopWindow);
