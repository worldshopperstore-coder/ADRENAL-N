import { supabase } from '@/config/supabase';

export interface DatedSale {
  id: string;
  packageName: string;
  category?: string;
  adultQty: number;
  childQty: number;
  currency: string;
  paymentType: string;
  total: number;
  kkTl: number;
  cashTl: number;
  cashUsd: number;
  cashEur: number;
  timestamp: string;
  isCrossSale?: boolean;
  isRefund?: boolean;
  refundOfSaleId?: string;
  refundReason?: string;
  kkRefundTxId?: string;
  personnelId?: string;
  personnelName?: string;
  // derived
  date: string;
  kasaId: string;
}

/**
 * Belirtilen tarih aralığındaki tüm kasaların satışlarını getirir.
 * Supabase 'sales' tablosu: kasaId, date, sales (JSONB array), updatedAt
 */
export async function getAllSalesForDateRange(
  startDate: string,
  endDate: string
): Promise<DatedSale[]> {
  try {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (error) throw error;

    const result: DatedSale[] = [];
    for (const row of data || []) {
      const kasaId: string = row.kasaId ?? row.kasaid ?? '';
      const salesArr: any[] = row.sales || [];
      for (const s of salesArr) {
        result.push({ ...s, date: row.date, kasaId });
      }
    }
    return result;
  } catch (err) {
    console.error('Performans verisi çekilirken hata:', err);
    return [];
  }
}

/**
 * Belirtilen tarih aralığındaki tüm çapraz satışları getirir.
 * Supabase 'cross_sales' tablosu: kasaId, date, crossSales (JSONB array)
 */
export async function getAllCrossSalesForDateRange(
  startDate: string,
  endDate: string
): Promise<DatedSale[]> {
  try {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('cross_sales')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (error) throw error;

    const result: DatedSale[] = [];
    for (const row of data || []) {
      const kasaId: string = row.kasaId ?? row.kasaid ?? '';
      // PostgreSQL lowercase: crossSales → crosssales
      const csArr: any[] = row.crossSales ?? row.crosssales ?? [];
      for (const s of csArr) {
        result.push({ ...s, date: row.date, kasaId, isCrossSale: true });
      }
    }
    return result;
  } catch (err) {
    console.error('Çapraz satış verisi çekilirken hata:', err);
    return [];
  }
}

/**
 * Tüm personellerin vardiya planlarını getirir.
 * Supabase 'shifts' tablosu: personnel_id (PK), week_schedule (JSONB)
 * Döner: { [personnelId]: weekSchedule }
 */
export async function getShiftsAll(): Promise<Record<string, any>> {
  try {
    if (!supabase) return {};
    const { data, error } = await supabase
      .from('shifts')
      .select('personnel_id, week_schedule');

    if (error) throw error;

    const result: Record<string, any> = {};
    for (const row of data || []) {
      if (row.personnel_id) {
        result[row.personnel_id] = row.week_schedule;
      }
    }
    return result;
  } catch {
    return {};
  }
}
