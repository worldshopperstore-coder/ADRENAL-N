/* ──────────────────────────────────────────────────────────
   POS Server İşlem Yöneticisi
   
   Renderer process'ten POS Server'a ödeme gönderir.
   Electron IPC üzerinden main process TCP client'ı kullanır.
   ────────────────────────────────────────────────────────── */

import type {
  PosTransactionData,
  PosCartProduct,
  PosCartPayment,
  PosOutputType,
  PosPaymentType,
  PosTransactionStatus,
  PosSecondaryDataFormat,
  IntegrationSettings,
} from '@/types/atlantis';

// Electron window type
declare global {
  interface Window {
    electron?: {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>;
        send: (channel: string, ...args: any[]) => void;
        on: (channel: string, func: (...args: any[]) => void) => void;
        once: (channel: string, func: (...args: any[]) => void) => void;
      };
      pos: {
        send: (args: { host: string; port: number; data: object; timeout?: number }) => Promise<{ success: boolean; response?: any; error?: string }>;
      };
      bridge: {
        start: (args?: { pythonPath?: string; env?: Record<string, string> }) => Promise<{ success: boolean; error?: string }>;
        stop: () => Promise<{ success: boolean }>;
        status: () => Promise<{ running: boolean; ready: boolean; pid: number | null }>;
      };
    };
  }
}

function getSettings(): IntegrationSettings {
  try {
    const stored = localStorage.getItem('integrationSettings');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  // Default settings
  return {
    enabled: false,
    sqlServer: { host: '192.168.7.9', port: 1433, database: 'AquariumDB3', username: 'sa', password: 'Atl@2022!' },
    pos: { enabled: true, ip: '127.0.0.1', port: 9960, tax: 20, invoiceType: 1, receiptLimit: 3999 },
    printer: { enabled: true, name: 'ZDesigner ZD220-203dpi ZPL' },
    bridge: { host: '127.0.0.1', port: 5555 },
  };
}

// ── POS Server Ödeme Gönderimi ────────────────────────────

export interface PosPaymentRequest {
  /** Benzersiz işlem ID */
  transactionId: string;
  /** Ürünler */
  items: {
    name: string;
    quantity: number;
    price: number;       // Birim fiyat
    qrData?: string;     // QR kod verisi (ticket ID)
  }[];
  /** Ödeme bilgisi */
  payments: {
    type: 'credit_card' | 'cash';
    amount: number;      // TL cinsinden
  }[];
}

export interface PosPaymentResult {
  success: boolean;
  transactionStatus?: number;  // 0=Ok, 3=Error
  statusMessage?: string;
  rawResponse?: any;
  error?: string;
}

/** POS Server'a ödeme gönder ve sonucu bekle */
export async function sendPosPayment(request: PosPaymentRequest): Promise<PosPaymentResult> {
  const settings = getSettings();
  
  if (!settings.pos.enabled) {
    return { success: true, transactionStatus: 0, statusMessage: 'POS devre dışı — direkt onay' };
  }
  
  if (!window.electron?.pos) {
    console.warn('[POS] Electron IPC mevcut değil — POS atlanıyor, DB kaydı yeterli');
    return { success: true, transactionStatus: 0, statusMessage: 'Electron IPC yok — POS atlandı, DB kaydı başarılı' };
  }

  const cartProducts: PosCartProduct[] = request.items.map(item => ({
    Name: item.name,
    Quantity: item.quantity,
    Price: item.price,
    Tax: settings.pos.tax,
    SecondaryData: item.qrData || '',
    SecondaryDataFormat: (item.qrData ? 2048 : 0) as PosSecondaryDataFormat,  // PsQR=2048
    PLUBarcode: '',
  }));

  const cartPayments: PosCartPayment[] = request.payments.map(p => ({
    PaymentType: p.type === 'credit_card' ? 0 : 1,  // CreditCard=0, Cash=1
    Amount: p.amount,
  }));

  // Toplam TL tutarını hesapla — receiptLimit üzerinde e-fatura gerekir
  const totalPaymentTl = cartPayments.reduce((sum, p) => sum + p.Amount, 0);
  const outputType = (totalPaymentTl > settings.pos.receiptLimit)
    ? 0   // Invoice (e-Fatura) — 3999 TL üstü zorunlu
    : settings.pos.invoiceType;  // Receipt=1
  
  if (totalPaymentTl > settings.pos.receiptLimit) {
    console.log(`[POS] Tutar (${totalPaymentTl.toFixed(2)} TL) > receiptLimit (${settings.pos.receiptLimit}), OutputType → Invoice (0)`);
  }

  const transactionData: PosTransactionData = {
    Id: request.transactionId,
    OutputType: outputType,
    InvoiceInfo: null,
    CartProducts: cartProducts,
    CartPayments: cartPayments,
  };

  try {
    const result = await window.electron.pos.send({
      host: settings.pos.ip,
      port: settings.pos.port,
      data: transactionData,
      timeout: 60_000,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const response = result.response;
    const status = response?.TransactionStatus;
    
    if (status === 0) {
      return { success: true, transactionStatus: 0, statusMessage: 'İşlem başarılı', rawResponse: response };
    } else {
      return {
        success: false,
        transactionStatus: status,
        statusMessage: response?.StatusMessage || `POS hatası (status: ${status})`,
        rawResponse: response,
      };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Bridge Yönetimi ───────────────────────────────────────

/** pos_bridge.py process'ini başlat */
export async function startBridge(): Promise<boolean> {
  if (!window.electron?.bridge) {
    console.warn('Electron IPC mevcut değil — bridge başlatılamıyor');
    return false;
  }

  const settings = getSettings();
  
  const result = await window.electron.bridge.start({
    pythonPath: 'python',  // PATH'te olmalı
    env: {
      DB_HOST: settings.sqlServer.host,
      DB_PORT: String(settings.sqlServer.port),
      DB_NAME: settings.sqlServer.database,
      DB_USER: settings.sqlServer.username,
      DB_PASS: settings.sqlServer.password,
      BRIDGE_PORT: String(settings.bridge.port),
    },
  });

  return result.success;
}

/** pos_bridge.py process'ini durdur */
export async function stopBridge(): Promise<void> {
  if (window.electron?.bridge) {
    await window.electron.bridge.stop();
  }
}

/** Bridge çalışıyor mu? */
export async function getBridgeStatus(): Promise<{ running: boolean; ready: boolean; pid: number | null }> {
  if (!window.electron?.bridge) {
    return { running: false, ready: false, pid: null };
  }
  return window.electron.bridge.status();
}

// ── Entegrasyon Durumu ────────────────────────────────────

export function isIntegrationEnabled(): boolean {
  try {
    const stored = localStorage.getItem('integrationSettings');
    if (stored) {
      const settings: IntegrationSettings = JSON.parse(stored);
      return settings.enabled;
    }
  } catch { /* ignore */ }
  return false;
}

export function saveIntegrationSettings(settings: IntegrationSettings): void {
  localStorage.setItem('integrationSettings', JSON.stringify(settings));
}

export function loadIntegrationSettings(): IntegrationSettings {
  return getSettings();
}
