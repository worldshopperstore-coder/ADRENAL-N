import { supabase } from '@/config/supabase';

export type LeaveType = 'yillik' | 'hastalik' | 'mazeret' | 'ucretsiz';

export interface LeaveRecord {
  id: string;
  personnel_id: string;
  personnel_name: string;
  kasa_id: string;
  start_date: string;   // YYYY-MM-DD
  end_date: string;      // YYYY-MM-DD
  leave_type: LeaveType;
  note: string;
  created_at: string;
  created_by: string;
}

export const LEAVE_LABELS: Record<LeaveType, string> = {
  yillik: 'Yıllık İzin',
  hastalik: 'Hastalık İzni',
  mazeret: 'Mazeret İzni',
  ucretsiz: 'Ücretsiz İzin',
};

export const LEAVE_COLORS: Record<LeaveType, { text: string; bg: string; border: string }> = {
  yillik:   { text: 'text-blue-400',   bg: 'bg-blue-500/15',   border: 'border-blue-500/30' },
  hastalik: { text: 'text-red-400',    bg: 'bg-red-500/15',    border: 'border-red-500/30' },
  mazeret:  { text: 'text-yellow-400', bg: 'bg-yellow-500/15', border: 'border-yellow-500/30' },
  ucretsiz: { text: 'text-gray-400',   bg: 'bg-gray-500/15',   border: 'border-gray-500/30' },
};

/** İzin kaydı oluştur */
export async function createLeave(leave: Omit<LeaveRecord, 'id' | 'created_at'>): Promise<boolean> {
  if (!supabase) return false;
  const id = `${leave.personnel_id}_${leave.start_date}_${Date.now()}`;
  const { error } = await supabase.from('leaves').insert([{
    ...leave,
    id,
    created_at: new Date().toISOString(),
  }]);
  return !error;
}

/** İzin kaydı sil */
export async function deleteLeave(leaveId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('leaves').delete().eq('id', leaveId);
  return !error;
}

/** Personelin tüm izinlerini getir */
export async function getPersonnelLeaves(personnelId: string, startDate?: string, endDate?: string): Promise<LeaveRecord[]> {
  if (!supabase) return [];
  let query = supabase
    .from('leaves')
    .select('*')
    .eq('personnel_id', personnelId)
    .order('start_date', { ascending: false });

  // Overlap: start_date <= rangeEnd AND end_date >= rangeStart
  if (endDate) query = query.lte('start_date', endDate);
  if (startDate) query = query.gte('end_date', startDate);

  const { data } = await query;
  return (data || []) as LeaveRecord[];
}

/** Belirli bir tarih aralığında izinli gün sayısını hesapla */
export function countLeaveDays(leaves: LeaveRecord[], rangeStart: string, rangeEnd: string): number {
  let total = 0;
  const rStart = new Date(rangeStart + 'T00:00:00');
  const rEnd = new Date(rangeEnd + 'T00:00:00');
  for (const l of leaves) {
    const lStart = new Date(l.start_date + 'T00:00:00');
    const lEnd = new Date(l.end_date + 'T00:00:00');
    const effStart = lStart < rStart ? rStart : lStart;
    const effEnd = lEnd > rEnd ? rEnd : lEnd;
    if (effStart <= effEnd) {
      total += Math.round((effEnd.getTime() - effStart.getTime()) / 86400000) + 1;
    }
  }
  return total;
}

/** Belirli bir tarih izinli mi? */
export function isDateOnLeave(leaves: LeaveRecord[], dateStr: string): LeaveRecord | null {
  for (const l of leaves) {
    if (dateStr >= l.start_date && dateStr <= l.end_date) return l;
  }
  return null;
}
