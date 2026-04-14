import { supabase } from '@/config/supabase';

// ── Haftalık Hedef Tipleri ────────────────────────────────

export interface WeeklyTarget {
  kasaId: string;
  weekStart: string;       // ISO date (pazartesi): "2026-04-06"
  targetAmount: number;    // Hedef TL tutarı
  updatedBy?: string;
}

export interface WeeklyTargetProgress {
  kasaId: string;
  weekStart: string;
  targetAmount: number;
  currentAmount: number;   // Mevcut toplam TL
  percentage: number;      // 0-100+
  personnelBreakdown: PersonnelContribution[];
}

export interface PersonnelContribution {
  personnelName: string;
  personnelId: string;
  totalTl: number;
  percentage: number;      // Bu personelin hedefe katkısı %
}

// ── Hafta Yardımcıları ────────────────────────────────────

/** Bu haftanın pazartesi tarihini döndür */
export function getCurrentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Pazartesi
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
}

/** Haftanın pazar tarihini döndür */
export function getWeekEnd(weekStart: string): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Supabase CRUD ─────────────────────────────────────────

const LOCAL_KEY = 'weekly_targets';

function getLocalTargets(): Record<string, WeeklyTarget> {
  try {
    const data = localStorage.getItem(LOCAL_KEY);
    return data ? JSON.parse(data) : {};
  } catch { return {}; }
}

function saveLocalTarget(target: WeeklyTarget) {
  const all = getLocalTargets();
  all[`${target.kasaId}_${target.weekStart}`] = target;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
}

/** Admin: Kasa haftalık hedefi kaydet */
export async function saveWeeklyTarget(target: WeeklyTarget): Promise<void> {
  saveLocalTarget(target);

  if (!supabase) return;
  try {
    await supabase.from('weekly_targets').upsert({
      kasa_id: target.kasaId,
      week_start: target.weekStart,
      target_amount: target.targetAmount,
      updated_by: target.updatedBy || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'kasa_id,week_start' });
  } catch (e) {
    console.warn('[WeeklyTargets] Supabase kayıt hatası:', e);
  }
}

/** Belirli kasa + hafta hedefini getir */
export async function getWeeklyTarget(kasaId: string, weekStart?: string): Promise<WeeklyTarget | null> {
  const week = weekStart || getCurrentWeekStart();

  if (supabase) {
    try {
      const { data } = await supabase
        .from('weekly_targets')
        .select('*')
        .eq('kasa_id', kasaId)
        .eq('week_start', week)
        .single();

      if (data) {
        const target: WeeklyTarget = {
          kasaId: data.kasa_id,
          weekStart: data.week_start,
          targetAmount: data.target_amount,
          updatedBy: data.updated_by,
        };
        saveLocalTarget(target);
        return target;
      }
    } catch { /* fallback to local */ }
  }

  // Local fallback
  const local = getLocalTargets();
  return local[`${kasaId}_${week}`] || null;
}

/** Belirli kasa + hafta için toplam haftalık ciroyu ve personel katkılarını hesapla */
export async function getWeeklyProgress(kasaId: string, weekStart?: string): Promise<{ totalTl: number; personnelBreakdown: PersonnelContribution[] } | null> {
  const week = weekStart || getCurrentWeekStart();
  const weekEnd = getWeekEnd(week);

  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('kasaId', kasaId)
      .gte('date', week)
      .lte('date', weekEnd);

    if (error) throw error;
    if (!data || data.length === 0) return { totalTl: 0, personnelBreakdown: [] };

    // Kur bilgisi
    let usdRate = 35, eurRate = 38;
    try {
      const r = JSON.parse(localStorage.getItem('exchange_rates') || '{}');
      usdRate = Number(r.usd) || 35;
      eurRate = Number(r.eur) || 38;
    } catch { /* default */ }

    let totalTl = 0;
    const personnelMap: Record<string, { name: string; totalTl: number }> = {};

    for (const row of data) {
      const salesArr: any[] = row.sales || [];
      for (const s of salesArr) {
        if (s.isRefund) continue;
        const tl = (s.kkTl || 0) + (s.cashTl || 0) + (s.cashUsd || 0) * usdRate + (s.cashEur || 0) * eurRate;
        totalTl += tl;

        const pId = s.personnelId || 'unknown';
        const pName = s.personnelName || 'Bilinmeyen';
        if (!personnelMap[pId]) personnelMap[pId] = { name: pName, totalTl: 0 };
        personnelMap[pId].totalTl += tl;
      }
    }

    const personnelBreakdown: PersonnelContribution[] = Object.entries(personnelMap)
      .map(([id, d]) => ({
        personnelId: id,
        personnelName: d.name,
        totalTl: d.totalTl,
        percentage: totalTl > 0 ? (d.totalTl / totalTl) * 100 : 0,
      }))
      .sort((a, b) => b.totalTl - a.totalTl);

    return { totalTl, personnelBreakdown };
  } catch (e) {
    console.warn('[WeeklyTargets] Progress hesaplama hatası:', e);
    return null;
  }
}

/** Tüm kasaların bu haftaki hedeflerini getir */
export async function getAllWeeklyTargets(weekStart?: string): Promise<WeeklyTarget[]> {
  const week = weekStart || getCurrentWeekStart();

  if (supabase) {
    try {
      const { data } = await supabase
        .from('weekly_targets')
        .select('*')
        .eq('week_start', week);

      if (data && data.length > 0) {
        return data.map((d: any) => ({
          kasaId: d.kasa_id,
          weekStart: d.week_start,
          targetAmount: d.target_amount,
          updatedBy: d.updated_by,
        }));
      }
    } catch { /* fallback */ }
  }

  const local = getLocalTargets();
  return Object.values(local).filter(t => t.weekStart === week);
}
