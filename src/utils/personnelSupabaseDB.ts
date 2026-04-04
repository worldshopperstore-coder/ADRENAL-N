import { supabase } from '@/config/supabase';
import type { Personnel } from '@/types/personnel';

const PERSONNEL_TABLE = 'personnel';

export async function getAllPersonnelFromFirebase(): Promise<Personnel[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from(PERSONNEL_TABLE).select('*');
    if (error) throw error;
    return (data || []) as Personnel[];
  } catch (error) {
    console.error('Personeller �ekilirken hata:', error);
    return [];
  }
}

export async function addPersonnelToFirebase(personnel: Personnel): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from(PERSONNEL_TABLE).upsert([
      {
        id: personnel.id,
        username: personnel.username,
        password: personnel.password,
        fullName: personnel.fullName,
        kasaId: personnel.kasaId,
        role: personnel.role,
        weeklyTargetHours: personnel.weeklyTargetHours ?? 45,
        isActive: personnel.isActive ?? true,
        profileImage: personnel.profileImage || '',
        phone: personnel.phone || '',
        createdAt: personnel.createdAt,
        updatedAt: new Date().toISOString(),
      }
    ], { onConflict: 'id' });

    if (error) {
      console.error('Personel eklenirken Supabase hatası:', error.message, error.details, error.hint, error.code);
      throw error;
    }
    console.log('? Personel Supabase eklendi:', personnel.fullName);
    return true;
  } catch (error: any) {
    console.error('? Personel eklenirken hata:', error?.message || error);
    return false;
  }
}

export async function updatePersonnelInFirebase(personnelId: string, updates: Partial<Personnel>): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from(PERSONNEL_TABLE)
      .update({ ...updates, updatedAt: new Date().toISOString() })
      .eq('id', personnelId);

    if (error) throw error;
    console.log('? Personel g�ncellendi:', personnelId);
    return true;
  } catch (error) {
    console.error('? Personel g�ncellenirken hata:', error);
    return false;
  }
}

export async function deletePersonnelFromFirebase(personnelId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from(PERSONNEL_TABLE).delete().eq('id', personnelId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Personel silinirken hata:', error);
    return false;
  }
}

export async function setPersonnelOnline(personnelId: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase
      .from(PERSONNEL_TABLE)
      .update({ is_online: true, last_seen: new Date().toISOString() })
      .eq('id', personnelId);
  } catch (error) {
    console.error('Online durumu güncellenirken hata:', error);
  }
}

export async function setPersonnelOffline(personnelId: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase
      .from(PERSONNEL_TABLE)
      .update({ is_online: false, last_seen: new Date().toISOString() })
      .eq('id', personnelId);
  } catch (error) {
    console.error('Offline durumu güncellenirken hata:', error);
  }
}

export async function getOnlinePersonnelByKasa(kasaId: string): Promise<{ id: string; fullName: string }[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from(PERSONNEL_TABLE)
      .select('id, fullName')
      .eq('kasaId', kasaId)
      .eq('is_online', true);
    if (error) throw error;
    return (data || []) as { id: string; fullName: string }[];
  } catch (error) {
    console.error('Online personel çekilirken hata:', error);
    return [];
  }
}

/** Supabase'den kullanıcı adı + şifre ile giriş yap (kasa seçimi gerekmez, personelin kasaId'si otomatik bulunur) */
export async function authenticateWithoutKasa(
  username: string,
  password: string
): Promise<Personnel | null> {
  try {
    if (!supabase) throw new Error('Supabase offline');
    const { data, error } = await supabase
      .from(PERSONNEL_TABLE)
      .select('*')
      .ilike('username', username)
      .eq('password', password)
      .eq('isActive', true);

    if (!error && data && data.length > 0) {
      return data[0] as Personnel;
    }
  } catch (err) {
    console.error('Supabase auth hatası:', err);
  }

  // Supabase boş döndü veya hata verdi → localStorage fallback
  const { authenticatePersonnel } = await import('@/utils/personnelDB');
  // Try all kasas
  for (const kid of ['wildpark', 'sinema', 'face2face', 'genel'] as const) {
    const p = authenticatePersonnel(kid, username, password);
    if (p) return p;
  }
  return null;
}

/** Supabase'den kullanıcı adı + şifre ile giriş yap (Supabase → localStorage fallback) */
export async function authenticateFromSupabase(
  kasaId: string,
  username: string,
  password: string
): Promise<Personnel | null> {
  try {
    if (!supabase) throw new Error('Supabase offline');
    let query = supabase
      .from(PERSONNEL_TABLE)
      .select('*')
      .ilike('username', username)
      .eq('password', password);

    if (kasaId === 'genel') {
      query = query.eq('role', 'genel_mudur') as any;
    } else {
      query = query.eq('kasaId', kasaId) as any;
    }

    const { data, error } = await query;

    if (!error && data && data.length > 0) {
      return data[0] as Personnel;
    }
  } catch (err) {
    console.error('Supabase auth hatası:', err);
  }

  // Supabase boş döndü veya hata verdi → localStorage fallback
  const { authenticatePersonnel } = await import('@/utils/personnelDB');
  return authenticatePersonnel(kasaId, username, password);
}

export async function uploadAllPersonnelToFirebase(personnel: Personnel[]): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from(PERSONNEL_TABLE).upsert(
      personnel.map((p) => ({
        id: p.id,
        username: p.username,
        password: p.password,
        fullName: p.fullName,
        kasaId: p.kasaId,
        role: p.role,
        weeklyTargetHours: p.weeklyTargetHours ?? 45,
        isActive: p.isActive ?? true,
        createdAt: p.createdAt,
        updatedAt: new Date().toISOString(),
      })),
      { onConflict: 'id' }
    );

    if (error) throw error;
    console.log(`? ${personnel.length} personel Supabase'e y�klendi`);
    return true;
  } catch (error) {
    console.error('? Personeller y�klenirken hata:', error);
    return false;
  }
}

// ─── Shift (Vardiya) Fonksiyonları ────────────────────────────────────────

export interface DayShift {
  startTime: string;
  endTime: string;
  isOff: boolean;
  leaveType?: 'Yıllık İzin' | 'Hastalık İzni' | 'Mazeret İzni' | 'İzin';
}
export type WeekDays = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type WeekSchedule = Record<WeekDays, DayShift>;

const SHIFT_LS_KEY = (id: string) => `shift_${id}`;

/** Personelin haftalık vardiya planını getir (Supabase → localStorage fallback) */
export async function getPersonnelShift(personnelId: string): Promise<WeekSchedule | null> {
  if (!supabase) {
    const local = localStorage.getItem(SHIFT_LS_KEY(personnelId));
    return local ? (JSON.parse(local) as WeekSchedule) : null;
  }
  try {
    const { data, error } = await supabase
      .from('shifts')
      .select('week_schedule')
      .eq('personnel_id', personnelId)
      .single();
    if (!error && data?.week_schedule) {
      // Supabase'deki güncel hali localStorage'a da yaz
      localStorage.setItem(SHIFT_LS_KEY(personnelId), JSON.stringify(data.week_schedule));
      return data.week_schedule as WeekSchedule;
    }
  } catch { /* ignore, fall through */ }

  // localStorage fallback
  const local = localStorage.getItem(SHIFT_LS_KEY(personnelId));
  return local ? (JSON.parse(local) as WeekSchedule) : null;
}

/** Personelin vardiya planını kaydet (localStorage önce, sonra Supabase) */
export async function savePersonnelShift(
  personnelId: string,
  kasaId: string,
  weekSchedule: WeekSchedule,
  updatedBy: string
): Promise<{ ok: boolean; error?: string }> {
  // Her zaman localStorage'a kaydet
  localStorage.setItem(SHIFT_LS_KEY(personnelId), JSON.stringify(weekSchedule));

  if (!supabase) return { ok: true, error: 'Supabase offline' };

  try {
    const { error } = await supabase.from('shifts').upsert([
      {
        personnel_id: personnelId,
        kasa_id: kasaId,
        week_schedule: weekSchedule,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      }
    ], { onConflict: 'personnel_id' });
    if (error) throw error;
    return { ok: true };
  } catch (err: any) {
    // localStorage'a kaydedildi ama Supabase başarısız
    console.error('Shift Supabase kaydı başarısız:', err);
    return { ok: true, error: `Yerel kaydedildi, Supabase: ${err?.message ?? 'hata'}` };
  }
}

/** Bir kasanın tüm personelinin vardiya planlarını getir */
export async function getKasaShifts(kasaId: string): Promise<{ personnelId: string; weekSchedule: WeekSchedule }[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('shifts')
      .select('personnel_id, week_schedule')
      .eq('kasa_id', kasaId);
    if (error) throw error;
    return (data || []).map((r: any) => ({ personnelId: r.personnel_id, weekSchedule: r.week_schedule }));
  } catch {
    return [];
  }
}
