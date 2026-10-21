const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveStore: s => ipcRenderer.invoke('store:save', s),
  assets: () => ipcRenderer.invoke('assets'),
  qr: text => ipcRenderer.invoke('qr', text),
  exportReceipt: opts => ipcRenderer.invoke('export', opts),
  show: file => ipcRenderer.invoke('show', file),
  copy: text => ipcRenderer.invoke('clipboard', text),
  open: url => ipcRenderer.invoke('open', url),
  version: () => ipcRenderer.invoke('version'),
  onUpdate: cb => ipcRenderer.on('update', (_e, msg) => cb(msg)),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  mp: {
    hasKey: () => ipcRenderer.invoke('mp:hasKey'),
    setKey: key => ipcRenderer.invoke('mp:setKey', key),
    create: opts => ipcRenderer.invoke('mp:create', opts),
    status: id => ipcRenderer.invoke('mp:status', id),
  },
});
