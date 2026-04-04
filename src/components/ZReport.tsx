interface ZReportProps {
  kkTl: number;
  cashTl: number;
  cashUsd: number;
  cashEur: number;
  usdRate: number;
  eurRate: number;
}

export default function ZReport({ kkTl, cashTl, cashUsd, cashEur, usdRate, eurRate }: ZReportProps) {
  // TL değerine çevir
  const cashTlTotal = cashTl + cashUsd * usdRate + cashEur * eurRate;
  const totalAllCurrencies = kkTl + cashTlTotal;

  return (
    <div className="bg-gray-900/50 backdrop-blur-md rounded-lg border border-gray-800 p-6">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <span className="text-2xl">📋</span> Z RAPOR (Günlük Özet)
      </h3>

      <div className="space-y-3">
        {/* Kredi Kartı */}
        <div className="bg-gradient-to-r from-green-900/20 to-transparent rounded-lg p-4 border border-green-700/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">KREDİ KARTI (TL)</p>
              <p className="text-2xl font-bold text-green-400">{kkTl.toFixed(2)}</p>
            </div>
            <div className="text-4xl">💳</div>
          </div>
        </div>

        {/* Nakit Satışları */}
        <div className="space-y-2">
          <p className="text-sm text-gray-400 font-bold">NAKİT SATIŞLARI</p>

          {/* TL */}
          <div className="bg-gradient-to-r from-blue-900/20 to-transparent rounded-lg p-3 border border-blue-700/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Türk Lirası</p>
                <p className="text-xl font-bold text-blue-400">{cashTl.toFixed(2)} ₺</p>
              </div>
              <div className="text-3xl">🇹🇷</div>
            </div>
          </div>

          {/* USD */}
          <div className="bg-gradient-to-r from-yellow-900/20 to-transparent rounded-lg p-3 border border-yellow-700/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">ABD Doları</p>
                <p className="text-xl font-bold text-yellow-400">
                  {cashUsd.toFixed(2)} $ = {(cashUsd * usdRate).toFixed(2)} ₺
                </p>
              </div>
              <div className="text-3xl">💵</div>
            </div>
          </div>

          {/* EUR */}
          <div className="bg-gradient-to-r from-purple-900/20 to-transparent rounded-lg p-3 border border-purple-700/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Euro</p>
                <p className="text-xl font-bold text-purple-400">
                  {cashEur.toFixed(2)} € = {(cashEur * eurRate).toFixed(2)} ₺
                </p>
              </div>
              <div className="text-3xl">💶</div>
            </div>
          </div>
        </div>

        {/* Toplam */}
        <div className="bg-gradient-to-r from-gray-800/50 to-transparent rounded-lg p-4 border border-gray-600/30 mt-4">
          <p className="text-sm text-gray-400 mb-2">TOPLAM NAKIT (TL)</p>
          <p className="text-3xl font-bold text-gray-100">{cashTlTotal.toFixed(2)} ₺</p>
        </div>

        {/* Genel Toplam */}
        <div className="bg-gradient-to-r from-orange-900/30 to-transparent rounded-lg p-4 border-2 border-orange-500/50">
          <p className="text-sm text-orange-300 mb-2 font-bold">GENEL TOPLAM (TL)</p>
          <p className="text-4xl font-bold text-orange-300">{totalAllCurrencies.toFixed(2)} ₺</p>
        </div>
      </div>
    </div>
  );
}
