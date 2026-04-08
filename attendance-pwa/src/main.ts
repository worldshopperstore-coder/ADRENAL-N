import { createClient } from '@supabase/supabase-js';
import { Html5Qrcode } from 'html5-qrcode';

// ── Supabase ──
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://mipafqwsibhazkszzcxb.supabase.co';
const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Cby57dwYK-5-gpuUGGE_aQ_nFzy41cv';
const supabase = createClient(supabaseUrl, supabaseKey);

const PWA_VERSION = 'v5.1';

// ── Types ──
interface AttendanceRecord {
  id: string; personnel_id: string; personnel_name: string; kasa_id: string;
  date: string; check_in: string | null; check_out: string | null;
  status: string; session_token: string; checkout_token?: string;
}
interface PersonnelInfo { id: string; fullName: string; kasaId: string; role: string; }
interface WeekDay { start?: string; end?: string; isOff?: boolean; leaveType?: string; }

// ── State ──
let scanner: Html5Qrcode | null = null;
let currentUser: PersonnelInfo | null = null;
let currentAttendance: AttendanceRecord | null = null;
let activeTab: 'home' | 'team' | 'schedule' = 'home';
let liveTimerInterval: ReturnType<typeof setInterval> | null = null;
let isOnline = navigator.onLine;

// ── Self-Service Mode ──
const urlParams = new URLSearchParams(window.location.search);
const isSelfService = urlParams.get('mode') === 'self';
const selfKasa = urlParams.get('kasa') || 'yasam_destek';

// GPS target: Antalya Aquarium
const GPS_TARGET = { lat: 36.8570, lng: 30.6350, radiusM: 200 };

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

function checkGPS(): Promise<{ ok: boolean; dist?: number; error?: string }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      // Localhost'ta GPS yoksa atla
      if (isLocalhost) { resolve({ ok: true, dist: 0 }); return; }
      resolve({ ok: false, error: 'Cihazınızda GPS desteklenmiyor.' }); return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversineDistance(pos.coords.latitude, pos.coords.longitude, GPS_TARGET.lat, GPS_TARGET.lng);
        if (isLocalhost) { resolve({ ok: true, dist }); return; } // Localhost'ta mesafe kontrolü yapma
        resolve(dist <= GPS_TARGET.radiusM ? { ok: true, dist } : { ok: false, dist, error: `İşyerinden çok uzaktasınız (${Math.round(dist)}m). Maksimum mesafe: ${GPS_TARGET.radiusM}m` });
      },
      (err) => {
        // Localhost'ta GPS hatası olursa atla (test mode)
        if (isLocalhost) { resolve({ ok: true, dist: 0 }); return; }
        const msgs: Record<number, string> = {
          1: 'Konum izni verilmedi. Lütfen tarayıcı ayarlarından konum iznini açın.',
          2: 'Konum bilgisi alınamadı. Lütfen GPS\'inizi açın.',
          3: 'Konum isteği zaman aşımına uğradı.'
        };
        resolve({ ok: false, error: msgs[err.code] || 'Konum alınamadı.' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

// ── Helpers ──
const esc = (s: string) => {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
};

// ── Online/Offline detection ──
window.addEventListener('online', () => { isOnline = true; hideOfflineBanner(); });
window.addEventListener('offline', () => { isOnline = false; showOfflineBanner(); });

function showOfflineBanner() {
  if (document.getElementById('offline-banner')) return;
  const b = document.createElement('div');
  b.id = 'offline-banner';
  b.innerHTML = `<div style="position:fixed;top:0;left:0;right:0;z-index:999;background:#dc2626;padding:6px 16px;text-align:center;font-size:11px;color:#fff;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;padding-top:max(6px,env(safe-area-inset-top))">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 1l22 22"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
    İnternet bağlantısı yok
  </div>`;
  document.body.appendChild(b);
}

function hideOfflineBanner() {
  document.getElementById('offline-banner')?.remove();
}

// ── Session Persist ──
function saveSession(user: PersonnelInfo, att: AttendanceRecord) {
  currentUser = user; currentAttendance = att;
  localStorage.setItem('pwa_user', JSON.stringify(user));
  localStorage.setItem('pwa_attendance', JSON.stringify(att));
  localStorage.setItem('pwa_user_hint', JSON.stringify({ id: user.id, fullName: user.fullName, kasaId: user.kasaId, role: user.role }));
}
function loadSession(): boolean {
  try {
    const u = localStorage.getItem('pwa_user');
    const a = localStorage.getItem('pwa_attendance');
    if (u && a) {
      currentUser = JSON.parse(u); currentAttendance = JSON.parse(a);
      const today = new Date().toISOString().slice(0, 10);
      if (currentAttendance && currentAttendance.date === today &&
          (currentAttendance.status === 'checked_in' || currentAttendance.status === 'checkout_pending')) return true;
    }
  } catch {}
  clearSession(); return false;
}
function clearSession(full = false) {
  currentUser = null; currentAttendance = null;
  localStorage.removeItem('pwa_user'); localStorage.removeItem('pwa_attendance');
  if (full) localStorage.removeItem('pwa_user_hint');
}

async function tryRecoverSession(): Promise<boolean> {
  try {
    const hint = localStorage.getItem('pwa_user_hint');
    if (!hint) return false;
    const user: PersonnelInfo = JSON.parse(hint);
    const today = new Date().toISOString().slice(0, 10);
    const rowId = `${user.id}_${today}`;
    const { data, error } = await supabase.from('attendance').select('*').eq('id', rowId).single();
    if (error || !data) return false;
    if (data.status === 'checked_in' || data.status === 'checkout_pending') {
      saveSession(user, data);
      return true;
    }
    return false;
  } catch { return false; }
}

// ── Constants ──
const KASA_NAMES: Record<string, string> = { wildpark: 'WildPark', sinema: 'XD Sinema', face2face: 'Face2Face', genel: 'Genel Yönetim', yasam_destek: 'Yaşam Destek' };
const LEAVE_COLORS: Record<string, string> = { 'Yıllık İzin': '#3b82f6', 'Hastalık İzni': '#ef4444', 'Mazeret İzni': '#f59e0b', 'İzin': '#ea580c' };
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_KEY_TO_TR: Record<string, string> = { monday:'Pazartesi', tuesday:'Salı', wednesday:'Çarşamba', thursday:'Perşembe', friday:'Cuma', saturday:'Cumartesi', sunday:'Pazar' };
const COLORS = ['#f97316', '#06b6d4', '#ec4899', '#f59e0b', '#22c55e', '#a855f7'];

// ── Icons (Lucide-style) ──
const I = {
  qr: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3"/><path d="M20 14v3h-3"/><path d="M14 20h3"/><path d="M20 20h0"/></svg>`,
  home: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  users: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
  cal: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  out: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  clk: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  ok: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`,
  x: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  cam: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  flame: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>`,
};

// ── CSS ──
const CSS = `<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
:root{--bg:#09090b;--bg2:#111318;--card:rgba(255,255,255,.035);--border:rgba(255,255,255,.07);--orange:#f97316;--red:#ef4444;--green:#22c55e;--amber:#f59e0b;--text:#fff;--text2:rgba(255,255,255,.45);--text3:rgba(255,255,255,.2);--safe-top:max(0px,env(safe-area-inset-top));--safe-bottom:max(0px,env(safe-area-inset-bottom))}
body,html,#app{width:100%;height:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:var(--text);background:var(--bg)}
body{overscroll-behavior:none;user-select:none;-webkit-user-select:none;touch-action:pan-y}
input,button,select{font-family:inherit}

@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes scaleIn{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes breathe{0%,100%{box-shadow:0 0 20px rgba(249,115,22,.15)}50%{box-shadow:0 0 40px rgba(249,115,22,.3)}}
@keyframes scanline{0%{top:0}100%{top:calc(100% - 2px)}}

.fade-in{animation:fadeIn .4s ease-out both}
.scale-in{animation:scaleIn .4s cubic-bezier(.175,.885,.32,1.275) both}
.slide-up{animation:slideUp .35s ease-out both}

.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px;transition:transform .15s}
.card:active{transform:scale(.98)}
.card-glow-green{border-color:rgba(34,197,94,.2);box-shadow:0 0 20px rgba(34,197,94,.05)}
.card-glow-amber{border-color:rgba(245,158,11,.2);box-shadow:0 0 20px rgba(245,158,11,.05)}

.btn{padding:14px 24px;border:none;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s;width:100%;touch-action:manipulation;position:relative;overflow:hidden}
.btn:active{transform:scale(.96);opacity:.85}
.btn-primary{background:linear-gradient(135deg,var(--orange),#ea580c);color:#fff;box-shadow:0 4px 20px rgba(249,115,22,.3)}
.btn-danger{background:linear-gradient(135deg,#dc2626,var(--red));color:#fff;box-shadow:0 4px 20px rgba(220,38,38,.25)}
.btn-ghost{background:rgba(255,255,255,.04);color:var(--text2);border:1px solid var(--border)}

.bottom-nav{position:fixed;bottom:0;left:0;right:0;z-index:50;padding:4px 12px;padding-bottom:max(6px,var(--safe-bottom));background:rgba(9,9,11,.95);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-top:1px solid var(--border)}
.nav-bar{display:flex;gap:2px;border-radius:14px;padding:3px;background:rgba(255,255,255,.025)}
.nav-btn{flex:1;padding:8px 4px;border-radius:12px;border:none;font-size:10px;font-weight:600;cursor:pointer;color:var(--text3);background:transparent;transition:all .2s;display:flex;flex-direction:column;align-items:center;gap:3px;touch-action:manipulation}
.nav-btn.active{background:rgba(249,115,22,.1);color:#fdba74;box-shadow:0 2px 8px rgba(249,115,22,.12)}
.nav-btn svg{transition:transform .2s}
.nav-btn.active svg{transform:scale(1.1)}

.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600}
.stat{background:rgba(255,255,255,.025);border:1px solid var(--border);border-radius:12px;padding:10px;text-align:center}

.splash{position:fixed;inset:0;z-index:100;background:var(--bg);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;transition:opacity .4s}
.splash-logo{animation:breathe 2s ease-in-out infinite}

.scan-frame{position:relative;border-radius:16px;overflow:hidden}
.scan-overlay{position:absolute;inset:0;pointer-events:none;z-index:5}
.scan-corner{position:absolute;width:28px;height:28px;border-color:var(--orange);border-style:solid}
.scan-corner.tl{top:10px;left:10px;border-width:3px 0 0 3px;border-radius:6px 0 0 0}
.scan-corner.tr{top:10px;right:10px;border-width:3px 3px 0 0;border-radius:0 6px 0 0}
.scan-corner.bl{bottom:10px;left:10px;border-width:0 0 3px 3px;border-radius:0 0 0 6px}
.scan-corner.br{bottom:10px;right:10px;border-width:0 3px 3px 0;border-radius:0 0 6px 0}
.scan-line{position:absolute;left:15px;right:15px;height:2px;background:linear-gradient(90deg,transparent,var(--orange),transparent);animation:scanline 2s ease-in-out infinite alternate;z-index:5}

.progress-track{height:6px;border-radius:4px;background:rgba(255,255,255,.06);overflow:hidden}
.progress-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,var(--orange),#ea580c);transition:width .8s ease}

.wave-bg{position:fixed;bottom:0;left:0;width:100%;height:30vh;opacity:.1;pointer-events:none;z-index:0}

.page{min-height:100vh;min-height:100dvh;background:var(--bg);position:relative;overflow:hidden;display:flex;flex-direction:column}
.page-content{position:relative;z-index:2;flex:1;display:flex;flex-direction:column}
</style>`;

const WAVE = `<svg class="wave-bg" viewBox="0 0 1440 400" preserveAspectRatio="none">
  <defs><linearGradient id="wg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f97316" stop-opacity="0.5"/><stop offset="100%" stop-color="#dc2626" stop-opacity="0.3"/></linearGradient>
  <linearGradient id="wg2" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#ea580c" stop-opacity="0.3"/><stop offset="100%" stop-color="#ef4444" stop-opacity="0.2"/></linearGradient></defs>
  <path fill="url(#wg1)"><animate attributeName="d" dur="8s" repeatCount="indefinite" values="M0,200 C200,100 400,300 720,180 C1040,60 1250,280 1440,200 L1440,400 L0,400Z;M0,250 C250,150 500,350 720,220 C940,90 1200,300 1440,250 L1440,400 L0,400Z;M0,200 C200,100 400,300 720,180 C1040,60 1250,280 1440,200 L1440,400 L0,400Z"/></path>
  <path fill="url(#wg2)"><animate attributeName="d" dur="10s" repeatCount="indefinite" values="M0,280 C300,200 600,350 900,260 C1200,170 1350,320 1440,280 L1440,400 L0,400Z;M0,300 C350,240 550,380 900,300 C1250,220 1300,350 1440,300 L1440,400 L0,400Z;M0,280 C300,200 600,350 900,260 C1200,170 1350,320 1440,280 L1440,400 L0,400Z"/></path>
</svg>`;

// ════════════════════════════════════════
// SPLASH SCREEN
// ════════════════════════════════════════
function showSplash(): Promise<void> {
  const app = document.getElementById('app')!;
  app.innerHTML = `${CSS}
    <div class="splash" id="splash-screen">
      <div class="splash-logo" style="width:80px;height:80px;background:linear-gradient(135deg,var(--orange),#ea580c);border-radius:24px;display:flex;align-items:center;justify-content:center;color:#fff">
        ${I.flame}
      </div>
      <div style="text-align:center">
        <div style="display:flex;align-items:center;justify-content:center;gap:4px">
          <span style="font-weight:800;font-size:18px;letter-spacing:-.3px;color:#fff">adrenalin</span>
          <span style="color:var(--orange);font-size:10px;font-weight:700;vertical-align:super">\u00ae</span>
        </div>
        <p style="color:var(--text3);font-size:11px;margin-top:4px">Puantaj Sistemi</p>
      </div>
      <div style="margin-top:12px;width:28px;height:28px;border:2px solid rgba(249,115,22,.2);border-top-color:var(--orange);border-radius:50%;animation:spin .8s linear infinite"></div>
      <p style="color:var(--text3);font-size:8px;position:absolute;bottom:max(20px,var(--safe-bottom));left:50%;transform:translateX(-50%)">${PWA_VERSION}</p>
    </div>`;
  return new Promise(r => setTimeout(r, 1200));
}

// ════════════════════════════════════════
// ROUTER
// ════════════════════════════════════════
async function renderApp() {
  stopLiveTimer();
  if (isSelfService) {
    // Self-service mode: login → direct check-in/out with GPS
    if (loadSession()) { showDashboard(); return; }
    const recovered = await tryRecoverSession();
    if (recovered) { showDashboard(); return; }
    showSelfLogin();
    return;
  }
  if (loadSession()) { showDashboard(); return; }
  const recovered = await tryRecoverSession();
  if (recovered) { showDashboard(); return; }
  showScanner('checkin');
}

// ════════════════════════════════════════
// QR SCANNER
// ════════════════════════════════════════
function showScanner(mode: 'checkin' | 'checkout') {
  stopLiveTimer();
  const app = document.getElementById('app')!;
  const isOut = mode === 'checkout';
  app.innerHTML = `${CSS}
    <div class="page">
      ${WAVE}
      <div class="page-content" style="align-items:center;padding:0 20px">
        <div style="text-align:center;padding:max(40px,var(--safe-top)) 0 16px;width:100%;max-width:380px" class="fade-in">
          <div style="width:56px;height:56px;margin:0 auto 12px;background:${isOut ? 'rgba(239,68,68,.1)' : 'rgba(249,115,22,.1)'};border:2px solid ${isOut ? 'rgba(239,68,68,.25)' : 'rgba(249,115,22,.25)'};border-radius:50%;display:flex;align-items:center;justify-content:center;color:${isOut ? 'var(--red)' : 'var(--orange)'}">
            ${isOut ? I.out : I.qr}
          </div>
          <h1 style="font-size:22px;font-weight:800;letter-spacing:-.3px;margin:0 0 4px">${isOut ? '\u00c7\u0131k\u0131\u015f QR Kodu' : 'Puantaj Giri\u015f'}</h1>
          <p style="color:var(--text2);font-size:12px;margin:0">${isOut ? 'PC\'deki \u00e7\u0131k\u0131\u015f QR kodunu okutun' : 'PC\'deki QR kodu okutun'}</p>
        </div>
        <div style="width:100%;max-width:340px" class="slide-up">
          <div class="scan-frame">
            <div id="qr-reader" style="width:100%;border-radius:16px;overflow:hidden"></div>
            <div class="scan-overlay">
              <div class="scan-corner tl"></div>
              <div class="scan-corner tr"></div>
              <div class="scan-corner bl"></div>
              <div class="scan-corner br"></div>
              <div class="scan-line"></div>
            </div>
          </div>
          <p style="color:var(--text3);font-size:10px;text-align:center;margin-top:10px">Kameran\u0131z\u0131 QR koda do\u011frultun</p>
          ${isOut ? `<button id="cancel-co" class="btn btn-ghost" style="margin-top:14px">\u0130ptal</button>` : ''}
        </div>
        <div style="position:absolute;bottom:max(16px,var(--safe-bottom));display:flex;align-items:center;gap:4px">
          <span style="font-weight:800;font-size:10px;color:var(--text3)">adrenalin</span>
          <span style="color:var(--orange);font-size:7px;font-weight:700">\u00ae</span>
          <span style="color:rgba(255,255,255,.08);font-size:8px;margin-left:4px">${PWA_VERSION}</span>
        </div>
      </div>
    </div>`;

  if (isOut) document.getElementById('cancel-co')?.addEventListener('click', async () => {
    if (currentAttendance) {
      await supabase.from('attendance').update({ status: 'checked_in', checkout_token: null }).eq('id', currentAttendance.id);
      currentAttendance.status = 'checked_in';
      if (currentUser) saveSession(currentUser, currentAttendance);
    }
    showDashboard();
  });
  startScanner(mode);
}

async function startScanner(mode: 'checkin' | 'checkout') {
  if (scanner) { try { await scanner.stop(); } catch {} scanner = null; }
  const el = document.getElementById('qr-reader');
  if (!el) return;
  scanner = new Html5Qrcode('qr-reader');
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 15, qrbox: { width: 250, height: 250 }, aspectRatio: 1, disableFlip: true },
      async (decoded: string) => {
        try { await scanner?.stop(); } catch {}
        scanner = null;
        if (navigator.vibrate) navigator.vibrate(50);
        let token = '';
        try { const url = new URL(decoded); token = url.searchParams.get('token') || ''; } catch { token = decoded; }

        // Self-service QR: SELF-yasam_destek gibi
        if (token.startsWith('SELF-')) {
          const kasa = token.replace('SELF-', '');
          await handleSelfServiceQR(kasa);
          return;
        }

        if (mode === 'checkin') {
          if (!token.startsWith('ATT-')) { showError('Ge\u00e7ersiz QR kod.'); return; }
          showProcessing('Yoklama onaylan\u0131yor...'); await handleCheckin(token);
        } else {
          if (!token.startsWith('OUT-')) { showError('Ge\u00e7ersiz \u00e7\u0131k\u0131\u015f QR kodu.'); return; }
          showProcessing('\u00c7\u0131k\u0131\u015f onaylan\u0131yor...'); await handleCheckoutScan(token);
        }
      },
      () => {}
    );
  } catch {
    showError('Kamera eri\u015fimi sa\u011flanamad\u0131. L\u00fctfen taray\u0131c\u0131 ayarlar\u0131ndan kamera iznini verin.');
  }
}

async function handleCheckin(token: string) {
  try {
    const { data, error } = await supabase.from('attendance').select('*').eq('session_token', token).eq('status', 'pending').single();
    if (error || !data) { showError('QR do\u011frulanamad\u0131. L\u00fctfen tekrar deneyin.'); return; }
    const { error: upErr } = await supabase.from('attendance').update({ status: 'checked_in', check_in: new Date().toISOString() }).eq('id', data.id);
    if (upErr) { showError('Giri\u015f kaydedilemedi'); return; }
    const { data: pData } = await supabase.from('personnel').select('id, fullName, kasaId, role').eq('id', data.personnel_id).single();
    const user: PersonnelInfo = pData || { id: data.personnel_id, fullName: data.personnel_name, kasaId: data.kasa_id, role: 'personel' };
    data.status = 'checked_in'; data.check_in = new Date().toISOString();
    saveSession(user, data);
    showSuccess('Ho\u015f Geldiniz!', user.fullName, new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), true);
  } catch (e: any) {
    if (e?.message?.includes('Failed to fetch') || e?.message?.includes('NetworkError')) {
      showError('\u0130nternet ba\u011flant\u0131s\u0131 kurulamad\u0131. WiFi veya mobil verinizi kontrol edin.');
    } else {
      showError('Beklenmeyen bir hata olu\u015ftu. L\u00fctfen tekrar deneyin.');
    }
  }
}

async function handleCheckoutScan(token: string) {
  try {
    const { data, error } = await supabase.from('attendance').select('*').eq('checkout_token', token).eq('status', 'checkout_pending').single();
    if (error || !data) { showError('Ge\u00e7ersiz veya s\u00fcresi dolmu\u015f \u00e7\u0131k\u0131\u015f QR kodu.'); return; }
    const { error: upErr } = await supabase.from('attendance').update({ status: 'checked_out', check_out: new Date().toISOString(), checkout_token: null }).eq('id', data.id);
    if (upErr) { showError('\u00c7\u0131k\u0131\u015f kaydedilemedi'); return; }
    clearSession(true);
    showSuccess('G\u00fcle G\u00fcle!', esc(data.personnel_name), new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), false);
  } catch (e: any) {
    if (e?.message?.includes('Failed to fetch') || e?.message?.includes('NetworkError')) {
      showError('\u0130nternet ba\u011flant\u0131s\u0131 yok. \u00c7\u0131k\u0131\u015f i\u00e7in internet gerekli.');
    } else {
      showError('Beklenmeyen bir hata olu\u015ftu.');
    }
  }
}

// ════════════════════════════════════════
// SELF-SERVICE MODE (Yaşam Destek etc.)
// ════════════════════════════════════════
async function handleSelfServiceQR(kasa: string) {
  // Daha önce login olmuş mu? (localStorage'da hatırla)
  const savedHint = localStorage.getItem('pwa_user_hint');
  if (savedHint) {
    try {
      const user: PersonnelInfo = JSON.parse(savedHint);
      if (user.kasaId === kasa) {
        // Hatırladık — direkt GPS → giriş/çıkış
        await handleSelfServiceAutoCheckin(user, kasa);
        return;
      }
    } catch {}
  }
  // İlk kez — login ekranı göster
  showSelfLogin(kasa);
}

async function handleSelfServiceAutoCheckin(user: PersonnelInfo, kasa: string) {
  showProcessing('Konum doğrulanıyor...');
  const gps = await checkGPS();
  if (!gps.ok) { showError(gps.error || 'Konum doğrulanamadı.'); return; }

  const today = new Date().toISOString().slice(0, 10);
  const rowId = `${user.id}_${today}`;
  const { data: existing } = await supabase.from('attendance').select('*').eq('id', rowId).single();

  if (existing) {
    if (existing.status === 'checked_in') {
      // Zaten giriş yapmış — çıkış yap
      showProcessing('Çıkış kaydediliyor...');
      const now = new Date().toISOString();
      const { error } = await supabase.from('attendance').update({ status: 'checked_out', check_out: now, checkout_token: null }).eq('id', existing.id);
      if (error) { showError('Çıkış kaydedilemedi: ' + error.message); return; }
      clearSession(true);
      showSuccess('Güle Güle!', esc(user.fullName), new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), false);
      return;
    }
    if (existing.status === 'checked_out') {
      showError('Bugün zaten giriş ve çıkış yapmışsınız.');
      return;
    }
  }

  // Giriş yap
  showProcessing('Giriş kaydediliyor...');
  const now = new Date().toISOString();
  const newRecord: any = {
    id: rowId,
    personnel_id: user.id,
    personnel_name: user.fullName,
    kasa_id: kasa,
    date: today,
    check_in: now,
    check_out: null,
    status: 'checked_in',
    session_token: `SELF-${user.id}-${Date.now()}`,
  };
  const { error: insErr } = await supabase.from('attendance').upsert(newRecord);
  if (insErr) { showError('Giriş kaydedilemedi: ' + insErr.message); return; }
  saveSession(user, newRecord);
  showSuccess('Hoş Geldiniz!', user.fullName, new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), true);
}

function showSelfLogin(kasa?: string) {
  stopLiveTimer();
  const activeKasa = kasa || selfKasa;
  const app = document.getElementById('app')!;
  const kasaName = KASA_NAMES[activeKasa] || activeKasa;
  app.innerHTML = `${CSS}
    <div class="page">
      ${WAVE}
      <div class="page-content" style="align-items:center;padding:0 20px">
        <div style="text-align:center;padding:max(60px,var(--safe-top)) 0 20px;width:100%;max-width:340px" class="fade-in">
          <div style="width:64px;height:64px;margin:0 auto 14px;background:rgba(244,63,94,.1);border:2px solid rgba(244,63,94,.25);border-radius:50%;display:flex;align-items:center;justify-content:center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          </div>
          <h1 style="font-size:22px;font-weight:800;letter-spacing:-.3px;margin:0 0 4px">${esc(kasaName)}</h1>
          <p style="color:var(--text2);font-size:12px;margin:0">Puantaj Self-Servis Giriş</p>
        </div>
        <div style="width:100%;max-width:340px" class="slide-up">
          <div class="card" style="padding:20px">
            <div id="self-error" style="display:none;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:10px;margin-bottom:14px;font-size:11px;color:#ef4444;text-align:center"></div>
            <label style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px;display:block">Kullanıcı Adı</label>
            <input id="self-user" type="text" autocomplete="username" autocapitalize="none" style="width:100%;padding:10px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;color:#fff;font-size:14px;margin-bottom:12px;outline:none;box-sizing:border-box" placeholder="kullanici.adi">
            <label style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px;display:block">Şifre</label>
            <input id="self-pass" type="password" autocomplete="current-password" style="width:100%;padding:10px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;color:#fff;font-size:14px;margin-bottom:16px;outline:none;box-sizing:border-box" placeholder="••••">
            <button id="self-login-btn" class="btn btn-primary" style="width:100%;padding:12px;font-size:14px;font-weight:700">Giriş Yap</button>
          </div>
        </div>
        <div style="position:absolute;bottom:max(16px,var(--safe-bottom));display:flex;align-items:center;gap:4px">
          <span style="font-weight:800;font-size:10px;color:var(--text3)">adrenalin</span>
          <span style="color:var(--orange);font-size:7px;font-weight:700">®</span>
          <span style="color:rgba(255,255,255,.08);font-size:8px;margin-left:4px">${PWA_VERSION}</span>
        </div>
      </div>
    </div>`;

  const loginBtn = document.getElementById('self-login-btn')!;
  const userInput = document.getElementById('self-user') as HTMLInputElement;
  const passInput = document.getElementById('self-pass') as HTMLInputElement;
  const errDiv = document.getElementById('self-error')!;

  const doLogin = async () => {
    const username = userInput.value.trim();
    const password = passInput.value.trim();
    if (!username || !password) { errDiv.textContent = 'Kullanıcı adı ve şifre gerekli.'; errDiv.style.display = 'block'; return; }
    loginBtn.textContent = 'Kontrol ediliyor...';
    loginBtn.setAttribute('disabled', 'true');
    try {
      const { data: person, error } = await supabase.from('personnel').select('id, fullName, kasaId, role, password').eq('username', username).single();
      if (error || !person) { errDiv.textContent = 'Kullanıcı bulunamadı.'; errDiv.style.display = 'block'; loginBtn.textContent = 'Giriş Yap'; loginBtn.removeAttribute('disabled'); return; }
      if (person.password !== password) { errDiv.textContent = 'Şifre hatalı.'; errDiv.style.display = 'block'; loginBtn.textContent = 'Giriş Yap'; loginBtn.removeAttribute('disabled'); return; }
      if (person.kasaId !== activeKasa) { errDiv.textContent = 'Bu departmana erişim yetkiniz yok.'; errDiv.style.display = 'block'; loginBtn.textContent = 'Giriş Yap'; loginBtn.removeAttribute('disabled'); return; }

      // GPS check
      showProcessing('Konum doğrulanıyor...');
      const gps = await checkGPS();
      if (!gps.ok) { showError(gps.error || 'Konum doğrulanamadı.'); return; }

      // Check existing attendance for today
      const today = new Date().toISOString().slice(0, 10);
      const rowId = `${person.id}_${today}`;
      const { data: existing } = await supabase.from('attendance').select('*').eq('id', rowId).single();

      const user: PersonnelInfo = { id: person.id, fullName: person.fullName, kasaId: person.kasaId || activeKasa, role: person.role };

      // Kullanıcıyı hatırla — bir daha login gerekmez
      localStorage.setItem('pwa_user_hint', JSON.stringify(user));

      if (existing) {
        if (existing.status === 'checked_in') {
          // Already checked in — go to dashboard
          saveSession(user, existing);
          showDashboard();
          return;
        }
        if (existing.status === 'checked_out') {
          showError('Bugün zaten giriş ve çıkış yapmışsınız.');
          return;
        }
      }

      // Create new attendance (self-service check-in)
      showProcessing('Giriş kaydediliyor...');
      const now = new Date().toISOString();
      const newRecord: any = {
        id: rowId,
        personnel_id: person.id,
        personnel_name: person.fullName,
        kasa_id: person.kasaId || activeKasa,
        date: today,
        check_in: now,
        check_out: null,
        status: 'checked_in',
        session_token: `SELF-${person.id}-${Date.now()}`,
      };
      const { error: insErr } = await supabase.from('attendance').upsert(newRecord);
      if (insErr) { showError('Giriş kaydedilemedi: ' + insErr.message); return; }

      saveSession(user, newRecord);
      showSuccess('Hoş Geldiniz!', user.fullName, new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), true);
    } catch (e: any) {
      if (e?.message?.includes('Failed to fetch') || e?.message?.includes('NetworkError')) {
        showError('İnternet bağlantısı kurulamadı.');
      } else {
        showError('Beklenmeyen bir hata: ' + (e?.message || ''));
      }
    }
  };

  loginBtn.addEventListener('click', doLogin);
  passInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
}

async function selfServiceCheckout() {
  if (!currentUser || !currentAttendance) return;
  showProcessing('Konum doğrulanıyor...');
  const gps = await checkGPS();
  if (!gps.ok) { showError(gps.error || 'Konum doğrulanamadı.'); return; }

  showProcessing('Çıkış kaydediliyor...');
  const now = new Date().toISOString();
  const { error } = await supabase.from('attendance').update({ status: 'checked_out', check_out: now, checkout_token: null }).eq('id', currentAttendance.id);
  if (error) { showError('Çıkış kaydedilemedi: ' + error.message); return; }
  clearSession(true);
  showSuccess('Güle Güle!', esc(currentUser.fullName), new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), false);
}

// ════════════════════════════════════════
// PROCESSING / SUCCESS / ERROR
// ════════════════════════════════════════
function showProcessing(msg: string) {
  document.getElementById('app')!.innerHTML = `${CSS}
    <div class="page" style="align-items:center;justify-content:center">
      ${WAVE}
      <div style="position:relative;z-index:2;text-align:center" class="fade-in">
        <div style="width:56px;height:56px;margin:0 auto 16px;border:3px solid rgba(249,115,22,.15);border-top-color:var(--orange);border-radius:50%;animation:spin .8s linear infinite"></div>
        <p style="color:var(--orange);font-size:15px;font-weight:600">${esc(msg)}</p>
      </div>
    </div>`;
}

function showSuccess(title: string, name: string, time: string, isCheckin: boolean) {
  const clr = isCheckin ? 'var(--green)' : 'var(--orange)';
  const clrRaw = isCheckin ? '#22c55e' : '#f97316';
  const dateStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  document.getElementById('app')!.innerHTML = `${CSS}
    <div class="page" style="align-items:center;justify-content:center">
      ${WAVE}
      <div style="position:relative;z-index:2;text-align:center;padding:24px;max-width:340px;width:100%" class="scale-in">
        <div style="width:80px;height:80px;margin:0 auto 20px;background:${clrRaw}12;border:3px solid ${clrRaw}35;border-radius:50%;display:flex;align-items:center;justify-content:center;color:${clr};box-shadow:0 0 40px ${clrRaw}15">
          ${isCheckin ? I.ok : I.out}
        </div>
        <h1 style="font-size:26px;font-weight:800;letter-spacing:-.3px;margin:0 0 4px">${esc(title)}</h1>
        <p style="color:${clr};font-size:20px;font-weight:700;margin:0 0 20px">${esc(name)}</p>
        <div class="card" style="padding:16px;margin-bottom:20px">
          <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:4px">
            <div style="color:${clr}">${I.clk}</div>
            <span style="font-size:24px;font-weight:700">${esc(time)}</span>
          </div>
          <p style="color:var(--text3);font-size:11px">${esc(dateStr)}</p>
        </div>
        <div style="display:flex;align-items:center;justify-content:center;gap:4px">
          <span style="font-weight:800;font-size:10px;color:var(--text3)">adrenalin</span>
          <span style="color:var(--orange);font-size:7px;font-weight:700">\u00ae</span>
        </div>
      </div>
    </div>`;
  if (navigator.vibrate) navigator.vibrate(isCheckin ? [100, 50, 100] : [150]);
  setTimeout(() => renderApp(), 2500);
}

function showError(msg: string) {
  document.getElementById('app')!.innerHTML = `${CSS}
    <div class="page" style="align-items:center;justify-content:center">
      ${WAVE}
      <div style="position:relative;z-index:2;text-align:center;padding:24px;max-width:340px;width:100%" class="fade-in">
        <div style="width:64px;height:64px;margin:0 auto 16px;background:rgba(239,68,68,.1);border:3px solid rgba(239,68,68,.3);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--red)">
          ${I.x}
        </div>
        <h2 style="color:var(--red);font-size:18px;font-weight:700;margin:0 0 8px">Hata</h2>
        <p style="color:var(--text2);font-size:13px;line-height:1.5;margin:0 0 20px">${esc(msg)}</p>
        <button id="retry" class="btn btn-primary">Tekrar Dene</button>
      </div>
    </div>`;
  document.getElementById('retry')?.addEventListener('click', () => renderApp());
}

// ════════════════════════════════════════
// LIVE TIMER
// ════════════════════════════════════════
function stopLiveTimer() {
  if (liveTimerInterval) { clearInterval(liveTimerInterval); liveTimerInterval = null; }
}

function startLiveTimer() {
  stopLiveTimer();
  updateLiveTimer();
  liveTimerInterval = setInterval(updateLiveTimer, 1000);
}

function updateLiveTimer() {
  if (!currentAttendance?.check_in) return;
  const start = new Date(currentAttendance.check_in).getTime();
  const end = currentAttendance.check_out ? new Date(currentAttendance.check_out).getTime() : Date.now();
  const totalSec = Math.floor((end - start) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');

  const durEl = document.getElementById('live-duration');
  if (durEl) durEl.textContent = `${h}s ${pad(m)}dk`;

  const clockEl = document.getElementById('live-clock');
  if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const timerEl = document.getElementById('live-timer');
  if (timerEl) timerEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;

  const progEl = document.getElementById('progress-fill') as HTMLElement;
  const progText = document.getElementById('progress-pct');
  if (progEl && progEl.dataset.total) {
    const totalMins = parseInt(progEl.dataset.total);
    const workedMins = Math.floor(totalSec / 60);
    const pct = Math.min(100, Math.round((workedMins / totalMins) * 100));
    progEl.style.width = `${pct}%`;
    if (progText) progText.textContent = `%${pct}`;
  }
}

// ════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════
function showDashboard() {
  if (!currentUser || !currentAttendance) { isSelfService ? showSelfLogin() : showScanner('checkin'); return; }
  supabase.from('attendance').select('*').eq('id', currentAttendance.id).single().then(({ data }) => {
    if (data) {
      currentAttendance = data;
      if (data.status === 'checked_out') { clearSession(true); isSelfService ? showSelfLogin() : showScanner('checkin'); return; }
      if (currentUser) saveSession(currentUser, data);
    }
    renderDash();
  }).then(null, () => renderDash());
}

function renderDash() {
  if (!currentUser || !currentAttendance) return;
  const app = document.getElementById('app')!;
  const ci = currentAttendance.check_in ? new Date(currentAttendance.check_in).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
  const fn = esc(currentUser.fullName.split(' ')[0]);
  const ini = currentUser.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const isPending = currentAttendance.status === 'checkout_pending';
  const todayStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', weekday: 'short' });

  app.innerHTML = `${CSS}
    <div class="page">
      ${WAVE}
      <div class="page-content">
        <div style="position:relative;z-index:2;padding:max(16px,var(--safe-top)) 16px 0;flex-shrink:0" class="fade-in">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div style="min-width:0">
              <div style="display:flex;align-items:center;gap:3px;margin-bottom:2px">
                <span style="font-weight:800;font-size:10px;color:var(--text3);letter-spacing:.5px;text-transform:uppercase">adrenalin</span>
                <span style="color:var(--orange);font-size:7px;font-weight:700">\u00ae</span>
              </div>
              <h1 style="font-size:20px;font-weight:800;letter-spacing:-.3px;margin:0">Merhaba, ${fn}!</h1>
              <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
                <span style="color:var(--orange);font-size:11px;font-weight:600">${esc(KASA_NAMES[currentUser.kasaId] || currentUser.kasaId)}</span>
                <span style="color:var(--text3);font-size:10px">${esc(todayStr)}</span>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span id="live-clock" style="color:var(--text3);font-size:11px;font-weight:600;font-variant-numeric:tabular-nums">${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <div style="width:42px;height:42px;background:linear-gradient(135deg,var(--orange),#ea580c);border-radius:14px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;border:2px solid rgba(249,115,22,.3);flex-shrink:0">${esc(ini)}</div>
            </div>
          </div>

          <div class="card ${isPending ? 'card-glow-amber' : 'card-glow-green'}" style="margin-bottom:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
              <div style="display:flex;align-items:center;gap:6px">
                <div style="color:var(--green)">${I.clk}</div>
                <span style="color:var(--text2);font-size:11px;font-weight:600">Bug\u00fcnk\u00fc Mesai</span>
              </div>
              <div class="badge" style="background:${isPending ? 'rgba(245,158,11,.1)' : 'rgba(34,197,94,.1)'};color:${isPending ? 'var(--amber)' : 'var(--green)'};border:1px solid ${isPending ? 'rgba(245,158,11,.2)' : 'rgba(34,197,94,.2)'}">
                ${isPending ? `${I.clk} \u00c7\u0131k\u0131\u015f Bekl.` : `<span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;animation:pulse 1.5s infinite"></span> Aktif`}
              </div>
            </div>
            <div style="text-align:center;margin-bottom:10px">
              <div id="live-timer" style="font-size:36px;font-weight:800;letter-spacing:1px;color:#fff;font-variant-numeric:tabular-nums">00:00:00</div>
            </div>
            <div style="display:flex;gap:8px">
              <div class="stat" style="flex:1">
                <p style="color:var(--text3);font-size:9px;margin:0 0 2px;text-transform:uppercase;letter-spacing:.5px">Giri\u015f</p>
                <p style="color:var(--orange);font-size:18px;font-weight:800;margin:0;letter-spacing:-.5px">${ci}</p>
              </div>
              <div class="stat" style="flex:1">
                <p style="color:var(--text3);font-size:9px;margin:0 0 2px;text-transform:uppercase;letter-spacing:.5px">S\u00fcre</p>
                <p id="live-duration" style="color:var(--green);font-size:18px;font-weight:800;margin:0">--</p>
              </div>
            </div>
          </div>
        </div>

        <div style="position:relative;z-index:2;flex:1;overflow-y:auto;padding:0 16px 88px;-webkit-overflow-scrolling:touch" id="tab-content"></div>

        <div class="bottom-nav">
          <div class="nav-bar">
            <button class="nav-btn ${activeTab === 'home' ? 'active' : ''}" data-t="home">${I.home}<span>Ana Sayfa</span></button>
            <button class="nav-btn ${activeTab === 'team' ? 'active' : ''}" data-t="team">${I.users}<span>Ekibim</span></button>
            <button class="nav-btn ${activeTab === 'schedule' ? 'active' : ''}" data-t="schedule">${I.cal}<span>Mesai</span></button>
          </div>
        </div>
      </div>
    </div>`;

  document.querySelectorAll('.nav-btn[data-t]').forEach(b => b.addEventListener('click', () => {
    const newTab = (b as HTMLElement).dataset.t as any;
    if (newTab !== activeTab) {
      activeTab = newTab;
      document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
      b.classList.add('active');
      renderTabContent();
    }
  }));

  startLiveTimer();
  renderTabContent();
}

function renderTabContent() {
  const tc = document.getElementById('tab-content')!;
  if (!tc) return;
  if (activeTab === 'home') renderHome(tc);
  else if (activeTab === 'team') renderTeam(tc);
  else renderSchedule(tc);
}

// ── Home Tab ──
async function renderHome(c: HTMLElement) {
  if (!currentUser || !currentAttendance) return;
  const isPending = currentAttendance.status === 'checkout_pending';

  const today = new Date();
  const todayDate = today.toISOString().slice(0, 10);
  let shiftData: any[] | null = null;
  let teamAtt: any[] | null = null;
  try {
    const [shiftRes, teamRes] = await Promise.all([
      supabase.from('shifts').select('*').eq('personnel_id', currentUser.id).limit(1),
      supabase.from('attendance').select('personnel_id, status').eq('kasa_id', currentUser.kasaId).eq('date', todayDate)
    ]);
    shiftData = shiftRes.data;
    teamAtt = teamRes.data;
  } catch {}

  let todayShift: WeekDay | null = null;
  let shiftTotalMins = 0;
  if (shiftData?.[0]?.week_schedule) {
    try {
      const ws = typeof shiftData[0].week_schedule === 'string' ? JSON.parse(shiftData[0].week_schedule) : shiftData[0].week_schedule;
      const dayKey = DAY_KEYS[today.getDay()];
      const raw = ws[dayKey];
      if (raw) {
        todayShift = { start: raw.startTime || raw.start, end: raw.endTime || raw.end, isOff: raw.isOff, leaveType: raw.leaveType };
        if (!raw.isOff && todayShift.start && todayShift.end) {
          const [sh, sm] = todayShift.start.split(':').map(Number);
          const [eh, em] = todayShift.end.split(':').map(Number);
          shiftTotalMins = (eh * 60 + em) - (sh * 60 + sm);
        }
      }
    } catch {}
  }

  const teamRecs = teamAtt || [];
  const activeCount = teamRecs.filter((r: any) => r.status === 'checked_in' || r.status === 'checkout_pending').length;
  const doneCount = teamRecs.filter((r: any) => r.status === 'checked_out').length;
  const shiftIsOff = todayShift?.isOff;
  const leaveType = todayShift?.leaveType;
  const lc = LEAVE_COLORS[leaveType || ''] || '#ea580c';

  c.innerHTML = `<div class="slide-up">
    ${todayShift ? `
    <div class="card" style="margin-bottom:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${!shiftIsOff && shiftTotalMins > 0 ? '8px' : '0'}">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="color:var(--orange)">${I.cal}</div>
          <span style="color:var(--text2);font-size:11px;font-weight:600">Vardiya</span>
        </div>
        ${shiftIsOff
          ? `<div class="badge" style="background:${lc}15;color:${lc};border:1px solid ${lc}25">${esc(leaveType || '\u0130zin')}</div>`
          : `<span style="color:var(--orange);font-size:14px;font-weight:700">${esc(todayShift.start || '')} \u2013 ${esc(todayShift.end || '')}</span>`}
      </div>
      ${!shiftIsOff && shiftTotalMins > 0 ? `
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="color:var(--text3);font-size:10px">\u0130lerleme</span>
          <span id="progress-pct" style="color:var(--text3);font-size:10px">%0</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" id="progress-fill" data-total="${shiftTotalMins}" style="width:0%"></div>
        </div>
      </div>` : ''}
    </div>` : ''}

    <div style="display:flex;gap:8px;margin-bottom:8px">
      <div class="stat" style="flex:1;border-color:rgba(34,197,94,.12)">
        <p style="color:var(--text3);font-size:9px;margin:0 0 2px;text-transform:uppercase">Aktif</p>
        <p style="color:var(--green);font-size:22px;font-weight:800;margin:0">${activeCount}</p>
      </div>
      <div class="stat" style="flex:1;border-color:rgba(249,115,22,.12)">
        <p style="color:var(--text3);font-size:9px;margin:0 0 2px;text-transform:uppercase">\u00c7\u0131k\u0131\u015f</p>
        <p style="color:var(--orange);font-size:22px;font-weight:800;margin:0">${doneCount}</p>
      </div>
      <div class="stat" style="flex:1">
        <p style="color:var(--text3);font-size:9px;margin:0 0 2px;text-transform:uppercase">Toplam</p>
        <p style="color:var(--text2);font-size:22px;font-weight:800;margin:0">${teamRecs.length}</p>
      </div>
    </div>

    ${isPending ? `
    <div class="card card-glow-amber" style="margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="width:8px;height:8px;border-radius:50%;background:var(--amber);animation:pulse 1.5s infinite;flex-shrink:0"></div>
        <span style="color:var(--amber);font-size:13px;font-weight:600">\u00c7\u0131k\u0131\u015f Onay\u0131 Bekleniyor</span>
      </div>
      <p style="color:var(--text2);font-size:11px;margin:0 0 12px;line-height:1.5">PC'de \u00e7\u0131k\u0131\u015f QR kodu g\u00f6sterildi. Okutmak i\u00e7in a\u015fa\u011f\u0131daki butona bas\u0131n.</p>
      <button id="scan-co" class="btn btn-danger" style="margin-bottom:6px">${I.cam} \u00c7\u0131k\u0131\u015f QR Okut</button>
      <button id="cancel-co2" class="btn btn-ghost" style="font-size:13px">\u0130ptal Et</button>
    </div>` : `
    <button id="co-btn" class="btn btn-danger" style="margin-bottom:8px">${I.out} \u0130\u015ften \u00c7\u0131k\u0131\u015f Yap</button>`}
  </div>`;

  updateLiveTimer();

  if (isPending) {
    document.getElementById('scan-co')?.addEventListener('click', () => showScanner('checkout'));
    document.getElementById('cancel-co2')?.addEventListener('click', async () => {
      if (!currentAttendance) return;
      await supabase.from('attendance').update({ status: 'checked_in', checkout_token: null }).eq('id', currentAttendance.id);
      currentAttendance.status = 'checked_in';
      if (currentUser) saveSession(currentUser, currentAttendance);
      showDashboard();
    });
  } else {
    document.getElementById('co-btn')?.addEventListener('click', async () => {
      if (!currentUser || !currentAttendance) return;
      if (isSelfService) { await selfServiceCheckout(); return; }
      const tk = `OUT-${currentUser.id}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      showScanner('checkout');
      try {
        const { error, data } = await supabase.from('attendance').update({ status: 'checkout_pending', checkout_token: tk }).eq('id', currentAttendance.id).eq('status', 'checked_in').select();
        if (error || !data || data.length === 0) { showError('\u00c7\u0131k\u0131\u015f talebi g\u00f6nderilemedi.'); return; }
        currentAttendance.status = 'checkout_pending';
        currentAttendance.checkout_token = tk;
        if (currentUser) saveSession(currentUser, currentAttendance);
      } catch {
        showError('\u0130nternet ba\u011flant\u0131s\u0131 yok. \u00c7\u0131k\u0131\u015f i\u00e7in internet gerekli.');
      }
    });
  }
}

// ── Team Tab ──
async function renderTeam(c: HTMLElement) {
  if (!currentUser) return;
  c.innerHTML = `<div style="text-align:center;padding:24px"><div style="width:28px;height:28px;margin:0 auto;border:2px solid rgba(249,115,22,.2);border-top-color:var(--orange);border-radius:50%;animation:spin .8s linear infinite"></div></div>`;
  const today = new Date();
  const todayDate = today.toISOString().slice(0, 10);
  const dayKey = DAY_KEYS[today.getDay()];
  let att: any[] | null = null;
  let pers: any[] | null = null;
  let shifts: any[] | null = null;
  try {
    const [attRes, persRes, shiftsRes] = await Promise.all([
      supabase.from('attendance').select('*').eq('kasa_id', currentUser.kasaId).eq('date', todayDate),
      supabase.from('personnel').select('id, fullName, kasaId, role, isActive').eq('kasaId', currentUser.kasaId).eq('isActive', true),
      supabase.from('shifts').select('personnel_id, week_schedule').eq('kasa_id', currentUser.kasaId)
    ]);
    att = attRes.data; pers = persRes.data; shifts = shiftsRes.data;
  } catch {
    c.innerHTML = `<div class="fade-in" style="text-align:center;padding:24px"><p style="color:var(--text2);font-size:13px">\u0130nternet ba\u011flant\u0131s\u0131 yok.<br>Ekip bilgileri y\u00fcklenemedi.</p></div>`;
    return;
  }
  const recs = att || [];
  const all = (pers || []).filter((p: any) => p.role !== 'genel_mudur');

  const shiftMap = new Map<string, WeekDay>();
  const seenIds = new Set<string>();
  for (const s of (shifts || [])) {
    if (seenIds.has(s.personnel_id)) continue;
    seenIds.add(s.personnel_id);
    try {
      const sched = typeof s.week_schedule === 'string' ? JSON.parse(s.week_schedule) : s.week_schedule;
      const raw = sched?.[dayKey];
      if (raw) shiftMap.set(s.personnel_id, { start: raw.startTime || raw.start, end: raw.endTime || raw.end, isOff: raw.isOff, leaveType: raw.leaveType });
    } catch {}
  }

  const sorted = [...all].sort((a: any, b: any) => {
    const aRec = recs.find((r: any) => r.personnel_id === a.id);
    const bRec = recs.find((r: any) => r.personnel_id === b.id);
    const aOn = aRec && (aRec.status === 'checked_in' || aRec.status === 'checkout_pending');
    const bOn = bRec && (bRec.status === 'checked_in' || bRec.status === 'checkout_pending');
    const aOut = aRec && aRec.status === 'checked_out';
    const bOut = bRec && bRec.status === 'checked_out';
    if (aOn && !bOn) return -1; if (!aOn && bOn) return 1;
    if (aOut && !bOut && !bOn) return -1; if (!aOut && !aOn && bOut) return 1;
    return 0;
  });

  c.innerHTML = `<div class="slide-up">
    <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px">
      <h3 style="color:var(--text3);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Ekibim \u2014 ${esc(KASA_NAMES[currentUser.kasaId] || '')}</h3>
      <span style="color:var(--text3);font-size:10px">${all.length} ki\u015fi</span>
    </div>
    ${sorted.map((p: any, i: number) => {
      const a = recs.find((r: any) => r.personnel_id === p.id);
      const on = a && (a.status === 'checked_in' || a.status === 'checkout_pending');
      const out = a && a.status === 'checked_out';
      const cin = a?.check_in ? new Date(a.check_in).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
      const cout = a?.check_out ? new Date(a.check_out).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
      const cl = COLORS[i % COLORS.length];
      const ini = p.fullName.split(' ').map((n: string) => n[0]).join('').substring(0, 2);
      const me = p.id === currentUser!.id;
      const shift = shiftMap.get(p.id);
      const isOff = shift?.isOff;
      const leaveLbl = shift?.leaveType || '\u0130zin';
      const lClr = LEAVE_COLORS[leaveLbl] || '#ea580c';

      let isLate = false;
      if (shift && shift.start && !isOff && cin) {
        const [sh, sm] = shift.start.split(':').map(Number);
        const [ch, cm] = cin.split(':').map(Number);
        if (ch * 60 + cm > sh * 60 + sm + 5) isLate = true;
      }

      return `<div class="card" style="margin-bottom:6px;${me ? 'border-color:rgba(249,115,22,.25)' : ''}">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:38px;height:38px;border-radius:50%;background:${cl}15;border:2px solid ${cl}30;display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0">
            <span style="color:${cl};font-size:13px;font-weight:700">${esc(ini)}</span>
            ${on ? `<div style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;background:var(--green);border:2px solid var(--bg)"></div>` : ''}
          </div>
          <div style="flex:1;min-width:0">
            <p style="font-size:13px;font-weight:600;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.fullName)}${me ? ' <span style="color:var(--orange);font-size:9px">(Sen)</span>' : ''}</p>
            <div style="display:flex;align-items:center;gap:6px;margin-top:2px;flex-wrap:wrap">
              <span style="color:var(--text3);font-size:10px">${on ? `Giri\u015f: ${cin}` : out ? `${cin} \u2192 ${cout}` : 'Hen\u00fcz giri\u015f yapmad\u0131'}</span>
              ${isLate ? `<span style="color:var(--red);font-size:9px;font-weight:700">\u25cf Ge\u00e7</span>` : ''}
            </div>
            ${shift ? `<div style="margin-top:3px">
              ${isOff
                ? `<span style="color:${lClr};font-size:9px;font-weight:600;background:${lClr}12;padding:2px 8px;border-radius:6px;border:1px solid ${lClr}20">${esc(leaveLbl)}</span>`
                : `<span style="color:var(--text3);font-size:9px;background:rgba(255,255,255,.03);padding:2px 8px;border-radius:6px;border:1px solid var(--border)">${shift.start} \u2013 ${shift.end}</span>`}
            </div>` : ''}
          </div>
          <div class="badge" style="background:${on ? 'rgba(34,197,94,.1)' : out ? 'rgba(249,115,22,.1)' : 'rgba(255,255,255,.04)'};color:${on ? 'var(--green)' : out ? 'var(--orange)' : 'var(--text3)'};flex-shrink:0">${on ? 'Aktif' : out ? '\u00c7\u0131k\u0131\u015f' : 'Yok'}</div>
        </div>
      </div>`;
    }).join('')}
    ${all.length === 0 ? '<p style="color:var(--text3);font-size:12px;text-align:center;padding:20px">Personel bulunamad\u0131</p>' : ''}
  </div>`;
}

// ── Schedule Tab ──
async function renderSchedule(c: HTMLElement) {
  if (!currentUser) return;
  c.innerHTML = `<div style="text-align:center;padding:24px"><div style="width:28px;height:28px;margin:0 auto;border:2px solid rgba(249,115,22,.2);border-top-color:var(--orange);border-radius:50%;animation:spin .8s linear infinite"></div></div>`;
  const today = new Date();
  const wa = new Date(today); wa.setDate(wa.getDate() - 6);
  let shiftData: any[] | null = null;
  let attData: any[] | null = null;
  try {
    const [shiftRes, attRes] = await Promise.all([
      supabase.from('shifts').select('*').eq('personnel_id', currentUser.id).limit(1),
      supabase.from('attendance').select('*').eq('personnel_id', currentUser.id).gte('date', wa.toISOString().slice(0, 10)).order('date', { ascending: false })
    ]);
    shiftData = shiftRes.data; attData = attRes.data;
  } catch {
    c.innerHTML = `<div class="fade-in" style="text-align:center;padding:24px"><p style="color:var(--text2);font-size:13px">\u0130nternet ba\u011flant\u0131s\u0131 yok.<br>Mesai bilgileri y\u00fcklenemedi.</p></div>`;
    return;
  }
  const recs = attData || [];
  const shift = shiftData?.[0];
  let ws: Record<string, WeekDay> = {};
  if (shift?.week_schedule) { try { ws = typeof shift.week_schedule === 'string' ? JSON.parse(shift.week_schedule) : shift.week_schedule; } catch {} }

  const todayDayKey = DAY_KEYS[today.getDay()];

  c.innerHTML = `<div class="slide-up">
    ${Object.keys(ws).length > 0 ? `
    <h3 style="color:var(--text3);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px">Haftal\u0131k Mesai Program\u0131</h3>
    ${['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].filter(d => ws[d] != null).map(day => {
      const info = ws[day] as any;
      const lc = LEAVE_COLORS[info.leaveType || ''] || '#ea580c';
      const dayLabel = DAY_KEY_TO_TR[day] || day;
      const isToday = day === todayDayKey;
      const shiftStart = info.startTime || info.start || '';
      const shiftEnd = info.endTime || info.end || '';
      return `<div class="card" style="margin-bottom:4px;padding:11px 14px;${isToday ? 'border-color:rgba(249,115,22,.25);background:rgba(249,115,22,.03)' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:12px;font-weight:${isToday ? '700' : '600'};color:${isToday ? 'var(--orange)' : '#fff'}">${esc(dayLabel)}</span>
            ${isToday ? '<span style="font-size:8px;color:var(--orange);font-weight:700;background:rgba(249,115,22,.1);padding:1px 6px;border-radius:4px">BUG\u00dcN</span>' : ''}
          </div>
          ${info.isOff
            ? `<span class="badge" style="background:${lc}12;color:${lc};border:1px solid ${lc}20">${esc(info.leaveType || '\u0130zin')}</span>`
            : `<span style="color:var(--text2);font-size:12px;font-weight:600">${esc(shiftStart)} - ${esc(shiftEnd)}</span>`}
        </div>
      </div>`;
    }).join('')}` : `
    <div class="card" style="margin-bottom:10px;padding:20px;text-align:center">
      <p style="color:var(--text2);font-size:12px;margin:0">Mesai program\u0131n\u0131z hen\u00fcz tan\u0131mlanmam\u0131\u015f.</p>
      <p style="color:var(--text3);font-size:10px;margin:4px 0 0">Y\u00f6neticinizden vardiya plan\u0131 olu\u015fturmas\u0131n\u0131 isteyin.</p>
    </div>`}

    <h3 style="color:var(--text3);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:14px 0 8px">Son Yoklamalar</h3>
    ${recs.length > 0 ? recs.map((r: any) => {
      const cin = r.check_in ? new Date(r.check_in).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
      const cout = r.check_out ? new Date(r.check_out).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
      const dateObj = new Date(r.date + 'T00:00:00');
      const dateStr = dateObj.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const dayStr = DAYS[dateObj.getDay()];
      const durationMin = r.check_in && r.check_out ? Math.floor((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 60000) : 0;
      const durH = Math.floor(durationMin / 60);
      const durM = durationMin % 60;
      const statusClrRaw = r.status === 'checked_in' ? '#22c55e' : r.status === 'checked_out' ? '#f97316' : '#f59e0b';
      const statusClr = r.status === 'checked_in' ? 'var(--green)' : r.status === 'checked_out' ? 'var(--orange)' : 'var(--amber)';
      const statusLbl = r.status === 'checked_in' ? 'Aktif' : r.status === 'checked_out' ? 'Tamamland\u0131' : 'Bekliyor';
      return `<div class="card" style="margin-bottom:4px;padding:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:12px;font-weight:600">${esc(dateStr)}</span>
            <span style="color:var(--text3);font-size:10px">${esc(dayStr)}</span>
          </div>
          <div class="badge" style="background:${statusClrRaw}12;color:${statusClr};border:1px solid ${statusClrRaw}20;font-size:9px">${statusLbl}</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="display:flex;align-items:center;gap:4px">${I.clk}<span style="color:var(--orange);font-size:12px;font-weight:600">${cin}</span></div>
            <span style="color:rgba(255,255,255,.08)">\u2192</span>
            <div style="display:flex;align-items:center;gap:4px">${I.clk}<span style="color:var(--red);font-size:12px;font-weight:600">${cout}</span></div>
          </div>
          ${durationMin > 0 ? `<span style="color:var(--green);font-size:10px;font-weight:600;background:rgba(34,197,94,.08);padding:2px 8px;border-radius:8px;border:1px solid rgba(34,197,94,.12)">${durH}s ${durM}dk</span>` : ''}
        </div>
      </div>`;
    }).join('') : '<p style="color:var(--text3);font-size:11px;text-align:center;padding:16px">Kay\u0131t yok</p>'}
  </div>`;
}

// ── Init ──
async function init() {
  await showSplash();
  renderApp();
  if (!isOnline) showOfflineBanner();
}

init();
