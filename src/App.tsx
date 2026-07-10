import { useState, useEffect } from 'react';
import { Megaphone, Download, RefreshCw } from 'lucide-react';
import { getActiveAnnouncements, type Announcement } from '@/utils/announcementsDB';
import AppLayout from '@/components/AppLayout';
import DashboardTab from '@/components/DashboardTab';
import PackagesTab from '@/components/PackagesTab';
import AquariumTab from '@/components/AquariumTab';
import TeamTab from '@/components/TeamTab';
import TicketTrackTab from '@/components/TicketTrackTab';
import AdminPanel from '@/components/AdminPanel';
import LoginPage, { KasaInfo } from '@/components/LoginPage';
import AttendanceGate from '@/components/AttendanceGate';
import { initializePersonnelDB } from '@/utils/personnelDB';
import { setPersonnelOnline, setPersonnelOffline } from '@/utils/personnelSupabaseDB';
import type { Personnel } from '@/types/personnel';

type TabType = 'dashboard' | 'packages' | 'aquarium' | 'team' | 'tickettrack' | 'admin-overview' | 'admin-personnel' | 'admin-shifts' | 'admin-advances' | 'admin-packages' | 'admin-performance' | 'admin-reports' | 'admin-crossaccounting' | 'admin-integration';

interface UserSession {
  kasa: KasaInfo;
  personnel: Personnel;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [session, setSession] = useState<UserSession | null>(null);
  const [attendanceConfirmed, setAttendanceConfirmed] = useState(() => {
    const saved = localStorage.getItem('attendanceConfirmed');
    const savedDate = localStorage.getItem('attendanceConfirmedDate');
    const today = new Date().toISOString().slice(0, 10);
    return saved === 'true' && savedDate === today;
  });
  const [announcementPopup, setAnnouncementPopup] = useState<Announcement[]>([]);
  const [maintenanceNotice, setMaintenanceNotice] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<{
    available: boolean;
    version?: string;
    downloading: boolean;
    percent: number;
    ready: boolean;
  }>({ available: false, downloading: false, percent: 0, ready: false });

  const checkAnnouncements = async () => {
    const announcements = await getActiveAnnouncements();
    const seen: string[] = JSON.parse(localStorage.getItem('seenAnnouncementIds') || '[]');
    const unseen = announcements.filter(a => !seen.includes(a.id));
    if (unseen.length > 0) setAnnouncementPopup(unseen);
  };

  // Her Cumartesi bakım bildirimi kontrolü
  const checkMaintenanceDay = () => {
    const now = new Date();
    if (now.getDay() !== 6) return; // 6 = Cumartesi değilse çık
    const key = `maintenance_seen_${now.toISOString().split('T')[0]}`;
    if (localStorage.getItem(key)) return; // Bu cumartesi zaten gösterildi
    setMaintenanceNotice(`Bugün (Cumartesi) saat 23:00 - 23:30 arası sistem güncellemesi yapılacaktır. Lütfen bu saatten önce işlemlerinizi tamamlayınız ve verilerinizi kontrol ediniz.`);
  };

  const dismissMaintenance = () => {
    const key = `maintenance_seen_${new Date().toISOString().split('T')[0]}`;
    localStorage.setItem(key, 'true');
    setMaintenanceNotice(null);
  };

  const dismissAnnouncements = () => {
    const seen: string[] = JSON.parse(localStorage.getItem('seenAnnouncementIds') || '[]');
    const newSeen = [...new Set([...seen, ...announcementPopup.map(a => a.id)])];
    localStorage.setItem('seenAnnouncementIds', JSON.stringify(newSeen));
    setAnnouncementPopup([]);
  };

  // Oturum bilgisini localStorage'dan yükle (günlük oturum süresi kontrolü)
  useEffect(() => {
    const savedSession = localStorage.getItem('userSession');
    if (savedSession) {
      try {
        const restored = JSON.parse(savedSession);
        // Giriş tarihi bugün değilse oturumu sil
        const loginDate = localStorage.getItem('sessionLoginDate');
        const today = new Date().toISOString().slice(0, 10);
        if (loginDate && loginDate !== today) {
          // Eski oturum — temizle
          localStorage.removeItem('userSession');
          localStorage.removeItem('currentUserName');
          localStorage.removeItem('currentUserId');
          localStorage.removeItem('currentKasaId');
          localStorage.removeItem('currentKasaName');
          localStorage.removeItem('currentKasaTitle');
          localStorage.removeItem('currentKasaPaxName');
          localStorage.removeItem('attendanceConfirmed');
          localStorage.removeItem('attendanceConfirmedDate');
          localStorage.removeItem('sessionLoginDate');
          if (restored?.personnel?.id) {
            setPersonnelOffline(restored.personnel.id);
          }
        } else {
          setSession(restored);
          // Admin ise admin-overview, değilse dashboard aç
          if (restored?.personnel?.role === 'genel_mudur') {
            setActiveTab('admin-overview');
          } else {
            setActiveTab('dashboard');
          }
        }
      } catch {
        localStorage.removeItem('userSession');
      }
    }
    
    // Personel veritabanını başlat
    initializePersonnelDB();
  }, []);

  // Duyuru kontrolü: giriş sonrası + her 60 saniyede bir
  useEffect(() => {
    if (!session) return;
    checkAnnouncements();
    checkMaintenanceDay();
    const interval = setInterval(checkAnnouncements, 60_000);
    return () => clearInterval(interval);
  }, [session]);

  // Otomatik güncelleme IPC olayları
  useEffect(() => {
    const ipc = (window as any).electron?.ipcRenderer;
    if (!ipc) return;

    ipc.on('updater:update-available', (data: { version: string }) => {
      setUpdateState(s => ({ ...s, available: true, version: data.version, downloading: true }));
    });

    ipc.on('updater:download-progress', (data: { percent: number }) => {
      setUpdateState(s => ({ ...s, percent: data.percent }));
    });

    ipc.on('updater:update-downloaded', () => {
      setUpdateState(s => ({ ...s, downloading: false, ready: true }));
    });
  }, []);

  // Login işlemi
  const handleLogin = (kasa: KasaInfo, personnel: Personnel) => {
    const newSession: UserSession = { kasa, personnel };
    setSession(newSession);
    localStorage.setItem('userSession', JSON.stringify(newSession));
    localStorage.setItem('sessionLoginDate', new Date().toISOString().slice(0, 10));
    localStorage.setItem('currentUserName', personnel.fullName);
    localStorage.setItem('currentUserId', personnel.id);
    localStorage.setItem('currentKasaId', kasa.id);
    localStorage.setItem('currentKasaName', kasa.name);
    localStorage.setItem('currentKasaTitle', kasa.title);
    localStorage.setItem('currentKasaPaxName', kasa.paxName);
    
    // Online durumunu Supabase'e bildir
    setPersonnelOnline(personnel.id);

    // Genel müdür için admin panel'i aç, diğerleri için dashboard
    if (personnel.role === 'genel_mudur') {
      setActiveTab('admin-overview');
    } else {
      setActiveTab('dashboard');
    }
  };

  // Logout işlemi
  const handleLogout = () => {
    // Offline durumunu Supabase'e bildir
    const savedSession = localStorage.getItem('userSession');
    if (savedSession) {
      try {
        const { personnel } = JSON.parse(savedSession);
        if (personnel?.id) setPersonnelOffline(personnel.id);
      } catch { /* ignore */ }
    }

    setSession(null);
    setAttendanceConfirmed(false);
    localStorage.removeItem('attendanceConfirmed');
    localStorage.removeItem('attendanceConfirmedDate');
    localStorage.removeItem('userSession');
    localStorage.removeItem('sessionLoginDate');
    localStorage.removeItem('currentUserName');
    localStorage.removeItem('currentUserId');
    localStorage.removeItem('currentKasaId');
    localStorage.removeItem('currentKasaName');
    localStorage.removeItem('currentKasaTitle');
    localStorage.removeItem('currentKasaPaxName');
  };

  // Giriş yapılmamışsa login sayfasını göster
  if (!session) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Yoklama onaylanmadıysa QR ekranını göster
  if (!attendanceConfirmed) {
    return (
      <AttendanceGate
        personnelId={session.personnel.id}
        personnelName={session.personnel.fullName}
        kasaId={session.kasa.id}
        isAdmin={session.personnel.role === 'genel_mudur'}
        onConfirmed={() => {
          setAttendanceConfirmed(true);
          const today = new Date().toISOString().slice(0, 10);
          localStorage.setItem('attendanceConfirmed', 'true');
          localStorage.setItem('attendanceConfirmedDate', today);
        }}
        onLogout={handleLogout}
      />
    );
  }

  const renderContent = () => {
    // Admin Panel tabs
    if (activeTab.startsWith('admin-')) {
      return <AdminPanel activeTab={activeTab} />;
    }

    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab />;
      case 'packages':
        return <PackagesTab />;
      case 'aquarium':
        return <AquariumTab />;
      case 'team':
        return <TeamTab />;
      case 'tickettrack':
        return <TicketTrackTab />;
      default:
        return <DashboardTab />;
    }
  };

  return (
    <AppLayout 
      activeTab={activeTab} 
      onTabChange={(tab: string) => setActiveTab(tab as TabType)}
      session={session}
      onLogout={handleLogout}
    >
      {renderContent()}

      {/* Duyuru popup */}
      {announcementPopup.length > 0 && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-amber-700/40 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-amber-600/20 border border-amber-600/40 rounded-xl flex items-center justify-center flex-shrink-0">
                <Megaphone className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Yeni Duyuru</h3>
                <p className="text-xs text-gray-500">Yönetiminizden mesaj</p>
              </div>
            </div>
            <div className="space-y-3 mb-5">
              {announcementPopup.map(a => (
                <div key={a.id} className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4">
                  <p className="text-sm text-white leading-relaxed">{a.message}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {a.created_by} · {new Date(a.created_at).toLocaleString('tr-TR')}
                  </p>
                </div>
              ))}
            </div>
            <button
              onClick={dismissAnnouncements}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
            >
              Tamam, Anladım
            </button>
          </div>
        </div>
      )}

      {/* Güncelleme indiriliyor — küçük bildirim */}
      {updateState.available && !updateState.ready && (
        <div className="fixed bottom-4 right-4 z-[90] max-w-xs">
          <div className="bg-gray-900 border border-blue-500/30 rounded-2xl px-4 py-3 shadow-2xl">
            <div className="flex items-center gap-2 mb-2">
              <Download className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <p className="text-xs font-bold text-white">Güncelleme indiriliyor… %{updateState.percent}</p>
            </div>
            <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${updateState.percent}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Güncelleme hazır — modal */}
      {updateState.ready && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-700/60 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            {/* İkon */}
            <div className="flex flex-col items-center mb-5">
              <div className="relative mb-4">
                <div className="w-16 h-16 bg-blue-500/15 border-2 border-blue-500/30 rounded-full flex items-center justify-center">
                  <RefreshCw className="w-7 h-7 text-blue-400" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-gray-900">
                  <Download className="w-2.5 h-2.5 text-white" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-white">Güncelleme Hazır</h3>
              {updateState.version && (
                <span className="mt-1.5 text-xs font-semibold px-3 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25">
                  v{updateState.version}
                </span>
              )}
            </div>
            {/* Tam dolu bar */}
            <div className="h-1 bg-gray-800 rounded-full mb-5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full w-full" />
            </div>
            <p className="text-xs text-gray-500 text-center mb-4">
              Yeni sürüm indirildi. Hemen kurabilir ya da sonraki açılışta otomatik kurulmasını bekleyebilirsiniz.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => (window as any).electron?.ipcRenderer.invoke('updater:install')}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold py-2.5 rounded-xl transition-all text-sm shadow-lg shadow-blue-500/20"
              >
                Şimdi Kur
              </button>
              <button
                onClick={() => setUpdateState(s => ({ ...s, ready: false }))}
                className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white py-2.5 rounded-xl transition-colors text-sm border border-gray-700"
              >
                Sonra
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cumartesi bakım bildirimi */}
      {maintenanceNotice && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-blue-700/40 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-blue-600/20 border border-blue-600/40 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-xl">🔧</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Sistem Güncellemesi</h3>
                <p className="text-xs text-gray-500">Adrenalin Dünyası — Haftalık Bakım</p>
              </div>
            </div>
            <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 mb-5">
              <p className="text-sm text-white leading-relaxed">{maintenanceNotice}</p>
            </div>
            <button
              onClick={dismissMaintenance}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
            >
              Tamam, Anladım
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
