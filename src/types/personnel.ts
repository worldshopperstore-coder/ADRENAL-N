export interface Personnel {
  id: string;
  username: string;
  password: string;
  fullName: string;
  phone?: string;
  profileImage?: string; // base64 data URL or empty
  kasaId: 'wildpark' | 'sinema' | 'face2face' | 'genel'; // genel = Genel Müdür
  role: 'personel' | 'genel_mudur';
  weeklyTargetHours?: number; // Haftalık hedef çalışma saati (default: 45)
  isActive: boolean; // Aktif/Pasif durum
  createdAt: string;
  updatedAt?: string;
}

export const DEFAULT_PERSONNEL: Personnel[] = [
  // Genel Müdür
  {
    id: 'gm1',
    username: 'genel.mudur',
    password: 'admin123',
    fullName: 'Emre OZAN (Genel Müdür)',
    kasaId: 'genel',
    role: 'genel_mudur',
    weeklyTargetHours: 0,
    isActive: true,
    createdAt: new Date().toISOString()
  },

  // WildPark Personeli
  {
    id: 'wp1',
    username: 'ahmet.yilmaz',
    password: '1234',
    fullName: 'Ahmet Yılmaz',
    kasaId: 'wildpark',
    role: 'personel',
    weeklyTargetHours: 45,
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'wp2',
    username: 'ayse.kaya',
    password: '1234',
    fullName: 'Ayşe Kaya',
    kasaId: 'wildpark',
    role: 'personel',
    weeklyTargetHours: 45,
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'wp3',
    username: 'yusuf.celebi',
    password: '1234',
    fullName: 'Yusuf Çelebi',
    kasaId: 'wildpark',
    role: 'personel',
    weeklyTargetHours: 45,
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'wp4',
    username: 'fatma.yildiz',
    password: '1234',
    fullName: 'Fatma Yıldız',
    kasaId: 'wildpark',
    role: 'personel',
    weeklyTargetHours: 45,
    isActive: true,
    createdAt: new Date().toISOString()
  },

  // Sinema Personeli
  {
    id: 'sn1',
    username: 'ali.celik',
    password: '1234',
    fullName: 'Ali Çelik',
    kasaId: 'sinema',
    role: 'personel',
    weeklyTargetHours: 45,
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sn2',
    username: 'zeynep.arslan',
    password: '1234',
    fullName: 'Zeynep Arslan',
    kasaId: 'sinema',
    role: 'personel',
    weeklyTargetHours: 45,
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sn3',
    username: 'mustafa.ozturk',
    password: '1234',
    fullName: 'Mustafa Öztürk',
    kasaId: 'sinema',
    role: 'personel',
    weeklyTargetHours: 45,
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sn4',
    username: 'elif.sahin',
    password: '1234',
    fullName: 'Elif Şahin',
    kasaId: 'sinema',
    role: 'personel',
    weeklyTargetHours: 45,
    isActive: true,
    createdAt: new Date().toISOString()
  },

  // Face 2 Face Personeli
  {
    id: 'f2f1',
    username: 'emre.koc',
    password: '1234',
    fullName: 'Emre Koç',
    kasaId: 'face2face',
    role: 'personel',
    weeklyTargetHours: 45,
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'f2f2',
    username: 'selin.aydin',
    password: '1234',
    fullName: 'Selin Aydın',
    kasaId: 'face2face',
    role: 'personel',
    weeklyTargetHours: 45,
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'f2f3',
    username: 'burak.yildirim',
    password: '1234',
    fullName: 'Burak Yıldırım',
    kasaId: 'face2face',
    role: 'personel',
    weeklyTargetHours: 45,
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'f2f4',
    username: 'deniz.akman',
    password: '1234',
    fullName: 'Deniz Akman',
    kasaId: 'face2face',
    role: 'personel',
    weeklyTargetHours: 45,
    isActive: true,
    createdAt: new Date().toISOString()
  }
];
