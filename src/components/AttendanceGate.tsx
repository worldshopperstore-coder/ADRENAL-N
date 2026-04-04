import { useState, useEffect, useRef } from 'react';
import { QrCode, CheckCircle2, Clock, Smartphone, Wifi, LogOut, XCircle } from 'lucide-react';
import { generateSessionToken, createAttendanceSession, checkAttendanceStatus } from '@/utils/attendanceDB';

interface AttendanceGateProps {
  personnelId: string;
  personnelName: string;
  kasaId: string;
  onConfirmed: () => void;
  onLogout: () => void;
  isAdmin: boolean;
}

export default function AttendanceGate({ personnelId, personnelName, kasaId, onConfirmed, onLogout, isAdmin }: AttendanceGateProps) {
  const [sessionToken, setSessionToken] = useState('');
  const [status, setStatus] = useState<'generating' | 'waiting' | 'confirmed' | 'checked_out'>('generating');
  const [dots, setDots] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dotsRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Admin direkt geçer
  useEffect(() => {
    if (isAdmin) {
      onConfirmed();
      return;
    }
  }, [isAdmin, personnelId]);

  // Bugün zaten yoklama yapılmış mı kontrol et
  useEffect(() => {
    if (isAdmin) return;
    
    async function checkExisting() {
      const record = await checkAttendanceStatus(personnelId);

      // Çıkış yapmış → tekrar girişi engelle
      if (record && record.status === 'checked_out') {
        setStatus('checked_out');
        return;
      }

      // Aktif veya çıkış bekliyor → direkt geçir
      if (record && (record.status === 'checked_in' || record.status === 'checkout_pending')) {
        setStatus('confirmed');
        setTimeout(onConfirmed, 1500);
        return;
      }

      // Pending kayıt varsa mevcut token'ı kullan (TeamTab'dan oluşturulmuş olabilir)
      if (record && record.status === 'pending' && record.session_token) {
        setSessionToken(record.session_token);
        setStatus('waiting');
        return;
      }

      // Kayıt yok → yeni token oluştur
      const token = generateSessionToken(personnelId);
      setSessionToken(token);
      await createAttendanceSession(personnelId, personnelName, kasaId, token);
      setStatus('waiting');
    }
    checkExisting();
  }, [personnelId, personnelName, kasaId, isAdmin]);

  // Supabase'den yoklama onayını bekle (polling)
  useEffect(() => {
    if (status !== 'waiting') return;

    pollRef.current = setInterval(async () => {
      const record = await checkAttendanceStatus(personnelId);
      if (record && record.status === 'checked_in') {
        setStatus('confirmed');
        setTimeout(onConfirmed, 2500);
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, personnelId]);

  // Animated dots
  useEffect(() => {
    dotsRef.current = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    return () => { if (dotsRef.current) clearInterval(dotsRef.current); };
  }, []);

  if (isAdmin) return null;

  // QR kod SVG oluştur (basit matrix)
  const qrDataUrl = `https://yoklama.adrenalin.app/scan?token=${sessionToken}`;

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#09090b] via-[#111827] to-[#0f172a]" />
      <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 1440 900" preserveAspectRatio="none">
        <defs>
          <linearGradient id="gw1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#dc2626" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        <path d="M0,500 C300,400 600,600 900,450 C1200,300 1350,500 1440,420 L1440,900 L0,900 Z" fill="url(#gw1)">
          <animate attributeName="d" dur="8s" repeatCount="indefinite" values="
            M0,500 C300,400 600,600 900,450 C1200,300 1350,500 1440,420 L1440,900 L0,900 Z;
            M0,470 C350,550 550,380 900,500 C1250,620 1300,400 1440,470 L1440,900 L0,900 Z;
            M0,500 C300,400 600,600 900,450 C1200,300 1350,500 1440,420 L1440,900 L0,900 Z
          " />
        </path>
      </svg>

      <div className="relative z-10 text-center px-6 max-w-md w-full">
        {status === 'checked_out' ? (
          /* ── Çıkış Yapılmış — Tekrar Giriş Engellendi ── */
          <div className="animate-fade-in">
            <div className="w-24 h-24 mx-auto mb-6 bg-red-500/20 rounded-full flex items-center justify-center border-2 border-red-400/50">
              <XCircle className="w-12 h-12 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Bugün Çıkış Yapıldı</h1>
            <p className="text-lg text-red-300 font-medium">{personnelName}</p>
            <p className="text-sm text-gray-400 mt-3">Bugün için çıkış işleminiz tamamlanmıştır.<br />Tekrar giriş yapılamaz.</p>
            <button
              onClick={onLogout}
              className="mt-8 flex items-center justify-center gap-2 text-gray-400 hover:text-red-400 transition-colors text-sm mx-auto bg-white/5 border border-white/10 rounded-xl px-6 py-3"
            >
              <LogOut className="w-4 h-4" />
              Giriş Ekranına Dön
            </button>
          </div>
        ) : status === 'confirmed' ? (
          /* ── Onaylandı ── */
          <div className="animate-fade-in">
            <div className="w-24 h-24 mx-auto mb-6 bg-emerald-500/20 rounded-full flex items-center justify-center border-2 border-emerald-400/50 animate-pulse">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Hoş Geldiniz!</h1>
            <p className="text-lg text-emerald-300 font-medium">{personnelName}</p>
            <p className="text-sm text-gray-400 mt-2">İşe başarıyla giriş yaptınız</p>
            <div className="mt-4 flex items-center justify-center gap-2 text-emerald-400/60 text-xs">
              <Clock className="w-3.5 h-3.5" />
              {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ) : (
          /* ── QR Bekliyor ── */
          <>
            {/* Greeting */}
            <h1 className="text-2xl font-bold text-white mb-1">Merhaba, {personnelName.split(' ')[0]}!</h1>
            <p className="text-sm text-gray-400 mb-8">Yoklama için telefonunuzla QR kodu okutun</p>

            {/* QR Code Container */}
            <div className="bg-white rounded-2xl p-4 mx-auto w-64 h-64 flex items-center justify-center shadow-2xl shadow-orange-500/20 mb-6">
              {sessionToken ? (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrDataUrl)}&bgcolor=ffffff&color=111827`}
                  alt="Yoklama QR Kodu"
                  className="w-full h-full rounded-lg"
                />
              ) : (
                <div className="animate-pulse text-gray-300">
                  <QrCode className="w-20 h-20" />
                </div>
              )}
            </div>

            {/* Status */}
            <div className="flex items-center justify-center gap-2 text-orange-300/80 mb-4">
              <Wifi className="w-4 h-4 animate-pulse" />
              <span className="text-sm">Yoklama bekleniyor{dots}</span>
            </div>

            {/* Instructions */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 text-left space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-orange-300">1</span>
                </div>
                <p className="text-xs text-gray-400">Telefonunuzda <strong className="text-orange-300">Adrenalin Yoklama</strong> uygulamasını açın</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-orange-300">2</span>
                </div>
                <p className="text-xs text-gray-400">Kamerayı bu QR koda tutun</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-orange-300">3</span>
                </div>
                <p className="text-xs text-gray-400">Konum onayı ile giriş tamamlanır</p>
              </div>
            </div>

            {/* Phone icon */}
            <div className="mt-6 flex items-center justify-center gap-2 text-gray-600 text-[10px]">
              <Smartphone className="w-3.5 h-3.5" />
              İşyeri konumunda olmanız gerekmektedir
            </div>

            {/* Çıkış butonu */}
            <button
              onClick={onLogout}
              className="mt-6 flex items-center justify-center gap-2 text-gray-500 hover:text-red-400 transition-colors text-xs mx-auto"
            >
              <LogOut className="w-3.5 h-3.5" />
              Çıkış Yap
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        .animate-fade-in { animation: fade-in 0.5s ease-out; }
      `}</style>
    </div>
  );
}
