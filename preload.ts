import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    on: (channel: string, func: (...args: any[]) => void) => {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    },
    once: (channel: string, func: (...args: any[]) => void) => {
      ipcRenderer.once(channel, (event, ...args) => func(...args));
    },
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  },
  // POS entegrasyon API'leri
  pos: {
    /** POS Server'a TransactionData gönder */
    send: (args: { host: string; port: number; data: object; timeout?: number }) =>
      ipcRenderer.invoke('pos:send', args),
  },
  bridge: {
    /** pos_bridge.py process'ini başlat */
    start: (args?: { pythonPath?: string; env?: Record<string, string> }) =>
      ipcRenderer.invoke('bridge:start', args || {}),
    /** pos_bridge.py process'ini durdur */
    stop: () => ipcRenderer.invoke('bridge:stop'),
    /** Bridge process durumu */
    status: () => ipcRenderer.invoke('bridge:status'),
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onBridgeStatus: (callback: (data: { status: string }) => void) => {
      ipcRenderer.on('bridge:status-update', (_event: any, data: any) => callback(data));
    },
  },
});
