import { supabase } from '@/config/supabase';
import type { PackageItem } from '@/data/packages';

const PACKAGES_TABLE = 'packages';

export async function getPackagesByKasa(kasaId: string): Promise<PackageItem[]> {
  try {
    const { data, error } = await supabase
      .from(PACKAGES_TABLE)
      .select('*')
      .eq('kasaId', kasaId)
      .order('name', { ascending: true });

    if (error) throw error;
    return (data || []) as PackageItem[];
  } catch (error) {
    console.error('Paketler �ekilirken hata:', error);
    return [];
  }
}

export async function addPackage(kasaId: string, packageData: PackageItem): Promise<boolean> {
  try {
    const { error } = await supabase.from(PACKAGES_TABLE).insert([{
      id: packageData.id,
      kasaId,
      name: packageData.name,
      category: packageData.category,
      adultPrice: packageData.adultPrice,
      childPrice: packageData.childPrice,
      currency: packageData.currency,
      pruvaAdultShare: packageData.pruvaAdultShare ?? null,
      pruvaChildShare: packageData.pruvaChildShare ?? null,
    }]);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Paket eklenirken hata:', error);
    return false;
  }
}

export async function updatePackage(kasaId: string, packageId: string, updates: Partial<PackageItem>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(PACKAGES_TABLE)
      .update({ ...updates })
      .match({ id: packageId, kasaId });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Paket g�ncellenirken hata:', error);
    return false;
  }
}

export async function deletePackage(kasaId: string, packageId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(PACKAGES_TABLE)
      .delete()
      .match({ id: packageId, kasaId });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Paket silinirken hata:', error);
    return false;
  }
}

export async function uploadAllPackages(kasaId: string, packages: PackageItem[]): Promise<boolean> {
  try {
    const packageRows = packages.map((pkg) => ({
      id: pkg.id,
      kasaId,
      name: pkg.name,
      category: pkg.category,
      adultPrice: pkg.adultPrice,
      childPrice: pkg.childPrice,
      currency: pkg.currency,
      pruvaAdultShare: pkg.pruvaAdultShare ?? null,
      pruvaChildShare: pkg.pruvaChildShare ?? null,
    }));

    const { error } = await supabase.from(PACKAGES_TABLE).upsert(packageRows, { onConflict: 'id' });
    if (error) throw error;
    console.log(`${kasaId} i�in ${packages.length} paket y�klendi`);
    return true;
  } catch (error) {
    console.error('Paketler y�klenirken hata:', error);
    return false;
  }
}
