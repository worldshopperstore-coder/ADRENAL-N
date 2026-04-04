// Supabase sat�� y�netimi (Firebase API uyumlu wrapper)
import { supabase } from '@/config/supabase';

/**
 * Bug�n�n tarihini YYYY-MM-DD format�nda d�nd�r�r
 */
export function getTodayDate(): string {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

/**
 * Aktif kasa ID'sini d�nd�r�r
 */
export function getActiveKasaId(): string {
  return localStorage.getItem('currentKasaId') || 'default';
}

// ==================== SATI�LAR ====================

export async function saveSalesToFirebase(sales: any[]): Promise<void> {
  const kasaId = getActiveKasaId();
  const today = getTodayDate();

  try {
    if (!supabase) throw new Error('offline');
    const { error } = await supabase
      .from('sales')
      .upsert(
        [
          {
            kasaId,
            date: today,
            sales,
            updatedAt: new Date().toISOString(),
          }
        ],
        { onConflict: 'kasaId,date' }
      );

    if (error) throw error;

    localStorage.setItem(`daily_sales_${kasaId}`, JSON.stringify({
      date: today,
      sales,
      savedAt: new Date().toISOString(),
    }));
  } catch (err) {
    console.error('Supabase kay�t hatas�:', err);
    localStorage.setItem(`daily_sales_${kasaId}`, JSON.stringify({
      date: today,
      sales,
      savedAt: new Date().toISOString(),
    }));
  }
}

export async function loadSalesFromFirebase(): Promise<any[]> {
  const kasaId = getActiveKasaId();
  const today = getTodayDate();

  try {
    if (!supabase) throw new Error('offline');
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('kasaId', kasaId)
      .eq('date', today)
      .limit(1);

    if (error) throw error;

    if (data && data.length > 0 && data[0].sales) {
      localStorage.setItem(`daily_sales_${kasaId}`, JSON.stringify({
        date: today,
        sales: data[0].sales,
        savedAt: new Date().toISOString(),
      }));
      return data[0].sales;
    }

    return loadSalesFromLocalStorage();
  } catch (err) {
    console.error('Supabase okuma hatas�:', err);
    return loadSalesFromLocalStorage();
  }
}

function loadSalesFromLocalStorage(): any[] {
  const kasaId = getActiveKasaId();
  const data = localStorage.getItem(`daily_sales_${kasaId}`);
  if (!data) return [];

  try {
    const parsed = JSON.parse(data);
    const today = getTodayDate();

    if (parsed.date !== today) {
      localStorage.removeItem(`daily_sales_${kasaId}`);
      return [];
    }

    return parsed.sales || [];
  } catch {
    return [];
  }
}

export function subscribeSales(callback: (sales: any[]) => void): () => void {
  const kasaId = getActiveKasaId();

  if (!supabase) return () => {};

  const channel = supabase
    .channel(`sales-realtime-${kasaId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sales', filter: `kasaId=eq.${kasaId}` },
      async () => {
        const sales = await loadSalesFromFirebase();
        callback(sales);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ==================== �APRAZ SATI�LAR ====================

export async function saveCrossSalesToFirebase(crossSales: any[]): Promise<void> {
  const kasaId = getActiveKasaId();
  const today = getTodayDate();

  try {
    if (!supabase) throw new Error('offline');
    const { error } = await supabase
      .from('cross_sales')
      .upsert(
        [
          {
            kasaId,
            date: today,
            crossSales,
            updatedAt: new Date().toISOString(),
          }
        ],
        { onConflict: 'kasaId,date' }
      );

    if (error) throw error;

    localStorage.setItem(`daily_cross_sales_${kasaId}`, JSON.stringify({
      date: today,
      crossSales,
      savedAt: new Date().toISOString(),
    }));
  } catch (err) {
    console.error('Supabase cross sales kay�t hatas�:', err);
    localStorage.setItem(`daily_cross_sales_${kasaId}`, JSON.stringify({
      date: today,
      crossSales,
      savedAt: new Date().toISOString(),
    }));
  }
}

export async function loadCrossSalesFromFirebase(): Promise<any[]> {
  const kasaId = getActiveKasaId();
  const today = getTodayDate();

  try {
    if (!supabase) throw new Error('offline');
    const { data, error } = await supabase
      .from('cross_sales')
      .select('*')
      .eq('kasaId', kasaId)
      .eq('date', today)
      .limit(1);

    if (error) throw error;

    if (data && data.length > 0 && data[0].crossSales) {
      localStorage.setItem(`daily_cross_sales_${kasaId}`, JSON.stringify({
        date: today,
        crossSales: data[0].crossSales,
        savedAt: new Date().toISOString(),
      }));
      return data[0].crossSales;
    }

    return loadCrossSalesFromLocalStorage();
  } catch (err) {
    console.error('Supabase cross sales okuma hatas�:', err);
    return loadCrossSalesFromLocalStorage();
  }
}

function loadCrossSalesFromLocalStorage(): any[] {
  const kasaId = getActiveKasaId();
  const data = localStorage.getItem(`daily_cross_sales_${kasaId}`);
  if (!data) return [];

  try {
    const parsed = JSON.parse(data);
    const today = getTodayDate();

    if (parsed.date !== today) {
      localStorage.removeItem(`daily_cross_sales_${kasaId}`);
      return [];
    }

    return parsed.crossSales || [];
  } catch {
    return [];
  }
}

export function subscribeCrossSales(callback: (crossSales: any[]) => void): () => void {
  const kasaId = getActiveKasaId();

  if (!supabase) return () => {};

  const channel = supabase
    .channel(`cross-sales-realtime-${kasaId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cross_sales', filter: `kasaId=eq.${kasaId}` },
      async () => {
        const crossSales = await loadCrossSalesFromFirebase();
        callback(crossSales);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function clearOldSales(kasaId: string, date: string): Promise<void> {
  try {
    if (!supabase) throw new Error('offline');
    await supabase.from('sales').delete().eq('kasaId', kasaId).eq('date', date);
    await supabase.from('cross_sales').delete().eq('kasaId', kasaId).eq('date', date);
    console.log(`${kasaId} kasas�n�n ${date} tarihli sat��lar� silindi`);
  } catch (error) {
    console.error('Silme hatas�:', error);
  }
}

export async function clearTodaySales(): Promise<void> {
  const kasaId = getActiveKasaId();
  const today = getTodayDate();

  try {
    if (supabase) {
      await supabase.from('sales').delete().eq('kasaId', kasaId).eq('date', today);
      await supabase.from('cross_sales').delete().eq('kasaId', kasaId).eq('date', today);
    }

    localStorage.removeItem(`daily_sales_${kasaId}`);
    localStorage.removeItem(`daily_cross_sales_${kasaId}`);

    console.log('G�nl�k sat��lar temizlendi');
  } catch (error) {
    console.error('Bug�n�n sat��lar�n� silme hatas�:', error);
  }
}
