/* ──────────────────────────────────────────────────────────
   Atlantis Satış Akış Yöneticisi
   
   SalesPanel'den çağrılır, tüm entegrasyon adımlarını yönetir:
   1. ContractMapping lookup
   2. SalePayload oluşturma
   3. pos_bridge.py'ye DB INSERT
   4. POS Server'a ödeme gönderimi
   5. Sonuç döndürme (ticket ID'ler, başarı/hata)
   ────────────────────────────────────────────────────────── */

import { getContractMapping, type ContractMapping } from '@/data/atlantisContracts';
import { submitSale, submitRefund, isBridgeAvailable } from '@/utils/posBridge';
import { sendPosPayment, isIntegrationEnabled } from '@/utils/posManager';
import { printTickets, buildTicketPrintData } from '@/utils/ticketPrinter';
import {
  type SalePayload,
  type BridgeResponse,
  PAYMENT_TYPES,
  CURRENCIES,
  TERMINAL_ACCOUNTS,
} from '@/types/atlantis';

// ── Tipler ────────────────────────────────────────────────

export interface ActiveSaleRequest {
  packageId: string;                    // ADRENAL-N package ID (s_1, wp_1...)
  packageName: string;                  // Paket görünen adı ("M.Y", "Visitor"...)
  adultQty: number;
  childQty: number;
  compQty?: number;                     // FREE biletler için
  paymentType: 'Nakit' | 'Kredi Kartı';
  currency: 'TL' | 'USD' | 'EUR';
  kasaId: 'wildpark' | 'sinema' | 'face2face';
  personnelName: string;
  
  // Yazdırma için fiyat bilgileri
  adultPrice: number;
  childPrice: number;
  
  // Çoklu ödeme için
  splitPayments?: {
    kkTl?: number;
    cashTl?: number;
    cashUsd?: number;
    cashEur?: number;
  };
  
  // Kur bilgisi (split ödemede TL'ye çevirmek için)
  usdRate?: number;
  eurRate?: number;
  
  // Açıklama (TerminalRecords.Comment alanı)
  comment?: string;
}

export interface ActiveSaleResult {
  success: boolean;
  terminalRecordId?: number;
  ticketIds?: number[];
  ticketGroupMap?: Record<string, number[]>;
  posSuccess?: boolean;
  posMessage?: string;
  error?: string;
  /** Hata aşaması: 'mapping' | 'bridge' | 'pos' | 'print' */
  failedAt?: string;
  /** Yazdırma sonucu */
  printResult?: {
    printed: number;
    failed: number;
    errors: string[];
  };
  /** Satış bilgisi (bilet tekrar basma için) */
  _saleInfo?: {
    packageName: string;
    packageId: string;
    adultQty: number;
    childQty: number;
    adultPrice: number;
    childPrice: number;
    currency: string;
    isFree: boolean;
  };
}

// ── Yardımcı Fonksiyonlar ─────────────────────────────────

function currencyToId(currency: string): number {
  switch (currency) {
    case 'USD': return CURRENCIES.USD;
    case 'EUR': return CURRENCIES.EUR;
    default: return CURRENCIES.TRY;
  }
}

function paymentTypeToId(type: string): number {
  return type === 'Kredi Kartı' ? PAYMENT_TYPES.KREDI_KARTI : PAYMENT_TYPES.NAKIT;
}

/** Package ID'den SalePayload oluştur */
function buildSalePayload(
  request: ActiveSaleRequest,
  mapping: ContractMapping,
): SalePayload {
  const terminalAccountId = TERMINAL_ACCOUNTS[request.kasaId];
  
  // Bilet grupları oluştur
  const tickets: SalePayload['tickets'] = [];
  
  if (mapping.isFree) {
    // FREE kontrat — COMP tipi
    const compQty = request.compQty || (request.adultQty + request.childQty);
    if (compQty > 0) {
      const specs = mapping.products.map(product => ({
        contractProductId: product.contractProductId,
        contractTicketTypeId: product.prices.COMP!.contractTicketTypeId,
        priceId: product.prices.COMP!.priceId,
        price: product.prices.COMP!.price,
        productId: product.productId,
        productName: product.productName,
        gateId: product.gateId,
        gateLocation: product.gateLocation,
      }));
      
      tickets.push({
        ticketTypeLabel: 'COMP',
        quantity: compQty,
        specs,
      });
    }
  } else {
    // Normal kontrat — ADU ve/veya CHL
    if (request.adultQty > 0) {
      const specs = mapping.products
        .filter(p => p.prices.ADU)
        .map(product => ({
          contractProductId: product.contractProductId,
          contractTicketTypeId: product.prices.ADU!.contractTicketTypeId,
          priceId: product.prices.ADU!.priceId,
          price: product.prices.ADU!.price,
          productId: product.productId,
          productName: product.productName,
          gateId: product.gateId,
          gateLocation: product.gateLocation,
        }));
      
      tickets.push({
        ticketTypeLabel: 'ADU',
        quantity: request.adultQty,
        specs,
      });
    }
    
    if (request.childQty > 0) {
      const specs = mapping.products
        .filter(p => p.prices.CHL)
        .map(product => ({
          contractProductId: product.contractProductId,
          contractTicketTypeId: product.prices.CHL!.contractTicketTypeId,
          priceId: product.prices.CHL!.priceId,
          price: product.prices.CHL!.price,
          productId: product.productId,
          productName: product.productName,
          gateId: product.gateId,
          gateLocation: product.gateLocation,
        }));
      
      tickets.push({
        ticketTypeLabel: 'CHL',
        quantity: request.childQty,
        specs,
      });
    }
  }

  // Toplam hesapla
  let totalAmount = 0;
  for (const tg of tickets) {
    for (const spec of tg.specs) {
      totalAmount += spec.price * tg.quantity;
    }
  }

  // Ödeme bilgileri
  const payments: SalePayload['payments'] = [];
  
  if (request.splitPayments) {
    // Çoklu ödeme
    const sp = request.splitPayments;
    if (sp.kkTl && sp.kkTl > 0) {
      payments.push({ amount: sp.kkTl, paymentTypeId: PAYMENT_TYPES.KREDI_KARTI, currencyId: CURRENCIES.TRY, exchangeRateId: null });
    }
    if (sp.cashTl && sp.cashTl > 0) {
      payments.push({ amount: sp.cashTl, paymentTypeId: PAYMENT_TYPES.NAKIT, currencyId: CURRENCIES.TRY, exchangeRateId: null });
    }
    if (sp.cashUsd && sp.cashUsd > 0) {
      payments.push({ amount: sp.cashUsd, paymentTypeId: PAYMENT_TYPES.NAKIT, currencyId: CURRENCIES.USD, exchangeRateId: null });
    }
    if (sp.cashEur && sp.cashEur > 0) {
      payments.push({ amount: sp.cashEur, paymentTypeId: PAYMENT_TYPES.NAKIT, currencyId: CURRENCIES.EUR, exchangeRateId: null });
    }
  } else {
    // Tekli ödeme
    payments.push({
      amount: totalAmount,
      paymentTypeId: paymentTypeToId(request.paymentType),
      currencyId: currencyToId(request.currency),
      exchangeRateId: null,
    });
  }

  return {
    contractId: mapping.contractId,
    contractHeaderId: mapping.contractHeaderId,
    contractName: mapping.contractHeaderName,
    terminalAccountId,
    createdBy: request.personnelName,
    comment: request.comment || undefined,
    tickets,
    payments,
    totalAmount,
    currencyId: mapping.currencyId,
  };
}

// ── Bilet Yazdırma Yardımcı ───────────────────────────────

async function tryPrintTickets(
  bridgeResult: BridgeResponse,
  request: ActiveSaleRequest,
  mapping: ContractMapping,
): Promise<{ printed: number; failed: number; errors: string[] }> {
  try {
    if (!bridgeResult.ticketIds || bridgeResult.ticketIds.length === 0) {
      return { printed: 0, failed: 0, errors: ['Bilet ID bulunamadı'] };
    }

    // Ürün adlarını mapping'den al
    const productNames = mapping.products.map(p => p.productName);

    const printData = buildTicketPrintData(
      {
        terminalRecordId: bridgeResult.terminalRecordId!,
        ticketIds: bridgeResult.ticketIds,
        ticketGroupMap: bridgeResult.ticketGroupMap as Record<string, number[]> | undefined,
      },
      {
        packageName: request.packageName || mapping.contractHeaderName,
        kasaId: request.kasaId,
        personnelName: request.personnelName,
        adultQty: request.adultQty,
        childQty: request.childQty,
        compQty: request.compQty,
        products: productNames,
        adultPrice: request.adultPrice || 0,
        childPrice: request.childPrice || 0,
        currency: request.currency,
        isFree: mapping.isFree,
      },
    );

    const result = await printTickets(printData);
    return { printed: result.printed, failed: result.failed, errors: result.errors };
  } catch (error: any) {
    console.error('[SaleFlow] Bilet yazdırma hatası:', error);
    return { printed: 0, failed: 0, errors: [`Yazdırma hatası: ${error.message}`] };
  }
}

// ── Ana Satış Fonksiyonu ──────────────────────────────────

/**
 * Aktif mod satış akışı:
 * 1. Contract mapping bul
 * 2. SalePayload oluştur
 * 3. POS Server'a ödeme gönder (KK veya nakit) → ÖNCE ÖDEME
 * 4. Ödeme onaylanırsa → pos_bridge.py'ye gönder (DB INSERT)
 * 5. Bilet yazdır
 * 6. Sonuç döndür
 * 
 * Ödeme onaylanmazsa DB'ye hiçbir şey yazılmaz, bilet basılmaz.
 */
export async function processActiveSale(request: ActiveSaleRequest): Promise<ActiveSaleResult> {
  // 1) Contract mapping
  const mapping = getContractMapping(request.packageId);
  if (!mapping) {
    return {
      success: false,
      error: `Bu paket için DB kontrat eşlemesi bulunamadı: ${request.packageId}`,
      failedAt: 'mapping',
    };
  }

  // 2) SalePayload oluştur
  const payload = buildSalePayload(request, mapping);

  // 3) ÖNCE POS ödeme — onay gelmezse hiçbir şey yapma
  let posAmountTl = 0;
  let posPaymentType: 'credit_card' | 'cash' = 'cash';
  
  if (request.splitPayments) {
    const sp = request.splitPayments;
    const cashTotalTl = (sp.cashTl || 0) + ((sp.cashUsd || 0) * (request.usdRate || 1)) + ((sp.cashEur || 0) * (request.eurRate || 1));
    const kkTotalTl = sp.kkTl || 0;
    if (kkTotalTl > 0) {
      posAmountTl = kkTotalTl;
      posPaymentType = 'credit_card';
    } else {
      posAmountTl = cashTotalTl;
      posPaymentType = 'cash';
    }
  } else if (request.paymentType === 'Kredi Kartı') {
    posPaymentType = 'credit_card';
    if (request.currency === 'USD' && request.usdRate) {
      posAmountTl = payload.totalAmount * request.usdRate;
    } else if (request.currency === 'EUR' && request.eurRate) {
      posAmountTl = payload.totalAmount * request.eurRate;
    } else {
      posAmountTl = payload.totalAmount;
    }
  } else {
    posPaymentType = 'cash';
    if (request.currency === 'USD' && request.usdRate) {
      posAmountTl = payload.totalAmount * request.usdRate;
    } else if (request.currency === 'EUR' && request.eurRate) {
      posAmountTl = payload.totalAmount * request.eurRate;
    } else {
      posAmountTl = payload.totalAmount;
    }
  }
  
  let posSuccess = true;
  let posMessage = 'POS devre dışı';
  
  if (posAmountTl > 0) {
    const posResult = await sendPosPayment({
      transactionId: `TR-${Date.now()}`,
      items: [{
        name: mapping.contractHeaderName,
        quantity: 1,
        price: posAmountTl,
      }],
      payments: [{
        type: posPaymentType,
        amount: posAmountTl,
      }],
    });

    posSuccess = posResult.success;
    posMessage = posResult.statusMessage || posResult.error || '';

    if (!posResult.success) {
      // POS ödeme onaylanmadı — DB'ye hiçbir şey yazma, bilet basma
      return {
        success: false,
        posSuccess: false,
        posMessage: 'İşlem onaylanmadı.',
        failedAt: 'pos',
      };
    }
  }

  // 4) Ödeme onaylandı → DB INSERT
  const bridgeResult: BridgeResponse = await submitSale(payload);
  
  if (!bridgeResult.success) {
    return {
      success: false,
      error: `DB kayıt hatası: ${bridgeResult.error}`,
      posSuccess,
      posMessage,
      failedAt: 'bridge',
    };
  }

  // 5) Bilet Yazdırma
  const printResult = await tryPrintTickets(bridgeResult, request, mapping);

  // 6) Başarılı sonuç
  return {
    success: true,
    terminalRecordId: bridgeResult.terminalRecordId,
    ticketIds: bridgeResult.ticketIds,
    ticketGroupMap: bridgeResult.ticketGroupMap,
    posSuccess,
    posMessage,
    printResult,
  };
}

// ── İade İşlemi ───────────────────────────────────────────

export async function processActiveRefund(
  terminalRecordId: number,
  personnelName: string,
): Promise<{ success: boolean; error?: string }> {
  const result = await submitRefund(terminalRecordId, personnelName);
  return result;
}

// ── Durum Kontrolleri ─────────────────────────────────────

/** Entegrasyon aktif mi ve bridge erişilebilir mi? */
export async function checkIntegrationReady(): Promise<{
  enabled: boolean;
  bridgeAvailable: boolean;
  ready: boolean;
}> {
  const enabled = isIntegrationEnabled();
  if (!enabled) {
    return { enabled: false, bridgeAvailable: false, ready: false };
  }
  
  const bridgeAvailable = await isBridgeAvailable();
  return {
    enabled,
    bridgeAvailable,
    ready: enabled && bridgeAvailable,
  };
}

/** Package ID'nin DB eşlemesi var mı? */
export function hasContractMapping(packageId: string): boolean {
  return !!getContractMapping(packageId);
}
