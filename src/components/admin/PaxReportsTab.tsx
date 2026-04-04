import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Users, ChevronDown, ChevronRight, Printer, Wifi, WifiOff, TreePine, Monitor, Users2 } from 'lucide-react';
import { supabase } from '@/config/supabase';

// ── Tipler ─────────────────────────────────────────────────────────────────────
interface PaxEntry {
  id: string;
  name: string;
  adult: number;
  child: number;
}

interface PaxData {
  acente: PaxEntry[];
  munferit: PaxEntry[];
  sinema: PaxEntry[];   // 3. bölüm (@ WildPark / @ Sinema / @ Face2Face)
  updatedAt?: string;
}

// ── Kasa tanımları ──────────────────────────────────────────────────────────
const KASAS = [
  {
    id: 'wildpark',
    name: 'WildPark',
    Icon: TreePine,
    color: 'green',
    sections: { acente: 'AKVARYUM ACENTE', munferit: 'AKVARYUM MÜNFERİT', sinema: '@ WİLDPARK' },
  },
  {
    id: 'sinema',
    name: 'XD Sinema',
    Icon: Monitor,
    color: 'purple',
    sections: { acente: 'AKVARYUM ACENTE', munferit: 'AKVARYUM MÜNFERİT', sinema: '@ SİNEMA' },
  },
  {
    id: 'face2face',
    name: 'Face 2 Face',
    Icon: Users2,
    color: 'cyan',
    sections: { acente: 'AKVARYUM ACENTE', munferit: 'AKVARYUM MÜNFERİT', sinema: '@ FACE 2 FACE' },
  },
] as const;

type KasaId = typeof KASAS[number]['id'];

const COLOR_MAP: Record<string, {
  card: string; border: string; title: string; badge: string;
  headerBg: string; sectionBadge: string;
}> = {
  green:  { card: 'bg-gray-900',  border: 'border-gray-800',  title: 'text-emerald-400',  badge: 'bg-emerald-500/10 text-emerald-300',  headerBg: 'bg-gray-900',  sectionBadge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'  },
  purple: { card: 'bg-gray-900', border: 'border-gray-800', title: 'text-violet-400', badge: 'bg-violet-500/10 text-violet-300', headerBg: 'bg-gray-900', sectionBadge: 'bg-violet-500/10 text-violet-300 border-violet-500/20' },
  cyan:   { card: 'bg-gray-900',   border: 'border-gray-800',   title: 'text-sky-400',   badge: 'bg-sky-500/10 text-sky-300',    headerBg: 'bg-gray-900',   sectionBadge: 'bg-sky-500/10 text-sky-300 border-sky-500/20'    },
};

// ── Yardımcılar ────────────────────────────────────────────────────────────────
function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function sumSection(entries: PaxEntry[]) {
  return entries.reduce((acc, e) => ({ adult: acc.adult + (e.adult || 0), child: acc.child + (e.child || 0) }), { adult: 0, child: 0 });
}

// ── Bölüm tablosu ─────────────────────────────────────────────────────────────
function SectionTable({
  label, entries, colorKey,
}: {
  label: string; entries: PaxEntry[]; colorKey: string;
}) {
  const [open, setOpen] = useState(false);
  const c = COLOR_MAP[colorKey];
  const total = sumSection(entries);

  if (entries.length === 0) {
    return (
      <div className="mb-2">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${c.sectionBadge} text-xs font-semibold`}>
          <span>{label}</span>
          <span className="ml-auto text-gray-500 font-normal">Kayıt yok</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border ${c.sectionBadge} text-xs font-semibold hover:opacity-80 transition-opacity`}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
        <span>{label}</span>
        <span className="ml-auto flex gap-2 sm:gap-3 flex-wrap">
          <span>Yetişkin: <span className="font-bold">{total.adult}</span></span>
          <span>Çocuk: <span className="font-bold">{total.child}</span></span>
          <span className="text-white/80">Toplam: <span className="font-bold">{total.adult + total.child}</span></span>
        </span>
      </button>

      {open && (
        <div className="mt-1 rounded-lg border border-gray-700/40 overflow-x-auto">
          <table className="w-full text-xs min-w-[400px]">
            <thead>
              <tr className="bg-gray-800/60 text-gray-400">
                <th className="text-left px-3 py-1.5">#</th>
                <th className="text-left px-3 py-1.5">İsim / Acente</th>
                <th className="text-center px-3 py-1.5">Yetişkin</th>
                <th className="text-center px-3 py-1.5">Çocuk</th>
                <th className="text-center px-3 py-1.5">Toplam</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.id} className="border-t border-gray-700/30 hover:bg-gray-800/30">
                  <td className="px-3 py-1.5 text-gray-500">{i + 1}</td>
                  <td className="px-3 py-1.5 text-gray-200 font-medium">{e.name || '—'}</td>
                  <td className="px-3 py-1.5 text-center text-blue-300">{e.adult}</td>
                  <td className="px-3 py-1.5 text-center text-amber-300">{e.child}</td>
                  <td className="px-3 py-1.5 text-center text-white font-semibold">{e.adult + e.child}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-600/50 bg-gray-800/50">
                <td colSpan={2} className="px-3 py-1.5 text-gray-400 font-semibold text-right">TOPLAM</td>
                <td className="px-3 py-1.5 text-center text-blue-300 font-bold">{total.adult}</td>
                <td className="px-3 py-1.5 text-center text-amber-300 font-bold">{total.child}</td>
                <td className="px-3 py-1.5 text-center text-white font-bold">{total.adult + total.child}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Ana bileşen ────────────────────────────────────────────────────────────────
export default function PaxReportsTab() {
  const [date, setDate] = useState(getTodayStr());
  const [data, setData] = useState<Partial<Record<KasaId, PaxData>>>({});
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [realtimeOk, setRealtimeOk] = useState(false);
  const dateRef = useRef(date);
  dateRef.current = date;

  const loadAll = useCallback(async (silent = false) => {
    if (!supabase) return;
    if (!silent) setLoading(true);
    try {
      const { data: rows } = await supabase
        .from('pax_reports')
        .select('kasaId, entries, updatedAt')
        .eq('date', dateRef.current);

      const mapped: Partial<Record<KasaId, PaxData>> = {};
      for (const row of rows ?? []) {
        mapped[row.kasaId as KasaId] = {
          ...(row.entries as PaxData),
          updatedAt: row.updatedAt,
        };
      }
      setData(mapped);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('pax_reports yükleme hatası:', e);
    }
    if (!silent) setLoading(false);
  }, []);

  // İlk yükleme + tarih değişince tekrar yükle
  useEffect(() => { loadAll(); }, [loadAll, date]);

  // Supabase Realtime aboneliği
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('admin-pax-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pax_reports' },
        (payload) => {
          // Sadece aktif tarihle eşleşen değişikliği yansıt
          const row = (payload.new ?? payload.old) as { kasaId?: string; date?: string; entries?: PaxData; updatedAt?: string } | null;
          if (!row || row.date !== dateRef.current) return;
          if (row.kasaId && row.entries) {
            setData(prev => ({
              ...prev,
              [row.kasaId as KasaId]: { ...row.entries!, updatedAt: row.updatedAt },
            }));
            setLastRefresh(new Date());
          }
        }
      )
      .subscribe((status) => {
        setRealtimeOk(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Genel toplam
  const grandTotal = KASAS.reduce((acc, kasa) => {
    const d = data[kasa.id];
    if (!d) return acc;
    const all = [...(d.acente ?? []), ...(d.munferit ?? []), ...(d.sinema ?? [])];
    const s = sumSection(all);
    return { adult: acc.adult + s.adult, child: acc.child + s.child };
  }, { adult: 0, child: 0 });

  // ── HTML/PDF yazdırma ──────────────────────────────────────────────────────
  const printKasa = (kasa: typeof KASAS[number], d: PaxData) => {
    const fmtDate = (str: string) => {
      const [y, m, day] = str.split('-');
      return `${day}.${m}.${y}`;
    };
    const renderRows = (entries: PaxEntry[]) =>
      entries.map((e, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${e.name || '—'}</td>
          <td class="center">${e.adult}</td>
          <td class="center">${e.child}</td>
          <td class="center bold">${e.adult + e.child}</td>
        </tr>`).join('');

    const renderSection = (label: string, entries: PaxEntry[]) => {
      const t = sumSection(entries);
      return `
        <h3>${label}</h3>
        ${entries.length === 0 ? '<p class="empty">Kayıt yok</p>' : `
        <table>
          <thead><tr><th>#</th><th>İsim / Acente</th><th class="center">Yetişkin</th><th class="center">Çocuk</th><th class="center">Toplam</th></tr></thead>
          <tbody>
            ${renderRows(entries)}
            <tr class="total-row">
              <td colspan="2" class="right">TOPLAM</td>
              <td class="center bold">${t.adult}</td>
              <td class="center bold">${t.child}</td>
              <td class="center bold">${t.adult + t.child}</td>
            </tr>
          </tbody>
        </table>`}`;
    };

    const allEntries = [...(d.acente ?? []), ...(d.munferit ?? []), ...(d.sinema ?? [])];
    const grand = sumSection(allEntries);

    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<title>${kasa.name} – Pax Raporu – ${fmtDate(date)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 24px; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .subtitle { color: #555; margin-bottom: 20px; font-size: 11px; }
  h3 { background: #f0f0f0; padding: 6px 10px; margin: 16px 0 6px; border-left: 4px solid #333; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { background: #333; color: #fff; padding: 6px 8px; text-align: left; font-size: 11px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; font-size: 11px; }
  tr:nth-child(even) td { background: #f9f9f9; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .total-row td { background: #e8e8e8 !important; font-weight: bold; border-top: 2px solid #aaa; }
  .grand { margin-top: 20px; padding: 10px 14px; background: #111; color: #fff; border-radius: 6px; display: flex; gap: 24px; }
  .grand span { font-size: 13px; }
  .empty { color: #999; font-style: italic; padding: 4px 10px; }
  @media print { body { padding: 12px; } }
</style>
</head>
<body>
  <div style="font-size:24px;font-weight:900;font-style:italic;margin-bottom:4px"><span style="color:#f97316">adrenalin</span><span style="color:#fb923c">.</span></div>
  <h1>${kasa.name} – Günlük Pax Raporu</h1>
  <div class="subtitle">Tarih: ${fmtDate(date)} &nbsp;|&nbsp; Oluşturulma: ${new Date().toLocaleString('tr-TR')}</div>
  ${renderSection(kasa.sections.acente, d.acente ?? [])}
  ${renderSection(kasa.sections.munferit, d.munferit ?? [])}
  ${renderSection(kasa.sections.sinema, d.sinema ?? [])}
  <div class="grand">
    <span>Genel Toplam</span>
    <span>Yetişkin: <b>${grand.adult}</b></span>
    <span>Çocuk: <b>${grand.child}</b></span>
    <span>Toplam Pax: <b>${grand.adult + grand.child}</b></span>
  </div>
</body>
</html>`;

    const win = window.open('', 'reportWindow', 'width=850,height=700,scrollbars=yes,resizable=yes');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  return (
    <div className="space-y-4">
      {/* ── Başlık ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 shadow-boltify-card">
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-orange-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-orange-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white tracking-tight">Pax Günlük Raporları</h2>
            <p className="text-xs text-gray-500">Tüm kasaların giriş / acente takibi</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto sm:ml-auto">
          {/* Realtime göstergesi */}
          <span
            title={realtimeOk ? 'Anlık bağlantı aktif' : 'Anlık bağlantı yok'}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${realtimeOk ? 'bg-green-500/10 border-green-600/30 text-green-400' : 'bg-gray-700/50 border-gray-600/30 text-gray-500'}`}
          >
            {realtimeOk ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {realtimeOk ? 'Canlı' : 'Çevrimdışı'}
          </span>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-orange-500 w-full sm:w-auto"
          />
          <button
            onClick={() => loadAll()}
            disabled={loading}
            className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {/* ── Özet bar ── */}
      <div className="flex flex-wrap items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
        <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Genel Toplam</span>
        <span className="text-sm font-bold text-blue-300">Yetişkin: {grandTotal.adult}</span>
        <span className="text-sm font-bold text-amber-300">Çocuk: {grandTotal.child}</span>
        <span className="text-sm font-bold text-white">Toplam: {grandTotal.adult + grandTotal.child}</span>
        {lastRefresh && (
          <span className="ml-auto text-xs text-gray-500">
            Son güncelleme: {lastRefresh.toLocaleTimeString('tr-TR')}
          </span>
        )}
      </div>

      {/* ── Kasa kartları ── */}
      {loading && !lastRefresh ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {KASAS.map(kasa => {
            const c = COLOR_MAP[kasa.color];
            const d = data[kasa.id];
            const all = d ? [...(d.acente ?? []), ...(d.munferit ?? []), ...(d.sinema ?? [])] : [];
            const total = sumSection(all);
            const updatedTime = d?.updatedAt
              ? new Date(d.updatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
              : null;

            return (
              <div key={kasa.id} className={`rounded-xl border ${c.border} ${c.card} overflow-hidden`}>
                {/* Kasa header */}
                <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 px-4 py-3 ${c.headerBg} border-b ${c.border}`}>
                  <div className="flex items-center gap-2">
                    <kasa.Icon className={`w-5 h-5 ${c.title}`} />
                    <span className={`font-bold text-base ${c.title}`}>{kasa.name}</span>
                    {updatedTime && (
                      <span className="text-xs text-gray-500 ml-1">· {updatedTime}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 text-xs flex-wrap sm:ml-auto">
                    <span className={`px-2 sm:px-2.5 py-0.5 rounded-full border ${c.sectionBadge} font-semibold`}>
                      Yetişkin: {total.adult}
                    </span>
                    <span className={`px-2 sm:px-2.5 py-0.5 rounded-full border ${c.sectionBadge} font-semibold`}>
                      Çocuk: {total.child}
                    </span>
                    <span className="px-2 sm:px-2.5 py-0.5 rounded-full bg-white/10 border border-white/20 text-white font-bold">
                      Toplam: {total.adult + total.child}
                    </span>
                    {/* Print / PDF butonu */}
                    {d && (
                      <button
                        onClick={() => printKasa(kasa, d)}
                        title="Yazdır / PDF olarak kaydet"
                        className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gray-700/80 hover:bg-gray-600 border border-gray-600/50 text-gray-300 hover:text-white transition-colors font-medium"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        PDF / Yazdır
                      </button>
                    )}
                  </div>
                </div>

                {/* Bölümler */}
                <div className="p-4">
                  {!d ? (
                    <p className="text-center text-gray-500 text-sm py-4">Bu tarih için kayıt bulunamadı.</p>
                  ) : (
                    <>
                      <SectionTable label={kasa.sections.acente}  entries={d.acente  ?? []} colorKey={kasa.color} />
                      <SectionTable label={kasa.sections.munferit} entries={d.munferit ?? []} colorKey={kasa.color} />
                      <SectionTable label={kasa.sections.sinema}   entries={d.sinema   ?? []} colorKey={kasa.color} />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
