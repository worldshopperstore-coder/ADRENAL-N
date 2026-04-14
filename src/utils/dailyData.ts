// Günlük veri yönetimi için utility fonksiyonlar

/**
 * Aktif kasa ID'sini döndürür
 */
export function getActiveKasaId(): string {
  return localStorage.getItem('currentKasaId') || 'default';
}

/**
 * Bugünün tarihini YYYY-MM-DD formatında döndürür
 */
export function getTodayDate(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
}

/**
 * Günlük satış verilerini localStorage'a kaydeder (KASA BAZLI)
 */
export function saveDailySales(sales: any[]): void {
  const today = getTodayDate();
  const kasaId = getActiveKasaId();
  const data = {
    date: today,
    sales: sales,
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(`daily_sales_${kasaId}`, JSON.stringify(data));
}

/**
 * Günlük satış verilerini localStorage'dan yükler (KASA BAZLI)
 * Tarih geçmişse boş array döner
 */
export function loadDailySales(): any[] {
  const kasaId = getActiveKasaId();
  const data = localStorage.getItem(`daily_sales_${kasaId}`);
  if (!data) return [];
  
  try {
    const parsed = JSON.parse(data);
    const today = getTodayDate();
    
    // Tarih değişmişse eski verileri temizle
    if (parsed.date !== today) {
      localStorage.removeItem(`daily_sales_${kasaId}`);
      return [];
    }
    
    return parsed.sales || [];
  } catch {
    return [];
  }
}

/**
 * Kur değerlerini kaydeder (localStorage + Supabase)
 */
export function saveExchangeRates(usdRate: number, eurRate: number): void {
  const data = {
    usd: usdRate,
    eur: eurRate,
    updatedAt: new Date().toISOString()
  };
  const kasaId = getActiveKasaId();
  const today = getTodayDate();
  // Tüm kasaların localStorage'ını güncelle (kur tüm kasalarda aynı olmalı)
  const allKasas = ['wildpark', 'sinema', 'face2face'];
  allKasas.forEach(kid => {
    localStorage.setItem(`exchange_rates_${kid}`, JSON.stringify(data));
  });

  // Supabase'e de kaydet — TÜM kasalar için aynı kur (async, hata olsa da devam et)
  import('@/config/supabase').then(({ supabase }) => {
    if (!supabase) return;
    // Tüm kasaların kasa_rates'ini güncelle (bir kasa girince hepsi değişir)
    const now = new Date().toISOString();
    supabase.from('kasa_rates').upsert(
      allKasas.map(kid => ({
        kasa_id: kid,
        usd: usdRate,
        eur: eurRate,
        updated_at: now,
      })),
      { onConflict: 'kasa_id' }
    ).then(({ error }) => {
      if (error) console.error('Kur kayıt hatası:', error.message);
    });
    // Günlük kur geçmişi (tüm kasalar için tek kur - hangi kasa girerse o günün kuru olur)
    supabase.from('daily_rates').upsert([{
      date: today,
      usd: usdRate,
      eur: eurRate,
    }], { onConflict: 'date' }).then(({ error }) => {
      if (error) console.error('Günlük kur kayıt hatası:', error.message);
    });
  });
}

/**
 * Kur değerlerini yükler (localStorage'dan)
 */
export function loadExchangeRates(): { usd: number; eur: number } {
  const kasaId = getActiveKasaId();
  // Kasa bazlı kur varsa onu kullan
  const kasaData = localStorage.getItem(`exchange_rates_${kasaId}`);
  if (kasaData) {
    try {
      const parsed = JSON.parse(kasaData);
      return { usd: parsed.usd || 30, eur: parsed.eur || 50.4877 };
    } catch { /* fallthrough */ }
  }
  // Eski format fallback
  const data = localStorage.getItem('exchange_rates');
  if (!data) return { usd: 30, eur: 50.4877 };
  
  try {
    const parsed = JSON.parse(data);
    return { usd: parsed.usd || 30, eur: parsed.eur || 50.4877 };
  } catch {
    return { usd: 30, eur: 50.4877 };
  }
}

/**
 * Supabase'den kur değerlerini çeker ve localStorage'ı günceller
 */
export async function loadExchangeRatesFromSupabase(): Promise<{ usd: number; eur: number }> {
  const kasaId = getActiveKasaId();
  try {
    const { supabase } = await import('@/config/supabase');
    if (!supabase) throw new Error('offline');
    const { data, error } = await supabase
      .from('kasa_rates')
      .select('usd, eur')
      .eq('kasa_id', kasaId)
      .single();
    if (!error && data) {
      const rates = { usd: Number(data.usd) || 30, eur: Number(data.eur) || 50.4877 };
      const ratesWithTime = { ...rates, updatedAt: new Date().toISOString() };
      // Tüm kasaların localStorage'ını güncelle
      ['wildpark', 'sinema', 'face2face'].forEach(kid => {
        localStorage.setItem(`exchange_rates_${kid}`, JSON.stringify(ratesWithTime));
      });
      localStorage.setItem('exchange_rates', JSON.stringify(ratesWithTime));
      return rates;
    }
  } catch { /* fallback */ }
  return loadExchangeRates();
}

/**
 * Çapraz satışları kaydeder (KASA BAZLI)
 */
export function saveCrossSales(crossSales: any[]): void {
  const today = getTodayDate();
  const kasaId = getActiveKasaId();
  const data = {
    date: today,
    crossSales: crossSales,
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(`daily_cross_sales_${kasaId}`, JSON.stringify(data));
}

/**
 * Çapraz satışları yükler (KASA BAZLI)
 */
export function loadCrossSales(): any[] {
  const kasaId = getActiveKasaId();
  const data = localStorage.getItem(`daily_cross_sales_${kasaId}`);
  if (!data) return [];
  
  try {
    const parsed = JSON.parse(data);
    const today = getTodayDate();
    
    // Tarih değişmişse eski verileri temizle
    if (parsed.date !== today) {
      localStorage.removeItem(`daily_cross_sales_${kasaId}`);
      return [];
    }
    
    return parsed.crossSales || [];
  } catch {
    return [];
  }
}
