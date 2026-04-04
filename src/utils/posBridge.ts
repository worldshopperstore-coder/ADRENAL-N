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

/** Bridge erişilebilir mi? (hızlı boolean) */
export async function isBridgeAvailable(): Promise<boolean> {
  try {
    const result = await checkBridgeHealth();
    return result.status === 'ok';
  } catch {
    return false;
  }
}
