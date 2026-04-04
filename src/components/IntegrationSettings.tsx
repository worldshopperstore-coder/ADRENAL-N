/* ──────────────────────────────────────────────────────────
   POS Entegrasyon Ayarları Bileşeni
   SettingsTab.tsx'e eklenecek panel
   ────────────────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { Database, Wifi, WifiOff, Server, Printer, CreditCard, Activity, RefreshCw, Power, PowerOff, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { loadIntegrationSettings, saveIntegrationSettings, startBridge, stopBridge, getBridgeStatus } from '@/utils/posManager';
import { checkBridgeHealth, getTodaySales } from '@/utils/posBridge';
import type { IntegrationSettings } from '@/types/atlantis';

export default function IntegrationSettingsPanel() {
  const [settings, setSettings] = useState<IntegrationSettings>(loadIntegrationSettings());
  const [bridgeStatus, setBridgeStatus] = useState<{ running: boolean; ready: boolean; pid: number | null }>({ running: false, ready: false, pid: null });
  const [healthCheck, setHealthCheck] = useState<{ status: string; database?: string; error?: string } | null>(null);
  const [todayStats, setTodayStats] = useState<{ recordCount?: number; ticketCount?: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [bridgeLoading, setBridgeLoading] = useState(false);

  // Bridge durumunu periyodik kontrol
  useEffect(() => {
    const check = async () => {
      const status = await getBridgeStatus();
      setBridgeStatus(status);
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = () => {
    setSaving(true);
    saveIntegrationSettings(settings);
    setTimeout(() => setSaving(false), 500);
  };

  const handleToggle = () => {
    const newSettings = { ...settings, enabled: !settings.enabled };
    setSettings(newSettings);
    saveIntegrationSettings(newSettings);
  };

  const handleStartBridge = async () => {
    setBridgeLoading(true);
    await startBridge();
    // Biraz bekle ve durumu güncelle
    setTimeout(async () => {
      const status = await getBridgeStatus();
      setBridgeStatus(status);
      setBridgeLoading(false);
    }, 2000);
  };

  const handleStopBridge = async () => {
    setBridgeLoading(true);
    await stopBridge();
    setTimeout(async () => {
      const status = await getBridgeStatus();
      setBridgeStatus(status);
      setBridgeLoading(false);
    }, 1000);
  };

  const handleHealthCheck = async () => {
    const result = await checkBridgeHealth();
    setHealthCheck(result);
    
    if (result.status === 'ok') {
      const stats = await getTodaySales();
      if (stats.success) {
        setTodayStats({ recordCount: stats.recordCount, ticketCount: stats.ticketCount });
      }
    }
  };

  const StatusBadge = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
      ok ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
         : 'bg-red-500/15 text-red-400 border border-red-500/30'
    }`}>
      {ok ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600/20 border border-indigo-600/40 rounded-xl flex items-center justify-center">
            <Database className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">POS Entegrasyonu</h3>
            <p className="text-xs text-gray-500">Atlantis AquariumDB3 + POS Server + Zebra Printer</p>
          </div>
        </div>
        
        {/* Aktif/Pasif Toggle */}
        <button
          onClick={handleToggle}
          className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
            settings.enabled ? 'bg-emerald-600' : 'bg-gray-700'
          }`}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
            settings.enabled ? 'translate-x-8' : 'translate-x-1'
          }`} />
        </button>
      </div>

      {/* Mod Göstergesi */}
      <div className={`p-3 rounded-xl border ${
        settings.enabled
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : 'bg-yellow-500/10 border-yellow-500/30'
      }`}>
        <div className="flex items-center gap-2">
          {settings.enabled ? (
            <>
              <Wifi className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">AKTİF MOD</span>
              <span className="text-xs text-gray-400 ml-2">— SQL Server + POS + Bilet Basım</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-medium text-yellow-400">PASİF MOD</span>
              <span className="text-xs text-gray-400 ml-2">— Sadece Supabase kayıt</span>
            </>
          )}
        </div>
      </div>

      {settings.enabled && (
        <>
          {/* Bridge Durumu */}
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <Server className="w-4 h-4" />
                SQL Bridge Durumu
              </h4>
              <div className="flex items-center gap-2">
                <StatusBadge ok={bridgeStatus.running} label={bridgeStatus.running ? 'Çalışıyor' : 'Durdu'} />
                {bridgeStatus.pid && <span className="text-xs text-gray-500">PID: {bridgeStatus.pid}</span>}
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleStartBridge}
                disabled={bridgeLoading || bridgeStatus.running}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/40 rounded-lg text-xs text-emerald-400 disabled:opacity-50 transition-colors"
              >
                <Power className="w-3 h-3" />
                Başlat
              </button>
              <button
                onClick={handleStopBridge}
                disabled={bridgeLoading || !bridgeStatus.running}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 rounded-lg text-xs text-red-400 disabled:opacity-50 transition-colors"
              >
                <PowerOff className="w-3 h-3" />
                Durdur
              </button>
              <button
                onClick={handleHealthCheck}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/40 rounded-lg text-xs text-blue-400 transition-colors"
              >
                <Activity className="w-3 h-3" />
                Sağlık Kontrolü
              </button>
            </div>

            {healthCheck && (
              <div className={`p-2 rounded-lg text-xs ${
                healthCheck.status === 'ok'
                  ? 'bg-emerald-900/30 border border-emerald-700/30 text-emerald-300'
                  : 'bg-red-900/30 border border-red-700/30 text-red-300'
              }`}>
                {healthCheck.status === 'ok'
                  ? `✓ Bağlantı başarılı: ${healthCheck.database}`
                  : `✗ Hata: ${healthCheck.error}`
                }
                {todayStats && (
                  <span className="ml-2 text-gray-400">
                    | Bugün: {todayStats.recordCount} satış, {todayStats.ticketCount} bilet
                  </span>
                )}
              </div>
            )}
          </div>

          {/* SQL Server Ayarları */}
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <Database className="w-4 h-4" />
              SQL Server
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Sunucu IP</label>
                <input
                  type="text"
                  value={settings.sqlServer.host}
                  onChange={e => setSettings({...settings, sqlServer: {...settings.sqlServer, host: e.target.value}})}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Port</label>
                <input
                  type="number"
                  value={settings.sqlServer.port}
                  onChange={e => setSettings({...settings, sqlServer: {...settings.sqlServer, port: parseInt(e.target.value) || 1433}})}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Veritabanı</label>
                <input
                  type="text"
                  value={settings.sqlServer.database}
                  onChange={e => setSettings({...settings, sqlServer: {...settings.sqlServer, database: e.target.value}})}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Kullanıcı</label>
                <input
                  type="text"
                  value={settings.sqlServer.username}
                  onChange={e => setSettings({...settings, sqlServer: {...settings.sqlServer, username: e.target.value}})}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
                />
              </div>
            </div>
          </div>

          {/* POS Ayarları */}
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                POS Server
              </h4>
              <button
                onClick={() => setSettings({...settings, pos: {...settings.pos, enabled: !settings.pos.enabled}})}
                className={`text-xs px-2 py-0.5 rounded-full ${settings.pos.enabled ? 'bg-emerald-600/30 text-emerald-400' : 'bg-gray-700 text-gray-400'}`}
              >
                {settings.pos.enabled ? 'Aktif' : 'Devre Dışı'}
              </button>
            </div>
            {settings.pos.enabled && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">IP</label>
                  <input
                    type="text"
                    value={settings.pos.ip}
                    onChange={e => setSettings({...settings, pos: {...settings.pos, ip: e.target.value}})}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Port</label>
                  <input
                    type="number"
                    value={settings.pos.port}
                    onChange={e => setSettings({...settings, pos: {...settings.pos, port: parseInt(e.target.value) || 9960}})}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">KDV %</label>
                  <input
                    type="number"
                    value={settings.pos.tax}
                    onChange={e => setSettings({...settings, pos: {...settings.pos, tax: parseInt(e.target.value) || 20}})}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Yazıcı Ayarları */}
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <Printer className="w-4 h-4" />
                Zebra Yazıcı
              </h4>
              <button
                onClick={() => setSettings({...settings, printer: {...settings.printer, enabled: !settings.printer.enabled}})}
                className={`text-xs px-2 py-0.5 rounded-full ${settings.printer.enabled ? 'bg-emerald-600/30 text-emerald-400' : 'bg-gray-700 text-gray-400'}`}
              >
                {settings.printer.enabled ? 'Aktif' : 'Devre Dışı'}
              </button>
            </div>
            {settings.printer.enabled && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Yazıcı Adı</label>
                <input
                  type="text"
                  value={settings.printer.name}
                  onChange={e => setSettings({...settings, printer: {...settings.printer, name: e.target.value}})}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
                />
              </div>
            )}
          </div>

          {/* Kaydet */}
          <button
            onClick={handleSave}
            className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
              saving
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {saving ? '✓ Kaydedildi' : 'Ayarları Kaydet'}
          </button>
        </>
      )}
    </div>
  );
}
