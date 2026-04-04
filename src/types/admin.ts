// Admin paneli için tip tanımlamaları

export interface PersonnelShift {
  id: string;
  personnelId: string;
  kasaId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  totalHours: number;
  status: 'scheduled' | 'completed' | 'absent' | 'cancelled';
  createdBy: string;
  createdAt: string;
}

export interface WeeklyWorkHours {
  personnelId: string;
  weekStart: string; // YYYY-MM-DD (Pazartesi)
  weekEnd: string; // YYYY-MM-DD (Pazar)
  totalHours: number;
  targetHours: number; // Haftalık hedef saat
  remainingHours: number;
  shifts: PersonnelShift[];
}

export interface SalesPerformance {
  id: string;
  personnelId: string;
  kasaId: string;
  date: string; // YYYY-MM-DD
  totalSales: number; // TL cinsinden toplam satış
  transactionCount: number; // İşlem sayısı
  packagesSold: {
    packageId: string;
    packageName: string;
    quantity: number;
    revenue: number;
  }[];
}

export interface PerformanceReport {
  personnelId: string;
  personnelName: string;
  kasaId: string;
  period: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  totalSales: number;
  transactionCount: number;
  averagePerTransaction: number;
  topPackages: {
    packageName: string;
    quantity: number;
    revenue: number;
  }[];
}

export interface GeneralManagerDashboard {
  totalPersonnel: number;
  activeShifts: number;
  kasaPerformances: {
    kasaId: string;
    kasaName: string;
    todaySales: number;
    weekSales: number;
    monthSales: number;
    activePersonnel: number;
  }[];
  topPerformers: {
    personnelName: string;
    kasaName: string;
    totalSales: number;
    period: string;
  }[];
}

// Genel Müdür rolü
export const GENERAL_MANAGER_ROLE = 'genel_mudur';

// Kasa bilgileri
export const KASA_INFO = {
  wildpark: { name: 'WildPark', title: 'WildPark', color: 'green' },
  sinema: { name: 'XD Sinema', title: 'XD Sinema', color: 'blue' },
  face2face: { name: 'Face2Face', title: 'Face2Face Aquarium', color: 'purple' }
} as const;
