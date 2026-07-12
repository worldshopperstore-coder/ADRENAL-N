import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Share2, FileSpreadsheet, Trash2, Printer, FileText, X } from 'lucide-react';
import { getUserSession, getPersonnelId, getPersonnelName } from '@/utils/session';
import {
  loadCrossSalesFromFirebase,
  saveCrossSalesToFirebase,
  subscribeCrossSales
} from '@/utils/salesDB';
import { processActiveRefund, checkIntegrationReady } from '@/utils/saleFlow';
import { printTickets, buildTicketPrintData } from '@/utils/ticketPrinter';

interface CrossSale {
  id: string;
  packageName: string;
  category?: string;
  adultQty: number;
  childQty: number;
  infantQty?: number;
  currency: string;
  paymentType: string;
  total: number;
  kkTl: number;
  cashTl: number;
  cashUsd: number;
  cashEur: number;
  timestamp: string;
  isRefund?: boolean;
  refundOfSaleId?: string;
  refundReason?: string;
  kkRefundTxId?: string;
  personnelId?: string;
  personnelName?: string;
  // Atlantis DB referansları (aktif mod)
  terminalRecordId?: number;
  ticketIds?: number[];
  ticketGroupMap?: Record<string, number[]>;
  products?: string[];
}

export interface CrossSalesTabHandle {
  exportReport: () => void;
}

const CrossSalesTab = forwardRef<CrossSalesTabHandle>(function CrossSalesTab(_props, ref) {
  const [crossSales, setCrossSales] = useState<CrossSale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // İade
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundTargetSale, setRefundTargetSale] = useState<CrossSale | null>(null);
  const [refundInfo, setRefundInfo] = useState<{ reason: string; refundPaymentType: 'Nakit' | 'Kredi Kartı'; kkRefundTxId: string }>({ reason: '', refundPaymentType: 'Nakit', kkRefundTxId: '' });
  const [refundProcessing, setRefundProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [integrationActive, setIntegrationActive] = useState(false);

  useEffect(() => {
    checkIntegrationReady().then(status => setIntegrationActive(status.enabled));
  }, []);

  // Firebase'den çapraz satışları yükle
  useEffect(() => {
    const loadCrossSales = async () => {
      setIsLoading(true);
      const loaded = await loadCrossSalesFromFirebase();
      setCrossSales(loaded);
      setIsLoading(false);
    };
    loadCrossSales();
    
    // Real-time güncellemeleri dinle
    const unsubscribe = subscribeCrossSales((updated) => {
      setCrossSales(updated);
    });
    
    return () => unsubscribe();
  }, []);

  // Çapraz satışlar değiştiğinde Firebase'e kaydet
  useEffect(() => {
    if (!isLoading) {
      saveCrossSalesToFirebase(crossSales);
    }
  }, [crossSales, isLoading]);

  const handleDelete = (id: string) => {
    if (!window.confirm('Bu çapraz satış kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) return;
    setCrossSales(crossSales.filter(s => s.id !== id));
  };

  const getRates = () => {
    const session = getUserSession();
    const kasaSettings = JSON.parse(localStorage.getItem(`kasaSettings_${session.kasa?.id}`) || '{}');
    return { usdRate: kasaSettings.usdRate || 30, eurRate: kasaSettings.eurRate || 50.4877 };
  };

  const calculateSaleDistribution = (
    amount: number,
    currency: string,
    paymentType: string,
    usdRate: number,
    eurRate: number,
  ) => {
    let kkTl = 0, cashTl = 0, cashUsd = 0, cashEur = 0;
    if (paymentType === 'Nakit') {
      if (currency === 'USD') cashUsd = amount;
      else if (currency === 'EUR') cashEur = amount;
      else cashTl = amount;
    } else if (paymentType === 'Kredi Kartı') {
      if (currency === 'USD') kkTl = amount * usdRate;
      else if (currency === 'EUR') kkTl = amount * eurRate;
      else kkTl = amount;
    }
    return { kkTl, cashTl, cashUsd, cashEur };
  };

  // Bilet tekrar basma
  const handleReprintTicket = async (sale: CrossSale) => {
    if (!sale.terminalRecordId || !sale.ticketIds || sale.ticketIds.length === 0) {
      alert('⚠️ Bu satışta bilet bilgisi bulunamadı.');
      return;
    }
    try {
      const session = getUserSession();
      const kasaId = session.kasa?.id || 'sinema';
      const kasaLabel = kasaId === 'wildpark' ? 'WILDPARK ENTRANCE' : kasaId === 'sinema' ? 'CINEMA ENTRANCE' : 'FACE2FACE ENTRANCE';
      const productsForPrint = sale.products && sale.products.length > 0 ? sale.products : [kasaLabel];
      const isFree = sale.total === 0 && sale.category === 'Ücretsiz';

      const printData = buildTicketPrintData(
        {
          terminalRecordId: sale.terminalRecordId,
          ticketIds: sale.ticketIds,
          ticketGroupMap: sale.ticketGroupMap,
        },
        {
          packageName: sale.packageName,
          kasaId: kasaId as any,
          personnelName: sale.personnelName || getPersonnelName(),
          adultQty: sale.adultQty,
          childQty: sale.childQty,
          infantQty: sale.infantQty,
          products: productsForPrint,
          adultPrice: 0,
          childPrice: 0,
          currency: sale.currency === 'KK' ? 'TL' : (sale.currency as any),
          isFree,
        },
      );

      const pResult = await printTickets(printData);
      if (pResult.success) {
        alert(`✅ ${pResult.printed} bilet tekrar basıldı!`);
      } else {
        alert(`⚠️ Yazdırma: ${pResult.printed} basıldı, ${pResult.failed} başarısız\n${pResult.errors.join('\n')}`);
      }
    } catch (err: any) {
      alert(`❌ Yazdırma hatası: ${err.message}`);
    }
  };

  // İade işlemi
  const handleRefund = async () => {
    if (!refundTargetSale || !refundInfo.reason.trim()) {
      setErrorMessage('Lütfen iade nedenini yazınız');
      return;
    }
    if (refundInfo.refundPaymentType === 'Kredi Kartı' && !refundInfo.kkRefundTxId.trim()) {
      setErrorMessage('Kredi kartı iadelerinde işlem numarası zorunludur');
      return;
    }
    setErrorMessage('');
    setRefundProcessing(true);

    const sale = refundTargetSale;
    const { usdRate, eurRate } = getRates();

    // ── Atlantis DB İade (aktif mod satışı ise) ──────────
    let atlantisRefundOk = false;
    let atlantisRefundError = '';
    if (integrationActive && sale.terminalRecordId) {
      try {
        const refundResult = await processActiveRefund(sale.terminalRecordId, getPersonnelName());
        if (refundResult.success) {
          atlantisRefundOk = true;
        } else {
          atlantisRefundError = refundResult.error || 'Bilinmeyen DB iade hatası';
        }
      } catch (err) {
        atlantisRefundError = err instanceof Error ? err.message : String(err);
      }
    }

    let refundKkTl: number, refundCashTl: number, refundCashUsd: number, refundCashEur: number;
    if (sale.paymentType === 'Çoklu') {
      refundKkTl = -Math.abs(sale.kkTl);
      refundCashTl = -Math.abs(sale.cashTl);
      refundCashUsd = -Math.abs(sale.cashUsd);
      refundCashEur = -Math.abs(sale.cashEur);
    } else {
      const refundDist = calculateSaleDistribution(Math.abs(sale.total), sale.currency, refundInfo.refundPaymentType, usdRate, eurRate);
      refundKkTl = -refundDist.kkTl;
      refundCashTl = -refundDist.cashTl;
      refundCashUsd = -refundDist.cashUsd;
      refundCashEur = -refundDist.cashEur;
    }

    const refundSale: CrossSale = {
      id: Date.now().toString(),
      packageName: sale.packageName,
      category: sale.category,
      adultQty: sale.adultQty,
      childQty: sale.childQty,
      currency: sale.currency,
      paymentType: sale.paymentType === 'Çoklu' ? 'Çoklu' : refundInfo.refundPaymentType,
      total: -Math.abs(sale.total),
      kkTl: refundKkTl,
      cashTl: refundCashTl,
      cashUsd: refundCashUsd,
      cashEur: refundCashEur,
      timestamp: new Date().toISOString(),
      isRefund: true,
      refundOfSaleId: sale.id,
      refundReason: refundInfo.reason.trim(),
      kkRefundTxId: refundInfo.refundPaymentType === 'Kredi Kartı' || sale.paymentType === 'Çoklu' ? refundInfo.kkRefundTxId.trim() || undefined : undefined,
      personnelId: getPersonnelId(),
      personnelName: getPersonnelName(),
    };

    setCrossSales((prev) => [...prev, refundSale]);
    generateRefundReport(sale, refundSale, refundInfo.reason, refundInfo.refundPaymentType === 'Kredi Kartı' ? refundInfo.kkRefundTxId : '', atlantisRefundOk, atlantisRefundError);
    setRefundProcessing(false);
    setShowRefundModal(false);
    setRefundTargetSale(null);
    setRefundInfo({ reason: '', refundPaymentType: 'Nakit', kkRefundTxId: '' });
  };

  // İade tutanağı HTML/PDF
  const generateRefundReport = (originalSale: CrossSale, refundSale: CrossSale, reason: string, kkTxId: string = '', atlantisOk: boolean = false, atlantisError: string = '') => {
    const session = getUserSession();
    const userName = session.personnel?.fullName || 'Kullanıcı';
    const kasaName = session.kasa?.name || 'Kasa';
    const currentDate = new Date().toLocaleDateString('tr-TR');
    const currentTime = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    const atlantisRows = originalSale.terminalRecordId ? `
    <tr><td>Kayıt No</td><td style="font-weight:700">#${originalSale.terminalRecordId}</td></tr>
    <tr><td>Sistem İade</td><td style="color:${atlantisOk ? '#2e7d32' : atlantisError ? '#c00' : '#888'};font-weight:700">${atlantisOk ? '✅ Başarılı' : atlantisError ? '❌ Hata: ' + atlantisError : '— Yapılmadı'}</td></tr>` : '';

    const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8">
<title>Çapraz Satış İade Tutanağı - ${currentDate}</title>
<style>
  @page { size: A4; margin: 20mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; background: #fff; padding: 30px; max-width: 700px; margin: 0 auto; }
  .header { text-align: center; border-bottom: 3px solid #c00; padding-bottom: 15px; margin-bottom: 25px; }
  .header h1 { font-size: 22px; color: #c00; margin-bottom: 5px; }
  .header .meta { font-size: 12px; color: #666; }
  .section { margin-bottom: 20px; }
  .section h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; color: #444; }
  .info-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
  .info-table td { padding: 8px 12px; border: 1px solid #ddd; font-size: 12px; }
  .info-table td:first-child { background: #f5f5f5; font-weight: 600; width: 40%; color: #555; }
  .reason-box { background: #fff8f8; border: 2px solid #e0c0c0; border-radius: 8px; padding: 15px; margin: 15px 0; }
  .reason-box h3 { font-size: 12px; color: #c00; margin-bottom: 8px; text-transform: uppercase; }
  .reason-box p { font-size: 13px; line-height: 1.6; color: #333; }
  .signatures { display: flex; justify-content: space-between; margin-top: 50px; padding-top: 15px; }
  .sig-box { text-align: center; width: 45%; }
  .sig-box .line { border-top: 1px solid #999; margin-top: 40px; padding-top: 5px; font-size: 11px; color: #666; }
  .footer { margin-top: 30px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
  .print-btn { display: block; margin: 25px auto; padding: 12px 40px; background: #c00; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
  .print-btn:hover { background: #a00; }
  .stamp { text-align: center; margin: 15px 0; }
  .stamp span { display: inline-block; border: 2px solid #c00; color: #c00; padding: 5px 20px; border-radius: 4px; font-weight: 700; font-size: 14px; transform: rotate(-5deg); }
</style></head><body>
<div class="header">
  <div style="font-size:24px;font-weight:900;font-style:italic;margin-bottom:4px"><span style="color:#f97316">adrenalin</span><span style="color:#fb923c">.</span></div>
  <h1>İADE TUTANAĞI (Çapraz Satış)</h1>
  <div class="meta"><strong>${kasaName}</strong> — Tarih: ${currentDate} — Saat: ${currentTime}</div>
</div>
<div class="stamp"><span>İADE</span></div>
<div class="section">
  <h2>Orijinal Satış Bilgileri</h2>
  <table class="info-table">
    <tr><td>Paket Adı</td><td>${originalSale.packageName}</td></tr>
    <tr><td>Kategori</td><td>${originalSale.category || '-'}</td></tr>
    <tr><td>Yetişkin / Çocuk</td><td>${originalSale.adultQty} Yetişkin / ${originalSale.childQty} Çocuk</td></tr>
    <tr><td>Para Birimi</td><td>${originalSale.currency}</td></tr>
    <tr><td>Ödeme Tipi (Orijinal)</td><td>${originalSale.paymentType}</td></tr>
    <tr><td>Toplam Tutar</td><td><strong>${Math.abs(originalSale.total).toFixed(2)} ${originalSale.currency === 'TL' || originalSale.currency === 'KK' ? '₺' : originalSale.currency === 'USD' ? '$' : '€'}</strong></td></tr>
    <tr><td>Satış Tarihi</td><td>${new Date(originalSale.timestamp).toLocaleString('tr-TR')}</td></tr>
  </table>
</div>
<div class="section">
  <h2>İade Bilgileri</h2>
  <table class="info-table">
    <tr><td>İade Ödeme Şekli</td><td><strong>${refundSale.paymentType}</strong></td></tr>
    ${kkTxId ? `<tr><td>Kredi Kartı İade İşlem No</td><td style="font-weight:700;color:#1565c0">${kkTxId}</td></tr>` : ''}
    <tr><td>İade Tutarı</td><td style="color:#c00;font-weight:700">${Math.abs(refundSale.total).toFixed(2)} ${originalSale.currency === 'TL' || originalSale.currency === 'KK' ? '₺' : originalSale.currency === 'USD' ? '$' : '€'}</td></tr>
    <tr><td>İşlemi Yapan (Kasa Personeli)</td><td>${userName} — ${kasaName}</td></tr>
    <tr><td>İşlem Tarihi / Saati</td><td>${currentDate} - ${currentTime}</td></tr>
    ${atlantisRows}
  </table>
</div>
<div class="reason-box">
  <h3>İade Nedeni</h3>
  <p>${reason}</p>
</div>
<div class="signatures">
  <div class="sig-box"><div class="line">İşletme Müdür / Emre Ozan</div></div>
  <div class="sig-box"><div class="line">Kasa Personeli / ${userName} (${kasaName})</div></div>
</div>
<button class="print-btn no-print" onclick="window.print()">🖨️ Yazdır / PDF Kaydet</button>
<div class="footer">Adrenalin Satış Sistemi — Çapraz Satış İade Tutanağı — ${kasaName} — ${currentDate}</div>
</body></html>`;

    const w = window.open('', 'reportWindow', 'width=850,height=700,scrollbars=yes,resizable=yes');
    if (w) { w.document.write(html); w.document.close(); }
  };

  // ==================== ŞİRKET TESPİT FONKSİYONU ====================

  // Paket adından hangi mekanların dahil olduğunu tespit et
  const detectVenues = (packageName: string): string[] => {
    const name = packageName.toUpperCase();
    const venues: string[] = [];
    if (name.includes('XD') || name.includes('SİNEMA') || name.includes('SINEMA')) venues.push('sinema');
    if (name.includes('WP') || name.includes('WILD')) venues.push('wildpark');
    if (name.includes('F2F') || name.includes('FACE')) venues.push('face2face');
    // MARKET3 = 3lü paket (tüm mekanlar)
    if (name.includes('MARKET3') || name.includes('MARKET 3')) {
      if (!venues.includes('sinema')) venues.push('sinema');
      if (!venues.includes('wildpark')) venues.push('wildpark');
      if (!venues.includes('face2face')) venues.push('face2face');
    }
    return venues;
  };

  // Şirket: Adrenalin (WP+Sinema) vs Pruva (F2F)
  const getCompany = (kasaId: string) => kasaId === 'face2face' ? 'Pruva' : 'Adrenalin';
  const VENUE_NAMES: Record<string, string> = { wildpark: 'WildPark', sinema: 'XD Sinema', face2face: 'Face2Face' };

  // Çapraz satış mutabakat hesaplaması
  const calculateReconciliation = () => {
    const session = getUserSession();
    const currentKasa = session.kasa?.id || '';
    const currentCompany = getCompany(currentKasa);

    // Satışları şirket bazında grupla
    const interCompany: { sale: CrossSale; targetVenues: string[]; involvesExternalCompany: boolean }[] = [];

    crossSales.filter(s => !s.isRefund).forEach(sale => {
      const refundEntry = crossSales.find(r => r.isRefund && r.refundOfSaleId === sale.id);
      if (refundEntry) return; // İade edilmiş satışları atla

      const venues = detectVenues(sale.packageName);
      const targetVenues = venues.filter(v => v !== currentKasa);
      const involvesF2F = venues.includes('face2face');
      const involvesAdrenalin = venues.includes('wildpark') || venues.includes('sinema');
      const involvesExternalCompany = currentCompany === 'Adrenalin' ? involvesF2F : involvesAdrenalin;

      if (targetVenues.length > 0) {
        interCompany.push({ sale, targetVenues, involvesExternalCompany });
      }
    });

    // Pruva ile olan işlemler (fatura gerektiren)
    const pruvaTransactions = interCompany.filter(t => t.involvesExternalCompany);
    // Adrenalin iç işlemler (fatura gerektirmeyen)
    const internalTransactions = interCompany.filter(t => !t.involvesExternalCompany);

    const pruvaTotals = {
      count: pruvaTransactions.length,
      kkTl: pruvaTransactions.reduce((s, t) => s + t.sale.kkTl, 0),
      cashTl: pruvaTransactions.reduce((s, t) => s + t.sale.cashTl, 0),
      cashUsd: pruvaTransactions.reduce((s, t) => s + t.sale.cashUsd, 0),
      cashEur: pruvaTransactions.reduce((s, t) => s + t.sale.cashEur, 0),
      pax: pruvaTransactions.reduce((s, t) => s + t.sale.adultQty + t.sale.childQty, 0),
    };

    const internalTotals = {
      count: internalTransactions.length,
      kkTl: internalTransactions.reduce((s, t) => s + t.sale.kkTl, 0),
      cashTl: internalTransactions.reduce((s, t) => s + t.sale.cashTl, 0),
      cashUsd: internalTransactions.reduce((s, t) => s + t.sale.cashUsd, 0),
      cashEur: internalTransactions.reduce((s, t) => s + t.sale.cashEur, 0),
      pax: internalTransactions.reduce((s, t) => s + t.sale.adultQty + t.sale.childQty, 0),
    };

    return { interCompany, pruvaTransactions, internalTransactions, pruvaTotals, internalTotals, currentKasa, currentCompany };
  };

  // ==================== HTML RAPOR ====================

  const generateHTMLReport = () => {
    const session = getUserSession();
    const userName = session.personnel?.fullName || 'Kullanıcı';
    const kasaName = session.kasa?.name || 'Kasa';
    const kasaId = session.kasa?.id || '';
    const kasaSettings = JSON.parse(localStorage.getItem(`kasaSettings_${kasaId}`) || '{}');
    const usdRate = kasaSettings.usdRate || 30;
    const eurRate = kasaSettings.eurRate || 50.4877;
    const currentDate = new Date().toLocaleDateString('tr-TR');
    const totals = getTotals();
    const cashTlTotal = totals.cashTl + (totals.cashUsd * usdRate) + (totals.cashEur * eurRate);
    const grandTotal = totals.kkTl + cashTlTotal;
    const totalPax = totals.totalAdult + totals.totalChild;

    const currentCompany = getCompany(kasaId);
    const salesRows = crossSales.filter(s => !s.isRefund).map((s, i) => {
      const refundEntry = crossSales.find(r => r.isRefund && r.refundOfSaleId === s.id);
      const isRefunded = !!refundEntry;
      const strikeStyle = isRefunded ? 'text-decoration:line-through;color:#999;' : '';
      const venues = detectVenues(s.packageName);
      const involvesF2F = venues.includes('face2face');
      const involvesAdrenalin = venues.includes('wildpark') || venues.includes('sinema');
      const isExternal = currentCompany === 'Adrenalin' ? involvesF2F : involvesAdrenalin;
      const companyBadge = isExternal
        ? `<span style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e;font-size:9px;padding:1px 5px;border-radius:3px;margin-right:4px;font-weight:700">FATURA</span>`
        : `<span style="background:#d1fae5;border:1px solid #10b981;color:#065f46;font-size:9px;padding:1px 5px;border-radius:3px;margin-right:4px;font-weight:700">İÇ</span>`;
      const targetVenueNames = venues.filter(v => v !== kasaId).map(v => VENUE_NAMES[v] || v).join(', ');
      return `
      <tr style="${isRefunded ? 'background:#fff0f0;' : (i % 2 === 0 ? 'background:#fafafa;' : '')}">
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:center">${i + 1}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0">
          ${isRefunded ? '<span style="background:#fee;border:1px solid #fcc;color:#c00;font-size:10px;padding:1px 5px;border-radius:3px;margin-right:5px;font-weight:600">İade Edildi</span>' : companyBadge}
          <span style="${strikeStyle}">${s.packageName}</span>
          <div style="font-size:9px;color:#888;margin-top:2px">→ ${targetVenueNames}</div>
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:center;${strikeStyle}">${s.adultQty}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:center;${strikeStyle}">${s.childQty}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:center">${s.paymentType === 'Kredi Kartı' ? 'Kredi Kartı' : 'Nakit'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:right;${strikeStyle}">${s.kkTl !== 0 ? s.kkTl.toFixed(2) : '-'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:right;${strikeStyle}">${s.cashTl !== 0 ? s.cashTl.toFixed(2) : '-'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:right;${strikeStyle}">${s.cashUsd !== 0 ? s.cashUsd.toFixed(2) : '-'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:right;${strikeStyle}">${s.cashEur !== 0 ? s.cashEur.toFixed(2) : '-'}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8">
<title>Çapraz Satış Raporu - ${kasaName} - ${currentDate}</title>
<style>
  @page { size: A4; margin: 15mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; background: #fff; padding: 20px; max-width: 820px; margin: 0 auto; }
  .header { border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 20px; }
  .header h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .header .meta { font-size: 12px; color: #666; }
  .header .meta span { margin-right: 15px; }
  .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px; }
  .info-box { border: 1px solid #ddd; border-radius: 6px; padding: 10px; }
  .info-box h3 { font-size: 11px; font-weight: 700; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
  .info-row .lbl { color: #666; }
  .info-row .val { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 15px; }
  th { background: #222; color: #fff; padding: 8px 10px; text-align: center; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
  th:nth-child(2) { text-align: left; }
  .totals-row td { background: #222; color: #fff; font-weight: 700; padding: 8px 10px; }
  .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #ddd; padding-top: 8px; }
  .print-btn { display: inline-block; margin: 10px 5px; padding: 10px 25px; background: #222; color: #fff; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
  .print-btn:hover { background: #444; }
</style></head><body>

<div class="header">
  <div style="font-size:24px;font-weight:900;font-style:italic;margin-bottom:4px"><span style="color:#f97316">adrenalin</span><span style="color:#fb923c">.</span></div>
  <h1>⇄ ÇAPRAZ SATIŞ RAPORU</h1>
  <div class="meta">
    <span><strong>${kasaName}</strong> (${currentCompany})</span>
    <span>Personel: ${userName}</span>
    <span>Tarih: ${currentDate}</span>
  </div>
</div>

<div class="info-grid">
  <div class="info-box">
    <h3>Günlük Kurlar</h3>
    <div class="info-row"><span class="lbl">USD Kuru</span><span class="val">${usdRate.toFixed(4)} ₺</span></div>
    <div class="info-row"><span class="lbl">EUR Kuru</span><span class="val">${eurRate.toFixed(4)} ₺</span></div>
    <div class="info-row"><span class="lbl">PAX</span><span class="val">${totals.totalAdult}Y + ${totals.totalChild}Ç = ${totalPax}</span></div>
  </div>
  <div class="info-box">
    <h3>Z Rapor Özeti</h3>
    <div class="info-row"><span class="lbl">Kredi Kartı</span><span class="val">${totals.kkTl.toFixed(2)} ₺</span></div>
    <div class="info-row"><span class="lbl">Nakit TL</span><span class="val">${totals.cashTl.toFixed(2)} ₺</span></div>
    <div class="info-row"><span class="lbl">Nakit USD</span><span class="val">${totals.cashUsd.toFixed(2)} $</span></div>
    <div class="info-row"><span class="lbl">Nakit EUR</span><span class="val">${totals.cashEur.toFixed(2)} €</span></div>
    <div class="info-row" style="border-top:1px solid #ddd;margin-top:4px;padding-top:4px;font-weight:700"><span class="lbl">Genel Toplam</span><span class="val">${grandTotal.toFixed(2)} ₺</span></div>
  </div>
</div>

<h2 style="font-size:14px;font-weight:700;margin-bottom:10px;border-bottom:1px solid #ddd;padding-bottom:6px">Satış Detayları</h2>
<table>
  <thead><tr>
    <th style="width:30px">#</th>
    <th style="text-align:left">Paket</th>
    <th>Y</th><th>Ç</th><th>Ödeme</th>
    <th style="text-align:right">Kredi Kartı</th>
    <th style="text-align:right">TL</th>
    <th style="text-align:right">USD</th>
    <th style="text-align:right">EUR</th>
  </tr></thead>
  <tbody>${salesRows}</tbody>
  <tfoot><tr class="totals-row">
    <td></td>
    <td style="text-align:left">TOPLAM</td>
    <td style="text-align:center">${totals.totalAdult}</td>
    <td style="text-align:center">${totals.totalChild}</td>
    <td></td>
    <td style="text-align:right">${totals.kkTl.toFixed(2)}</td>
    <td style="text-align:right">${totals.cashTl.toFixed(2)}</td>
    <td style="text-align:right">${totals.cashUsd.toFixed(2)}</td>
    <td style="text-align:right">${totals.cashEur.toFixed(2)}</td>
  </tr></tfoot>
</table>

<div style="text-align:center;margin-top:25px" class="no-print">
  <button class="print-btn" onclick="window.print()">🖨️ Yazdır</button>
</div>
<div class="footer">Adrenalin Satış Sistemi — Çapraz Satış Raporu — ${currentDate}</div>

</body></html>`;

    const w = window.open('', 'reportWindow', 'width=850,height=800,scrollbars=yes,resizable=yes');
    if (w) { w.document.write(html); w.document.close(); }
  };

  // ==================== EXCEL EXPORT ====================

  const exportToExcel = () => {
    const currentDate = new Date().toLocaleDateString('tr-TR');
    const session = getUserSession();
    const userName = session.personnel?.fullName || 'Kullanıcı';
    const kasaName = session.kasa?.name || 'Kasa';
    
    // Kurları localStorage'dan al
    const kasaSettings = JSON.parse(localStorage.getItem(`kasaSettings_${session.kasa?.id}`) || '{}');
    const usdRate = kasaSettings.usdRate || 30;
    const eurRate = kasaSettings.eurRate || 50.4877;
    
    const totals = getTotals();
    
    // Z Rapor hesaplamaları
    const cashTlTotal = totals.cashTl + (totals.cashUsd * usdRate) + (totals.cashEur * eurRate);
    const grandTotal = totals.kkTl + cashTlTotal;
    
    // Satır verilerini oluştur
    const dataRows = crossSales.map(sale => `<Row ss:Height="20">
      <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${sale.isRefund ? '↩ İade: ' : ''}${sale.packageName}</Data></Cell>
      <Cell ss:StyleID="DataCenter"><Data ss:Type="Number">${sale.adultQty}</Data></Cell>
      <Cell ss:StyleID="DataCenter"><Data ss:Type="Number">${sale.childQty}</Data></Cell>
      <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${sale.currency}</Data></Cell>
      <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${sale.paymentType}</Data></Cell>
      <Cell ss:StyleID="DataRight"><Data ss:Type="Number">${sale.total.toFixed(2)}</Data></Cell>
      <Cell ss:StyleID="DataRight"><Data ss:Type="${sale.kkTl !== 0 ? 'Number' : 'String'}">${sale.kkTl !== 0 ? sale.kkTl.toFixed(2) : '-'}</Data></Cell>
      <Cell ss:StyleID="DataRight"><Data ss:Type="${sale.cashTl !== 0 ? 'Number' : 'String'}">${sale.cashTl !== 0 ? sale.cashTl.toFixed(2) : '-'}</Data></Cell>
      <Cell ss:StyleID="DataRight"><Data ss:Type="${sale.cashUsd !== 0 ? 'Number' : 'String'}">${sale.cashUsd !== 0 ? sale.cashUsd.toFixed(2) : '-'}</Data></Cell>
      <Cell ss:StyleID="DataRight"><Data ss:Type="${sale.cashEur !== 0 ? 'Number' : 'String'}">${sale.cashEur !== 0 ? sale.cashEur.toFixed(2) : '-'}</Data></Cell>
    </Row>`).join('');
    
    const html = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
<Styles>
  <Style ss:ID="Default" ss:Name="Normal">
    <Alignment ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10"/>
  </Style>
  <Style ss:ID="Title">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#E91E63" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="PanelHeaderYellow">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#000000"/>
    <Interior ss:Color="#FFC107" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="PanelHeaderBlue">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#2196F3" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="PanelHeaderGreen">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#4CAF50" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="PanelLabel">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
    <Interior ss:Color="#F5F5F5" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="PanelValue">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
    <Interior ss:Color="#F5F5F5" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="Empty">
    <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="ZRaporLabel">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
    <Interior ss:Color="#F5F5F5" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="ZRaporValue">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
    <Interior ss:Color="#F5F5F5" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="ZRaporLabelBold">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
    <Interior ss:Color="#E0E0E0" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="ZRaporValueBold">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1"/>
    <Interior ss:Color="#E0E0E0" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="ZRaporGrandLabel">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#E91E63" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="ZRaporGrandValue">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#E91E63" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="SectionHeader">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#37474F" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="TableHeader">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#E91E63" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="TableHeaderLeft">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#E91E63" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="DataLeft">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="DataCenter">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="DataRight">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="TotalRow">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#00B050" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="TotalLabel">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#00B050" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
</Styles>
<Worksheet ss:Name="Capraz Satis Raporu">
<Table ss:DefaultColumnWidth="100" ss:DefaultRowHeight="22">
  <Column ss:Width="140"/>
  <Column ss:Width="80"/>
  <Column ss:Width="60"/>
  <Column ss:Width="100"/>
  <Column ss:Width="100"/>
  <Column ss:Width="100"/>
  <Column ss:Width="100"/>
  <Column ss:Width="100"/>
  <Column ss:Width="100"/>
  <Column ss:Width="100"/>
  
  <!-- BASLIK -->
  <Row ss:Height="35">
    <Cell ss:MergeAcross="9" ss:StyleID="Title"><Data ss:Type="String">CAPRAZ SATIS RAPORU - ${kasaName} - ${userName} - ${currentDate}</Data></Cell>
  </Row>
  <Row ss:Height="10"></Row>
  
  <!-- KUR, PAX VE Z RAPOR PANELLERI YAN YANA -->
  <!-- Panel Basliklari -->
  <Row ss:Height="25">
    <Cell ss:MergeAcross="1" ss:StyleID="PanelHeaderYellow"><Data ss:Type="String">GUNLUK KURLAR</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="PanelHeaderBlue"><Data ss:Type="String">PAX SAYISI</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:MergeAcross="2" ss:StyleID="PanelHeaderGreen"><Data ss:Type="String">Z RAPOR</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
  </Row>
  
  <!-- Satir 1: Kur USD / PAX Yetiskin / Z-KK -->
  <Row ss:Height="24">
    <Cell ss:StyleID="PanelLabel"><Data ss:Type="String">USD Kuru</Data></Cell>
    <Cell ss:StyleID="PanelValue"><Data ss:Type="String">${usdRate.toFixed(4)} TL</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="PanelLabel"><Data ss:Type="String">Yetiskin</Data></Cell>
    <Cell ss:StyleID="PanelValue"><Data ss:Type="Number">${totals.totalAdult}</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="ZRaporLabel"><Data ss:Type="String">Kredi Karti (TL)</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="ZRaporValue"><Data ss:Type="String">${totals.kkTl.toFixed(2)} TL</Data></Cell>
  </Row>
  
  <!-- Satir 2: Kur EUR / PAX Cocuk / Z-Nakit TL -->
  <Row ss:Height="24">
    <Cell ss:StyleID="PanelLabel"><Data ss:Type="String">EUR Kuru</Data></Cell>
    <Cell ss:StyleID="PanelValue"><Data ss:Type="String">${eurRate.toFixed(4)} TL</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="PanelLabel"><Data ss:Type="String">Cocuk</Data></Cell>
    <Cell ss:StyleID="PanelValue"><Data ss:Type="Number">${totals.totalChild}</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="ZRaporLabel"><Data ss:Type="String">Nakit TL</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="ZRaporValue"><Data ss:Type="String">${totals.cashTl.toFixed(2)} TL</Data></Cell>
  </Row>
  
  <!-- Satir 3: bos / PAX Toplam / Z-Nakit USD -->
  <Row ss:Height="24">
    <Cell ss:MergeAcross="1" ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="ZRaporLabelBold"><Data ss:Type="String">TOPLAM PAX</Data></Cell>
    <Cell ss:StyleID="ZRaporValueBold"><Data ss:Type="Number">${totals.totalAdult + totals.totalChild}</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="ZRaporLabel"><Data ss:Type="String">Nakit USD</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="ZRaporValue"><Data ss:Type="String">${totals.cashUsd.toFixed(2)} $</Data></Cell>
  </Row>
  
  <!-- Satir 4: bos / bos / Z-Nakit EUR -->
  <Row ss:Height="24">
    <Cell ss:MergeAcross="1" ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="ZRaporLabel"><Data ss:Type="String">Nakit EUR</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="ZRaporValue"><Data ss:Type="String">${totals.cashEur.toFixed(2)} EUR</Data></Cell>
  </Row>
  
  <!-- Satir 5: bos / bos / Z-Toplam Nakit -->
  <Row ss:Height="24">
    <Cell ss:MergeAcross="1" ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="ZRaporLabelBold"><Data ss:Type="String">TOPLAM NAKIT (TL)</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="ZRaporValueBold"><Data ss:Type="String">${cashTlTotal.toFixed(2)} TL</Data></Cell>
  </Row>
  
  <!-- Satir 6: Z Rapor Genel Toplam -->
  <Row ss:Height="28">
    <Cell ss:MergeAcross="1" ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="ZRaporGrandLabel"><Data ss:Type="String">GENEL TOPLAM (TL)</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="ZRaporGrandValue"><Data ss:Type="String">${grandTotal.toFixed(2)} TL</Data></Cell>
  </Row>
  
  <Row ss:Height="15"></Row>
  
  <!-- CAPRAZ SATIS TABLOSU -->
  <Row ss:Height="25">
    <Cell ss:MergeAcross="9" ss:StyleID="SectionHeader"><Data ss:Type="String">CAPRAZ SATIS PANOSU</Data></Cell>
  </Row>
  <Row ss:Height="20">
    <Cell ss:StyleID="TableHeaderLeft"><Data ss:Type="String">Paket</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Yetiskin</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Cocuk</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Para Birimi</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Odeme Tipi</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Toplam</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Kredi Kartı (TL)</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Nakit (TL)</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Nakit (USD)</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Nakit (EUR)</Data></Cell>
  </Row>
  
  ${dataRows}
  
  <Row ss:Height="5"></Row>
  <Row ss:Height="25">
    <Cell ss:MergeAcross="5" ss:StyleID="TotalLabel"><Data ss:Type="String">TOPLAM OZET</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${totals.kkTl.toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${totals.cashTl.toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${totals.cashUsd.toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${totals.cashEur.toFixed(2)}</Data></Cell>
  </Row>
</Table>
</Worksheet>
</Workbook>`;
    
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Capraz_Satis_${kasaName.replace(/\s/g, '_')}_${currentDate.replace(/\./g, '-')}.xls`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // ==================== TOPLAMLAR ====================

  const getTotals = () => {
    return {
      kkTl: crossSales.reduce((sum, s) => sum + s.kkTl, 0),
      cashTl: crossSales.reduce((sum, s) => sum + s.cashTl, 0),
      cashUsd: crossSales.reduce((sum, s) => sum + s.cashUsd, 0),
      cashEur: crossSales.reduce((sum, s) => sum + s.cashEur, 0),
      totalAdult: crossSales.reduce((sum, s) => sum + (s.isRefund ? 0 : s.adultQty), 0),
      totalChild: crossSales.reduce((sum, s) => sum + (s.isRefund ? 0 : s.childQty), 0),
    };
  };

  const totals = getTotals();

  const session = getUserSession();
  const kasaSettings = JSON.parse(localStorage.getItem(`kasaSettings_${session.kasa?.id}`) || '{}');
  const usdRateComp = kasaSettings.usdRate || 30;
  const eurRateComp = kasaSettings.eurRate || 50.4877;
  const grandTotal = totals.kkTl + totals.cashTl + (totals.cashUsd * usdRateComp) + (totals.cashEur * eurRateComp);

  const tableCrossSales = crossSales.filter(s => !s.isRefund);
  const totalPages = Math.max(1, Math.ceil(tableCrossSales.length / PAGE_SIZE));
  const pagedCrossSales = tableCrossSales.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  useImperativeHandle(ref, () => ({
    exportReport: generateHTMLReport,
  }));

  return (
    <div className="p-3 sm:p-4 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/25">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">Çapraz Satış Raporları</h2>
            <p className="text-xs text-gray-400 mt-0.5 font-medium">{crossSales.filter(s => !s.isRefund).length} satış · <span className="text-sky-400 font-bold">{totals.totalAdult + totals.totalChild} PAX</span></p>
          </div>
        </div>
      </div>

      {crossSales.length === 0 ? (
        <div className="text-center py-16 sm:py-20 bg-gradient-to-br from-gray-900 to-gray-950 rounded-2xl border border-dashed border-gray-700/50">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl flex items-center justify-center border border-gray-700/50">
            <Share2 className="w-8 h-8 text-gray-600" />
          </div>
          <p className="text-sm font-semibold text-gray-400">Henüz çapraz satış kaydı yok</p>
          <p className="text-xs mt-1.5 text-gray-600">Ana kasadan çapraz satış eklendiğinde burada görüntülenecektir</p>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-gray-900 to-gray-950 rounded-2xl border border-gray-700/50 overflow-hidden shadow-lg ring-1 ring-white/5">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-gray-900/80 border-b border-gray-700/50">
                  <th className="px-3 py-3 text-left text-gray-400 font-bold uppercase tracking-wider text-[11px]">Paket</th>
                  <th className="px-3 py-3 text-center text-gray-400 font-bold uppercase tracking-wider text-[11px]">Yetişkin</th>
                  <th className="px-3 py-3 text-center text-gray-400 font-bold uppercase tracking-wider text-[11px]">Çocuk</th>
                  <th className="px-3 py-3 text-center text-gray-400 font-bold uppercase tracking-wider text-[11px]">Ödeme</th>
                  <th className="px-3 py-3 text-right text-emerald-400 font-bold uppercase tracking-wider text-[11px]">Kredi Kartı</th>
                  <th className="px-3 py-3 text-right text-blue-400 font-bold uppercase tracking-wider text-[11px]">TL</th>
                  <th className="px-3 py-3 text-right text-amber-400 font-bold uppercase tracking-wider text-[11px]">USD</th>
                  <th className="px-3 py-3 text-right text-violet-400 font-bold uppercase tracking-wider text-[11px]">EUR</th>
                  <th className="px-3 py-3 text-center text-gray-400 font-bold uppercase tracking-wider text-[11px]">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/30">
                {pagedCrossSales.map((sale, idx) => {
                  const refundEntry = crossSales.find(s => s.isRefund && s.refundOfSaleId === sale.id);
                  const isRefunded = !!refundEntry;
                  return (
                    <tr
                      key={sale.id}
                      className={`transition-colors ${
                        isRefunded
                          ? 'bg-red-900/10 hover:bg-red-900/20'
                          : idx % 2 === 0 ? 'bg-transparent hover:bg-gray-700/20' : 'bg-gray-800/20 hover:bg-gray-700/20'
                      }`}
                    >
                      <td className="px-3 py-2.5 text-white max-w-[200px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isRefunded && (
                            <span className="inline-flex items-center text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold border border-red-500/30">↩ İade Edildi</span>
                          )}
                          <span className={`truncate ${isRefunded ? 'line-through text-gray-500' : ''}`}>{sale.packageName}</span>
                        </div>
                      </td>
                      <td className={`px-3 py-2.5 text-center ${isRefunded ? 'text-gray-500 line-through' : 'text-gray-300'}`}>{sale.adultQty}</td>
                      <td className={`px-3 py-2.5 text-center ${isRefunded ? 'text-gray-500 line-through' : 'text-gray-300'}`}>{sale.childQty}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          sale.paymentType === 'Kredi Kartı'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                            : 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                        }`}>
                          {sale.paymentType === 'Kredi Kartı' ? 'Kredi Kartı' : 'Nakit'}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 text-right font-medium ${isRefunded ? 'text-gray-500 line-through' : 'text-emerald-400'}`}>{sale.kkTl !== 0 ? sale.kkTl.toFixed(2) : <span className="text-gray-600">—</span>}</td>
                      <td className={`px-3 py-2.5 text-right font-medium ${isRefunded ? 'text-gray-500 line-through' : 'text-blue-400'}`}>{sale.cashTl !== 0 ? sale.cashTl.toFixed(2) : <span className="text-gray-600">—</span>}</td>
                      <td className={`px-3 py-2.5 text-right font-medium ${isRefunded ? 'text-gray-500 line-through' : 'text-amber-400'}`}>{sale.cashUsd !== 0 ? sale.cashUsd.toFixed(2) : <span className="text-gray-600">—</span>}</td>
                      <td className={`px-3 py-2.5 text-right font-medium ${isRefunded ? 'text-gray-500 line-through' : 'text-violet-400'}`}>{sale.cashEur !== 0 ? sale.cashEur.toFixed(2) : <span className="text-gray-600">—</span>}</td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {!isRefunded && (
                            <button
                              onClick={() => {
                                setRefundTargetSale(sale);
                                setRefundInfo({ reason: '', refundPaymentType: sale.paymentType === 'Çoklu' ? 'Nakit' : (sale.paymentType as 'Nakit' | 'Kredi Kartı'), kkRefundTxId: '' });
                                setShowRefundModal(true);
                              }}
                              title="İade Et"
                              className="text-orange-400 hover:text-orange-300 text-xs font-bold bg-orange-500/15 hover:bg-orange-500/25 px-2 py-1 rounded-lg border border-orange-500/30 transition-colors"
                            >
                              ↩
                            </button>
                          )}
                          {sale.ticketIds && sale.ticketIds.length > 0 && (
                            <button
                              onClick={() => handleReprintTicket(sale)}
                              title="Bilet Tekrar Bas"
                              className="text-indigo-400 hover:text-indigo-300 p-1 rounded-lg transition-colors hover:bg-indigo-500/15"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(sale.id)}
                            title="Sil"
                            className="text-gray-500 hover:text-red-400 p-1.5 sm:p-0.5 rounded transition-colors hover:bg-red-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gradient-to-r from-orange-500/10 to-violet-500/10 border-t-2 border-orange-500/30">
                  <td className="px-3 py-3 text-white font-black text-xs">TOPLAM</td>
                  <td className="px-3 py-3 text-center text-white font-bold text-xs">{totals.totalAdult}</td>
                  <td className="px-3 py-3 text-center text-white font-bold text-xs">{totals.totalChild}</td>
                  <td className="px-3 py-3 text-center text-gray-400 text-xs font-medium">{tableCrossSales.length} satış</td>
                  <td className="px-3 py-3 text-right text-emerald-400 font-bold text-xs">{totals.kkTl.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-blue-400 font-bold text-xs">{totals.cashTl.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-amber-400 font-bold text-xs">{totals.cashUsd.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-violet-400 font-bold text-xs">{totals.cashEur.toFixed(2)}</td>
                  <td className="px-3 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Sayfalama */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 border border-gray-700 transition-colors"
          >
            ← Önceki
          </button>
          <span className="text-xs text-gray-400 font-medium px-2">
            Sayfa <span className="text-white font-bold">{currentPage}</span> / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 border border-gray-700 transition-colors"
          >
            Sonraki →
          </button>
        </div>
      )}

      {/* ── REFUND MODAL ── */}
      {showRefundModal && refundTargetSale && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-boltify-lg">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <span className="w-8 h-8 bg-red-500/10 rounded-xl flex items-center justify-center text-base border border-red-500/20">↩</span>
                Çapraz Satış İadesi
              </h3>
              <button
                onClick={() => { setShowRefundModal(false); setRefundTargetSale(null); setRefundProcessing(false); }}
                disabled={refundProcessing}
                className="text-gray-500 hover:text-white w-7 h-7 flex items-center justify-center rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 mb-4 border border-gray-700">
              <p className="text-[11px] text-gray-500 mb-3 font-semibold uppercase tracking-wider">Orijinal Satış</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Paket:</span> <span className="text-white font-semibold">{refundTargetSale.packageName}</span></div>
                <div><span className="text-gray-500">Tutar:</span> <span className="text-white font-semibold">{refundTargetSale.total.toFixed(2)} {refundTargetSale.currency === 'TL' || refundTargetSale.currency === 'KK' ? '₺' : refundTargetSale.currency === 'USD' ? '$' : '€'}</span></div>
                <div><span className="text-gray-500">Yetişkin:</span> <span className="text-gray-200">{refundTargetSale.adultQty}</span></div>
                <div><span className="text-gray-500">Çocuk:</span> <span className="text-gray-200">{refundTargetSale.childQty}</span></div>
                <div><span className="text-gray-500">Ödeme:</span> <span className="text-gray-200">{refundTargetSale.paymentType}</span></div>
                <div><span className="text-gray-500">Para Birimi:</span> <span className="text-gray-200">{refundTargetSale.currency}</span></div>
                {refundTargetSale.terminalRecordId && (
                  <div className="col-span-2"><span className="text-gray-500">Atlantis Kayıt:</span> <span className="text-blue-400 font-bold">#{refundTargetSale.terminalRecordId}</span></div>
                )}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wider">İade Ödeme Şekli</label>
              <select
                value={refundInfo.refundPaymentType}
                onChange={(e) => setRefundInfo({ ...refundInfo, refundPaymentType: e.target.value as any })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-600/80 rounded-lg text-white text-sm focus:outline-none focus:border-red-500 transition-colors"
              >
                <option value="Nakit">Nakit</option>
                <option value="Kredi Kartı">Kredi Kartı</option>
              </select>
            </div>

            {refundInfo.refundPaymentType === 'Kredi Kartı' && (
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wider">Kredi Kartı İade İşlem Numarası <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={refundInfo.kkRefundTxId}
                  onChange={(e) => setRefundInfo({ ...refundInfo, kkRefundTxId: e.target.value })}
                  placeholder="POS cihazındaki iade işlem numarası..."
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-600/80 rounded-lg text-white text-sm focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>
            )}

            <div className="mb-5">
              <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wider">İade Nedeni <span className="text-red-500">*</span></label>
              <textarea
                value={refundInfo.reason}
                onChange={(e) => setRefundInfo({ ...refundInfo, reason: e.target.value })}
                placeholder="Müşterinin iade nedenini yazınız..."
                rows={3}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-600/80 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>

            {errorMessage && (
              <div className="bg-red-900/40 text-red-300 text-sm px-3 py-2.5 rounded-lg mb-3 border border-red-700/40 flex items-center gap-2">
                <span>⚠</span> {errorMessage}
              </div>
            )}

            {integrationActive && refundTargetSale?.terminalRecordId && (
              <div className="bg-blue-900/20 text-blue-300 text-xs px-3 py-2 rounded-lg mb-3 border border-blue-700/30 flex items-center gap-2">
                <span>🗄️</span> Sistem kaydı da silinecek (Kayıt No: #{refundTargetSale.terminalRecordId})
              </div>
            )}

            <div className="flex gap-2.5">
              <button
                onClick={handleRefund}
                disabled={refundProcessing || !refundInfo.reason.trim() || (refundInfo.refundPaymentType === 'Kredi Kartı' && !refundInfo.kkRefundTxId.trim())}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2.5 rounded-xl font-semibold transition-colors text-sm flex items-center justify-center gap-2"
              >
                {refundProcessing ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    İade İşleniyor...
                  </>
                ) : (
                  'İadeyi Onayla & Tutanak Yazdır'
                )}
              </button>
              <button
                onClick={() => { setShowRefundModal(false); setRefundTargetSale(null); setRefundProcessing(false); }}
                disabled={refundProcessing}
                className="px-4 bg-gray-700/80 hover:bg-gray-700 disabled:opacity-50 text-gray-300 hover:text-white py-2.5 rounded-xl transition-colors text-sm"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
});

export default CrossSalesTab;
