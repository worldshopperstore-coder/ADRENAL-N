import { useState, useEffect } from 'react';
import { Info, Users, User, Building2 } from 'lucide-react';
import IntegrationSettingsPanel from './IntegrationSettings';

export default function SettingsTab() {
  const [kasaName, setKasaName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState('');
  const [kasaId, setKasaId] = useState('');

  useEffect(() => {
    const currentKasaName = localStorage.getItem('currentKasaName') || 'Kasa';
    const currentKasaId = localStorage.getItem('currentKasaId') || '';
    const session = localStorage.getItem('userSession');

    setKasaName(currentKasaName);
    setKasaId(currentKasaId);

    if (session) {
      const userData = JSON.parse(session);
      const p = userData.personnel;
      setUserRole(p?.role || 'personel');
      setUserName(p?.fullName || '');
      setUserId(p?.id || '');
    }
  }, []);

  const isGeneralManager = userRole === 'genel_mudur';

  return (
    <div className="p-2 sm:p-4 space-y-4">
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/30">
            <Info className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Ayrıntılar</h2>
            <p className="text-xs text-gray-500 mt-0.5">{kasaName}</p>
          </div>
        </div>
        <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
          isGeneralManager
            ? 'bg-amber-900/30 text-amber-400 border-amber-700/40'
            : 'bg-gray-800/60 text-gray-400 border-gray-700/40'
        }`}>
          {isGeneralManager ? '👑 Genel Müdür' : '👤 Personel'}
        </span>
      </div>

      {/* ── KULLANICI BİLGİLERİ ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-gradient-to-br from-blue-900/40 to-blue-900/20 rounded-xl border border-blue-700/30 p-3">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] text-blue-400/80 font-semibold uppercase tracking-wider">Ad Soyad</span>
          </div>
          <p className="text-base font-bold text-blue-300 truncate">{userName || '—'}</p>
        </div>
        <div className="bg-gradient-to-br from-violet-900/40 to-violet-900/20 rounded-xl border border-violet-700/30 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[10px] text-violet-400/80 font-semibold uppercase tracking-wider">Kasa</span>
          </div>
          <p className="text-base font-bold text-violet-300 truncate">{kasaName || '—'}</p>
        </div>
        <div className={`rounded-xl border p-3 ${isGeneralManager
          ? 'bg-gradient-to-br from-amber-900/40 to-amber-900/20 border-amber-700/30'
          : 'bg-gradient-to-br from-gray-800 to-gray-800/60 border-gray-600/40 ring-1 ring-white/5'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <Users className={`w-3.5 h-3.5 ${isGeneralManager ? 'text-amber-400' : 'text-gray-400'}`} />
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${isGeneralManager ? 'text-amber-400/80' : 'text-gray-400'}`}>Yetki</span>
          </div>
          <p className={`text-base font-bold ${isGeneralManager ? 'text-amber-300' : 'text-gray-300'}`}>
            {isGeneralManager ? 'Genel Müdür' : 'Personel'}
          </p>
        </div>
      </div>

      {/* ── POS ENTEGRASYON AYARLARI ── */}
      <IntegrationSettingsPanel />

    </div>
  );
}

