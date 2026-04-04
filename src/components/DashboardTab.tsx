import { useState, useEffect } from 'react';
import SalesPanel from './SalesPanel';
import { initializeKasaSettings } from '@/utils/kasaSettingsDB';
import { loadExchangeRates, loadExchangeRatesFromSupabase } from '@/utils/dailyData';

function SalesSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      <div className="h-8 bg-gray-800 rounded-xl w-48" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 bg-gray-800 rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-gray-800 rounded-xl" />
    </div>
  );
}

export default function DashboardTab() {
  const [userRole, setUserRole] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Kur değerlerini localStorage'dan yükle
  const savedRates = loadExchangeRates();
  const [usdRate, setUsdRate] = useState(savedRates.usd);
  const [eurRate, setEurRate] = useState(savedRates.eur);

  // Kasa ayarlarını yükle
  useEffect(() => {
    initializeKasaSettings();
    const kasaId = localStorage.getItem('currentKasaId') || 'sinema';
    
    // Kullanıcı rolünü kontrol et
    const session = localStorage.getItem('userSession');
    if (session) {
      try {
        const userData = JSON.parse(session);
        setUserRole(userData.personnel?.role || '');
      } catch {
        // corrupted session data — ignore
      }
    }
    
    // Kurları Supabase'den çek
    if (kasaId !== 'genel') {
      loadExchangeRatesFromSupabase().then((rates) => {
        setUsdRate(rates.usd);
        setEurRate(rates.eur);
      }).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);
  
  // Genel müdür dashboard sekmesini görmemeli (admin-overview'a yönlendirilir)
  if (userRole === 'genel_mudur') {
    return null;
  }

  if (isLoading) {
    return <SalesSkeleton />;
  }

  return (
    <div className="p-2 sm:p-4 space-y-4">
      {/* Satış Panosu (Tam genişlik) */}
      <SalesPanel usdRate={usdRate} eurRate={eurRate} />
    </div>
  );
}
