/* ──────────────────────────────────────────────────────────
   pos_bridge.py HTTP API Client
   Renderer process'ten pos_bridge.py'ye HTTP istekleri gönderir.
   ────────────────────────────────────────────────────────── */

import type { SalePayload, BridgeResponse, IntegrationSettings, DEFAULT_INTEGRATION_SETTINGS } from '@/types/atlantis';

const BRIDGE_TIMEOUT = 15_000; // 15 saniye

function getBridgeUrl(): string {
  // Ayarları localStorage'dan oku, yoksa default
  try {
    const stored = localStorage.getItem('integrationSettings');
    if (stored) {
      const settings: IntegrationSettings = JSON.parse(stored);
      return `http://${settings.bridge.host}:${settings.bridge.port}`;
    }
  } catch { /* ignore */ }
  return 'http://127.0.0.1:5555';
}

async function bridgeFetch(path: string, options?: RequestInit): Promise<any> {
  const url = `${getBridgeUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    
    const data = await response.json();
    return data;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Bridge bağlantı zaman aşımı (15s)');
    }
    throw new Error(`Bridge bağlantı hatası: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ────────────────────────────────────────────

/** Bridge sağlık kontrolü */
export async function checkBridgeHealth(): Promise<{ status: string; database?: string; host?: string; error?: string }> {
  try {
    return await bridgeFetch('/health');
  } catch (err: any) {
    return { status: 'error', error: err.message };
  }
}

/** Satış INSERT: TerminalRecords + Tickets + TerminalTransactions */
export async function submitSale(payload: SalePayload): Promise<BridgeResponse> {
  try {
    const result = await bridgeFetch('/sale', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return result;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** İade (soft delete) */
export async function submitRefund(terminalRecordId: number, updatedBy: string): Promise<BridgeResponse> {
  try {
    const result = await bridgeFetch('/refund', {
      method: 'POST',
      body: JSON.stringify({ terminalRecordId, updatedBy }),
    });
    return result;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Bugünkü satış istatistikleri */
export async function getTodaySales(): Promise<{ success: boolean; recordCount?: number; ticketCount?: number; error?: string }> {
  try {
    return await bridgeFetch('/today-sales');
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export interface TicketStatusEntry {
  ticketId: number;
  venue: 'wildpark' | 'sinema' | 'face2face';
  isUsed: boolean;
  useDate: string | null;
}

export interface TicketStatusSale {
  terminalRecordId: number;
  createdBy: string;
  saleDate: string | null;
  tickets: TicketStatusEntry[];
}

/** Bugün bu kasadan satılan biletlerin turnike geçiş durumu (sadece kendi satışları) */
export async function getTodayTicketStatus(kasaId: string): Promise<{ success: boolean; sales?: TicketStatusSale[]; error?: string }> {
  try {
    return await bridgeFetch(`/ticket-status?kasaId=${encodeURIComponent(kasaId)}`);
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Bridge erişilebilir mi? (hızlı boolean) */
export async function isBridgeAvailable(): Promise<boolean> {
  try {
    const result = await checkBridgeHealth();
    return result.status === 'ok';
  } catch {
    return false;
  }
}

// ── Kontrat Yönetimi ──────────────────────────────────────

export interface CreateContractRequest {
  name: string;
  currencyId: 1 | 2 | 3;           // 1=USD, 2=EUR, 3=TRY
  contractGroupId: number;
  startDate: string;                // "2026-06-01"
  endDate: string;                  // "2026-06-15"
  priority?: number;
  createdBy: string;                // "y.celebi"
  products: {
    productId: 1004 | 1005 | 1008; // WP / CINEMA / F2F
    adultPrice: number;
    childPrice: number;
  }[];
}

export interface CreateContractResult {
  success: boolean;
  contractHeaderId?: number;
  contractId?: number;
  aduTicketTypeId?: number;
  chlTicketTypeId?: number;
  products?: {
    productId: number;
    contractProductId: number;
    aduTicketTypeId: number;
    aduPriceId: number;
    chlTicketTypeId: number;
    chlPriceId: number;
    gateId: number | null;
    gateLocation: number | null;
  }[];
  error?: string;
}

/** Atlantis DB'ye yeni kontrat zinciri oluştur */
export async function createContract(request: CreateContractRequest): Promise<CreateContractResult> {
  try {
    return await bridgeFetch('/contract/create', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Mevcut kontratın fiyatlarını güncelle */
export async function updateContractPrice(
  priceUpdates: { priceId: number; newPrice: number }[],
  updatedBy: string
): Promise<{ success: boolean; updated?: number; error?: string }> {
  try {
    return await bridgeFetch('/contract/price', {
      method: 'POST',
      body: JSON.stringify({ priceUpdates, updatedBy }),
    });
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** POS Server'a bridge TCP üzerinden ödeme gönder */
export async function submitPosPayment(transactionData: object): Promise<{
  success: boolean;
  transactionStatus?: number;
  statusMessage?: string;
  response?: any;
  error?: string;
}> {
  try {
    // POS timeout 125s, bridge timeout'u daha uzun tutuyoruz
    const url = `${getBridgeUrl()}/pos-payment`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 135_000); // 135s — POS 125s + margin
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(transactionData),
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await response.json();
      return data;
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'POS Bridge bağlantı zaman aşımı (135s)' };
    }
    return { success: false, error: `POS Bridge hatası: ${err.message}` };
  }
}
