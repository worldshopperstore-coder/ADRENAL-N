import { uploadAllPackages, getPackagesByKasa } from './packagesDB';
import { uploadAllPersonnelToFirebase, getAllPersonnelFromFirebase } from './personnelSupabaseDB';
import { INITIAL_PACKAGES } from '@/data/packages';
import { DEFAULT_PERSONNEL } from '@/types/personnel';

/**
 * Supabase'in başlatılıp başlatılmadığını kontrol eder
 */
export function isSupabaseInitialized(): boolean {
  return localStorage.getItem('supabaseInitialized') === 'true';
}

/**
 * Tüm kasaların paketlerini ve personellerini Supabase'e yükler
 * Bu fonksiyon sadece İLK KURULUMDA bir kez çalıştırılmalı
 */
export async function initializeSupabaseData() {
  if (isSupabaseInitialized()) {
    console.log('✅ Supabase zaten başlatılmış (supabaseInitialized=true). İşlem atlandı.');
    return;
  }

  console.log('🔥 Supabase verileri yükleniyor...');

  try {
    const kasas = ['wildpark', 'sinema', 'face2face'];
    let allSuccess = true;

    for (const kasa of kasas) {
      console.log(`📦 ${kasa} için paketler yükleniyor...`);
      const existingPackages = await getPackagesByKasa(kasa);
      if (existingPackages.length > 0) {
        console.log(`ℹ️ ${kasa} koleksiyonu zaten dolu (${existingPackages.length} paket). Yeniden yükleme atlandı.`);
      } else {
        const success = await uploadAllPackages(kasa, INITIAL_PACKAGES);
        if (!success) {
          console.error(`❌ ${kasa} paketleri yüklenemedi!`);
          allSuccess = false;
        } else {
          console.log(`✅ ${kasa} paketleri başarıyla yüklendi (${INITIAL_PACKAGES.length} adet)`);
        }
      }
    }

    console.log('👥 Personeller yükleniyor...');
    const existingPersonnel = await getAllPersonnelFromFirebase();
    if (existingPersonnel.length > 0) {
      console.log(`ℹ️ Personel koleksiyonu zaten dolu (${existingPersonnel.length} kayıt). Yeniden yükleme atlandı.`);
    } else {
      const personnelSuccess = await uploadAllPersonnelToFirebase(DEFAULT_PERSONNEL);
      if (!personnelSuccess) {
        console.error('❌ Personeller yüklenemedi!');
        allSuccess = false;
      } else {
        console.log(`✅ ${DEFAULT_PERSONNEL.length} personel başarıyla yüklendi`);
      }
    }

    if (allSuccess) {
      localStorage.setItem('supabaseInitialized', 'true');
      console.log('🎉 Supabase başlatma tamamlandı!');
    } else {
      console.warn('⚠️ Supabase başlatma tamamlanamadı. Bir daha denenebilir');
    }
  } catch (error) {
    console.error('❌ initializeSupabaseData sırasında hata:', error);
    // quota hatasını durdurmak için durumu ayarla ve tekrar tekrar denemeyi sınırlayın
    localStorage.setItem('supabaseInitialized', 'true');
    console.warn('⚠️ Supabase hatası veya başka hata oluştu, tekrar denemeyi azaltmak için supabaseInitialized=true olarak işaretlendi.');
  }
}

/**
 * Supabase başlatma durumunu sıfırlar (geliştirme için)
 */
export function resetSupabaseInitialization() {
  localStorage.removeItem('supabaseInitialized');
  console.log('🔄 Supabase başlatma durumu sıfırlandı');
}
