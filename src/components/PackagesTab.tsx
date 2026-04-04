import { useState, useEffect } from 'react';
import { INITIAL_PACKAGES, type PackageItem as Package } from '@/data/packages';
import { getPackagesByKasa } from '@/utils/packagesDB';
import { getKasaId } from '@/utils/session';
import { Package as PackageIcon, Tag, Globe, ArrowLeftRight, Shuffle, Building2 } from 'lucide-react';

const CATEGORIES = ['Münferit', 'Visitor', 'Çapraz Münferit', 'Çapraz Visitor', 'Acenta'] as const;

const CATEGORY_STYLE: Record<string, { icon: typeof Tag; color: string; bg: string; border: string; ring: string; badge: string }> = {
  'Münferit': { icon: Tag, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', ring: 'ring-emerald-500/10', badge: 'from-emerald-500 to-emerald-600' },
  'Visitor': { icon: Globe, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30', ring: 'ring-sky-500/10', badge: 'from-sky-500 to-sky-600' },
  'Çapraz Münferit': { icon: ArrowLeftRight, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', ring: 'ring-orange-500/10', badge: 'from-orange-500 to-orange-600' },
  'Çapraz Visitor': { icon: Shuffle, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30', ring: 'ring-rose-500/10', badge: 'from-rose-500 to-rose-600' },
  'Acenta': { icon: Building2, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30', ring: 'ring-violet-500/10', badge: 'from-violet-500 to-violet-600' },
};

export default function PackagesTab() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPackageCategory, setSelectedPackageCategory] = useState<(typeof CATEGORIES)[number]>('Münferit');

  useEffect(() => {
    const kasaId = getKasaId();
    if (!kasaId) {
      setPackages(INITIAL_PACKAGES.filter(p => p.kasaId === 'sinema'));
      setLoading(false);
      return;
    }
    getPackagesByKasa(kasaId).then((pkgs) => {
      setPackages(pkgs.length > 0 ? pkgs : INITIAL_PACKAGES.filter(p => p.kasaId === kasaId));
      setLoading(false);
    });
  }, []);

  const renderCategoryTable = (category: string) => {
    const categoryPackages = packages.filter((p) => p.category === category);
    if (categoryPackages.length === 0) return null;

    const tlPackages = categoryPackages.filter((p) => p.currency === 'TL');
    const usdPackages = categoryPackages.filter((p) => p.currency === 'USD');
    const eurPackages = categoryPackages.filter((p) => p.currency === 'EUR');

    const renderTable = (pkgs: Package[], symbol: string, header: string) => {
      if (pkgs.length === 0) return null;
      const headerColor = header === 'TL' ? 'text-blue-400' : header === 'USD' ? 'text-amber-400' : 'text-violet-400';
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-900/80">
                <th className={`px-3 py-2.5 text-left ${headerColor} font-bold border border-gray-700/50`}>{header}</th>
                <th className="px-3 py-2.5 text-center text-gray-300 font-bold border border-gray-700/50">Yetişkin</th>
                <th className="px-3 py-2.5 text-center text-gray-300 font-bold border border-gray-700/50">Çocuk</th>
              </tr>
            </thead>
            <tbody>
              {pkgs.map((pkg) => (
                <tr key={pkg.id} className="border border-gray-700/50 hover:bg-gray-800/40 transition-colors">
                  <td className="px-3 py-2 border border-gray-700/50 text-white font-medium">{pkg.name}</td>
                  <td className="px-3 py-2 border border-gray-700/50 text-center text-white font-semibold">
                    {symbol}{pkg.adultPrice.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 border border-gray-700/50 text-center text-white font-semibold">
                    {symbol}{pkg.childPrice.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    const style = CATEGORY_STYLE[category] || CATEGORY_STYLE['Münferit'];
    const IconComp = style.icon;
    return (
      <div key={category} className="mb-6">
        <div className={`flex items-center gap-3 mb-3 pb-2 border-b ${style.border}`}>
          <span className={`w-8 h-8 bg-gradient-to-br ${style.badge} rounded-lg flex items-center justify-center shadow-md`}>
            <IconComp className="w-4 h-4 text-white" />
          </span>
          <h2 className="text-lg font-black text-white">{category}</h2>
          <span className={`text-xs ${style.color} font-medium`}>{categoryPackages.length} paket</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {renderTable(tlPackages, '₺', 'TL')}
          {renderTable(usdPackages, '$', 'USD')}
          {renderTable(eurPackages, '€', 'EUR')}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/25">
            <PackageIcon className="w-5 h-5 text-white" />
          </span>
          <div>
            <h1 className="text-2xl font-black text-white">Paket Listesi</h1>
            <p className="text-xs text-gray-400 font-medium">Toplam <span className="text-white font-bold">{packages.length}</span> paket</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Paketler yükleniyor...</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {CATEGORIES.map((category) => {
              const style = CATEGORY_STYLE[category];
              const IconComp = style.icon;
              const isActive = selectedPackageCategory === category;
              return (
                <button
                  key={category}
                  onClick={() => setSelectedPackageCategory(category)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? `bg-gradient-to-r ${style.badge} text-white shadow-lg`
                      : `${style.bg} ${style.color} ${style.border} border ring-1 ${style.ring} hover:brightness-125`
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  {category}
                </button>
              );
            })}
          </div>

          {renderCategoryTable(selectedPackageCategory)}
        </>
      )}
    </div>
  );
}
