import { useState, useEffect } from 'react';
import { X, Calendar, Save, UserCheck, Clock, Zap } from 'lucide-react';
import type { Personnel } from '@/types/personnel';
import {
  getPersonnelShift,
  savePersonnelShift,
  type WeekSchedule,
  type WeekDays,
} from '@/utils/personnelSupabaseDB';

type Day = WeekDays;
type LeaveType = 'Y\u0131ll\u0131k \u0130zin' | 'Hastal\u0131k \u0130zni' | 'Mazeret \u0130zni' | '\u0130zin';

const DAY_LABELS: Record<Day, string> = {
  monday: 'Pazartesi',
  tuesday: 'Sal\u0131',
  wednesday: '\u00c7ar\u015famba',
  thursday: 'Per\u015fembe',
  friday: 'Cuma',
  saturday: 'Cumartesi',
  sunday: 'Pazar',
};

const DAYS: Day[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const PRESETS = [
  { label: 'Sabah',    start: '08:00', end: '17:00', color: 'text-orange-400 border-orange-500/30 hover:bg-orange-500/10' },
  { label: 'Standart', start: '09:00', end: '18:00', color: 'text-blue-400 border-blue-500/30 hover:bg-blue-500/10' },
  { label: '\u00d6\u011fle',     start: '12:00', end: '21:00', color: 'text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10' },
  { label: 'Ak\u015fam',    start: '14:00', end: '23:00', color: 'text-purple-400 border-purple-500/30 hover:bg-purple-500/10' },
];

const LEAVE_TYPES: LeaveType[] = ['Y\u0131ll\u0131k \u0130zin', 'Hastal\u0131k \u0130zni', 'Mazeret \u0130zni', '\u0130zin'];
const LEAVE_COLORS: Record<LeaveType, string> = {
  'Y\u0131ll\u0131k \u0130zin':   'text-blue-400',
  'Hastal\u0131k \u0130zni': 'text-red-400',
  'Mazeret \u0130zni':  'text-yellow-400',
  '\u0130zin':          'text-gray-400',
};

function defaultSchedule(): WeekSchedule {
  return {
    monday:    { startTime: '09:00', endTime: '18:00', isOff: false },
    tuesday:   { startTime: '09:00', endTime: '18:00', isOff: false },
    wednesday: { startTime: '09:00', endTime: '18:00', isOff: false },
    thursday:  { startTime: '09:00', endTime: '18:00', isOff: false },
    friday:    { startTime: '09:00', endTime: '18:00', isOff: false },
    saturday:  { startTime: '09:00', endTime: '18:00', isOff: true, leaveType: '\u0130zin' },
    sunday:    { startTime: '09:00', endTime: '18:00', isOff: true, leaveType: '\u0130zin' },
  };
}

function calcHours(start: string, end: string): number {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (sh > 23 || sm > 59 || eh > 23 || em > 59) return 0;
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return Math.max(0, Math.round(diff / 6) / 10);
}

interface Props {
  personnel: Personnel;
  onClose: () => void;
}

export default function ShiftBoardModal({ personnel, onClose }: Props) {
  const [schedule, setSchedule] = useState<WeekSchedule>(defaultSchedule());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getPersonnelShift(personnel.id).then(s => {
      if (s) setSchedule(s);
      setLoading(false);
    });
  }, [personnel.id]);

  const update = (day: Day, field: string, value: string | boolean) => {
    setSchedule(s => ({ ...s, [day]: { ...s[day], [field]: value } }));
    setSaveMsg(null);
  };

  const applyPreset = (start: string, end: string) => {
    setSchedule(s => {
      const next = { ...s };
      DAYS.forEach(d => {
        if (!s[d].isOff) next[d] = { ...s[d], startTime: start, endTime: end };
      });
      return next;
    });
    setSaveMsg(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    const session = localStorage.getItem('userSession');
    const adminId = session ? (JSON.parse(session).personnel?.id ?? 'admin') : 'admin';
    const result = await savePersonnelShift(personnel.id, personnel.kasaId, schedule, adminId);
    setSaving(false);
    if (result.error) {
      setSaveMsg({ ok: true, text: 'Kaydedildi (yerel). Supabase tablosu eksik olabilir.' });
    } else {
      setSaveMsg({ ok: true, text: '\u2713 Kaydedildi' });
    }
  };

  const weekTotal = DAYS.reduce(
    (acc, d) => acc + (schedule[d].isOff ? 0 : calcHours(schedule[d].startTime, schedule[d].endTime)),
    0
  );
  const target = personnel.weeklyTargetHours ?? 45;
  const pct = Math.min(100, Math.round((weekTotal / target) * 100));
  const barColor = pct >= 95 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
        <button onClick={onClose} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-base sm:text-xl font-bold text-white">{personnel.fullName} – Vardiya Planı</h2>
            <p className="text-xs text-gray-500">Haftalık çalışma takvimi</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {saveMsg && (
            <span className={`text-xs font-medium ${saveMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
              {saveMsg.text}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-3 sm:px-5 py-2 rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>

      {/* Vardiya Presetleri */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3 shadow-boltify-card">
        <div className="flex items-center gap-2 mb-2.5">
          <Zap className="w-3.5 h-3.5 text-yellow-400" />
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Hızlı Vardiya Ata – Çalışma günlerine uygular</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.start, p.end)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border bg-transparent transition-colors ${p.color}`}
            >
              <Clock className="w-3 h-3" />
              {p.label} · {p.start}–{p.end}
            </button>
          ))}
        </div>
      </div>

      {/* Haftal\u0131k Saat Progress */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3 shadow-boltify-card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">Haftalık Planlanan Saat</span>
          <span className={`text-sm font-bold ${pct >= 95 ? 'text-green-400' : pct >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
            {weekTotal}s / {target}s hedef
          </span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-gray-600 mt-1">%{pct} doldu</p>
      </div>

      {/* Tablo */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-500">Yükleniyor...</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto shadow-boltify-card">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-800 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-gray-400" />
            <span className="text-xs sm:text-sm text-gray-400">
              Gün durumuna tıklayarak İzin / Çalışma arasında geçiş yapın
            </span>
          </div>

          <table className="w-full text-sm min-w-[540px]">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium w-32">Gün</th>
                <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium w-28">Durum</th>
                <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium">Giriş</th>
                <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium">Çıkış</th>
                <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium w-28">İzin Tipi</th>
                <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium w-20">Süre</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map(day => {
                const d = schedule[day];
                const hours = d.isOff ? 0 : calcHours(d.startTime, d.endTime);
                const lt = (d.leaveType ?? '\u0130zin') as LeaveType;
                return (
                  <tr
                    key={day}
                    className={`border-b border-gray-700/30 last:border-0 transition-colors ${
                      d.isOff ? 'bg-red-900/5' : 'hover:bg-gray-700/20'
                    }`}
                  >
                    <td className={`px-5 py-3.5 font-medium ${d.isOff ? 'text-gray-600' : 'text-white'}`}>
                      {DAY_LABELS[day]}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => update(day, 'isOff', !d.isOff)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          d.isOff
                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        }`}
                      >
                        {d.isOff ? '\u0130zin' : '\u00c7al\u0131\u015fma'}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <input
                        type="time"
                        value={d.startTime}
                        disabled={d.isOff}
                        onChange={e => update(day, 'startTime', e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-sm text-center disabled:opacity-30 disabled:cursor-not-allowed w-28 focus:outline-none focus:border-orange-500 [color-scheme:dark]"
                      />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <input
                        type="time"
                        value={d.endTime}
                        disabled={d.isOff}
                        onChange={e => update(day, 'endTime', e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-sm text-center disabled:opacity-30 disabled:cursor-not-allowed w-28 focus:outline-none focus:border-orange-500 [color-scheme:dark]"
                      />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {d.isOff ? (
                        <select
                          value={lt}
                          onChange={e => update(day, 'leaveType', e.target.value)}
                          className={`bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-orange-500 ${LEAVE_COLORS[lt]}`}
                        >
                          {LEAVE_TYPES.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      ) : (
                        <span className="text-gray-700 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {d.isOff ? (
                        <span className={`text-xs ${LEAVE_COLORS[lt]}`}>{lt}</span>
                      ) : (
                        <span className="text-gray-400 text-xs">{hours > 0 ? `${hours}s` : '\u2014'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-800 bg-gray-900/30">
                <td colSpan={5} className="px-5 py-3 text-xs text-gray-500 text-right font-medium">
                  Haftalık Toplam:
                </td>
                <td className="px-4 py-3 text-center text-sm font-bold text-white">{weekTotal}s</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
