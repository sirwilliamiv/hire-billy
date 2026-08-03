const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('overlay', {
  rects: r => ipcRenderer.send('rects', r),
  quit: () => ipcRenderer.send('quit'),
  ask: q => ipcRenderer.invoke('ask', q),
});
