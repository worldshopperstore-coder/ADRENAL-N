import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, Package, ArrowLeftRight, BarChart2,
  Award, Star, Shuffle, Info, Target,
  TreePine, Monitor, Users2,
} from 'lucide-react';
import {
  getAllSalesForDateRange,
  getAllCrossSalesForDateRange,
  getShiftsAll,
  type DatedSale,
} from '@/utils/performanceDB';
import { getAllPersonnelFromFirebase } from '@/utils/personnelSupabaseDB';
import { INITIAL_PACKAGES } from '@/data/packages';
import { getAllWeeklyTargets, getWeeklyProgress, getCurrentWeekStart, getWeekEnd } from '@/utils/weeklyTargetsDB';
import type { Personnel } from '@/types/personnel';

// ── Types ──────────────────────────────────────────────────────────────────────
type Period = 'week' | 'month' | 'lastMonth' | '3months';
type View   = 'kasa' | 'packages' | 'cross' | 'target';

// ── Constants ──────────────────────────────────────────────────────────────────
const KASA_INFO: Record<string, { name: string; Icon: React.FC<any>; bar: string; text: string; border: string; bg: string }> = {
  wildpark:  { name: 'WildPark',  Icon: TreePine, bar: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-gray-800', bg: 'bg-emerald-500/10' },
  sinema:    { name: 'XD Sinema', Icon: Monitor,  bar: 'bg-violet-500',  text: 'text-violet-400',  border: 'border-gray-800', bg: 'bg-violet-500/10'  },
  face2face: { name: 'Face2Face', Icon: Users2,   bar: 'bg-sky-500',     text: 'text-sky-400',     border: 'border-gray-800', bg: 'bg-sky-500/10'     },
};

const CATEGORIES = ['Münferit', 'Visitor', 'Çapraz Münferit', 'Çapraz Visitor', 'Acenta'] as const;

const CAT_BARS: Record<string, string> = {
  'Münferit':        'bg-emerald-500',
  'Visitor':         'bg-blue-500',
  'Çapraz Münferit': 'bg-orange-500',
  'Çapraz Visitor':  'bg-purple-500',
  'Acenta':          'bg-pink-500',
};
const CAT_TEXT: Record<string, string> = {
  'Münferit':        'text-emerald-400',
  'Visitor':         'text-blue-400',
  'Çapraz Münferit': 'text-orange-400',
  'Çapraz Visitor':  'text-purple-400',
  'Acenta':          'text-pink-400',
};

const PERIOD_OPTS: { key: Period; label: string }[] = [
  { key: 'week',      label: 'Bu Hafta'  },
  { key: 'month',     label: 'Bu Ay'     },
  { key: 'lastMonth', label: 'Geçen Ay'  },
  { key: '3months',   label: 'Son 3 Ay'  },
];

const VIEW_TABS: { key: View; icon: React.ReactNode; label: string }[] = [
  { key: 'kasa',      icon: <BarChart2 className="w-4 h-4" />,       label: 'Kasa Özeti'      },
  { key: 'packages',  icon: <Package className="w-4 h-4" />,         label: 'Paket & Kategori'},
  { key: 'cross',     icon: <Shuffle className="w-4 h-4" />,         label: 'Çapraz Satış'    },
  { key: 'target',    icon: <Target className="w-4 h-4" />,          label: 'Haftalık Hedef'  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function getDateRange(period: Period): { start: string; end: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  if (period === 'week') {
    const s = new Date(today); s.setDate(s.getDate() - 6);
    return { start: fmt(s), end: fmt(today) };
  }
  if (period === 'month') {
    return { start: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), end: fmt(today) };
  }
  if (period === 'lastMonth') {
    const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const e = new Date(today.getFullYear(), today.getMonth(), 0);
    return { start: fmt(s), end: fmt(e) };
  }
  const s = new Date(today); s.setMonth(s.getMonth() - 3);
  return { start: fmt(s), end: fmt(today) };
}

function toTL(s: DatedSale, usdRate: number, eurRate: number): number {
  return (s.kkTl || 0) + (s.cashTl || 0) + (s.cashUsd || 0) * usdRate + (s.cashEur || 0) * eurRate;
}

function calcWeeklyHours(schedule: any): number {
  if (!schedule) return 0;
  const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  let total = 0;
  for (const day of DAYS) {
    const d = schedule[day];
    if (!d?.active) continue;
    const [sh, sm] = String(d.start || '09:00').split(':').map(Number);
    const [eh, em] = String(d.end || '17:00').split(':').map(Number);
    const hrs = (eh * 60 + em - (sh * 60 + sm)) / 60;
    if (hrs > 0) total += hrs;
  }
  return Math.round(total * 10) / 10;
}

function guessCategory(packageName: string, category?: string): string {
  if (category) return category;
  const pkg = INITIAL_PACKAGES.find(p => p.name === packageName);
  if (pkg) return pkg.category;
  if (packageName.startsWith('Ç.V') || packageName.toLowerCase().includes('çapraz visitor')) return 'Çapraz Visitor';
  if (packageName.startsWith('Ç.') || packageName.toLowerCase().includes('çapraz')) return 'Çapraz Münferit';
  if (packageName.startsWith('Acenta')) return 'Acenta';
  if (packageName.startsWith('V') || packageName.toLowerCase().includes('visitor')) return 'Visitor';
  return 'Münferit';
}

const fmtNum = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });

// ── Sub-view: Kasa Özeti ────────────────────────────────────────────────────────
function KasaOzetiView({ sales, crossSales, rates }: {
  sales: DatedSale[];
  crossSales: DatedSale[];
  rates: { usd: number; eur: number };
}) {
  const kasaData = useMemo(() => {
    return ['wildpark', 'sinema', 'face2face'].map(kasaId => {
      const ks = sales.filter(s => s.kasaId === kasaId);
      const kc = crossSales.filter(s => s.kasaId === kasaId);
      const revenue = ks.reduce((acc, s) => acc + toTL(s, rates.usd, rates.eur), 0);

      const catMap: Record<string, { count: number; revenue: number }> = {};
      for (const s of ks) {
        const cat = guessCategory(s.packageName, s.category);
        if (!catMap[cat]) catMap[cat] = { count: 0, revenue: 0 };
        catMap[cat].count += (s.adultQty || 0) + (s.childQty || 0);
        catMap[cat].revenue += toTL(s, rates.usd, rates.eur);
      }

      const pkgMap: Record<string, number> = {};
      for (const s of ks) pkgMap[s.packageName] = (pkgMap[s.packageName] || 0) + (s.adultQty || 0) + (s.childQty || 0);
      const topPkg = Object.entries(pkgMap).sort((a, b) => b[1] - a[1])[0];

      // Daily revenue map
      const dailyMap: Record<string, number> = {};
      for (const s of ks) dailyMap[s.date] = (dailyMap[s.date] || 0) + toTL(s, rates.usd, rates.eur);

      return {
        kasaId,
        revenue,
        crossCount: kc.length,
        saleCount: ks.length,
        catMap,
        topPkg: topPkg ? topPkg[0] : null,
        dailyMap,
      };
    });
  }, [sales, crossSales, rates]);

  const maxRev      = Math.max(...kasaData.map(k => k.revenue), 1);
  const totalRevenue = kasaData.reduce((a, k) => a + k.revenue, 0);

  // Daily trend across all kasas
  const allDates = useMemo(() => {
    const dates = new Set<string>();
    sales.forEach(s => dates.add(s.date));
    return [...dates].sort();
  }, [sales]);

  const maxDailyRev = useMemo(() => {
    if (allDates.length === 0) return 1;
    return Math.max(...allDates.map(date => kasaData.reduce((a, k) => a + (k.dailyMap[date] || 0), 0)), 1);
  }, [allDates, kasaData]);

  return (
    <div className="space-y-5">
      {/* 3 Kasa cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kasaData.map(k => {
          const info = KASA_INFO[k.kasaId];
          const pct  = totalRevenue > 0 ? Math.round((k.revenue / totalRevenue) * 100) : 0;
          const catEntries = Object.entries(k.catMap).sort((a, b) => b[1].revenue - a[1].revenue);

          return (
            <div key={k.kasaId} className={`bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 space-y-3 shadow-boltify-card`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg ${info.bg} border ${info.border} flex items-center justify-center`}><info.Icon className={`w-4 h-4 ${info.text}`} /></div>
                  <span className={`font-bold text-sm ${info.text}`}>{info.name}</span>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${info.border} ${info.text}`}>{pct}%</span>
              </div>

              <div>
                <p className="text-xs text-gray-500">Toplam Ciro</p>
                <p className="text-xl sm:text-2xl font-bold text-white">₺{fmtNum(k.revenue)}</p>
              </div>

              {/* Revenue bar */}
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full ${info.bar} rounded-full transition-all`} style={{ width: `${(k.revenue / maxRev) * 100}%` }} />
              </div>

              <div className="flex flex-wrap gap-3 text-xs">
                <span className="text-gray-400">{k.saleCount} satış</span>
                <span className="text-orange-400 font-medium">{k.crossCount} çapraz</span>
                {k.topPkg && <span className={`${info.text} font-semibold`}><Star className="w-3 h-3 inline" /> {k.topPkg}</span>}
              </div>

              {/* Category mini bars */}
              {catEntries.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-gray-800">
                  {catEntries.slice(0, 5).map(([cat, data]) => {
                    const catPct = k.revenue > 0 ? (data.revenue / k.revenue) * 100 : 0;
                    return (
                      <div key={cat}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className={`${CAT_TEXT[cat] || 'text-gray-400'}`}>{cat}</span>
                          <span className="text-gray-500">{Math.round(catPct)}%</span>
                        </div>
                        <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full ${CAT_BARS[cat] || 'bg-gray-500'} rounded-full`} style={{ width: `${catPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {catEntries.length === 0 && (
                <p className="text-xs text-gray-600 text-center py-2">Bu dönemde veri yok</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Revenue comparison bar chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-boltify-card">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-orange-400" /> Kasa Ciro Karşılaştırması
        </h3>
        <div className="space-y-3">
          {kasaData.sort((a, b) => b.revenue - a.revenue).map(k => {
            const info = KASA_INFO[k.kasaId];
            const pct  = totalRevenue > 0 ? (k.revenue / totalRevenue) * 100 : 0;
            return (
              <div key={k.kasaId} className="flex items-center gap-3">
                <span className={`w-24 text-xs font-medium ${info.text} flex-shrink-0`}><info.Icon className="w-3 h-3 inline mr-1" />{info.name}</span>
                <div className="flex-1 h-7 bg-gray-700 rounded-lg overflow-hidden">
                  <div
                    className={`h-full ${info.bar} rounded-lg flex items-center px-2 transition-all`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  >
                    {pct > 18 && <span className="text-white text-xs font-bold">₺{fmtNum(k.revenue)}</span>}
                  </div>
                </div>
                {pct <= 18 && <span className="text-gray-400 text-xs w-28 flex-shrink-0">₺{fmtNum(k.revenue)}</span>}
                <span className="text-gray-500 text-xs w-8 flex-shrink-0 text-right">{Math.round(pct)}%</span>
              </div>
            );
          })}
          {totalRevenue === 0 && (
            <p className="text-gray-600 text-sm text-center py-4">Seçilen dönemde satış verisi bulunamadı</p>
          )}
        </div>
      </div>

      {/* Daily trend */}
      {allDates.length > 1 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-5 shadow-boltify-card">
          <h3 className="text-sm font-semibold text-white mb-4">Günlük Ciro Trendi</h3>
          <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ minHeight: '80px' }}>
            {allDates.map(date => {
              const dayRevs = kasaData.map(k => ({ kasaId: k.kasaId, rev: k.dailyMap[date] || 0 }));
              const dayTotal = dayRevs.reduce((a, r) => a + r.rev, 0);
              const barH = maxDailyRev > 0 ? Math.max((dayTotal / maxDailyRev) * 60, 4) : 4;
              return (
                <div key={date} className="flex flex-col items-center gap-1 min-w-[24px] sm:min-w-[32px]" title={`${date}: ₺${fmtNum(dayTotal)}`}>
                  <span className="text-gray-500 text-xs" style={{ fontSize: '10px' }}>₺{fmtNum(dayTotal / 1000)}K</span>
                  {/* Stacked bar per kasa */}
                  <div className="w-5 flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${barH}px` }}>
                    {dayRevs.map(r => r.rev > 0 && (
                      <div
                        key={r.kasaId}
                        className={`${KASA_INFO[r.kasaId]?.bar || 'bg-gray-500'}`}
                        style={{ height: `${(r.rev / dayTotal) * 100}%` }}
                      />
                    ))}
                  </div>
                  <span className="text-gray-600 text-xs" style={{ fontSize: '9px' }}>{date.slice(5)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-2">
            {['wildpark', 'sinema', 'face2face'].map(k => (
              <div key={k} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-sm ${KASA_INFO[k].bar}`} />
                <span className="text-xs text-gray-500">{KASA_INFO[k].name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-view: Paket & Kategori ──────────────────────────────────────────────────
function PaketKategoriView({ sales, rates }: {
  sales: DatedSale[];
  rates: { usd: number; eur: number };
}) {
  const [kasaFilter, setKasaFilter] = useState<string>('all');

  const filtered      = kasaFilter === 'all' ? sales : sales.filter(s => s.kasaId === kasaFilter);
  const totalRevenue  = filtered.reduce((acc, s) => acc + toTL(s, rates.usd, rates.eur), 0);
  const totalPersons  = filtered.reduce((acc, s) => acc + (s.adultQty || 0) + (s.childQty || 0), 0);

  const categoryStats = useMemo(() => {
    const catMap: Record<string, { count: number; revenue: number; adultQty: number; childQty: number }> = {};
    for (const s of filtered) {
      const cat = guessCategory(s.packageName, s.category);
      if (!catMap[cat]) catMap[cat] = { count: 0, revenue: 0, adultQty: 0, childQty: 0 };
      catMap[cat].count++;
      catMap[cat].adultQty += s.adultQty || 0;
      catMap[cat].childQty += s.childQty || 0;
      catMap[cat].revenue += toTL(s, rates.usd, rates.eur);
    }
    return CATEGORIES.map(cat => ({
      cat,
      ...(catMap[cat] || { count: 0, revenue: 0, adultQty: 0, childQty: 0 }),
      pct: totalRevenue > 0 ? ((catMap[cat]?.revenue || 0) / totalRevenue) * 100 : 0,
    })).sort((a, b) => b.revenue - a.revenue);
  }, [filtered, totalRevenue]);

  const packageStats = useMemo(() => {
    const pkgMap: Record<string, { count: number; revenue: number; category: string; adultQty: number; childQty: number }> = {};
    for (const s of filtered) {
      const cat = guessCategory(s.packageName, s.category);
      if (!pkgMap[s.packageName]) pkgMap[s.packageName] = { count: 0, revenue: 0, category: cat, adultQty: 0, childQty: 0 };
      pkgMap[s.packageName].count++;
      pkgMap[s.packageName].adultQty += s.adultQty || 0;
      pkgMap[s.packageName].childQty += s.childQty || 0;
      pkgMap[s.packageName].revenue += toTL(s, rates.usd, rates.eur);
    }
    return Object.entries(pkgMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);
  }, [filtered]);

  return (
    <div className="space-y-5">
      {/* Kasa filter */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'all',       label: 'Tümü'       },
          { key: 'wildpark',  label: 'WildPark' },
          { key: 'sinema',    label: 'XD Sinema'},
          { key: 'face2face', label: 'Face2Face'},
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setKasaFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${kasaFilter === f.key ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-500 self-center">{totalPersons} kişi · {filtered.length} satış</span>
      </div>

      {/* Category bars */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-boltify-card">
        <h3 className="text-sm font-semibold text-white mb-4">Kategori Dağılımı</h3>
        <div className="space-y-3">
          {categoryStats.map(({ cat, revenue, adultQty, childQty, pct }) => (
            <div key={cat}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${CAT_TEXT[cat] || 'text-gray-400'}`}>{cat}</span>
                  <span className="text-gray-500 text-xs">{adultQty}Y + {childQty}Ç = {adultQty + childQty} kişi</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-white text-sm font-semibold">₺{fmtNum(revenue)}</span>
                  <span className="text-gray-500 text-xs w-9 text-right">{Math.round(pct)}%</span>
                </div>
              </div>
              <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full ${CAT_BARS[cat] || 'bg-gray-500'} rounded-full transition-all`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
          {totalRevenue === 0 && (
            <p className="text-gray-600 text-sm text-center py-4">Seçilen dönem / kasa için veri bulunamadı</p>
          )}
        </div>
      </div>

      {/* Top packages table */}
      {packageStats.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-boltify-card">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Paket Sıralaması — Top {packageStats.length}</h3>
            <span className="text-xs text-gray-500">Ciroya göre</span>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-gray-700/30 bg-gray-900/30">
                <th className="text-center px-3 py-2 text-xs text-gray-500 w-10">#</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500">Paket</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500">Kategori</th>
                <th className="text-center px-4 py-2 text-xs text-gray-500">Y / Ç</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500">Ciro</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500 w-20">Pay</th>
              </tr>
            </thead>
            <tbody>
              {packageStats.map((pkg, i) => {
                const sharePct = totalRevenue > 0 ? (pkg.revenue / totalRevenue) * 100 : 0;
                return (
                  <tr key={pkg.name} className="border-b border-gray-700/20 hover:bg-gray-700/10">
                    <td className="px-3 py-2.5 text-center">
                      {i === 0
                        ? <Award className="w-4 h-4 text-yellow-400 mx-auto" />
                        : i === 1
                        ? <Award className="w-4 h-4 text-gray-400 mx-auto" />
                        : i === 2
                        ? <Award className="w-4 h-4 text-amber-700 mx-auto" />
                        : <span className="text-gray-600 text-xs">{i + 1}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-white font-medium">{pkg.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs ${CAT_TEXT[pkg.category] || 'text-gray-400'}`}>{pkg.category}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-gray-400 text-xs">{pkg.adultQty}Y / {pkg.childQty}Ç</td>
                    <td className="px-4 py-2.5 text-right text-white font-semibold">₺{fmtNum(pkg.revenue)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-14 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${sharePct}%` }} />
                        </div>
                        <span className="text-gray-500 text-xs">{Math.round(sharePct)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-view: Çapraz Satış ──────────────────────────────────────────────────────
function CrosaSatisView({ sales, crossSales, rates }: {
  sales: DatedSale[];
  crossSales: DatedSale[];
  rates: { usd: number; eur: number };
}) {
  const totalRev  = sales.reduce((acc, s) => acc + toTL(s, rates.usd, rates.eur), 0);
  const crossRev  = crossSales.reduce((acc, s) => acc + toTL(s, rates.usd, rates.eur), 0);
  const crossRate = sales.length > 0 ? (crossSales.length / sales.length) * 100 : 0;

  const byKasa = useMemo(() => {
    return ['wildpark', 'sinema', 'face2face'].map(kasaId => {
      const kc  = crossSales.filter(s => s.kasaId === kasaId);
      const ks  = sales.filter(s => s.kasaId === kasaId);
      const rev = kc.reduce((acc, s) => acc + toTL(s, rates.usd, rates.eur), 0);
      const persons = kc.reduce((acc, s) => acc + (s.adultQty || 0) + (s.childQty || 0), 0);
      const crossPct = ks.length > 0 ? (kc.length / ks.length) * 100 : 0;
      return { kasaId, count: kc.length, revenue: rev, totalSales: ks.length, crossPct, persons };
    }).sort((a, b) => b.count - a.count);
  }, [sales, crossSales, rates]);

  const maxCross = Math.max(...byKasa.map(k => k.count), 1);

  const topCrossPackages = useMemo(() => {
    const pkgMap: Record<string, { count: number; revenue: number; kasas: Set<string>; adultQty: number; childQty: number }> = {};
    for (const s of crossSales) {
      if (!pkgMap[s.packageName]) pkgMap[s.packageName] = { count: 0, revenue: 0, kasas: new Set(), adultQty: 0, childQty: 0 };
      pkgMap[s.packageName].count++;
      pkgMap[s.packageName].adultQty += s.adultQty || 0;
      pkgMap[s.packageName].childQty += s.childQty || 0;
      pkgMap[s.packageName].revenue += toTL(s, rates.usd, rates.eur);
      pkgMap[s.packageName].kasas.add(s.kasaId);
    }
    return Object.entries(pkgMap)
      .map(([name, d]) => ({ name, count: d.count, revenue: d.revenue, kasas: [...d.kasas], adultQty: d.adultQty, childQty: d.childQty }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [crossSales, rates]);

  const dailyCross = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of crossSales) map[s.date] = (map[s.date] || 0) + 1;
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [crossSales]);

  const maxDailyCross = Math.max(...dailyCross.map(([, v]) => v), 1);

  // Cross-sale category breakdown
  const crossCatStats = useMemo(() => {
    const catMap: Record<string, number> = {};
    for (const s of crossSales) {
      const cat = guessCategory(s.packageName, s.category);
      catMap[cat] = (catMap[cat] || 0) + 1;
    }
    return Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  }, [crossSales]);

  return (
    <div className="space-y-5">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Toplam Çapraz Satış', value: crossSales.length, sub: 'adet', color: 'text-orange-400' },
          { label: 'Çapraz Satış Cirosu', value: `₺${fmtNum(crossRev)}`, sub: 'TL eşdeğeri', color: 'text-orange-400' },
          {
            label: 'Çapraz Satış Oranı',
            value: `${crossRate.toFixed(1)}%`,
            sub: 'toplam satıştan',
            color: crossRate >= 20 ? 'text-green-400' : crossRate >= 10 ? 'text-yellow-400' : 'text-red-400',
          },
          {
            label: 'Gelire Katkısı',
            value: totalRev > 0 ? `${((crossRev / totalRev) * 100).toFixed(1)}%` : '0%',
            sub: 'toplam ciroda',
            color: 'text-purple-400',
          },
        ].map(m => (
          <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-boltify-card">
            <p className="text-xs text-gray-500">{m.label}</p>
            <p className={`text-xl font-bold mt-1 ${m.color}`}>{m.value}</p>
            <p className="text-xs text-gray-600 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* By kasa */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-boltify-card">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-orange-400" /> Kasa Bazlı Çapraz Satış
          </h3>
          <div className="space-y-4">
            {byKasa.map(k => {
              const info = KASA_INFO[k.kasaId];
              return (
                <div key={k.kasaId}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-medium ${info.text}`}><info.Icon className="w-3 h-3 inline mr-1" />{info.name}</span>
                    <div className="text-right">
                      <span className="text-white text-sm font-bold">{k.count}</span>
                      <span className="text-gray-500 text-xs ml-1">satış</span>
                      <span className="text-gray-500 text-xs ml-2">· {k.persons} kişi</span>
                      <span className="text-gray-600 text-xs ml-2">({k.crossPct.toFixed(0)}%)</span>
                    </div>
                  </div>
                  <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full ${info.bar} rounded-full transition-all`} style={{ width: `${(k.count / maxCross) * 100}%` }} />
                  </div>
                  <div className="flex justify-between text-xs mt-0.5">
                    <span className="text-gray-600">Toplam satıştan: {k.crossPct.toFixed(1)}%</span>
                    <span className="text-gray-500">₺{fmtNum(k.revenue)}</span>
                  </div>
                </div>
              );
            })}
            {crossSales.length === 0 && (
              <p className="text-gray-600 text-sm text-center py-4">Bu dönemde çapraz satış verisi yok</p>
            )}
          </div>
        </div>

        {/* Top cross packages */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-boltify-card">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" /> En Çok Çapraz Satılan Paketler
          </h3>
          {topCrossPackages.length > 0 ? (
            <div className="space-y-2">
              {topCrossPackages.map((pkg, i) => (
                <div key={pkg.name} className="flex items-center justify-between py-2 border-b border-gray-700/30 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 text-xs w-4 flex-shrink-0">{i + 1}</span>
                    <div>
                      <p className="text-white text-sm font-medium">{pkg.name}</p>
                      <div className="flex gap-1 mt-0.5">
                        {pkg.kasas.map(kid => {
                          const KIcon = KASA_INFO[kid]?.Icon;
                          return (
                          <span key={kid} className={`text-xs ${KASA_INFO[kid]?.text || 'text-gray-400'}`}>
                            {KIcon && <KIcon className="w-3 h-3" />}
                          </span>
                          );
                        })}
                        <span className="text-gray-600 text-xs">{pkg.adultQty}Y + {pkg.childQty}Ç</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-orange-400 font-semibold text-sm">{pkg.count} satış</p>
                    <p className="text-gray-500 text-xs">₺{fmtNum(pkg.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 text-sm text-center py-4">Çapraz satış verisi bulunamadı</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Cross-sale category breakdown */}
        {crossCatStats.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-boltify-card">
            <h3 className="text-sm font-semibold text-white mb-4">Çapraz Satış Kategori Dağılımı</h3>
            <div className="space-y-2.5">
              {crossCatStats.map(([cat, count]) => {
                const pct = crossSales.length > 0 ? (count / crossSales.length) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className={CAT_TEXT[cat] || 'text-gray-400'}>{cat}</span>
                      <span className="text-gray-400">{count} · {Math.round(pct)}%</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full ${CAT_BARS[cat] || 'bg-gray-500'} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Daily trend */}
        {dailyCross.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-boltify-card">
            <h3 className="text-sm font-semibold text-white mb-4">Günlük Çapraz Satış Trendi</h3>
            <div className="flex items-end gap-1 overflow-x-auto" style={{ minHeight: '70px' }}>
              {dailyCross.map(([date, count]) => (
                <div key={date} className="flex flex-col items-center gap-1 min-w-[20px] sm:min-w-[28px]" title={`${date}: ${count} çapraz satış`}>
                  <span className="text-gray-500" style={{ fontSize: '10px' }}>{count}</span>
                  <div
                    className="w-5 bg-orange-500 hover:bg-orange-400 rounded-t transition-colors"
                    style={{ height: `${Math.max((count / maxDailyCross) * 50, 4)}px` }}
                  />
                  <span className="text-gray-600" style={{ fontSize: '9px' }}>{date.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Info note */}
      <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-5 py-3 text-xs text-orange-400 flex items-center gap-2">
        <Info className="w-4 h-4 flex-shrink-0" /> Çapraz satışlar kasalar arası bağlı olarak kaydedilmektedir. Bir kasadan diğer kasaya yönlendirilen her satış çapraz satış olarak işlenir.
      </div>
    </div>
  );
}

// ── Sub-view: Haftalık Hedef ─────────────────────────────────────────────────
function HaftalikHedefView() {
  const [loading, setLoading] = useState(true);
  const [kasaProgress, setKasaProgress] = useState<{
    kasaId: string;
    targetAmount: number;
    currentAmount: number;
    percentage: number;
    personnelBreakdown: { personnelId: string; personnelName: string; totalTl: number; percentage: number }[];
  }[]>([]);

  useEffect(() => {
    const weekStart = getCurrentWeekStart();
    setLoading(true);

    Promise.all([
      getAllWeeklyTargets(weekStart),
      ...['wildpark', 'sinema', 'face2face'].map(k => getWeeklyProgress(k, weekStart)),
    ]).then(([targets, wpProgress, snProgress, f2fProgress]) => {
      const progressMap: Record<string, typeof wpProgress> = {
        wildpark: wpProgress,
        sinema: snProgress,
        face2face: f2fProgress,
      };

      const result = ['wildpark', 'sinema', 'face2face'].map(kasaId => {
        const target = targets.find(t => t.kasaId === kasaId);
        const progress = progressMap[kasaId];
        const targetAmount = target?.targetAmount || 0;
        const currentAmount = progress?.totalTl || 0;
        const percentage = targetAmount > 0 ? Math.min((currentAmount / targetAmount) * 100, 100) : 0;

        return {
          kasaId,
          targetAmount,
          currentAmount,
          percentage,
          personnelBreakdown: progress?.personnelBreakdown || [],
        };
      });

      setKasaProgress(result);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const weekStart = getCurrentWeekStart();
  const weekEnd = getWeekEnd(weekStart);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Tüm kasalar genelinde en çok katkı sağlayan personel
  const allPersonnelMap: Record<string, { name: string; totalTl: number }> = {};
  for (const k of kasaProgress) {
    for (const p of k.personnelBreakdown) {
      if (!allPersonnelMap[p.personnelId]) allPersonnelMap[p.personnelId] = { name: p.personnelName, totalTl: 0 };
      allPersonnelMap[p.personnelId].totalTl += p.totalTl;
    }
  }
  const topOverall = Object.entries(allPersonnelMap)
    .map(([id, d]) => ({ id, name: d.name, totalTl: d.totalTl }))
    .sort((a, b) => b.totalTl - a.totalTl);

  const totalTarget = kasaProgress.reduce((a, k) => a + k.targetAmount, 0);
  const totalCurrent = kasaProgress.reduce((a, k) => a + k.currentAmount, 0);
  const totalPct = totalTarget > 0 ? Math.min((totalCurrent / totalTarget) * 100, 100) : 0;

  return (
    <div className="space-y-5">
      {/* Hafta bilgisi */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-boltify-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-rose-400" />
            <span className="text-sm font-bold text-white">Haftalık Hedef Özeti</span>
          </div>
          <span className="text-xs text-gray-500">{weekStart} → {weekEnd}</span>
        </div>
        {totalTarget > 0 ? (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">Genel İlerleme</span>
              <span className={`text-lg font-black ${
                totalPct >= 100 ? 'text-emerald-400' :
                totalPct >= 75 ? 'text-amber-400' :
                totalPct >= 50 ? 'text-orange-400' :
                'text-rose-400'
              }`}>%{totalPct.toFixed(1)}</span>
            </div>
            <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  totalPct >= 100 ? 'bg-gradient-to-r from-emerald-500 to-green-400' :
                  totalPct >= 75 ? 'bg-gradient-to-r from-amber-500 to-yellow-400' :
                  totalPct >= 50 ? 'bg-gradient-to-r from-orange-500 to-amber-400' :
                  'bg-gradient-to-r from-rose-500 to-red-400'
                }`}
                style={{ width: `${totalPct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>₺{fmtNum(totalCurrent)}</span>
              <span>Hedef: ₺{fmtNum(totalTarget)}</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-600 mt-2">Bu hafta için hedef belirlenmemiş. Avanslar sekmesinden hedef girebilirsiniz.</p>
        )}
      </div>

      {/* Kasa bazlı hedef kartları */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kasaProgress.map(k => {
          const info = KASA_INFO[k.kasaId];
          return (
            <div key={k.kasaId} className="bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-boltify-card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg ${info.bg} border ${info.border} flex items-center justify-center`}>
                    <info.Icon className={`w-4 h-4 ${info.text}`} />
                  </div>
                  <span className={`font-bold text-sm ${info.text}`}>{info.name}</span>
                </div>
                <span className={`text-lg font-black ${
                  k.percentage >= 100 ? 'text-emerald-400' :
                  k.percentage >= 75 ? 'text-amber-400' :
                  k.percentage >= 50 ? 'text-orange-400' :
                  'text-rose-400'
                }`}>
                  {k.targetAmount > 0 ? `%${k.percentage.toFixed(1)}` : '—'}
                </span>
              </div>

              {k.targetAmount > 0 ? (
                <>
                  <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${info.bar}`}
                      style={{ width: `${k.percentage}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>₺{fmtNum(k.currentAmount)}</span>
                    <span>₺{fmtNum(k.targetAmount)}</span>
                  </div>

                  {/* Personel katkıları */}
                  {k.personnelBreakdown.length > 0 && (
                    <div className="border-t border-gray-800 pt-2 space-y-1.5">
                      <span className="text-xs text-gray-500 font-medium">Personel Katkıları</span>
                      {k.personnelBreakdown.slice(0, 5).map((p, i) => {
                        const pPct = k.targetAmount > 0 ? (p.totalTl / k.targetAmount) * 100 : 0;
                        return (
                          <div key={p.personnelId} className="flex items-center gap-2">
                            <span className="text-xs w-4 text-gray-600 flex-shrink-0">
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                            </span>
                            <span className="text-xs text-gray-300 flex-1 truncate">{p.personnelName}</span>
                            <span className="text-xs text-gray-500">{pPct.toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-600 text-center py-2">Hedef belirlenmemiş</p>
              )}

              {k.percentage >= 100 && (
                <p className="text-xs text-emerald-400 font-bold text-center animate-pulse">🎉 Hedef tamamlandı!</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Genel personel sıralaması */}
      {topOverall.length > 0 && totalTarget > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-boltify-card">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Award className="w-4 h-4 text-yellow-400" /> Genel Personel Katkı Sıralaması
          </h3>
          <div className="space-y-2">
            {topOverall.map((p, i) => {
              const pPct = totalTarget > 0 ? (p.totalTl / totalTarget) * 100 : 0;
              const maxTl = topOverall[0]?.totalTl || 1;
              return (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="w-6 text-center flex-shrink-0">
                    {i === 0 ? <Award className="w-4 h-4 text-yellow-400 mx-auto" /> :
                     i === 1 ? <Award className="w-4 h-4 text-gray-400 mx-auto" /> :
                     i === 2 ? <Award className="w-4 h-4 text-amber-700 mx-auto" /> :
                     <span className="text-xs text-gray-600">{i + 1}</span>}
                  </span>
                  <span className="text-sm text-white font-medium w-32 flex-shrink-0 truncate">{p.name}</span>
                  <div className="flex-1 h-5 bg-gray-800 rounded-lg overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-lg transition-all"
                      style={{ width: `${(p.totalTl / maxTl) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-20 text-right flex-shrink-0">₺{fmtNum(p.totalTl)}</span>
                  <span className="text-xs text-gray-500 w-10 text-right flex-shrink-0">{pPct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PerformanceTab() {
  const [period, setPeriod]       = useState<Period>('month');
  const [view, setView]           = useState<View>('kasa');
  const [sales, setSales]         = useState<DatedSale[]>([]);
  const [crossSales, setCross]    = useState<DatedSale[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [shifts, setShifts]       = useState<Record<string, any>>({});
  const [loading, setLoading]     = useState(true);

  const rates = useMemo(() => {
    try {
      const r = JSON.parse(localStorage.getItem('exchange_rates') || '{}');
      return { usd: Number(r.usd) || 35, eur: Number(r.eur) || 38 };
    } catch { return { usd: 35, eur: 38 }; }
  }, []);

  useEffect(() => {
    const { start, end } = getDateRange(period);
    setLoading(true);
    Promise.all([
      getAllSalesForDateRange(start, end),
      getAllCrossSalesForDateRange(start, end),
      getAllPersonnelFromFirebase(),
      getShiftsAll(),
    ]).then(([s, cs, p, sh]) => {
      setSales(s);
      setCross(cs);
      setPersonnel(p);
      setShifts(sh);
      setLoading(false);
    }).catch(err => {
      console.error('Performans verileri yüklenirken hata:', err);
      setLoading(false);
    });
  }, [period]);

  const totalRevenue = useMemo(() =>
    sales.reduce((acc, s) => acc + toTL(s, rates.usd, rates.eur), 0), [sales, rates]);

  const crossRevenue = useMemo(() =>
    crossSales.reduce((acc, s) => acc + toTL(s, rates.usd, rates.eur), 0), [crossSales, rates]);

  const crossRate   = sales.length > 0 ? Math.round((crossSales.length / sales.length) * 100) : 0;
  const activeCount = personnel.filter(p => p.role === 'personel').length;

  return (
    <div className="space-y-4">
      {/* Header + period selector */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Performans Analizi</h2>
            <p className="text-xs text-gray-500 mt-0.5">Kasa, personel ve çapraz satış performans raporları</p>
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

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Toplam Ciro',         value: `₺${fmtNum(totalRevenue)}`, sub: `${sales.length} satış işlemi`,   color: 'text-white'                                },
          { label: 'Çapraz Satış Cirosu', value: `₺${fmtNum(crossRevenue)}`, sub: `${crossSales.length} çapraz`,    color: 'text-orange-400'                           },
          { label: 'Çapraz Satış Oranı',  value: `${crossRate}%`,            sub: 'toplam satıştan',                color: crossRate >= 20 ? 'text-green-400' : crossRate >= 10 ? 'text-yellow-400' : 'text-red-400' },
          { label: 'Aktif Personel',       value: String(activeCount),         sub: '3 kasa toplamı',                 color: 'text-green-400'                            },
        ].map(m => (
          <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-boltify-card">
            <p className="text-xs text-gray-500">{m.label}</p>
            <p className={`text-xl font-bold mt-1 ${m.color}`}>{m.value}</p>
            <p className="text-xs text-gray-600 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* View tabs */}
      <div className="flex border-b border-gray-800 gap-1 overflow-x-auto">
        {VIEW_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap flex-shrink-0 ${
              view === t.key
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-52">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Performans verileri yükleniyor...</p>
          </div>
        </div>
      ) : (
        <>
          {view === 'kasa'      && <KasaOzetiView sales={sales} crossSales={crossSales} rates={rates} />}
          {view === 'packages'  && <PaketKategoriView sales={sales} rates={rates} />}
          {view === 'cross'     && <CrosaSatisView sales={sales} crossSales={crossSales} rates={rates} />}
          {view === 'target'    && <HaftalikHedefView />}
        </>
      )}
    </div>
  );
}
