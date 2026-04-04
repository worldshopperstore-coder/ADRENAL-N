import { useState, useEffect } from 'react';
import { Megaphone } from 'lucide-react';
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
