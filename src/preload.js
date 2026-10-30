const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assist', {
  onState: (cb) => ipcRenderer.on('state', (_e, state) => cb(state)),
  getState: () => ipcRenderer.invoke('get-state'),
  importRunes: (alias) => ipcRenderer.invoke('import-runes', alias),
  setSpells: (alias) => ipcRenderer.invoke('set-spells', alias),
  exportItemSet: (alias) => ipcRenderer.invoke('export-item-set', alias),
  openDataFile: () => ipcRenderer.invoke('open-data-file'),
  reloadData: () => ipcRenderer.invoke('reload-data'),
  toggleStats: () => ipcRenderer.invoke('toggle-stats'),
  statsDiagnostics: () => ipcRenderer.invoke('stats-diagnostics'),
});
