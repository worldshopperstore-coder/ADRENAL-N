import { useState, useEffect } from 'react';
import { Megaphone, Download, RefreshCw } from 'lucide-react';
import { getActiveAnnouncements, type Announcement } from '@/utils/announcementsDB';
import AppLayout from '@/components/AppLayout';
import DashboardTab from '@/components/DashboardTab';
import PackagesTab from '@/components/PackagesTab';
import AquariumTab from '@/components/AquariumTab';
import CrossSalesTab from '@/components/CrossSalesTab';
import TeamTab from '@/components/TeamTab';
import AdminPanel from '@/components/AdminPanel';
import LoginPage, { KasaInfo } from '@/components/LoginPage';
import AttendanceGate from '@/components/AttendanceGate';
import { initializePersonnelDB } from '@/utils/personnelDB';
import { setPersonnelOnline, setPersonnelOffline } from '@/utils/personnelSupabaseDB';
import type { Personnel } from '@/types/personnel';

type TabType = 'dashboard' | 'packages' | 'aquarium' | 'crosssales' | 'team' | 'admin-overview' | 'admin-personnel' | 'admin-shifts' | 'admin-advances' | 'admin-packages' | 'admin-performance' | 'admin-reports' | 'admin-crossaccounting' | 'admin-integration';

interface UserSession {
  kasa: KasaInfo;
  personnel: Personnel;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [session, setSession] = useState<UserSession | null>(null);
  const [attendanceConfirmed, setAttendanceConfirmed] = useState(() => {
    return localStorage.getItem('attendanceConfirmed') === 'true';
  });
  const [announcementPopup, setAnnouncementPopup] = useState<Announcement[]>([]);
  const [maintenanceNotice, setMaintenanceNotice] = useState<string | null>(null);

  // Auto-update state
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateReady, setUpdateReady] = useState(false);

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
    const key = `maintenance_seen_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    if (localStorage.getItem(key)) return; // Bu cumartesi zaten gösterildi
    setMaintenanceNotice(`Bugün (Cumartesi) saat 23:00 - 23:30 arası sistem güncellemesi yapılacaktır. Lütfen bu saatten önce işlemlerinizi tamamlayınız ve verilerinizi kontrol ediniz.`);
  };

  const dismissMaintenance = () => {
    const d = new Date();
    const key = `maintenance_seen_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
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
          // Online durumunu güncelle (session restore)
          if (restored?.personnel?.id) {
            setPersonnelOnline(restored.personnel.id);
          }
          // Yazıcı otomatik algıla (oturum restore)
          import('@/utils/posManager').then(m => m.autoDetectPrinter(restored.kasa.id)).catch(() => {});
        }
      } catch {
        localStorage.removeItem('userSession');
      }
    }
    
    // Personel veritabanını başlat
    initializePersonnelDB();

    // Uygulama kapanırken offline yap
    const handleBeforeUnload = () => {
      const s = localStorage.getItem('userSession');
      if (s) {
        try {
          const { personnel } = JSON.parse(s);
          if (personnel?.id) setPersonnelOffline(personnel.id);
        } catch {}
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Online heartbeat — 60 saniyede bir online durumunu tazele
    const heartbeat = setInterval(() => {
      const s = localStorage.getItem('userSession');
      if (s) {
        try {
          const { personnel } = JSON.parse(s);
          if (personnel?.id) setPersonnelOnline(personnel.id);
        } catch {}
      }
    }, 60_000);

    // Aktif mod durumunu Supabase'den çek (tüm kasalar senkron)
    import('@/utils/posManager').then(m => m.syncIntegrationFromSupabase()).catch(() => {});

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(heartbeat);
    };
  }, []);

  // Auto-update dinleyici
  useEffect(() => {
    const el = window.electron;
    if (!el?.updater) return;
    el.updater.onUpdateAvailable((data) => {
      setUpdateVersion(data.version);
    });
    el.updater.onDownloadProgress((data) => {
      setUpdateProgress(Math.round(data.percent));
    });
    el.updater.onUpdateDownloaded(() => {
      setUpdateProgress(null);
      setUpdateReady(true);
    });
  }, []);

  // Duyuru kontrolü: giriş sonrası + her 60 saniyede bir
  useEffect(() => {
    if (!session) return;
    checkAnnouncements();
    checkMaintenanceDay();
    const interval = setInterval(checkAnnouncements, 60_000);
    return () => clearInterval(interval);
  }, [session]);

  // Login işlemi
  const handleLogin = (kasa: KasaInfo, personnel: Personnel) => {
    const newSession: UserSession = { kasa, personnel };
    setSession(newSession);
    localStorage.setItem('userSession', JSON.stringify(newSession));
    const ld = new Date();
    localStorage.setItem('sessionLoginDate', `${ld.getFullYear()}-${String(ld.getMonth()+1).padStart(2,'0')}-${String(ld.getDate()).padStart(2,'0')}`);
    localStorage.setItem('currentUserName', personnel.fullName);
    localStorage.setItem('currentUserId', personnel.id);
    localStorage.setItem('currentKasaId', kasa.id);
    localStorage.setItem('currentKasaName', kasa.name);
    localStorage.setItem('currentKasaTitle', kasa.title);
    localStorage.setItem('currentKasaPaxName', kasa.paxName);
    
    // Online durumunu Supabase'e bildir
    setPersonnelOnline(personnel.id);

    // Zebra yazıcıyı otomatik algıla
    import('@/utils/posManager').then(m => m.autoDetectPrinter(kasa.id)).catch(() => {});

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
          localStorage.setItem('attendanceConfirmed', 'true');
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
      case 'crosssales':
        return <CrossSalesTab />;
      case 'team':
        return <TeamTab />;
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

      {/* Güncelleme Pop-up */}
      {updateVersion && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[95] flex items-center justify-center p-4">
          <div className="bg-gradient-to-b from-gray-900 to-[#0c0c14] border border-gray-700/60 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            {/* Başlık */}
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                updateReady 
                  ? 'bg-amber-600/20 border-amber-600/40' 
                  : 'bg-emerald-600/20 border-emerald-600/40'
              }`}>
                {updateReady 
                  ? <RefreshCw className="w-6 h-6 text-amber-400" />
                  : <Download className="w-6 h-6 text-emerald-400" />
                }
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {updateReady ? 'Güncelleme Hazır' : 'Güncelleme Mevcut'}
                </h3>
                <p className="text-sm text-gray-400">v{updateVersion}</p>
              </div>
            </div>

            {/* Progress Bar */}
            {updateProgress !== null && !updateReady && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400 font-medium">İndiriliyor...</span>
                  <span className="text-xs text-emerald-400 font-bold">%{updateProgress}</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-3 border border-gray-700/60 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${updateProgress}%` }} 
                  />
                </div>
              </div>
            )}

            {/* Açıklama */}
            {updateProgress === null && !updateReady && (
              <p className="text-sm text-gray-400 mb-5">
                Yeni bir güncelleme mevcut. İndirmek için aşağıdaki butona tıklayın.
              </p>
            )}

            {updateReady && (
              <p className="text-sm text-gray-400 mb-5">
                Güncelleme başarıyla indirildi. Uygulamayı yeniden başlatarak güncelleyin.
              </p>
            )}

            {/* Butonlar */}
            <div className="flex gap-2">
              {!updateReady && updateProgress === null && (
                <>
                  <button
                    onClick={() => setUpdateVersion(null)}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white font-semibold py-2.5 rounded-xl transition-colors text-sm border border-gray-700"
                  >
                    Sonra
                  </button>
                  <button
                    onClick={() => { setUpdateProgress(0); window.electron?.updater.download(); }}
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-2.5 rounded-xl transition-all text-sm shadow-lg shadow-emerald-500/20"
                  >
                    Güncelle
                  </button>
                </>
              )}

              {updateProgress !== null && !updateReady && (
                <div className="w-full text-center text-xs text-gray-500 py-1">
                  Lütfen bekleyin, indirme devam ediyor...
                </div>
              )}

              {updateReady && (
                <button
                  onClick={() => window.electron?.updater.install()}
                  className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold py-2.5 rounded-xl transition-all text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> Yeniden Başlat
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
