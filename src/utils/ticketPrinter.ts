/* ──────────────────────────────────────────────────────────
   Zebra ZPL Bilet Yazdırma Modülü
   
   Zebra ZD220-203dpi ZPL yazıcıya bilet basar.
   pos_bridge.py /print endpoint'ini kullanır.
   
   Atlantis PySide6 GUI formatı (sales_window.py _generate_new_zpl):
   Etiket fiziksel boyut: 69mm × 101mm
   PW = 552 dot (69×8), LL = 808 dot (101×8) @ 203dpi
   Metin yönü: ^A0B (270° döndürülmüş / dikey baskı)
   QR: ortada (qr_size=6), tarih QR üstünde, geçerlilik QR altında
   Kategori/paket: sağ üstte ^FT ile
   ────────────────────────────────────────────────────────── */

import type { IntegrationSettings } from '@/types/atlantis';

// ── Bilet Verileri ────────────────────────────────────────

export interface TicketPrintData {
  ticketId: number;                // DB ticket ID (Tickets.Id)
  terminalRecordId: number;        // İşlem no (TerminalRecords.Id)
  packageName: string;             // Paket adı: "M.Y", "Visitor", "Ç.XD+WP"
  ticketType: 'ADU' | 'CHL' | 'COMP';
  kasaId: 'wildpark' | 'sinema' | 'face2face';
  kasaLabel: string;               // "WILDPARK", "XD SİNEMA", "FACE2FACE"
  products: string[];              // ["WILDPARK", "CINEMA"] (combo ise çoklu)
  price: number;                   // Birim fiyat
  currency: string;                // "TL", "USD", "EUR"
  personnelName: string;           // Satış yapan personel
  date: string;                    // Tarih: "04.04.2026"
  time: string;                    // Saat: "14:30"
  groupIndex?: number;             // Grup içi sıra (1/3, 2/3...)
  groupTotal?: number;             // Grup toplam kişi sayısı
}

// ── ZPL Template Oluşturma ────────────────────────────────

const KASA_LABELS: Record<string, string> = {
  wildpark: 'WILDPARK',
  sinema: 'XD SINEMA',
  face2face: 'FACE2FACE',
};

const TICKET_TYPE_LABELS: Record<string, string> = {
  ADU: 'YETISKIN',
  CHL: 'COCUK',
  COMP: 'UCRETSIZ',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  TL: 'TL',
  USD: '$',
  EUR: 'EUR',
};

/**
 * Türkçe karakterleri ZPL uyumlu ASCII'ye çevir (büyük harf)
 */
function simpleTr(text: string): string {
  return text.toUpperCase()
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ş/g, 'S')
    .replace(/İ/g, 'I')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C');
}

/**
 * Tek bir bilet için ZPL kodu üret
 * 
 * Atlantis gerçek bilet çıktısına birebir uyumlu:
 * - Etiket: 69mm × 101mm → PW=552, LL=808 @ 203dpi (8 dot/mm)
 * - Metin: ^A0B (270° döndürülmüş / dikey baskı)
 * 
 * Fiziksel çıktıdaki düzen (kağıt yatay tutulunca):
 * ┌──────────────────────────────────────────┐
 * │  04.04.2026              ADU             │  ← tarih üst-orta, tip sağ üst
 * │                          2/2             │  ← grup bilgisi tip altında
 * │  MUNFERIT                                │  ← kategori sol
 * │  M.Y.                                    │  ← paket sol, kategori altı
 * │           ┌────────┐                     │
 * │   (logo)  │ QR KOD │  3CP               │  ← QR ortada, yanında kısa no
 * │           └────────┘                     │
 * │  CINEMA ENTRANCE  09:00 TO 23:00         │  ← geçerlilik metni
 * │  f @ / wildparkantalya                   │  ← sosyal medya (yazıcı sabit)
 * │  Lütfen ziyaretiniz boyunca...           │  ← uyarı (yazıcı sabit)
 * └──────────────────────────────────────────┘
 */
function generateTicketZPL(ticket: TicketPrintData): string {
  const kasaLabel = KASA_LABELS[ticket.kasaId] || ticket.kasaId.toUpperCase();
  const typeLabel = TICKET_TYPE_LABELS[ticket.ticketType] || ticket.ticketType;
  const currSymbol = CURRENCY_SYMBOLS[ticket.currency] || ticket.currency;
  
  // Grup bilgisi: "2/2"
  const groupInfo = ticket.groupIndex && ticket.groupTotal 
    ? `${ticket.groupIndex}/${ticket.groupTotal}` 
    : '';

  const qrData = ticket.ticketId.toString();

  // Türkçe -> ASCII
  const kategoriZpl = simpleTr(kasaLabel);
  const paketZpl = simpleTr(ticket.packageName);
  const typeZpl = simpleTr(typeLabel);  // ADU / YETISKIN / COCUK

  // Ürün geçerlilik metni oluştur
  // Eski formatta: "CINEMA ENTRANCE  09:00 TO 23:00"
  const productsValidity = ticket.products.map(p => 
    `${simpleTr(p)} ENTRANCE  09:00 TO 23:00`
  ).join('\\&');  // ZPL satır sonu \\& ile

  // ── Boyutlar (69mm×101mm, 8 dot/mm) ──
  const ETIKET_GENISLIGI_MM = 69;
  const ETIKET_UZUNLUGU_MM = 101;
  const DOTS_PER_MM = 8;
  const zplPW = ETIKET_GENISLIGI_MM * DOTS_PER_MM;   // 552
  const zplLL = ETIKET_UZUNLUGU_MM * DOTS_PER_MM;    // 808

  // ── QR Kod (ortada) ──
  const qrSize = 6;
  const qrApproxDots = qrSize * 25;  // ~150 dot
  const qrX = Math.max(10, Math.floor(zplPW / 2 - qrApproxDots / 2));
  const qrY = Math.max(10, Math.floor(zplLL / 2 - qrApproxDots / 2));

  // ── Tarih — sadece gün, saat YOK (QR üstünde, 270°) ──
  // İnce font: width < height (kalın değil)
  const dateFontH = 28;
  const dateFontW = 20;
  const dateX = qrX - dateFontH - 40;              // QR'ın 40dot üstü
  const dateOnlyText = ticket.date;                  // "04.04.2026" (saatsiz)
  const dateTextWidthDots = dateOnlyText.length * dateFontW;
  const dateRightMargin = 150;
  const dateY = Math.max(10, zplLL - dateRightMargin - dateTextWidthDots);

  // ── Tip etiketi: "ADU" — tarihle aynı seviye, SOL taraf (270°: küçük Y=sol) ──
  const typeFontH = 32;
  const typeFontW = 24;
  const typeX = dateX;                               // Tarihle aynı dikey seviye
  const typeY = 50;                                  // Sol kenarda

  // ── Grup bilgisi: "2/2" — tip altında, sol taraf (270°) ──
  const grpFontH = 24;
  const grpFontW = 18;
  const grpX = typeX + typeFontH + 5;               // Tip'in altında
  const grpY = 50;                                   // Sol kenarda

  // ── Kategori — tarih seviyesinde, SAĞ taraf (270°: büyük Y=sağ) ──
  // Tarihle aynı X seviyesi (logodan yukarıda)
  const catFontH = 26;
  const catFontW = 20;
  const catX = dateX + 2;                            // Tarihle neredeyse aynı seviye
  const catStartY = 50;                              // Sol kenardan başla (^FO = sol hizalı)

  // ── Paket (kategori altında, aynı sol hiza, 270°) ──
  const pkgFontH = 24;
  const pkgFontW = 18;
  const pkgX = catX + catFontH + 6;                  // Kategori altında
  const pkgStartY = catStartY;                       // Aynı sol hizada!

  // ── Geçerlilik Metni (QR altında, 270°, Field Block) ──
  const validityFontH = 20;
  const validityFontW = 16;
  const validityX = qrX + qrApproxDots + 30;        // QR altında (dikeyde)
  const fbWidth = zplLL - 100;
  const validityY = Math.max(10, Math.floor((zplLL - fbWidth) / 2));

  // ── ZPL Komutu ──
  const zpl = `^XA
^CI28
^PW${zplPW}
^LL${zplLL}
^LH0,0
^FO${typeX},${typeY}^A0B,${typeFontH},${typeFontW}^FD${typeZpl}^FS
^FO${grpX},${grpY}^A0B,${grpFontH},${grpFontW}^FD${groupInfo}^FS
^FO${dateX},${dateY}^A0B,${dateFontH},${dateFontW}^FD${dateOnlyText}^FS
^FO${catX},${catStartY}^A0B,${catFontH},${catFontW}^FD${kategoriZpl}^FS
^FO${pkgX},${pkgStartY}^A0B,${pkgFontH},${pkgFontW}^FD${paketZpl}^FS
^FO${qrX},${qrY}^BQN,2,${qrSize}^FDQA,${qrData}^FS
^FO${validityX},${validityY}^A0B,${validityFontH},${validityFontW}^FB${fbWidth},4,5,C,0^FD${productsValidity}^FS
^XZ`;

  return zpl;
}

// ── Yazdırma Fonksiyonları ────────────────────────────────

function getSettings(): IntegrationSettings | null {
  try {
    const stored = localStorage.getItem('integrationSettings');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return null;
}

/**
 * Bridge'e ZPL gönder, yazıcıdan çıktı al
 */
async function sendToPrinter(zplData: string, printerName: string, bridgeUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${bridgeUrl}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zpl: zplData,
        printer: printerName,
      }),
    });
    
    const result = await response.json();
    return result;
  } catch (error: any) {
    return { success: false, error: `Yazıcı bağlantı hatası: ${error.message}` };
  }
}

/**
 * Satış sonrası biletleri yazdır
 * 
 * @param tickets - Yazdırılacak bilet verileri
 * @returns Yazdırma sonucu
 */
export async function printTickets(tickets: TicketPrintData[]): Promise<{
  success: boolean;
  printed: number;
  failed: number;
  errors: string[];
}> {
  const settings = getSettings();
  
  if (!settings?.printer?.enabled) {
    return { success: true, printed: 0, failed: 0, errors: ['Yazıcı devre dışı'] };
  }

  const printerName = settings.printer.name;
  const bridgeUrl = `http://${settings.bridge.host}:${settings.bridge.port}`;
  
  let printed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const ticket of tickets) {
    const zpl = generateTicketZPL(ticket);
    const result = await sendToPrinter(zpl, printerName, bridgeUrl);
    
    if (result.success) {
      printed++;
    } else {
      failed++;
      errors.push(`Bilet ${ticket.ticketId}: ${result.error}`);
    }
  }

  return {
    success: failed === 0,
    printed,
    failed,
    errors,
  };
}

/**
 * Bridge satış sonucundan bilet print verilerini oluştur
 */
export function buildTicketPrintData(
  saleResult: {
    terminalRecordId: number;
    ticketIds: number[];
    ticketGroupMap?: Record<string, number[]>;
  },
  request: {
    packageName: string;
    kasaId: 'wildpark' | 'sinema' | 'face2face';
    personnelName: string;
    adultQty: number;
    childQty: number;
    compQty?: number;
    products: string[];          // Ürün adları: ["WILDPARK", "CINEMA"]
    adultPrice: number;
    childPrice: number;
    currency: string;
    isFree?: boolean;
  },
): TicketPrintData[] {
  const now = new Date();
  const dateStr = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const kasaLabel = KASA_LABELS[request.kasaId] || request.kasaId.toUpperCase();
  
  const printData: TicketPrintData[] = [];
  
  // ticketGroupMap kullanarak biletleri grupla
  // Her group = 1 kişi (combo'da birden fazla ticket aynı grupta)
  const groupMap = saleResult.ticketGroupMap || {};
  const groupKeys = Object.keys(groupMap).sort((a, b) => parseInt(a) - parseInt(b));
  
  if (groupKeys.length > 0) {
    // GroupMap varsa, her grup için 1 bilet bas (ilk ticket ID'yi kullan)
    let personIndex = 0;
    const totalPersons = request.adultQty + request.childQty + (request.compQty || 0);
    
    for (const groupKey of groupKeys) {
      personIndex++;
      const ticketIdsInGroup = groupMap[groupKey];
      const mainTicketId = ticketIdsInGroup[0]; // Grubun ilk bilet ID'si
      
      // Kişi tipi belirle
      let ticketType: 'ADU' | 'CHL' | 'COMP';
      let price: number;
      
      if (request.isFree) {
        ticketType = 'COMP';
        price = 0;
      } else if (personIndex <= request.adultQty) {
        ticketType = 'ADU';
        price = request.adultPrice;
      } else if (personIndex <= request.adultQty + request.childQty) {
        ticketType = 'CHL';
        price = request.childPrice;
      } else {
        ticketType = 'COMP';
        price = 0;
      }
      
      printData.push({
        ticketId: mainTicketId,
        terminalRecordId: saleResult.terminalRecordId,
        packageName: request.packageName,
        ticketType,
        kasaId: request.kasaId,
        kasaLabel,
        products: request.products,
        price,
        currency: request.currency,
        personnelName: request.personnelName,
        date: dateStr,
        time: timeStr,
        groupIndex: personIndex,
        groupTotal: totalPersons,
      });
    }
  } else {
    // GroupMap yoksa, her ticket ID için ayrı bilet bas
    const totalPersons = saleResult.ticketIds.length;
    
    saleResult.ticketIds.forEach((ticketId, idx) => {
      let ticketType: 'ADU' | 'CHL' | 'COMP';
      let price: number;
      
      if (request.isFree) {
        ticketType = 'COMP';
        price = 0;
      } else if (idx < request.adultQty) {
        ticketType = 'ADU';
        price = request.adultPrice;
      } else if (idx < request.adultQty + request.childQty) {
        ticketType = 'CHL';
        price = request.childPrice;
      } else {
        ticketType = 'COMP';
        price = 0;
      }
      
      printData.push({
        ticketId,
        terminalRecordId: saleResult.terminalRecordId,
        packageName: request.packageName,
        ticketType,
        kasaId: request.kasaId,
        kasaLabel,
        products: request.products,
        price,
        currency: request.currency,
        personnelName: request.personnelName,
        date: dateStr,
        time: timeStr,
        groupIndex: idx + 1,
        groupTotal: totalPersons,
      });
    });
  }
  
  return printData;
}

/**
 * Test yazdırma — tek bir test bileti bas
 */
export async function printTestTicket(): Promise<{ success: boolean; error?: string }> {
  const testTicket: TicketPrintData = {
    ticketId: 99999999,
    terminalRecordId: 99999,
    packageName: 'TEST BILET',
    ticketType: 'ADU',
    kasaId: 'sinema',
    kasaLabel: 'XD SINEMA',
    products: ['CINEMA'],
    price: 325,
    currency: 'TL',
    personnelName: 'test',
    date: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    groupIndex: 1,
    groupTotal: 1,
  };

  const result = await printTickets([testTicket]);
  if (result.success) {
    return { success: true };
  }
  return { success: false, error: result.errors.join(', ') };
}
