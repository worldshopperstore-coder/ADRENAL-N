import { supabase } from '@/config/supabase';

/** Yerel tarih string'i (YYYY-MM-DD) — UTC kaymasını önler */
function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export interface AttendanceRecord {
  id: string;
  personnel_id: string;
  personnel_name: string;
  kasa_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: 'pending' | 'checked_in' | 'checkout_pending' | 'checked_out';
  session_token: string;
  checkout_token?: string;
}

/** Benzersiz yoklama token'ı oluştur */
export function generateSessionToken(personnelId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `ATT-${personnelId}-${timestamp}-${random}`;
}

/** Yoklama kaydı oluştur (PC login sonrası) — checked_in/checked_out varsa ezme */
export async function createAttendanceSession(
  personnelId: string,
  personnelName: string,
  kasaId: string,
  sessionToken: string
): Promise<boolean> {
  if (!supabase) return false;
  const today = localDateStr();
  const rowId = `${personnelId}_${today}`;

  // Mevcut kaydı kontrol et — zaten giriş/çıkış yapılmışsa dokunma
  const { data: existing } = await supabase
    .from('attendance')
    .select('id, status, session_token')
    .eq('id', rowId)
    .single();

  if (existing) {
    // Herhangi bir kayıt varsa (pending/checked_in/checked_out) dokunma
    // Mevcut token & statü korunsun — çakışma önlenir
    return true;
  }

  const { error } = await supabase.from('attendance').insert([{
    id: rowId,
    personnel_id: personnelId,
    personnel_name: personnelName,
    kasa_id: kasaId,
    date: today,
    status: 'pending',
    session_token: sessionToken,
    check_in: null,
    check_out: null,
  }]);

  if (error) {
    console.error('Yoklama kaydı oluşturulamadı:', error.message);
    return false;
  }
  return true;
}

/** Yoklama durumunu kontrol et (PC polling) */
export async function checkAttendanceStatus(personnelId: string): Promise<AttendanceRecord | null> {
  if (!supabase) return null;
  const today = localDateStr();
  
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('id', `${personnelId}_${today}`)
    .single();

  if (error || !data) return null;
  return data as AttendanceRecord;
}

/** Yoklama onayla (telefon PWA'dan çağrılır) */
export async function confirmAttendance(sessionToken: string): Promise<{ success: boolean; message: string; personnelName?: string }> {
  if (!supabase) return { success: false, message: 'Bağlantı hatası' };

  // Token ile kaydı bul
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('session_token', sessionToken)
    .eq('status', 'pending')
    .single();

  if (error || !data) {
    return { success: false, message: 'Geçersiz veya süresi dolmuş QR kod' };
  }

  // Giriş kaydı yap
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('attendance')
    .update({
      status: 'checked_in',
      check_in: now,
    })
    .eq('id', data.id);

  if (updateError) {
    return { success: false, message: 'Kayıt güncellenemedi' };
  }

  return { success: true, message: 'Yoklama onaylandı!', personnelName: data.personnel_name };
}

/** Çıkış kaydı */
export async function checkOutAttendance(personnelId: string): Promise<boolean> {
  if (!supabase) return false;
  const today = localDateStr();
  
  const { error } = await supabase
    .from('attendance')
    .update({
      status: 'checked_out',
      check_out: new Date().toISOString(),
    })
    .eq('id', `${personnelId}_${today}`)
    .eq('status', 'checked_in');

  return !error;
}

/** Admin: Personel yoklama geçmişi */
export async function getPersonnelAttendance(personnelId: string, startDate?: string, endDate?: string): Promise<AttendanceRecord[]> {
  if (!supabase) return [];
  
  let query = supabase
    .from('attendance')
    .select('*')
    .eq('personnel_id', personnelId)
    .order('date', { ascending: false });

  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);

  const { data } = await query;
  return (data || []) as AttendanceRecord[];
}

/** Admin: Tüm personelin bugünkü yoklama durumu */
export async function getTodayAttendance(): Promise<AttendanceRecord[]> {
  if (!supabase) return [];
  const today = localDateStr();
  
  const { data } = await supabase
    .from('attendance')
    .select('*')
    .eq('date', today)
    .order('check_in', { ascending: true });

  return (data || []) as AttendanceRecord[];
}

/** Çıkış talebi oluştur (telefondan) — PC'de QR gösterecek */
export async function requestCheckout(personnelId: string): Promise<{ success: boolean; checkoutToken?: string }> {
  if (!supabase) return { success: false };
  const today = localDateStr();
  const token = generateSessionToken(personnelId).replace('ATT-', 'OUT-');

  const { error } = await supabase
    .from('attendance')
    .update({ status: 'checkout_pending', checkout_token: token })
    .eq('id', `${personnelId}_${today}`)
    .eq('status', 'checked_in');

  if (error) return { success: false };
  return { success: true, checkoutToken: token };
}

/** Çıkış talebini iptal et */
export async function cancelCheckoutRequest(personnelId: string): Promise<boolean> {
  if (!supabase) return false;
  const today = localDateStr();

  const { error } = await supabase
    .from('attendance')
    .update({ status: 'checked_in', checkout_token: null })
    .eq('id', `${personnelId}_${today}`)
    .eq('status', 'checkout_pending');

  return !error;
}

/** Bu kasada checkout bekleyen personel var mı? (PC polling) */
export async function getCheckoutRequests(kasaId: string): Promise<AttendanceRecord[]> {
  if (!supabase) { console.log('[getCheckoutRequests] supabase null'); return []; }
  const today = localDateStr();

  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('kasa_id', kasaId)
    .eq('date', today)
    .eq('status', 'checkout_pending');

  if (error) console.error('[getCheckoutRequests] Error:', error.message, error);
  console.log('[getCheckoutRequests] kasaId:', kasaId, 'date:', today, 'results:', data?.length, data);
  return (data || []) as AttendanceRecord[];
}

/** Çıkış QR onaylandı (telefondan okutulunca) */
export async function confirmCheckout(checkoutToken: string): Promise<{ success: boolean; message: string; personnelName?: string }> {
  if (!supabase) return { success: false, message: 'Bağlantı hatası' };

  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('checkout_token', checkoutToken)
    .eq('status', 'checkout_pending')
    .single();

  if (error || !data) {
    return { success: false, message: 'Geçersiz veya süresi dolmuş çıkış QR kodu' };
  }

  const { error: updateError } = await supabase
    .from('attendance')
    .update({ status: 'checked_out', check_out: new Date().toISOString(), checkout_token: null })
    .eq('id', data.id);

  if (updateError) return { success: false, message: 'Çıkış kaydedilemedi' };
  return { success: true, message: 'Çıkış onaylandı!', personnelName: data.personnel_name };
}
