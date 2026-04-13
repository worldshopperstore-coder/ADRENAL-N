import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Plus, ShoppingCart, FileSpreadsheet, FileText, X, CreditCard, Banknote, DollarSign, Euro, TrendingUp, Users, User, Tag, Globe, ArrowLeftRight, Shuffle, Building2, Package, ChevronRight, Check, Coins, Zap, Loader2, Printer, CheckCircle, AlertTriangle, Database, Wifi, Target } from 'lucide-react';
import { INITIAL_PACKAGES, type PackageItem } from '@/data/packages';
import { getPackagesByKasa } from '@/utils/packagesDB';
import { getUserSession, getKasaId, getPersonnelId, getPersonnelName } from '@/utils/session';
import { 
  saveSalesToFirebase, 
  loadSalesFromFirebase, 
  saveCrossSalesToFirebase, 
  loadCrossSalesFromFirebase,
  subscribeSales 
} from '@/utils/salesDB';
import { getKasaSettings, loadAdvancesFromSupabase } from '@/utils/kasaSettingsDB';
import { processActiveSale, processActiveRefund, checkIntegrationReady, hasContractMapping, type ActiveSaleRequest, type ActiveSaleResult } from '@/utils/saleFlow';
import { isIntegrationEnabled } from '@/utils/posManager';
import { printTickets, buildTicketPrintData } from '@/utils/ticketPrinter';
import { getWeeklyTarget, getWeeklyProgress, getCurrentWeekStart } from '@/utils/weeklyTargetsDB';
import { generateCrossHTMLReport } from '@/components/CrossSalesTab';


interface Sale {
  id: string;
  packageName: string;
  category?: string;
  adultQty: number;
  childQty: number;
  currency: 'TL' | 'USD' | 'EUR' | 'KK';
  paymentType: 'Nakit' | 'Kredi Kartı' | 'Çoklu';
  total: number;
  kkTl: number;
  cashTl: number;
  cashUsd: number;
  cashEur: number;
  timestamp: string;
  isRefund?: boolean;
  refundOfSaleId?: string;
  refundReason?: string;
  kkRefundTxId?: string;
  isCrossSale?: boolean;
  personnelId?: string;
  personnelName?: string;
  // Atlantis DB referansları (aktif mod)
  terminalRecordId?: number;
  ticketIds?: number[];
  ticketGroupMap?: Record<string, number[]>;
}

interface RefundInfo {
  reason: string;
  refundPaymentType: 'Nakit' | 'Kredi Kartı';
  kkRefundTxId: string;
}

interface AddSaleForm {
  packageId: string;
  adultQty: string;
  childQty: string;
  paymentType: 'Nakit' | 'Kredi Kartı' | '';
  splitKkTl: string;
  splitCashTl: string;
  splitCashUsd: string;
  splitCashEur: string;
  isCrossSale: boolean;
  selectedCurrency: 'USD' | 'EUR' | 'TL' | '';
  payInTL: boolean;
  comment: string;
}

export default function SalesPanel({ usdRate = 30, eurRate = 33, onSalesUpdate }: { usdRate: number; eurRate: number; onSalesUpdate?: (sales: Sale[]) => void }) {
  const currentKasaId = getKasaId('sinema');
  const [kasaPackages, setKasaPackages] = useState<PackageItem[]>(
    INITIAL_PACKAGES.filter(p => p.kasaId === currentKasaId)
  );

  // Supabase'den paketleri yükle, Supabase boşsa varsayılanı kullan
  // FREE paketler her zaman INITIAL_PACKAGES'tan gelir (Supabase'te olmayabilir)
  useEffect(() => {
    const freePkgs = INITIAL_PACKAGES.filter(p => p.kasaId === currentKasaId && p.category === 'Ücretsiz');
    getPackagesByKasa(currentKasaId).then(pkgs => {
      if (pkgs.length > 0) {
        // Supabase paketlerine FREE paketleri ekle (eğer yoksa)
        const merged = [...pkgs];
        for (const fp of freePkgs) {
          if (!merged.some(p => p.id === fp.id)) merged.push(fp);
        }
        setKasaPackages(merged);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKasaId]);

  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const onSalesUpdateRef = useRef(onSalesUpdate);
  
  // Keep ref updated
  useEffect(() => {
    onSalesUpdateRef.current = onSalesUpdate;
  }, [onSalesUpdate]);
  const [showAddForm, setShowAddForm] = useState(false);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundTargetSale, setRefundTargetSale] = useState<Sale | null>(null);
  const [refundInfo, setRefundInfo] = useState<RefundInfo>({ reason: '', refundPaymentType: 'Nakit', kkRefundTxId: '' });
  const [refundProcessing, setRefundProcessing] = useState(false);
  const CATEGORY_GROUPS = ['Münferit', 'Visitor', 'Çapraz Münferit', 'Çapraz Visitor', 'Acenta', 'Ücretsiz'] as const;
  const CATEGORY_CONFIG: Record<string, { icon: typeof Tag; color: string; bg: string; border: string; ring: string; badge: string; desc: string }> = {
    'Münferit': { icon: Tag, color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', ring: 'ring-emerald-500/20', badge: 'from-emerald-500 to-emerald-600', desc: 'Bireysel satışlar' },
    'Visitor': { icon: Globe, color: 'text-sky-400', bg: 'bg-sky-500/15', border: 'border-sky-500/30', ring: 'ring-sky-500/20', badge: 'from-sky-500 to-sky-600', desc: 'Yabancı turist USD/EUR' },
    'Çapraz Münferit': { icon: ArrowLeftRight, color: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/30', ring: 'ring-orange-500/20', badge: 'from-orange-500 to-orange-600', desc: 'Kasalar arası satışlar' },
    'Çapraz Visitor': { icon: Shuffle, color: 'text-rose-400', bg: 'bg-rose-500/15', border: 'border-rose-500/30', ring: 'ring-rose-500/20', badge: 'from-rose-500 to-rose-600', desc: 'Kasalar arası USD/EUR' },
    'Acenta': { icon: Building2, color: 'text-violet-400', bg: 'bg-violet-500/15', border: 'border-violet-500/30', ring: 'ring-violet-500/20', badge: 'from-violet-500 to-violet-600', desc: 'Acenta anlaşmalı' },
    'Ücretsiz': { icon: Tag, color: 'text-lime-400', bg: 'bg-lime-500/15', border: 'border-lime-500/30', ring: 'ring-lime-500/20', badge: 'from-lime-500 to-lime-600', desc: 'Ücretsiz giriş biletleri' },
  };
  const [selectedCategory, setSelectedCategory] = useState<(typeof CATEGORY_GROUPS)[number] | ''>('');

  // ── Entegrasyon Durumu ──────────────────────────────────
  const [integrationActive, setIntegrationActive] = useState(false);
  const [integrationReady, setIntegrationReady] = useState(false);
  const [posProcessing, setPosProcessing] = useState(false);
  const [posProcessingStep, setPosProcessingStep] = useState<'pos' | 'print' | 'done'>('pos');
  const [posResult, setPosResult] = useState<ActiveSaleResult | null>(null);
  const [showPosResultModal, setShowPosResultModal] = useState(false);
  const [showPosProcessingModal, setShowPosProcessingModal] = useState(false);

  // Entegrasyon durumunu kontrol et
  useEffect(() => {
    const check = async () => {
      const status = await checkIntegrationReady();
      setIntegrationActive(status.enabled);
      setIntegrationReady(status.ready);
    };
    check();
    // Periyodik kontrol
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  // Modal açıkken body scroll'u kilitle
  useEffect(() => {
    if (showAddForm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showAddForm]);
  const [splitMode, setSplitMode] = useState(false);
  const [formData, setFormData] = useState<AddSaleForm>({
    packageId: '',
    adultQty: '0',
    childQty: '0',
    paymentType: '',
    splitKkTl: '',
    splitCashTl: '',
    splitCashUsd: '',
    splitCashEur: '',
    isCrossSale: false,
    selectedCurrency: '',
    payInTL: false,
    comment: '',
  });

  // ── Dövizli kategori yardımcıları ──────────────────────
  // Visitor, Çapraz Visitor, Acenta gibi hem USD hem EUR olan kategoriler
  const isMultiCurrencyCategory = (cat: string) => ['Münferit', 'Visitor', 'Çapraz Münferit', 'Çapraz Visitor', 'Acenta'].includes(cat);
  const isDualCurrencyCategory = (cat: string) => isMultiCurrencyCategory(cat);

  // Bir kategorideki benzersiz paket isimlerini getir (USD/EUR tekrarlarını kaldır)
  const getUniquePackageNames = (cat: string): { name: string; baseName: string }[] => {
    const pkgs = kasaPackages.filter(p => p.category === cat);
    const seen = new Set<string>();
    const result: { name: string; baseName: string }[] = [];
    for (const p of pkgs) {
      if (!seen.has(p.name)) {
        seen.add(p.name);
        result.push({ name: p.name, baseName: p.name });
      }
    }
    // Numaralı paketleri sırala (ör. "Acenta 6" < "Acenta 12")
    result.sort((a, b) => {
      const numA = parseInt(a.name.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.name.replace(/\D/g, '')) || 0;
      if (numA && numB) return numA - numB;
      return a.name.localeCompare(b.name, 'tr');
    });
    return result;
  };

  // Paket adı + para birimi → gerçek paket ID'si
  const resolvePackageId = (packageName: string, currency: 'USD' | 'EUR' | 'TL', cat: string): string => {
    const pkg = kasaPackages.find(p => p.category === cat && p.name === packageName && p.currency === currency);
    return pkg?.id || '';
  };
  
  // Firebase'den satışları yükle
  useEffect(() => {
    const loadSales = async () => {
      setIsLoading(true);
      const loadedSales = await loadSalesFromFirebase();
      setSales(loadedSales);
      setIsLoading(false);
    };
    loadSales();
    
    // Real-time güncellemeleri dinle
    const unsubscribe = subscribeSales((updatedSales) => {
      setSales(updatedSales);
    });
    
    return () => unsubscribe();
  }, []);
  
  // Satışlar değiştiğinde Firebase'e kaydet
  useEffect(() => {
    if (!isLoading && sales.length > 0) {
      saveSalesToFirebase(sales);
      if (onSalesUpdateRef.current) {
        onSalesUpdateRef.current(sales);
      }
    }
  }, [sales, isLoading]);

  const calculateSaleDistribution = (
    amount: number,
    currency: string,
    paymentType: string,
    usdRate: number,
    eurRate: number
  ) => {
    let kkTl = 0;
    let cashTl = 0;
    let cashUsd = 0;
    let cashEur = 0;

    if (paymentType === 'Nakit') {
      if (currency === 'USD') {
        cashUsd = amount;
      } else if (currency === 'EUR') {
        cashEur = amount;
      } else {
        cashTl = amount;
      }
    } else if (paymentType === 'Kredi Kartı') {
      if (currency === 'USD') {
        kkTl = amount * usdRate;
      } else if (currency === 'EUR') {
        kkTl = amount * eurRate;
      } else {
        kkTl = amount;
      }
    }

    return { kkTl, cashTl, cashUsd, cashEur };
  };

  const handleAddSale = () => {
    if (!formData.packageId || (formData.adultQty === '0' && formData.childQty === '0')) {
      setErrorMessage('Lütfen paket ve miktar seçiniz');
      return;
    }

    const selectedPackage = kasaPackages.find((p) => p.id === formData.packageId);
    if (!selectedPackage) return;

    const adultQty = parseInt(formData.adultQty) || 0;
    const childQty = parseInt(formData.childQty) || 0;
    const rawTotal = adultQty * selectedPackage.adultPrice + childQty * selectedPackage.childPrice;

    // Para birimi dönüşümü
    const pkgCurrency = selectedPackage.currency;
    const selCurrency = formData.selectedCurrency || pkgCurrency;
    let total = rawTotal;
    let effectiveCurrency = pkgCurrency;

    if (formData.payInTL && pkgCurrency !== 'TL') {
      // Visitor/Acenta: döviz paketi → TL ödeme (seçilen para birimine göre kur)
      const rate = selCurrency === 'EUR' ? eurRate : usdRate;
      total = Math.ceil(rawTotal * rate);
      effectiveCurrency = 'TL';
    } else if (selCurrency === 'USD' && pkgCurrency === 'TL') {
      // Münferit TL paketi → USD ödeme (yukarı yuvarlama)
      total = usdRate > 0 ? Math.ceil(rawTotal / usdRate) : rawTotal;
      effectiveCurrency = 'USD';
    } else if (selCurrency === 'EUR' && pkgCurrency === 'TL') {
      // Münferit TL paketi → EUR ödeme (yukarı yuvarlama)
      total = eurRate > 0 ? Math.ceil(rawTotal / eurRate) : rawTotal;
      effectiveCurrency = 'EUR';
    } else if (selCurrency !== pkgCurrency && selCurrency !== '') {
      // Seçilen currency ile paket currency aynı değilse paketi takip et
      effectiveCurrency = selCurrency as any;
    }

    let kkTl: number, cashTl: number, cashUsd: number, cashEur: number;
    let paymentType: 'Nakit' | 'Kredi Kartı' | 'Çoklu';

    if (splitMode) {
      // Split payment mode
      kkTl = parseFloat(formData.splitKkTl) || 0;
      cashTl = parseFloat(formData.splitCashTl) || 0;
      cashUsd = parseFloat(formData.splitCashUsd) || 0;
      cashEur = parseFloat(formData.splitCashEur) || 0;

      if (kkTl === 0 && cashTl === 0 && cashUsd === 0 && cashEur === 0) {
        setErrorMessage('Lütfen en az bir ödeme yöntemi giriniz');
        return;
      }

      const saleCurrency = effectiveCurrency;
      const totalInTl = saleCurrency === 'USD' ? total * usdRate : saleCurrency === 'EUR' ? total * eurRate : total;
      const paidTl = kkTl + cashTl + (cashUsd * usdRate) + (cashEur * eurRate);
      if (Math.abs(totalInTl - paidTl) > 0.99) {
        setErrorMessage(`Ödeme tutarı toplam ile eşleşmiyor. Kalan: ${(totalInTl - paidTl).toFixed(2)} ₺`);
        return;
      }

      const methodCount = [kkTl > 0, cashTl > 0, cashUsd > 0, cashEur > 0].filter(Boolean).length;
      paymentType = methodCount > 1 ? 'Çoklu' : kkTl > 0 ? 'Kredi Kartı' : 'Nakit';
    } else {
      // Simple payment mode
      const distribution = calculateSaleDistribution(total, effectiveCurrency, formData.paymentType, usdRate, eurRate);
      kkTl = distribution.kkTl;
      cashTl = distribution.cashTl;
      cashUsd = distribution.cashUsd;
      cashEur = distribution.cashEur;
      paymentType = formData.paymentType || 'Nakit';
    }

    setErrorMessage('');

    const newSale: Sale = {
      id: Date.now().toString(),
      packageName: selectedPackage.name,
      category: selectedPackage.category,
      adultQty,
      childQty,
      currency: effectiveCurrency as any,
      paymentType,
      total,
      kkTl,
      cashTl,
      cashUsd,
      cashEur,
      timestamp: new Date().toISOString(),
      isRefund: false,
      isCrossSale: formData.isCrossSale,
      personnelId: getPersonnelId(),
      personnelName: getPersonnelName(),
    };

    // Çapraz satışsa, çapraz satış listesine de Firebase'e kaydet
    if (formData.isCrossSale) {
      loadCrossSalesFromFirebase().then(crossSales => {
        saveCrossSalesToFirebase([...crossSales, newSale]);
      }).catch(err => console.error('Cross-sale kayıt hatası:', err));
    }

    setSales((prevSales) => {
      const updatedSales = [...prevSales, newSale];
      return updatedSales;
    });

    setFormData({
      packageId: '',
      adultQty: '0',
      childQty: '0',
      paymentType: '',
      splitKkTl: '',
      splitCashTl: '',
      splitCashUsd: '',
      splitCashEur: '',
      isCrossSale: false,
      selectedCurrency: '',
      payInTL: false,
      comment: '',
    });
    setSplitMode(false);
    setSelectedCategory('');
    setShowAddForm(false);
  };

  // ── AKTİF MOD SATIŞ ────────────────────────────────────
  const handleActiveSale = async () => {
    if (!formData.packageId || (formData.adultQty === '0' && formData.childQty === '0')) {
      setErrorMessage('Lütfen paket ve miktar seçiniz');
      return;
    }

    const selectedPackage = kasaPackages.find((p) => p.id === formData.packageId);
    if (!selectedPackage) return;

    const adultQty = parseInt(formData.adultQty) || 0;
    const childQty = parseInt(formData.childQty) || 0;

    // Contract mapping kontrolü
    if (!hasContractMapping(formData.packageId)) {
      setErrorMessage(`Bu paket için sistem eşlemesi bulunamadı. Pasif modda kayıt yapabilirsiniz.`);
      return;
    }

    setErrorMessage('');
    setPosProcessing(true);
    setPosProcessingStep('pos');
    setShowPosProcessingModal(true);

    // Split payment bilgisi + ödeme tipi belirleme
    let splitPayments: ActiveSaleRequest['splitPayments'] = undefined;
    let paymentType: 'Nakit' | 'Kredi Kartı' | 'Çoklu' = formData.paymentType || 'Nakit';

    if (splitMode) {
      const kkTlVal = parseFloat(formData.splitKkTl) || 0;
      const cashTlVal = parseFloat(formData.splitCashTl) || 0;
      const cashUsdVal = parseFloat(formData.splitCashUsd) || 0;
      const cashEurVal = parseFloat(formData.splitCashEur) || 0;

      splitPayments = {
        kkTl: kkTlVal,
        cashTl: cashTlVal,
        cashUsd: cashUsdVal,
        cashEur: cashEurVal,
      };

      // Ödeme tipi belirle
      const methodCount = [kkTlVal > 0, cashTlVal > 0, cashUsdVal > 0, cashEurVal > 0].filter(Boolean).length;
      paymentType = methodCount > 1 ? 'Çoklu' : kkTlVal > 0 ? 'Kredi Kartı' : 'Nakit';
    } else {
      // Kredi kartı seçilmişse ve dövizli paketse, TL'ye çevirip KK olarak gönder
      if (formData.paymentType === 'Kredi Kartı' && selectedPackage.currency !== 'TL') {
        const total = adultQty * selectedPackage.adultPrice + childQty * selectedPackage.childPrice;
        const selCur = formData.selectedCurrency || selectedPackage.currency;
        const rate = selCur === 'EUR' ? eurRate : usdRate;
        const tlAmount = formData.payInTL ? Math.ceil(total * rate) : total * rate;
        splitPayments = {
          kkTl: tlAmount,
          cashTl: 0,
          cashUsd: 0,
          cashEur: 0,
        };
        paymentType = 'Kredi Kartı';
      } else if (formData.paymentType === 'Kredi Kartı' && selectedPackage.currency === 'TL' && (formData.selectedCurrency === 'USD' || formData.selectedCurrency === 'EUR')) {
        // Münferit TL paketi döviz ile KK ödeme — TL'ye çevir
        const total = adultQty * selectedPackage.adultPrice + childQty * selectedPackage.childPrice;
        splitPayments = {
          kkTl: total,
          cashTl: 0,
          cashUsd: 0,
          cashEur: 0,
        };
        paymentType = 'Kredi Kartı';
      }
    }

    const request: ActiveSaleRequest = {
      packageId: formData.packageId,
      packageName: selectedPackage.name,
      adultQty,
      childQty,
      paymentType: splitMode ? (splitPayments?.kkTl && splitPayments.kkTl > 0 ? 'Kredi Kartı' : 'Nakit') : (formData.paymentType || 'Nakit'),
      currency: selectedPackage.currency as any,
      kasaId: currentKasaId as any,
      personnelName: getPersonnelName(),
      adultPrice: selectedPackage.adultPrice,
      childPrice: selectedPackage.childPrice,
      splitPayments,
      usdRate,
      eurRate,
      comment: formData.comment.trim() || undefined,
    };

    try {
      // Adım 1: POS ödeme
      setPosProcessingStep('pos');
      
      const result = await processActiveSale(request);
      
      if (!result.success) {
        setPosProcessing(false);
        setShowPosProcessingModal(false);
        
        // failedAt'a göre açıklayıcı hata mesajı
        let errorMsg = result.error || 'Bilinmeyen hata';
        if (result.failedAt === 'pos') {
          errorMsg = `⚠️ İşlem onaylanmadı.`;
        } else if (result.failedAt === 'bridge') {
          errorMsg = `❌ İşlem kaydedilemedi. Tekrar deneyin.`;
        } else if (result.failedAt === 'mapping') {
          errorMsg = `❌ Paket eşlemesi bulunamadı.`;
        }
        
        setErrorMessage(errorMsg);
        return;
      }

      // Adım 2: Bilet basma
      setPosProcessingStep('print');
      await new Promise(r => setTimeout(r, 400));

      // Adım 3: Tamamlandı
      setPosProcessingStep('done');

      // ── Supabase'e kayıt (pasif modla aynı) ──────────
      const rawTotal2 = adultQty * selectedPackage.adultPrice + childQty * selectedPackage.childPrice;
      // Para birimi dönüşümü
      const pkgCur = selectedPackage.currency;
      const selCur = formData.selectedCurrency || pkgCur;
      let total: number;
      let effectiveCur = pkgCur;
      if (formData.payInTL && pkgCur !== 'TL') {
        const r = selCur === 'EUR' ? eurRate : usdRate;
        total = Math.ceil(rawTotal2 * r);
        effectiveCur = 'TL';
      } else if (selCur === 'USD' && pkgCur === 'TL') {
        total = usdRate > 0 ? Math.ceil(rawTotal2 / usdRate) : rawTotal2;
        effectiveCur = 'USD';
      } else if (selCur === 'EUR' && pkgCur === 'TL') {
        total = eurRate > 0 ? Math.ceil(rawTotal2 / eurRate) : rawTotal2;
        effectiveCur = 'EUR';
      } else {
        total = rawTotal2;
      }
      let kkTl: number, cashTl: number, cashUsd: number, cashEur: number;

      if (splitMode && splitPayments) {
        kkTl = splitPayments.kkTl || 0;
        cashTl = splitPayments.cashTl || 0;
        cashUsd = splitPayments.cashUsd || 0;
        cashEur = splitPayments.cashEur || 0;
      } else {
        const distribution = calculateSaleDistribution(total, effectiveCur, formData.paymentType, usdRate, eurRate);
        kkTl = distribution.kkTl;
        cashTl = distribution.cashTl;
        cashUsd = distribution.cashUsd;
        cashEur = distribution.cashEur;
      }

      const newSale: Sale = {
        id: Date.now().toString(),
        packageName: selectedPackage.name,
        category: selectedPackage.category,
        adultQty,
        childQty,
        currency: effectiveCur as any,
        paymentType,
        total,
        kkTl,
        cashTl,
        cashUsd,
        cashEur,
        timestamp: new Date().toISOString(),
        isRefund: false,
        isCrossSale: formData.isCrossSale,
        personnelId: getPersonnelId(),
        personnelName: getPersonnelName(),
        // Atlantis referansları — iade için gerekli
        terminalRecordId: result.terminalRecordId,
        ticketIds: result.ticketIds,
        ticketGroupMap: result.ticketGroupMap,
      };

      if (formData.isCrossSale) {
        loadCrossSalesFromFirebase().then(crossSales => {
          saveCrossSalesToFirebase([...crossSales, newSale]);
        }).catch(err => console.error('Cross-sale kayıt hatası:', err));
      }

      setSales((prev) => [...prev, newSale]);

      // Form sıfırla
      setFormData({ packageId: '', adultQty: '0', childQty: '0', paymentType: '', splitKkTl: '', splitCashTl: '', splitCashUsd: '', splitCashEur: '', isCrossSale: false, selectedCurrency: '', payInTL: false, comment: '' });
      setSplitMode(false);
      setSelectedCategory('');
      setShowAddForm(false);
      
      // İşlem modalını kapat, sonuç modalını göster
      setPosProcessing(false);
      const isFreePackage = selectedPackage.adultPrice === 0 && selectedPackage.childPrice === 0;
      setPosResult({
        ...result,
        _saleInfo: {
          packageName: selectedPackage.name,
          packageId: selectedPackage.id,
          adultQty,
          childQty,
          adultPrice: selectedPackage.adultPrice,
          childPrice: selectedPackage.childPrice,
          currency: selectedPackage.currency,
          isFree: isFreePackage,
        },
      });
      
      // Kısa gecikme ile processing modal'dan sonuç modal'a geçiş
      setTimeout(() => {
        setShowPosProcessingModal(false);
        setShowPosResultModal(true);
      }, 800);
      
    } catch (err) {
      setPosProcessing(false);
      setShowPosProcessingModal(false);
      setErrorMessage(`İşlem hatası: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Bilet tekrar basma
  const handleReprintTicket = async (sale: Sale) => {
    if (!sale.terminalRecordId || !sale.ticketIds || sale.ticketIds.length === 0) {
      alert('⚠️ Bu satışta bilet bilgisi bulunamadı.');
      return;
    }
    try {
      const pkg = kasaPackages.find(p => p.name === sale.packageName);
      const kasaLabel = currentKasaId === 'wildpark' ? 'WILDPARK ENTRANCE' : currentKasaId === 'sinema' ? 'CINEMA ENTRANCE' : 'FACE2FACE ENTRANCE';
      const isFree = sale.total === 0 && sale.category === 'Ücretsiz';
      
      // Çapraz paketlerde ürün sayısını hesapla (ticket sayısı / kişi sayısı)
      const totalPersons = sale.adultQty + sale.childQty;
      const productsPerPerson = totalPersons > 0 ? Math.round(sale.ticketIds.length / totalPersons) : 1;
      
      // Ürün listesini çapraz paket kategorisine göre oluştur
      let products: string[];
      if (productsPerPerson >= 3) {
        products = ['CINEMA ENTRANCE', 'WILDPARK ENTRANCE', 'FACE2FACE ENTRANCE'];
      } else if (productsPerPerson === 2) {
        // 2'li combo — kasaya göre hangi 2 ürün olduğunu belirle
        const isCapraz = sale.category?.includes('Çapraz');
        if (isCapraz) {
          const comboProducts = [kasaLabel];
          if (!comboProducts.includes('CINEMA ENTRANCE') && sale.packageName?.includes('XD')) comboProducts.push('CINEMA ENTRANCE');
          if (!comboProducts.includes('WILDPARK ENTRANCE') && sale.packageName?.includes('WP')) comboProducts.push('WILDPARK ENTRANCE');
          if (!comboProducts.includes('FACE2FACE ENTRANCE') && sale.packageName?.includes('F2F')) comboProducts.push('FACE2FACE ENTRANCE');
          products = comboProducts.length >= 2 ? comboProducts : [kasaLabel, 'CINEMA ENTRANCE'];
        } else {
          products = [kasaLabel];
        }
      } else {
        products = [kasaLabel];
      }
      
      const printData = buildTicketPrintData(
        {
          terminalRecordId: sale.terminalRecordId,
          ticketIds: sale.ticketIds,
          ticketGroupMap: sale.ticketGroupMap,
        },
        {
          packageName: sale.packageName,
          kasaId: currentKasaId as any,
          personnelName: sale.personnelName || getPersonnelName(),
          adultQty: sale.adultQty,
          childQty: sale.childQty,
          products: products,
          adultPrice: pkg?.adultPrice || 0,
          childPrice: pkg?.childPrice || 0,
          currency: sale.currency === 'KK' ? 'TL' : sale.currency,
          isFree,
        },
      );
      
      const pResult = await printTickets(printData);
      if (pResult.success) {
        console.log(`[Print] ${pResult.printed} bilet tekrar basıldı`);
      } else {
        console.warn(`[Print] ${pResult.printed} basıldı, ${pResult.failed} başarısız`, pResult.errors);
      }
    } catch (err: any) {
      console.warn('[Print] Yazdırma hatası:', err.message);
    }
  };

  // İade işlemi
  const handleRefund = async () => {
    if (!refundTargetSale || !refundInfo.reason.trim()) {
      setErrorMessage('Lütfen iade nedenini yazınız');
      return;
    }
    if (refundInfo.refundPaymentType === 'Kredi Kartı' && !refundInfo.kkRefundTxId.trim()) {
      setErrorMessage('Kredi kartı iadelerinde işlem numarası zorunludur');
      return;
    }
    setErrorMessage('');
    setRefundProcessing(true);

    const sale = refundTargetSale;

    // ── Atlantis DB İade (aktif mod satışı ise) ──────────
    let atlantisRefundOk = false;
    let atlantisRefundError = '';
    if (integrationActive && sale.terminalRecordId) {
      try {
        const refundResult = await processActiveRefund(
          sale.terminalRecordId,
          getPersonnelName()
        );
        if (refundResult.success) {
          atlantisRefundOk = true;
          console.log(`[İADE] Atlantis DB iade başarılı: TerminalRecordId=${sale.terminalRecordId}`);
        } else {
          atlantisRefundError = refundResult.error || 'Bilinmeyen DB iade hatası';
          console.warn(`[İADE] Atlantis DB iade hatası: ${atlantisRefundError}`);
        }
      } catch (err) {
        atlantisRefundError = err instanceof Error ? err.message : String(err);
        console.warn(`[İADE] Atlantis DB iade exception: ${atlantisRefundError}`);
      }
      // DB iade başarısız olsa bile devam et — tutanak ile halledilebilir
    }

    // For split (Çoklu) payments, reverse original distribution
    // For single payments, use calculateSaleDistribution
    let refundKkTl: number;
    let refundCashTl: number;
    let refundCashUsd: number;
    let refundCashEur: number;

    if (sale.paymentType === 'Çoklu') {
      // Reverse original split distribution
      refundKkTl = -Math.abs(sale.kkTl);
      refundCashTl = -Math.abs(sale.cashTl);
      refundCashUsd = -Math.abs(sale.cashUsd);
      refundCashEur = -Math.abs(sale.cashEur);
    } else {
      const refundDist = calculateSaleDistribution(
        Math.abs(sale.total),
        sale.currency,
        refundInfo.refundPaymentType,
        usdRate,
        eurRate
      );
      refundKkTl = -refundDist.kkTl;
      refundCashTl = -refundDist.cashTl;
      refundCashUsd = -refundDist.cashUsd;
      refundCashEur = -refundDist.cashEur;
    }

    const refundSale: Sale = {
      id: Date.now().toString(),
      packageName: sale.packageName,
      category: sale.category,
      adultQty: sale.adultQty,
      childQty: sale.childQty,
      currency: sale.currency,
      paymentType: sale.paymentType === 'Çoklu' ? 'Çoklu' : refundInfo.refundPaymentType,
      total: -Math.abs(sale.total),
      kkTl: refundKkTl,
      cashTl: refundCashTl,
      cashUsd: refundCashUsd,
      cashEur: refundCashEur,
      timestamp: new Date().toISOString(),
      isRefund: true,
      refundOfSaleId: sale.id,
      refundReason: refundInfo.reason.trim(),
      kkRefundTxId: refundInfo.refundPaymentType === 'Kredi Kartı' || sale.paymentType === 'Çoklu' ? refundInfo.kkRefundTxId.trim() || undefined : undefined,
      isCrossSale: sale.isCrossSale,
      personnelId: getPersonnelId(),
      personnelName: getPersonnelName(),
    };

    setSales((prev) => [...prev, refundSale]);

    // Çapraz satış iadesi ise, cross_sales tablosuna da yansıt
    if (sale.isCrossSale) {
      loadCrossSalesFromFirebase().then(crossSales => {
        saveCrossSalesToFirebase([...crossSales, refundSale]);
      }).catch(err => console.error('Cross-sale iade hatası:', err));
    }

    generateRefundReport(sale, refundSale, refundInfo.reason, refundInfo.refundPaymentType === 'Kredi Kartı' ? refundInfo.kkRefundTxId : '', atlantisRefundOk, atlantisRefundError);
    setRefundProcessing(false);
    setShowRefundModal(false);
    setRefundTargetSale(null);
    setRefundInfo({ reason: '', refundPaymentType: 'Nakit', kkRefundTxId: '' });
  };

  // İade tutanağı HTML/PDF
  const generateRefundReport = (originalSale: Sale, refundSale: Sale, reason: string, kkTxId: string = '', atlantisOk: boolean = false, atlantisError: string = '') => {
    const session = getUserSession();
    const userName = session.personnel?.fullName || 'Kullanıcı';
    const kasaName = session.kasa?.name || 'Kasa';
    const currentDate = new Date().toLocaleDateString('tr-TR');
    const currentTime = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    // Sistem bilgi satırları
    const atlantisRows = originalSale.terminalRecordId ? `
    <tr><td>Kayıt No</td><td style="font-weight:700">#${originalSale.terminalRecordId}</td></tr>
    <tr><td>Sistem İade</td><td style="color:${atlantisOk ? '#2e7d32' : atlantisError ? '#c00' : '#888'};font-weight:700">${atlantisOk ? '✅ Başarılı' : atlantisError ? '❌ Hata: ' + atlantisError : '— Yapılmadı'}</td></tr>` : '';

    const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8">
<title>İade Tutanağı - ${currentDate}</title>
<style>
  @page { size: A4; margin: 20mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; background: #fff; padding: 30px; max-width: 700px; margin: 0 auto; }
  .header { text-align: center; border-bottom: 3px solid #c00; padding-bottom: 15px; margin-bottom: 25px; }
  .header h1 { font-size: 22px; color: #c00; margin-bottom: 5px; }
  .header .meta { font-size: 12px; color: #666; }
  .section { margin-bottom: 20px; }
  .section h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; color: #444; }
  .info-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
  .info-table td { padding: 8px 12px; border: 1px solid #ddd; font-size: 12px; }
  .info-table td:first-child { background: #f5f5f5; font-weight: 600; width: 40%; color: #555; }
  .reason-box { background: #fff8f8; border: 2px solid #e0c0c0; border-radius: 8px; padding: 15px; margin: 15px 0; }
  .reason-box h3 { font-size: 12px; color: #c00; margin-bottom: 8px; text-transform: uppercase; }
  .reason-box p { font-size: 13px; line-height: 1.6; color: #333; }
  .signatures { display: flex; justify-content: space-between; margin-top: 50px; padding-top: 15px; }
  .sig-box { text-align: center; width: 45%; }
  .sig-box .line { border-top: 1px solid #999; margin-top: 40px; padding-top: 5px; font-size: 11px; color: #666; }
  .footer { margin-top: 30px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
  .print-btn { display: block; margin: 25px auto; padding: 12px 40px; background: #c00; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
  .print-btn:hover { background: #a00; }
  .stamp { text-align: center; margin: 15px 0; }
  .stamp span { display: inline-block; border: 2px solid #c00; color: #c00; padding: 5px 20px; border-radius: 4px; font-weight: 700; font-size: 14px; transform: rotate(-5deg); }
</style></head><body>
<div class="header">
  <div style="font-size:24px;font-weight:900;font-style:italic;margin-bottom:4px"><span style="color:#f97316">adrenalin</span><span style="color:#fb923c">.</span></div>
  <h1>İADE TUTANAĞI</h1>
  <div class="meta"><strong>${kasaName}</strong> — Tarih: ${currentDate} — Saat: ${currentTime}</div>
</div>
<div class="stamp"><span>İADE</span></div>
<div class="section">
  <h2>Orijinal Satış Bilgileri</h2>
  <table class="info-table">
    <tr><td>Paket Adı</td><td>${originalSale.packageName}</td></tr>
    <tr><td>Kategori</td><td>${originalSale.category || '-'}</td></tr>
    <tr><td>Yetişkin / Çocuk</td><td>${originalSale.adultQty} Yetişkin / ${originalSale.childQty} Çocuk</td></tr>
    <tr><td>Para Birimi</td><td>${originalSale.currency}</td></tr>
    <tr><td>Ödeme Tipi (Orijinal)</td><td>${originalSale.paymentType}</td></tr>
    <tr><td>Toplam Tutar</td><td><strong>${Math.abs(originalSale.total).toFixed(2)} ${originalSale.currency === 'TL' || originalSale.currency === 'KK' ? '₺' : originalSale.currency === 'USD' ? '$' : '€'}</strong></td></tr>
    <tr><td>Satış Tarihi</td><td>${new Date(originalSale.timestamp).toLocaleString('tr-TR')}</td></tr>
  </table>
</div>
<div class="section">
  <h2>İade Bilgileri</h2>
  <table class="info-table">
    <tr><td>İade Ödeme Şekli</td><td><strong>${refundSale.paymentType}</strong></td></tr>
    ${kkTxId ? `<tr><td>Kredi Kartı İade İşlem No</td><td style="font-weight:700;color:#1565c0">${kkTxId}</td></tr>` : ''}
    <tr><td>İade Tutarı</td><td style="color:#c00;font-weight:700">${Math.abs(refundSale.total).toFixed(2)} ${originalSale.currency === 'TL' || originalSale.currency === 'KK' ? '₺' : originalSale.currency === 'USD' ? '$' : '€'}</td></tr>
    <tr><td>İşlemi Yapan (Kasa Personeli)</td><td>${userName} — ${kasaName}</td></tr>
    <tr><td>İşlem Tarihi / Saati</td><td>${currentDate} - ${currentTime}</td></tr>
    ${atlantisRows}
  </table>
</div>
<div class="reason-box">
  <h3>İade Nedeni</h3>
  <p>${reason}</p>
</div>
<div class="signatures">
  <div class="sig-box"><div class="line">İşletme Müdür / Emre Ozan</div></div>
  <div class="sig-box"><div class="line">Kasa Personeli / ${userName} (${kasaName})</div></div>
</div>
<button class="print-btn no-print" onclick="window.print()">🖨️ Yazdır / PDF Kaydet</button>
<div class="footer">Adrenalin Satış Sistemi — İade Tutanağı — ${kasaName} — ${currentDate}</div>
</body></html>`;

    const w = window.open('', 'reportWindow', 'width=850,height=700,scrollbars=yes,resizable=yes');
    if (w) { w.document.write(html); w.document.close(); }
  };
  
  // Excel Export Function
  const exportToExcel = async () => {
    const currentDate = new Date().toLocaleDateString('tr-TR');
    const session = getUserSession();
    const userName = session.personnel?.fullName || 'Kullanıcı';
    const kasaName = session.kasa?.name || 'Kasa';
    
    // Kasa avanslarını Supabase'den al
    const kasaId = session.kasa?.id || 'sinema';
    const advances = await loadAdvancesFromSupabase(kasaId);
    
    // Z Rapor hesaplamaları
    const cashTlTotal = totals.cashTl + (totals.cashUsd * usdRate) + (totals.cashEur * eurRate);
    const grandTotal = totals.kkTl + cashTlTotal;
    
    // Satır verilerini oluştur
    const dataRows = sales.filter(sale => !sale.isRefund && sale.category !== 'Ücretsiz').map(sale => {
      const isRefunded = sales.some(s => s.isRefund && s.refundOfSaleId === sale.id);
      const namePrefix = isRefunded ? '[İade] ' : '';
      return `<Row ss:Height="20">
      <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${namePrefix}${sale.packageName}</Data></Cell>
      <Cell ss:StyleID="DataCenter"><Data ss:Type="Number">${sale.adultQty}</Data></Cell>
      <Cell ss:StyleID="DataCenter"><Data ss:Type="Number">${sale.childQty}</Data></Cell>
      <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${sale.currency}</Data></Cell>
      <Cell ss:StyleID="DataCenter"><Data ss:Type="String">${sale.paymentType === 'Kredi Kartı' ? 'Kredi Kartı' : sale.paymentType === 'Çoklu' ? 'Çoklu' : 'Nakit'}</Data></Cell>
      <Cell ss:StyleID="DataRight"><Data ss:Type="Number">${isRefunded ? 0 : sale.total.toFixed(2)}</Data></Cell>
      <Cell ss:StyleID="DataRight"><Data ss:Type="${!isRefunded && sale.kkTl !== 0 ? 'Number' : 'String'}">${!isRefunded && sale.kkTl !== 0 ? sale.kkTl.toFixed(2) : '-'}</Data></Cell>
      <Cell ss:StyleID="DataRight"><Data ss:Type="${!isRefunded && sale.cashTl !== 0 ? 'Number' : 'String'}">${!isRefunded && sale.cashTl !== 0 ? sale.cashTl.toFixed(2) : '-'}</Data></Cell>
      <Cell ss:StyleID="DataRight"><Data ss:Type="${!isRefunded && sale.cashUsd !== 0 ? 'Number' : 'String'}">${!isRefunded && sale.cashUsd !== 0 ? sale.cashUsd.toFixed(2) : '-'}</Data></Cell>
      <Cell ss:StyleID="DataRight"><Data ss:Type="${!isRefunded && sale.cashEur !== 0 ? 'Number' : 'String'}">${!isRefunded && sale.cashEur !== 0 ? sale.cashEur.toFixed(2) : '-'}</Data></Cell>
    </Row>`;
    }).join('');
    
    const html = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
<Styles>
  <Style ss:ID="Default" ss:Name="Normal">
    <Alignment ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10"/>
  </Style>
  <Style ss:ID="Title">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#1F4E79" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="PanelHeaderBlue">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#2196F3" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="PanelHeaderYellow">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#000000"/>
    <Interior ss:Color="#FFC107" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="PanelHeaderGreen">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#4CAF50" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="PanelHeaderPurple">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#9C27B0" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="PanelLabel">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
    <Interior ss:Color="#F5F5F5" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="PanelValue">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
    <Interior ss:Color="#F5F5F5" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="PanelTotal">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#FF5722" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="PanelTotalLabel">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#FF5722" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="Empty">
    <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="ZRaporLabel">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
    <Interior ss:Color="#F5F5F5" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="ZRaporValue">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
    <Interior ss:Color="#F5F5F5" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="ZRaporLabelBold">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
    <Interior ss:Color="#E0E0E0" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="ZRaporValueBold">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1"/>
    <Interior ss:Color="#E0E0E0" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="ZRaporGrandLabel">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#4CAF50" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="ZRaporGrandValue">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#4CAF50" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="SectionHeader">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#37474F" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="TableHeader">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#5B9BD5" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="TableHeaderLeft">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#5B9BD5" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="DataLeft">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="DataCenter">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="DataRight">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="DataRightGreen">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="DataRightBlue">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="DataRightYellow">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="DataRightPurple">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
  </Style>
  <Style ss:ID="TotalRow">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#00B050" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
  <Style ss:ID="TotalLabel">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#00B050" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/>
    </Borders>
  </Style>
</Styles>
<Worksheet ss:Name="Gunluk Rapor">
<Table ss:DefaultColumnWidth="100" ss:DefaultRowHeight="22">
  <Column ss:Width="140"/>
  <Column ss:Width="80"/>
  <Column ss:Width="60"/>
  <Column ss:Width="100"/>
  <Column ss:Width="100"/>
  <Column ss:Width="100"/>
  <Column ss:Width="100"/>
  <Column ss:Width="100"/>
  <Column ss:Width="100"/>
  <Column ss:Width="100"/>
  
  <!-- BASLIK -->
  <Row ss:Height="35">
    <Cell ss:MergeAcross="9" ss:StyleID="Title"><Data ss:Type="String">GUNLUK RAPOR - ${kasaName} - ${userName} - ${currentDate}</Data></Cell>
  </Row>
  <Row ss:Height="10"></Row>
  
  <!-- 3 PANEL YAN YANA: AVANS | KUR | Z RAPOR -->
  <!-- Panel Basliklari -->
  <Row ss:Height="25">
    <Cell ss:MergeAcross="2" ss:StyleID="PanelHeaderBlue"><Data ss:Type="String">KASA AVANSLARI</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="PanelHeaderYellow"><Data ss:Type="String">GUNLUK KURLAR</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:MergeAcross="2" ss:StyleID="PanelHeaderGreen"><Data ss:Type="String">Z RAPOR</Data></Cell>
  </Row>
  
  <!-- Satir 1: Avans TL / Kur USD / Z-KK -->
  <Row ss:Height="24">
    <Cell ss:StyleID="PanelLabel"><Data ss:Type="String">TL Avans</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="PanelValue"><Data ss:Type="String">${advances.tlAdvance.toFixed(2)} TL</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="PanelLabel"><Data ss:Type="String">USD Kuru</Data></Cell>
    <Cell ss:StyleID="PanelValue"><Data ss:Type="String">${usdRate.toFixed(4)} TL</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="ZRaporLabel"><Data ss:Type="String">Kredi Karti (TL)</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="ZRaporValue"><Data ss:Type="String">${totals.kkTl.toFixed(2)} TL</Data></Cell>
  </Row>
  
  <!-- Satir 2: Avans USD / Kur EUR / Z-Nakit TL -->
  <Row ss:Height="24">
    <Cell ss:StyleID="PanelLabel"><Data ss:Type="String">USD Avans</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="PanelValue"><Data ss:Type="String">${advances.usdAdvance.toFixed(2)} $</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="PanelLabel"><Data ss:Type="String">EUR Kuru</Data></Cell>
    <Cell ss:StyleID="PanelValue"><Data ss:Type="String">${eurRate.toFixed(4)} TL</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="ZRaporLabel"><Data ss:Type="String">Nakit TL</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="ZRaporValue"><Data ss:Type="String">${totals.cashTl.toFixed(2)} TL</Data></Cell>
  </Row>
  
  <!-- Satir 3: Avans EUR / bos / Z-Nakit USD -->
  <Row ss:Height="24">
    <Cell ss:StyleID="PanelLabel"><Data ss:Type="String">EUR Avans</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="PanelValue"><Data ss:Type="String">${advances.eurAdvance.toFixed(2)} EUR</Data></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="ZRaporLabel"><Data ss:Type="String">Nakit USD</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="ZRaporValue"><Data ss:Type="String">${totals.cashUsd.toFixed(2)} $</Data></Cell>
  </Row>
  
  <!-- Satir 4: bos / bos / Z-Nakit EUR -->
  <Row ss:Height="24">
    <Cell ss:MergeAcross="2" ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="ZRaporLabel"><Data ss:Type="String">Nakit EUR</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="ZRaporValue"><Data ss:Type="String">${totals.cashEur.toFixed(2)} EUR</Data></Cell>
  </Row>
  
  <!-- Satir 5: bos / bos / Z-Toplam Nakit -->
  <Row ss:Height="24">
    <Cell ss:MergeAcross="2" ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="ZRaporLabelBold"><Data ss:Type="String">TOPLAM NAKIT (TL)</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="ZRaporValueBold"><Data ss:Type="String">${cashTlTotal.toFixed(2)} TL</Data></Cell>
  </Row>
  
  <!-- Satir 6: Z Rapor Genel Toplam -->
  <Row ss:Height="28">
    <Cell ss:MergeAcross="2" ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="Empty"></Cell>
    <Cell ss:StyleID="ZRaporGrandLabel"><Data ss:Type="String">GENEL TOPLAM (TL)</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="ZRaporGrandValue"><Data ss:Type="String">${grandTotal.toFixed(2)} TL</Data></Cell>
  </Row>
  
  <Row ss:Height="15"></Row>
  
  <!-- SATIS PANOSU -->
  <Row ss:Height="25">
    <Cell ss:MergeAcross="9" ss:StyleID="SectionHeader"><Data ss:Type="String">SATIS PANOSU</Data></Cell>
  </Row>
  <Row ss:Height="20">
    <Cell ss:StyleID="TableHeaderLeft"><Data ss:Type="String">Paket</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Yetiskin</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Cocuk</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Para Birimi</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Odeme Tipi</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Toplam</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Kredi Kartı (TL)</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Nakit (TL)</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Nakit (USD)</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Nakit (EUR)</Data></Cell>
  </Row>
  
  ${dataRows}
  
  <Row ss:Height="5"></Row>
  <Row ss:Height="25">
    <Cell ss:MergeAcross="5" ss:StyleID="TotalLabel"><Data ss:Type="String">TOPLAM OZET</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${totals.kkTl.toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${totals.cashTl.toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${totals.cashUsd.toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${totals.cashEur.toFixed(2)}</Data></Cell>
  </Row>
</Table>
</Worksheet>
</Workbook>`;
    
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Gunluk_Rapor_${kasaName.replace(/\s/g, '_')}_${currentDate.replace(/\./g, '-')}.xls`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  
  // HTML Export Function - Yazdırılabilir Rapor
  const exportToHTML = async () => {
    const currentDate = new Date().toLocaleDateString('tr-TR');
    const session = getUserSession();
    const userName = session.personnel?.fullName || 'Kullanıcı';
    const kasaName = session.kasa?.name || 'Kasa';

    const kasaIdHtml = session.kasa?.id || 'sinema';
    const advances = await loadAdvancesFromSupabase(kasaIdHtml);

    const cashTlTotal = totals.cashTl + (totals.cashUsd * usdRate) + (totals.cashEur * eurRate);
    const grandTotal = totals.kkTl + cashTlTotal;
    const totalAdult = sales.reduce((sum, s) => sum + s.adultQty, 0);
    const totalChild = sales.reduce((sum, s) => sum + s.childQty, 0);
    const refundCount = sales.filter(s => s.isRefund).length;

    const salesRows = sales.filter(s => !s.isRefund && s.category !== 'Ücretsiz').map((s, i) => {
      const refundEntry = sales.find(r => r.isRefund && r.refundOfSaleId === s.id);
      const isRefunded = !!refundEntry;
      const strikeStyle = isRefunded ? 'text-decoration:line-through;color:#999;' : '';
      return `
      <tr style="${isRefunded ? 'background:#fff0f0;' : (i % 2 === 0 ? 'background:#fafafa;' : '')}">
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:center">${i + 1}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0">
          ${isRefunded ? '<span style="background:#fee;border:1px solid #fcc;color:#c00;font-size:10px;padding:1px 5px;border-radius:3px;margin-right:5px;font-weight:600">İade Edildi</span>' : ''}
          ${s.isCrossSale && !isRefunded ? '<span style="background:#fff3e0;border:1px solid #ffe0b2;color:#e65100;font-size:10px;padding:1px 5px;border-radius:3px;margin-right:5px">⇄</span>' : ''}
          <span style="${strikeStyle}">${s.packageName}</span>
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:center;${strikeStyle}">${s.adultQty}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:center;${strikeStyle}">${s.childQty}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:center">${s.paymentType === 'Kredi Kartı' ? 'Kredi Kartı' : s.paymentType === 'Çoklu' ? 'Çoklu' : 'Nakit'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:right;${strikeStyle}">${s.kkTl !== 0 ? s.kkTl.toFixed(2) : '-'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:right;${strikeStyle}">${s.cashTl !== 0 ? s.cashTl.toFixed(2) : '-'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:right;${strikeStyle}">${s.cashUsd !== 0 ? s.cashUsd.toFixed(2) : '-'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;text-align:right;${strikeStyle}">${s.cashEur !== 0 ? s.cashEur.toFixed(2) : '-'}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8">
<title>Günlük Satış Raporu - ${kasaName} - ${currentDate}</title>
<style>
  @page { size: A4; margin: 15mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; background: #fff; padding: 20px; max-width: 820px; margin: 0 auto; }
  .header { border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 20px; }
  .header h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .header .meta { font-size: 12px; color: #666; }
  .header .meta span { margin-right: 15px; }
  .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
  .info-box { border: 1px solid #ddd; border-radius: 6px; padding: 10px; }
  .info-box h3 { font-size: 11px; font-weight: 700; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
  .info-row .lbl { color: #666; }
  .info-row .val { font-weight: 600; }
  .cards { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
  .card { flex: 1; min-width: 120px; border: 1px solid #ccc; border-radius: 6px; padding: 10px 14px; }
  .card .label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .card .value { font-size: 18px; font-weight: 700; }
  .card .sub { font-size: 10px; color: #999; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 15px; }
  th { background: #222; color: #fff; padding: 8px 10px; text-align: center; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
  th:nth-child(2) { text-align: left; }
  .totals-row td { background: #222; color: #fff; font-weight: 700; padding: 8px 10px; }
  .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #ddd; padding-top: 8px; }
  .print-btn { display: block; margin: 20px auto; padding: 10px 30px; background: #222; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
  .print-btn:hover { background: #444; }
</style></head><body>

<div class="header">
  <div style="font-size:24px;font-weight:900;font-style:italic;margin-bottom:4px"><span style="color:#f97316">adrenalin</span><span style="color:#fb923c">.</span></div>
  <h1>GÜNLÜK SATIŞ RAPORU</h1>
  <div class="meta">
    <span><strong>${kasaName}</strong></span>
    <span>Personel: ${userName}</span>
    <span>Tarih: ${currentDate}</span>
  </div>
</div>

<div class="info-grid">
  <div class="info-box">
    <h3>Kasa Avansları</h3>
    <div class="info-row"><span class="lbl">TL Avans</span><span class="val">${advances.tlAdvance.toFixed(2)} ₺</span></div>
    <div class="info-row"><span class="lbl">USD Avans</span><span class="val">${advances.usdAdvance.toFixed(2)} $</span></div>
    <div class="info-row"><span class="lbl">EUR Avans</span><span class="val">${advances.eurAdvance.toFixed(2)} €</span></div>
  </div>
  <div class="info-box">
    <h3>Günlük Kurlar</h3>
    <div class="info-row"><span class="lbl">USD Kuru</span><span class="val">${usdRate.toFixed(4)} ₺</span></div>
    <div class="info-row"><span class="lbl">EUR Kuru</span><span class="val">${eurRate.toFixed(4)} ₺</span></div>
    <div class="info-row"><span class="lbl">PAX</span><span class="val">${totalAdult} Yetişkin + ${totalChild} Çocuk = ${totalAdult + totalChild}</span></div>
  </div>
  <div class="info-box">
    <h3>Z Rapor Özeti</h3>
    <div class="info-row"><span class="lbl">Kredi Kartı</span><span class="val">${totals.kkTl.toFixed(2)} ₺</span></div>
    <div class="info-row"><span class="lbl">Nakit TL</span><span class="val">${totals.cashTl.toFixed(2)} ₺</span></div>
    <div class="info-row"><span class="lbl">Nakit USD</span><span class="val">${totals.cashUsd.toFixed(2)} $</span></div>
    <div class="info-row"><span class="lbl">Nakit EUR</span><span class="val">${totals.cashEur.toFixed(2)} €</span></div>
  </div>
</div>

<div class="cards">
  <div class="card"><div class="label">Kredi Kartı</div><div class="value">${totals.kkTl.toFixed(2)} ₺</div></div>
  <div class="card"><div class="label">Nakit TL</div><div class="value">${totals.cashTl.toFixed(2)} ₺</div></div>
  <div class="card"><div class="label">Nakit USD</div><div class="value">${totals.cashUsd.toFixed(2)} $</div><div class="sub">≈ ${(totals.cashUsd * usdRate).toFixed(2)} ₺</div></div>
  <div class="card"><div class="label">Nakit EUR</div><div class="value">${totals.cashEur.toFixed(2)} €</div><div class="sub">≈ ${(totals.cashEur * eurRate).toFixed(2)} ₺</div></div>
  <div class="card" style="border-width:2px;border-color:#222"><div class="label">Genel Toplam</div><div class="value">${grandTotal.toFixed(2)} ₺</div></div>
</div>

<table>
  <thead><tr>
    <th style="width:30px">#</th>
    <th style="text-align:left">Paket</th>
    <th>Yetişkin</th><th>Çocuk</th><th>Ödeme</th>
    <th style="text-align:right">Kredi Kartı (₺)</th>
    <th style="text-align:right">Nakit (₺)</th>
    <th style="text-align:right">Nakit ($)</th>
    <th style="text-align:right">Nakit (€)</th>
  </tr></thead>
  <tbody>${salesRows}</tbody>
  <tfoot><tr class="totals-row">
    <td></td>
    <td style="text-align:left">TOPLAM</td>
    <td style="text-align:center">${totalAdult}</td>
    <td style="text-align:center">${totalChild}</td>
    <td></td>
    <td style="text-align:right">${totals.kkTl.toFixed(2)}</td>
    <td style="text-align:right">${totals.cashTl.toFixed(2)}</td>
    <td style="text-align:right">${totals.cashUsd.toFixed(2)}</td>
    <td style="text-align:right">${totals.cashEur.toFixed(2)}</td>
  </tr></tfoot>
</table>

<button class="print-btn no-print" onclick="window.print()">🖨️ Yazdır</button>
<div class="footer">Adrenalin Satış Sistemi — ${kasaName} — ${currentDate}</div>
</body></html>`;

    const w = window.open('', 'reportWindow', 'width=850,height=700,scrollbars=yes,resizable=yes');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const totals = useMemo(() => ({
    kkTl: sales.reduce((sum, s) => sum + s.kkTl, 0),
    cashTl: sales.reduce((sum, s) => sum + s.cashTl, 0),
    cashUsd: sales.reduce((sum, s) => sum + s.cashUsd, 0),
    cashEur: sales.reduce((sum, s) => sum + s.cashEur, 0),
  }), [sales]);

  const totalAdultCount = sales.reduce((sum, s) => sum + s.adultQty, 0);
  const totalChildCount = sales.reduce((sum, s) => sum + s.childQty, 0);
  const refundCount = sales.filter(s => s.isRefund).length;
  const cashTlTotal = totals.cashTl + (totals.cashUsd * usdRate) + (totals.cashEur * eurRate);
  const grandTotal = totals.kkTl + cashTlTotal;

  // ── Haftalık Hedef ──
  const [weeklyTarget, setWeeklyTarget] = useState(0);
  const [weeklyCumulativeTl, setWeeklyCumulativeTl] = useState(0);
  const weeklyPercentage = weeklyTarget > 0 ? Math.min((weeklyCumulativeTl / weeklyTarget) * 100, 100) : 0;

  useEffect(() => {
    const currentKasa = currentKasaId;
    if (!currentKasa || currentKasa === 'genel') return;
    getWeeklyTarget(currentKasa).then(t => {
      setWeeklyTarget(t?.targetAmount || 0);
    });
    // Haftalık kümülatif ciro
    getWeeklyProgress(currentKasa).then(p => {
      setWeeklyCumulativeTl(p?.totalTl || 0);
    });
  }, [currentKasaId, sales]);

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">Satış Panosu</h2>
            <p className="text-xs text-gray-400 mt-0.5 font-medium">
              {sales.length} satış{refundCount > 0 ? ` · ${refundCount} iade` : ''} · <span className="text-sky-400 font-bold">{totalAdultCount + totalChildCount} PAX</span>
              {integrationActive && (
                <span className={`ml-2 inline-flex items-center gap-1 ${integrationReady ? 'text-emerald-400' : 'text-yellow-400'}`}>
                  <Wifi className="w-3 h-3" />
                  {integrationReady ? 'Sistem Aktif' : 'Bağlantı Yok'}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {sales.length > 0 && (
            <button
              onClick={exportToHTML}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Rapor</span>
            </button>
          )}
          <button
            onClick={async () => {
              const cs = await loadCrossSalesFromFirebase();
              if (cs.length === 0) { alert('Çapraz satış kaydı bulunamadı'); return; }
              generateCrossHTMLReport(cs);
            }}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700"
          >
            <Shuffle className="w-4 h-4" />
            <span className="hidden sm:inline">Çapraz Rapor</span>
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-orange-500/20 transition-all duration-200 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white"
          >
            <Plus className="w-4 h-4" /> Satış Ekle
          </button>
        </div>
      </div>

      {/* ── SUMMARY CARDS ── */}
      {sales.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          <div className="bg-gradient-to-br from-orange-950/80 to-gray-900 rounded-xl border border-orange-500/30 p-3 shadow-lg shadow-orange-500/10 ring-1 ring-orange-500/10">
            <div className="flex items-center gap-2 mb-1.5">
              <CreditCard className="w-4 h-4 text-orange-400" />
              <span className="text-[10px] text-orange-300/70 font-bold uppercase tracking-widest">Kredi Kartı</span>
            </div>
            <p className="text-lg font-black text-orange-400">{totals.kkTl.toFixed(2)} <span className="text-xs font-normal text-orange-500/60">₺</span></p>
          </div>
          <div className="bg-gradient-to-br from-blue-950/80 to-gray-900 rounded-xl border border-blue-500/30 p-3 shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/10">
            <div className="flex items-center gap-2 mb-1.5">
              <Banknote className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] text-blue-300/70 font-bold uppercase tracking-widest">Nakit TL</span>
            </div>
            <p className="text-lg font-black text-blue-400">{totals.cashTl.toFixed(2)} <span className="text-xs font-normal text-blue-500/60">₺</span></p>
          </div>
          <div className="bg-gradient-to-br from-amber-950/80 to-gray-900 rounded-xl border border-amber-500/30 p-3 shadow-vibrant-amber ring-1 ring-amber-500/10">
            <div className="flex items-center gap-2 mb-1.5">
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span className="text-[10px] text-amber-300/70 font-bold uppercase tracking-widest">USD</span>
            </div>
            <p className="text-lg font-black text-amber-400">{totals.cashUsd.toFixed(2)} <span className="text-xs font-normal text-amber-500/60">$</span></p>
          </div>
          <div className="bg-gradient-to-br from-violet-950/80 to-gray-900 rounded-xl border border-violet-500/30 p-3 shadow-vibrant-violet ring-1 ring-violet-500/10">
            <div className="flex items-center gap-2 mb-1.5">
              <Euro className="w-4 h-4 text-violet-400" />
              <span className="text-[10px] text-violet-300/70 font-bold uppercase tracking-widest">EUR</span>
            </div>
            <p className="text-lg font-black text-violet-400">{totals.cashEur.toFixed(2)} <span className="text-xs font-normal text-violet-500/60">€</span></p>
          </div>
          <div className="bg-gradient-to-br from-sky-950/80 to-gray-900 rounded-xl border border-sky-500/30 p-3 shadow-vibrant-sky ring-1 ring-sky-500/10">
            <div className="flex items-center gap-2 mb-1.5">
              <Users className="w-4 h-4 text-sky-400" />
              <span className="text-[10px] text-sky-300/70 font-bold uppercase tracking-widest">PAX</span>
            </div>
            <p className="text-lg font-black text-sky-400">{totalAdultCount}<span className="text-xs font-normal text-sky-500/60"> Yetişkin</span> + {totalChildCount}<span className="text-xs font-normal text-sky-500/60"> Çocuk</span></p>
          </div>
          <div className="bg-gradient-to-br from-red-950/80 to-gray-900 rounded-xl border border-red-400/40 p-3 shadow-lg shadow-red-500/10 ring-1 ring-red-400/20">
            <div className="flex items-center gap-2 mb-1.5">
              <TrendingUp className="w-4 h-4 text-white" />
              <span className="text-[10px] text-red-300/70 font-bold uppercase tracking-widest">Toplam</span>
            </div>
            <p className="text-lg font-black text-white">{grandTotal.toFixed(2)} <span className="text-xs font-normal text-gray-400">₺</span></p>
          </div>
        </div>
      )}

      {/* ── HAFTALIK HEDEF PROGRESS BAR (kompakt) ── */}
      {weeklyTarget > 0 && (
        <div className="flex items-center gap-2 px-1 py-1.5">
          <Target className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex-shrink-0">Haftalık Hedef</span>
          <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                weeklyPercentage >= 100 ? 'bg-gradient-to-r from-emerald-500 to-green-400' :
                weeklyPercentage >= 75 ? 'bg-gradient-to-r from-amber-500 to-yellow-400' :
                weeklyPercentage >= 50 ? 'bg-gradient-to-r from-orange-500 to-amber-400' :
                'bg-gradient-to-r from-rose-500 to-red-400'
              }`}
              style={{ width: `${Math.min(weeklyPercentage, 100)}%` }}
            />
          </div>
          <span className={`text-xs font-black flex-shrink-0 ${
            weeklyPercentage >= 100 ? 'text-emerald-400' :
            weeklyPercentage >= 75 ? 'text-amber-400' :
            weeklyPercentage >= 50 ? 'text-orange-400' :
            'text-rose-400'
          }`}>
            %{weeklyPercentage.toFixed(0)}{weeklyPercentage >= 100 ? ' 🎉' : ''}
          </span>
        </div>
      )}

      {/* ── ADD SALE MODAL ── */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-3 overscroll-contain" onClick={(e) => { if (e.target === e.currentTarget) { setShowAddForm(false); setSelectedCategory(''); setErrorMessage(''); setSplitMode(false); } }}>
          <div className={`bg-gradient-to-b from-gray-900 to-[#0c0c14] border border-gray-700/60 rounded-2xl w-full ${splitMode ? 'max-w-5xl' : 'max-w-4xl'} shadow-2xl transition-all duration-300 max-h-[92vh] flex flex-col`}>
            {/* Modal Header */}
            <div className="flex-shrink-0 bg-gradient-to-r from-gray-900/95 via-gray-900/98 to-gray-900/95 backdrop-blur-xl border-b border-gray-700/50 px-5 py-3 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/25">
                    <Plus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Yeni Satış</h3>
                    {selectedCategory && (
                      <p className={`text-[11px] font-medium ${CATEGORY_CONFIG[selectedCategory]?.color || 'text-gray-500'}`}>
                        {selectedCategory}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setShowAddForm(false); setSelectedCategory(''); setErrorMessage(''); setSplitMode(false); }}
                  className="text-gray-500 hover:text-white w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* ── SIDE-BY-SIDE LAYOUT: Sol=Kategori, Orta=Form, Sağ=Çoklu Ödeme ── */}
            <div className="flex-1 overflow-hidden flex flex-col sm:flex-row">
              {/* SOL PANEL: Kategori Seçimi (splitMode'da gizlenir) */}
              {!splitMode && (
              <div className="flex-shrink-0 sm:w-56 sm:border-r border-b sm:border-b-0 border-gray-700/40 p-3 sm:p-4 overflow-y-auto">
                <>
                <label className="block text-[10px] text-gray-500 mb-2 font-bold uppercase tracking-widest">Kategori</label>
                <div className="flex sm:flex-col gap-1.5 overflow-x-auto sm:overflow-x-visible pb-1 sm:pb-0">
                  {CATEGORY_GROUPS.map((group) => {
                    const cfg = CATEGORY_CONFIG[group];
                    const Icon = cfg.icon;
                    const isActive = selectedCategory === group;
                    const pkgCount = kasaPackages.filter(p => p.category === group).length;
                    return (
                      <button
                        key={group}
                        onClick={() => {
                          setSelectedCategory(group);
                          setFormData({ ...formData, packageId: '', adultQty: '0', childQty: '0', paymentType: '', splitKkTl: '', splitCashTl: '', splitCashUsd: '', splitCashEur: '', isCrossSale: group.startsWith('Çapraz'), selectedCurrency: '' });
                          setSplitMode(false);
                        }}
                        disabled={pkgCount === 0}
                        className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all duration-200 text-left whitespace-nowrap sm:whitespace-normal sm:w-full flex-shrink-0 ${
                          pkgCount === 0
                            ? 'opacity-30 cursor-not-allowed bg-gray-900 border-gray-800'
                            : isActive
                              ? `${cfg.bg} ${cfg.border} ring-2 ${cfg.ring} shadow-lg`
                              : 'bg-gray-800/60 border-gray-700/50 hover:bg-gray-800 hover:border-gray-600'
                        }`}
                      >
                        {isActive && (
                          <div className={`absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-gradient-to-br ${cfg.badge} flex items-center justify-center`}>
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? cfg.bg : 'bg-gray-700/50'} ${isActive ? cfg.border : 'border-gray-600/30'} border`}>
                          <Icon className={`w-3.5 h-3.5 ${isActive ? cfg.color : 'text-gray-500'}`} />
                        </div>
                        <div className="min-w-0 pr-4">
                          <p className={`text-xs font-bold truncate ${isActive ? cfg.color : 'text-gray-300'}`}>{group}</p>
                          <p className={`text-[9px] truncate ${isActive ? 'text-gray-400' : 'text-gray-600'}`}>{cfg.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                  </>
              </div>
              )}

              {/* FORM PANEL */}
              <div ref={modalScrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5">
                {/* Geri butonu - splitMode'da kategorilere dönmek için */}
                {splitMode && (
                  <button
                    type="button"
                    onClick={() => setSplitMode(false)}
                    className="flex items-center gap-1.5 mb-3 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-white bg-gray-800/60 border border-gray-700/50 hover:bg-gray-700 transition-all"
                  >
                    <span>←</span> Kategorilere Dön
                  </button>
                )}
                {!selectedCategory ? (
                  <div className="text-center py-12 border border-dashed border-gray-700/50 rounded-xl bg-gray-800/20 h-full flex flex-col items-center justify-center">
                    <Package className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 font-medium">Devam etmek için kategori seçin</p>
                    <p className="text-[11px] text-gray-600 mt-1">Soldan bir satış kategorisi belirleyin</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* ── ADIM 1: Paket Seçimi ── */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Paket</label>
                      {isDualCurrencyCategory(selectedCategory) ? (
                        /* Dövizli kategoriler: Benzersiz isim listesi */
                        <div className="relative">
                          <select
                            value={formData.packageId ? (kasaPackages.find(p => p.id === formData.packageId)?.name || '') : ''}
                            onChange={(e) => {
                              const pkgName = e.target.value;
                              const isCross = selectedCategory.startsWith('Çapraz');
                              if (!pkgName) {
                                setFormData({ ...formData, packageId: '', isCrossSale: isCross, selectedCurrency: '', payInTL: false });
                              } else {
                                // Münferit/Çapraz Münferit → varsayılan TL, diğerleri → USD
                                const isTlNative = ['Münferit', 'Çapraz Münferit'].includes(selectedCategory);
                                const defaultCurrency: 'USD' | 'EUR' | 'TL' = isTlNative ? 'TL' : 'USD';
                                const resolvedId = resolvePackageId(pkgName, defaultCurrency, selectedCategory);
                                setFormData({ ...formData, packageId: resolvedId, isCrossSale: isCross, selectedCurrency: defaultCurrency, payInTL: false });
                              }
                            }}
                            className={`w-full px-3 py-2.5 bg-gray-800 border rounded-xl text-white text-sm focus:outline-none transition-colors appearance-none pr-8 ${CATEGORY_CONFIG[selectedCategory].border}`}
                          >
                            <option value="">Paket Seçiniz...</option>
                            {getUniquePackageNames(selectedCategory).map((pkg) => (
                              <option key={pkg.name} value={pkg.name}>{pkg.name}</option>
                            ))}
                          </select>
                          <ChevronRight className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
                        </div>
                      ) : (
                        /* TL kategoriler: Normal paket listesi */
                        <div className="relative">
                          <select
                            value={formData.packageId}
                            onChange={(e) => {
                              const selectedPkg = kasaPackages.find(p => p.id === e.target.value);
                              const isCross = selectedPkg?.category?.startsWith('Çapraz');
                              setFormData({ ...formData, packageId: e.target.value, isCrossSale: isCross ? true : false });
                            }}
                            className={`w-full px-3 py-2.5 bg-gray-800 border rounded-xl text-white text-sm focus:outline-none transition-colors appearance-none pr-8 ${CATEGORY_CONFIG[selectedCategory].border}`}
                          >
                            <option value="">Paket Seçiniz...</option>
                            {kasaPackages.filter(pkg => pkg.category === selectedCategory).filter((pkg, idx, arr) => arr.findIndex(p => p.name === pkg.name) === idx).map((pkg) => (
                              <option key={pkg.id} value={pkg.id}>{pkg.name} — Y:{pkg.adultPrice} / Ç:{pkg.childPrice} ₺</option>
                            ))}
                          </select>
                          <ChevronRight className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
                        </div>
                      )}
                    </div>

                    {/* ── ADIM 2: Kişi Sayısı (Numaratör) ── */}
                    {(() => {
                      const stepLocked = !formData.packageId;
                      return (
                        <div className={`relative ${stepLocked ? 'opacity-40 pointer-events-none' : ''}`}>
                          {stepLocked && <div className="absolute inset-0 z-10" />}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Yetişkin</label>
                              <div className="flex items-center bg-gray-800 border border-gray-700/80 rounded-xl overflow-hidden">
                                <button type="button" onClick={() => setFormData({ ...formData, adultQty: String(Math.max(0, (parseInt(formData.adultQty) || 0) - 1)) })} className="w-9 h-10 text-gray-400 hover:bg-gray-700 hover:text-white text-base font-bold transition-colors flex items-center justify-center flex-shrink-0">−</button>
                                <input type="number" min="0" value={formData.adultQty} onChange={(e) => setFormData({ ...formData, adultQty: e.target.value.replace(/[^0-9]/g, '') || '0' })} onFocus={(e) => { if (e.target.value === '0') e.target.select(); }} className="flex-1 h-10 bg-transparent text-white text-sm font-bold text-center min-w-[30px] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                <button type="button" onClick={() => setFormData({ ...formData, adultQty: String((parseInt(formData.adultQty) || 0) + 1) })} className="w-9 h-10 text-gray-400 hover:bg-gray-700 hover:text-white text-base font-bold transition-colors flex items-center justify-center flex-shrink-0">+</button>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Çocuk</label>
                              <div className="flex items-center bg-gray-800 border border-gray-700/80 rounded-xl overflow-hidden">
                                <button type="button" onClick={() => setFormData({ ...formData, childQty: String(Math.max(0, (parseInt(formData.childQty) || 0) - 1)) })} className="w-9 h-10 text-gray-400 hover:bg-gray-700 hover:text-white text-base font-bold transition-colors flex items-center justify-center flex-shrink-0">−</button>
                                <input type="number" min="0" value={formData.childQty} onChange={(e) => setFormData({ ...formData, childQty: e.target.value.replace(/[^0-9]/g, '') || '0' })} onFocus={(e) => { if (e.target.value === '0') e.target.select(); }} className="flex-1 h-10 bg-transparent text-white text-sm font-bold text-center min-w-[30px] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                <button type="button" onClick={() => setFormData({ ...formData, childQty: String((parseInt(formData.childQty) || 0) + 1) })} className="w-9 h-10 text-gray-400 hover:bg-gray-700 hover:text-white text-base font-bold transition-colors flex items-center justify-center flex-shrink-0">+</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── ADIM 3: Para Birimi + TL ile Öde Seçimi ── */}
                    {isDualCurrencyCategory(selectedCategory) && formData.packageId && (() => {
                      const selectedPkgName = kasaPackages.find(p => p.id === formData.packageId)?.name || '';
                      const usdPkg = kasaPackages.find(p => p.category === selectedCategory && p.name === selectedPkgName && p.currency === 'USD');
                      const eurPkg = kasaPackages.find(p => p.category === selectedCategory && p.name === selectedPkgName && p.currency === 'EUR');
                      const tlPkg = kasaPackages.find(p => p.category === selectedCategory && p.name === selectedPkgName && p.currency === 'TL');
                      const isTlNative = ['Münferit', 'Çapraz Münferit'].includes(selectedCategory);

                      return (
                        <div className="space-y-2">
                          <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Para Birimi</label>
                          {isTlNative ? (
                            /* ── Münferit / Çapraz Münferit: TL bazlı, dövizle ödeme seçeneği ── */
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (tlPkg) setFormData({ ...formData, packageId: tlPkg.id, selectedCurrency: 'TL', payInTL: false });
                                  }}
                                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border transition-all text-sm font-bold ${
                                    formData.selectedCurrency === 'TL'
                                      ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                                      : 'bg-gray-800/60 border-gray-700/50 text-gray-500 hover:text-gray-300'
                                  }`}
                                >
                                  <span className="text-sm font-black">₺</span> TL
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (tlPkg) setFormData({ ...formData, packageId: tlPkg.id, selectedCurrency: 'USD', payInTL: false });
                                  }}
                                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border transition-all text-sm font-bold ${
                                    formData.selectedCurrency === 'USD'
                                      ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                                      : 'bg-gray-800/60 border-gray-700/50 text-gray-500 hover:text-gray-300'
                                  }`}
                                >
                                  <DollarSign className="w-4 h-4" /> USD
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (tlPkg) setFormData({ ...formData, packageId: tlPkg.id, selectedCurrency: 'EUR', payInTL: false });
                                  }}
                                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border transition-all text-sm font-bold ${
                                    formData.selectedCurrency === 'EUR'
                                      ? 'bg-blue-500/20 border-blue-400/60 text-blue-300'
                                      : 'bg-gray-800/60 border-gray-700/50 text-gray-500 hover:text-gray-300'
                                  }`}
                                >
                                  <Euro className="w-4 h-4" /> EUR
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* ── Visitor / Çapraz Visitor / Acenta: Döviz bazlı, TL ile ödeme seçeneği ── */
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (usdPkg) setFormData({ ...formData, packageId: usdPkg.id, selectedCurrency: 'USD', payInTL: false });
                                  }}
                                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border transition-all text-sm font-bold ${
                                    formData.selectedCurrency === 'USD'
                                      ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                                      : 'bg-gray-800/60 border-gray-700/50 text-gray-500 hover:text-gray-300'
                                  }`}
                                >
                                  <DollarSign className="w-4 h-4" /> USD
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (eurPkg) setFormData({ ...formData, packageId: eurPkg.id, selectedCurrency: 'EUR', payInTL: false });
                                  }}
                                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border transition-all text-sm font-bold ${
                                    formData.selectedCurrency === 'EUR'
                                      ? 'bg-blue-500/20 border-blue-400/60 text-blue-300'
                                      : 'bg-gray-800/60 border-gray-700/50 text-gray-500 hover:text-gray-300'
                                  }`}
                                >
                                  <Euro className="w-4 h-4" /> EUR
                                </button>
                              </div>
                              {/* TL ile Öde toggle — sadece döviz seçildiyse göster */}
                              {(formData.selectedCurrency === 'USD' || formData.selectedCurrency === 'EUR') && (
                                <button
                                  type="button"
                                  onClick={() => setFormData({ ...formData, payInTL: !formData.payInTL })}
                                  className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg border transition-all text-xs font-bold ${
                                    formData.payInTL
                                      ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                                      : 'bg-gray-800/40 border-gray-700/40 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                                  }`}
                                >
                                  <span className="font-black">₺</span>
                                  {formData.payInTL ? 'TL ile Ödeme Aktif' : 'Müşteri TL ile ödemek istiyor'}
                                  {formData.payInTL && (() => {
                                    const selPkg = kasaPackages.find(p => p.id === formData.packageId);
                                    if (!selPkg) return null;
                                    const adQ = parseInt(formData.adultQty) || 0;
                                    const chQ = parseInt(formData.childQty) || 0;
                                    const raw = adQ * selPkg.adultPrice + chQ * selPkg.childPrice;
                                    const r = formData.selectedCurrency === 'USD' ? usdRate : eurRate;
                                    const tlTotal = Math.ceil(raw * r);
                                    return raw > 0 ? <span className="ml-1 opacity-70">{tlTotal}₺</span> : null;
                                  })()}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* ── ADIM 4: Ödeme Tipi ── */}
                    {(() => {
                      const qtyOk = (parseInt(formData.adultQty) || 0) + (parseInt(formData.childQty) || 0) > 0;
                      const currencyOk = !isDualCurrencyCategory(selectedCategory) || !!formData.selectedCurrency;
                      const stepLocked = !formData.packageId || !qtyOk || !currencyOk;
                      return (
                        <div className={`relative ${stepLocked ? 'opacity-40 pointer-events-none' : ''}`}>
                          {stepLocked && <div className="absolute inset-0 z-10" />}
                          <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Ödeme Tipi</label>
                          {!splitMode ? (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setFormData({ ...formData, paymentType: 'Nakit' })}
                                className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all text-sm font-bold ${
                                  formData.paymentType === 'Nakit'
                                    ? 'bg-blue-500/20 border-blue-400 text-blue-300 shadow-lg shadow-blue-500/10'
                                    : 'bg-gray-800/60 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                                }`}
                              >
                                <Banknote className="w-5 h-5" /> Nakit
                              </button>
                              <button
                                type="button"
                                onClick={() => setFormData({ ...formData, paymentType: 'Kredi Kartı' })}
                                className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all text-sm font-bold ${
                                  formData.paymentType === 'Kredi Kartı'
                                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-lg shadow-emerald-500/10'
                                    : 'bg-gray-800/60 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                                }`}
                              >
                                <CreditCard className="w-5 h-5" /> Kredi Kartı
                              </button>
                            </div>
                          ) : (
                            <div className="w-full px-3 py-3 bg-orange-900/20 border border-orange-500/30 rounded-xl text-orange-300 text-sm text-center font-semibold">
                              Çoklu Ödeme
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* ── Açıklama (Comment) — opsiyonel, aktif modda DB'ye kaydedilir ── */}
                    {integrationActive && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Açıklama <span className="text-gray-600 normal-case">(opsiyonel)</span></label>
                        <input
                          type="text"
                          placeholder="Tur şirketi, rehber adı vb."
                          value={formData.comment}
                          onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700/80 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-gray-600"
                          maxLength={200}
                        />
                      </div>
                    )}



                    {/* Çapraz Satış badge */}
                    {formData.isCrossSale && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs bg-orange-500/10 border-orange-500/25 text-orange-400">
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        <span className="font-semibold">Çapraz Satış</span>
                      </div>
                    )}

                    {/* ── Hata Mesajı ── */}
                    {errorMessage && (
                      <div className="bg-red-500/10 text-red-300 text-sm px-4 py-3 rounded-xl border border-red-500/25 flex items-center gap-2">
                        <span className="text-red-400 text-base">⚠</span> {errorMessage}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* SAĞ PANEL: Satış Özeti (Fiş) + Çoklu Ödeme */}
              {selectedCategory && (
              <div className={`flex-shrink-0 ${splitMode ? 'sm:w-[480px]' : 'sm:w-72'} sm:border-l border-t sm:border-t-0 border-gray-700/40 p-3 sm:p-4 overflow-y-auto transition-all duration-300`}>
                {(() => {
                  const selectedPkg = kasaPackages.find(p => p.id === formData.packageId);
                  const adultQ = parseInt(formData.adultQty) || 0;
                  const childQ = parseInt(formData.childQty) || 0;
                  const rawSaleTotal = selectedPkg ? (adultQ * selectedPkg.adultPrice + childQ * selectedPkg.childPrice) : 0;
                  const pkgCur = selectedPkg?.currency || 'TL';
                  const selCur = formData.selectedCurrency || pkgCur;
                  // Efektif toplam ve para birimi hesapla
                  let saleTotal = rawSaleTotal;
                  let saleCurrency = pkgCur;
                  if (formData.payInTL && pkgCur !== 'TL') {
                    const r = selCur === 'EUR' ? eurRate : usdRate;
                    saleTotal = Math.ceil(rawSaleTotal * r);
                    saleCurrency = 'TL';
                  } else if (selCur === 'USD' && pkgCur === 'TL') {
                    saleTotal = usdRate > 0 ? Math.ceil(rawSaleTotal / usdRate) : rawSaleTotal;
                    saleCurrency = 'USD';
                  } else if (selCur === 'EUR' && pkgCur === 'TL') {
                    saleTotal = eurRate > 0 ? Math.ceil(rawSaleTotal / eurRate) : rawSaleTotal;
                    saleCurrency = 'EUR';
                  }
                  const rate = saleCurrency === 'USD' ? usdRate : saleCurrency === 'EUR' ? eurRate : 0;
                  const totalInTl = saleCurrency === 'USD' ? saleTotal * usdRate : saleCurrency === 'EUR' ? saleTotal * eurRate : saleTotal;
                  const currSymbol = saleCurrency === 'USD' ? '$' : saleCurrency === 'EUR' ? '€' : '₺';

                  return (
                    <div className={splitMode ? 'flex gap-4' : 'space-y-3'}>
                    {/* Sol kolon: Fiş Özeti + Butonlar */}
                    <div className={`space-y-3 ${splitMode ? 'flex-1 min-w-0' : ''}`}>
                      {/* Fiş Başlığı */}
                      <div className="text-center border-b border-dashed border-gray-700/60 pb-2">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Satış Özeti</p>
                      </div>

                      {/* Fiş İçeriği */}
                      <div className="space-y-2">
                        {/* Paket */}
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[10px] text-gray-500 uppercase font-semibold">Paket</span>
                          <span className="text-xs text-white font-bold text-right truncate max-w-[140px]">{selectedPkg?.name || '—'}</span>
                        </div>

                        {/* Kategori */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-gray-500 uppercase font-semibold">Kategori</span>
                          <span className={`text-xs font-bold ${CATEGORY_CONFIG[selectedCategory]?.color || 'text-gray-400'}`}>{selectedCategory}</span>
                        </div>

                        {/* Kişi Sayıları */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-gray-500 uppercase font-semibold">Kişi</span>
                          <span className="text-xs text-white font-bold">
                            {adultQ > 0 ? `${adultQ} Yetişkin` : ''}{adultQ > 0 && childQ > 0 ? ' + ' : ''}{childQ > 0 ? `${childQ} Çocuk` : ''}{adultQ === 0 && childQ === 0 ? '—' : ''}
                          </span>
                        </div>

                        {/* Ödeme Tipi */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-gray-500 uppercase font-semibold">Ödeme</span>
                          <span className={`text-xs font-bold ${
                            splitMode ? 'text-orange-400' :
                            formData.paymentType === 'Kredi Kartı' ? 'text-emerald-400' : 
                            formData.paymentType === 'Nakit' ? 'text-blue-400' : 'text-gray-600'
                          }`}>
                            {splitMode ? 'Çoklu' : formData.paymentType || '—'}
                          </span>
                        </div>

                        {/* Çapraz Satış */}
                        {formData.isCrossSale && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-gray-500 uppercase font-semibold">Tip</span>
                            <span className="text-xs font-bold text-orange-400">⇄ Çapraz</span>
                          </div>
                        )}
                      </div>

                      {/* Ayırıcı */}
                      <div className="border-t border-dashed border-gray-700/60" />

                      {/* Birim Fiyat */}
                      {selectedPkg && (
                        <div className="space-y-1">
                          {adultQ > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-gray-500">{adultQ}x Yetişkin</span>
                              <span className="text-[11px] text-gray-400">{(adultQ * selectedPkg.adultPrice).toFixed(2)} {currSymbol}</span>
                            </div>
                          )}
                          {childQ > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-gray-500">{childQ}x Çocuk</span>
                              <span className="text-[11px] text-gray-400">{(childQ * selectedPkg.childPrice).toFixed(2)} {currSymbol}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Toplam */}
                      <div className={`rounded-lg border px-3 py-2.5 ${
                        saleTotal > 0
                          ? saleCurrency !== 'TL' ? 'bg-amber-950/30 border-amber-500/20' : 'bg-emerald-950/30 border-emerald-500/20'
                          : 'bg-gray-800/40 border-gray-700/40'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-gray-500 uppercase font-bold">Toplam</span>
                          <span className="text-lg font-black text-white">
                            {saleTotal > 0 ? saleTotal.toFixed(2) : '0.00'} <span className={`text-sm ${saleCurrency === 'USD' ? 'text-amber-400' : saleCurrency === 'EUR' ? 'text-blue-400' : 'text-emerald-400'}`}>{currSymbol}</span>
                          </span>
                        </div>
                        {saleCurrency !== 'TL' && saleTotal > 0 && (
                          <div className="text-right mt-0.5">
                            <span className="text-[11px] font-bold text-emerald-400">{totalInTl.toFixed(2)} ₺ <span className="text-[9px] text-gray-600">({rate.toFixed(2)})</span></span>
                          </div>
                        )}
                      </div>

                      {/* ── Aksiyon Butonları ── */}
                      {(() => {
                        const cfg = CATEGORY_CONFIG[selectedCategory];
                        const showActiveMode = integrationActive;
                        const isFreePackage = selectedPkg && selectedPkg.adultPrice === 0 && selectedPkg.childPrice === 0;
                        const allReady = formData.packageId && (adultQ + childQ > 0) && (splitMode || formData.paymentType);
                        
                        return (
                          <div className="space-y-2 pt-2 mt-1 border-t border-dashed border-gray-700/60">
                            {showActiveMode ? (
                              <button
                                onClick={handleActiveSale}
                                disabled={posProcessing || !allReady}
                                className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:from-gray-700 disabled:to-gray-700 text-white py-2.5 rounded-xl font-bold transition-all shadow-lg text-sm flex items-center justify-center gap-2"
                              >
                                <Zap className="w-4 h-4" /> {isFreePackage ? 'Bilet Bas' : 'Ödeme Al'}
                              </button>
                            ) : (
                              <button
                                onClick={handleAddSale}
                                disabled={posProcessing || !allReady}
                                className={`w-full bg-gradient-to-r ${cfg?.badge || 'from-gray-600 to-gray-700'} hover:opacity-90 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold transition-all shadow-lg text-sm flex items-center justify-center gap-2`}
                              >
                                <Check className="w-4 h-4" /> Satışı Kaydet
                              </button>
                            )}
                            <button
                              onClick={() => { setShowAddForm(false); setSelectedCategory(''); setErrorMessage(''); setSplitMode(false); }}
                              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white py-2 rounded-xl transition-colors text-xs border border-gray-700 font-medium"
                            >
                              İptal
                            </button>
                            <button
                              type="button"
                              onClick={() => { setSplitMode(!splitMode); if (!splitMode) { setFormData({ ...formData, splitKkTl: '', splitCashTl: '', splitCashUsd: '', splitCashEur: '' }); } }}
                              className={`w-full py-1.5 rounded-lg text-[10px] font-bold border transition-all flex items-center justify-center gap-1.5 ${splitMode ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' : 'bg-gray-800/60 text-gray-400 border-gray-700/50 hover:text-gray-200'}`}
                            >
                              <Coins className="w-3 h-3" /> {splitMode ? 'Çoklu Ödemeyi Kapat' : 'Çoklu Ödeme'}
                            </button>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Sağ kolon: Çoklu Ödeme Alanları (splitMode'da görünür) */}
                    {splitMode && (() => {
                      const splitKk = parseFloat(formData.splitKkTl) || 0;
                      const splitTl = parseFloat(formData.splitCashTl) || 0;
                      const splitUsd = parseFloat(formData.splitCashUsd) || 0;
                      const splitEur = parseFloat(formData.splitCashEur) || 0;
                      const paidTl = splitKk + splitTl + (splitUsd * usdRate) + (splitEur * eurRate);
                      const remaining = totalInTl - paidTl;
                      const remainingUsd = usdRate > 0 ? remaining / usdRate : 0;
                      const remainingEur = eurRate > 0 ? remaining / eurRate : 0;

                      return (
                        <div className="flex-1 min-w-0 border-l border-dashed border-orange-500/30 pl-4 space-y-2">
                          <label className="block text-[10px] text-orange-400 font-bold uppercase tracking-widest text-center">Çoklu Ödeme</label>
                          <div className="space-y-1.5">
                            <div>
                              <label className="block text-[9px] text-emerald-400/80 mb-0.5 font-semibold">KK ₺</label>
                              <input type="number" min="0" step="0.01" value={formData.splitKkTl} onChange={(e) => setFormData({ ...formData, splitKkTl: e.target.value })} placeholder={remaining > 0.01 ? `${remaining.toFixed(0)}` : '0'} className="w-full px-2 py-1.5 bg-gray-800 border border-emerald-700/40 rounded-lg text-emerald-300 text-xs focus:outline-none focus:border-emerald-500 placeholder-emerald-900/80" />
                            </div>
                            <div>
                              <label className="block text-[9px] text-blue-400/80 mb-0.5 font-semibold">Nakit ₺</label>
                              <input type="number" min="0" step="0.01" value={formData.splitCashTl} onChange={(e) => setFormData({ ...formData, splitCashTl: e.target.value })} placeholder={remaining > 0.01 ? `${remaining.toFixed(0)}` : '0'} className="w-full px-2 py-1.5 bg-gray-800 border border-blue-700/40 rounded-lg text-blue-300 text-xs focus:outline-none focus:border-blue-500 placeholder-blue-900/80" />
                            </div>
                            <div>
                              <label className="block text-[9px] text-amber-400/80 mb-0.5 font-semibold">USD $</label>
                              <input type="number" min="0" step="0.01" value={formData.splitCashUsd} onChange={(e) => setFormData({ ...formData, splitCashUsd: e.target.value })} placeholder={remaining > 0.01 ? `${remainingUsd.toFixed(0)}` : '0'} className="w-full px-2 py-1.5 bg-gray-800 border border-amber-700/40 rounded-lg text-amber-300 text-xs focus:outline-none focus:border-amber-500 placeholder-amber-900/80" />
                            </div>
                            <div>
                              <label className="block text-[9px] text-violet-400/80 mb-0.5 font-semibold">EUR €</label>
                              <input type="number" min="0" step="0.01" value={formData.splitCashEur} onChange={(e) => setFormData({ ...formData, splitCashEur: e.target.value })} placeholder={remaining > 0.01 ? `${remainingEur.toFixed(0)}` : '0'} className="w-full px-2 py-1.5 bg-gray-800 border border-violet-700/40 rounded-lg text-violet-300 text-xs focus:outline-none focus:border-violet-500 placeholder-violet-900/80" />
                            </div>
                          </div>
                          <div className={`text-[10px] font-bold text-center py-1.5 rounded-md border ${
                            Math.abs(remaining) < 0.01
                              ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700/40'
                              : remaining > 0
                                ? 'bg-amber-900/30 text-amber-400 border-amber-700/40'
                                : 'bg-red-900/30 text-red-400 border-red-700/40'
                          }`}>
                            {Math.abs(remaining) < 0.01
                              ? '✓ Tamamlandı'
                              : remaining > 0
                                ? `Kalan: ${remaining.toFixed(2)}₺`
                                : `Fazla: ${Math.abs(remaining).toFixed(2)}₺`
                            }
                          </div>
                        </div>
                      );
                    })()}
                    </div>
                  );
                })()}
              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SALES TABLE ── */}
      {sales.length === 0 ? (
        <div className="text-center py-16 sm:py-20 bg-gradient-to-br from-gray-900 to-gray-950 rounded-2xl border border-dashed border-gray-700/50">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl flex items-center justify-center border border-gray-700/50">
            <ShoppingCart className="w-8 h-8 text-gray-600" />
          </div>
          <p className="text-sm font-bold text-gray-400">Henüz satış kaydı yok</p>
          <p className="text-xs mt-1.5 text-gray-600">Yeni satış eklemek için yukarıdaki <span className="text-orange-400 font-bold">Satış Ekle</span> butonunu kullanın</p>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="sm:hidden space-y-2">
            {sales.filter(s => !s.isRefund && s.category !== 'Ücretsiz').map((sale) => {
              const refundEntry = sales.find(s => s.isRefund && s.refundOfSaleId === sale.id);
              const isRefunded = !!refundEntry;
              return (
                <div key={sale.id} className={`rounded-xl border p-3 space-y-2 ${isRefunded ? 'bg-red-500/5 border-red-500/20' : 'bg-gray-900 border-gray-800'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isRefunded && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold border border-red-500/30">↩ İade Edildi</span>}
                        {sale.isCrossSale && !isRefunded && <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded border border-orange-500/30">⇄</span>}
                        <span className={`text-sm font-bold truncate ${isRefunded ? 'line-through text-gray-500' : 'text-white'}`}>{sale.packageName}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <span>{sale.adultQty} Yetişkin + {sale.childQty} Çocuk</span>
                        <span>·</span>
                        <span className={`font-semibold ${sale.paymentType === 'Kredi Kartı' ? 'text-emerald-400' : sale.paymentType === 'Çoklu' ? 'text-violet-400' : 'text-blue-400'}`}>
                          {sale.paymentType === 'Kredi Kartı' ? 'Kredi Kartı' : sale.paymentType === 'Çoklu' ? 'Çoklu' : 'Nakit'}
                        </span>
                        {sale.personnelName && (
                          <><span>·</span><span className="flex items-center gap-1"><User className="w-3 h-3" />{sale.personnelName}</span></>
                        )}
                      </div>
                    </div>
                    <div className="text-right ml-2">
                      <p className={`text-sm font-bold ${isRefunded ? 'line-through text-gray-600' : 'text-white'}`}>{sale.total.toFixed(2)} {sale.currency === 'TL' || sale.currency === 'KK' ? '₺' : sale.currency === 'USD' ? '$' : '€'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-gray-800/50">
                    <div className="flex-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                      {sale.kkTl !== 0 && <span className="text-emerald-400 font-bold">Kredi Kartı: {sale.kkTl.toFixed(2)}₺</span>}
                      {sale.cashTl !== 0 && <span className="text-blue-400 font-bold">TL: {sale.cashTl.toFixed(2)}₺</span>}
                      {sale.cashUsd !== 0 && <span className="text-amber-400 font-bold">USD: {sale.cashUsd.toFixed(2)}$</span>}
                      {sale.cashEur !== 0 && <span className="text-violet-400 font-bold">EUR: {sale.cashEur.toFixed(2)}€</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!isRefunded && (
                        <button onClick={() => { setRefundTargetSale(sale); setRefundInfo({ reason: '', refundPaymentType: sale.paymentType === 'Çoklu' ? 'Nakit' : sale.paymentType, kkRefundTxId: '' }); setShowRefundModal(true); }}
                          className="text-orange-400 text-xs font-bold bg-orange-500/15 px-2.5 py-1.5 rounded-lg border border-orange-500/30">↩</button>
                      )}
                      {sale.ticketIds && sale.ticketIds.length > 0 && (
                        <button onClick={() => handleReprintTicket(sale)} title="Bilet Tekrar Bas"
                          className="text-indigo-400 hover:text-indigo-300 p-1.5 rounded-lg hover:bg-indigo-500/15 transition-colors">
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block bg-gradient-to-br from-gray-900 to-gray-950 rounded-2xl border border-gray-700/50 overflow-hidden shadow-boltify ring-1 ring-white/5">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[640px]">
                <thead>
                  <tr className="bg-gray-900/80 border-b border-gray-700/50">
                    <th className="px-3 py-3 text-left text-gray-400 font-bold uppercase tracking-wider text-[11px]">Paket</th>
                    <th className="px-3 py-3 text-center text-gray-400 font-bold uppercase tracking-wider text-[11px]">Yetişkin</th>
                    <th className="px-3 py-3 text-center text-gray-400 font-bold uppercase tracking-wider text-[11px]">Çocuk</th>
                    <th className="px-3 py-3 text-center text-gray-400 font-bold uppercase tracking-wider text-[11px]">Para</th>
                    <th className="px-3 py-3 text-center text-gray-400 font-bold uppercase tracking-wider text-[11px]">Ödeme</th>
                    <th className="px-3 py-3 text-right text-gray-400 font-bold uppercase tracking-wider text-[11px]">Toplam</th>
                    <th className="px-3 py-3 text-right text-emerald-400 font-bold uppercase tracking-wider text-[11px]">Kredi Kartı (₺)</th>
                    <th className="px-3 py-3 text-right text-blue-400 font-bold uppercase tracking-wider text-[11px]">Nakit (₺)</th>
                    <th className="px-3 py-3 text-right text-amber-400 font-bold uppercase tracking-wider text-[11px]">USD</th>
                    <th className="px-3 py-3 text-right text-violet-400 font-bold uppercase tracking-wider text-[11px]">EUR</th>
                    <th className="px-3 py-3 text-center text-gray-400 font-bold uppercase tracking-wider text-[11px]">İşlem</th>
                  </tr>
                </thead>
              <tbody className="divide-y divide-gray-800/50">
                {sales.filter(s => !s.isRefund && s.category !== 'Ücretsiz').map((sale, idx) => {
                  const refundEntry = sales.find(s => s.isRefund && s.refundOfSaleId === sale.id);
                  const isRefunded = !!refundEntry;
                  return (
                  <tr
                    key={sale.id}
                    className={`transition-colors ${
                      isRefunded
                        ? 'bg-red-500/5 hover:bg-red-500/10'
                        : idx % 2 === 0 ? 'bg-transparent hover:bg-white/[0.02]' : 'bg-white/[0.01] hover:bg-white/[0.03]'
                    }`}
                  >
                    <td className="px-3 py-2.5 text-white max-w-[200px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isRefunded && (
                          <span className="inline-flex items-center text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold border border-red-500/30">↩ İade Edildi</span>
                        )}
                        {sale.isCrossSale && !isRefunded && (
                          <span className="inline-flex items-center text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded border border-orange-500/30">⇄</span>
                        )}
                        <span className={`truncate font-medium ${isRefunded ? 'line-through text-gray-500' : ''}`}>{sale.packageName}</span>
                      </div>
                    </td>
                    <td className={`px-3 py-2.5 text-center ${isRefunded ? 'text-gray-600 line-through' : 'text-gray-200'}`}>{sale.adultQty}</td>
                    <td className={`px-3 py-2.5 text-center ${isRefunded ? 'text-gray-600 line-through' : 'text-gray-200'}`}>{sale.childQty}</td>
                    <td className="px-3 py-2.5 text-center text-gray-300 font-medium">{sale.currency}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-lg font-bold ${
                        sale.paymentType === 'Çoklu'
                          ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                          : sale.paymentType === 'Kredi Kartı'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}>
                        {sale.paymentType === 'Kredi Kartı' ? 'Kredi Kartı' : sale.paymentType === 'Çoklu' ? 'Çoklu' : 'Nakit'}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 text-right font-bold ${isRefunded ? 'text-gray-600 line-through' : 'text-white'}`}>{sale.total.toFixed(2)}</td>
                    <td className={`px-3 py-2.5 text-right font-bold ${isRefunded ? 'text-gray-600 line-through' : 'text-emerald-400'}`}>{sale.kkTl !== 0 ? sale.kkTl.toFixed(2) : <span className="text-gray-700">—</span>}</td>
                    <td className={`px-3 py-2.5 text-right font-bold ${isRefunded ? 'text-gray-600 line-through' : 'text-blue-400'}`}>{sale.cashTl !== 0 ? sale.cashTl.toFixed(2) : <span className="text-gray-700">—</span>}</td>
                    <td className={`px-3 py-2.5 text-right font-bold ${isRefunded ? 'text-gray-600 line-through' : 'text-amber-400'}`}>{sale.cashUsd !== 0 ? sale.cashUsd.toFixed(2) : <span className="text-gray-700">—</span>}</td>
                    <td className={`px-3 py-2.5 text-right font-bold ${isRefunded ? 'text-gray-600 line-through' : 'text-violet-400'}`}>{sale.cashEur !== 0 ? sale.cashEur.toFixed(2) : <span className="text-gray-700">—</span>}</td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {!isRefunded && (
                          <button
                            onClick={() => {
                              setRefundTargetSale(sale);
                              setRefundInfo({ reason: '', refundPaymentType: sale.paymentType === 'Çoklu' ? 'Nakit' : sale.paymentType, kkRefundTxId: '' });
                              setShowRefundModal(true);
                            }}
                            title="İade Et"
                            className="text-orange-400 hover:text-orange-300 text-xs font-bold bg-orange-500/15 hover:bg-orange-500/25 px-2 py-1 rounded-lg border border-orange-500/30 transition-colors"
                          >
                            ↩
                          </button>
                        )}
                        {sale.ticketIds && sale.ticketIds.length > 0 && (
                          <button
                            onClick={() => handleReprintTicket(sale)}
                            title="Bilet Tekrar Bas"
                            className="text-indigo-400 hover:text-indigo-300 p-1 rounded-lg transition-colors hover:bg-indigo-500/15"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gradient-to-r from-orange-500/10 to-violet-500/10 border-t-2 border-orange-500/30">
                  <td className="px-3 py-3 text-white font-black text-xs">TOPLAM</td>
                  <td className="px-3 py-3 text-center text-white font-bold text-xs">{totalAdultCount}</td>
                  <td className="px-3 py-3 text-center text-white font-bold text-xs">{totalChildCount}</td>
                  <td className="px-3 py-3 text-center text-gray-400 text-xs font-medium">{sales.filter(s => !s.isRefund).length} satış</td>
                  <td className="px-3 py-3"></td>
                  <td className="px-3 py-3 text-right text-white font-black text-xs">{(totals.kkTl + totals.cashTl + (totals.cashUsd * usdRate) + (totals.cashEur * eurRate)).toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-emerald-400 font-black text-xs">{totals.kkTl.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-blue-400 font-black text-xs">{totals.cashTl.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-amber-400 font-black text-xs">{totals.cashUsd.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-violet-400 font-black text-xs">{totals.cashEur.toFixed(2)}</td>
                  <td className="px-3 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        </>
      )}

      {/* ── REFUND MODAL ── */}
      {showRefundModal && refundTargetSale && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-boltify-lg">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <span className="w-8 h-8 bg-red-500/10 rounded-xl flex items-center justify-center text-base border border-red-500/20">↩</span>
                Satış İadesi
              </h3>
              <button
                onClick={() => { setShowRefundModal(false); setRefundTargetSale(null); setRefundProcessing(false); }}
                disabled={refundProcessing}
                className="text-gray-500 hover:text-white w-7 h-7 flex items-center justify-center rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Orijinal Satış Bilgileri */}
            <div className="bg-gray-800 rounded-xl p-4 mb-4 border border-gray-700">
              <p className="text-[11px] text-gray-500 mb-3 font-semibold uppercase tracking-wider">Orijinal Satış</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Paket:</span> <span className="text-white font-semibold">{refundTargetSale.packageName}</span></div>
                <div><span className="text-gray-500">Tutar:</span> <span className="text-white font-semibold">{refundTargetSale.total.toFixed(2)} {refundTargetSale.currency === 'TL' || refundTargetSale.currency === 'KK' ? '₺' : refundTargetSale.currency === 'USD' ? '$' : '€'}</span></div>
                <div><span className="text-gray-500">Yetişkin:</span> <span className="text-gray-200">{refundTargetSale.adultQty}</span></div>
                <div><span className="text-gray-500">Çocuk:</span> <span className="text-gray-200">{refundTargetSale.childQty}</span></div>
                <div><span className="text-gray-500">Ödeme:</span> <span className="text-gray-200">{refundTargetSale.paymentType}</span></div>
                <div><span className="text-gray-500">Para Birimi:</span> <span className="text-gray-200">{refundTargetSale.currency}</span></div>
                {refundTargetSale.terminalRecordId && (
                  <div className="col-span-2"><span className="text-gray-500">Atlantis Kayıt:</span> <span className="text-blue-400 font-bold">#{refundTargetSale.terminalRecordId}</span></div>
                )}
              </div>
            </div>

            {/* İade Ödeme Şekli */}
            {refundTargetSale.paymentType === 'Çoklu' ? (
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wider">İade Ödeme Dağılımı (Orijinal)</label>
                <div className="grid grid-cols-2 gap-2 text-sm bg-gray-800/60 rounded-lg p-3 border border-gray-700/50">
                  {refundTargetSale.kkTl > 0 && <div><span className="text-emerald-400/80 text-xs">KK:</span> <span className="text-emerald-400 font-bold">{refundTargetSale.kkTl.toFixed(2)} ₺</span></div>}
                  {refundTargetSale.cashTl > 0 && <div><span className="text-blue-400/80 text-xs">Nakit TL:</span> <span className="text-blue-400 font-bold">{refundTargetSale.cashTl.toFixed(2)} ₺</span></div>}
                  {refundTargetSale.cashUsd > 0 && <div><span className="text-amber-400/80 text-xs">Nakit USD:</span> <span className="text-amber-400 font-bold">{refundTargetSale.cashUsd.toFixed(2)} $</span></div>}
                  {refundTargetSale.cashEur > 0 && <div><span className="text-violet-400/80 text-xs">Nakit EUR:</span> <span className="text-violet-400 font-bold">{refundTargetSale.cashEur.toFixed(2)} €</span></div>}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Çoklu ödeme iadesi orijinal dağılım üzerinden yapılır</p>
                {refundTargetSale.kkTl > 0 && (
                  <div className="mt-3">
                    <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wider">Kredi Kartı İade İşlem Numarası</label>
                    <input
                      type="text"
                      value={refundInfo.kkRefundTxId}
                      onChange={(e) => setRefundInfo({ ...refundInfo, kkRefundTxId: e.target.value })}
                      placeholder="POS cihazındaki iade işlem numarası..."
                      className="w-full px-3 py-2.5 bg-gray-800 border border-gray-600/80 rounded-lg text-white text-sm focus:outline-none focus:border-red-500 transition-colors"
                    />
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wider">İade Ödeme Şekli</label>
                  <select
                    value={refundInfo.refundPaymentType}
                    onChange={(e) => setRefundInfo({ ...refundInfo, refundPaymentType: e.target.value as any })}
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-600/80 rounded-lg text-white text-sm focus:outline-none focus:border-red-500 transition-colors"
                  >
                    <option value="Nakit">Nakit</option>
                    <option value="Kredi Kartı">Kredi Kartı</option>
                  </select>
                </div>

                {refundInfo.refundPaymentType === 'Kredi Kartı' && (
                  <div className="mb-4">
                    <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wider">Kredi Kartı İade İşlem Numarası <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={refundInfo.kkRefundTxId}
                      onChange={(e) => setRefundInfo({ ...refundInfo, kkRefundTxId: e.target.value })}
                      placeholder="POS cihazındaki iade işlem numarası..."
                      className="w-full px-3 py-2.5 bg-gray-800 border border-gray-600/80 rounded-lg text-white text-sm focus:outline-none focus:border-red-500 transition-colors"
                    />
                  </div>
                )}
              </>
            )}

            <div className="mb-5">
              <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wider">İade Nedeni <span className="text-red-500">*</span></label>
              <textarea
                value={refundInfo.reason}
                onChange={(e) => setRefundInfo({ ...refundInfo, reason: e.target.value })}
                placeholder="Müşterinin iade nedenini yazınız..."
                rows={3}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-600/80 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>

            {errorMessage && (
              <div className="bg-red-900/40 text-red-300 text-sm px-3 py-2.5 rounded-lg mb-3 border border-red-700/40 flex items-center gap-2">
                <span>⚠</span> {errorMessage}
              </div>
            )}

            {/* Sistem kaydı bilgilendirmesi */}
            {integrationActive && refundTargetSale?.terminalRecordId && (
              <div className="bg-blue-900/20 text-blue-300 text-xs px-3 py-2 rounded-lg mb-3 border border-blue-700/30 flex items-center gap-2">
                <span>🗄️</span> Sistem kaydı da silinecek (Kayıt No: #{refundTargetSale.terminalRecordId})
              </div>
            )}

            <div className="flex gap-2.5">
              <button
                onClick={handleRefund}
                disabled={refundProcessing || !refundInfo.reason.trim() || (refundInfo.refundPaymentType === 'Kredi Kartı' && !refundInfo.kkRefundTxId.trim())}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2.5 rounded-xl font-semibold transition-colors text-sm flex items-center justify-center gap-2"
              >
                {refundProcessing ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    İade İşleniyor...
                  </>
                ) : (
                  'İadeyi Onayla & Tutanak Yazdır'
                )}
              </button>
              <button
                onClick={() => { setShowRefundModal(false); setRefundTargetSale(null); setRefundProcessing(false); }}
                disabled={refundProcessing}
                className="px-4 bg-gray-700/80 hover:bg-gray-700 disabled:opacity-50 text-gray-300 hover:text-white py-2.5 rounded-xl transition-colors text-sm"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── POS İŞLEM SÜRECİ MODAL ── */}
      {showPosProcessingModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-lg flex items-center justify-center z-[60] p-4">
          <div className="bg-gradient-to-b from-gray-900 to-[#0a0a12] border border-indigo-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 ring-1 ring-indigo-500/20">
            {/* Animasyonlu Dönen İkon */}
            <div className="text-center mb-6">
              <div className="relative w-20 h-20 mx-auto mb-4">
                {/* Dış halka — dönen */}
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-500 border-r-blue-500 animate-spin" />
                {/* İç halka — ters dönen */}
                <div className="absolute inset-2 rounded-full border-4 border-transparent border-b-violet-500 border-l-cyan-500 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                {/* Orta ikon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {posProcessingStep === 'pos' && <CreditCard className="w-7 h-7 text-blue-400 animate-pulse" />}
                  {posProcessingStep === 'print' && <Printer className="w-7 h-7 text-violet-400 animate-pulse" />}
                  {posProcessingStep === 'done' && <CheckCircle className="w-7 h-7 text-emerald-400" />}
                </div>
              </div>
              
              <h3 className="text-lg font-bold text-white mb-1">
                {posProcessingStep === 'pos' && 'Ödeme Alınıyor...'}
                {posProcessingStep === 'print' && 'Bilet Basılıyor...'}
                {posProcessingStep === 'done' && 'İşlem Tamamlandı ✓'}
              </h3>
              
              <p className="text-sm text-gray-400">
                {posProcessingStep === 'pos' && 'Lütfen müşterinin kartını okutunuz'}
                {posProcessingStep === 'print' && 'Yazıcıya gönderiliyor...'}
                {posProcessingStep === 'done' && 'Satış başarıyla tamamlandı'}
              </p>
            </div>

            {/* İlerleme Adımları */}
            <div className="space-y-2">
              {(['pos', 'print', 'done'] as const).map((step, i) => {
                const labels = ['Ödeme', 'Bilet Basım', 'Tamamlandı'];
                const icons = [CreditCard, Printer, CheckCircle];
                const Icon = icons[i];
                const stepOrder = ['pos', 'print', 'done'];
                const currentIdx = stepOrder.indexOf(posProcessingStep);
                const stepIdx = i;
                const isCompleted = stepIdx < currentIdx;
                const isActive = stepIdx === currentIdx;
                
                return (
                  <div key={step} className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all duration-300 ${
                    isCompleted ? 'bg-emerald-900/20 border-emerald-700/30' :
                    isActive ? 'bg-indigo-900/30 border-indigo-500/40 shadow-lg shadow-indigo-500/10' :
                    'bg-gray-800/30 border-gray-700/20 opacity-40'
                  }`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      isCompleted ? 'bg-emerald-500' : isActive ? 'bg-indigo-500' : 'bg-gray-700'
                    }`}>
                      {isCompleted ? (
                        <Check className="w-3.5 h-3.5 text-white" />
                      ) : (
                        <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                      )}
                    </div>
                    <span className={`text-sm font-medium ${
                      isCompleted ? 'text-emerald-400' : isActive ? 'text-white' : 'text-gray-600'
                    }`}>{labels[i]}</span>
                    {isActive && step !== 'done' && (
                      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin ml-auto" />
                    )}
                    {isCompleted && (
                      <span className="text-emerald-400 text-xs ml-auto">✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── POS SONUÇ MODAL ── */}
      {showPosResultModal && posResult && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowPosResultModal(false); }}>
          <div className="bg-gradient-to-b from-gray-900 to-[#0c0c14] border border-gray-700/60 rounded-2xl w-full max-w-md shadow-2xl p-6">
            {/* Başarı/Hata İkonu */}
            <div className="text-center mb-5">
              {posResult.success ? (
                <div className="w-16 h-16 mx-auto mb-3 bg-emerald-500/20 rounded-full flex items-center justify-center border-2 border-emerald-500/40">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                </div>
              ) : (
                <div className="w-16 h-16 mx-auto mb-3 bg-red-500/20 rounded-full flex items-center justify-center border-2 border-red-500/40">
                  <AlertTriangle className="w-8 h-8 text-red-400" />
                </div>
              )}
              
              <h3 className={`text-lg font-bold ${posResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                {posResult.success ? 'Satış Başarılı!' : 'İşlem Başarısız'}
              </h3>
              
              {posResult.success && posResult.terminalRecordId && (
                <p className="text-sm text-gray-400 mt-1">
                  Kayıt No: <span className="text-white font-bold">#{posResult.terminalRecordId}</span>
                </p>
              )}
              
              {posResult.error && (
                <p className="text-sm text-red-300 mt-2 bg-red-900/20 rounded-lg p-2 border border-red-700/30">
                  {posResult.error}
                </p>
              )}
            </div>

            {/* Bilet Bilgileri */}
            {posResult.success && posResult.ticketIds && posResult.ticketIds.length > 0 && (
              <div className="bg-gray-800/50 rounded-xl p-3 mb-4 border border-gray-700/50">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Bilet Detayları</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-gray-400">Bilet Sayısı:</div>
                  <div className="text-white font-bold">{posResult.ticketIds.length}</div>
                  <div className="text-gray-400">Bilet ID'leri:</div>
                  <div className="text-white font-mono text-xs">{posResult.ticketIds.join(', ')}</div>
                </div>
                {/* Yazdırma Sonucu — sadece başarılıysa göster */}
                {posResult.printResult && posResult.printResult.printed > 0 && posResult.printResult.failed === 0 && (
                  <div className="mt-2 text-xs px-2 py-1 rounded bg-emerald-900/30 text-emerald-300">
                    🖨️ {posResult.printResult.printed} bilet basıldı
                  </div>
                )}
              </div>
            )}

            {/* POS Durumu */}
            {posResult.posMessage && (
              <div className={`text-xs px-3 py-2 rounded-lg mb-4 border ${
                posResult.posSuccess
                  ? 'bg-emerald-900/20 border-emerald-700/30 text-emerald-300'
                  : 'bg-yellow-900/20 border-yellow-700/30 text-yellow-300'
              }`}>
                POS: {posResult.posMessage}
              </div>
            )}

            {/* Butonlar */}
            <div className="flex gap-2.5">
              {posResult.success && posResult.ticketIds && posResult.ticketIds.length > 0 && (
                <button
                  onClick={async () => {
                    // Manuel bilet basımı (tekrar bas)
                    try {
                      const saleInfo = posResult._saleInfo;
                      if (!saleInfo || !posResult.ticketIds || !posResult.terminalRecordId) return;
                      
                      const kasaLabel = currentKasaId === 'wildpark' ? 'WILDPARK' : currentKasaId === 'sinema' ? 'XD SINEMA' : 'FACE2FACE';
                      
                      const printData = buildTicketPrintData(
                        {
                          terminalRecordId: posResult.terminalRecordId,
                          ticketIds: posResult.ticketIds,
                          ticketGroupMap: posResult.ticketGroupMap as Record<string, number[]> | undefined,
                        },
                        {
                          packageName: saleInfo.packageName,
                          kasaId: currentKasaId as any,
                          personnelName: getPersonnelName(),
                          adultQty: saleInfo.adultQty,
                          childQty: saleInfo.childQty,
                          products: [kasaLabel],
                          adultPrice: saleInfo.adultPrice,
                          childPrice: saleInfo.childPrice,
                          currency: saleInfo.currency,
                          isFree: saleInfo.isFree,
                        },
                      );
                      
                      const pResult = await printTickets(printData);
                      if (pResult.success) {
                        console.log(`[Print] ${pResult.printed} bilet basıldı`);
                      } else {
                        console.warn(`[Print] ${pResult.printed} basıldı, ${pResult.failed} başarısız`, pResult.errors);
                      }
                    } catch (err: any) {
                      console.warn('[Print] Yazdırma hatası:', err.message);
                    }
                  }}
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                >
                  <Printer className="w-4 h-4" /> Bilet Bas
                </button>
              )}
              <button
                onClick={() => { setShowPosResultModal(false); setPosResult(null); }}
                className={`${posResult.success ? 'px-5' : 'flex-1'} bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white py-2.5 rounded-xl transition-colors text-sm border border-gray-700 font-medium`}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}