import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'path';
import { registerPosIpcHandlers, cleanupBridge, startBridgeProcess } from './posIpc';

// GPU sorunlarını önle (RDP / VM ortamları için)
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

// __dirname is available globally in CJS (esbuild output)
let mainWindow: BrowserWindow | null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Adrenalin',
    icon: path.join(__dirname, '..', 'public', 'icon.ico'),
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: '#09090b',
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = process.env.VITE_DEV_SERVER_URL;
  
  if (isDev) {
    mainWindow.loadURL(isDev);
    mainWindow.webContents.openDevTools();
  } else {
    // Production: dist/index.html (vite build output is in same dist folder)
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.on('ready', () => {
  // POS entegrasyon IPC handler'larını kaydet
  registerPosIpcHandlers();

  // Window control IPC handlers
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

  createWindow();

  // pos_bridge.py otomatik başlat
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const bridgePath = isDev
    ? path.join(__dirname, '..', 'pos_bridge.py')
    : path.join(process.resourcesPath, 'pos_bridge.py');
  console.log('[BRIDGE] Path:', bridgePath);
  startBridgeProcess('python', bridgePath).then(ready => {
    console.log(ready ? '[BRIDGE] Otomatik başlatıldı ✓' : '[BRIDGE] Başlatılamadı');
  });
});

app.on('window-all-closed', () => {
  // Bridge process'i temizle
  cleanupBridge();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

const menu = Menu.buildFromTemplate([
  {
    label: 'File',
    submenu: [
      {
        label: 'Exit',
        accelerator: 'CmdOrCtrl+Q',
        click: () => app.quit(),
      },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
      { label: 'Redo', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
      { type: 'separator' },
      { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
      { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
      { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
    ],
  },
]);

Menu.setApplicationMenu(menu);
