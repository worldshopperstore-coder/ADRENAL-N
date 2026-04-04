import { useState, useEffect } from 'react';
import { LogIn, Lock, User, Users } from 'lucide-react';
import { initializePersonnelDB } from '@/utils/personnelDB';
import { authenticateWithoutKasa } from '@/utils/personnelSupabaseDB';
import { AdrenalinLogo } from '@/components/AdrenalinLogo';
import type { Personnel } from '@/types/personnel';

export interface KasaInfo {
  id: 'wildpark' | 'sinema' | 'face2face' | 'genel';
  name: string;
  title: string;
  paxName: string;
  color: string;
  icon: React.ReactNode;
}

export const KASA_LIST: KasaInfo[] = [
  {
    id: 'genel',
    name: 'Genel Müdür',
    title: 'GENEL MÜDÜR YÖNETİM PANELİ',
    paxName: 'Genel Müdür',
    color: 'from-yellow-600 to-orange-700',
    icon: <Users className="w-8 h-8" />
  },
  {
    id: 'wildpark',
    name: 'WildPark',
    title: 'WİLDPARK GÜNLÜK MÜNFERİT ve ACENTE',
    paxName: 'Wildpark Pax',
    color: 'from-green-600 to-emerald-700',
    icon: <Users className="w-8 h-8" />
  },
  {
    id: 'sinema',
    name: 'XD Sinema',
    title: 'SİNEMA GÜNLÜK MÜNFERİT ve ACENTE',
    paxName: 'Sinema Pax',
    color: 'from-purple-600 to-violet-700',
    icon: <Users className="w-8 h-8" />
  },
  {
    id: 'face2face',
    name: 'Face 2 Face',
    title: 'FACE 2 FACE GÜNLÜK MÜNFERİT ve ACENTE',
    paxName: 'Face 2 Face Pax',
    color: 'from-sky-600 to-sky-700',
    icon: <Users className="w-8 h-8" />
  }
];

interface LoginPageProps {
  onLogin: (kasa: KasaInfo, personnel: Personnel) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => { initializePersonnelDB(); }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Lütfen kullanıcı adı ve şifrenizi girin');
      return;
    }
    setLoggingIn(true);
    setError('');

    const personnel = await authenticateWithoutKasa(username, password);

    setLoggingIn(false);
    if (personnel) {
      // Personelin kayıtlı kasasına göre KasaInfo bul
      const kasa = KASA_LIST.find(k => k.id === personnel.kasaId)
        || (personnel.role === 'genel_mudur' ? KASA_LIST.find(k => k.id === 'genel')! : KASA_LIST[1]);
      onLogin(kasa, personnel);
    } else {
      setError('Kullanıcı adı veya şifre hatalı!');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex">
      {/* ── Electron Drag Region ── */}
      <div className="electron-drag fixed top-0 left-0 right-0 h-8 z-50 select-none" />

      {/* ── SVG Wave Background ── */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#09090b] via-[#111827] to-[#0f172a]" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1440 900" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="wave1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#ef4444" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#dc2626" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="wave2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#f97316" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="wave3" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#dc2626" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        <path d="M0,450 C200,350 400,550 720,400 C1040,250 1200,500 1440,380 L1440,900 L0,900 Z" fill="url(#wave1)">
          <animate attributeName="d" dur="8s" repeatCount="indefinite" values="
            M0,450 C200,350 400,550 720,400 C1040,250 1200,500 1440,380 L1440,900 L0,900 Z;
            M0,420 C250,500 450,350 720,450 C990,550 1250,350 1440,420 L1440,900 L0,900 Z;
            M0,450 C200,350 400,550 720,400 C1040,250 1200,500 1440,380 L1440,900 L0,900 Z
          " />
        </path>
        <path d="M0,550 C300,450 500,650 720,500 C940,350 1100,600 1440,480 L1440,900 L0,900 Z" fill="url(#wave2)">
          <animate attributeName="d" dur="10s" repeatCount="indefinite" values="
            M0,550 C300,450 500,650 720,500 C940,350 1100,600 1440,480 L1440,900 L0,900 Z;
            M0,520 C350,600 550,400 720,550 C890,700 1150,420 1440,520 L1440,900 L0,900 Z;
            M0,550 C300,450 500,650 720,500 C940,350 1100,600 1440,480 L1440,900 L0,900 Z
          " />
        </path>
        <path d="M0,650 C400,550 600,750 720,620 C840,490 1000,700 1440,580 L1440,900 L0,900 Z" fill="url(#wave3)">
          <animate attributeName="d" dur="12s" repeatCount="indefinite" values="
            M0,650 C400,550 600,750 720,620 C840,490 1000,700 1440,580 L1440,900 L0,900 Z;
            M0,630 C350,720 550,530 720,660 C890,790 1050,560 1440,630 L1440,900 L0,900 Z;
            M0,650 C400,550 600,750 720,620 C840,490 1000,700 1440,580 L1440,900 L0,900 Z
          " />
        </path>
      </svg>

      {/* ── Left Panel: Login Form ── */}
      <div className="relative z-10 w-full sm:w-[420px] min-h-screen flex flex-col justify-center px-8 sm:px-12 bg-gradient-to-b from-[#09090b]/95 via-[#0c0a0f]/90 to-[#09090b]/95 backdrop-blur-xl border-r border-white/5">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <AdrenalinLogo size="xl" variant="wordmark" className="!text-5xl" />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm text-center mb-5 backdrop-blur-sm">
            {error}
          </div>
        )}

        {/* Username */}
        <div className="mb-4">
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Kullanıcı Adı"
              className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/50 focus:bg-white/8 transition-all text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Password */}
        <div className="mb-6">
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Şifre"
              className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/50 focus:bg-white/8 transition-all text-sm"
            />
          </div>
        </div>

        {/* Login Button */}
        <button
          onClick={handleLogin}
          disabled={!username.trim() || !password.trim() || loggingIn}
          className={`w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all text-sm ${
            username.trim() && password.trim() && !loggingIn
              ? 'bg-gradient-to-r from-orange-600 via-red-500 to-rose-500 hover:from-orange-500 hover:via-red-400 hover:to-rose-400 text-white shadow-lg shadow-orange-500/25'
              : 'bg-white/5 text-gray-600 cursor-not-allowed'
          }`}
        >
          <LogIn className="w-4 h-4" />
          {loggingIn ? 'Giriş yapılıyor...' : 'Giriş Yap'}
        </button>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-600 text-[10px]">
          © 2026 Adrenalin Dünyası
        </div>
      </div>

      {/* ── Right Panel: Welcome Text ── */}
      <div className="hidden sm:flex flex-1 relative z-10 items-center justify-center">
        <div className="text-center px-12">
          <h1 className="text-6xl lg:text-7xl font-black text-white leading-tight tracking-tight">
            Hoş<br/>Geldiniz.
          </h1>
          <p className="mt-4 text-lg text-orange-200/50 font-light">Günlük Satış & Rapor Sistemi</p>
        </div>
      </div>
    </div>
  );
}

