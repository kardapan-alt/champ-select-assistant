const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assist', {
  onState: (cb) => ipcRenderer.on('state', (_e, state) => cb(state)),
  getState: () => ipcRenderer.invoke('get-state'),
  onUpdate: (cb) => ipcRenderer.on('update', (_e, update) => cb(update)),
  getUpdate: () => ipcRenderer.invoke('get-update'),
  updateAction: () => ipcRenderer.invoke('update-action'),
  appVersion: () => ipcRenderer.invoke('app-version'),
  importRunes: (alias) => ipcRenderer.invoke('import-runes', alias),
  setSpells: (alias) => ipcRenderer.invoke('set-spells', alias),
  exportItemSet: (alias) => ipcRenderer.invoke('export-item-set', alias),
  cleanItemSets: (group) => ipcRenderer.invoke('clean-item-sets', group),
  openDataFile: () => ipcRenderer.invoke('open-data-file'),
  reloadData: () => ipcRenderer.invoke('reload-data'),
  toggleStats: () => ipcRenderer.invoke('toggle-stats'),
  toggleAutoRunes: () => ipcRenderer.invoke('toggle-auto-runes'),
  toggleAutoItemSet: () => ipcRenderer.invoke('toggle-auto-item-set'),
  statsDiagnostics: () => ipcRenderer.invoke('stats-diagnostics'),
});
