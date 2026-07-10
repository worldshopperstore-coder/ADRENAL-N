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
  infantQty?: number;                   // INF (ücretsiz, QR kodsuz) biletler için
  paymentType: 'Nakit' | 'Kredi Kartı';
  currency: 'TL' | 'USD' | 'EUR';
  kasaId: 'wildpark' | 'sinema' | 'face2face';
  personnelName: string;
  personnelUsername?: string;             // Atlantis DB createdBy formatı (y.celebi)
  packageItem?: any;                      // Dinamik kontrat için tam paket objesi

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
    // Fiyat kaynağı: request.adultPrice/childPrice (admin panelden Supabase'e
    // yazılan, satış ekranında görünen güncel fiyat) — mapping'deki sabit price
    // sadece priceId/contractTicketTypeId eşlemesi için kullanılır, gerçek tutar
    // için kullanılmaz (aksi halde admin panel fiyat güncellemesi POS'a yansımaz).
    if (request.adultQty > 0) {
      const aduProducts = mapping.products.filter(p => p.prices.ADU);
      const specs = aduProducts.map((product, idx) => ({
        contractProductId: product.contractProductId,
        contractTicketTypeId: product.prices.ADU!.contractTicketTypeId,
        priceId: product.prices.ADU!.priceId,
        // Combo'da esas tutar ilk üründe toplanır; diğer ürünler DB kaydı/gate
        // eşlemesi için satır olarak kalır ama fiyatı 0 — mapping'deki sembolik
        // (ör. 1 TL) fiyat toplama girerse ekranda görünenle POS'a giden tutar
        // arasında fark oluşur (idx>0 ürün sayısı × sembolik fiyat kadar).
        price: idx === 0 ? request.adultPrice : 0,
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
      const chlProducts = mapping.products.filter(p => p.prices.CHL);
      const specs = chlProducts.map((product, idx) => ({
        contractProductId: product.contractProductId,
        contractTicketTypeId: product.prices.CHL!.contractTicketTypeId,
        priceId: product.prices.CHL!.priceId,
        price: idx === 0 ? request.childPrice : 0,
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
    createdBy: request.personnelUsername || request.personnelName,
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
        infantQty: request.infantQty,
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
  const saleTag = `[SATIŞ] ${request.packageName || request.packageId} | ${request.adultQty || 0}Y ${request.childQty || 0}Ç | ${request.paymentType} | ${request.currency}`;
  console.info(`${saleTag} → Satış başlatıldı`);

  // 1) Contract mapping — önce sabit map, sonra dinamik
  const mapping = getContractMapping(request.packageId) || buildDynamicMapping(request.packageItem);
  if (!mapping) {
    const err = `Kontrat eşlemesi bulunamadı: paket=${request.packageId}`;
    console.error(`${saleTag} ✗ ${err}`);
    return { success: false, error: err, failedAt: 'mapping' };
  }
  console.info(`${saleTag} [1/5] Kontrat eşlendi → ${mapping.contractHeaderName}`);

  // 2) SalePayload oluştur
  const payload = buildSalePayload(request, mapping);
  console.info(`${saleTag} [2/5] Ödeme yükü oluşturuldu → toplam ${payload.totalAmount} ${request.currency}`);

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
    console.info(`${saleTag} [3/5] POS'a gönderiliyor → ${posPaymentType === 'credit_card' ? 'Kredi Kartı' : 'Nakit'} ${posAmountTl.toFixed(2)} TL`);
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
      console.error(`${saleTag} [3/5] ✗ POS reddetti → status=${posResult.transactionStatus ?? '-'} | ${posMessage}`);
      return {
        success: false,
        posSuccess: false,
        posMessage: 'İşlem onaylanmadı.',
        failedAt: 'pos',
      };
    }
    console.info(`${saleTag} [3/5] ✓ POS onayladı → ${posMessage}`);
  } else {
    console.info(`${saleTag} [3/5] POS atlandı (tutar=0)`);
  }

  // 4) Ödeme onaylandı → DB INSERT
  console.info(`${saleTag} [4/5] DB'ye kaydediliyor...`);
  const bridgeResult: BridgeResponse = await submitSale(payload);

  if (!bridgeResult.success) {
    console.error(`${saleTag} [4/5] ✗ DB kayıt hatası → ${bridgeResult.error}`);
    return {
      success: false,
      error: `DB kayıt hatası: ${bridgeResult.error}`,
      posSuccess,
      posMessage,
      failedAt: 'bridge',
    };
  }
  console.info(`${saleTag} [4/5] ✓ DB kaydedildi → kayıt #${bridgeResult.terminalRecordId}`);

  // 5) Bilet Yazdırma
  console.info(`${saleTag} [5/5] Bilet basılıyor...`);
  const printResult = await tryPrintTickets(bridgeResult, request, mapping);
  if (printResult.errors && printResult.errors.length > 0) {
    console.warn(`${saleTag} [5/5] ⚠ Bilet basma uyarısı → ${printResult.errors.join(' | ')}`);
  } else {
    console.info(`${saleTag} [5/5] ✓ ${printResult.printed} bilet basıldı`);
  }

  // 6) Başarılı sonuç
  console.info(`${saleTag} ✓ Satış tamamlandı`);
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

/** Package ID'nin DB eşlemesi var mı? (sabit map veya dinamik Supabase paketi) */
export function hasContractMapping(packageId: string, pkg?: any): boolean {
  if (getContractMapping(packageId)) return true;
  // Dinamik: Supabase'den gelen atlantis paketleri
  if (pkg?.atlantisContractHeaderId && pkg?.atlantisContractId && pkg?.atlantisProducts?.length > 0) return true;
  return false;
}

/** Supabase'deki dinamik paketten ContractMapping oluştur */
export function buildDynamicMapping(pkg: any): import('@/data/atlantisContracts').ContractMapping | undefined {
  if (!pkg?.atlantisContractId || !pkg?.atlantisProducts?.length) return undefined;
  return {
    packageId: pkg.id,
    contractHeaderId: pkg.atlantisContractHeaderId,
    contractHeaderName: pkg.name,
    contractId: pkg.atlantisContractId,
    currencyId: pkg.currency === 'USD' ? 1 : pkg.currency === 'EUR' ? 2 : 3,
    isCombo: pkg.atlantisProducts.length > 1,
    isFree: pkg.adultPrice === 0 && pkg.childPrice === 0,
    products: pkg.atlantisProducts.map((p: any) => ({
      contractProductId: p.contractProductId,
      productId: p.productId,
      productName: p.productId === 1004 ? 'WILDPARK ENTRANCE' : p.productId === 1005 ? 'CINEMA ENTRANCE' : 'FACE2FACE ENTRANCE',
      prices: {
        ADU: { contractTicketTypeId: p.aduTicketTypeId, priceId: p.aduPriceId, price: pkg.adultPrice },
        CHL: { contractTicketTypeId: p.chlTicketTypeId, priceId: p.chlPriceId, price: pkg.childPrice },
      },
      gateId: p.gateId,
      gateLocation: p.gateLocation,
    })),
  };
}
