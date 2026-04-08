import React, { useState, useEffect, useMemo } from 'react';
import {
  Receipt, Calendar, Building2,
  TreePine, Users2, Printer, ChevronDown,
} from 'lucide-react';
import { supabase } from '@/config/supabase';
import type { PackageItem } from '@/data/packages';
import { CROSS_SALE_SHARES, detectCrossPackageType } from '@/data/crossSaleShares';
import type { SellerKasa, ShareCurrency } from '@/data/crossSaleShares';

// ── Types ──
type KasaId = 'wildpark' | 'sinema' | 'face2face';

interface SaleItem {
  id: string; packageName: string; adultQty: number; childQty: number;
  currency: string; paymentType: string; total: number;
  kkTl: number; cashTl: number; cashUsd: number; cashEur: number;
  timestamp: string; isRefund?: boolean; refundOfSaleId?: string;
  isCrossSale?: boolean; category?: string;
  personnelName?: string;
}

interface DaySaleDetail {
  kasaId: KasaId;
  packageName: string;
  category: string;
  currency: string;
  adultQty: number;
  childQty: number;
  personnelName: string;
  kkTl: number;
  cashTl: number;
  cashUsd: number;
  cashEur: number;
  totalTL: number;
  isCross: boolean;
}

interface DayRow {
  date: string;
  pruvaPayi: number;
  adrPayi: number;
  toplam: number;
  details: DaySaleDetail[];
}

// ── Constants ──
const TR_MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const ADR_KASAS: KasaId[] = ['wildpark', 'sinema'];
const PRUVA_KASAS: KasaId[] = ['face2face'];

const fmtTR = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00');
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const fmtNum = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Component ──
export default function CrossSalesAccountingTab() {
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [allPackages, setAllPackages] = useState<PackageItem[]>([]);
  const [salesData, setSalesData] = useState<{ date: string; kasaId: KasaId; sales: SaleItem[] }[]>([]);
  // Günlük kur geçmişi: key = date (YYYY-MM-DD)
  const [dailyRates, setDailyRates] = useState<Map<string, { usd: number; eur: number }>>(new Map());

  // Helper: o günün kurunu getir
  const getRates = (date: string): { usd: number; eur: number } => {
    return dailyRates.get(date) || { usd: 30, eur: 33 };
  };

  // Fetch data
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      if (!supabase) { setLoading(false); return; }

      const kasaIds: KasaId[] = ['wildpark', 'sinema', 'face2face'];
      const salesResults: { date: string; kasaId: KasaId; sales: SaleItem[] }[] = [];

      // Load all packages
      const { data: pkgData } = await supabase.from('packages').select('*');
      if (pkgData) setAllPackages(pkgData as PackageItem[]);

      for (const kasaId of kasaIds) {
        // Regular sales
        const { data: sData } = await supabase
          .from('sales')
          .select('date,sales')
          .eq('kasaId', kasaId)
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date');

        if (sData) {
          for (const row of sData) {
            const s = (row.sales || []) as SaleItem[];
            if (s.length > 0) salesResults.push({ date: row.date, kasaId, sales: s });
          }
        }
      }

      // Günlük kur geçmişini yükle (tüm kasalar için ortak)
      const ratesMap = new Map<string, { usd: number; eur: number }>();
      const { data: ratesData } = await supabase
        .from('daily_rates')
        .select('date, usd, eur')
        .gte('date', startDate)
        .lte('date', endDate);
      if (ratesData) {
        for (const r of ratesData) {
          ratesMap.set(r.date, { usd: Number(r.usd) || 30, eur: Number(r.eur) || 33 });
        }
      }
      setDailyRates(ratesMap);

      setSalesData(salesResults);
      setLoading(false);
    }
    load();
  }, [selectedMonth]);

  // Calculate Pruva share for a single cross-sale (in TL)
  // Sabit hak ediş tablosundan birim payları alır
  const calcPruvaShareTL = (sale: SaleItem, kasaId: KasaId, date: string): number => {
    const isCross = sale.isCrossSale || sale.category?.startsWith('Çapraz');
    const rates = getRates(date);

    if (!isCross) {
      // Normal satış: tamamı satıcı şirkete ait
      return 0; // Mutabakatta sadece çapraz satışlar var
    }

    // Paket tipini belirle
    const pkgType = detectCrossPackageType(sale.packageName);
    if (!pkgType) return 0; // F2F içermeyen çapraz (XD+WP) → mutabakatta geçersiz

    // Satan kasanın pay tablosunu bul
    const sellerShares = CROSS_SALE_SHARES[kasaId as SellerKasa];
    if (!sellerShares) return 0;

    const pkgShares = sellerShares[pkgType];
    if (!pkgShares) return 0; // Bu kasa bu paketi satamaz

    const currency = (sale.currency || 'TL') as ShareCurrency;
    const shares = pkgShares[currency];
    if (!shares) return 0;

    // F2F (PRUVA) payını hesapla: birim pay × adet
    const f2fAmount = (shares.f2f.adult * sale.adultQty) + (shares.f2f.child * sale.childQty);

    // EUR/USD ise TL'ye çevir
    if (currency === 'USD') return f2fAmount * rates.usd;
    if (currency === 'EUR') return f2fAmount * rates.eur;
    return f2fAmount; // TL
  };

  // ADR payını hesapla (XD + WP toplamı, TL cinsinden)
  const calcAdrShareTL = (sale: SaleItem, kasaId: KasaId, date: string): number => {
    const isCross = sale.isCrossSale || sale.category?.startsWith('Çapraz');
    const rates = getRates(date);

    if (!isCross) return 0;

    const pkgType = detectCrossPackageType(sale.packageName);
    if (!pkgType) return 0;

    const sellerShares = CROSS_SALE_SHARES[kasaId as SellerKasa];
    if (!sellerShares) return 0;

    const pkgShares = sellerShares[pkgType];
    if (!pkgShares) return 0;

    const currency = (sale.currency || 'TL') as ShareCurrency;
    const shares = pkgShares[currency];
    if (!shares) return 0;

    // ADR payı = XD payı + WP payı
    const adrAmount = (shares.xd.adult * sale.adultQty) + (shares.xd.child * sale.childQty)
                    + (shares.wp.adult * sale.adultQty) + (shares.wp.child * sale.childQty);

    if (currency === 'USD') return adrAmount * rates.usd;
    if (currency === 'EUR') return adrAmount * rates.eur;
    return adrAmount;
  };

  // Process data into daily rows
  const analysis = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const dates: string[] = [];
    for (let d = 1; d <= lastDay; d++) {
      dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }

    const kasaSalesMap = new Map<string, SaleItem[]>();
    const addSales = (data: typeof salesData) => {
      for (const entry of data) {
        const key = `${entry.kasaId}|${entry.date}`;
        const existing = kasaSalesMap.get(key) || [];
        const activeSales = entry.sales.filter(s => {
          if (s.isRefund) return false;
          return !entry.sales.find(r => r.isRefund && r.refundOfSaleId === s.id);
        });
        kasaSalesMap.set(key, [...existing, ...activeSales]);
      }
    };
    addSales(salesData);

    const buildRows = (kasaIds: KasaId[]) => {
      const rows: DayRow[] = [];
      let totalPruva = 0, totalAdr = 0, totalAll = 0;
      for (const date of dates) {
        let dayPruva = 0, dayAdr = 0, dayTotal = 0;
        const details: DaySaleDetail[] = [];
        for (const kasaId of kasaIds) {
          const sales = kasaSalesMap.get(`${kasaId}|${date}`) || [];
          for (const sale of sales) {
            const isCross = !!(sale.isCrossSale || sale.category?.startsWith('Çapraz'));
            if (!isCross) continue; // Only cross-sales matter for mutabakat

            const pruvaShare = calcPruvaShareTL(sale, kasaId, date);
            const adrShare = calcAdrShareTL(sale, kasaId, date);
            const saleTotalTL = pruvaShare + adrShare;
            dayTotal += saleTotalTL;
            dayPruva += pruvaShare;
            dayAdr += adrShare;
            details.push({
              kasaId,
              packageName: sale.packageName,
              category: sale.category || '-',
              currency: sale.currency,
              adultQty: sale.adultQty,
              childQty: sale.childQty,
              personnelName: sale.personnelName || '-',
              kkTl: sale.kkTl,
              cashTl: sale.cashTl,
              cashUsd: sale.cashUsd,
              cashEur: sale.cashEur,
              totalTL: saleTotalTL,
              isCross,
            });
          }
        }
        rows.push({ date, pruvaPayi: dayPruva, adrPayi: dayAdr, toplam: dayTotal, details });
        totalPruva += dayPruva; totalAdr += dayAdr; totalAll += dayTotal;
      }
      return { rows, totalPruva, totalAdr, totalAll };
    };

    const adr = buildRows(ADR_KASAS);
    const pruva = buildRows(PRUVA_KASAS);

    const pruvaHakEdis = adr.totalPruva;
    const adrHakEdis = pruva.totalAdr;
    const faturaTutari = pruvaHakEdis - adrHakEdis;

    return {
      adrRows: adr.rows, adrTotalPruva: adr.totalPruva, adrTotalAdr: adr.totalAdr, adrTotalAll: adr.totalAll,
      pruvaRows: pruva.rows, pruvaTotalPruva: pruva.totalPruva, pruvaTotalAdr: pruva.totalAdr, pruvaTotalAll: pruva.totalAll,
      pruvaHakEdis, adrHakEdis, faturaTutari,
    };
  }, [salesData, dailyRates, selectedMonth]);

  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      opts.push({ key, label });
    }
    return opts;
  }, []);

  const monthName = (() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return `${TR_MONTHS[m - 1]} ${y}`;
  })();

  // Generate HTML Report
  const generateReport = (mode: 'all' | 'adr' | 'pruva') => {
    const renderTable = (title: string, rows: DayRow[], totalPruva: number, totalAdr: number, totalAll: number) => {
      const rowsHtml = rows.filter(r => r.toplam > 0).map(r => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ccc;font-size:11px">${fmtTR(r.date)}</td>
          <td style="padding:4px 8px;border:1px solid #ccc;text-align:right;font-size:11px;color:#166534;background:#f0fdf4">${fmtNum(r.pruvaPayi)}</td>
          <td style="padding:4px 8px;border:1px solid #ccc;text-align:right;font-size:11px;color:#9a3412;background:#fff7ed">${fmtNum(r.adrPayi)}</td>
          <td style="padding:4px 8px;border:1px solid #ccc;text-align:right;font-size:11px;font-weight:600">${fmtNum(r.toplam)}</td>
        </tr>`).join('');

      return `
      <div style="margin-bottom:30px;page-break-inside:avoid">
        <h2 style="font-size:15px;font-weight:700;margin-bottom:10px;padding:8px 12px;background:#f3f4f6;border-radius:6px">${title}</h2>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#1f2937;color:#fff">
            <th style="padding:6px 8px;text-align:left;font-size:10px">TARİH</th>
            <th style="padding:6px 8px;text-align:right;font-size:10px">PRUVA PAYI</th>
            <th style="padding:6px 8px;text-align:right;font-size:10px">ADR PAYI</th>
            <th style="padding:6px 8px;text-align:right;font-size:10px">TOPLAM</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot><tr style="background:#fbbf24;font-weight:700">
            <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">TOPLAM</td>
            <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;font-size:11px">${fmtNum(totalPruva)}</td>
            <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;font-size:11px">${fmtNum(totalAdr)}</td>
            <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;font-size:11px">${fmtNum(totalAll)}</td>
          </tr></tfoot>
        </table>
      </div>`;
    };

    const faturaAlacakli = analysis.faturaTutari > 0 ? 'Pruva' : 'Adrenalin';

    const reportTitle = mode === 'adr' ? 'ADRENALİN (WildPark + XD Cinema) ÇAPRAZ SATIŞ RAPORU'
      : mode === 'pruva' ? 'PRUVA (Face2Face) ÇAPRAZ SATIŞ RAPORU'
      : 'GİŞE SATIŞ MUTABAKAT RAPORU';

    const adrSection = mode !== 'pruva' ? renderTable('WİLDPARK + XD CİNEMA GİŞE SATIŞ RAPORU', analysis.adrRows, analysis.adrTotalPruva, analysis.adrTotalAdr, analysis.adrTotalAll) : '';
    const pruvaSection = mode !== 'adr' ? renderTable('PRUVA GİŞE SATIŞ RAPORU', analysis.pruvaRows, analysis.pruvaTotalPruva, analysis.pruvaTotalAdr, analysis.pruvaTotalAll) : '';
    const hakEdisSection = mode === 'all' ? `
<div style="border:3px solid #1f2937;border-radius:8px;padding:20px;margin-top:20px;background:#fafafa">
  <h2 style="font-size:16px;font-weight:700;margin-bottom:15px;text-align:center">HAK EDİŞ HESABI</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <tr><td style="padding:6px 12px">Pruva'nın Hak Edişi (ADR kasalarından)</td><td style="padding:6px 12px;text-align:right;font-weight:700">${fmtNum(analysis.pruvaHakEdis)} ₺</td></tr>
    <tr><td style="padding:6px 12px">Adrenalin'in Hak Edişi (Pruva kasasından)</td><td style="padding:6px 12px;text-align:right;font-weight:700">${fmtNum(analysis.adrHakEdis)} ₺</td></tr>
    <tr style="border-top:2px solid #1f2937">
      <td style="padding:8px 12px;font-weight:700;font-size:14px">${faturaAlacakli} Fatura Kesecek</td>
      <td style="padding:8px 12px;text-align:right;font-weight:900;font-size:18px;color:#dc2626">${fmtNum(Math.abs(analysis.faturaTutari))} ₺</td>
    </tr>
  </table>
</div>` : '';

    const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8">
<title>${reportTitle} - ${monthName}</title>
<style>
  @page { size: A4; margin: 12mm; }
  @media print { .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; background: #fff; padding: 20px; max-width: 820px; margin: 0 auto; }
</style></head><body>

<div style="border-bottom:3px solid #222;padding-bottom:12px;margin-bottom:25px">
  <div style="font-size:28px;font-weight:900;font-style:italic;margin-bottom:4px"><span style="color:#f97316">adrenalin</span><span style="color:#fb923c">.</span></div>
  <h1 style="font-size:20px;font-weight:700">${reportTitle}</h1>
  <div style="font-size:12px;color:#666;margin-top:4px">
    <span><strong>Dönem:</strong> ${monthName}</span>
  </div>
</div>

${adrSection}
${pruvaSection}
${hakEdisSection}

<div style="text-align:center;margin-top:25px" class="no-print">
  <button onclick="window.print()" style="padding:10px 30px;background:#222;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer">Yazdır</button>
</div>
<div style="margin-top:20px;text-align:center;font-size:9px;color:#aaa;border-top:1px solid #ddd;padding-top:8px">
  Adrenalin Satış Sistemi — ${reportTitle} — ${monthName}
</div>

</body></html>`;

    const w = window.open('', 'accountingReport', 'width=850,height=800,scrollbars=yes,resizable=yes');
    if (w) { w.document.write(html); w.document.close(); }
  };

  // ── Render helper ──
  const toggleDate = (tableId: string, date: string) => {
    const key = `${tableId}|${date}`;
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const kasaLabel = (k: KasaId) => k === 'wildpark' ? 'WildPark' : k === 'sinema' ? 'XD Sinema' : 'Face2Face';

  const renderDayTable = (
    tableId: string,
    title: string,
    subtitle: string,
    icon: typeof TreePine,
    iconBg: string,
    rows: DayRow[],
    totalPruva: number,
    totalAdr: number,
    totalAll: number,
  ) => {
    const Icon = icon;
    const activeRows = rows.filter(r => r.toplam > 0);

    return (
      <div className="bg-gradient-to-br from-gray-900 to-gray-950 rounded-xl border border-gray-700/50 overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-gray-800">
          <span className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center shadow-lg`}>
            <Icon className="w-5 h-5 text-white" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-white">{title}</h3>
            <p className="text-[10px] text-gray-500">{subtitle}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 p-3 bg-gray-800/30">
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5 text-center">
            <p className="text-[9px] text-emerald-400/70 font-bold uppercase tracking-widest">Pruva Payı</p>
            <p className="text-lg font-black text-emerald-400">{fmtNum(totalPruva)}<span className="text-xs text-emerald-500/60 ml-1">₺</span></p>
          </div>
          <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-2.5 text-center">
            <p className="text-[9px] text-orange-400/70 font-bold uppercase tracking-widest">ADR Payı</p>
            <p className="text-lg font-black text-orange-400">{fmtNum(totalAdr)}<span className="text-xs text-orange-500/60 ml-1">₺</span></p>
          </div>
          <div className="bg-gray-700/30 border border-gray-600/30 rounded-lg p-2.5 text-center">
            <p className="text-[9px] text-gray-400/70 font-bold uppercase tracking-widest">Toplam</p>
            <p className="text-lg font-black text-white">{fmtNum(totalAll)}<span className="text-xs text-gray-500 ml-1">₺</span></p>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-800">
                <th className="px-3 py-2 text-left text-gray-400 font-bold text-[10px]">TARİH</th>
                <th className="px-3 py-2 text-right text-emerald-400 font-bold text-[10px]">PRUVA PAYI</th>
                <th className="px-3 py-2 text-right text-orange-400 font-bold text-[10px]">ADR PAYI</th>
                <th className="px-3 py-2 text-right text-gray-300 font-bold text-[10px]">TOPLAM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {activeRows.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-600">Bu dönemde satış bulunmuyor.</td></tr>
              ) : activeRows.map(r => {
                const isExpanded = expandedDates.has(`${tableId}|${r.date}`);
                const crossDetails = r.details.filter(d => d.isCross);
                return (
                  <React.Fragment key={r.date}>
                    <tr
                      className="hover:bg-gray-800/30 cursor-pointer select-none"
                      onClick={() => toggleDate(tableId, r.date)}
                    >
                      <td className="px-3 py-2 text-gray-400">
                        <span className="flex items-center gap-1.5">
                          <ChevronDown className={`w-3 h-3 text-gray-600 transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
                          {fmtTR(r.date)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-400 font-semibold">{fmtNum(r.pruvaPayi)}</td>
                      <td className="px-3 py-2 text-right text-orange-400 font-semibold">{fmtNum(r.adrPayi)}</td>
                      <td className="px-3 py-2 text-right text-white font-bold">{fmtNum(r.toplam)}</td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={4} className="p-0">
                          <div className="bg-gray-950/80 border-y border-gray-800/50 px-2 py-2">
                            {crossDetails.length > 0 ? (
                              <table className="w-full text-[10px]">
                                <thead>
                                  <tr className="text-gray-600">
                                    <th className="px-1.5 py-1 text-left font-semibold">Kasa</th>
                                    <th className="px-1.5 py-1 text-left font-semibold">Kategori</th>
                                    <th className="px-1.5 py-1 text-left font-semibold">Paket</th>
                                    <th className="px-1.5 py-1 text-center font-semibold">Y/Ç</th>
                                    <th className="px-1.5 py-1 text-left font-semibold">Personel</th>
                                    <th className="px-1.5 py-1 text-right font-semibold">Nakit ₺</th>
                                    <th className="px-1.5 py-1 text-right font-semibold">KK ₺</th>
                                    <th className="px-1.5 py-1 text-right font-semibold">€</th>
                                    <th className="px-1.5 py-1 text-right font-semibold">$</th>
                                    <th className="px-1.5 py-1 text-right font-semibold">Toplam</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {crossDetails.map((d, i) => (
                                    <tr key={i} className="hover:bg-gray-800/40 border-t border-gray-800/30">
                                      <td className="px-1.5 py-1 text-gray-400">{kasaLabel(d.kasaId)}</td>
                                      <td className="px-1.5 py-1 text-amber-400/70">{d.category}</td>
                                      <td className="px-1.5 py-1 text-white font-medium">{d.packageName}</td>
                                      <td className="px-1.5 py-1 text-center text-gray-400">{d.adultQty}/{d.childQty}</td>
                                      <td className="px-1.5 py-1 text-gray-400">{d.personnelName}</td>
                                      <td className="px-1.5 py-1 text-right text-gray-300">{d.cashTl > 0 ? fmtNum(d.cashTl) : '-'}</td>
                                      <td className="px-1.5 py-1 text-right text-gray-300">{d.kkTl > 0 ? fmtNum(d.kkTl) : '-'}</td>
                                      <td className="px-1.5 py-1 text-right text-gray-300">{d.cashEur > 0 ? fmtNum(d.cashEur) : '-'}</td>
                                      <td className="px-1.5 py-1 text-right text-gray-300">{d.cashUsd > 0 ? fmtNum(d.cashUsd) : '-'}</td>
                                      <td className="px-1.5 py-1 text-right text-white font-bold">{fmtNum(d.totalTL)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="text-[10px] text-gray-600 text-center py-2">Bu gün çapraz satış bulunmuyor.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            {activeRows.length > 0 && (
              <tfoot>
                <tr className="bg-amber-500/10 border-t-2 border-amber-500/40">
                  <td className="px-3 py-2.5 text-amber-400 font-black text-[11px]">TOPLAM</td>
                  <td className="px-3 py-2.5 text-right text-emerald-400 font-black text-[11px]">{fmtNum(totalPruva)}</td>
                  <td className="px-3 py-2.5 text-right text-orange-400 font-black text-[11px]">{fmtNum(totalAdr)}</td>
                  <td className="px-3 py-2.5 text-right text-white font-black text-[11px]">{fmtNum(totalAll)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/25">
            <Receipt className="w-5 h-5 text-white" />
          </span>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">Gişe Satış Mutabakat</h2>
            <p className="text-xs text-gray-400 font-medium">Pruva & Adrenalin hak ediş ve fatura takibi</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
          >
            {monthOptions.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button
              onClick={() => generateReport('adr')}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white rounded-l-xl text-[10px] font-bold shadow-lg shadow-orange-500/25 transition-all"
            >
              <TreePine className="w-3 h-3" />
              ADR Rapor
            </button>
            <button
              onClick={() => generateReport('pruva')}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-[10px] font-bold shadow-lg shadow-emerald-500/25 transition-all"
            >
              <Building2 className="w-3 h-3" />
              Pruva Rapor
            </button>
            <button
              onClick={() => generateReport('all')}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500 text-white rounded-r-xl text-[10px] font-bold shadow-lg shadow-gray-500/25 transition-all"
            >
              <Printer className="w-3 h-3" />
              Tümü
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500 text-sm">Veriler yükleniyor...</div>
      ) : (
        <>
          {/* Hak Ediş Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-gradient-to-br from-emerald-950/80 to-gray-900 rounded-xl border-2 border-emerald-500/40 p-4 shadow-lg shadow-emerald-500/5">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] text-emerald-300/70 font-bold uppercase tracking-widest">Pruva Hak Edişi</span>
              </div>
              <p className="text-2xl font-black text-emerald-400">{fmtNum(analysis.pruvaHakEdis)} <span className="text-sm font-normal text-emerald-500/60">₺</span></p>
              <p className="text-[10px] text-gray-500 mt-1">ADR kasalarındaki Pruva payı toplamı</p>
            </div>
            <div className="bg-gradient-to-br from-orange-950/80 to-gray-900 rounded-xl border-2 border-orange-500/40 p-4 shadow-lg shadow-orange-500/5">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-orange-400" />
                <span className="text-[10px] text-orange-300/70 font-bold uppercase tracking-widest">Adrenalin Hak Edişi</span>
              </div>
              <p className="text-2xl font-black text-orange-400">{fmtNum(analysis.adrHakEdis)} <span className="text-sm font-normal text-orange-500/60">₺</span></p>
              <p className="text-[10px] text-gray-500 mt-1">Pruva kasasındaki ADR payı toplamı</p>
            </div>
            <div className={`bg-gradient-to-br rounded-xl border-2 p-4 shadow-lg ${
              analysis.faturaTutari > 0
                ? 'from-red-950/80 to-gray-900 border-red-500/40 shadow-red-500/5'
                : 'from-blue-950/80 to-gray-900 border-blue-500/40 shadow-blue-500/5'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <Receipt className={`w-4 h-4 ${analysis.faturaTutari > 0 ? 'text-red-400' : 'text-blue-400'}`} />
                <span className={`text-[10px] font-bold uppercase tracking-widest ${analysis.faturaTutari > 0 ? 'text-red-300/70' : 'text-blue-300/70'}`}>Fatura Tutarı</span>
              </div>
              <p className={`text-2xl font-black ${analysis.faturaTutari > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                {fmtNum(Math.abs(analysis.faturaTutari))} <span className="text-sm font-normal opacity-60">₺</span>
              </p>
              <p className={`text-[10px] mt-1 font-semibold ${analysis.faturaTutari > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                {analysis.faturaTutari > 0 ? 'Pruva fatura kesecek' : analysis.faturaTutari < 0 ? 'Adrenalin fatura kesecek' : 'Hesaplar denk'}
              </p>
            </div>
          </div>

          {/* Two register group tables */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {renderDayTable(
              'adr',
              'WildPark + XD Cinema',
              'Adrenalin kasaları günlük satış dağılımı',
              TreePine,
              'bg-gradient-to-br from-emerald-500 to-green-600',
              analysis.adrRows,
              analysis.adrTotalPruva,
              analysis.adrTotalAdr,
              analysis.adrTotalAll,
            )}
            {renderDayTable(
              'pruva',
              'Pruva (Face2Face)',
              'Pruva kasası günlük satış dağılımı',
              Users2,
              'bg-gradient-to-br from-sky-500 to-blue-600',
              analysis.pruvaRows,
              analysis.pruvaTotalPruva,
              analysis.pruvaTotalAdr,
              analysis.pruvaTotalAll,
            )}
          </div>
        </>
      )}
    </div>
  );
}