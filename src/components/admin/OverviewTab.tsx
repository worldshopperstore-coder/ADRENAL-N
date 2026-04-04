import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart3, Users, TrendingUp, RotateCcw, X, CreditCard, Banknote, DollarSign, Euro } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { getTodayDate } from '@/utils/salesDB';

// ── Kasa Tanımları ────────────────────────────────────────────────────────────
const KASAS = [
  { id: 'wildpark',  name: 'WildPark',  color: 'green'  },
  { id: 'sinema',    name: 'XD Sinema', color: 'purple' },
  { id: 'face2face', name: 'Face2Face', color: 'cyan'   },
] as const;

type KasaId = typeof KASAS[number]['id'];

const COLOR_MAP: Record<string, {
  card: string; border: string; badge: string; title: string; bar: string;
  glow: string; iconBg: string; ring: string;
}> = {
  green:  { card: 'bg-gradient-to-br from-emerald-950/80 to-gray-900', border: 'border-emerald-500/30', badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30', title: 'text-emerald-400', bar: 'bg-emerald-500', glow: 'shadow-vibrant-emerald', iconBg: 'bg-emerald-500/20', ring: 'ring-emerald-500/20' },
  purple: { card: 'bg-gradient-to-br from-violet-950/80 to-gray-900',  border: 'border-violet-500/30',  badge: 'bg-violet-500/20 text-violet-300 border border-violet-400/30',   title: 'text-violet-400',  bar: 'bg-violet-500',  glow: 'shadow-vibrant-violet',  iconBg: 'bg-violet-500/20',  ring: 'ring-violet-500/20'  },
  cyan:   { card: 'bg-gradient-to-br from-sky-950/80 to-gray-900',     border: 'border-sky-500/30',     badge: 'bg-sky-500/20 text-sky-300 border border-sky-400/30',             title: 'text-sky-400',     bar: 'bg-sky-500',     glow: 'shadow-vibrant-sky',     iconBg: 'bg-sky-500/20',     ring: 'ring-sky-500/20'     },
};

// ── Tipler ────────────────────────────────────────────────────────────────────
interface Sale {
  cashTl?: number; kkTl?: number; cashUsd?: number; cashEur?: number;
  isRefund?: boolean; refundReason?: string; kkRefundTxId?: string;
  packageName?: string; personnelName?: string; total?: number;
}

interface RefundItem {
  packageName: string;
  personnelName: string;
  reason: string;
  total: number;
  kkRefundTxId?: string;
}

interface KasaData {
  onlinePersonnel: string[];
  cashTl: number; kkTl: number; cashUsd: number; cashEur: number;
  saleCount: number;
  refundCount: number;
  refunds: RefundItem[];
}

type AllData = Record<KasaId, KasaData>;
type KasaRates = Record<KasaId, { usd: number; eur: number }>;

const emptyKasa = (): KasaData => ({
  onlinePersonnel: [], cashTl: 0, kkTl: 0, cashUsd: 0, cashEur: 0, saleCount: 0, refundCount: 0, refunds: [],
});

const defaultRates = (): KasaRates => ({
  wildpark:  { usd: 30, eur: 33 },
  sinema:    { usd: 30, eur: 33 },
  face2face: { usd: 30, eur: 33 },
});

function fmt(n: number) { return n.toLocaleString('tr-TR'); }

// ── İade Modal ───────────────────────────────────────────────────────────────
function RefundModal({ kasaName, refunds, onClose }: {
  kasaName: string;
  refunds: RefundItem[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-boltify-lg"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center">
              <RotateCcw className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{kasaName} — İadeler</p>
              <p className="text-xs text-gray-500">{refunds.length} iade işlemi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-800 text-gray-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* İade Listesi */}
        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {refunds.map((r, i) => (
            <div key={i} className="bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white truncate max-w-[65%]">{r.packageName}</span>
                <span className="text-sm font-bold text-red-400">−{fmt(r.total)} ₺</span>
              </div>
              <div className="text-xs text-gray-400"><span className="text-gray-500">Personel:</span> {r.personnelName}</div>
              <div className="text-xs text-red-300/80"><span className="text-gray-500">Neden:</span> {r.reason}</div>
              {r.kkRefundTxId && (
                <div className="text-xs text-gray-500">KK İşlem No: <span className="text-gray-300">{r.kkRefundTxId}</span></div>
              )}
            </div>
          ))}
        </div>

        {/* Toplam */}
        <div className="px-5 py-3 border-t border-gray-800 flex justify-between items-center">
          <span className="text-xs text-gray-500">Toplam İade Tutarı</span>
          <span className="text-sm font-bold text-red-400">−{fmt(refunds.reduce((s, r) => s + r.total, 0))} ₺</span>
        </div>
      </div>
    </div>
  );
}

// ── Bileşen ───────────────────────────────────────────────────────────────────
export default function OverviewTab() {
  const [data, setData]       = useState<AllData>({ wildpark: emptyKasa(), sinema: emptyKasa(), face2face: emptyKasa() });
  const [rates, setRates]     = useState<KasaRates>(defaultRates());
  const [loading, setLoading] = useState(true);
  const [refundModal, setRefundModal] = useState<{ kasaName: string; refunds: RefundItem[] } | null>(null);

  const today = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const load = useCallback(async () => {
    setLoading(true);

    const todayStr = getTodayDate();

    if (!supabase) {
      setLoading(false);
      return;
    }

    // Paralel: satışlar + online personel + kurlar (tüm kasalar aynı anda)
    const [salesResults, personnelResults, ratesResult] = await Promise.all([
      Promise.all(
        KASAS.map(k =>
          supabase.from('sales').select('sales').eq('kasaId', k.id).eq('date', todayStr).limit(1)
        )
      ),
      Promise.all(
        KASAS.map(k =>
          supabase.from('personnel').select('fullName').eq('kasaId', k.id).eq('is_online', true)
        )
      ),
      supabase.from('kasa_rates').select('*'),
    ]);

    // Kurlar — Supabase kasa_rates'den oku, yoksa default
    const newRates = defaultRates();
    for (const row of (ratesResult.data ?? [])) {
      const kid = row.kasa_id as KasaId;
      if (kid && kid in newRates) newRates[kid] = { usd: Number(row.usd) || 30, eur: Number(row.eur) || 33 };
    }
    setRates(newRates);

    const next = { ...data };

    KASAS.forEach((kasa, i) => {
      const salesRow = salesResults[i].data?.[0];
      const salesArr: Sale[] = salesRow?.sales ?? [];

      const cashTl  = salesArr.reduce((s, x) => s + (x.cashTl  ?? 0), 0);
      const kkTl    = salesArr.reduce((s, x) => s + (x.kkTl    ?? 0), 0);
      const cashUsd = salesArr.reduce((s, x) => s + (x.cashUsd ?? 0), 0);
      const cashEur = salesArr.reduce((s, x) => s + (x.cashEur ?? 0), 0);

      const onlinePersonnel = (personnelResults[i].data ?? []).map((p: { fullName: string }) => p.fullName);

      const refunds: RefundItem[] = salesArr
        .filter(x => x.isRefund)
        .map(x => ({
          packageName: x.packageName || 'Bilinmeyen',
          personnelName: x.personnelName || 'Bilinmeyen',
          reason: x.refundReason || '—',
          total: Math.abs(x.total || 0),
          kkRefundTxId: x.kkRefundTxId,
        }));

      next[kasa.id] = { cashTl, kkTl, cashUsd, cashEur, saleCount: salesArr.length, onlinePersonnel, refundCount: refunds.length, refunds };
    });

    setData(next);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 20 seconds
  useEffect(() => {
    const interval = setInterval(() => { load(); }, 20000);
    return () => clearInterval(interval);
  }, [load]);

  const totals = useMemo(() => KASAS.reduce(
    (acc, k) => ({
      cashTl:      acc.cashTl  + data[k.id].cashTl,
      kkTl:        acc.kkTl    + data[k.id].kkTl,
      cashUsd:     acc.cashUsd + data[k.id].cashUsd,
      cashEur:     acc.cashEur + data[k.id].cashEur,
      usdAsTl:     acc.usdAsTl + data[k.id].cashUsd * rates[k.id].usd,
      eurAsTl:     acc.eurAsTl + data[k.id].cashEur * rates[k.id].eur,
    }),
    { cashTl: 0, kkTl: 0, cashUsd: 0, cashEur: 0, usdAsTl: 0, eurAsTl: 0 }
  ), [data, rates]);

  // Kasa bazlı USD/EUR → TL
  const kasaUsdTl = (kid: KasaId) => data[kid].cashUsd * rates[kid].usd;
  const kasaEurTl = (kid: KasaId) => data[kid].cashEur * rates[kid].eur;

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/20">
            <BarChart3 className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Genel Bakış</h2>
            <p className="text-xs text-gray-500 mt-0.5">{today}</p>
          </div>
        </div>
      </div>

      {/* 3 Kasa Kartı */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {KASAS.map(kasa => {
            const d = data[kasa.id];
            const c = COLOR_MAP[kasa.color];
            const totalTl = d.cashTl + d.kkTl;

            return (
              <div key={kasa.id} className={`${c.card} border ${c.border} rounded-2xl p-4 sm:p-5 space-y-4 ${c.glow} ring-1 ${c.ring}`}>
                {/* Kasa Başlık */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${c.iconBg} rounded-xl flex items-center justify-center border ${c.border}`}>
                      <BarChart3 className={`w-5 h-5 ${c.title}`} />
                    </div>
                    <div>
                      <h3 className={`text-lg font-bold ${c.title}`}>{kasa.name}</h3>
                      <p className="text-xs text-gray-500">{d.saleCount} satış{d.refundCount > 0 ? ` · ${d.refundCount} iade` : ''}</p>
                    </div>
                  </div>
                  {/* Online Personel */}
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {d.onlinePersonnel.length === 0 ? (
                      <span className="text-[11px] text-gray-600 italic">Aktif personel yok</span>
                    ) : (
                      d.onlinePersonnel.map(name => (
                        <span key={name} className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/25 font-semibold">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                          </span>
                          {name}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Satış Bar */}
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                    <span>Günlük Satış</span>
                    <span className="text-white font-bold">{d.saleCount} adet</span>
                  </div>
                  <div className="w-full bg-gray-700/50 rounded-full h-2">
                    <div
                      className={`${c.bar} h-2 rounded-full transition-all duration-500`}
                      style={{ width: `${Math.min((d.saleCount / 40) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Gelir Detayı — Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-800/60 rounded-xl p-2.5 border border-gray-700/40">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Banknote className="w-3 h-3 text-blue-400" />
                      <span className="text-[10px] text-gray-500 font-semibold uppercase">Nakit TL</span>
                    </div>
                    <p className="text-sm font-bold text-blue-400">{fmt(d.cashTl)} ₺</p>
                  </div>
                  <div className="bg-gray-800/60 rounded-xl p-2.5 border border-gray-700/40">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CreditCard className="w-3 h-3 text-emerald-400" />
                      <span className="text-[10px] text-gray-500 font-semibold uppercase">Kredi Kartı</span>
                    </div>
                    <p className="text-sm font-bold text-emerald-400">{fmt(d.kkTl)} ₺</p>
                  </div>
                  <div className="bg-gray-800/60 rounded-xl p-2.5 border border-gray-700/40">
                    <div className="flex items-center gap-1.5 mb-1">
                      <DollarSign className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] text-gray-500 font-semibold uppercase">Dolar</span>
                    </div>
                    <p className="text-sm font-bold text-amber-400">${fmt(d.cashUsd)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">≈ {fmt(kasaUsdTl(kasa.id))} ₺</p>
                  </div>
                  <div className="bg-gray-800/60 rounded-xl p-2.5 border border-gray-700/40">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Euro className="w-3 h-3 text-violet-400" />
                      <span className="text-[10px] text-gray-500 font-semibold uppercase">Euro</span>
                    </div>
                    <p className="text-sm font-bold text-violet-400">€{fmt(d.cashEur)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">≈ {fmt(kasaEurTl(kasa.id))} ₺</p>
                  </div>
                </div>

                {/* Toplam */}
                <div className={`border-t ${c.border} pt-3 flex justify-between items-center`}>
                  <span className="text-sm text-gray-300 font-medium">Toplam Ciro</span>
                  <span className={`text-lg font-black ${c.title}`}>{fmt(totalTl + kasaUsdTl(kasa.id) + kasaEurTl(kasa.id))} ₺</span>
                </div>

                {/* İade Butonu */}
                {d.refunds.length > 0 && (
                  <button
                    onClick={() => setRefundModal({ kasaName: kasa.name, refunds: d.refunds })}
                    className="w-full flex items-center justify-between bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 rounded-xl px-3 py-2.5 transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <RotateCcw className="w-3.5 h-3.5 text-red-400" />
                      <span className="text-xs font-bold text-red-400">İADE</span>
                      <span className="text-xs text-red-400/70">{d.refunds.length} işlem</span>
                    </div>
                    <span className="text-xs font-bold text-red-400">−{fmt(d.refunds.reduce((s, r) => s + r.total, 0))} ₺</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* İade Modal */}
      {refundModal && (
        <RefundModal
          kasaName={refundModal.kasaName}
          refunds={refundModal.refunds}
          onClose={() => setRefundModal(null)}
        />
      )}

      {/* Toplam Ciro Özet */}
      {!loading && (
        <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-700/50 rounded-2xl overflow-hidden shadow-boltify-lg ring-1 ring-white/5">
          <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-gray-800/60">
            <div className="w-8 h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-yellow-400" />
            </div>
            <h3 className="text-sm font-bold text-white">Toplam Ciro</h3>
            <span className="text-xs text-gray-500 ml-auto bg-gray-800 px-2.5 py-0.5 rounded-full font-bold">
              {KASAS.reduce((s, k) => s + data[k.id].saleCount, 0)} satış
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-800/40">
            <div className="p-3 sm:p-4 bg-gray-950">
              <div className="flex items-center gap-1.5 mb-1">
                <Banknote className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Nakit TL</span>
              </div>
              <p className="text-lg font-black text-blue-400">{fmt(totals.cashTl)} ₺</p>
            </div>
            <div className="p-3 sm:p-4 bg-gray-950">
              <div className="flex items-center gap-1.5 mb-1">
                <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Kredi Kartı</span>
              </div>
              <p className="text-lg font-black text-emerald-400">{fmt(totals.kkTl)} ₺</p>
            </div>
            <div className="p-3 sm:p-4 bg-gray-950">
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Dolar</span>
              </div>
              <p className="text-lg font-black text-amber-400">${fmt(totals.cashUsd)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">≈ {fmt(totals.usdAsTl)} ₺</p>
            </div>
            <div className="p-3 sm:p-4 bg-gray-950">
              <div className="flex items-center gap-1.5 mb-1">
                <Euro className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Euro</span>
              </div>
              <p className="text-lg font-black text-violet-400">€{fmt(totals.cashEur)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">≈ {fmt(totals.eurAsTl)} ₺</p>
            </div>
          </div>

          <div className="px-4 sm:px-5 py-3 border-t border-gray-700/50 bg-gradient-to-r from-orange-500/10 to-violet-500/10 flex items-center justify-between">
            <span className="text-sm text-gray-300 font-medium">Genel Toplam (TL karşılığı)</span>
            <span className="text-xl font-black text-white">{fmt(totals.cashTl + totals.kkTl + totals.usdAsTl + totals.eurAsTl)} ₺</span>
          </div>
        </div>
      )}
    </div>
  );
}
