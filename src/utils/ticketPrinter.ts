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
  ADU: 'ADU',
  CHL: 'CHL',
  COMP: 'COMP',
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
  const typeLabel = TICKET_TYPE_LABELS[ticket.ticketType] || ticket.ticketType;
  
  // Grup bilgisi: tip kendi içinde numaralanır (ADU 1/2, CHL 1/1)
  const groupInfo = ticket.groupIndex && ticket.groupTotal 
    ? `${typeLabel} ${ticket.groupIndex}/${ticket.groupTotal}` 
    : typeLabel;

  const qrData = ticket.ticketId.toString();

  // Türkçe -> ASCII
  const kategoriZpl = simpleTr(ticket.kasaLabel);
  // Paket adından fiyat bilgisini temizle (ör: "Acenta $12" → "ACENTA")
  const cleanName = ticket.packageName.replace(/\s*[\$€]\s*\d+/g, '').replace(/\s+\d+\s*TL/gi, '');
  const paketZpl = simpleTr(cleanName);

  // Ürün entrance bilgileri (ayrı satırlar)
  const entranceLines = ticket.products.map(p => {
    const upper = simpleTr(p);
    return upper.includes('ENTRANCE') ? upper : `${upper} ENTRANCE`;
  });
  const timeText = '09:00 TO 20:00';

  // ── ZPL Komutu (onaylanan final layout) ──
  // PW=552 (69mm), LL=808 (101mm), ^A0B (270° döndürülmüş)
  // Tüm fontlar aynı: TT0003M_ (TrueType)
  let zpl = `^XA
^PW552
^LL808
^LH0,0
^CI28
^FO35,50^A@B,36,34,E:TT0003M_.FNT^FD${groupInfo}^FS
^FT120,748^A@B,28,28,E:TT0003M_.FNT^FD${kategoriZpl}^FS
^FT158,748^A@B,28,28,E:TT0003M_.FNT^FD${paketZpl}^FS
^FO105,338^A@B,38,32,E:TT0003M_.FNT^FD${ticket.date}^FS
^FO201,329^BQN,2,6^FDQA,${qrData}^FS`;

  // Entrance satırları — QR'dan uzak, saat ile entrance yakın
  const entranceStartX = 390;
  const entranceSpacing = 26;
  entranceLines.forEach((line, i) => {
    const x = entranceStartX + (i * entranceSpacing);
    zpl += `\n^FT${x},580^A@B,24,20,E:TT0003M_.FNT^FD${line}^FS`;
    zpl += `\n^FT${x},350^A@B,24,20,E:TT0003M_.FNT^FD${timeText}^FS`;
  });

  zpl += '\n^XZ';
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
    let aduIndex = 0;
    let chlIndex = 0;
    let compIndex = 0;
    
    for (const groupKey of groupKeys) {
      personIndex++;
      const ticketIdsInGroup = groupMap[groupKey];
      const mainTicketId = ticketIdsInGroup[0]; // Grubun ilk bilet ID'si
      
      // Kişi tipi belirle
      let ticketType: 'ADU' | 'CHL' | 'COMP';
      let price: number;
      let typeIndex: number;
      let typeTotal: number;
      
      if (request.isFree) {
        ticketType = 'COMP';
        price = 0;
        compIndex++;
        typeIndex = compIndex;
        typeTotal = request.compQty || (request.adultQty + request.childQty);
      } else if (personIndex <= request.adultQty) {
        ticketType = 'ADU';
        price = request.adultPrice;
        aduIndex++;
        typeIndex = aduIndex;
        typeTotal = request.adultQty;
      } else if (personIndex <= request.adultQty + request.childQty) {
        ticketType = 'CHL';
        price = request.childPrice;
        chlIndex++;
        typeIndex = chlIndex;
        typeTotal = request.childQty;
      } else {
        ticketType = 'COMP';
        price = 0;
        compIndex++;
        typeIndex = compIndex;
        typeTotal = request.compQty || 0;
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
        groupIndex: typeIndex,
        groupTotal: typeTotal,
      });
    }
  } else {
    // GroupMap yoksa — combo paketlerde ürün sayısına göre grupla
    // Combo3: 3 ürün → her 3 ticketId = 1 kişi, Combo2: her 2 ticketId = 1 kişi
    const productsPerPerson = request.products.length || 1;
    const totalPersons = Math.floor(saleResult.ticketIds.length / productsPerPerson);
    
    let aduIndex = 0;
    let chlIndex = 0;
    let compIndex = 0;
    
    for (let personIdx = 0; personIdx < totalPersons; personIdx++) {
      // Her kişinin ilk ticket ID'sini al (combo'da geri kalanları atla)
      const ticketId = saleResult.ticketIds[personIdx * productsPerPerson];
      
      let ticketType: 'ADU' | 'CHL' | 'COMP';
      let price: number;
      let typeIndex: number;
      let typeTotal: number;
      
      if (request.isFree) {
        ticketType = 'COMP';
        price = 0;
        compIndex++;
        typeIndex = compIndex;
        typeTotal = totalPersons;
      } else if (personIdx < request.adultQty) {
        ticketType = 'ADU';
        price = request.adultPrice;
        aduIndex++;
        typeIndex = aduIndex;
        typeTotal = request.adultQty;
      } else if (personIdx < request.adultQty + request.childQty) {
        ticketType = 'CHL';
        price = request.childPrice;
        chlIndex++;
        typeIndex = chlIndex;
        typeTotal = request.childQty;
      } else {
        ticketType = 'COMP';
        price = 0;
        compIndex++;
        typeIndex = compIndex;
        typeTotal = (request.compQty || 0);
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
        groupIndex: typeIndex,
        groupTotal: typeTotal,
      });
    }
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
