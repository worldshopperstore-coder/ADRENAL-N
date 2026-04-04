import { useState, useEffect, useRef } from 'react';
import { Users, Clock, CalendarOff, RefreshCw, Megaphone, QrCode, CheckCircle2, X } from 'lucide-react';
import { getAllPersonnelFromFirebase, getKasaShifts, type WeekDays, type WeekSchedule } from '@/utils/personnelSupabaseDB';
import { getActiveAnnouncements, type Announcement } from '@/utils/announcementsDB';
import { getTodayAttendance, createAttendanceSession, generateSessionToken, type AttendanceRecord } from '@/utils/attendanceDB';
import { getUserSession } from '@/utils/session';
import type { Personnel } from '@/types/personnel';

const DAYS: WeekDays[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<WeekDays, string> = {
  monday: 'Pazartesi', tuesday: 'Salı', wednesday: 'Çarşamba',
  thursday: 'Perşembe', friday: 'Cuma', saturday: 'Cumartesi', sunday: 'Pazar',
};
const JS_TO_WEEK: Record<number, WeekDays> = {
  1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday',
  5: 'friday', 6: 'saturday', 0: 'sunday',
};

function calcHours(start: string, end: string): number {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return Math.max(0, Math.round(diff / 6) / 10);
}

function weeklyHours(schedule: WeekSchedule): number {
  return DAYS.reduce((acc, d) => acc + (schedule[d].isOff ? 0 : calcHours(schedule[d].startTime, schedule[d].endTime)), 0);
}

function avatarColor(name: string): string {
  const colors = ['bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-pink-600', 'bg-orange-600', 'bg-cyan-600', 'bg-rose-600', 'bg-amber-600'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const LEAVE_COLORS: Record<string, string> = {
  'Yıllık İzin':   'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'Hastalık İzni': 'text-red-400 bg-red-500/10 border-red-500/20',
  'Mazeret İzni':  'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  'İzin':          'text-gray-400 bg-gray-500/10 border-gray-500/20',
};

export default function TeamTab() {
  const session  = getUserSession();
  const me: Personnel | null = session?.personnel ?? null;
  const kasaId: string = session?.kasa?.id ?? '';
  const kasaName: string = session?.kasa?.name ?? '';

  const [allPersonnel, setAllPersonnel] = useState<Personnel[]>([]);
  const [shifts, setShifts] = useState<Record<string, WeekSchedule>>({});
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [qrTokens, setQrTokens] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('dismissedTeamAnnouncements') || '[]'); } catch { return []; }
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const todayKey = JS_TO_WEEK[new Date().getDay()];
  const todayLabel = DAY_LABELS[todayKey];

  const load = async () => {
    setLoading(true);
    const [personnel, kasaShifts, activeAnnouncements, todayAtt] = await Promise.all([
      getAllPersonnelFromFirebase(),
      getKasaShifts(kasaId),
      getActiveAnnouncements(),
      getTodayAttendance(),
    ]);
    const kasaPersonnel = personnel.filter(p => p.kasaId === kasaId && p.role !== 'genel_mudur' && p.isActive);
    setAllPersonnel(kasaPersonnel);
    const shiftMap: Record<string, WeekSchedule> = {};
    kasaShifts.forEach(({ personnelId, weekSchedule }) => { shiftMap[personnelId] = weekSchedule; });
    setShifts(shiftMap);
    setAnnouncements(activeAnnouncements);
    setTodayAttendance(todayAtt.filter(a => a.kasa_id === kasaId));
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => { if (kasaId) load(); }, [kasaId]);

  // Poll attendance every 5 seconds to catch QR scans
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      const todayAtt = await getTodayAttendance();
      setTodayAttendance(todayAtt.filter(a => a.kasa_id === kasaId));
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [kasaId]);

  // Auto-generate QR tokens for teammates who have shifts today but haven't checked in
  const generateQrForTeammate = async (p: Personnel) => {
    if (qrTokens[p.id]) return; // Already generated
    const token = generateSessionToken(p.id);
    const created = await createAttendanceSession(p.id, p.fullName, kasaId, token);
    if (created) {
      setQrTokens(prev => ({ ...prev, [p.id]: token }));
    }
  };

  // Vardiyası olan ama giriş yapmamış tüm ekip üyeleri için otomatik QR oluştur
  const autoGenRef = useRef(false);
  useEffect(() => {
    if (loading || autoGenRef.current) return;
    const today = todayKey;
    const allTeammates = allPersonnel.filter(p => p.id !== me?.id);
    const needQr = allTeammates.filter(p => {
      const pSchedule = shifts[p.id];
      const pToday = pSchedule?.[today];
      const hasShift = pToday && !pToday.isOff;
      const att = todayAttendance.find(a => a.personnel_id === p.id);
      const isCheckedIn = att && (att.status === 'checked_in' || att.status === 'checkout_pending');
      const isCheckedOut = att?.status === 'checked_out';
      if (att?.status === 'pending' && att.session_token) {
        setQrTokens(prev => prev[p.id] ? prev : ({ ...prev, [p.id]: att.session_token }));
        return false;
      }
      return hasShift && !isCheckedIn && !isCheckedOut && !qrTokens[p.id];
    });
    if (needQr.length > 0) {
      autoGenRef.current = true;
      Promise.all(needQr.map(p => generateQrForTeammate(p))).then(() => {
        autoGenRef.current = false;
      });
    }
  }, [loading, allPersonnel, shifts, todayAttendance]);

  const mySchedule = me ? shifts[me.id] : null;
  const myToday = mySchedule?.[todayKey];
  const myWeekHours = mySchedule ? weeklyHours(mySchedule) : null;

  const teammates = allPersonnel.filter(p => p.id !== me?.id);

  // Ortak vardiya tablosu renderer — modern grid
  const DAY_SHORT: Record<WeekDays, string> = {
    monday: 'Pzt', tuesday: 'Sal', wednesday: 'Çar',
    thursday: 'Per', friday: 'Cum', saturday: 'Cmt', sunday: 'Paz',
  };

  const renderShiftTable = (personId: string, schedule: WeekSchedule) => {
    const personAtt = todayAttendance.find(a => a.personnel_id === personId);
    return (
      <div className="px-4 py-3">
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map(d => {
            const day = schedule[d];
            const isToday = d === todayKey;
            return (
              <div
                key={d}
                className={`relative rounded-xl p-2 text-center transition-all ${
                  isToday
                    ? 'bg-orange-500/15 ring-1 ring-orange-500/40'
                    : day.isOff
                      ? 'bg-gray-800/60'
                      : 'bg-gray-800/30 hover:bg-gray-700/30'
                }`}
              >
                {/* Gün label */}
                <span className={`block text-[10px] font-bold tracking-wide mb-1.5 ${
                  isToday ? 'text-orange-400' : 'text-gray-500'
                }`}>
                  {DAY_SHORT[d]}
                </span>

                {day.isOff ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <CalendarOff className="w-3.5 h-3.5 text-red-400/50" />
                    <span className={`text-[9px] font-semibold mt-0.5 ${
                      LEAVE_COLORS[day.leaveType ?? 'İzin']?.split(' ')[0] ?? 'text-red-400'
                    }`}>
                      {day.leaveType ?? 'İzin'}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <span className={`font-mono text-xs font-bold leading-tight ${isToday ? 'text-emerald-400' : 'text-gray-300'}`}>
                      {day.startTime}
                    </span>
                    <span className="text-gray-600 text-[8px] leading-none my-0.5">▼</span>
                    <span className={`font-mono text-xs font-bold leading-tight ${isToday ? 'text-emerald-400' : 'text-gray-300'}`}>
                      {day.endTime}
                    </span>
                  </div>
                )}

                {/* Bugün yoklama dot */}
                {isToday && personAtt?.check_in && (
                  <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-gray-900" title={`Giriş ${new Date(personAtt.check_in).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}`} />
                )}
                {isToday && personAtt?.check_out && (
                  <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-orange-500 ring-2 ring-gray-900" title={`Çıkış ${new Date(personAtt.check_out).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Bugünkü giriş/çıkış bilgisi — satır olarak */}
        {personAtt?.check_in && (
          <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-gray-700/20">
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
              <CheckCircle2 className="w-2.5 h-2.5" />
              Giriş {new Date(personAtt.check_in).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}
            </span>
            {personAtt.check_out && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-semibold">
                <Clock className="w-2.5 h-2.5" />
                Çıkış {new Date(personAtt.check_out).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Yükleniyor...
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Ekibim</h2>
            <p className="text-xs text-gray-500">{kasaName} · {todayLabel}</p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Yenile
        </button>
      </div>

      {/* Duyurular */}
      {announcements.filter(a => !dismissedAnnouncements.includes(a.id)).length > 0 && (
        <div className="space-y-2">
          {announcements.filter(a => !dismissedAnnouncements.includes(a.id)).map(a => (
            <div key={a.id} className="flex items-start gap-3 bg-amber-900/20 border border-amber-700/30 rounded-xl px-4 py-3">
              <Megaphone className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-amber-100 leading-relaxed">{a.message}</p>
                <p className="text-xs text-amber-600 mt-1">{a.created_by} · {new Date(a.created_at).toLocaleString('tr-TR')}</p>
              </div>
              <button
                onClick={() => {
                  const updated = [...dismissedAnnouncements, a.id];
                  setDismissedAnnouncements(updated);
                  localStorage.setItem('dismissedTeamAnnouncements', JSON.stringify(updated));
                }}
                className="flex-shrink-0 p-1 rounded-lg hover:bg-amber-500/20 text-amber-600 hover:text-amber-400 transition-colors"
                title="Kapat"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Benim Haftalık Programım */}
      {me && mySchedule && (() => {
        const myOffDays = DAYS.filter(d => mySchedule[d].isOff);
        const myTarget = me.weeklyTargetHours ?? 45;
        const myPct = myWeekHours !== null ? Math.min(100, Math.round((myWeekHours / myTarget) * 100)) : null;
        return (
          <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/40 border border-gray-700/50 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 pb-3 border-b border-gray-700/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white ${avatarColor(me.fullName)}`}>
                    {initials(me.fullName)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{me.fullName}</p>
                    <p className="text-xs text-gray-500">Haftalık Mesai Programım</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Haftalık Detay Tablo */}
            {renderShiftTable(me.id, mySchedule)}

            {/* Footer — Özet */}
            <div className="px-4 py-2.5 bg-gray-800/30 border-t border-gray-700/30 flex items-center gap-4 text-xs">
              <span className="text-gray-500">
                <Clock className="w-3 h-3 inline mr-1 -mt-0.5" />
                {DAYS.filter(d => !mySchedule[d].isOff).length} iş günü
              </span>
              <span className="text-gray-500">
                <CalendarOff className="w-3 h-3 inline mr-1 -mt-0.5" />
                {myOffDays.length} izin
              </span>
            </div>
          </div>
        );
      })()}

      {/* Takım Arkadaşları */}
      <div>
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
          Takım Arkadaşları ({teammates.length})
        </h3>

        {teammates.length === 0 ? (
          <div className="text-center py-8 text-gray-600">Başka personel bulunamadı.</div>
        ) : (
          <div className="space-y-4">
            {teammates.map(p => {
              const pSchedule = shifts[p.id];
              const pToday = pSchedule?.[todayKey];
              const pWeekHours = pSchedule ? weeklyHours(pSchedule) : null;
              const pTarget = p.weeklyTargetHours ?? 45;
              const pPct = pWeekHours !== null ? Math.min(100, Math.round((pWeekHours / pTarget) * 100)) : null;
              const pOffDays = pSchedule ? DAYS.filter(d => pSchedule[d].isOff) : [];
              const att = todayAttendance.find(a => a.personnel_id === p.id);
              const isCheckedIn = att && (att.status === 'checked_in' || att.status === 'checkout_pending');
              const isCheckedOut = att?.status === 'checked_out';
              const hasShiftToday = pToday && !pToday.isOff;
              const needsQr = hasShiftToday && !isCheckedIn && !isCheckedOut;
              const qrToken = qrTokens[p.id] || (att?.status === 'pending' ? att.session_token : '');

              return (
                <div key={p.id} className={`bg-gradient-to-br from-gray-800/60 to-gray-900/40 border rounded-2xl overflow-hidden transition-colors ${
                  isCheckedIn ? 'border-emerald-500/30' : isCheckedOut ? 'border-orange-500/20' : 'border-gray-700/50'
                }`}>
                  {/* Header — Aynı format: avatar + isim + haftalık saat */}
                  <div className="p-4 pb-3 border-b border-gray-700/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white ${avatarColor(p.fullName)}`}>
                            {initials(p.fullName)}
                          </div>
                          {isCheckedIn && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-gray-900" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-white">{p.fullName}</p>
                            {isCheckedIn && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Aktif
                              </span>
                            )}
                            {isCheckedOut && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">
                                <Clock className="w-2.5 h-2.5" /> Çıkış Yaptı
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-gray-500">Haftalık Mesai Programı</p>
                            {att?.check_in && (
                              <span className="text-[10px] text-gray-500 font-mono">
                                · Giriş {new Date(att.check_in).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}
                                {att.check_out && ` → Çıkış ${new Date(att.check_out).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Haftalık Detay Tablo */}
                  {pSchedule ? renderShiftTable(p.id, pSchedule) : (
                    <div className="px-4 py-6 text-center text-sm text-gray-600">Mesai programı henüz tanımlanmamış.</div>
                  )}

                  {/* QR Code for check-in */}
                  {needsQr && (
                    <div className="mx-4 mb-3 p-3 bg-gradient-to-r from-orange-500/5 to-red-500/5 border border-orange-500/20 rounded-xl">
                      <div className="flex items-center gap-3">
                        {qrToken ? (
                          <>
                            <div className="flex-shrink-0 bg-white p-1.5 rounded-lg">
                              <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`https://yoklama.adrenalin.app/scan?token=${qrToken}`)}`}
                                alt="QR"
                                className="w-20 h-20"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1">
                                <QrCode className="w-3.5 h-3.5 text-orange-400" />
                                <span className="text-xs font-semibold text-orange-300">Giriş QR Kodu Hazır</span>
                              </div>
                              <p className="text-[10px] text-gray-500 leading-relaxed">
                                {p.fullName} bu QR'ı telefonundan okutarak puantaj girişi yapabilir.
                              </p>
                              <p className="text-[10px] text-orange-400/60 mt-1 font-mono">
                                Vardiya: {pToday?.startTime}–{pToday?.endTime}
                              </p>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-2 px-3 py-2 text-orange-300/50 text-xs font-semibold w-full justify-center">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            QR kod hazırlanıyor...
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Footer — Özet */}
                  {pSchedule && (
                    <div className="px-4 py-2.5 bg-gray-800/30 border-t border-gray-700/30 flex items-center gap-4 text-xs">
                      <span className="text-gray-500">
                        <Clock className="w-3 h-3 inline mr-1 -mt-0.5" />
                        {DAYS.filter(d => !pSchedule[d].isOff).length} iş günü
                      </span>
                      <span className="text-gray-500">
                        <CalendarOff className="w-3 h-3 inline mr-1 -mt-0.5" />
                        {pOffDays.length} izin
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-700 text-right">
        Son güncelleme: {lastRefresh.toLocaleTimeString('tr-TR')}
      </p>
    </div>
  );
}
