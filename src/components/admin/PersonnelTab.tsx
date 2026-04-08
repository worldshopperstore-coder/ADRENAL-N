import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Users, Plus, Edit2, Trash2, ArrowLeft, Search, CheckCircle, XCircle,
  TreePine, Monitor, Users2, Camera, X, Calendar, TrendingUp, Package,
  ArrowLeftRight, Star, BarChart2, Clock, Phone, User, Lock, Eye, EyeOff, MapPin,
  AlertTriangle, Timer, Coffee, Umbrella, PlusCircle, Minus, Heart,
} from 'lucide-react';
import type { Personnel } from '@/types/personnel';
import {
  getAllPersonnelFromFirebase,
  addPersonnelToFirebase,
  updatePersonnelInFirebase,
  deletePersonnelFromFirebase,
  getKasaShifts,
  getPersonnelShift,
  type WeekDays,
  type WeekSchedule,
} from '@/utils/personnelSupabaseDB';
import { getPersonnelAttendance, getTodayAttendance, type AttendanceRecord } from '@/utils/attendanceDB';
import {
  getAllSalesForDateRange,
  getAllCrossSalesForDateRange,
  type DatedSale,
} from '@/utils/performanceDB';
import {
  getPersonnelLeaves, createLeave, deleteLeave, countLeaveDays, isDateOnLeave,
  LEAVE_LABELS, LEAVE_COLORS, type LeaveRecord, type LeaveType,
} from '@/utils/leavesDB';
import { INITIAL_PACKAGES } from '@/data/packages';
import ShiftBoardModal from './ShiftBoardModal';
import AnnouncementsAdminTab from './AnnouncementsAdminTab';

type KasaId = 'wildpark' | 'sinema' | 'face2face' | 'yasam_destek';

const KASAS = [
  { id: 'wildpark' as KasaId, name: 'WildPark', Icon: TreePine,  accent: 'emerald', text: 'text-emerald-400', bg: 'bg-emerald-500/10', borderAccent: 'border-emerald-500/20' },
  { id: 'sinema' as KasaId,   name: 'Sinema',   Icon: Monitor,   accent: 'violet',  text: 'text-violet-400',  bg: 'bg-violet-500/10',  borderAccent: 'border-violet-500/20'  },
  { id: 'face2face' as KasaId,name: 'Face2Face', Icon: Users2,    accent: 'sky',     text: 'text-sky-400',     bg: 'bg-sky-500/10',     borderAccent: 'border-sky-500/20'     },
  { id: 'yasam_destek' as KasaId, name: 'Yaşam Destek', Icon: Heart, accent: 'rose', text: 'text-rose-400', bg: 'bg-rose-500/10', borderAccent: 'border-rose-500/20' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-blue-500/30 text-blue-300', 'bg-emerald-500/30 text-emerald-300',
  'bg-purple-500/30 text-purple-300', 'bg-orange-500/30 text-orange-300',
  'bg-pink-500/30 text-pink-300', 'bg-amber-500/30 text-amber-300',
  'bg-yellow-500/30 text-yellow-300',
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function toTL(s: DatedSale, usdRate: number, eurRate: number): number {
  return (s.kkTl || 0) + (s.cashTl || 0) + (s.cashUsd || 0) * usdRate + (s.cashEur || 0) * eurRate;
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
const fmtDate = (d: Date) => d.toISOString().split('T')[0];

const CAT_COLORS: Record<string, { bar: string; text: string }> = {
  'Münferit':        { bar: 'bg-emerald-500', text: 'text-emerald-400' },
  'Visitor':         { bar: 'bg-blue-500',    text: 'text-blue-400'    },
  'Çapraz Münferit': { bar: 'bg-orange-500',  text: 'text-orange-400'  },
  'Çapraz Visitor':  { bar: 'bg-purple-500',  text: 'text-purple-400'  },
  'Acenta':          { bar: 'bg-pink-500',    text: 'text-pink-400'    },
};

interface FormState {
  fullName: string;
  username: string;
  password: string;
  phone: string;
  weeklyTargetHours: number;
  isActive: boolean;
  profileImage: string;
}

const emptyForm: FormState = {
  fullName: '', username: '', password: '', phone: '',
  weeklyTargetHours: 45, isActive: true, profileImage: '',
};

// ── Personnel Detail Modal (Full Analytics) ────────────────────────────────
const DAY_KEYS: WeekDays[] = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAY_TR: Record<WeekDays, string> = { monday:'Pzt', tuesday:'Sal', wednesday:'Çar', thursday:'Per', friday:'Cum', saturday:'Cmt', sunday:'Paz' };

function getScheduledMinutes(schedule: WeekSchedule, day: WeekDays): number {
  const d = schedule[day];
  if (d.isOff) return 0;
  const [sh,sm] = d.startTime.split(':').map(Number);
  const [eh,em] = d.endTime.split(':').map(Number);
  return Math.max(0, (eh*60+em) - (sh*60+sm));
}

function minutesToHM(min: number): string {
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  const sign = min < 0 ? '-' : '';
  return `${sign}${h}s ${m}dk`;
}

function dateToWeekDay(dateStr: string): WeekDays {
  const d = new Date(dateStr + 'T00:00:00').getDay(); // 0=sun
  const map: WeekDays[] = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  return map[d];
}

interface PuantajRow {
  date: string;
  dayKey: WeekDays;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduledMin: number;
  actualStart: string | null;
  actualEnd: string | null;
  workedMin: number;
  lateMin: number;      // geç gelme
  earlyMin: number;     // erken çıkma
  overtimeMin: number;  // fazla mesai
  status: 'normal' | 'late' | 'absent' | 'leave' | 'off' | 'no_record';
  leaveRecord: LeaveRecord | null;
  attendance: AttendanceRecord | null;
}

function PersonnelDetailModal({ person, onClose }: { person: Personnel; onClose: () => void }) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(fmtDate(monthStart));
  const [endDate, setEndDate] = useState(fmtDate(today));
  const [sales, setSales] = useState<DatedSale[]>([]);
  const [crossSales, setCrossSales] = useState<DatedSale[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [schedule, setSchedule] = useState<WeekSchedule | null>(null);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'puantaj' | 'sales' | 'leaves'>('overview');
  // leave form
  const [leaveForm, setLeaveForm] = useState(false);
  const [lf, setLf] = useState({ start: fmtDate(today), end: fmtDate(today), type: 'yillik' as LeaveType, note: '' });
  const [leaveSaving, setLeaveSaving] = useState(false);

  const rates = useMemo(() => {
    try {
      const r = JSON.parse(localStorage.getItem('exchange_rates') || '{}');
      return { usd: Number(r.usd) || 35, eur: Number(r.eur) || 38 };
    } catch { return { usd: 35, eur: 38 }; }
  }, []);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      getAllSalesForDateRange(startDate, endDate),
      getAllCrossSalesForDateRange(startDate, endDate),
      getPersonnelAttendance(person.id, startDate, endDate),
      getPersonnelShift(person.id),
      getPersonnelLeaves(person.id).catch(() => [] as LeaveRecord[]),
    ]).then(([s, cs, att, sch, lv]) => {
      setSales(s.filter(x => x.personnelId === person.id));
      setCrossSales(cs.filter(x => x.personnelId === person.id));
      setAttendance(att);
      setSchedule(sch);
      setLeaves(lv);
      setLoading(false);
    });
  }, [startDate, endDate, person.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Puantaj Analysis ──────────────────────────────────────────────────
  const puantajRows = useMemo<PuantajRow[]>(() => {
    if (!schedule) return [];
    const rows: PuantajRow[] = [];
    const d = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    while (d <= end) {
      const dateStr = d.toISOString().slice(0, 10);
      const dayKey = dateToWeekDay(dateStr);
      const daySchedule = schedule[dayKey];
      const scheduledMin = getScheduledMinutes(schedule, dayKey);
      const att = attendance.find(a => a.date === dateStr);
      const leave = isDateOnLeave(leaves, dateStr);

      const row: PuantajRow = {
        date: dateStr,
        dayKey,
        scheduledStart: daySchedule.isOff ? null : daySchedule.startTime,
        scheduledEnd: daySchedule.isOff ? null : daySchedule.endTime,
        scheduledMin,
        actualStart: att?.check_in ? new Date(att.check_in).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : null,
        actualEnd: att?.check_out ? new Date(att.check_out).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : null,
        workedMin: 0,
        lateMin: 0,
        earlyMin: 0,
        overtimeMin: 0,
        status: 'no_record',
        leaveRecord: leave,
        attendance: att || null,
      };

      if (leave) {
        row.status = 'leave';
      } else if (daySchedule.isOff) {
        row.status = 'off';
        // Off günde çalıştıysa -> fazla mesai
        if (att?.check_in && att?.check_out) {
          row.workedMin = Math.round((new Date(att.check_out).getTime() - new Date(att.check_in).getTime()) / 60000);
          row.overtimeMin = row.workedMin;
        }
      } else if (att?.check_in && att?.check_out) {
        row.workedMin = Math.round((new Date(att.check_out).getTime() - new Date(att.check_in).getTime()) / 60000);
        // Geç gelme: actual check_in vs scheduled start
        const [schH, schM] = daySchedule.startTime.split(':').map(Number);
        const ciDate = new Date(att.check_in);
        const ciMin = ciDate.getHours() * 60 + ciDate.getMinutes();
        const schStartMin = schH * 60 + schM;
        if (ciMin > schStartMin + 5) { // 5dk tolerans
          row.lateMin = ciMin - schStartMin;
        }
        // Erken çıkma: actual check_out vs scheduled end
        const [eH, eM] = daySchedule.endTime.split(':').map(Number);
        const coDate = new Date(att.check_out);
        const coMin = coDate.getHours() * 60 + coDate.getMinutes();
        const schEndMin = eH * 60 + eM;
        if (coMin < schEndMin - 5) { // 5dk tolerans
          row.earlyMin = schEndMin - coMin;
        }
        // Fazla mesai: scheduled'den fazla çalışma
        if (row.workedMin > scheduledMin + 15) { // 15dk tolerans
          row.overtimeMin = row.workedMin - scheduledMin;
        }
        row.status = row.lateMin > 0 ? 'late' : 'normal';
      } else if (att?.check_in && !att?.check_out) {
        // Henüz çıkış yapmamış (hala çalışıyor)
        row.workedMin = Math.round((Date.now() - new Date(att.check_in).getTime()) / 60000);
        row.status = 'normal';
      } else if (scheduledMin > 0 && dateStr <= fmtDate(today)) {
        // Vardiyası var ama hiç giriş yapmamış = devamsızlık
        row.status = 'absent';
      }

      rows.push(row);
      d.setDate(d.getDate() + 1);
    }
    return rows.reverse(); // newest first
  }, [attendance, schedule, leaves, startDate, endDate]);

  // ── Summary Stats ─────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalWorkedMin = puantajRows.reduce((a, r) => a + r.workedMin, 0);
    const totalScheduledMin = puantajRows.reduce((a, r) => a + r.scheduledMin, 0);
    const totalOvertimeMin = puantajRows.reduce((a, r) => a + r.overtimeMin, 0);
    const totalLateMin = puantajRows.reduce((a, r) => a + r.lateMin, 0);
    const totalEarlyMin = puantajRows.reduce((a, r) => a + r.earlyMin, 0);
    const workDays = puantajRows.filter(r => r.status === 'normal' || r.status === 'late').length;
    const absentDays = puantajRows.filter(r => r.status === 'absent').length;
    const lateDays = puantajRows.filter(r => r.status === 'late').length;
    const leaveDays = countLeaveDays(leaves, startDate, endDate);
    const offDays = puantajRows.filter(r => r.status === 'off' && r.workedMin === 0).length;
    const avgDailyMin = workDays > 0 ? Math.round(totalWorkedMin / workDays) : 0;

    // Haftalık hedef karşılaştırma
    const weeklyTarget = person.weeklyTargetHours ?? 45;
    const totalDays = puantajRows.length;
    const weeks = Math.max(1, totalDays / 7);
    const expectedTotalMin = weeklyTarget * 60 * weeks;
    const targetPct = expectedTotalMin > 0 ? Math.round((totalWorkedMin / expectedTotalMin) * 100) : 0;

    const totalRevenue = sales.reduce((a, s) => a + toTL(s, rates.usd, rates.eur), 0);
    const totalPersons = sales.reduce((a, s) => a + (s.adultQty || 0) + (s.childQty || 0), 0);

    return {
      totalWorkedMin, totalScheduledMin, totalOvertimeMin, totalLateMin, totalEarlyMin,
      workDays, absentDays, lateDays, leaveDays, offDays, avgDailyMin,
      weeklyTarget, targetPct, expectedTotalMin,
      totalRevenue, totalPersons, crossCount: crossSales.length,
    };
  }, [puantajRows, leaves, sales, crossSales, rates, person.weeklyTargetHours, startDate, endDate]);

  // ── Sales stats ────────────────────────────────────────────────────────
  const salesStats = useMemo(() => {
    const catMap: Record<string, { count: number; revenue: number }> = {};
    const pkgMap: Record<string, { count: number; revenue: number }> = {};
    const dailyMap: Record<string, number> = {};
    for (const s of sales) {
      const cat = guessCategory(s.packageName, s.category);
      if (!catMap[cat]) catMap[cat] = { count: 0, revenue: 0 };
      catMap[cat].count += (s.adultQty || 0) + (s.childQty || 0);
      catMap[cat].revenue += toTL(s, rates.usd, rates.eur);
      if (!pkgMap[s.packageName]) pkgMap[s.packageName] = { count: 0, revenue: 0 };
      pkgMap[s.packageName].count += (s.adultQty || 0) + (s.childQty || 0);
      pkgMap[s.packageName].revenue += toTL(s, rates.usd, rates.eur);
      dailyMap[s.date] = (dailyMap[s.date] || 0) + toTL(s, rates.usd, rates.eur);
    }
    const categories = Object.entries(catMap).sort((a, b) => b[1].revenue - a[1].revenue);
    const topPackages = Object.entries(pkgMap).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8);
    const dailyEntries = Object.entries(dailyMap).sort((a, b) => a[0].localeCompare(b[0]));
    const maxDaily = Math.max(...dailyEntries.map(d => d[1]), 1);
    return { categories, topPackages, dailyEntries, maxDaily };
  }, [sales, rates]);

  // ── Leave handlers ─────────────────────────────────────────────────────
  const handleAddLeave = async () => {
    setLeaveSaving(true);
    const session = localStorage.getItem('userSession');
    const adminId = session ? (JSON.parse(session).personnel?.id ?? 'admin') : 'admin';
    const ok = await createLeave({
      personnel_id: person.id,
      personnel_name: person.fullName,
      kasa_id: person.kasaId,
      start_date: lf.start,
      end_date: lf.end,
      leave_type: lf.type,
      note: lf.note,
      created_by: adminId,
    });
    setLeaveSaving(false);
    if (!ok) { alert('İzin kaydedilemedi. Lütfen tekrar deneyin.'); return; }
    setLeaveForm(false);
    setLf({ start: fmtDate(today), end: fmtDate(today), type: 'yillik', note: '' });
    loadData();
  };

  const handleDeleteLeave = async (id: string) => {
    await deleteLeave(id);
    loadData();
  };

  const kasa = KASAS.find(k => k.id === person.kasaId);
  const isYasamDestek = person.kasaId === 'yasam_destek';
  const TABS = [
    { id: 'overview' as const, label: 'Genel Bakış', icon: BarChart2 },
    { id: 'puantaj' as const, label: 'Puantaj', icon: Clock },
    ...(!isYasamDestek ? [{ id: 'sales' as const, label: 'Satış Detay', icon: TrendingUp }] : []),
    { id: 'leaves' as const, label: 'İzinler', icon: Umbrella },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-boltify-lg" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            {person.profileImage ? (
              <img src={person.profileImage} alt="" className="w-10 h-10 rounded-xl object-cover" />
            ) : (
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${avatarColor(person.fullName)}`}>
                {initials(person.fullName)}
              </div>
            )}
            <div>
              <h3 className="text-lg font-bold text-white">{person.fullName}</h3>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {kasa && <span className={kasa.text}>{kasa.name}</span>}
                {person.phone && <span>• {person.phone}</span>}
                <span>• Hedef: {person.weeklyTargetHours ?? 45}s/hafta</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Date range + Tabs */}
        <div className="px-4 sm:px-6 py-3 border-b border-gray-800 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Calendar className="w-4 h-4 text-gray-500" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500" />
            <span className="text-gray-600">→</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500" />
            <div className="flex gap-1 ml-auto">
              {[
                { label: 'Bugün', fn: () => { setStartDate(fmtDate(today)); setEndDate(fmtDate(today)); } },
                { label: 'Bu Hafta', fn: () => { const s = new Date(today); s.setDate(s.getDate() - 6); setStartDate(fmtDate(s)); setEndDate(fmtDate(today)); } },
                { label: 'Bu Ay', fn: () => { setStartDate(fmtDate(monthStart)); setEndDate(fmtDate(today)); } },
                { label: 'Son 3 Ay', fn: () => { const s = new Date(today); s.setMonth(s.getMonth() - 3); setStartDate(fmtDate(s)); setEndDate(fmtDate(today)); } },
              ].map(q => (
                <button key={q.label} onClick={q.fn}
                  className="px-2.5 py-1 rounded-lg text-xs bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                >{q.label}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === t.id ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30' : 'text-gray-500 hover:text-white hover:bg-gray-800'
                }`}>
                <t.icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* ═══ OVERVIEW TAB ═══ */}
              {activeTab === 'overview' && (
                <>
                  {/* Summary Cards Row 1 — Puantaj */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Toplam Çalışma', value: minutesToHM(summary.totalWorkedMin), icon: Clock, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                      { label: 'Çalışma Günü', value: `${summary.workDays} gün`, icon: CheckCircle, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                      { label: 'Fazla Mesai', value: minutesToHM(summary.totalOvertimeMin), icon: Timer, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                      { label: 'Ort. Günlük', value: minutesToHM(summary.avgDailyMin), icon: BarChart2, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                    ].map(m => (
                      <div key={m.label} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg ${m.bg} flex items-center justify-center`}>
                            <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                          </div>
                          <span className="text-xs text-gray-500">{m.label}</span>
                        </div>
                        <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Summary Cards Row 2 — Alerts */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Geç Kalma', value: `${summary.lateDays} gün`, sub: summary.totalLateMin > 0 ? minutesToHM(summary.totalLateMin) : '', icon: AlertTriangle, color: summary.lateDays > 0 ? 'text-red-400' : 'text-gray-500', bg: summary.lateDays > 0 ? 'bg-red-500/10' : 'bg-gray-500/10' },
                      { label: 'Erken Çıkma', value: summary.totalEarlyMin > 0 ? minutesToHM(summary.totalEarlyMin) : '0', sub: '', icon: Minus, color: summary.totalEarlyMin > 0 ? 'text-amber-400' : 'text-gray-500', bg: summary.totalEarlyMin > 0 ? 'bg-amber-500/10' : 'bg-gray-500/10' },
                      { label: 'Devamsızlık', value: `${summary.absentDays} gün`, sub: '', icon: XCircle, color: summary.absentDays > 0 ? 'text-red-400' : 'text-gray-500', bg: summary.absentDays > 0 ? 'bg-red-500/10' : 'bg-gray-500/10' },
                      { label: 'İzinli Gün', value: `${summary.leaveDays} gün`, sub: '', icon: Umbrella, color: summary.leaveDays > 0 ? 'text-blue-400' : 'text-gray-500', bg: summary.leaveDays > 0 ? 'bg-blue-500/10' : 'bg-gray-500/10' },
                    ].map(m => (
                      <div key={m.label} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg ${m.bg} flex items-center justify-center`}>
                            <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                          </div>
                          <span className="text-xs text-gray-500">{m.label}</span>
                        </div>
                        <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                        {m.sub && <p className="text-[10px] text-gray-600">{m.sub}</p>}
                      </div>
                    ))}
                  </div>

                  {/* Weekly Target Progress */}
                  {!isYasamDestek && <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-orange-400" /> Haftalık Hedef Karşılaştırma
                      </h4>
                      <span className="text-xs text-gray-500">Hedef: {summary.weeklyTarget}s/hafta</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              summary.targetPct >= 95 ? 'bg-emerald-500' : summary.targetPct >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(100, summary.targetPct)}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-1 text-[10px] text-gray-600">
                          <span>Çalışılan: {minutesToHM(summary.totalWorkedMin)}</span>
                          <span>Hedef: {minutesToHM(Math.round(summary.expectedTotalMin))}</span>
                        </div>
                      </div>
                      <div className={`text-2xl font-bold ${
                        summary.targetPct >= 95 ? 'text-emerald-400' : summary.targetPct >= 70 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        %{summary.targetPct}
                      </div>
                    </div>
                  </div>}

                  {/* Sales Summary */}
                  {!isYasamDestek && <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Toplam Ciro', value: `₺${fmtNum(summary.totalRevenue)}`, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                      { label: 'Kişi Sayısı', value: fmtNum(summary.totalPersons), icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                      { label: 'Çapraz Satış', value: String(summary.crossCount), icon: ArrowLeftRight, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                    ].map(m => (
                      <div key={m.label} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg ${m.bg} flex items-center justify-center`}>
                            <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                          </div>
                          <span className="text-xs text-gray-500">{m.label}</span>
                        </div>
                        <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                      </div>
                    ))}
                  </div>}
                </>
              )}

              {/* ═══ PUANTAJ TAB ═══ */}
              {activeTab === 'puantaj' && (
                <>
                  {!schedule ? (
                    <div className="text-center py-10 text-gray-600">
                      <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Bu personel için vardiya planı tanımlanmamış.</p>
                      <p className="text-xs text-gray-700 mt-1">Vardiya planı tanımlayarak geç gelme, erken çıkma ve devamsızlık takibi yapabilirsiniz.</p>
                    </div>
                  ) : (
                    <>
                      {/* Mini summary bar */}
                      <div className="flex items-center gap-3 flex-wrap text-xs">
                        <span className="text-gray-500">{puantajRows.length} gün</span>
                        <span className="text-emerald-400">✓ {summary.workDays} çalışma</span>
                        {summary.lateDays > 0 && <span className="text-red-400">⚠ {summary.lateDays} geç</span>}
                        {summary.absentDays > 0 && <span className="text-red-400">✗ {summary.absentDays} devamsız</span>}
                        {summary.leaveDays > 0 && <span className="text-blue-400">☂ {summary.leaveDays} izin</span>}
                        {summary.totalOvertimeMin > 0 && <span className="text-orange-400">⏱ {minutesToHM(summary.totalOvertimeMin)} mesai</span>}
                      </div>

                      {/* Puantaj table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[800px]">
                          <thead>
                            <tr className="border-b border-gray-800">
                              <th className="text-left px-3 py-2 text-gray-500 font-medium">Tarih</th>
                              <th className="text-center px-3 py-2 text-gray-500 font-medium">Vardiya</th>
                              <th className="text-center px-3 py-2 text-gray-500 font-medium">Giriş</th>
                              <th className="text-center px-3 py-2 text-gray-500 font-medium">Çıkış</th>
                              <th className="text-center px-3 py-2 text-gray-500 font-medium">Çalışma</th>
                              <th className="text-center px-3 py-2 text-gray-500 font-medium">Geç</th>
                              <th className="text-center px-3 py-2 text-gray-500 font-medium">Erken Çıkış</th>
                              <th className="text-center px-3 py-2 text-gray-500 font-medium">Fazla Mesai</th>
                              <th className="text-center px-3 py-2 text-gray-500 font-medium">Durum</th>
                            </tr>
                          </thead>
                          <tbody>
                            {puantajRows.map(r => {
                              const dateObj = new Date(r.date + 'T00:00:00');
                              const statusCfg = {
                                normal:    { label: 'Tamam',     cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
                                late:      { label: 'Geç',       cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
                                absent:    { label: 'Devamsız',  cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
                                leave:     { label: r.leaveRecord ? LEAVE_LABELS[r.leaveRecord.leave_type as LeaveType] || 'İzin' : 'İzin', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
                                off:       { label: 'Tatil',     cls: 'bg-gray-500/15 text-gray-500 border-gray-500/30' },
                                no_record: { label: '—',         cls: 'bg-gray-500/15 text-gray-600 border-gray-500/30' },
                              };
                              const st = statusCfg[r.status];
                              return (
                                <tr key={r.date} className={`border-b border-gray-800/50 ${r.status === 'absent' ? 'bg-red-500/5' : r.status === 'late' ? 'bg-yellow-500/5' : ''}`}>
                                  <td className="px-3 py-2">
                                    <span className="text-white font-medium">{dateObj.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}</span>
                                    <span className="text-gray-600 ml-1.5">{DAY_TR[r.dayKey]}</span>
                                  </td>
                                  <td className="px-3 py-2 text-center text-gray-400 font-mono">
                                    {r.scheduledStart ? `${r.scheduledStart}-${r.scheduledEnd}` : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-center font-mono text-emerald-400">{r.actualStart || '—'}</td>
                                  <td className="px-3 py-2 text-center font-mono text-blue-400">{r.actualEnd || '—'}</td>
                                  <td className="px-3 py-2 text-center font-semibold text-white">{r.workedMin > 0 ? minutesToHM(r.workedMin) : '—'}</td>
                                  <td className="px-3 py-2 text-center">
                                    {r.lateMin > 0 ? <span className="text-red-400 font-semibold">{r.lateMin}dk</span> : <span className="text-gray-700">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {r.earlyMin > 0 ? <span className="text-amber-400 font-semibold">{r.earlyMin}dk</span> : <span className="text-gray-700">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {r.overtimeMin > 0 ? <span className="text-orange-400 font-semibold">{minutesToHM(r.overtimeMin)}</span> : <span className="text-gray-700">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-semibold border ${st.cls}`}>{st.label}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-gray-700 font-semibold">
                              <td className="px-3 py-2 text-white" colSpan={4}>TOPLAM</td>
                              <td className="px-3 py-2 text-center text-emerald-400">{minutesToHM(summary.totalWorkedMin)}</td>
                              <td className="px-3 py-2 text-center text-red-400">{summary.totalLateMin > 0 ? minutesToHM(summary.totalLateMin) : '—'}</td>
                              <td className="px-3 py-2 text-center text-amber-400">{summary.totalEarlyMin > 0 ? minutesToHM(summary.totalEarlyMin) : '—'}</td>
                              <td className="px-3 py-2 text-center text-orange-400">{summary.totalOvertimeMin > 0 ? minutesToHM(summary.totalOvertimeMin) : '—'}</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ═══ SALES TAB ═══ */}
              {activeTab === 'sales' && (
                <>
                  {/* Categories + Top Packages */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <Package className="w-4 h-4 text-orange-400" /> Kategori Dağılımı
                      </h4>
                      {salesStats.categories.length === 0 ? (
                        <p className="text-xs text-gray-600 text-center py-4">Bu dönemde veri yok</p>
                      ) : (
                        <div className="space-y-2.5">
                          {salesStats.categories.map(([cat, data]) => {
                            const pct = summary.totalRevenue > 0 ? (data.revenue / summary.totalRevenue) * 100 : 0;
                            const cc = CAT_COLORS[cat] || { bar: 'bg-gray-500', text: 'text-gray-400' };
                            return (
                              <div key={cat}>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className={cc.text}>{cat}</span>
                                  <span className="text-gray-400">{fmtNum(data.count)} kişi · ₺{fmtNum(data.revenue)}</span>
                                </div>
                                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                  <div className={`h-full ${cc.bar} rounded-full`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-400" /> En Çok Satılan Paketler
                      </h4>
                      {salesStats.topPackages.length === 0 ? (
                        <p className="text-xs text-gray-600 text-center py-4">Bu dönemde veri yok</p>
                      ) : (
                        <div className="space-y-2">
                          {salesStats.topPackages.map(([pkgName, data], i) => (
                            <div key={pkgName} className="flex items-center gap-3 text-xs">
                              <span className="text-gray-600 w-5 text-right font-mono">{i + 1}.</span>
                              <span className="text-white font-medium flex-1 truncate">{pkgName}</span>
                              <span className="text-gray-500">{data.count} kişi</span>
                              <span className="text-orange-400 font-semibold">₺{fmtNum(data.revenue)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Daily trend */}
                  {salesStats.dailyEntries.length > 1 && (
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-400" /> Günlük Ciro Trendi
                      </h4>
                      <div className="flex items-end gap-1 h-24">
                        {salesStats.dailyEntries.map(([date, rev]) => (
                          <div key={date} className="flex-1 flex flex-col items-center gap-1" title={`${new Date(date + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}: ₺${fmtNum(rev)}`}>
                            <div className="w-full bg-orange-500 rounded-t min-h-[2px]" style={{ height: `${(rev / salesStats.maxDaily) * 100}%` }} />
                            {salesStats.dailyEntries.length <= 14 && (
                              <span className="text-[9px] text-gray-600 -rotate-45 origin-top-left whitespace-nowrap">{new Date(date + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ═══ LEAVES TAB ═══ */}
              {activeTab === 'leaves' && (
                <>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Umbrella className="w-4 h-4 text-blue-400" /> İzin Kayıtları
                    </h4>
                    <button onClick={() => setLeaveForm(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors">
                      <PlusCircle className="w-3.5 h-3.5" /> İzin Ekle
                    </button>
                  </div>

                  {/* Leave Form */}
                  {leaveForm && (
                    <div className="bg-gray-800/50 border border-blue-500/30 rounded-xl p-4 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <label className="block">
                          <span className="text-xs text-gray-400">Başlangıç</span>
                          <input type="date" value={lf.start} onChange={e => setLf(f => ({ ...f, start: e.target.value }))}
                            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-400">Bitiş</span>
                          <input type="date" value={lf.end} onChange={e => setLf(f => ({ ...f, end: e.target.value }))}
                            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-400">Tür</span>
                          <select value={lf.type} onChange={e => setLf(f => ({ ...f, type: e.target.value as LeaveType }))}
                            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
                            {(Object.keys(LEAVE_LABELS) as LeaveType[]).map(lt => (
                              <option key={lt} value={lt}>{LEAVE_LABELS[lt]}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-400">Not</span>
                          <input value={lf.note} onChange={e => setLf(f => ({ ...f, note: e.target.value }))} placeholder="Opsiyonel"
                            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
                        </label>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setLeaveForm(false)} className="px-3 py-1.5 rounded-lg text-xs bg-gray-700 text-gray-300 hover:bg-gray-600">İptal</button>
                        <button onClick={handleAddLeave} disabled={leaveSaving}
                          className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50">
                          {leaveSaving ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Leave list */}
                  {leaves.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-gray-600">
                      <Umbrella className="w-8 h-8 mb-2 opacity-30" />
                      <p className="text-sm">Bu dönemde izin kaydı yok</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {leaves.map(l => {
                        const lc = LEAVE_COLORS[l.leave_type as LeaveType] || LEAVE_COLORS.ucretsiz;
                        const days = countLeaveDays([l], l.start_date, l.end_date);
                        return (
                          <div key={l.id} className={`flex items-center gap-3 text-xs ${lc.bg} border ${lc.border} rounded-xl px-4 py-3`}>
                            <Umbrella className={`w-4 h-4 ${lc.text} flex-shrink-0`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-semibold ${lc.text}`}>
                                  {LEAVE_LABELS[l.leave_type as LeaveType] || l.leave_type}
                                </span>
                                <span className="text-gray-500">
                                  {new Date(l.start_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                  {l.start_date !== l.end_date && ` → ${new Date(l.end_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`}
                                </span>
                                <span className="text-gray-600">{days} gün</span>
                              </div>
                              {l.note && <p className="text-gray-500 mt-0.5">{l.note}</p>}
                            </div>
                            <button onClick={() => handleDeleteLeave(l.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Leave summary */}
                  {leaves.length > 0 && (
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
                      <h4 className="text-xs font-semibold text-gray-400 mb-2">İzin Özeti</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {(Object.keys(LEAVE_LABELS) as LeaveType[]).map(lt => {
                          const count = leaves.filter(l => l.leave_type === lt).reduce((a, l) => a + countLeaveDays([l], l.start_date, l.end_date), 0);
                          if (count === 0) return null;
                          const lc = LEAVE_COLORS[lt];
                          return (
                            <div key={lt} className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${lc.bg.replace('/15', '')}`} />
                              <span className="text-xs text-gray-400">{LEAVE_LABELS[lt]}</span>
                              <span className={`text-xs font-semibold ${lc.text} ml-auto`}>{count} gün</span>
                            </div>
                          );
                        }).filter(Boolean)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function PersonnelTab() {
  const [allPersonnel, setAllPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKasa, setSelectedKasa] = useState<KasaId | null>(null);
  const [shiftTarget, setShiftTarget] = useState<Personnel | null>(null);
  const [kasaShiftMap, setKasaShiftMap] = useState<Record<string, WeekSchedule>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Personnel | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState('');
  const [savingForm, setSavingForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Personnel | null>(null);
  const [detailTarget, setDetailTarget] = useState<Personnel | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [data, todayAtt] = await Promise.all([
      getAllPersonnelFromFirebase(),
      getTodayAttendance(),
    ]);
    setAllPersonnel(data.filter(p => p.role !== 'genel_mudur' && p.kasaId !== 'genel'));
    setTodayAttendance(todayAtt);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Kasa değişince vardiya verilerini yükle
  useEffect(() => {
    if (!selectedKasa) return;
    getKasaShifts(selectedKasa).then(shifts => {
      const map: Record<string, WeekSchedule> = {};
      shifts.forEach(({ personnelId, weekSchedule }) => { map[personnelId] = weekSchedule; });
      setKasaShiftMap(map);
    });
  }, [selectedKasa]);

  function calcWeeklyHours(schedule: WeekSchedule): number {
    const DAYS: WeekDays[] = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    return DAYS.reduce((acc, d) => {
      if (schedule[d].isOff) return acc;
      const [sh, sm] = schedule[d].startTime.split(':').map(Number);
      const [eh, em] = schedule[d].endTime.split(':').map(Number);
      const diff = (eh * 60 + em) - (sh * 60 + sm);
      return acc + Math.max(0, Math.round(diff / 6) / 10);
    }, 0);
  }

  // ── Kasa sayfasındaki personel listesi ──────────────────────────────────
  const kasaPersonnel = selectedKasa
    ? allPersonnel
        .filter(p => p.kasaId === selectedKasa)
        .filter(p => p.fullName.toLowerCase().includes(search.toLowerCase()))
    : [];

  // ── Form helpers ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setFormError('');
    setShowPassword(false);
    setFormOpen(true);
  };
  const openEdit = (p: Personnel) => {
    setEditTarget(p);
    setForm({
      fullName: p.fullName,
      username: p.username,
      password: p.password,
      phone: p.phone || '',
      weeklyTargetHours: p.weeklyTargetHours ?? 45,
      isActive: p.isActive,
      profileImage: p.profileImage || '',
    });
    setFormError('');
    setShowPassword(false);
    setFormOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      setFormError('Profil resmi 500KB\'dan küçük olmalıdır.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm(f => ({ ...f, profileImage: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!selectedKasa) return;
    if (!form.fullName.trim() || !form.username.trim() || !form.password.trim()) {
      setFormError('Ad soyad, kullanıcı adı ve şifre zorunludur.');
      return;
    }
    setSavingForm(true);
    let success = false;
    let errorMsg = '';
    if (editTarget) {
      success = await updatePersonnelInFirebase(editTarget.id, {
        fullName: form.fullName,
        username: form.username,
        password: form.password,
        phone: form.phone,
        profileImage: form.profileImage,
        weeklyTargetHours: form.weeklyTargetHours,
        isActive: form.isActive,
        updatedAt: new Date().toISOString(),
      });
    } else {
      const newP: Personnel = {
        id: `${selectedKasa}_${Date.now()}`,
        kasaId: selectedKasa,
        role: 'personel',
        createdAt: new Date().toISOString(),
        fullName: form.fullName,
        username: form.username,
        password: form.password,
        phone: form.phone,
        profileImage: form.profileImage,
        weeklyTargetHours: form.weeklyTargetHours,
        isActive: form.isActive,
      };
      success = await addPersonnelToFirebase(newP);
    }
    setSavingForm(false);
    if (!success) {
      setFormError('Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.');
      return;
    }
    setFormOpen(false);
    await load();
  };

  const handleDelete = (p: Personnel) => setDeleteTarget(p);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deletePersonnelFromFirebase(deleteTarget.id);
    setDeleteTarget(null);
    await load();
  };

  // ── Shift view ──────────────────────────────────────────────────────────
  if (shiftTarget) {
    return <ShiftBoardModal personnel={shiftTarget} onClose={() => setShiftTarget(null)} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mr-3" />
        Yükleniyor...
      </div>
    );
  }

  // ── Kasa seçim ekranı ───────────────────────────────────────────────────
  if (!selectedKasa) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Personel Yönetimi</h2>
            <p className="text-xs text-gray-500 mt-0.5">Puantaj takibi ve personel yönetimi</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {KASAS.map(k => {
            const count = allPersonnel.filter(p => p.kasaId === k.id).length;
            const activeToday = todayAttendance.filter(a => a.kasa_id === k.id && (a.status === 'checked_in' || a.status === 'checkout_pending')).length;
            const checkedOut = todayAttendance.filter(a => a.kasa_id === k.id && a.status === 'checked_out').length;
            return (
              <button
                key={k.id}
                onClick={() => setSelectedKasa(k.id)}
                className={`bg-gray-900 border border-gray-800 rounded-xl p-5 text-left hover:scale-[1.02] active:scale-[0.99] transition-all shadow-boltify-card hover:border-gray-700 group`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-xl ${k.bg} border ${k.borderAccent} flex items-center justify-center flex-shrink-0`}><k.Icon className={`w-6 h-6 ${k.text}`} /></div>
                  <p className={`text-lg font-bold ${k.text}`}>{k.name}</p>
                </div>
                <p className="text-sm text-gray-400">{count} personel</p>
                {activeToday > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-green-400 mt-1">
                    <CheckCircle className="w-3 h-3" /> {activeToday} aktif çalışan
                  </div>
                )}
                {checkedOut > 0 && (
                  <p className="text-xs text-blue-400 mt-0.5">{checkedOut} çıkış yaptı</p>
                )}
              </button>
            );
          })}
        </div>

        {/* Duyurular */}
        <div className="mt-6">
          <AnnouncementsAdminTab />
        </div>
      </div>
    );
  }

  const kasa = KASAS.find(k => k.id === selectedKasa)!;

  // ── Personel listesi ─────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => { setSelectedKasa(null); setSearch(''); }}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${kasa.bg} border ${kasa.borderAccent} rounded-xl flex items-center justify-center`}>
              <kasa.Icon className={`w-5 h-5 ${kasa.text}`} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">{kasa.name} — Personel</h2>
              <p className="text-xs text-gray-500 mt-0.5">{kasaPersonnel.length} kişi · Puantaj detayı için personele çift tıklayın</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="İsim ara..."
                className="bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 w-36 sm:w-44 focus:outline-none focus:border-orange-500"
              />
            </div>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold px-3 sm:px-4 py-2 rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Yeni Personel</span><span className="sm:hidden">Ekle</span>
            </button>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="sm:hidden space-y-2">
          {kasaPersonnel.length === 0 && (
            <div className="text-center py-14 text-gray-600 text-sm bg-gray-900 border border-gray-800 rounded-xl">
              {search ? 'Arama sonucu bulunamadı' : 'Bu kasaya ait personel yok'}
            </div>
          )}
          {kasaPersonnel.map(p => {
            const att = todayAttendance.find(a => a.personnel_id === p.id);
            const cin = att?.check_in ? new Date(att.check_in).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'}) : null;
            const cout = att?.check_out ? new Date(att.check_out).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'}) : null;
            return (
              <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2" onClick={() => setDetailTarget(p)}>
                <div className="flex items-center gap-3">
                  {p.profileImage ? (
                    <img src={p.profileImage} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${avatarColor(p.fullName)}`}>
                      {initials(p.fullName)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{p.fullName}</p>
                    <p className="text-xs text-gray-500 font-mono truncate">{p.username}</p>
                  </div>
                  {att ? (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                      att.status === 'checked_in' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                      att.status === 'checked_out' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' :
                      att.status === 'checkout_pending' ? 'bg-red-500/15 text-red-400 border border-red-500/30' :
                      'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    }`}>
                      {att.status === 'checked_in' ? (<><CheckCircle className="w-2.5 h-2.5" /> Aktif</>) : att.status === 'checked_out' ? 'Çıkış' : att.status === 'checkout_pending' ? (<><Clock className="w-2.5 h-2.5" /> Bekl.</>) : 'Bekliyor'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-gray-500/15 text-gray-500 border border-gray-500/30 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0">
                      Giriş yok
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3 text-gray-400">
                    {cin && <span className="text-emerald-400">Giriş: {cin}</span>}
                    {cout && <span className="text-blue-400">Çıkış: {cout}</span>}
                    {!cin && <span className="text-gray-600">Bugün puantaj kaydı yok</span>}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button onClick={(e) => { e.stopPropagation(); setShiftTarget(p); }} className="p-1.5 rounded-lg hover:bg-blue-500/15 text-gray-400 hover:text-blue-400"><Clock className="w-3.5 h-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); openEdit(p); }} className="p-1.5 rounded-lg hover:bg-yellow-500/15 text-gray-400 hover:text-yellow-400"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(p); }} className="p-1.5 rounded-lg hover:bg-red-500/15 text-gray-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table */}
        <div className="hidden sm:block bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto shadow-boltify-card">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Profil</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Ad Soyad</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Telefon</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Kullanıcı Adı</th>
                <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium">Bugünkü Puantaj</th>
                <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium">Durum</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {kasaPersonnel.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-14 text-gray-600 text-sm">
                    {search ? 'Arama sonucu bulunamadı' : 'Bu kasaya ait personel yok'}
                  </td>
                </tr>
              )}
              {kasaPersonnel.map(p => (
                <tr key={p.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors cursor-pointer" onDoubleClick={() => setDetailTarget(p)}>
                  <td className="px-4 py-2.5">
                    {p.profileImage ? (
                      <img src={p.profileImage} alt="" className="w-9 h-9 rounded-lg object-cover" />
                    ) : (
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${avatarColor(p.fullName)}`}>
                        {initials(p.fullName)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5"><span className="text-white font-medium">{p.fullName}</span></td>
                  <td className="px-4 py-2.5"><span className="text-gray-400 text-xs">{p.phone || '—'}</span></td>
                  <td className="px-4 py-2.5"><span className="text-gray-400 font-mono text-xs">{p.username}</span></td>
                  <td className="px-4 py-2.5 text-center">
                    {(() => {
                      const att = todayAttendance.find(a => a.personnel_id === p.id);
                      if (!att) return <span className="text-xs text-gray-600">Giriş yok</span>;
                      const cin = att.check_in ? new Date(att.check_in).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'}) : '-';
                      const cout = att.check_out ? new Date(att.check_out).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'}) : '-';
                      const statusColor = att.status === 'checked_in' ? 'text-emerald-400' : att.status === 'checked_out' ? 'text-blue-400' : att.status === 'checkout_pending' ? 'text-red-400' : 'text-amber-400';
                      return (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-xs font-medium ${statusColor}`}>
                            {cin} → {cout}
                          </span>
                          <span className={`text-[10px] ${statusColor}`}>
                            {att.status === 'checked_in' ? (<><CheckCircle className="w-2.5 h-2.5" /> Aktif</>) : att.status === 'checked_out' ? 'Çıkış yaptı' : att.status === 'checkout_pending' ? (<><Clock className="w-2.5 h-2.5" /> Çıkış bekl.</>) : 'Bekliyor'}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {p.isActive !== false ? (
                      <span className="inline-flex items-center gap-1 bg-green-500/15 text-green-400 border border-green-500/30 text-xs font-semibold px-2 py-0.5 rounded-full">
                        <CheckCircle className="w-3 h-3" /> Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-semibold px-2 py-0.5 rounded-full">
                        <XCircle className="w-3 h-3" /> Pasif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button onClick={() => setDetailTarget(p)} title="Performans Detay"
                        className="p-1.5 rounded-lg hover:bg-orange-500/15 text-gray-400 hover:text-orange-400 transition-colors"><BarChart2 className="w-4 h-4" /></button>
                      <button onClick={() => setShiftTarget(p)} title="Vardiya Planı"
                        className="p-1.5 rounded-lg hover:bg-blue-500/15 text-gray-400 hover:text-blue-400 transition-colors"><Clock className="w-4 h-4" /></button>
                      <button onClick={() => openEdit(p)} title="Düzenle"
                        className="p-1.5 rounded-lg hover:bg-yellow-500/15 text-gray-400 hover:text-yellow-400 transition-colors"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(p)} title="Sil"
                        className="p-1.5 rounded-lg hover:bg-red-500/15 text-gray-400 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Personnel Detail Modal ──────────────────────────────────────── */}
      {detailTarget && (
        <PersonnelDetailModal person={detailTarget} onClose={() => setDetailTarget(null)} />
      )}

      {/* ── Add/Edit Modal ──────────────────────────────────────────────── */}
      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-boltify-lg w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h3 className="text-lg font-bold text-white">
                {editTarget ? 'Personeli Düzenle' : 'Yeni Personel Ekle'}
              </h3>
              <button onClick={() => setFormOpen(false)} className="p-1.5 rounded-xl hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              {/* Profile image upload */}
              <div className="flex items-center gap-4">
                <div className="relative group">
                  {form.profileImage ? (
                    <img src={form.profileImage} alt="" className="w-16 h-16 rounded-xl object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-gray-800 border border-gray-700">
                      <User className="w-7 h-7 text-gray-600" />
                    </div>
                  )}
                  <button onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
                  ><Camera className="w-5 h-5 text-white" /></button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-300">Profil Fotoğrafı</p>
                  <p className="text-xs text-gray-600 mt-0.5">PNG, JPG — max 500KB</p>
                  {form.profileImage && (
                    <button onClick={() => setForm(f => ({ ...f, profileImage: '' }))}
                      className="text-xs text-red-400 hover:text-red-300 mt-1">Kaldır</button>
                  )}
                </div>
              </div>

              {/* Horizontal form fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <label className="block">
                  <span className="text-xs text-gray-400 flex items-center gap-1"><User className="w-3 h-3" /> Ad Soyad *</span>
                  <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                    className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-400 flex items-center gap-1"><Phone className="w-3 h-3" /> Telefon</span>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="05xx xxx xx xx"
                    className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-400 flex items-center gap-1"><User className="w-3 h-3" /> Kullanıcı Adı *</span>
                  <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-orange-500" />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Şifre *</span>
                  <div className="relative mt-1">
                    <input type={showPassword ? 'text' : 'password'} value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-9 text-white text-sm focus:outline-none focus:border-orange-500" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Haftalık Hedef Saat</span>
                  <input type="number" min={0} max={168} value={form.weeklyTargetHours}
                    onChange={e => setForm(f => ({ ...f, weeklyTargetHours: Number(e.target.value) }))}
                    className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </label>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.isActive}
                      onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                      className="w-4 h-4 accent-orange-500" />
                    <span className="text-sm text-gray-300">Aktif Personel</span>
                  </label>
                </div>
              </div>

              {formError && <p className="text-xs text-red-400">{formError}</p>}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setFormOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">İptal</button>
                <button onClick={handleSave} disabled={savingForm}
                  className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-medium text-sm transition-colors">
                  {savingForm ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Silme Onay Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-sm w-full mx-4 shadow-boltify-lg">
            <h3 className="text-lg font-bold text-white mb-2">Personeli Sil</h3>
            <p className="text-gray-300 text-sm mb-5">
              <strong className="text-red-400">"{deleteTarget.fullName}"</strong> adlı personeli silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-semibold transition-colors"
              >
                Evet, Sil
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
