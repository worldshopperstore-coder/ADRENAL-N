import { useState, useEffect, useCallback } from 'react';
import {
  Package, Plus, Trash2, Edit2, Save, X, ArrowLeft, ChevronDown, ChevronRight,
  TreePine, Monitor, Users2, Zap, DollarSign,
} from 'lucide-react';
import {
  getPackagesByKasa,
  addPackage,
  updatePackage,
  deletePackage,
} from '@/utils/packagesDB';
import { INITIAL_PACKAGES, type PackageItem } from '@/data/packages';
import { createContract, updateContractPrice, type CreateContractRequest } from '@/utils/posBridge';
import { getPersonnelUsername } from '@/utils/session';
import { isIntegrationEnabled } from '@/utils/posManager';

type KasaId = 'wildpark' | 'sinema' | 'face2face';
type Category = 'Münferit' | 'Visitor' | 'Çapraz Münferit' | 'Çapraz Visitor' | 'Acenta';
type Currency = 'TL' | 'USD' | 'EUR';

const KASAS = [
  { id: 'wildpark'  as KasaId, name: 'WildPark',   Icon: TreePine, text: 'text-emerald-400', bg: 'bg-emerald-500/10', borderAccent: 'border-emerald-500/20' },
  { id: 'sinema'    as KasaId, name: 'XD Sinema',   Icon: Monitor,  text: 'text-violet-400',  bg: 'bg-violet-500/10',  borderAccent: 'border-violet-500/20'  },
  { id: 'face2face' as KasaId, name: 'Face2Face',   Icon: Users2,   text: 'text-sky-400',     bg: 'bg-sky-500/10',     borderAccent: 'border-sky-500/20'     },
];

const CATEGORIES: Category[] = ['Münferit', 'Visitor', 'Çapraz Münferit', 'Çapraz Visitor', 'Acenta'];
const CURRENCIES: Currency[] = ['TL', 'USD', 'EUR'];

const CUR_SYMBOL: Record<Currency, string> = { TL: '₺', USD: '$', EUR: '€' };
const CUR_COLOR:  Record<Currency, string> = {
  TL:  'text-green-400 bg-green-500/10 border border-green-500/20',
  USD: 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20',
  EUR: 'text-orange-400 bg-orange-500/10 border border-orange-500/20',
};

const CAT_COLOR: Record<Category, { dot: string; badge: string; border: string }> = {
  'Münferit':         { dot: 'bg-blue-500',    badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',    border: 'border-l-blue-500'   },
  'Visitor':           { dot: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', border: 'border-l-emerald-500' },
  'Çapraz Münferit':   { dot: 'bg-orange-500', badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30', border: 'border-l-orange-500'  },
  'Çapraz Visitor':    { dot: 'bg-amber-500',  badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',   border: 'border-l-amber-500'   },
  'Acenta':            { dot: 'bg-purple-500', badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30', border: 'border-l-purple-500'  },
};

const emptyForm = (kasaId: KasaId): Omit<PackageItem, 'id'> & { kasaId: KasaId } => ({
  kasaId,
  name: '',
  category: 'Münferit',
  adultPrice: 0,
  childPrice: 0,
  currency: 'TL',
});

// Kasa → Atlantis ContractGroupId (münferit için)
const KASA_GROUP: Record<KasaId, number> = {
  wildpark:  5,
  sinema:    11,
  face2face: 1,
};

// Kasa → varsayılan ürün
const KASA_PRODUCT: Record<KasaId, 1004 | 1005 | 1008> = {
  wildpark:  1004,
  sinema:    1005,
  face2face: 1008,
};

const PRODUCT_LABELS: Record<number, string> = {
  1004: 'WildPark Entrance',
  1005: 'Cinema Entrance',
  1008: 'Face2Face Entrance',
};

interface ContractForm {
  name: string;
  currency: Currency;
  startDate: string;
  endDate: string;
  category: Category;
  // Ürünler: her biri seçili mi + fiyatları
  products: {
    productId: 1004 | 1005 | 1008;
    selected: boolean;
    adultPrice: string;
    childPrice: string;
  }[];
}

const emptyContractForm = (kasaId: KasaId): ContractForm => {
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  return {
    name: '',
    currency: 'TL',
    startDate: today,
    endDate: nextMonth,
    category: 'Münferit',
    products: [
      { productId: 1004, selected: kasaId === 'wildpark', adultPrice: '0', childPrice: '0' },
      { productId: 1005, selected: kasaId === 'sinema',   adultPrice: '0', childPrice: '0' },
      { productId: 1008, selected: kasaId === 'face2face', adultPrice: '0', childPrice: '0' },
    ],
  };
};

export default function PackagesAdminTab() {
  const [selectedKasa, setSelectedKasa] = useState<KasaId | null>(null);
  const [packages, setPackages]         = useState<PackageItem[]>([]);
  const [loading, setLoading]           = useState(false);

  const [isDefault, setIsDefault]       = useState(false);
  const [seeding, setSeeding]           = useState(false);

  const [editingPkg, setEditingPkg]     = useState<PackageItem | null>(null);
  const [addingCat, setAddingCat]       = useState<Category | null>(null);
  const [form, setForm]                 = useState<ReturnType<typeof emptyForm> | null>(null);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PackageItem | null>(null);

  const [openCats, setOpenCats]         = useState<Record<string, boolean>>(
    Object.fromEntries(CATEGORIES.map(c => [c, true]))
  );

  // Kontrat oluşturma
  const [showContractForm, setShowContractForm] = useState(false);
  const [contractForm, setContractForm] = useState<ContractForm | null>(null);
  const [contractSaving, setContractSaving] = useState(false);
  const [contractError, setContractError] = useState('');
  const [contractSuccess, setContractSuccess] = useState('');

  // Fiyat güncelleme
  const [priceEditPkg, setPriceEditPkg] = useState<PackageItem | null>(null);
  const [newAdultPrice, setNewAdultPrice] = useState('');
  const [newChildPrice, setNewChildPrice] = useState('');
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceError, setPriceError] = useState('');

  const integrationActive = isIntegrationEnabled();

  const load = useCallback(async (kasaId: KasaId) => {
    setLoading(true);
    const pkgs = await getPackagesByKasa(kasaId);
    if (pkgs.length > 0) {
      setPackages(pkgs);
      setIsDefault(false);
    } else {
      setPackages(INITIAL_PACKAGES.filter(p => p.kasaId === kasaId));
      setIsDefault(true);
    }
    setLoading(false);
  }, []);

  const handleSeedAll = async () => {
    if (!selectedKasa) return;
    setSeeding(true);
    for (const pkg of INITIAL_PACKAGES.filter(p => p.kasaId === selectedKasa)) {
      await addPackage(selectedKasa, pkg);
    }
    await load(selectedKasa);
    setSeeding(false);
  };

  useEffect(() => {
    if (selectedKasa) load(selectedKasa);
  }, [selectedKasa, load]);

  // ── Kasa seçim ekranı ─────────────────────────────────────────────────
  if (!selectedKasa) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-500/10 border border-violet-500/20 rounded-xl flex items-center justify-center">
            <Package className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Paket Yönetimi</h2>
            <p className="text-xs text-gray-500 mt-0.5">Düzenlemek istediğiniz kasayı seçin</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {KASAS.map(k => (
            <button
              key={k.id}
              onClick={() => setSelectedKasa(k.id)}
              className={`bg-gray-900 border border-gray-800 rounded-xl p-5 text-left hover:scale-[1.02] active:scale-[0.99] transition-all shadow-boltify-card hover:border-gray-700`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 rounded-xl ${k.bg} border ${k.borderAccent} flex items-center justify-center flex-shrink-0`}><k.Icon className={`w-6 h-6 ${k.text}`} /></div>
                <p className={`text-lg font-bold ${k.text}`}>{k.name}</p>
              </div>
              <p className="text-sm text-gray-400">Paketleri düzenle</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const kasa = KASAS.find(k => k.id === selectedKasa)!;

  // ── Kaydet (yeni) ─────────────────────────────────────────────────────
  const handleAddSave = async () => {
    if (!form || !form.name.trim()) return;
    setSaving(true);
    const newPkg: PackageItem = {
      ...form,
      id: `${selectedKasa}_${Date.now()}`,
    };
    const ok = await addPackage(selectedKasa, newPkg);
    if (ok) {
      await load(selectedKasa);
      setAddingCat(null);
      setForm(null);
    }
    setSaving(false);
  };

  // ── Kaydet (düzenle) ──────────────────────────────────────────────────
  const handleEditSave = async () => {
    if (!editingPkg) return;
    setSaving(true);
    const ok = await updatePackage(selectedKasa, editingPkg.id, editingPkg);
    if (ok) {
      await load(selectedKasa);
      setEditingPkg(null);
    }
    setSaving(false);
  };

  // ── Sil ──────────────────────────────────────────────────────────────
  const handleDelete = async (pkg: PackageItem) => {
    setDeleteTarget(pkg);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deletePackage(selectedKasa, deleteTarget.id);
    await load(selectedKasa);
    setDeleteTarget(null);
  };

  // ── Yeni paket formu aç ───────────────────────────────────────────────
  const openAdd = (cat: Category) => {
    setEditingPkg(null);
    const f = emptyForm(selectedKasa);
    f.category = cat;
    setForm(f);
    setAddingCat(cat);
  };

  // ── Düzenle formu aç ──────────────────────────────────────────────────
  const openEdit = (pkg: PackageItem) => {
    setAddingCat(null);
    setForm(null);
    setEditingPkg({ ...pkg });
  };

  const toggleCat = (cat: Category) =>
    setOpenCats(s => ({ ...s, [cat]: !s[cat] }));

  // ── Kontrat oluştur (Atlantis DB + Supabase) ──────────────────────────
  const handleCreateContract = async () => {
    if (!contractForm || !selectedKasa) return;
    const selectedProducts = contractForm.products.filter(p => p.selected);
    if (!contractForm.name.trim()) { setContractError('Kontrat adı gerekli'); return; }
    if (selectedProducts.length === 0) { setContractError('En az bir ürün seçin'); return; }
    if (!contractForm.startDate || !contractForm.endDate) { setContractError('Tarih aralığı gerekli'); return; }

    setContractSaving(true);
    setContractError('');
    setContractSuccess('');

    const currencyId = contractForm.currency === 'USD' ? 1 : contractForm.currency === 'EUR' ? 2 : 3;

    try {
      let contractResult = null;
      if (integrationActive) {
        const request: CreateContractRequest = {
          name: contractForm.name.trim(),
          currencyId: currencyId as 1 | 2 | 3,
          contractGroupId: KASA_GROUP[selectedKasa],
          startDate: contractForm.startDate,
          endDate: contractForm.endDate,
          priority: 1,
          createdBy: getPersonnelUsername(),
          products: selectedProducts.map(p => ({
            productId: p.productId,
            adultPrice: parseFloat(p.adultPrice) || 0,
            childPrice: parseFloat(p.childPrice) || 0,
          })),
        };
        contractResult = await createContract(request);
        if (!contractResult.success) {
          setContractError(`Atlantis DB hatası: ${contractResult.error}`);
          setContractSaving(false);
          return;
        }
      }

      // Supabase'e paket kaydet
      const newPkg: PackageItem = {
        id: contractResult
          ? `atlantis_${contractResult.contractHeaderId}`
          : `custom_${Date.now()}`,
        kasaId: selectedKasa,
        name: contractForm.name.trim(),
        category: contractForm.category,
        adultPrice: parseFloat(selectedProducts[0].adultPrice) || 0,
        childPrice: parseFloat(selectedProducts[0].childPrice) || 0,
        currency: contractForm.currency,
        // Atlantis eşleme bilgileri
        ...(contractResult && {
          atlantisContractHeaderId: contractResult.contractHeaderId,
          atlantisContractId: contractResult.contractId,
          atlantisProducts: contractResult.products,
        }),
      } as PackageItem;

      await addPackage(selectedKasa, newPkg);
      await load(selectedKasa);

      setContractSuccess(`✅ "${contractForm.name}" kontratı oluşturuldu!${contractResult ? ` (Atlantis ID: ${contractResult.contractHeaderId})` : ''}`);
      setContractForm(null);
      setShowContractForm(false);
    } catch (err: any) {
      setContractError(`Hata: ${err.message}`);
    }
    setContractSaving(false);
  };

  // ── Fiyat güncelle (Atlantis DB + Supabase) ───────────────────────────
  const handlePriceUpdate = async () => {
    if (!priceEditPkg || !selectedKasa) return;
    const adu = parseFloat(newAdultPrice);
    const chl = parseFloat(newChildPrice);
    if (isNaN(adu) || isNaN(chl)) { setPriceError('Geçerli fiyat girin'); return; }

    setPriceSaving(true);
    setPriceError('');

    try {
      // Atlantis DB güncelle (sadece atlantis paketi ise)
      const pkg = priceEditPkg as any;
      if (integrationActive && pkg.atlantisProducts?.length > 0) {
        const priceUpdates = pkg.atlantisProducts.flatMap((p: any) => [
          { priceId: p.aduPriceId, newPrice: adu },
          { priceId: p.chlPriceId, newPrice: chl },
        ]);
        const result = await updateContractPrice(priceUpdates, getPersonnelUsername());
        if (!result.success) {
          setPriceError(`Atlantis DB hatası: ${result.error}`);
          setPriceSaving(false);
          return;
        }
      }

      // Supabase güncelle
      await updatePackage(selectedKasa, priceEditPkg.id, { adultPrice: adu, childPrice: chl });
      await load(selectedKasa);
      setPriceEditPkg(null);
    } catch (err: any) {
      setPriceError(`Hata: ${err.message}`);
    }
    setPriceSaving(false);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => { setSelectedKasa(null); setEditingPkg(null); setForm(null); setAddingCat(null); }}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 bg-violet-500/10 border border-violet-500/20 rounded-xl flex items-center justify-center">
            <kasa.Icon className={`w-5 h-5 ${kasa.text}`} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">{kasa.name} — Paketler</h2>
            <p className="text-xs text-gray-500 mt-0.5">{packages.length} paket</p>
          </div>
        </div>
        <button
          onClick={() => { setContractForm(emptyContractForm(selectedKasa)); setShowContractForm(true); setContractError(''); setContractSuccess(''); }}
          className="flex items-center gap-2 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all shadow-lg shadow-orange-500/20"
        >
          <Zap className="w-4 h-4" /> Yeni Kontrat
        </button>
      </div>

      {/* Varsayılan paket banner */}
      {!loading && isDefault && (
        <div className="flex items-center justify-between flex-wrap gap-3 bg-yellow-500/10 border border-yellow-600/30 rounded-xl px-4 sm:px-5 py-3">
          <p className="text-yellow-400 text-sm">Bu kasa için henüz Supabase'e kaydedilmiş paket yok. Aşağıdakiler <b>varsayılan paketler</b>dir.</p>
          <button
            onClick={handleSeedAll}
            disabled={seeding}
            className="ml-4 flex-shrink-0 flex items-center gap-1.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {seeding ? 'Aktarılıyor...' : "Tümünü Supabase'e Aktar"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">Yükleniyor...</div>
      ) : (
        <div className="space-y-4">
          {CATEGORIES.map(cat => {
            const catPkgs = packages.filter(p => p.category === cat);
            const isOpen  = openCats[cat];

            return (
              <div key={cat} className={`bg-gray-900 border border-gray-800 border-l-2 ${CAT_COLOR[cat].border} rounded-xl overflow-hidden`}>
                {/* Kategori başlığı */}
                <div
                  className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-800/50 transition-colors select-none"
                  onClick={() => toggleCat(cat)}
                >
                  <div className="flex items-center gap-2.5">
                    {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${CAT_COLOR[cat].badge}`}>{cat}</span>
                    <span className="text-xs text-gray-500 bg-gray-700/60 px-2 py-0.5 rounded-full">{catPkgs.length} paket</span>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); openAdd(cat); setOpenCats(s => ({ ...s, [cat]: true })); }}
                    className="flex items-center gap-1 text-xs text-orange-400 hover:text-white hover:bg-orange-600 border border-orange-500/30 hover:border-transparent px-2.5 py-1 rounded-lg transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Paket Ekle
                  </button>
                </div>

                {isOpen && (
                  <>
                    {/* Tablo */}
                    {catPkgs.length > 0 && (
                      <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[480px]">
                        <thead>
                          <tr className="border-t border-gray-700/50 bg-gray-900">
                            <th className="text-left px-5 py-2 text-xs text-gray-500 font-medium">Paket Adı</th>
                            <th className="text-center px-4 py-2 text-xs text-gray-500 font-medium">Döviz</th>
                            <th className="text-center px-4 py-2 text-xs text-gray-500 font-medium">Yetişkin</th>
                            <th className="text-center px-4 py-2 text-xs text-gray-500 font-medium">Çocuk</th>
                            <th className="text-right px-5 py-2 text-xs text-gray-500 font-medium w-20">İşlem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {catPkgs.map(pkg => (
                            editingPkg?.id === pkg.id ? (
                              /* Satır içi düzenleme */
                              <tr key={pkg.id} className="border-t border-gray-700/30 bg-gray-800/30">
                                <td className="px-4 py-2">
                                  <input
                                    value={editingPkg.name}
                                    onChange={e => setEditingPkg(p => p && ({ ...p, name: e.target.value }))}
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-orange-500"
                                  />
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <select
                                    value={editingPkg.currency}
                                    onChange={e => setEditingPkg(p => p && ({ ...p, currency: e.target.value as Currency }))}
                                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs focus:outline-none"
                                  >
                                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <input
                                    type="number" min={0} step={0.5}
                                    value={editingPkg.adultPrice}
                                    onChange={e => setEditingPkg(p => p && ({ ...p, adultPrice: Number(e.target.value) }))}
                                    className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs text-center focus:outline-none focus:border-orange-500"
                                  />
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <input
                                    type="number" min={0} step={0.5}
                                    value={editingPkg.childPrice}
                                    onChange={e => setEditingPkg(p => p && ({ ...p, childPrice: Number(e.target.value) }))}
                                    className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs text-center focus:outline-none focus:border-orange-500"
                                  />
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button onClick={handleEditSave} disabled={saving} className="p-1.5 rounded hover:bg-green-500/20 text-green-400 transition-colors"><Save className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setEditingPkg(null)} className="p-1.5 rounded hover:bg-gray-600 text-gray-400 transition-colors"><X className="w-3.5 h-3.5" /></button>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              /* Normal satır */
                              <tr key={pkg.id} className="border-t border-gray-700/30 hover:bg-gray-700/10 transition-colors">
                                <td className="px-5 py-2.5 text-white text-sm">{pkg.name}</td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${CUR_COLOR[pkg.currency as Currency]}`}>
                                    {pkg.currency}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-center text-gray-300 text-sm">
                                  {CUR_SYMBOL[pkg.currency as Currency]}{pkg.adultPrice}
                                </td>
                                <td className="px-4 py-2.5 text-center text-gray-300 text-sm">
                                  {CUR_SYMBOL[pkg.currency as Currency]}{pkg.childPrice}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={() => { setPriceEditPkg(pkg); setNewAdultPrice(String(pkg.adultPrice)); setNewChildPrice(String(pkg.childPrice)); setPriceError(''); }}
                                      title="Fiyat Güncelle"
                                      className="p-2 sm:p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-emerald-400 transition-colors"
                                    ><DollarSign className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => openEdit(pkg)} className="p-2 sm:p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-yellow-400 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleDelete(pkg)} className="p-2 sm:p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                </td>
                              </tr>
                            )
                          ))}
                        </tbody>
                      </table>
                    </div>
                    )}

                    {catPkgs.length === 0 && addingCat !== cat && (
                      <p className="text-center text-xs text-gray-600 py-4">Bu kategoride henüz paket yok</p>
                    )}

                    {/* Yeni paket ekleme satırı */}
                    {addingCat === cat && form && (
                      <div className="border-t border-gray-800 px-5 py-4 bg-indigo-900/10 space-y-3">
                        <p className="text-xs text-orange-400 font-semibold">Yeni Paket</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="md:col-span-2">
                            <label className="text-xs text-gray-400">Paket Adı *</label>
                            <input
                              autoFocus
                              value={form.name}
                              onChange={e => setForm(f => f && ({ ...f, name: e.target.value }))}
                              placeholder="Örn: M.Y"
                              className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400">Döviz</label>
                            <select
                              value={form.currency}
                              onChange={e => setForm(f => f && ({ ...f, currency: e.target.value as Currency }))}
                              className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                            >
                              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-400">Kategori</label>
                            <select
                              value={form.category}
                              onChange={e => setForm(f => f && ({ ...f, category: e.target.value as Category }))}
                              className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm focus:outline-none"
                            >
                              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-400">Yetişkin Fiyat</label>
                            <input
                              type="number" min={0} step={0.5}
                              value={form.adultPrice}
                              onChange={e => setForm(f => f && ({ ...f, adultPrice: Number(e.target.value) }))}
                              className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400">Çocuk Fiyat</label>
                            <input
                              type="number" min={0} step={0.5}
                              value={form.childPrice}
                              onChange={e => setForm(f => f && ({ ...f, childPrice: Number(e.target.value) }))}
                              className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={handleAddSave}
                            disabled={saving || !form.name.trim()}
                            className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {saving ? 'Ekleniyor...' : 'Ekle'}
                          </button>
                          <button
                            onClick={() => { setAddingCat(null); setForm(null); }}
                            className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition-colors"
                          >
                            İptal
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Silme Onay Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-sm w-full mx-4 shadow-boltify-lg">
            <h3 className="text-lg font-bold text-white mb-2">Paketi Sil</h3>
            <p className="text-gray-300 text-sm mb-5">
              <strong className="text-red-400">"{deleteTarget.name}"</strong> paketini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-semibold transition-colors"
              >
                Evet, Sil
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── YENİ KONTRAT FORMU MODAL ── */}
      {showContractForm && contractForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-orange-400" />
                <h3 className="text-lg font-bold text-white">Yeni Kontrat Oluştur</h3>
              </div>
              <button onClick={() => setShowContractForm(false)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Kontrat Adı */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Kontrat Adı</label>
                <input
                  type="text" placeholder="örn: WILD KAMPANYA %50"
                  value={contractForm.name}
                  onChange={e => setContractForm(f => f && ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Kategori + Para Birimi */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Kategori</label>
                  <select
                    value={contractForm.category}
                    onChange={e => setContractForm(f => f && ({ ...f, category: e.target.value as Category }))}
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Para Birimi</label>
                  <select
                    value={contractForm.currency}
                    onChange={e => setContractForm(f => f && ({ ...f, currency: e.target.value as Currency }))}
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500"
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Geçerlilik Tarihleri */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Başlangıç</label>
                  <input type="date" value={contractForm.startDate}
                    onChange={e => setContractForm(f => f && ({ ...f, startDate: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Bitiş</label>
                  <input type="date" value={contractForm.endDate}
                    onChange={e => setContractForm(f => f && ({ ...f, endDate: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Ürünler (Combo) */}
              <div>
                <label className="block text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">Ürünler</label>
                <div className="space-y-2">
                  {contractForm.products.map((prod, idx) => (
                    <div key={prod.productId} className={`rounded-xl border p-3 transition-all ${prod.selected ? 'bg-orange-500/5 border-orange-500/30' : 'bg-gray-800/40 border-gray-700/50'}`}>
                      <div className="flex items-center gap-3 mb-2">
                        <input type="checkbox" checked={prod.selected}
                          onChange={e => setContractForm(f => {
                            if (!f) return f;
                            const prods = [...f.products];
                            prods[idx] = { ...prods[idx], selected: e.target.checked };
                            return { ...f, products: prods };
                          })}
                          className="w-4 h-4 accent-orange-500"
                        />
                        <span className={`text-sm font-semibold ${prod.selected ? 'text-white' : 'text-gray-500'}`}>
                          {PRODUCT_LABELS[prod.productId]}
                        </span>
                      </div>
                      {prod.selected && (
                        <div className="grid grid-cols-2 gap-2 ml-7">
                          <div>
                            <label className="text-[10px] text-gray-500 mb-0.5 block">Yetişkin</label>
                            <input type="number" min="0" step="0.5" value={prod.adultPrice}
                              onChange={e => setContractForm(f => {
                                if (!f) return f;
                                const prods = [...f.products];
                                prods[idx] = { ...prods[idx], adultPrice: e.target.value };
                                return { ...f, products: prods };
                              })}
                              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-orange-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 mb-0.5 block">Çocuk</label>
                            <input type="number" min="0" step="0.5" value={prod.childPrice}
                              onChange={e => setContractForm(f => {
                                if (!f) return f;
                                const prods = [...f.products];
                                prods[idx] = { ...prods[idx], childPrice: e.target.value };
                                return { ...f, products: prods };
                              })}
                              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-orange-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {!integrationActive && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2 text-yellow-400 text-xs">
                  ⚠️ Entegrasyon kapalı — kontrat sadece Supabase'e kaydedilir, Atlantis DB'ye yazılmaz.
                </div>
              )}

              {contractError && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-xs">{contractError}</div>}
              {contractSuccess && <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2 text-emerald-400 text-xs">{contractSuccess}</div>}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleCreateContract}
                  disabled={contractSaving}
                  className="flex-1 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                >
                  {contractSaving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Oluşturuluyor...</> : <><Zap className="w-4 h-4" /> Kontrat Oluştur</>}
                </button>
                <button onClick={() => setShowContractForm(false)} className="px-5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white py-2.5 rounded-xl text-sm border border-gray-700 transition-colors">İptal</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FİYAT GÜNCELLE MODAL ── */}
      {priceEditPkg && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Fiyat Güncelle</h3>
              </div>
              <button onClick={() => setPriceEditPkg(null)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-gray-400 mb-4 font-medium">{priceEditPkg.name} <span className={`text-xs px-2 py-0.5 rounded-full ${CUR_COLOR[priceEditPkg.currency as Currency]}`}>{priceEditPkg.currency}</span></p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-medium">Yetişkin</label>
                <input type="number" min="0" step="0.5" value={newAdultPrice}
                  onChange={e => setNewAdultPrice(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-medium">Çocuk</label>
                <input type="number" min="0" step="0.5" value={newChildPrice}
                  onChange={e => setNewChildPrice(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            {!integrationActive && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2 text-yellow-400 text-xs mb-3">
                ⚠️ Entegrasyon kapalı — sadece Supabase fiyatı güncellenir.
              </div>
            )}
            {priceError && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-xs mb-3">{priceError}</div>}
            <div className="flex gap-3">
              <button
                onClick={handlePriceUpdate}
                disabled={priceSaving}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
              >
                {priceSaving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Kaydediliyor...</> : <><Save className="w-4 h-4" /> Kaydet</>}
              </button>
              <button onClick={() => setPriceEditPkg(null)} className="px-5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white py-2.5 rounded-xl text-sm border border-gray-700 transition-colors">İptal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
