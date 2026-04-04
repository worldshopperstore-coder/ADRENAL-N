import { KasaSettings, DEFAULT_KASA_SETTINGS } from '@/types/kasaSettings';
import { supabase } from '@/config/supabase';

const STORAGE_KEY = 'kasa_settings_db';

// Kasa ayarlarını başlat
export function initializeKasaSettings(): void {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (!existing) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_KASA_SETTINGS));
  }
}

// Tüm kasa ayarlarını getir
export function getAllKasaSettings(): Record<string, KasaSettings> {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : DEFAULT_KASA_SETTINGS;
}

// Belirli bir kasa ayarlarını getir
export function getKasaSettings(kasaId: string): KasaSettings {
  const allSettings = getAllKasaSettings();
  return allSettings[kasaId] || DEFAULT_KASA_SETTINGS[kasaId];
}

// Kasa ayarlarını güncelle
export function updateKasaSettings(
  kasaId: string, 
  updates: Partial<KasaSettings>,
  updatedBy?: string
): void {
  const allSettings = getAllKasaSettings();
  allSettings[kasaId] = {
    ...allSettings[kasaId],
    ...updates,
    lastUpdated: new Date().toISOString(),
    updatedBy
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allSettings));
}

// Avansları güncelle
export function updateKasaAdvances(
  kasaId: string,
  advances: { tlAdvance: number; usdAdvance: number; eurAdvance: number },
  updatedBy?: string
): void {
  const settings = getKasaSettings(kasaId);
  updateKasaSettings(kasaId, {
    ...settings,
    advances
  }, updatedBy);
}

// Paketleri güncelle
export function updateKasaPackages(
  kasaId: string,
  packages: any[],
  updatedBy?: string
): void {
  const settings = getKasaSettings(kasaId);
  updateKasaSettings(kasaId, {
    ...settings,
    packages
  }, updatedBy);
}

// Varsayılan ayarlara sıfırla
export function resetKasaSettings(kasaId: string): void {
  const allSettings = getAllKasaSettings();
  allSettings[kasaId] = DEFAULT_KASA_SETTINGS[kasaId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allSettings));
}

// Supabase'den avans bilgilerini çek ve localStorage'ı güncelle
export async function loadAdvancesFromSupabase(kasaId: string): Promise<{ tlAdvance: number; usdAdvance: number; eurAdvance: number }> {
  try {
    if (!supabase) throw new Error('offline');
    const { data, error } = await supabase
      .from('kasa_settings')
      .select('tl_advance, usd_advance, eur_advance')
      .eq('kasa_id', kasaId)
      .single();
    if (!error && data) {
      const advances = {
        tlAdvance: Number(data.tl_advance) || 0,
        usdAdvance: Number(data.usd_advance) || 0,
        eurAdvance: Number(data.eur_advance) || 0,
      };
      // localStorage'ı da güncelle
      updateKasaAdvances(kasaId, advances);
      return advances;
    }
  } catch { /* fallback to localStorage */ }

  const s = getKasaSettings(kasaId);
  return s.advances;
}

// Avansları Supabase'e kaydet
export async function saveAdvancesToSupabase(
  kasaId: string,
  advances: { tlAdvance: number; usdAdvance: number; eurAdvance: number },
  updatedBy?: string
): Promise<boolean> {
  // Önce localStorage'a kaydet
  updateKasaAdvances(kasaId, advances, updatedBy);

  // Sonra Supabase'e kaydet
  try {
    if (!supabase) return false;
    const { error } = await supabase
      .from('kasa_settings')
      .upsert([{
        kasa_id: kasaId,
        tl_advance: advances.tlAdvance,
        usd_advance: advances.usdAdvance,
        eur_advance: advances.eurAdvance,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy || '',
      }], { onConflict: 'kasa_id' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Avans Supabase kaydı başarısız:', err);
    return false;
  }
}
