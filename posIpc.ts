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

const POS_DELIMITER = Buffer.from([0x13]); // SimpleTCP delimiter

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
    let buffer = Buffer.alloc(0);
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.error('[POS TCP] TIMEOUT! Buffer boyut:', buffer.length, 'içerik:', buffer.toString('utf-8').substring(0, 500));
        socket.destroy();
        reject(new Error('POS Server yanıt zaman aşımı'));
      }
    }, timeoutMs);

    socket.connect(port, host, () => {
      // JSON + delimiter gönder
      const json = JSON.stringify(transactionData);
      console.log('[POS TCP] Gönderiliyor →', host + ':' + port);
      console.log('[POS TCP] Payload:', json);
      const payload = Buffer.concat([Buffer.from(json, 'utf-8'), POS_DELIMITER]);
      socket.write(payload);
    });

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      console.log('[POS TCP] Data geldi, boyut:', chunk.length, 'toplam:', buffer.length);
      console.log('[POS TCP] Raw:', chunk.toString('utf-8').substring(0, 500));
      
      // Delimiter'ı ara
      const delimIdx = buffer.indexOf(POS_DELIMITER);
      if (delimIdx >= 0) {
        const messageBytes = buffer.subarray(0, delimIdx);
        const message = messageBytes.toString('utf-8');
        
        clearTimeout(timer);
        resolved = true;
        socket.destroy();
        
        try {
          const response = JSON.parse(message);
          resolve(response);
        } catch (e) {
          reject(new Error(`POS yanıt parse hatası: ${message}`));
        }
      }
    });

    socket.on('error', (err: Error) => {
      if (!resolved) {
        clearTimeout(timer);
        resolved = true;
        reject(new Error(`POS bağlantı hatası: ${err.message}`));
      }
    });

    socket.on('close', () => {
      if (!resolved) {
        clearTimeout(timer);
        resolved = true;
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
