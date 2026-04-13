import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { registerPosIpcHandlers, cleanupBridge, startBridgeExe } from './posIpc';
import { autoUpdater } from 'electron-updater';

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

  // Yazıcı listesi
  ipcMain.handle('printers:list', async () => {
    if (!mainWindow) return [];
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map(p => ({ name: p.name, isDefault: p.isDefault }));
  });

  createWindow();

  // pos_bridge EXE otomatik başlat
  const isDevEnv = !!process.env.VITE_DEV_SERVER_URL;
  const bridgePath = isDevEnv
    ? path.join(__dirname, '..', 'pos_bridge.py')
    : path.join(process.resourcesPath, 'pos_bridge.exe');
  const bridgeCmd = isDevEnv ? 'python' : bridgePath;
  const bridgeArgs = isDevEnv ? [path.join(__dirname, '..', 'pos_bridge.py')] : [];
  console.log('[BRIDGE] Path:', bridgePath);

  // Renderer'a durum bildir
  mainWindow?.webContents.send('bridge:status-update', { status: 'connecting' });
  startBridgeExe(bridgeCmd, bridgeArgs).then(ready => {
    console.log(ready ? '[BRIDGE] Otomatik başlatıldı ✓' : '[BRIDGE] Başlatılamadı');
    mainWindow?.webContents.send('bridge:status-update', { status: ready ? 'connected' : 'failed' });
  });

  // ── Otomatik Güncelleme ─────────────────────────────────
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('[UPDATER] Güncelleme mevcut:', info.version);
    mainWindow?.webContents.send('updater:update-available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:download-progress', { percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', () => {
    console.log('[UPDATER] Güncelleme indirildi, yeniden başlatılacak');
    mainWindow?.webContents.send('updater:update-downloaded');
  });

  autoUpdater.on('error', (err) => {
    console.error('[UPDATER] Hata:', err.message);
  });

  // IPC: Renderer'dan güncelleme kontrol/indir/kur
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { available: !!result?.updateInfo, version: result?.updateInfo?.version };
    } catch { return { available: false }; }
  });

  ipcMain.handle('updater:download', async () => {
    try { await autoUpdater.downloadUpdate(); return { success: true }; }
    catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall();
  });

  // ── Rapor PDF Kaydetme ───────────────────────────────
  ipcMain.handle('report:save-pdf', async (_event, { html, defaultFileName }: { html: string; defaultFileName: string }) => {
    try {
      const desktopPath = app.getPath('desktop');
      const filePath = path.join(desktopPath, defaultFileName);
      
      // Gizli pencere oluştur ve HTML'i yükle
      const pdfWin = new BrowserWindow({ show: false, width: 850, height: 1100, webPreferences: { contextIsolation: true } });
      await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      
      // PDF oluştur
      const pdfBuffer = await pdfWin.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      });
      pdfWin.close();
      
      // Masaüstüne kaydet
      fs.writeFileSync(filePath, pdfBuffer);
      return { success: true, filePath };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // 5 saniye sonra güncelleme kontrol et
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);

  // Her 30 dakikada bir güncelleme kontrol et
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 30 * 60 * 1000);
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
