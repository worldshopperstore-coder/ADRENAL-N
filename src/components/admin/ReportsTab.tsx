import { useState, useEffect, useMemo } from 'react';
import {
  FileText, Download, ChevronRight, ChevronDown, ChevronLeft,
  Calendar, ArrowLeftRight, CreditCard, Banknote, TrendingUp,
  AlertCircle, RotateCcw, User,
  TreePine, Monitor, Users2,
} from 'lucide-react';
import { supabase } from '@/config/supabase';
import type { DatedSale } from '@/utils/performanceDB';

// ── Types ──────────────────────────────────────────────────────────────────────
type KasaId = 'wildpark' | 'sinema' | 'face2face';
type FilterPeriod = 'today' | 'week' | '15days' | 'month';

interface DayRow {
  date: string;
  sales: DatedSale[];
  crossSales: DatedSale[];
}

interface MonthGroup {
  key: string; // YYYY-MM
  label: string; // Ocak 2026
  days: DayRow[];
}

// ── Constants ──────────────────────────────────────────────────────────────────
const KASA_INFO: Record<KasaId, { name: string; Icon: React.FC<any>; bar: string; text: string; border: string; bg: string }> = {
  wildpark:  { name: 'WildPark',  Icon: TreePine, bar: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-gray-800', bg: 'bg-gray-900' },
  sinema:    { name: 'XD Sinema', Icon: Monitor,  bar: 'bg-violet-500',  text: 'text-violet-400',  border: 'border-gray-800', bg: 'bg-gray-900' },
  face2face: { name: 'Face2Face', Icon: Users2,   bar: 'bg-sky-500',     text: 'text-sky-400',     border: 'border-gray-800', bg: 'bg-gray-900' },
};

const TR_MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                   'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const TR_DAYS   = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];

const PERIOD_OPTS: { key: FilterPeriod; label: string }[] = [
  { key: 'today',  label: 'Bugün'    },
  { key: 'week',   label: 'Bu Hafta' },
  { key: '15days', label: '15 Gün'   },
  { key: 'month',  label: 'Bu Ay'    },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function esc(str: string): string {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
const fmt   = (d: Date) => d.toISOString().split('T')[0];
const fmtTR = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00');
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
};
const weekDay = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00');
  return TR_DAYS[d.getDay()];
};
const monthKey   = (dateStr: string) => dateStr.slice(0, 7);
const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  return `${TR_MONTHS[parseInt(m) - 1]} ${y}`;
};

function dateRange(period: FilterPeriod): { start: string; end: string } {
  const today = new Date();
  if (period === 'today')  return { start: fmt(today), end: fmt(today) };
  if (period === 'week')   { const s = new Date(today); s.setDate(s.getDate()-6); return { start: fmt(s), end: fmt(today) }; }
  if (period === '15days') { const s = new Date(today); s.setDate(s.getDate()-14); return { start: fmt(s), end: fmt(today) }; }
  return { start: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), end: fmt(today) };
}

function calcTotals(sales: DatedSale[], usdRate: number, eurRate: number) {
  let cashTl = 0, cashUsd = 0, cashEur = 0, kkTl = 0;
  let adultQty = 0, childQty = 0;
  for (const s of sales) {
    cashTl  += s.cashTl  || 0;
    cashUsd += s.cashUsd || 0;
    cashEur += s.cashEur || 0;
    kkTl    += s.kkTl    || 0;
    adultQty += s.adultQty || 0;
    childQty += s.childQty || 0;
  }
  const totalTl = kkTl + cashTl + cashUsd * usdRate + cashEur * eurRate;
  return { cashTl, cashUsd, cashEur, kkTl, totalTl, adultQty, childQty };
}

const fmtNum = (n: number, dec = 0) => n.toLocaleString('tr-TR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

// ── Supabase fetch ─────────────────────────────────────────────────────────────
async function fetchKasaData(kasaId: string, startDate: string, endDate: string): Promise<{
  salesRows: { date: string; sales: any[] }[];
  crossRows:  { date: string; crossSales: any[] }[];
}> {
  if (!supabase) return { salesRows: [], crossRows: [] };
  const [salesRes, crossRes] = await Promise.all([
    supabase.from('sales').select('date,sales')
      .eq('kasaId', kasaId).gte('date', startDate).lte('date', endDate).order('date'),
    supabase.from('cross_sales').select('date,crossSales')
      .eq('kasaId', kasaId).gte('date', startDate).lte('date', endDate).order('date'),
  ]);
  // PostgreSQL lowercase fallback
  const salesRows = (salesRes.data || []).map(r => ({ date: r.date, sales: r.sales || [] }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const crossRows = (crossRes.data || []).map((r: any) => ({
    date: r.date,
    crossSales: r.crossSales ?? r.crosssales ?? [],
  }));
  return { salesRows, crossRows };
}

// ── Sales grouping ─────────────────────────────────────────────────────────────
interface GroupedSale {
  packageName: string;
  category?: string;
  personnelName: string;
  adultQty: number;
  childQty: number;
  kkTl: number;
  cashTl: number;
  cashUsd: number;
  cashEur: number;
  count: number;
  isCross: boolean;
  hasRefund: boolean;
  refundReason?: string;
  kkRefundTxId?: string;
}

function groupSalesByPackage(sales: DatedSale[], crossSaleIds: Set<string>): GroupedSale[] {
  const map: Record<string, GroupedSale> = {};
  for (const s of sales) {
    const pKey = s.personnelId || s.personnelName || 'unknown';
    const refundTag = s.isRefund ? '|refund' : '';
    const key = `${s.packageName}||${pKey}${refundTag}`;
    if (!map[key]) {
      map[key] = {
        packageName: s.packageName,
        category: s.category,
        personnelName: s.personnelName || s.personnelId || '?',
        adultQty: 0, childQty: 0,
        kkTl: 0, cashTl: 0, cashUsd: 0, cashEur: 0,
        count: 0, isCross: false, hasRefund: false, refundReason: undefined, kkRefundTxId: undefined,
      };
    }
    map[key].adultQty += s.adultQty || 0;
    map[key].childQty += s.childQty || 0;
    map[key].kkTl     += s.kkTl     || 0;
    map[key].cashTl   += s.cashTl   || 0;
    map[key].cashUsd  += s.cashUsd  || 0;
    map[key].cashEur  += s.cashEur  || 0;
    map[key].count++;
    if (s.isCrossSale || crossSaleIds.has(s.id)) map[key].isCross = true;
    if (s.isRefund) {
      map[key].hasRefund = true;
      if (s.refundReason) map[key].refundReason = s.refundReason;
      if (s.kkRefundTxId) map[key].kkRefundTxId = s.kkRefundTxId;
    }
  }
  return Object.values(map);
}

// ── HTML/PDF Export ────────────────────────────────────────────────────────────
function buildDayHtml(
  date: string, kasaName: string, kasaIcon: string,
  sales: DatedSale[], crossSales: DatedSale[],
  usdRate: number, eurRate: number
): string {
  const t = calcTotals(sales, usdRate, eurRate);
  const allSales = [...sales];
  const crossIds = new Set(crossSales.map(c => c.id));
  const grouped = groupSalesByPackage(allSales, crossIds);

  const rows = grouped.map((g, i) => {
    const borderStyle = g.hasRefund ? 'border-left:3px solid #ef4444' : (g.isCross ? 'border-left:3px solid #f97316' : '');
    const bgStyle = g.hasRefund ? 'background:#fff5f5;' : '';
    return `<tr style="${borderStyle};${bgStyle}">
      <td style="color:#9ca3af">${String(i+1).padStart(2,'0')}</td>
      <td><strong>${g.hasRefund?'<span style="color:#ef4444;font-size:10px;border:1px solid #fca5a5;padding:1px 4px;border-radius:3px;margin-right:4px">İade Edildi</span>':''}${g.isCross?'? ':''}${esc(g.packageName)}</strong>${g.category?`<div style="color:#9ca3af;font-size:9px">${esc(g.category)}</div>`:''}${g.hasRefund&&g.refundReason?`<div style="color:#ef4444;font-size:9px;margin-top:2px">Neden: ${esc(g.refundReason)}</div>`:''}${g.kkRefundTxId?`<div style="color:#9ca3af;font-size:9px">Kredi Kartı İşlem No: ${esc(g.kkRefundTxId)}</div>`:''}</td>
      <td>${esc(g.personnelName)}</td>
      <td style="text-align:center">${g.adultQty}Y / ${g.childQty}Ç</td>
      <td style="text-align:right;font-weight:600">${g.kkTl>0?'₺'+fmtNum(g.kkTl,2):'—'}</td>
      <td style="text-align:right;font-weight:600">${g.cashTl>0?'₺'+fmtNum(g.cashTl,2):'—'}</td>
      <td style="text-align:right;font-weight:600">${g.cashUsd>0?'$'+fmtNum(g.cashUsd,2):'—'}</td>
      <td style="text-align:right;font-weight:600">${g.cashEur>0?'€'+fmtNum(g.cashEur,2):'—'}</td>
    </tr>`;
  }).join('');

  // Personnel summary
  const persMap: Record<string, { name: string; revenue: number; count: number }> = {};
  for (const s of allSales) {
    const pId = s.personnelId || 'unknown';
    if (!persMap[pId]) persMap[pId] = { name: s.personnelName || 'Bilinmeyen', revenue: 0, count: 0 };
    persMap[pId].revenue += (s.kkTl||0) + (s.cashTl||0) + (s.cashUsd||0)*usdRate + (s.cashEur||0)*eurRate;
    persMap[pId].count++;
  }
  const persRows = Object.values(persMap).sort((a,b)=>b.revenue-a.revenue).map(p =>
    `<tr><td>${esc(p.name)}</td><td>${p.count} satış</td><td style="text-align:right;font-weight:700">₺${fmtNum(p.revenue,2)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="tr"><head>
<meta charset="UTF-8"/>
<title>${kasaName} — ${fmtTR(date)} Günlük Rapor</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1f2937;margin:0;padding:24px;font-size:13px}
  .header{border-bottom:3px solid #111;padding:16px 0 14px;margin-bottom:20px}
  .header h1{margin:0 0 6px;font-size:20px;color:#111;font-weight:800;letter-spacing:-0.3px}
  .header .meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#6b7280;font-size:12px}
  .header .meta .sep{color:#d1d5db}
  .tag{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;border:1px solid #d1d5db;background:#f9fafb;color:#374151}
  .tag.blue{border-color:#93c5fd;color:#1e40af}
  .tag.green{border-color:#86efac;color:#166534}
  .tag.orange{border-color:#fdba74;color:#9a3412}
  .metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
  .card{border:1.5px solid #e5e7eb;border-radius:10px;padding:14px 16px}
  .card .lbl{font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.8px;font-weight:700}
  .card .num{font-size:20px;font-weight:800;margin-top:4px;color:#111;letter-spacing:-0.5px}
  .card .hint{font-size:9px;color:#9ca3af;margin-top:2px}
  .tl{color:#111}.usd{color:#111}.eur{color:#111}.kk{color:#111}
  section{margin-bottom:20px}
  h2{font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.8px;margin:0 0 10px;padding-bottom:8px;border-bottom:1.5px solid #e5e7eb}
  table{width:100%;border-collapse:collapse;font-size:11px}
  thead tr{background:#f3f4f6}
  thead th{padding:8px 10px;text-align:left;color:#374151;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid #d1d5db}
  tbody td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
  tbody tr:nth-child(even){background:#f9fafb}
  .footer{text-align:center;color:#9ca3af;font-size:9px;margin-top:24px;padding-top:10px;border-top:1px solid #e5e7eb}
  @media print{body{padding:12px}}
</style>
</head><body>
<div class="header">
  <div style="font-size:24px;font-weight:900;font-style:italic;margin-bottom:4px"><span style="color:#f97316">adrenalin</span><span style="color:#fb923c">.</span></div>
  <h1>${kasaName} — Günlük Satış Raporu</h1>
  <div class="meta">
    <span>📅 ${fmtTR(date)} ${weekDay(date)}</span>
    <span class="sep">|</span>
    <span>${allSales.length} satış işlemi</span>
    <span class="tag blue">${t.adultQty} Yetişkin</span>
    <span class="tag green">${t.childQty} Çocuk</span>
    ${crossSales.length > 0 ? `<span class="tag orange">${crossSales.length} Çapraz</span>` : ''}
  </div>
</div>
<div class="metrics">
  <div class="card c-green">
    <div class="lbl">Toplam Ciro</div>
    <div class="num tl">₺${fmtNum(t.totalTl,2)}</div>
    <div class="hint">${allSales.length} satış — TL eşdeğeri</div>
  </div>
  <div class="card c-tl">
    <div class="lbl">Nakit TL</div>
    <div class="num tl">₺${fmtNum(t.cashTl,2)}</div>
    <div class="hint">Nakit tahsilat</div>
  </div>
  <div class="card c-blue">
    <div class="lbl">Kredi Kartı</div>
    <div class="num kk">₺${fmtNum(t.kkTl,2)}</div>
    <div class="hint">Kart ile ödeme</div>
  </div>
  <div class="card c-usd">
    <div class="lbl">Nakit USD</div>
    <div class="num usd">$${fmtNum(t.cashUsd,2)}</div>
    <div class="hint">Dolar nakit</div>
  </div>
  <div class="card c-eur">
    <div class="lbl">Nakit EUR</div>
    <div class="num eur">€${fmtNum(t.cashEur,2)}</div>
    <div class="hint">Euro nakit</div>
  </div>
</div>
${persMap && Object.keys(persMap).length > 1 ? `
<section>
  <h2>Personel Özeti</h2>
  <table><thead><tr><th>Personel</th><th>Satış #</th><th style="text-align:right">Ciro (TL eşd.)</th></tr></thead>
  <tbody>${persRows}</tbody></table>
</section>` : ''}
<section>
  <h2>Satış Detayları</h2>
  <table>
    <thead><tr>
      <th>#</th><th>Paket</th><th>Personel</th><th style="text-align:center">Y / Ç</th>
      <th style="text-align:right">KK (?)</th><th style="text-align:right">Nakit (?)</th><th style="text-align:right">Nakit ($)</th><th style="text-align:right">Nakit (€)</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:#4b5563;padding:20px">Bu gün satış verisi bulunamadı</td></tr>'}</tbody>
  </table>
</section>
<div class="footer">Oluşturulma: ${new Date().toLocaleString('tr-TR')} — Adrenalin Kasa Sistemi</div>
</body></html>`;
}

function buildMonthHtml(
  monthLbl: string, kasaName: string, kasaIcon: string,
  days: DayRow[], usdRate: number, eurRate: number
): string {
  const allSales = days.flatMap(d => d.sales);
  const t = calcTotals(allSales, usdRate, eurRate);

  const dayRows = days.filter(d => d.sales.length > 0).map(d => {
    const dt = calcTotals(d.sales, usdRate, eurRate);
    return `<tr>
      <td>${fmtTR(d.date)} ${weekDay(d.date)}</td>
      <td>${d.sales.length}</td>
      <td>${dt.adultQty}Y + ${dt.childQty}Ç</td>
      <td style="text-align:right">₺${fmtNum(dt.kkTl,2)}</td>
      <td style="text-align:right">₺${fmtNum(dt.cashTl,2)}</td>
      <td style="text-align:right">$${fmtNum(dt.cashUsd,2)}</td>
      <td style="text-align:right">€${fmtNum(dt.cashEur,2)}</td>
      <td style="text-align:right;font-weight:700">₺${fmtNum(dt.totalTl,2)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="tr"><head>
<meta charset="UTF-8"/>
<title>${kasaName} — ${monthLbl} Aylık Rapor</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1f2937;margin:0;padding:24px;font-size:13px}
  .header{border-bottom:3px solid #111;padding:16px 0 14px;margin-bottom:20px}
  .header h1{margin:0 0 6px;font-size:20px;color:#111;font-weight:800}
  .header p{margin:0;color:#6b7280;font-size:12px}
  .metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
  .card{border:1.5px solid #e5e7eb;border-radius:10px;padding:14px 16px}
  .card .lbl{font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.8px;font-weight:700}
  .card .num{font-size:20px;font-weight:800;margin-top:4px;color:#111}
  .card .hint{font-size:9px;color:#9ca3af;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  thead tr{background:#f3f4f6}
  thead th{padding:8px 10px;text-align:left;color:#374151;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid #d1d5db}
  tbody td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
  tbody tr:nth-child(even){background:#f9fafb}
  .footer{text-align:center;color:#9ca3af;font-size:9px;margin-top:24px;padding-top:10px;border-top:1px solid #e5e7eb}
  @media print{body{padding:12px}}
</style>
</head><body>
<div class="header">
  <div style="font-size:24px;font-weight:900;font-style:italic;margin-bottom:4px"><span style="color:#f97316">adrenalin</span><span style="color:#fb923c">.</span></div>
  <h1>${kasaName} — ${monthLbl} Aylık Rapor</h1>
  <p>Toplam ${allSales.length} satış — ${t.adultQty} Yetişkin — ${t.childQty} Çocuk</p>
</div>
<div class="metrics">
  <div class="card">
    <div class="lbl">Toplam Ciro</div>
    <div class="num">₺${fmtNum(t.totalTl,2)}</div>
  </div>
  <div class="card">
    <div class="lbl">Nakit TL</div>
    <div class="num">₺${fmtNum(t.cashTl,2)}</div>
  </div>
  <div class="card">
    <div class="lbl">Kredi Kartı</div>
    <div class="num">₺${fmtNum(t.kkTl,2)}</div>
  </div>
  <div class="card">
    <div class="lbl">Nakit USD</div>
    <div class="num">$${fmtNum(t.cashUsd,2)}</div>
  </div>
  <div class="card">
    <div class="lbl">Nakit EUR</div>
    <div class="num">€${fmtNum(t.cashEur,2)}</div>
  </div>
</div>
<table>
  <thead><tr><th>Tarih</th><th>Satış #</th><th>Kişi</th><th style="text-align:right">K.Kartı</th><th style="text-align:right">Nakit TL</th><th style="text-align:right">Nakit $</th><th style="text-align:right">Nakit €</th><th style="text-align:right">Günlük Ciro</th></tr></thead>
  <tbody>${dayRows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#9ca3af">Bu ay için satış verisi bulunamadı</td></tr>'}</tbody>
</table>
<div class="footer">Oluşturulma: ${new Date().toLocaleString('tr-TR')} — Adrenalin Kasa Sistemi</div>
</body></html>`;
}

function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function printAsPdf(html: string) {
  const w = window.open('', 'reportWindow', 'width=850,height=700,scrollbars=yes,resizable=yes');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.print(); }, 600);
}

// ── Kasa Sales View ─────────────────────────────────────────────────────────────
interface KasaViewProps {
  kasaId: KasaId;
  period: FilterPeriod;
  usdRate: number;
  eurRate: number;
}

function KasaView({ kasaId, period, usdRate, eurRate }: KasaViewProps) {
  const [loading, setLoading] = useState(true);
  const [dayRows, setDayRows] = useState<DayRow[]>([]);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [expandedDay, setExpandedDay]   = useState<string | null>(null);

  const info = KASA_INFO[kasaId];

  useEffect(() => {
    const { start, end } = dateRange(period);
    setLoading(true);
    setExpandedMonth(null);
    setExpandedDay(null);
    fetchKasaData(kasaId, start, end).then(({ salesRows, crossRows }) => {
      // Build day map
      const map: Record<string, DayRow> = {};
      for (const r of salesRows) {
        if (!map[r.date]) map[r.date] = { date: r.date, sales: [], crossSales: [] };
        map[r.date].sales = r.sales.map((s: any) => ({ ...s, date: r.date, kasaId }));
      }
      for (const r of crossRows) {
        if (!map[r.date]) map[r.date] = { date: r.date, sales: [], crossSales: [] };
        map[r.date].crossSales = r.crossSales.map((s: any) => ({ ...s, date: r.date, kasaId }));
      }
      // Fill all dates in range
      const { start: s, end: e } = dateRange(period);
      const cur = new Date(s + 'T12:00:00');
      const endD = new Date(e + 'T12:00:00');
      while (cur <= endD) {
        const key = fmt(cur);
        if (!map[key]) map[key] = { date: key, sales: [], crossSales: [] };
        cur.setDate(cur.getDate() + 1);
      }
      const sorted = Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
      setDayRows(sorted);
      // Auto-expand current month
      if (sorted.length > 0) setExpandedMonth(monthKey(sorted[0].date));
      setLoading(false);
    });
  }, [kasaId, period]);

  const monthGroups = useMemo((): MonthGroup[] => {
    const groups: Record<string, MonthGroup> = {};
    for (const d of dayRows) {
      const mk = monthKey(d.date);
      if (!groups[mk]) groups[mk] = { key: mk, label: monthLabel(mk), days: [] };
      groups[mk].days.push(d);
    }
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
  }, [dayRows]);

  // Today's live view
  const todayStr = fmt(new Date());
  const todayRow = dayRows.find(d => d.date === todayStr);

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Today live strip */}
      {todayRow && (
        <div className={`${info.bg} border ${info.border} rounded-xl p-4`}>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className={`font-bold text-sm ${info.text}`}>Bugün — Canlı</span>
              <span className="text-gray-500 text-xs">{fmtTR(todayStr)}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const html = buildDayHtml(todayStr, info.name, '', todayRow.sales, todayRow.crossSales, usdRate, eurRate);
                  downloadHtml(html, `${kasaId}_${todayStr}.html`);
                }}
                className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
              >
                <Download className="w-3 h-3" /> HTML
              </button>
              <button
                onClick={() => {
                  const html = buildDayHtml(todayStr, info.name, '', todayRow.sales, todayRow.crossSales, usdRate, eurRate);
                  printAsPdf(html);
                }}
                className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
              >
                <FileText className="w-3 h-3" /> PDF
              </button>
            </div>
          </div>

          {/* Today quick stats */}
          {(() => {
            const t = calcTotals(todayRow.sales, usdRate, eurRate);
            return (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                {[
                  { label: 'Toplam Ciro',  val: `₺${fmtNum(t.totalTl,2)}`,    color: 'text-green-400 font-bold' },
                  { label: 'Kredi Kartı',  val: `₺${fmtNum(t.kkTl,2)}`,       color: 'text-blue-400'            },
                  { label: 'Nakit TL',     val: `₺${fmtNum(t.cashTl,2)}`,      color: 'text-green-300'           },
                  { label: 'Nakit $',      val: `$${fmtNum(t.cashUsd,2)}`,      color: 'text-yellow-400'          },
                  { label: 'Nakit €',      val: `€${fmtNum(t.cashEur,2)}`,      color: 'text-orange-400'          },
                ].map(m => (
                  <div key={m.label} className="bg-gray-900/60 rounded-lg px-3 py-2">
                    <div className="text-gray-500">{m.label}</div>
                    <div className={`${m.color} font-semibold mt-0.5`}>{m.val}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Today's personnel breakdown */}
          {todayRow.sales.length > 0 && (() => {
            const persMap: Record<string, { name: string; count: number; revenue: number; cross: number; packages: string[] }> = {};
            for (const s of todayRow.sales) {
              const pid = s.personnelId || 'bilinmeyen';
              if (!persMap[pid]) persMap[pid] = { name: s.personnelName || 'Bilinmeyen', count: 0, revenue: 0, cross: 0, packages: [] };
              persMap[pid].count++;
              persMap[pid].revenue += (s.kkTl||0) + (s.cashTl||0) + (s.cashUsd||0)*usdRate + (s.cashEur||0)*eurRate;
              if (s.isCrossSale) persMap[pid].cross++;
              if (!persMap[pid].packages.includes(s.packageName)) persMap[pid].packages.push(s.packageName);
            }
            const list = Object.values(persMap).sort((a,b) => b.revenue - a.revenue);
            return (
              <div className="mt-3 pt-3 border-t border-gray-700/50">
                <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><User className="w-3 h-3" /> Personel Dağılımı</p>
                <div className="flex flex-wrap gap-2">
                  {list.map(p => (
                    <div key={p.name} className="bg-gray-900/60 rounded-lg px-3 py-2 text-xs">
                      <span className="text-white font-semibold">{p.name}</span>
                      <span className="text-gray-500 ml-2">{p.count} satış</span>
                      <span className="text-green-400 ml-2">₺{fmtNum(p.revenue,0)}</span>
                      {p.cross > 0 && <span className="text-orange-400 ml-2">{p.cross}×</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {todayRow.sales.length === 0 && (
            <p className="text-gray-600 text-sm text-center py-2">Bugün henüz satış yapılmamış</p>
          )}
        </div>
      )}

      {/* Month accordion groups */}
      {monthGroups.map(mg => {
        const mgSales = mg.days.flatMap(d => d.sales);
        const mgCross = mg.days.flatMap(d => d.crossSales);
        const mt = calcTotals(mgSales, usdRate, eurRate);
        const activeDays = mg.days.filter(d => d.sales.length > 0).length;
        const isMonthOpen = expandedMonth === mg.key;

        return (
          <div key={mg.key} className="border border-gray-700/50 rounded-xl overflow-hidden">
            {/* Month header */}
            <div
              className="flex items-center justify-between flex-wrap gap-2 px-3 sm:px-5 py-3 sm:py-4 cursor-pointer hover:bg-gray-700/20 transition-colors bg-gray-800/40"
              onClick={() => setExpandedMonth(isMonthOpen ? null : mg.key)}
            >
              <div className="flex items-center gap-3">
                {isMonthOpen
                  ? <ChevronDown className="w-4 h-4 text-gray-400" />
                  : <ChevronRight className="w-4 h-4 text-gray-400" />}
                <div>
                  <span className="text-white font-bold text-base">{mg.label}</span>
                  <span className="text-gray-500 text-xs ml-2">{activeDays} günlük veri — {mgSales.length} satış</span>
                  {mgCross.length > 0 && <span className="text-orange-400 text-xs ml-2">{mgCross.length} Çapraz</span>}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right hidden md:block">
                  <div className="text-green-400 font-bold text-sm">₺{fmtNum(mt.totalTl,2)}</div>
                  <div className="text-gray-500 text-xs flex gap-2">
                    <span className="text-blue-400">KK: ₺{fmtNum(mt.kkTl,0)}</span>
                    <span>€</span>
                    <span className="text-green-300">N: ₺{fmtNum(mt.cashTl,0)}</span>
                    <span>€</span>
                    <span className="text-yellow-400">${fmtNum(mt.cashUsd,2)}</span>
                    <span>€</span>
                    <span className="text-orange-400">€{fmtNum(mt.cashEur,2)}</span>
                  </div>
                </div>
                {/* Month download */}
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <button
                    title="HTML indir"
                    onClick={() => {
                      const html = buildMonthHtml(mg.label, info.name, '', mg.days, usdRate, eurRate);
                      downloadHtml(html, `${kasaId}_${mg.key}.html`);
                    }}
                    className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    title="PDF yazdır"
                    onClick={() => {
                      const html = buildMonthHtml(mg.label, info.name, '', mg.days, usdRate, eurRate);
                      printAsPdf(html);
                    }}
                    className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Month summary (visible when open) */}
            {isMonthOpen && (
              <>
                {/* Month total strip */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-5 py-3 bg-gray-900/30 border-b border-gray-700/50">
                  {[
                    { label: 'Aylık Ciro',    val: `₺${fmtNum(mt.totalTl,2)}`,    color: 'text-green-400 font-bold text-base' },
                    { label: 'Kredi Kartı',   val: `₺${fmtNum(mt.kkTl,2)}`,       color: 'text-blue-400'                      },
                    { label: 'Nakit TL',      val: `₺${fmtNum(mt.cashTl,2)}`,      color: 'text-green-300'                     },
                    { label: 'Nakit $',       val: `$${fmtNum(mt.cashUsd,2)}`,      color: 'text-yellow-400'                    },
                    { label: 'Nakit €',       val: `€${fmtNum(mt.cashEur,2)}`,      color: 'text-orange-400'                    },
                  ].map(m => (
                    <div key={m.label} className="text-xs">
                      <div className="text-gray-500">{m.label}</div>
                      <div className={`${m.color} mt-0.5`}>{m.val}</div>
                    </div>
                  ))}
                </div>

                {/* Day list */}
                <div className="divide-y divide-gray-700/30">
                  {mg.days.map(day => {
                    const dt = calcTotals(day.sales, usdRate, eurRate);
                    const isDayOpen = expandedDay === day.date;
                    const isToday   = day.date === todayStr;

                    return (
                      <div key={day.date}>
                        {/* Day header row */}
                        <div
                          className={`flex items-center justify-between flex-wrap gap-2 px-3 sm:px-5 py-3 cursor-pointer transition-colors ${isDayOpen ? 'bg-gray-700/30' : 'hover:bg-gray-700/10'} ${isToday ? 'bg-blue-900/10' : ''}`}
                          onClick={() => setExpandedDay(isDayOpen ? null : day.date)}
                        >
                          <div className="flex items-center gap-2">
                            {isDayOpen
                              ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                              : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
                            <span className="text-sm font-medium text-white">
                              {fmtTR(day.date)}
                            </span>
                            <span className="text-gray-500 text-xs">{weekDay(day.date)}</span>
                            {isToday && <span className="text-xs bg-blue-600/30 text-blue-400 px-1.5 py-0.5 rounded font-medium">Bugün</span>}
                            {day.sales.length === 0 && <span className="text-gray-700 text-xs">— satış yok</span>}
                          </div>
                          <div className="flex items-center gap-4">
                            {day.sales.length > 0 && (
                              <div className="hidden md:flex gap-3 text-xs">
                                <span className="text-gray-500">{day.sales.length} satış</span>
                                <span className="text-green-400 font-semibold">₺{fmtNum(dt.totalTl,0)}</span>
                                {dt.kkTl > 0 && <span className="text-blue-400">KK:₺{fmtNum(dt.kkTl,0)}</span>}
                                {dt.cashUsd > 0 && <span className="text-yellow-400">${fmtNum(dt.cashUsd,2)}</span>}
                                {dt.cashEur > 0 && <span className="text-orange-400">€{fmtNum(dt.cashEur,2)}</span>}
                                {day.crossSales.length > 0 && <span className="text-orange-400">{day.crossSales.length}×</span>}
                              </div>
                            )}
                            {day.sales.length > 0 && (
                              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                <button
                                  title="HTML indir"
                                  onClick={() => {
                                    const html = buildDayHtml(day.date, info.name, '', day.sales, day.crossSales, usdRate, eurRate);
                                    downloadHtml(html, `${kasaId}_${day.date}.html`);
                                  }}
                                  className="p-1.5 sm:p-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 transition-colors"
                                >
                                  <Download className="w-3.5 sm:w-3 h-3.5 sm:h-3" />
                                </button>
                                <button
                                  title="PDF yazdır"
                                  onClick={() => {
                                    const html = buildDayHtml(day.date, info.name, '', day.sales, day.crossSales, usdRate, eurRate);
                                    printAsPdf(html);
                                  }}
                                  className="p-1.5 sm:p-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 transition-colors"
                                >
                                  <FileText className="w-3.5 sm:w-3 h-3.5 sm:h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Day expanded: sales table */}
                        {isDayOpen && day.sales.length > 0 && (() => {
                          const dayTot = calcTotals(day.sales, usdRate, eurRate);
                          return (
                            <div className="px-4 pt-2 pb-4 bg-gray-900/20 space-y-3">
                              {/* Mini summary cards */}
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                {[
                                  { label: 'Toplam Ciro', val: `₺${fmtNum(dayTot.totalTl,2)}`, color: 'text-green-400 font-bold' },
                                  { label: 'Kredi Kartı', val: `₺${fmtNum(dayTot.kkTl,2)}`,    color: 'text-blue-400'           },
                                  { label: 'Nakit TL',    val: `₺${fmtNum(dayTot.cashTl,2)}`,   color: 'text-green-300'          },
                                  { label: 'Nakit $',     val: `$${fmtNum(dayTot.cashUsd,2)}`,   color: 'text-yellow-400'         },
                                  { label: 'Nakit €',     val: `€${fmtNum(dayTot.cashEur,2)}`,   color: 'text-orange-400'         },
                                ].map(m => (
                                  <div key={m.label} className="bg-gray-800/60 border border-gray-700/40 rounded-lg px-3 py-2 text-xs">
                                    <div className="text-gray-500 text-[10px] uppercase tracking-wide">{m.label}</div>
                                    <div className={`${m.color} mt-0.5 text-sm`}>{m.val}</div>
                                  </div>
                                ))}
                              </div>

                              {/* Sales table */}
                              <div className="overflow-x-auto rounded-xl border border-gray-700/50">
                                <table className="w-full text-xs min-w-[560px]">
                                  <thead>
                                    <tr className="bg-gray-900/80 border-b border-gray-700/60">
                                      <th className="text-left px-3 py-2.5 text-gray-500 font-semibold w-8">#</th>
                                      <th className="text-left px-3 py-2.5 text-gray-500 font-semibold">Paket</th>
                                      <th className="text-left px-3 py-2.5 text-gray-500 font-semibold">Personel</th>
                                      <th className="text-center px-3 py-2.5 text-gray-500 font-semibold">Y / Ç</th>
                                      <th className="text-right px-3 py-2.5 text-blue-500/70 font-semibold">KK (?)</th>
                                      <th className="text-right px-3 py-2.5 text-green-500/70 font-semibold">Nakit (?)</th>
                                      <th className="text-right px-3 py-2.5 text-yellow-500/70 font-semibold">Nakit ($)</th>
                                      <th className="text-right px-3 py-2.5 text-orange-500/70 font-semibold">Nakit (€)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-700/20">
                                    {groupSalesByPackage(day.sales, new Set(day.crossSales.map(c => c.id))).map((g, i) => (
                                      <tr
                                        key={`${g.packageName}||${g.personnelName}||${i}`}
                                        className={`transition-colors hover:bg-gray-700/25 ${g.hasRefund ? 'border-l-2 border-red-500/60 bg-red-900/10' : g.isCross ? 'border-l-2 border-orange-500/60 bg-orange-900/5' : i % 2 === 0 ? 'bg-gray-800/10' : ''}`}
                                      >
                                        <td className="px-3 py-2 text-gray-600 tabular-nums">{i + 1}</td>
                                        <td className="px-3 py-2 max-w-[220px]">
                                          <div className="text-white font-medium truncate" title={g.packageName}>
                                            {g.hasRefund && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded mr-1.5 font-semibold">İade Edildi</span>}
                                            {g.isCross && <ArrowLeftRight className="w-3 h-3 inline text-orange-400 mr-1 shrink-0" />}
                                            {g.packageName}
                                          </div>
                                          {g.category && <div className="text-gray-600 text-[10px] truncate">{g.category}</div>}
                                          {g.hasRefund && g.refundReason && <div className="text-red-400 text-[10px] truncate mt-0.5" title={g.refundReason}>Neden: {g.refundReason}</div>}
                                          {g.kkRefundTxId && <div className="text-gray-500 text-[10px] truncate">Kredi Kartı İşlem No: {g.kkRefundTxId}</div>}
                                        </td>
                                        <td className="px-3 py-2 text-gray-300">
                                          <div className="flex items-center gap-1">
                                            <User className="w-3 h-3 text-gray-600 shrink-0" />
                                            <span className="truncate max-w-[110px]" title={g.personnelName}>{g.personnelName}</span>
                                          </div>
                                        </td>
                                        <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap">
                                          <span className="text-gray-300">{g.adultQty}</span>
                                          <span className="text-gray-600 mx-0.5">/</span>
                                          <span className="text-gray-400">{g.childQty}</span>
                                        </td>
                                        <td className="px-3 py-2 text-right text-blue-400 tabular-nums font-medium">
                                          {g.kkTl > 0 ? `₺${fmtNum(g.kkTl,2)}` : <span className="text-gray-700">—</span>}
                                        </td>
                                        <td className="px-3 py-2 text-right text-green-400 tabular-nums font-medium">
                                          {g.cashTl > 0 ? `₺${fmtNum(g.cashTl,2)}` : <span className="text-gray-700">—</span>}
                                        </td>
                                        <td className="px-3 py-2 text-right text-yellow-400 tabular-nums font-medium">
                                          {g.cashUsd > 0 ? `$${fmtNum(g.cashUsd,2)}` : <span className="text-gray-700">—</span>}
                                        </td>
                                        <td className="px-3 py-2 text-right text-orange-400 tabular-nums font-medium">
                                          {g.cashEur > 0 ? `€${fmtNum(g.cashEur,2)}` : <span className="text-gray-700">—</span>}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-gray-900/60 border-t-2 border-gray-600/50">
                                      <td colSpan={4} className="px-3 py-2.5 text-gray-400 font-semibold">
                                        {day.sales.length} satış &nbsp;·&nbsp; {dayTot.adultQty} Yetişkin &nbsp;·&nbsp; {dayTot.childQty} Çocuk
                                        &nbsp;·&nbsp; <span className="text-green-400">₺{fmtNum(dayTot.totalTl,2)} toplam ciro</span>
                                      </td>
                                      <td className="px-3 py-2.5 text-right text-blue-400 font-bold tabular-nums">₺{fmtNum(dayTot.kkTl,2)}</td>
                                      <td className="px-3 py-2.5 text-right text-green-400 font-bold tabular-nums">₺{fmtNum(dayTot.cashTl,2)}</td>
                                      <td className="px-3 py-2.5 text-right text-yellow-400 font-bold tabular-nums">${fmtNum(dayTot.cashUsd,2)}</td>
                                      <td className="px-3 py-2.5 text-right text-orange-400 font-bold tabular-nums">€{fmtNum(dayTot.cashEur,2)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          );
                        })()}
                        {isDayOpen && day.sales.length === 0 && (
                          <div className="px-5 pb-3 text-center text-gray-600 text-xs py-3">Bu gün satış kaydı yok</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}

      {monthGroups.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-gray-600">
          <AlertCircle className="w-8 h-8 mb-2" />
          <p className="text-sm">Seçilen dönem için veri bulunamadı</p>
        </div>
      )}
    </div>
  );
}

// ── Main: ReportsTab ───────────────────────────────────────────────────────────
export default function ReportsTab() {
  const [selectedKasa, setSelectedKasa]   = useState<KasaId | null>(null);
  const [period, setPeriod]               = useState<FilterPeriod>('month');

  const rates = useMemo(() => {
    try {
      const r = JSON.parse(localStorage.getItem('exchange_rates') || '{}');
      return { usd: Number(r.usd) || 35, eur: Number(r.eur) || 38 };
    } catch { return { usd: 35, eur: 38 }; }
  }, []);

  // Kasa selection screen
  if (!selectedKasa) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center justify-center">
            <Calendar className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Satış Raporları</h2>
            <p className="text-xs text-gray-500 mt-0.5">Günlük, haftalık ve aylık satış raporlarını görüntüleyin ve indirin</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex bg-gray-800 rounded-xl p-1 gap-1 w-fit">
          {PERIOD_OPTS.map(o => (
            <button
              key={o.key}
              onClick={() => setPeriod(o.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${period === o.key ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Kasa cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {(Object.entries(KASA_INFO) as [KasaId, typeof KASA_INFO[KasaId]][]).map(([id, info]) => (
            <button
              key={id}
              onClick={() => setSelectedKasa(id)}
              className={`${info.bg} border ${info.border} rounded-xl p-5 text-left hover:scale-[1.02] active:scale-[0.99] transition-all shadow-boltify-card group`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0`} style={{background: 'rgba(255,255,255,0.05)'}}><info.Icon className={`w-6 h-6 ${info.text}`} /></div>
                <p className={`text-lg font-bold ${info.text}`}>{info.name}</p>
              </div>
              <p className="text-gray-500 text-sm">Raporları görüntüle</p>
              <div className="flex flex-wrap gap-2 mt-4">
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <FileText className="w-3.5 h-3.5" /> HTML / PDF İndir
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <TrendingUp className="w-3.5 h-3.5" /> Personel Bazlı
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <ArrowLeftRight className="w-3.5 h-3.5" /> Çapraz Satış
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-600 pt-2">
          <div className="flex items-center gap-1.5"><Banknote className="w-3.5 h-3.5 text-green-500" /> Nakit TL</div>
          <div className="flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5 text-blue-500" /> Kredi Kartı</div>
          <div className="flex items-center gap-1.5"><span className="text-yellow-500 font-bold text-sm">$</span> Nakit USD</div>
          <div className="flex items-center gap-1.5"><span className="text-orange-500 font-bold text-sm">€</span> Nakit EUR</div>
          <div className="flex items-center gap-1.5"><ArrowLeftRight className="w-3.5 h-3.5 text-orange-400" /> Çapraz Satış</div>
          <div className="flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5 text-red-400" /> İade (negatif tutar)</div>
        </div>
      </div>
    );
  }

  const info = KASA_INFO[selectedKasa];

  return (
    <div className="space-y-4">
      {/* Header with back + period */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedKasa(null)}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${info.bg} border ${info.border} rounded-xl flex items-center justify-center`}>
              <info.Icon className={`w-5 h-5 ${info.text}`} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">{info.name} — Raporlar</h2>
              <p className="text-xs text-gray-500 mt-0.5">Aya göre gruplu — gün detayı için tıklayın</p>
            </div>
          </div>
        </div>
        <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
          {PERIOD_OPTS.map(o => (
            <button
              key={o.key}
              onClick={() => setPeriod(o.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === o.key ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <KasaView kasaId={selectedKasa} period={period} usdRate={rates.usd} eurRate={rates.eur} />
    </div>
  );
}
