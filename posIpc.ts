/* ──────────────────────────────────────────────────────────
   POS Server TCP Client — Electron IPC üzerinden
   
   Bu modül, renderer'dan çağrılan IPC handler'ları sağlar:
   - pos:send    → POS Server'a TransactionData gönder, yanıt al
   - bridge:start → pos_bridge.py process'ini başlat
   - bridge:stop  → pos_bridge.py process'ini durdur
   - bridge:status → Bridge durumu
   ────────────────────────────────────────────────────────── */

import { ipcMain } from 'electron';
import net from 'net';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';

export { startBridgeProcess, startBridgeExe };

let bridgeProcess: ChildProcess | null = null;
let bridgeReady = false;

// ── POS Server TCP Client ─────────────────────────────────

function sendToPosServer(
  host: string,
  port: number,
  transactionData: object,
  timeoutMs: number = 60_000
): Promise<object> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let resolved = false;
    let chunks: Buffer[] = [];

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.error('[POS TCP] TIMEOUT!');
        socket.destroy();
        reject(new Error('POS Server yanıt zaman aşımı'));
      }
    }, timeoutMs);

    // TCP_NODELAY — Nagle algoritmasını devre dışı bırak, anında gönder
    socket.setNoDelay(true);
    // Keep-alive — bağlantı canlı kalsın
    socket.setKeepAlive(true, 1000);

    // Bağlantı timeout'u — 3 saniye içinde bağlanamazsa hata
    const connectTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        reject(new Error('POS Server bağlantı zaman aşımı (3s)'));
      }
    }, 3000);

    socket.connect(port, host, () => {
      clearTimeout(connectTimer);
      // Düz JSON gönder — delimiter YOK
      const json = JSON.stringify(transactionData);
      console.log('[POS TCP] Gönderiliyor →', host + ':' + port);
      socket.write(Buffer.from(json, 'utf-8'));
    });

    socket.on('data', (chunk: Buffer) => {
      if (resolved) return;
      chunks.push(chunk);
      
      // JSON tamamlanmış mı kontrol et — süslü parantez dengesi
      const combined = Buffer.concat(chunks).toString('utf-8').trim();
      if (!combined.startsWith('{')) return;
      
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = 0; i < combined.length; i++) {
        const c = combined[i];
        if (escape) { escape = false; continue; }
        if (c === '\\') { escape = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === '{') depth++;
        else if (c === '}') depth--;
        if (depth === 0 && i > 0) {
          // Tam JSON alındı
          console.log('[POS TCP] Yanıt geldi:', combined.substring(0, 500));
          clearTimeout(timer);
          resolved = true;
          socket.destroy();
          try {
            const response = JSON.parse(combined);
            resolve(response);
          } catch (e) {
            reject(new Error(`POS yanıt parse hatası: ${combined}`));
          }
          return;
        }
      }
    });

    socket.on('error', (err: Error) => {
      clearTimeout(connectTimer);
      if (!resolved) {
        clearTimeout(timer);
        resolved = true;
        reject(new Error(`POS bağlantı hatası: ${err.message}`));
      }
    });

    socket.on('close', () => {
      clearTimeout(connectTimer);
      if (!resolved) {
        clearTimeout(timer);
        resolved = true;
        // Bağlantı kapandıysa ama veri geldiyse, parse etmeyi dene
        if (chunks.length > 0) {
          const combined = Buffer.concat(chunks).toString('utf-8').trim();
          try {
            const response = JSON.parse(combined);
            resolve(response);
            return;
          } catch { /* düşer */ }
        }
        reject(new Error('POS bağlantısı beklenmedik şekilde kapandı'));
      }
    });
  });
}

// ── Bridge Process Yönetimi ───────────────────────────────

function startBridgeProcess(pythonPath: string, bridgePath: string, env?: Record<string, string>): Promise<boolean> {
  return new Promise((resolve) => {
    if (bridgeProcess) {
      // Zaten çalışıyor
      resolve(bridgeReady);
      return;
    }

    bridgeReady = false;
    
    const processEnv = { ...process.env, ...env };
    
    bridgeProcess = spawn(pythonPath, [bridgePath], {
      env: processEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let readyTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      // 10 saniye içinde READY gelmezse
      console.warn('[BRIDGE] READY sinyali alınamadı (10s timeout)');
      resolve(false);
    }, 10_000);

    bridgeProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      console.log(text.trim());
      
      if (text.includes('[BRIDGE] READY')) {
        bridgeReady = true;
        if (readyTimer) {
          clearTimeout(readyTimer);
          readyTimer = null;
        }
        resolve(true);
      }
    });

    bridgeProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[BRIDGE ERR] ${data.toString().trim()}`);
    });

    bridgeProcess.on('exit', (code) => {
      console.log(`[BRIDGE] Process çıktı, kod: ${code}`);
      bridgeProcess = null;
      bridgeReady = false;
    });

    bridgeProcess.on('error', (err) => {
      console.error(`[BRIDGE] Process hata: ${err.message}`);
      bridgeProcess = null;
      bridgeReady = false;
      if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = null;
      }
      resolve(false);
    });
  });
}

/** EXE veya python ile bridge başlat. cmd=exe path, args=[] veya cmd='python', args=[script] */
/** Port 5555'te zaten bir pos_bridge çalışıyor mu kontrol et */
function checkExistingBridge(): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(1000);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => { sock.destroy(); resolve(false); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(5555, '127.0.0.1');
  });
}

function startBridgeExe(cmd: string, args: string[]): Promise<boolean> {
  return new Promise(async (resolve) => {
    if (bridgeProcess) {
      resolve(bridgeReady);
      return;
    }

    // Zaten çalışan bir pos_bridge var mı? (önceki session'dan kalan)
    const alreadyRunning = await checkExistingBridge();
    if (alreadyRunning) {
      console.log('[BRIDGE] Zaten port 5555 açık — mevcut bridge kullanılıyor ✓');
      bridgeReady = true;
      resolve(true);
      return;
    }

    bridgeReady = false;

    bridgeProcess = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let readyTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      console.warn('[BRIDGE] READY sinyali alınamadı (10s timeout)');
      resolve(false);
    }, 10_000);

    bridgeProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      console.log(text.trim());
      if (text.includes('[BRIDGE] READY')) {
        bridgeReady = true;
        if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; }
        resolve(true);
      }
    });

    bridgeProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[BRIDGE ERR] ${data.toString().trim()}`);
    });

    bridgeProcess.on('exit', (code) => {
      console.log(`[BRIDGE] Process çıktı, kod: ${code}`);
      bridgeProcess = null;
      bridgeReady = false;
    });

    bridgeProcess.on('error', (err) => {
      console.error(`[BRIDGE] Process hata: ${err.message}`);
      bridgeProcess = null;
      bridgeReady = false;
      if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; }
      resolve(false);
    });
  });
}

function stopBridgeProcess(): void {
  if (bridgeProcess) {
    bridgeProcess.kill('SIGTERM');
    // Windows'ta SIGTERM çalışmayabilir, 2sn sonra zorla kapat
    setTimeout(() => {
      if (bridgeProcess) {
        bridgeProcess.kill('SIGKILL');
        bridgeProcess = null;
      }
    }, 2000);
    bridgeReady = false;
  }
}

// ── IPC Handlers ──────────────────────────────────────────

export function registerPosIpcHandlers() {
  // POS Server'a TransactionData gönder
  ipcMain.handle('pos:send', async (_event, args: { host: string; port: number; data: object; timeout?: number }) => {
    try {
      const response = await sendToPosServer(args.host, args.port, args.data, args.timeout || 60_000);
      return { success: true, response };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Bridge process başlat
  ipcMain.handle('bridge:start', async (_event, args: {
    pythonPath?: string;
    env?: Record<string, string>;
  }) => {
    const pythonPath = args.pythonPath || 'python';
    const bridgePath = path.join(__dirname, '..', 'pos_bridge.py');
    
    try {
      const ready = await startBridgeProcess(pythonPath, bridgePath, args.env);
      return { success: ready };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Bridge process durdur
  ipcMain.handle('bridge:stop', async () => {
    stopBridgeProcess();
    return { success: true };
  });

  // Bridge durumu
  ipcMain.handle('bridge:status', async () => {
    return {
      running: bridgeProcess !== null,
      ready: bridgeReady,
      pid: bridgeProcess?.pid || null,
    };
  });
}

// Uygulama kapanırken bridge'i de kapat
export function cleanupBridge() {
  stopBridgeProcess();
}
