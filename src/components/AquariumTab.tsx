import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import { Mail, Plus, Trash2, FileSpreadsheet, Printer, Droplets, Users, FileText } from 'lucide-react';
import { supabase } from '@/config/supabase';

interface PaxEntry {
  id: string;
  name: string;
  adult: number;
  child: number;
}

interface SavedData {
  acente: string[];
  munferit: string[];
  sinema: string[];
}

interface KasaConfig {
  title: string;
  paxName: string;
  section1: string;
  section2: string;
  section3: string;
}

const getKasaConfig = (kasaId: string): KasaConfig => {
  switch (kasaId) {
    case 'sinema':
      return { title: 'SİNEMA GÜNLÜK MÜNFERİT ve ACENTE', paxName: 'Sinema Pax', section1: 'AKVARYUM ACENTE', section2: 'AKVARYUM MÜNFERİT', section3: '@ SİNEMA' };
    case 'face2face':
      return { title: 'FACE 2 FACE GÜNLÜK MÜNFERİT ve ACENTE', paxName: 'Face 2 Face Pax', section1: 'AKVARYUM ACENTE', section2: 'AKVARYUM MÜNFERİT', section3: '@ FACE 2 FACE' };
    default:
      return { title: 'WİLDPARK GÜNLÜK MÜNFERİT ve ACENTE', paxName: 'Wildpark Pax', section1: 'AKVARYUM ACENTE', section2: 'AKVARYUM MÜNFERİT', section3: '@ WİLDPARK' };
  }
};

// ── Supabase helpers ─────────────────────────────────────────────────────────
async function savePaxReportToSupabase(kasaId: string, date: string, data: {
  acente: PaxEntry[]; munferit: PaxEntry[]; sinema: PaxEntry[];
}) {
  try {
    await supabase.from('pax_reports').upsert([{
      kasaId, date, entries: data, updatedAt: new Date().toISOString(),
    }], { onConflict: 'kasaId,date' });
  } catch (e) { console.error('pax_reports kayıt hatası:', e); }
}

async function loadPaxReportFromSupabase(kasaId: string, date: string) {
  try {
    const { data } = await supabase.from('pax_reports').select('entries').eq('kasaId', kasaId).eq('date', date).limit(1);
    if (data?.[0]?.entries) return data[0].entries as { acente: PaxEntry[]; munferit: PaxEntry[]; sinema: PaxEntry[] };
  } catch (e) { console.error('pax_reports yükleme hatası:', e); }
  return null;
}

async function savePaxNamesToSupabase(kasaId: string, names: SavedData) {
  try {
    await supabase.from('pax_saved_names').upsert([{ kasaId, names, updatedAt: new Date().toISOString() }], { onConflict: 'kasaId' });
  } catch (e) { console.error('pax_saved_names kayıt hatası:', e); }
}

async function loadPaxNamesFromSupabase(kasaId: string): Promise<SavedData | null> {
  try {
    const { data } = await supabase.from('pax_saved_names').select('names').eq('kasaId', kasaId).limit(1);
    if (data?.[0]?.names) return data[0].names as SavedData;
  } catch (e) { console.error('pax_saved_names yükleme hatası:', e); }
  return null;
}

// ── localStorage helpers (yedek) ─────────────────────────────────────────────
function savePaxReportToLocal(kasaId: string, date: string, data: { acente: PaxEntry[]; munferit: PaxEntry[]; sinema: PaxEntry[] }) {
  localStorage.setItem(`pax_report_${kasaId}_${date}`, JSON.stringify(data));
}
function loadPaxReportFromLocal(kasaId: string, date: string) {
  const raw = localStorage.getItem(`pax_report_${kasaId}_${date}`);
  if (raw) return JSON.parse(raw) as { acente: PaxEntry[]; munferit: PaxEntry[]; sinema: PaxEntry[] };
  return null;
}

// ── Varsayılan listeler ──────────────────────────────────────────────────────
const DEFAULT_ACENTE_LIST = [
  'ADLER TURIZM', 'ALANYA AQUA PARK', 'ALBATROS GROUP', 'ALBATROS TURİZM', 'ALESTA TOUR',
  'ALYA TRAVEL', 'AMAZON TUR', 'ANEX TOUR', 'ANTEKS TURİZM', 'ANTİK TURİZM',
  'APOLLONIA', 'AQUAFUN', 'AQUA PARK', 'ARTUR TURİZM', 'ATLAS GLOBAL',
  'ATLAS TOUR', 'BLUE SKY', 'BRAVO TURİZM', 'CARTOUR', 'CITY TOUR',
  'CLUB ASYA', 'CLUB MED', 'CLUB TURİZM', 'COMET TURİZM', 'CORAL TRAVEL',
  'CROWN TURİZM', 'DELTA TOUR', 'DETUR', 'DIAMOND', 'DOLPHIN',
  'ECE TURİZM', 'EGE TUR', 'ELITE TURİZM', 'ENTOUR', 'ERKATUR',
  'EURO TURİZM', 'FLY TOUR', 'FTI', 'GLOBAL TURİZM', 'GOLDEN TOUR',
  'GREEN TURİZM', 'GRUPPOTUR', 'GUNESTR', 'HERO TOUR', 'HIT TURİZM',
  'HOLIDAY', 'HORIZON', 'İDA TUR', 'INTOURIST', 'JOLLY TUR',
  'KAMIL KOC', 'KARTAL TURİZM', 'KEMER TOUR', 'KIVILCIM', 'KOMPAS',
  'LARA TUR', 'LIBERTY', 'LIMAK TURİZM', 'LYRA TURİZM', 'MAESTRO',
  'MARTI TURİZM', 'MEGA TUR', 'MELEK TURİZM', 'MERİT TURİZM', 'METRO',
  'MICKY TOUR', 'MOON TOUR', 'NEPTUN', 'NET TURİZM', 'NOVA TURİZM',
  'ODA TURİZM', 'ODEON', 'ONUR AIR', 'ORANGE TOUR', 'ORİON TUR',
  'ÖGER TOURS', 'ÖZBEK TURİZM', 'ÖZLEM TURİZM', 'PAMFILA', 'PARK TURİZM',
  'PEGAS', 'PHOENIX', 'PREMIUM', 'PRINCESS', 'PRONTO TUR',
  'RENT A CAR', 'RIVIERA', 'ROBINSON', 'ROYAL TURİZM', 'SALAMIS',
  'SAMBA TURİZM', 'SANDRAS', 'SEKO TURİZM', 'SETUR', 'SEYTUR',
  'SIDE TOUR', 'SILVA TURİZM', 'SKY TURİZM', 'SMART TURİZM', 'STA TURİZM',
  'STAR TURİZM', 'SUN EXPRESS', 'SUNMAR', 'SUNSET', 'TAKSIM TURİZM',
  'TANTUR', 'TATIL', 'TED TURİZM', 'TEZ TOUR', 'TUI',
  'TUREKS', 'TURKUAZ', 'TURNA TURİZM', 'ULUSOY', 'ULYSSES',
  'UNICORN', 'VIKING TURİZM', 'VIP TURİZM', 'VOYAGE', 'WHITE',
  'WORLD TURİZM', 'YESIL TOUR', 'ZEHRA TURİZM', 'ZENITH', 'ZEUS TURİZM'
];

const DEFAULT_MUNFERIT_LIST = [
  'MÜNFERİT MEGA', 'MÜNFERİT AQUA+XD', 'MÜNFERİT AQUA+SİNEMA', 'MÜNFERİT SİNEMA+XD',
  'MÜNFERİT SİNEMA', 'MÜNFERİT XD', 'MÜNFERİT AQUA', 'ENGELLİ MEGA', 'ENGELLİ AQUA+XD',
  'ENGELLİ AQUA+SİNEMA', 'ENGELLİ SİNEMA+XD', 'ENGELLİ SİNEMA', 'ENGELLİ XD', 'ENGELLİ AQUA',
  'GAZI VE ŞEHİT MEGA', 'GAZI VE ŞEHİT AQUA+XD', 'GAZI VE ŞEHİT SİNEMA', 'GAZI VE ŞEHİT XD',
  'BIM KAMPANYA', 'ALYA MEGA', 'ALYA AQUA+XD', 'ALYA SİNEMA', 'ALYA XD'
];

// Renk sabitleri
const SECTION_COLORS = {
  blue:   { border: 'border-blue-700/30',   bg: 'bg-blue-900/30',   text: 'text-blue-400' },
  purple: { border: 'border-orange-700/30', bg: 'bg-orange-900/30', text: 'text-orange-400' },
  green:  { border: 'border-emerald-700/30',  bg: 'bg-emerald-900/30',  text: 'text-emerald-400' },
} as const;

type SectionColor = keyof typeof SECTION_COLORS;
type SectionType = 'acente' | 'munferit' | 'sinema';

const calcTotal = (entries: PaxEntry[]) =>
  entries.reduce((acc, e) => ({ adult: acc.adult + e.adult, child: acc.child + e.child }), { adult: 0, child: 0 });

// ══════════════════════════════════════════════════════════════════════════════
export default function AquariumTab() {
  const kasaId = localStorage.getItem('currentKasaId') || 'wildpark';
  const kasaConfig = getKasaConfig(kasaId);
  const userName = localStorage.getItem('currentUserName') || 'Personel';
  const _now = new Date();
  const reportDate = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;

  // ── Entry state'leri ─────────────────────────────────────────────────────
  const [acenteEntries, setAcenteEntries] = useState<PaxEntry[]>([]);
  const [munferitEntries, setMunferitEntries] = useState<PaxEntry[]>([]);
  const [sinemaEntries, setSinemaEntries] = useState<PaxEntry[]>([]);

  // ── Form state'leri ──────────────────────────────────────────────────────
  const [acenteForm, setAcenteForm] = useState({ name: '', adult: '', child: '' });
  const [munferitForm, setMunferitForm] = useState({ name: '', adult: '', child: '' });
  const [sinemaForm, setSinemaForm] = useState({ name: '', adult: '', child: '' });

  // ── Autocomplete dropdown state (parent'ta → unmount yok) ────────────────
  const [dropdownOpen, setDropdownOpen] = useState<SectionType | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(-1);

  // ── Kayıtlı isimler ─────────────────────────────────────────────────────
  const [savedNames, setSavedNames] = useState<SavedData>({
    acente: [...DEFAULT_ACENTE_LIST],
    munferit: [...DEFAULT_MUNFERIT_LIST],
    sinema: [],
  });
  const [dataLoaded, setDataLoaded] = useState(false);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');

  // ── Ref'ler ──────────────────────────────────────────────────────────────
  const nameRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const adultRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const childRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Form/entry erişim haritası ───────────────────────────────────────────
  const formMap: Record<SectionType, { form: typeof acenteForm; setForm: typeof setAcenteForm; entries: PaxEntry[]; setEntries: typeof setAcenteEntries }> = {
    acente:  { form: acenteForm,  setForm: setAcenteForm,  entries: acenteEntries,  setEntries: setAcenteEntries },
    munferit:{ form: munferitForm,setForm: setMunferitForm,entries: munferitEntries,setEntries: setMunferitEntries },
    sinema:  { form: sinemaForm,  setForm: setSinemaForm,  entries: sinemaEntries,  setEntries: setSinemaEntries },
  };

  // ── Supabase + localStorage'dan yükle ────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      // İsimleri yükle
      const supaNames = await loadPaxNamesFromSupabase(kasaId);
      if (supaNames) {
        setSavedNames({
          acente: [...new Set([...DEFAULT_ACENTE_LIST, ...(supaNames.acente || [])])].sort(),
          munferit: [...new Set([...DEFAULT_MUNFERIT_LIST, ...(supaNames.munferit || [])])].sort(),
          sinema: [...new Set([...(supaNames.sinema || [])])].sort(),
        });
      } else {
        const saved = localStorage.getItem('aquariumSavedNames');
        if (saved) {
          const parsed = JSON.parse(saved);
          setSavedNames({
            acente: [...new Set([...DEFAULT_ACENTE_LIST, ...(parsed.acente || [])])].sort(),
            munferit: [...new Set([...DEFAULT_MUNFERIT_LIST, ...(parsed.munferit || [])])].sort(),
            sinema: [...new Set([...(parsed.sinema || [])])].sort(),
          });
        }
      }

      // Günlük veriyi yükle (Supabase → localStorage fallback)
      let report = await loadPaxReportFromSupabase(kasaId, reportDate);
      if (!report) report = loadPaxReportFromLocal(kasaId, reportDate);
      if (report) {
        setAcenteEntries(report.acente || []);
        setMunferitEntries(report.munferit || []);
        setSinemaEntries(report.sinema || []);
      }
      setDataLoaded(true);
    };
    loadData();
  }, [kasaId, reportDate]);

  // ── Kaydetme (Supabase + localStorage birlikte) ──────────────────────────
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((acente: PaxEntry[], munferit: PaxEntry[], sinema: PaxEntry[]) => {
    if (!dataLoaded) return;
    const payload = { acente, munferit, sinema };
    // localStorage anında kaydet (sayfa yenilemeye karşı)
    savePaxReportToLocal(kasaId, reportDate, payload);
    // Supabase debounced
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => savePaxReportToSupabase(kasaId, reportDate, payload), 500);
  }, [kasaId, reportDate, dataLoaded]);

  const saveNameToMemory = useCallback((name: string, type: SectionType) => {
    if (!name.trim()) return;
    setSavedNames(prev => {
      if (prev[type].includes(name)) return prev;
      const updated = { ...prev, [type]: [...prev[type], name].sort() };
      localStorage.setItem('aquariumSavedNames', JSON.stringify(updated));
      savePaxNamesToSupabase(kasaId, updated);
      return updated;
    });
  }, [kasaId]);

  // ── Entry ekle / sil ────────────────────────────────────────────────────
  const getLatestEntries = (type: SectionType, override?: PaxEntry[]) => ({
    acente:  type === 'acente'  ? (override ?? acenteEntries)  : acenteEntries,
    munferit:type === 'munferit'? (override ?? munferitEntries): munferitEntries,
    sinema:  type === 'sinema'  ? (override ?? sinemaEntries)  : sinemaEntries,
  });

  const addEntry = (type: SectionType) => {
    const { form, setForm, setEntries } = formMap[type];
    if (!form.name.trim()) { nameRefs.current[type]?.focus(); return; }
    const adult = parseInt(form.adult) || 0;
    const child = parseInt(form.child) || 0;
    if (adult === 0 && child === 0) { adultRefs.current[type]?.focus(); return; }

    const entry: PaxEntry = { id: Date.now().toString(), name: form.name.trim(), adult, child };
    setEntries(prev => {
      const next = [...prev, entry];
      const all = getLatestEntries(type, next);
      persist(all.acente, all.munferit, all.sinema);
      return next;
    });
    saveNameToMemory(form.name.trim(), type);
    setForm({ name: '', adult: '', child: '' });
    setDropdownOpen(null);
    setTimeout(() => nameRefs.current[type]?.focus(), 30);
  };

  const deleteEntry = (id: string, type: SectionType) => {
    const { setEntries } = formMap[type];
    setEntries(prev => {
      const next = prev.filter(e => e.id !== id);
      const all = getLatestEntries(type, next);
      persist(all.acente, all.munferit, all.sinema);
      return next;
    });
  };

  // ── Totaller ─────────────────────────────────────────────────────────────
  const acenteTotal = calcTotal(acenteEntries);
  const munferitTotal = calcTotal(munferitEntries);
  const sinemaTotal = calcTotal(sinemaEntries);
  const genelTotal = {
    adult: acenteTotal.adult + munferitTotal.adult + sinemaTotal.adult,
    child: acenteTotal.child + munferitTotal.child + sinemaTotal.child,
  };

  // ── Autocomplete yardımcıları ────────────────────────────────────────────
  const getFiltered = (type: SectionType) => {
    const name = formMap[type].form.name.trim();
    if (!name) return [];
    return savedNames[type].filter(n => n.toLowerCase().includes(name.toLowerCase())).slice(0, 10);
  };

  const selectName = (type: SectionType, name: string) => {
    formMap[type].setForm({ ...formMap[type].form, name });
    setDropdownOpen(null);
    setHighlightIdx(-1);
    setTimeout(() => adultRefs.current[type]?.focus(), 30);
  };

  // ── Keyboard handlers ───────────────────────────────────────────────────
  const handleNameKeyDown = (e: KeyboardEvent<HTMLInputElement>, type: SectionType) => {
    const filtered = getFiltered(type);
    const isOpen = dropdownOpen === type && filtered.length > 0;

    if (isOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' && highlightIdx >= 0) { e.preventDefault(); selectName(type, filtered[highlightIdx]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setDropdownOpen(null); return; }
    }

    if (e.key === 'Tab' && !e.shiftKey) {
      if (isOpen && highlightIdx >= 0) { selectName(type, filtered[highlightIdx]); e.preventDefault(); return; }
      if (formMap[type].form.name.trim() && filtered.length === 1) { selectName(type, filtered[0]); e.preventDefault(); return; }
      setDropdownOpen(null);
    }
    if (e.key === 'Enter' && !isOpen) {
      e.preventDefault();
      if (formMap[type].form.name.trim()) adultRefs.current[type]?.focus();
    }
  };

  const handleFieldKeyDown = (e: KeyboardEvent<HTMLInputElement>, type: SectionType, field: 'adult' | 'child') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'adult') childRefs.current[type]?.focus();
      else addEntry(type);
    }
  };

  // ── HTML Rapor ────────────────────────────────────────────────────────────
  const generateHTMLReport = () => {
    const today = new Date(reportDate).toLocaleDateString('tr-TR');
    const todayFull = new Date(reportDate).toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const buildRows = (entries: PaxEntry[]) =>
      entries.map((e, i) => `<tr style="${i % 2 ? 'background:#fafafa;' : ''}">
        <td style="padding:5px 8px;border-bottom:1px solid #e0e0e0;text-align:center;width:28px;color:#999;font-size:11px">${i + 1}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e0e0e0;font-size:11px">${e.name}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e0e0e0;text-align:center;width:60px;font-weight:600;font-size:11px">${e.adult || '—'}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e0e0e0;text-align:center;width:60px;font-weight:600;font-size:11px">${e.child || '—'}</td>
      </tr>`).join('');

    const sectionBlock = (title: string, entries: PaxEntry[], tot: { adult: number; child: number }) => entries.length === 0 ? '' : `
      <div style="margin-bottom:16px">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead>
            <tr>
              <th colspan="4" style="background:#222;color:#fff;padding:6px 10px;text-align:left;font-size:11px;font-weight:700;letter-spacing:0.3px">${title} <span style="font-weight:400;font-size:10px;opacity:0.7">(${entries.length} kayıt)</span></th>
            </tr>
            <tr style="background:#f5f5f5">
              <th style="padding:5px 8px;text-align:center;font-size:10px;color:#666;width:28px;border-bottom:1px solid #ddd">#</th>
              <th style="padding:5px 8px;text-align:left;font-size:10px;color:#666;border-bottom:1px solid #ddd">Paket / İsim</th>
              <th style="padding:5px 8px;text-align:center;font-size:10px;color:#666;width:60px;border-bottom:1px solid #ddd">Adult</th>
              <th style="padding:5px 8px;text-align:center;font-size:10px;color:#666;width:60px;border-bottom:1px solid #ddd">Child</th>
            </tr>
          </thead>
          <tbody>${buildRows(entries)}</tbody>
          <tfoot><tr style="background:#222;color:#fff">
            <td colspan="2" style="padding:6px 10px;font-weight:700;font-size:11px">TOPLAM</td>
            <td style="padding:6px 10px;text-align:center;font-weight:700;font-size:12px">${tot.adult}</td>
            <td style="padding:6px 10px;text-align:center;font-weight:700;font-size:12px">${tot.child}</td>
          </tr></tfoot>
        </table>
      </div>`;

    const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8">
<title>${kasaConfig.title} - ${today}</title>
<style>
  @page { size: A4; margin: 15mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color:#222; background:#fff; padding:20px; max-width:750px; margin:0 auto; font-size:11px; }
</style>
</head><body>

<!-- Başlık -->
<div style="border-bottom:2px solid #222;padding-bottom:12px;margin-bottom:20px">
  <div style="font-size:24px;font-weight:900;font-style:italic;margin-bottom:4px"><span style="color:#f97316">adrenalin</span><span style="color:#fb923c">.</span></div>
  <h1 style="font-size:18px;font-weight:700;margin-bottom:4px">${kasaConfig.title}</h1>
  <div style="font-size:12px;color:#666">
    <span style="margin-right:15px"><strong>${userName}</strong></span>
    <span>${todayFull}</span>
  </div>
</div>

<!-- Genel Toplam Özet -->
<div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
  <div style="flex:1;min-width:120px;border:1px solid #ccc;border-radius:6px;padding:10px 14px;display:flex;flex-direction:column;gap:4px">
    <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">${kasaConfig.section1}</div>
    <div style="display:flex;flex-direction:column;gap:2px;">
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#1e40af;font-weight:600"><span>ADULT</span><span style="font-size:16px;font-weight:700">${acenteTotal.adult}</span></div>
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#1e40af;font-weight:600"><span>CHILD</span><span style="font-size:16px;font-weight:700">${acenteTotal.child}</span></div>
    </div>
  </div>
  <div style="flex:1;min-width:120px;border:1px solid #ccc;border-radius:6px;padding:10px 14px;display:flex;flex-direction:column;gap:4px">
    <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">${kasaConfig.section2}</div>
    <div style="display:flex;flex-direction:column;gap:2px;">
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#7c3aed;font-weight:600"><span>ADULT</span><span style="font-size:16px;font-weight:700">${munferitTotal.adult}</span></div>
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#7c3aed;font-weight:600"><span>CHILD</span><span style="font-size:16px;font-weight:700">${munferitTotal.child}</span></div>
    </div>
  </div>
  <div style="flex:1;min-width:120px;border:1px solid #ccc;border-radius:6px;padding:10px 14px;display:flex;flex-direction:column;gap:4px">
    <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">${kasaConfig.section3}</div>
    <div style="display:flex;flex-direction:column;gap:2px;">
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#059669;font-weight:600"><span>ADULT</span><span style="font-size:16px;font-weight:700">${sinemaTotal.adult}</span></div>
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#059669;font-weight:600"><span>CHILD</span><span style="font-size:16px;font-weight:700">${sinemaTotal.child}</span></div>
    </div>
  </div>
  <div style="flex:1;min-width:120px;border:2px solid #222;border-radius:6px;padding:10px 14px;display:flex;flex-direction:column;gap:4px">
    <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Genel Toplam</div>
    <div style="display:flex;flex-direction:column;gap:2px;">
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#222;font-weight:600"><span>ADULT</span><span style="font-size:16px;font-weight:700">${genelTotal.adult}</span></div>
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#222;font-weight:600"><span>CHILD</span><span style="font-size:16px;font-weight:700">${genelTotal.child}</span></div>
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#666;font-weight:400;margin-top:2px"><span>PAX</span><span style="font-size:15px;font-weight:700">${genelTotal.adult + genelTotal.child}</span></div>
    </div>
  </div>
</div>

<!-- Bölümler -->
${sectionBlock(kasaConfig.section1, acenteEntries, acenteTotal)}
${sectionBlock(kasaConfig.section2, munferitEntries, munferitTotal)}
${sectionBlock(kasaConfig.section3, sinemaEntries, sinemaTotal)}

<!-- Yazdır -->
<div style="text-align:center;margin-top:20px">
  <button class="no-print" onclick="window.print()" style="display:block;margin:0 auto;padding:10px 30px;background:#222;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer">🖨️ Yazdır</button>
</div>

<!-- Footer -->
<div style="margin-top:20px;text-align:center;font-size:9px;color:#aaa;border-top:1px solid #ddd;padding-top:8px">
  Adrenalin Satış Sistemi — ${kasaConfig.paxName} — ${today}
</div>

</body></html>`;

    const w = window.open('', 'reportWindow', 'width=850,height=700,scrollbars=yes,resizable=yes');
    if (w) { w.document.write(html); w.document.close(); }
  };

  // ── Excel ────────────────────────────────────────────────────────────────
  const generateExcel = () => {
    const today = new Date(reportDate).toLocaleDateString('tr-TR');
    const genel = { adult: genelTotal.adult, child: genelTotal.child };
    const maxRows = Math.max(acenteEntries.length, munferitEntries.length, sinemaEntries.length);

    const dataRows = [];
    for (let i = 0; i < maxRows; i++) {
      const a = acenteEntries[i]; const m = munferitEntries[i]; const s = sinemaEntries[i];
      dataRows.push(`<Row ss:Height="20">
        <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${a ? a.name : ''}</Data></Cell>
        <Cell ss:StyleID="DataCenter"><Data ss:Type="${a ? 'Number' : 'String'}">${a ? a.adult : ''}</Data></Cell>
        <Cell ss:StyleID="DataCenter"><Data ss:Type="${a ? 'Number' : 'String'}">${a ? a.child : ''}</Data></Cell>
        <Cell ss:StyleID="Empty"></Cell>
        <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${m ? m.name : ''}</Data></Cell>
        <Cell ss:StyleID="DataCenter"><Data ss:Type="${m ? 'Number' : 'String'}">${m ? m.adult : ''}</Data></Cell>
        <Cell ss:StyleID="DataCenter"><Data ss:Type="${m ? 'Number' : 'String'}">${m ? m.child : ''}</Data></Cell>
        <Cell ss:StyleID="Empty"></Cell>
        <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${s ? s.name : ''}</Data></Cell>
        <Cell ss:StyleID="DataCenter"><Data ss:Type="${s ? 'Number' : 'String'}">${s ? s.adult : ''}</Data></Cell>
        <Cell ss:StyleID="DataCenter"><Data ss:Type="${s ? 'Number' : 'String'}">${s ? s.child : ''}</Data></Cell>
      </Row>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
  <Style ss:ID="Default"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10"/></Style>
  <Style ss:ID="Empty"><Interior ss:Color="#F2F2F2" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Title"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1F4E79" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/></Borders></Style>
  <Style ss:ID="TitleInfo"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF"/><Interior ss:Color="#1F4E79" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/></Borders></Style>
  <Style ss:ID="GenelToplam"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#00B050" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/></Borders></Style>
  <Style ss:ID="SectionBlue"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#4472C4" ss:Pattern="Solid"/></Style>
  <Style ss:ID="SectionPurple"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#7030A0" ss:Pattern="Solid"/></Style>
  <Style ss:ID="SectionGreen"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#00B050" ss:Pattern="Solid"/></Style>
  <Style ss:ID="TableHeader"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#5B9BD5" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="TableHeaderLeft"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#5B9BD5" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="DataLeft"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/></Borders></Style>
  <Style ss:ID="DataCenter"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFBFBF"/></Borders></Style>
  <Style ss:ID="TotalBlue"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#BDD7EE" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/></Borders></Style>
  <Style ss:ID="TotalPurple"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#E2D0F0" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/></Borders></Style>
  <Style ss:ID="TotalGreen"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#C6EFCE" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/></Borders></Style>
</Styles>
<Worksheet ss:Name="Günlük Rapor">
<Table ss:DefaultColumnWidth="80" ss:DefaultRowHeight="18">
  <Column ss:Index="1" ss:Width="150"/><Column ss:Index="2" ss:Width="70"/><Column ss:Index="3" ss:Width="70"/>
  <Column ss:Index="4" ss:Width="15"/>
  <Column ss:Index="5" ss:Width="150"/><Column ss:Index="6" ss:Width="70"/><Column ss:Index="7" ss:Width="70"/>
  <Column ss:Index="8" ss:Width="15"/>
  <Column ss:Index="9" ss:Width="150"/><Column ss:Index="10" ss:Width="70"/><Column ss:Index="11" ss:Width="70"/>
  <Row ss:Height="30">
    <Cell ss:MergeAcross="4" ss:StyleID="Title"><Data ss:Type="String">${kasaConfig.title}</Data></Cell>
    <Cell ss:Index="6" ss:MergeAcross="2" ss:StyleID="TitleInfo"><Data ss:Type="String">${userName}</Data></Cell>
    <Cell ss:Index="10" ss:MergeAcross="1" ss:StyleID="TitleInfo"><Data ss:Type="String">${today}</Data></Cell>
  </Row>
  <Row ss:Height="8"></Row>
  <Row ss:Height="25">
    <Cell ss:MergeAcross="2" ss:StyleID="GenelToplam"><Data ss:Type="String">GENEL TOPLAM</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:MergeAcross="2" ss:StyleID="GenelToplam"><Data ss:Type="String">Adult: ${genel.adult}</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:MergeAcross="2" ss:StyleID="GenelToplam"><Data ss:Type="String">Child: ${genel.child}</Data></Cell>
  </Row>
  <Row ss:Height="10"></Row>
  <Row ss:Height="25">
    <Cell ss:MergeAcross="2" ss:StyleID="SectionBlue"><Data ss:Type="String">${kasaConfig.section1}</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:MergeAcross="2" ss:StyleID="SectionPurple"><Data ss:Type="String">${kasaConfig.section2}</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:MergeAcross="2" ss:StyleID="SectionGreen"><Data ss:Type="String">${kasaConfig.section3}</Data></Cell>
  </Row>
  <Row ss:Height="20">
    <Cell ss:StyleID="TableHeaderLeft"><Data ss:Type="String">Paket</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Adult</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Child</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="TableHeaderLeft"><Data ss:Type="String">Paket</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Adult</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Child</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="TableHeaderLeft"><Data ss:Type="String">Paket</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Adult</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Child</Data></Cell>
  </Row>
  ${dataRows.join('')}
  <Row ss:Height="22">
    <Cell ss:StyleID="TotalBlue"><Data ss:Type="String">TOPLAM</Data></Cell>
    <Cell ss:StyleID="TotalBlue"><Data ss:Type="Number">${acenteTotal.adult}</Data></Cell>
    <Cell ss:StyleID="TotalBlue"><Data ss:Type="Number">${acenteTotal.child}</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="TotalPurple"><Data ss:Type="String">TOPLAM</Data></Cell>
    <Cell ss:StyleID="TotalPurple"><Data ss:Type="Number">${munferitTotal.adult}</Data></Cell>
    <Cell ss:StyleID="TotalPurple"><Data ss:Type="Number">${munferitTotal.child}</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="TotalGreen"><Data ss:Type="String">TOPLAM</Data></Cell>
    <Cell ss:StyleID="TotalGreen"><Data ss:Type="Number">${sinemaTotal.adult}</Data></Cell>
    <Cell ss:StyleID="TotalGreen"><Data ss:Type="Number">${sinemaTotal.child}</Data></Cell>
  </Row>
</Table></Worksheet></Workbook>`;

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${kasaId.charAt(0).toUpperCase() + kasaId.slice(1)}_Rapor_${today.replace(/\./g, '-')}.xls`;
    link.click();
    URL.revokeObjectURL(url);
    return xml;
  };

  // ── Mail ─────────────────────────────────────────────────────────────────
  const handleSendEmail = () => {
    if (!emailTo.trim()) { alert('Lütfen e-posta adresi girin'); return; }
    const today = new Date(reportDate).toLocaleDateString('tr-TR');
    generateExcel();
    const subject = `${kasaConfig.title} - ${today}`;
    let body = `${kasaConfig.title}%0D%0A`;
    body += `Personel: ${userName}%0D%0ATarih: ${today}%0D%0A%0D%0A`;
    body += `GENEL TOPLAM: Adult: ${genelTotal.adult} | Child: ${genelTotal.child}%0D%0A%0D%0A`;
    body += `${kasaConfig.section1}: A:${acenteTotal.adult} C:${acenteTotal.child}%0D%0A`;
    body += `${kasaConfig.section2}: A:${munferitTotal.adult} C:${munferitTotal.child}%0D%0A`;
    body += `${kasaConfig.section3}: A:${sinemaTotal.adult} C:${sinemaTotal.child}%0D%0A%0D%0A`;
    body += `Excel dosyası ekte gönderilmiştir.`;
    window.location.href = `mailto:${emailTo}?subject=${encodeURIComponent(subject)}&body=${body}`;
    alert('Excel indirildi ve mail uygulaması açıldı!\nİndirilen dosyayı mail\'e eklemeyi unutmayın.');
    setShowEmailModal(false);
  };

  // ── Section render (inline fonksiyon, hook yok → unmount olmaz) ──────────
  const renderSection = (type: SectionType, title: string, color: SectionColor) => {
    const { form, setForm, entries } = formMap[type];
    const total = calcTotal(entries);
    const c = SECTION_COLORS[color];
    const filtered = getFiltered(type);
    const isOpen = dropdownOpen === type && filtered.length > 0;

    return (
      <div className={`rounded-xl border ${c.border} bg-gray-800/40 overflow-x-auto`}>
        <div className={`${c.bg} px-3 sm:px-4 py-2.5 sm:py-3 border-b ${c.border} flex items-center justify-between gap-2 flex-wrap`}>
          <h3 className={`text-xs sm:text-sm font-bold ${c.text} uppercase tracking-wider`}>{title}</h3>
          <div className="flex items-center gap-2 sm:gap-3 text-xs">
            <span className={c.text}>{total.adult}<span className="text-gray-500 ml-0.5"> ADULT</span></span>
            <span className={c.text}>{total.child}<span className="text-gray-500 ml-0.5"> CHILD</span></span>
          </div>
        </div>
        <div className="p-3 sm:p-4">

        {/* Form */}
        <div className="flex flex-wrap gap-2 mb-3 mt-0">
          <div className="flex-1 relative">
            <input
              ref={el => { nameRefs.current[type] = el; }}
              type="text"
              value={form.name}
              onChange={e => {
                setForm({ ...form, name: e.target.value });
                setDropdownOpen(e.target.value.trim() ? type : null);
                setHighlightIdx(-1);
              }}
              onFocus={() => { if (form.name.trim()) setDropdownOpen(type); }}
              onBlur={() => setTimeout(() => { if (dropdownOpen === type) setDropdownOpen(null); }, 150)}
              onKeyDown={e => handleNameKeyDown(e, type)}
              placeholder="İsim gir..."
              className="w-full px-2 py-1.5 bg-gray-800/50 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-orange-500"
              autoComplete="off"
            />
            {isOpen && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-gray-900 border border-gray-600 rounded-lg shadow-boltify-lg max-h-48 overflow-y-auto">
                {filtered.map((name, idx) => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); selectName(type, name); }}
                    className={`w-full text-left px-3 py-1.5 text-sm ${idx === highlightIdx ? 'bg-orange-600/30 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            ref={el => { adultRefs.current[type] = el; }}
            type="number"
            value={form.adult}
            onChange={e => setForm({ ...form, adult: e.target.value })}
            onKeyDown={e => handleFieldKeyDown(e, type, 'adult')}
            placeholder="A"
            className="w-14 px-2 py-2 sm:py-1.5 bg-gray-800/50 border border-gray-700 rounded text-white text-sm text-center focus:outline-none focus:border-orange-500"
            min="0"
          />
          <input
            ref={el => { childRefs.current[type] = el; }}
            type="number"
            value={form.child}
            onChange={e => setForm({ ...form, child: e.target.value })}
            onKeyDown={e => handleFieldKeyDown(e, type, 'child')}
            placeholder="C"
            className="w-14 px-2 py-2 sm:py-1.5 bg-gray-800/50 border border-gray-700 rounded text-white text-sm text-center focus:outline-none focus:border-orange-500"
            min="0"
          />
          <button onClick={() => addEntry(type)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 sm:py-1.5 rounded-lg text-sm border border-emerald-500 transition-colors" tabIndex={-1}>
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Tablo */}
        <div className="max-h-60 overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0">
              <tr className="bg-gray-800/80 border-b border-gray-700/60">
                <th className="text-left py-2 px-3 text-gray-400 font-semibold uppercase tracking-wider text-[11px]">Paket / İsim</th>
                <th className="text-center py-2 px-3 w-16 text-blue-500/70 font-semibold uppercase tracking-wider text-[11px]">Adult</th>
                <th className="text-center py-2 px-3 w-16 text-emerald-500/70 font-semibold uppercase tracking-wider text-[11px]">Child</th>
                <th className="w-8 py-2 px-2 text-gray-400 font-semibold uppercase tracking-wider text-[11px] text-center">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/30">
              {entries.map((entry, idx) => (
                <tr key={entry.id} className={`transition-colors ${idx % 2 === 0 ? 'bg-transparent hover:bg-gray-700/20' : 'bg-gray-800/20 hover:bg-gray-700/20'}`}>
                  <td className="py-2 px-3 text-white">{entry.name}</td>
                  <td className="py-2 px-3 text-center font-medium text-blue-400">{entry.adult || <span className="text-gray-600">—</span>}</td>
                  <td className="py-2 px-3 text-center font-medium text-emerald-400">{entry.child || <span className="text-gray-600">—</span>}</td>
                  <td className="py-2 px-2 text-center">
                    <button onClick={() => deleteEntry(entry.id, type)} className="text-gray-500 hover:text-red-400 p-1.5 sm:p-0.5 rounded transition-colors hover:bg-red-500/10" tabIndex={-1}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-gray-500 text-xs">Henüz veri yok</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-gray-800/90 border-t-2 border-gray-600/50">
                <td className="py-2.5 px-3 text-white font-bold text-xs">TOPLAM</td>
                <td className="py-2.5 px-3 text-center text-blue-400 font-bold text-xs">{total.adult}</td>
                <td className="py-2.5 px-3 text-center text-emerald-400 font-bold text-xs">{total.child}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        </div>
      </div>
    );
  };

  const hasData = acenteEntries.length > 0 || munferitEntries.length > 0 || sinemaEntries.length > 0;
  const todayFormatted = new Date(reportDate).toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-2 sm:p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-boltify-lg">
            <Droplets className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">{kasaConfig.title}</h2>
            <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 font-medium max-w-[200px] sm:max-w-none truncate">{userName} · {todayFormatted}</p>
          </div>
        </div>
      </div>

      {/* Özet Kartları */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-gradient-to-br from-blue-950/80 to-gray-900 rounded-xl border border-blue-500/30 p-3 shadow-boltify-card ring-1 ring-blue-500/10 flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] text-blue-300/70 font-bold uppercase tracking-widest">{kasaConfig.section1}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-blue-300 text-sm font-semibold">
              <span>Yetişkin</span>
              <span className="text-lg font-bold">{acenteTotal.adult}</span>
            </div>
            <div className="flex items-center justify-between text-blue-300 text-sm font-semibold">
              <span>Çocuk</span>
              <span className="text-lg font-bold">{acenteTotal.child}</span>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-orange-950/80 to-gray-900 rounded-xl border border-orange-500/30 p-3 shadow-boltify-card ring-1 ring-orange-500/10 flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[10px] text-orange-300/70 font-bold uppercase tracking-widest">{kasaConfig.section2}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-orange-300 text-sm font-semibold">
              <span>Yetişkin</span>
              <span className="text-lg font-bold">{munferitTotal.adult}</span>
            </div>
            <div className="flex items-center justify-between text-orange-300 text-sm font-semibold">
              <span>Çocuk</span>
              <span className="text-lg font-bold">{munferitTotal.child}</span>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-950/80 to-gray-900 rounded-xl border border-emerald-500/30 p-3 shadow-boltify-card ring-1 ring-emerald-500/10 flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] text-emerald-300/70 font-bold uppercase tracking-widest">{kasaConfig.section3}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-emerald-300 text-sm font-semibold">
              <span>Yetişkin</span>
              <span className="text-lg font-bold">{sinemaTotal.adult}</span>
            </div>
            <div className="flex items-center justify-between text-emerald-300 text-sm font-semibold">
              <span>Çocuk</span>
              <span className="text-lg font-bold">{sinemaTotal.child}</span>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-orange-950/80 to-gray-900 rounded-xl border border-orange-400/40 p-3 shadow-boltify-card ring-1 ring-orange-400/20 flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-3.5 h-3.5 text-white" />
            <span className="text-[10px] text-orange-300/70 font-bold uppercase tracking-widest">Genel Toplam</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-white text-sm font-semibold">
              <span>Yetişkin</span>
              <span className="text-lg font-bold">{genelTotal.adult}</span>
            </div>
            <div className="flex items-center justify-between text-white text-sm font-semibold">
              <span>Çocuk</span>
              <span className="text-lg font-bold">{genelTotal.child}</span>
            </div>
            <div className="flex items-center justify-between text-sky-400 text-xs font-bold mt-1 border-t border-orange-500/20 pt-1">
              <span>PAX</span>
              <span className="text-base">{genelTotal.adult + genelTotal.child}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Bölüm */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {renderSection('acente', kasaConfig.section1, 'blue')}
        {renderSection('munferit', kasaConfig.section2, 'purple')}
        {renderSection('sinema', kasaConfig.section3, 'green')}
      </div>

      {/* Butonlar */}
      {hasData && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gradient-to-r from-orange-500/10 to-orange-500/5 rounded-xl border border-orange-500/30 p-3 gap-2">
          <div className="text-xs text-gray-500">
            <span className="font-medium text-gray-400">{acenteEntries.length + munferitEntries.length + sinemaEntries.length}</span> kayıt · PAX: <span className="font-black text-white">{genelTotal.adult + genelTotal.child}</span>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={generateHTMLReport}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-xl transition-all text-xs font-bold shadow-boltify-card"
            >
              <FileText className="w-3.5 h-3.5" />
              Rapor
            </button>
            <button
              onClick={() => setShowEmailModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white rounded-xl transition-all text-xs font-bold shadow-boltify-card"
            >
              <Mail className="w-3.5 h-3.5" />
              Mail
            </button>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700/80 p-6 max-w-md w-full shadow-boltify-lg">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-orange-600 rounded-xl flex items-center justify-center shadow-boltify-card">
                <Mail className="w-4 h-4 text-white" />
              </span>
              Rapor Gönder
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">E-posta Adresi</label>
                <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="ornek@email.com" className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded text-white" />
              </div>
              <div className="bg-gray-800/30 rounded p-3 text-sm text-gray-400">
                <p className="font-bold mb-2">Rapor Özeti:</p>
                <p>Tarih: {new Date(reportDate).toLocaleDateString('tr-TR')}</p>
                <p>Personel: {userName}</p>
                <hr className="my-2 border-gray-700" />
                <p>{kasaConfig.section1}: Y:{acenteTotal.adult} Ç:{acenteTotal.child}</p>
                <p>{kasaConfig.section2}: Y:{munferitTotal.adult} Ç:{munferitTotal.child}</p>
                <p>{kasaConfig.section3}: Y:{sinemaTotal.adult} Ç:{sinemaTotal.child}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSendEmail} className="flex-1 bg-orange-600 hover:bg-orange-500 text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-medium border border-orange-500">
                  <Mail className="w-4 h-4" /> Gönder
                </button>
                <button onClick={() => setShowEmailModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors text-sm border border-gray-700">İptal</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
