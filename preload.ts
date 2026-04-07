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
  printers: {
    /** Sistemdeki yazıcı listesini getir */
    list: () => ipcRenderer.invoke('printers:list') as Promise<{ name: string; isDefault: boolean }[]>,
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
  updater: {
    /** Güncelleme kontrol et */
    check: () => ipcRenderer.invoke('updater:check') as Promise<{ available: boolean; version?: string }>,
    /** Güncellemeyi indir */
    download: () => ipcRenderer.invoke('updater:download') as Promise<{ success: boolean; error?: string }>,
    /** Güncellemeyi kur ve yeniden başlat */
    install: () => ipcRenderer.invoke('updater:install'),
    /** Güncelleme mevcut bildirimi */
    onUpdateAvailable: (callback: (data: { version: string }) => void) => {
      ipcRenderer.on('updater:update-available', (_event: any, data: any) => callback(data));
    },
    /** İndirme ilerlemesi */
    onDownloadProgress: (callback: (data: { percent: number }) => void) => {
      ipcRenderer.on('updater:download-progress', (_event: any, data: any) => callback(data));
    },
    /** İndirme tamamlandı */
    onUpdateDownloaded: (callback: () => void) => {
      ipcRenderer.on('updater:update-downloaded', () => callback());
    },
  },
});
