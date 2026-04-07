/* ──────────────────────────────────────────────────────────
   POS Server İşlem Yöneticisi
   
   Renderer process'ten POS Server'a ödeme gönderir.
   1. Electron varsa: IPC → main process TCP → POS Server
   2. Electron yoksa: HTTP → pos_bridge.py → TCP → POS Server
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
import { submitPosPayment } from '@/utils/posBridge';

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
      printers: {
        list: () => Promise<{ name: string; isDefault: boolean }[]>;
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

  const cartProducts: PosCartProduct[] = request.items.map(item => ({
    Name: item.name,
    Quantity: item.quantity,
    Price: item.price,
    PriceInt: Math.round(item.price * 100),
    Tax: settings.pos.tax,
    TaxInt: Math.round(settings.pos.tax * 100),
    SecondaryData: item.qrData || null,
    SecondaryDataFormat: (item.qrData ? 2048 : 0) as PosSecondaryDataFormat,  // PsQR=2048
    PLUBarcode: null,
  }));

  const cartPayments: PosCartPayment[] = request.payments.map(p => ({
    PaymentType: p.type === 'credit_card' ? 0 : 1,  // CreditCard=0, Cash=1
    Amount: p.amount,
    AmountInt: Math.round(p.amount * 100),
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
    TransactionStatus: 1,           // SentToPos — istek gönderiliyor
    TransactionMessage: null,
    TransactionErrorCode: null,
    CartProducts: cartProducts,
    CartPayments: cartPayments,
  };

  // ── Yol 1: Electron IPC varsa doğrudan TCP ──
  if (window.electron?.pos) {
    console.log('[POS] Electron IPC ile gönderiliyor...');
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
      const errorCode = response?.TransactionErrorCode;
      
      if (status === 0 && (errorCode === null || errorCode === undefined || errorCode === 0)) {
        return { success: true, transactionStatus: 0, statusMessage: 'İşlem başarılı', rawResponse: response };
      } else {
        return {
          success: false,
          transactionStatus: status,
          statusMessage: response?.TransactionMessage || response?.StatusMessage || `POS hatası (status: ${status}, errorCode: ${errorCode})`,
          rawResponse: response,
        };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
  
  // ── Yol 2: Electron yok → Bridge HTTP üzerinden POS TCP ──
  console.log('[POS] Electron yok, Bridge üzerinden POS\'a gönderiliyor...');
  try {
    const bridgePosData = {
      ...transactionData,
      _host: settings.pos.ip,
      _port: settings.pos.port,
      _timeout: 65,
    };
    
    const result = await submitPosPayment(bridgePosData);
    
    if (result.success) {
      return {
        success: true,
        transactionStatus: result.transactionStatus || 0,
        statusMessage: result.statusMessage || 'İşlem başarılı (Bridge)',
        rawResponse: result.response,
      };
    } else {
      return {
        success: false,
        transactionStatus: result.transactionStatus,
        statusMessage: result.statusMessage || result.error,
        error: result.error,
      };
    }
  } catch (err: any) {
    return { success: false, error: `Bridge POS hatası: ${err.message}` };
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
  // Supabase'e de kaydet (tüm kasalar görsün)
  _syncSettingsToSupabase(settings).catch(() => {});
}

export function loadIntegrationSettings(): IntegrationSettings {
  return getSettings();
}

/** Uygulama açılışında Supabase'den aktif mod durumunu çek ve localStorage'ı güncelle */
export async function syncIntegrationFromSupabase(): Promise<void> {
  try {
    const { supabase } = await import('@/config/supabase');
    if (!supabase) return;
    const { data, error } = await supabase
      .from('kasa_settings')
      .select('tl_advance')
      .eq('kasa_id', 'global_integration')
      .single();
    if (!error && data) {
      const remoteEnabled = data.tl_advance === 1;
      const local = getSettings();
      if (remoteEnabled !== local.enabled) {
        local.enabled = remoteEnabled;
        localStorage.setItem('integrationSettings', JSON.stringify(local));
      }
    }
  } catch { /* offline — localStorage'daki değer geçerli */ }
}

async function _syncSettingsToSupabase(settings: IntegrationSettings): Promise<void> {
  const { supabase } = await import('@/config/supabase');
  if (!supabase) return;
  await supabase
    .from('kasa_settings')
    .upsert([{
      kasa_id: 'global_integration',
      tl_advance: settings.enabled ? 1 : 0,
      usd_advance: 0,
      eur_advance: 0,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'kasa_id' });
}

// ── Otomatik Yazıcı Algılama ──────────────────────────────

/**
 * Sistemdeki Zebra yazıcıyı otomatik algıla, localStorage'a ve Supabase'e kaydet.
 * Her giriş yapıldığında çağrılır.
 * Yazıcı değiştiyse günceller, aynıysa dokunmaz.
 */
export async function autoDetectPrinter(kasaId: string): Promise<string | null> {
  if (!window.electron?.printers) return null;

  try {
    const printers = await window.electron.printers.list();
    // Zebra/ZDesigner yazıcıyı bul
    const zebra = printers.find(p =>
      p.name.toLowerCase().includes('zdesigner') ||
      p.name.toLowerCase().includes('zebra')
    );

    if (!zebra) {
      console.warn('[PRINTER] Zebra yazıcı bulunamadı. Mevcut yazıcılar:', printers.map(p => p.name));
      return null;
    }

    // Mevcut ayarla karşılaştır
    const settings = getSettings();
    if (settings.printer.name === zebra.name) {
      // Aynı yazıcı, değişiklik yok
      return zebra.name;
    }

    // Yeni yazıcı algılandı — güncelle
    console.log(`[PRINTER] Zebra algılandı: "${zebra.name}" (önceki: "${settings.printer.name}")`);
    settings.printer.name = zebra.name;
    localStorage.setItem('integrationSettings', JSON.stringify(settings));

    // Supabase'e kasa bazlı kaydet
    try {
      const { supabase } = await import('@/config/supabase');
      if (supabase) {
        await supabase
          .from('kasa_settings')
          .upsert([{
            kasa_id: `printer_${kasaId}`,
            updated_by: zebra.name,
            updated_at: new Date().toISOString(),
            tl_advance: 0, usd_advance: 0, eur_advance: 0,
          }], { onConflict: 'kasa_id' });
      }
    } catch { /* offline — sorun değil */ }

    return zebra.name;
  } catch (err) {
    console.error('[PRINTER] Algılama hatası:', err);
    return null;
  }
}
