export interface KasaAdvances {
  tlAdvance: number;
  usdAdvance: number;
  eurAdvance: number;
}

export interface PackagePrice {
  id: string;
  name: string;
  adultPrice: number;
  childPrice: number;
  enabled: boolean;
}

export interface KasaSettings {
  kasaId: 'wildpark' | 'sinema' | 'face2face';
  advances: KasaAdvances;
  packages: PackagePrice[];
  lastUpdated: string;
  updatedBy?: string;
}

export const DEFAULT_KASA_SETTINGS: Record<string, KasaSettings> = {
  wildpark: {
    kasaId: 'wildpark',
    advances: {
      tlAdvance: 2000,
      usdAdvance: 500,
      eurAdvance: 500
    },
    packages: [
      { id: 'wp1', name: 'WildPark Giriş', adultPrice: 150, childPrice: 100, enabled: true },
      { id: 'wp2', name: 'WildPark VIP', adultPrice: 250, childPrice: 180, enabled: true },
      { id: 'wp3', name: 'WildPark + Akvaryum', adultPrice: 200, childPrice: 140, enabled: true },
      { id: 'wp4', name: 'WildPark Aile Paketi', adultPrice: 500, childPrice: 350, enabled: true }
    ],
    lastUpdated: new Date().toISOString()
  },
  sinema: {
    kasaId: 'sinema',
    advances: {
      tlAdvance: 1000,
      usdAdvance: 300,
      eurAdvance: 300
    },
    packages: [
      { id: 'sn1', name: 'XD Sinema', adultPrice: 100, childPrice: 75, enabled: true },
      { id: 'sn2', name: 'XD Sinema + Popcorn', adultPrice: 150, childPrice: 120, enabled: true },
      { id: 'sn3', name: 'Akvaryum + Sinema', adultPrice: 180, childPrice: 130, enabled: true },
      { id: 'sn4', name: 'Kombo Paket', adultPrice: 250, childPrice: 180, enabled: true }
    ],
    lastUpdated: new Date().toISOString()
  },
  face2face: {
    kasaId: 'face2face',
    advances: {
      tlAdvance: 1500,
      usdAdvance: 400,
      eurAdvance: 400
    },
    packages: [
      { id: 'f2f1', name: 'Face 2 Face Standart', adultPrice: 120, childPrice: 90, enabled: true },
      { id: 'f2f2', name: 'Face 2 Face Premium', adultPrice: 200, childPrice: 150, enabled: true },
      { id: 'f2f3', name: 'F2F + Akvaryum', adultPrice: 180, childPrice: 130, enabled: true },
      { id: 'f2f4', name: 'Tüm Aktiviteler', adultPrice: 350, childPrice: 250, enabled: true }
    ],
    lastUpdated: new Date().toISOString()
  }
};
