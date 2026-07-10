import { useState, useEffect, useCallback } from 'react';
import { Ticket, RefreshCw, CheckCircle2, XCircle, Search } from 'lucide-react';
import { getKasaId } from '@/utils/session';
import { getTodayTicketStatus, type TicketStatusSale } from '@/utils/posBridge';

const VENUE_LABELS: Record<string, string> = {
  wildpark: 'WildPark',
  sinema: 'XD Sinema',
  face2face: 'Face2Face',
};

function formatTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function TicketTrackTab() {
  const kasaId = getKasaId('sinema');
  const [sales, setSales] = useState<TicketStatusSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await getTodayTicketStatus(kasaId);
    if (result.success) {
      setSales(result.sales || []);
    } else {
      setError(result.error || 'Bilet durumu yüklenemedi');
    }
    setLoading(false);
  }, [kasaId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const filteredSales = sales.filter(s => {
    if (!filter.trim()) return true;
    const q = filter.trim().toLowerCase();
    return (
      String(s.terminalRecordId).includes(q) ||
      (s.createdBy || '').toLowerCase().includes(q) ||
      s.tickets.some(t => String(t.ticketId).includes(q))
    );
  });

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Ticket className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">Bilet Takip</h2>
            <p className="text-xs text-gray-400 mt-0.5 font-medium">
              Bugün {VENUE_LABELS[kasaId] || kasaId} tarafından satılan biletlerin turnike durumu · {sales.length} satış
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Bilet no, kayıt no veya personel ile ara..."
          className="w-full pl-9 pr-3 py-2.5 bg-gray-900 border border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500/50"
        />
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-300 text-sm px-4 py-3 rounded-xl border border-red-500/25">⚠ {error}</div>
      )}

      {loading && sales.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Yükleniyor...</div>
      ) : filteredSales.length === 0 ? (
        <div className="text-center py-16 bg-gradient-to-br from-gray-900 to-gray-950 rounded-2xl border border-dashed border-gray-700/50">
          <Ticket className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-400">Bugün henüz kayıtlı bilet yok</p>
          <p className="text-xs mt-1.5 text-gray-600">Bu liste her gün sıfırlanır, sadece bugünkü satışları gösterir</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredSales.map(sale => (
            <div key={sale.terminalRecordId} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="font-bold text-white">#{sale.terminalRecordId}</span>
                  <span>·</span>
                  <span>{sale.createdBy || 'Bilinmiyor'}</span>
                  <span>·</span>
                  <span>{formatTime(sale.saleDate)}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 font-bold">
                  {sale.tickets.length} bilet
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {sale.tickets.map(t => (
                  <div
                    key={t.ticketId}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                      t.isUsed
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-gray-800/60 border-gray-700/50 text-gray-400'
                    }`}
                  >
                    {t.isUsed ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0 text-gray-600" />}
                    <div>
                      <p className="font-bold">{VENUE_LABELS[t.venue] || t.venue}</p>
                      <p className="text-[10px] opacity-80">
                        {t.isUsed ? `Girdi · ${formatTime(t.useDate)}` : 'Girmedi'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
