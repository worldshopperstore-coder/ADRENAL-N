import { useState, useEffect, useCallback } from 'react';
import { Wallet, Save, RotateCcw, TreePine, Monitor, Users2, Target } from 'lucide-react';
import { getKasaSettings, updateKasaAdvances } from '@/utils/kasaSettingsDB';
import { supabase } from '@/config/supabase';
import { saveWeeklyTarget, getWeeklyTarget, getCurrentWeekStart } from '@/utils/weeklyTargetsDB';

type KasaId = 'wildpark' | 'sinema' | 'face2face';

interface Advances {
  tlAdvance: number;
  usdAdvance: number;
  eurAdvance: number;
}

const KASAS: { id: KasaId; name: string; Icon: React.FC<any>; text: string; bg: string; borderAccent: string }[] = [
  {
    id: 'wildpark',
    name: 'WildPark',
    Icon: TreePine,
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    borderAccent: 'border-emerald-500/20',
  },
  {
    id: 'sinema',
    name: 'XD Sinema',
    Icon: Monitor,
    text: 'text-violet-400',
    bg: 'bg-violet-500/10',
    borderAccent: 'border-violet-500/20',
  },
  {
    id: 'face2face',
    name: 'Face2Face',
    Icon: Users2,
    text: 'text-sky-400',
    bg: 'bg-sky-500/10',
    borderAccent: 'border-sky-500/20',
  },
];

function fmt(n: number) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Supabase kasa_settings tablosundan avans oku (yoksa localStorage) */
async function loadAdvancesFromSupabase(kasaId: KasaId): Promise<Advances> {
  try {
    if (!supabase) throw new Error('offline');
    const { data, error } = await supabase
      .from('kasa_settings')
      .select('tl_advance, usd_advance, eur_advance')
      .eq('kasa_id', kasaId)
      .single();
    if (!error && data) {
      return {
        tlAdvance: Number(data.tl_advance) || 0,
        usdAdvance: Number(data.usd_advance) || 0,
        eurAdvance: Number(data.eur_advance) || 0,
      };
    }
  } catch { /* fallback */ }

  // localStorage fallback
  const s = getKasaSettings(kasaId);
  return s.advances;
}

/** Supabase kasa_settings + localStorage'a kaydet */
async function saveAdvances(kasaId: KasaId, advances: Advances, updatedBy: string): Promise<{ supabaseOk: boolean }> {
  // localStorage her zaman
  updateKasaAdvances(kasaId, advances, updatedBy);

  try {
    if (!supabase) return { supabaseOk: false };
    const { error } = await supabase.from('kasa_settings').upsert([{
      kasa_id: kasaId,
      tl_advance: advances.tlAdvance,
      usd_advance: advances.usdAdvance,
      eur_advance: advances.eurAdvance,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    }], { onConflict: 'kasa_id' });
    return { supabaseOk: !error };
  } catch {
    return { supabaseOk: false };
  }
}

interface KasaCardProps {
  kasa: typeof KASAS[0];
}

function KasaAdvanceCard({ kasa }: KasaCardProps) {
  const [advances, setAdvances] = useState<Advances>({ tlAdvance: 0, usdAdvance: 0, eurAdvance: 0 });
  const [original, setOriginal] = useState<Advances>({ tlAdvance: 0, usdAdvance: 0, eurAdvance: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const a = await loadAdvancesFromSupabase(kasa.id);
    setAdvances(a);
    setOriginal(a);
    setLoading(false);
  }, [kasa.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const isDirty =
    advances.tlAdvance !== original.tlAdvance ||
    advances.usdAdvance !== original.usdAdvance ||
    advances.eurAdvance !== original.eurAdvance;

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    const session = localStorage.getItem('userSession');
    const updatedBy = session ? (JSON.parse(session).personnel?.fullName ?? 'admin') : 'admin';
    const result = await saveAdvances(kasa.id, advances, updatedBy);
    setSaving(false);
    setOriginal(advances);
    setMsg({
      ok: result.supabaseOk,
      text: result.supabaseOk ? '✓ Kaydedildi' : '✓ Yerel kaydedildi (Supabase tablo eksik olabilir)',
    });
  };

  const handleReset = () => {
    setAdvances(original);
    setMsg(null);
  };

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5 shadow-boltify-card`}>
      {/* Başlık */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-lg ${kasa.bg} border ${kasa.borderAccent} flex items-center justify-center`}><kasa.Icon className={`w-5 h-5 ${kasa.text}`} /></div>
          <h3 className={`text-base sm:text-lg font-bold ${kasa.text}`}>{kasa.name}</h3>
        </div>
        {!loading && (
          <div className="flex items-center gap-2">
            {isDirty && (
              <button
                onClick={handleReset}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
                title="Sıfırla"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-gray-500 text-center py-4">Yükleniyor...</div>
      ) : (
        <div className="space-y-4">
          {/* TL */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">
              TL Avans — Açılış Kasası
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">₺</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={advances.tlAdvance}
                  onChange={e => { setAdvances(a => ({ ...a, tlAdvance: Number(e.target.value) })); setMsg(null); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <span className="text-xs text-gray-500 w-28 text-right">{fmt(advances.tlAdvance)} ₺</span>
            </div>
          </div>

          {/* USD */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">
              USD Avans — Açılış Kasası
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">$</span>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={advances.usdAdvance}
                  onChange={e => { setAdvances(a => ({ ...a, usdAdvance: Number(e.target.value) })); setMsg(null); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <span className="text-xs text-gray-500 w-28 text-right">${fmt(advances.usdAdvance)}</span>
            </div>
          </div>

          {/* EUR */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">
              EUR Avans — Açılış Kasası
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">€</span>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={advances.eurAdvance}
                  onChange={e => { setAdvances(a => ({ ...a, eurAdvance: Number(e.target.value) })); setMsg(null); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
                />
              </div>
              <span className="text-xs text-gray-500 w-28 text-right">€{fmt(advances.eurAdvance)}</span>
            </div>
          </div>

          {/* Mesaj */}
          {msg && (
            <p className={`text-xs font-medium ${msg.ok ? 'text-green-400' : 'text-yellow-400'}`}>{msg.text}</p>
          )}

          {/* Özet */}
          <div className="pt-2 border-t border-gray-800 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-gray-500">TL</p>
              <p className="text-sm font-bold text-white">{fmt(advances.tlAdvance)} ₺</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">USD</p>
              <p className="text-sm font-bold text-yellow-400">${fmt(advances.usdAdvance)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">EUR</p>
              <p className="text-sm font-bold text-orange-400">€{fmt(advances.eurAdvance)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WeeklyTargetCard({ kasa }: KasaCardProps) {
  const [targetAmount, setTargetAmount] = useState(0);
  const [original, setOriginal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const weekStart = getCurrentWeekStart();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const t = await getWeeklyTarget(kasa.id, weekStart);
      const amount = t?.targetAmount || 0;
      setTargetAmount(amount);
      setOriginal(amount);
      setLoading(false);
    })();
  }, [kasa.id, weekStart]);

  const isDirty = targetAmount !== original;

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    const session = localStorage.getItem('userSession');
    const updatedBy = session ? (JSON.parse(session).personnel?.fullName ?? 'admin') : 'admin';
    await saveWeeklyTarget({ kasaId: kasa.id, weekStart, targetAmount, updatedBy });
    setSaving(false);
    setOriginal(targetAmount);
    setMsg({ ok: true, text: '✓ Hedef kaydedildi' });
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4 shadow-boltify-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-lg ${kasa.bg} border ${kasa.borderAccent} flex items-center justify-center`}>
            <kasa.Icon className={`w-5 h-5 ${kasa.text}`} />
          </div>
          <h3 className={`text-base font-bold ${kasa.text}`}>{kasa.name}</h3>
        </div>
        {!loading && isDirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        )}
      </div>
      {loading ? (
        <div className="text-sm text-gray-500 text-center py-4">Yükleniyor...</div>
      ) : (
        <div>
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">
            Haftalık Hedef (TL) — {weekStart}
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">🎯</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={targetAmount}
                onChange={e => { setTargetAmount(Number(e.target.value)); setMsg(null); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-rose-500"
                placeholder="Ör: 50000"
              />
            </div>
            <span className="text-xs text-gray-500 w-24 text-right">{fmt(targetAmount)} ₺</span>
          </div>
          {msg && <p className={`text-xs font-medium mt-2 ${msg.ok ? 'text-green-400' : 'text-yellow-400'}`}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}

export default function AdvancesTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center">
          <Wallet className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Kasa Avansları</h2>
          <p className="text-xs text-gray-500 mt-0.5">Her kasa için açılış avansını buradan ayarlayın</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {KASAS.map(k => (
          <KasaAdvanceCard key={k.id} kasa={k} />
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p>• Avans değerleri kasanın açılış bakiyesini temsil eder.</p>
        <p>• Değiştirdiğinizde personel kasayı yeniden açtığında yeni avans geçerli olur.</p>
        <p>• Her kasanın avansı birbirinden bağımsızdır.</p>
      </div>

      {/* ── Haftalık Hedefler ─────────────────────────── */}
      <div className="flex items-center gap-3 mt-8">
        <div className="w-10 h-10 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-center">
          <Target className="w-5 h-5 text-rose-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Haftalık Hedefler</h2>
          <p className="text-xs text-gray-500 mt-0.5">Her kasa için haftalık satış hedefi belirleyin (TL)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {KASAS.map(k => (
          <WeeklyTargetCard key={k.id} kasa={k} />
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p>• Hedefler haftalık olarak belirlenir (Pazartesi - Pazar).</p>
        <p>• Personeller sadece kendi kasalarının yüzdesini görür, tutarı görmez.</p>
        <p>• Hedefe en çok katkı yapan personel performans kaydına yansır.</p>
      </div>
    </div>
  );
}
