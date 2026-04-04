import { useState, useEffect, useCallback, useRef } from 'react';
import { X, QrCode, Clock, LogOut, Loader2 } from 'lucide-react';
import { getCheckoutRequests, type AttendanceRecord } from '@/utils/attendanceDB';

interface CheckoutPopupProps {
  kasaId: string;
  personnelId?: string;
  onLogout?: () => void;
}

export default function CheckoutPopup({ kasaId, personnelId, onLogout }: CheckoutPopupProps) {
  const [requests, setRequests] = useState<AttendanceRecord[]>([]);
  const hadMyRequest = useRef(false);

  const poll = useCallback(async () => {
    console.log('[CheckoutPopup] Polling checkout requests for kasa:', kasaId);
    const reqs = await getCheckoutRequests(kasaId);
    console.log('[CheckoutPopup] Found requests:', reqs.length, reqs);

    // Track if current user had a checkout request
    const myRequest = personnelId ? reqs.some(r => r.personnel_id === personnelId) : false;
    if (myRequest) {
      hadMyRequest.current = true;
    }

    // If current user's request disappeared → checkout completed → logout
    if (hadMyRequest.current && !myRequest && personnelId) {
      console.log('[CheckoutPopup] Current user checkout completed, triggering logout');
      hadMyRequest.current = false;
      onLogout?.();
      return;
    }

    setRequests(reqs);
  }, [kasaId, personnelId, onLogout]);

  useEffect(() => {
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [poll]);

  // Re-poll faster when we have active requests (to detect when phone scans)
  useEffect(() => {
    if (requests.length === 0) return;
    const iv = setInterval(poll, 2000);
    return () => clearInterval(iv);
  }, [requests.length, poll]);

  if (requests.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
        {requests.map((req) => (
          <CheckoutCard key={req.id} record={req} />
        ))}
      </div>
    </div>
  );
}

function CheckoutCard({ record }: { record: AttendanceRecord }) {
  const token = record.checkout_token || '';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(token)}&bgcolor=ffffff&color=111827`;
  const [imgLoaded, setImgLoaded] = useState(false);
  const checkinTime = record.check_in
    ? new Date(record.check_in).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 rounded-2xl border border-red-500/30 shadow-2xl shadow-red-500/10 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-500/15 to-rose-500/10 px-5 py-3 border-b border-red-500/20 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center animate-pulse">
          <LogOut className="w-5 h-5 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-sm">Çıkış Talebi</h3>
          <p className="text-red-400/60 text-[11px] truncate">{record.personnel_name} çıkış yapmak istiyor</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <Clock className="w-3 h-3" />
          <span>Giriş: {checkinTime}</span>
        </div>
      </div>

      {/* QR */}
      <div className="p-5 flex flex-col items-center gap-3">
        <p className="text-gray-400 text-xs text-center">
          Personelin telefonuyla bu QR kodu okutması gerekiyor
        </p>
        <div className="relative bg-white rounded-xl p-3 shadow-lg">
          {!imgLoaded && (
            <div className="w-[200px] h-[200px] flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
          )}
          <img
            src={qrUrl}
            alt="Çıkış QR Kodu"
            className={`w-[200px] h-[200px] ${imgLoaded ? '' : 'hidden'}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
          />
        </div>
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <QrCode className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-amber-400/80 text-[10px] font-medium">
            Telefon QR'ı okuttuğunda bu popup otomatik kapanacak
          </p>
        </div>
      </div>
    </div>
  );
}
