import { useState, useEffect, useRef, useCallback } from 'react';
import { LogOut, Package, Droplets, Share2, LayoutDashboard, Briefcase, User, Menu, X, Shield, BarChart3, Users, Wallet, TrendingUp, FileText, ChevronLeft, Settings, Bug, Minus, Copy, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { loadAdvancesFromSupabase } from '@/utils/kasaSettingsDB';
import { loadExchangeRates, loadExchangeRatesFromSupabase, saveExchangeRates } from '@/utils/dailyData';
import { getKasaTheme } from '@/utils/kasaTheme';
import { AdrenalinLogo } from '@/components/AdrenalinLogo';
import CheckoutPopup from '@/components/CheckoutPopup';
import { KasaInfo } from './LoginPage';
import type { Personnel } from '@/types/personnel';

interface UserSession {
  kasa: KasaInfo;
  personnel: Personnel;
}

interface LayoutProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
  session: UserSession;
  onLogout: () => void;
}

const REGULAR_TABS = [
  { id: 'dashboard', label: 'Panolar', icon: LayoutDashboard, hideForPersonel: false },
  { id: 'packages', label: 'Paketler', icon: Package, hideForPersonel: true },
  { id: 'aquarium', label: 'Rapor', icon: Droplets, hideForPersonel: false },
  { id: 'crosssales', label: 'Çapraz Satış', icon: Share2, hideForPersonel: false },
  { id: 'team', label: 'Ekibim', icon: Users, hideForPersonel: false },
];

const ADMIN_TABS = [
  { id: 'admin-overview',   label: 'Genel Bakış',       icon: BarChart3  },
  { id: 'admin-personnel',  label: 'Personel Yönetimi', icon: Users      },
  { id: 'admin-advances',   label: 'Kasa Avansları',   icon: Wallet     },
  { id: 'admin-packages',   label: 'Paketler',           icon: Package    },
  { id: 'admin-pax',        label: 'Pax Raporları',     icon: Droplets   },
  { id: 'admin-performance',label: 'Performans',         icon: TrendingUp },
  { id: 'admin-reports',    label: 'Raporlar',           icon: FileText   },
  { id: 'admin-crossaccounting', label: 'Çapraz Mutabakat', icon: Share2    },
  { id: 'admin-integration',     label: 'POS Entegrasyon',  icon: Settings  },
  { id: 'admin-debuglog',        label: 'Debug Log',        icon: Bug       },
];

export default function AppLayout({ activeTab, onTabChange, children, session, onLogout }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [hovered, setHovered] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kasa avansları & kurlar
  const [kasaAdvances, setKasaAdvances] = useState({ tlAdvance: 0, usdAdvance: 0, eurAdvance: 0 });
  const savedRates = loadExchangeRates();
  const [usdRate, setUsdRate] = useState(savedRates.usd);
  const [eurRate, setEurRate] = useState(savedRates.eur);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sidebarCollapsed = collapsed && !hovered;

  // Bridge durum popup
  const [bridgeStatus, setBridgeStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [showBridgePopup, setShowBridgePopup] = useState(false);

  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.window?.onBridgeStatus) return;
    electron.window.onBridgeStatus((data: { status: string }) => {
      const s = data.status as typeof bridgeStatus;
      setBridgeStatus(s);
      setShowBridgePopup(true);
      if (s === 'connected' || s === 'failed') {
        setTimeout(() => setShowBridgePopup(false), s === 'connected' ? 3000 : 6000);
      }
    });
  }, []);

  const handleMouseEnter = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHovered(true);
  };
  const handleMouseLeave = () => {
    hoverTimerRef.current = setTimeout(() => setHovered(false), 200);
  };

  const theme = getKasaTheme(session.kasa.id);

  // Scrollbar rengini kasa temasına göre güncelle
  useEffect(() => {
    document.documentElement.style.setProperty('--scrollbar-thumb', theme.scrollbar);
    document.documentElement.style.setProperty('--scrollbar-thumb-hover', theme.scrollbar.replace('0.5)', '0.7)'));
  }, [theme.scrollbar]);

  useEffect(() => {
    const kasaId = session?.kasa?.id || 'sinema';
    if (kasaId !== 'genel') {
      loadAdvancesFromSupabase(kasaId).then(setKasaAdvances);
      loadExchangeRatesFromSupabase().then((rates) => {
        setUsdRate(rates.usd);
        setEurRate(rates.eur);
      });
    }

    // Admin avans/kur güncellemelerini görmek için 30 saniyede bir yenile
    if (kasaId !== 'genel') {
      const pollInterval = setInterval(() => {
        loadAdvancesFromSupabase(kasaId).then(setKasaAdvances);
        loadExchangeRatesFromSupabase().then((rates) => {
          setUsdRate(rates.usd);
          setEurRate(rates.eur);
        });
      }, 30_000);
      return () => clearInterval(pollInterval);
    }
  }, [session?.kasa?.id]);

  const debouncedSaveRates = useCallback((usd: number, eur: number) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveExchangeRates(usd, eur);
    }, 500);
  }, []);

  const handleUsdRateChange = (value: number) => {
    const v = isNaN(value) ? 0 : value;
    setUsdRate(v);
    debouncedSaveRates(v, eurRate);
  };
  const handleEurRateChange = (value: number) => {
    const v = isNaN(value) ? 0 : value;
    setEurRate(v);
    debouncedSaveRates(usdRate, v);
  };

  const toggleCollapse = () => {
    setCollapsed(prev => !prev);
  };

  const isAdmin = session?.personnel?.role === 'genel_mudur';
  const tabs = isAdmin ? ADMIN_TABS : REGULAR_TABS.filter(t => !(t.hideForPersonel && session?.personnel?.role === 'personel'));

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Electron titlebar drag region — only over main content area */}
      <div className={`electron-drag fixed top-0 right-0 h-9 bg-gray-950/80 z-[60] select-none transition-all duration-300 ${sidebarCollapsed ? 'md:left-16' : 'md:left-64'} left-0 flex items-center justify-end`}>
        {/* Custom window controls */}
        <div className="flex items-center electron-no-drag">
          <button
            onClick={() => (window as any).electron?.window?.minimize()}
            className="w-11 h-9 flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-gray-800/80 transition-colors"
            title="Küçült"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => (window as any).electron?.window?.maximize()}
            className="w-11 h-9 flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-gray-800/80 transition-colors"
            title="Büyüt / Küçült"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => (window as any).electron?.window?.close()}
            className="w-11 h-9 flex items-center justify-center text-gray-500 hover:text-white hover:bg-red-600 transition-colors rounded-tr-none"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bridge status popup */}
      {showBridgePopup && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-sm transition-all duration-300 ${
          bridgeStatus === 'connecting' ? 'bg-yellow-900/80 border-yellow-700/50 text-yellow-200' :
          bridgeStatus === 'connected' ? 'bg-green-900/80 border-green-700/50 text-green-200' :
          'bg-red-900/80 border-red-700/50 text-red-200'
        }`}>
          {bridgeStatus === 'connecting' && <Loader2 className="w-5 h-5 animate-spin" />}
          {bridgeStatus === 'connected' && <Wifi className="w-5 h-5" />}
          {bridgeStatus === 'failed' && <WifiOff className="w-5 h-5" />}
          <span className="text-sm font-medium">
            {bridgeStatus === 'connecting' && 'Bridge bağlanıyor...'}
            {bridgeStatus === 'connected' && 'Bridge bağlandı'}
            {bridgeStatus === 'failed' && 'Bridge bağlantı başarısız'}
          </span>
        </div>
      )}

      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label={mobileMenuOpen ? 'Menüyü kapat' : 'Menüyü aç'}
        className="md:hidden fixed top-11 left-3 z-50 bg-gradient-to-br from-gray-800 to-gray-900 text-white p-2.5 rounded-xl border border-gray-700/50 shadow-boltify-lg electron-no-drag"
      >
        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`
          fixed top-0 flex flex-col h-screen z-40 overflow-hidden
          bg-gradient-to-b from-gray-900 via-gray-900 to-gray-950 border-r border-gray-700/50 shadow-boltify-lg
          transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? 'md:w-16' : 'md:w-64'}
          w-64
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Header — draggable titlebar zone */}
        <div className="border-b border-gray-800/60 flex-shrink-0 p-2.5 pt-3 overflow-hidden electron-drag">
          {/* Logo row */}
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'} min-w-0`}>
            <div className={`flex items-center gap-2.5 min-w-0 flex-shrink-0 electron-no-drag ${sidebarCollapsed ? 'justify-center w-full' : ''}`}>
              <AdrenalinLogo size="sm" />
              {!sidebarCollapsed && (
                <AdrenalinLogo variant="wordmark" size="sm" />
              )}
            </div>
            {/* Desktop collapse toggle */}
            {!sidebarCollapsed && (
              <button
                onClick={toggleCollapse}
                aria-label="Sidebarı daralt"
                title="Daralt"
                className="hidden md:flex items-center justify-center w-6 h-6 rounded-lg bg-gray-800/80 hover:bg-gray-700 border border-gray-700/40 text-gray-500 hover:text-white transition-colors flex-shrink-0 ml-2 electron-no-drag"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Kasa + User info */}
          <div className={`mt-2.5 overflow-hidden ${sidebarCollapsed ? 'flex flex-col items-center gap-1.5' : 'space-y-1.5'}`}>
            {sidebarCollapsed ? (
              <>
                <div title={session?.personnel?.fullName || 'Kullanıcı'} className="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-500/15 border border-orange-500/20 flex-shrink-0">
                  {session?.personnel?.profileImage ? (
                    <img src={session.personnel.profileImage} alt="" className="w-8 h-8 rounded-lg object-cover" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-orange-400" />
                  )}
                </div>
                {isAdmin && (
                  <div title="Genel Müdür" className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/15 border border-amber-500/20 flex-shrink-0">
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                )}
                {!isAdmin && (
                  <div title={session.kasa.name} className={`w-8 h-8 rounded-lg flex items-center justify-center ${theme.badgeBg} border ${theme.badgeBorder} flex-shrink-0`}>
                    <Briefcase className={`w-3.5 h-3.5 ${theme.accent}`} />
                  </div>
                )}
                {!isAdmin && (
                  <>
                    <div title={`TL: ${kasaAdvances.tlAdvance} | USD: ${kasaAdvances.usdAdvance} | EUR: ${kasaAdvances.eurAdvance}`} className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-800/60 border border-gray-700/30 flex-shrink-0">
                      <Wallet className="w-3.5 h-3.5 text-orange-400" />
                    </div>
                    <div title={`USD: ${usdRate} ₺ | EUR: ${eurRate} ₺`} className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-800/60 border border-gray-700/30 flex-shrink-0">
                      <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {/* User card */}
                <div className="flex items-center gap-2 bg-orange-500/10 px-2.5 py-2 rounded-lg border border-orange-500/20 min-w-0">
                  {session?.personnel?.profileImage ? (
                    <img src={session.personnel.profileImage} alt="" className="w-7 h-7 rounded-md object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-md bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                      <User className="w-3.5 h-3.5 text-orange-400" />
                    </div>
                  )}
                  <span className="text-white font-semibold truncate text-xs whitespace-nowrap">{session?.personnel?.fullName || 'Kullanıcı'}</span>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2 bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/20">
                    <Shield className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                    <span className="text-amber-400 font-semibold text-xs whitespace-nowrap">Genel Müdür</span>
                  </div>
                )}
                {!isAdmin && (
                  <div className={`flex items-center gap-2 ${theme.badgeBg} px-2.5 py-1.5 rounded-lg border ${theme.badgeBorder}`}>
                    <Briefcase className={`w-3.5 h-3.5 flex-shrink-0 ${theme.accent}`} />
                    <span className={`${theme.accent} font-semibold truncate text-xs whitespace-nowrap`}>{session.kasa.name}</span>
                  </div>
                )}
                {/* Avanslar & Kurlar */}
                {!isAdmin && (
                  <>
                    {/* Avanslar */}
                    <div className="bg-gray-800/50 rounded-lg border border-gray-700/30 overflow-hidden">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/30 border-b border-gray-700/20">
                        <Wallet className="w-3 h-3 text-gray-400" />
                        <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Avanslar</span>
                      </div>
                      <div className="grid grid-cols-3 divide-x divide-gray-700/30">
                        <div className="px-2 py-1.5 text-center">
                          <p className="text-[10px] text-gray-500">TL</p>
                          <p className="text-xs font-bold text-orange-400">{kasaAdvances.tlAdvance.toLocaleString('tr-TR')}</p>
                        </div>
                        <div className="px-2 py-1.5 text-center">
                          <p className="text-[10px] text-gray-500">USD</p>
                          <p className="text-xs font-bold text-amber-400">{kasaAdvances.usdAdvance.toLocaleString('tr-TR')}</p>
                        </div>
                        <div className="px-2 py-1.5 text-center">
                          <p className="text-[10px] text-gray-500">EUR</p>
                          <p className="text-xs font-bold text-orange-300">{kasaAdvances.eurAdvance.toLocaleString('tr-TR')}</p>
                        </div>
                      </div>
                    </div>
                    {/* Kurlar */}
                    <div className="bg-gray-800/50 rounded-lg border border-gray-700/30 overflow-hidden">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/30 border-b border-gray-700/20">
                        <TrendingUp className="w-3 h-3 text-gray-400" />
                        <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Kurlar</span>
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-gray-700/30">
                        <div className="px-2.5 py-1.5">
                          <label htmlFor="usd-rate" className="text-[10px] text-gray-500 mb-0.5 block">USD / TL</label>
                          <div className="flex items-center">
                            <input id="usd-rate" type="number" step="0.01" value={usdRate} onChange={(e) => handleUsdRateChange(parseFloat(e.target.value))} className="bg-transparent font-bold text-amber-400 outline-none w-full text-xs focus:ring-1 focus:ring-amber-500/30 rounded px-0.5 electron-no-drag" />
                            <span className="text-[10px] text-gray-500 flex-shrink-0">₺</span>
                          </div>
                        </div>
                        <div className="px-2.5 py-1.5">
                          <label htmlFor="eur-rate" className="text-[10px] text-gray-500 mb-0.5 block">EUR / TL</label>
                          <div className="flex items-center">
                            <input id="eur-rate" type="number" step="0.01" value={eurRate} onChange={(e) => handleEurRateChange(parseFloat(e.target.value))} className="bg-transparent font-bold text-orange-300 outline-none w-full text-xs focus:ring-1 focus:ring-orange-500/30 rounded px-0.5 electron-no-drag" />
                            <span className="text-[10px] text-gray-500 flex-shrink-0">₺</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        {/* Navigation + Logout wrapper */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <nav className={`flex-1 overflow-y-auto py-2 ${sidebarCollapsed ? 'px-1.5' : 'px-2.5'} space-y-0.5`}>
            {!sidebarCollapsed && isAdmin && (
              <p className="text-[9px] text-orange-400/50 uppercase tracking-widest px-2 pb-1.5 pt-1 font-bold">Yönetim</p>
            )}
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  title={sidebarCollapsed ? tab.label : undefined}
                  onClick={() => { onTabChange(tab.id); setMobileMenuOpen(false); }}
                  className={`
                    w-full flex items-center rounded-lg transition-all duration-200 font-medium text-[13px]
                    ${sidebarCollapsed ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'}
                    ${active
                      ? theme.activeTab
                      : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300 border border-transparent'
                    }
                  `}
                >
                  <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${active ? theme.activeIcon : ''}`} />
                  {!sidebarCollapsed && <span className="truncate">{tab.label}</span>}
                </button>
              );
            })}
          </nav>

          {/* Logout */}
          <div className={`border-t border-gray-800/60 flex-shrink-0 ${sidebarCollapsed ? 'p-1.5' : 'p-2.5'}`}>
            <button
              onClick={onLogout}
              aria-label="Çıkış Yap"
              title={sidebarCollapsed ? 'Çıkış Yap' : undefined}
              className={`
                w-full flex items-center rounded-lg transition-all duration-200 text-[13px] font-medium
                text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20
                ${sidebarCollapsed ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'}
              `}
            >
              <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
              {!sidebarCollapsed && 'Çıkış Yap'}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-30" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Main Content */}
      <main className={`flex-1 overflow-auto min-w-0 mt-8 transition-all duration-300 ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'}`}>
        <div className="pt-14 md:pt-0 h-full">
          {children}
        </div>
      </main>

      {/* Checkout Popup — polls for checkout_pending on this kasa */}
      <CheckoutPopup kasaId={session.kasa.id} personnelId={session.personnel.id} onLogout={onLogout} />
    </div>
  );
}
