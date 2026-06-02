import { createClient } from '@supabase/supabase-js';
import { Html5Qrcode } from 'html5-qrcode';

// ── Supabase ──
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://mipafqwsibhazkszzcxb.supabase.co';
const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Cby57dwYK-5-gpuUGGE_aQ_nFzy41cv';
const supabase = createClient(supabaseUrl, supabaseKey);

const PWA_VERSION = 'v5.0';

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
  fire16: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c0 0-3 4-3 7a3 3 0 006 0c0-1-.5-2-1-2.5.5 1 0 2.5-1 2.5s-2-1.5-1-4c-1 2-2 3-2 5a4 4 0 008 0c0-4-4-8-6-8z"/></svg>`,
  star: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  trophy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg>`,
  sun: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  moon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
};

// ── CSS ──
const CSS = `<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
:root{
  --bg:#08080a;--bg2:#0f1014;
  --card:rgba(255,255,255,.04);--card2:rgba(255,255,255,.06);
  --border:rgba(255,255,255,.08);--border2:rgba(255,255,255,.12);
  --orange:#f97316;--orange2:#fb923c;--red:#ef4444;--green:#22c55e;--green2:#4ade80;--amber:#f59e0b;
  --text:#fff;--text2:rgba(255,255,255,.5);--text3:rgba(255,255,255,.22);
  --safe-top:max(0px,env(safe-area-inset-top));--safe-bottom:max(0px,env(safe-area-inset-bottom))
}
body,html,#app{width:100%;height:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:var(--text);background:var(--bg)}
body{overscroll-behavior:none;user-select:none;-webkit-user-select:none;touch-action:pan-y}
input,button,select{font-family:inherit}

@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes scaleIn{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes breathe{0%,100%{box-shadow:0 0 24px rgba(249,115,22,.2),0 0 48px rgba(249,115,22,.08)}50%{box-shadow:0 0 40px rgba(249,115,22,.45),0 0 80px rgba(249,115,22,.2)}}
@keyframes scanline{0%{top:0}100%{top:calc(100% - 2px)}}
@keyframes ringPulse{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.8);opacity:0}}
@keyframes greenGlow{0%,100%{box-shadow:0 0 12px rgba(34,197,94,.2)}50%{box-shadow:0 0 28px rgba(34,197,94,.5),0 0 48px rgba(34,197,94,.15)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes slideIn{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}

.fade-in{animation:fadeIn .45s ease-out both}
.scale-in{animation:scaleIn .45s cubic-bezier(.175,.885,.32,1.275) both}
.slide-up{animation:slideUp .4s ease-out both}
.slide-in{animation:slideIn .35s ease-out both}

.card{background:var(--card);border:1px solid var(--border);border-radius:18px;padding:14px;transition:transform .15s,box-shadow .2s;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.card:active{transform:scale(.98)}
.card-glass{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:16px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.card-glow-green{border-color:rgba(34,197,94,.25);box-shadow:0 0 0 1px rgba(34,197,94,.08) inset, 0 4px 24px rgba(34,197,94,.08)}
.card-glow-amber{border-color:rgba(245,158,11,.25);box-shadow:0 0 0 1px rgba(245,158,11,.08) inset, 0 4px 24px rgba(245,158,11,.08)}
.card-glow-orange{border-color:rgba(249,115,22,.25);box-shadow:0 4px 24px rgba(249,115,22,.12)}

.btn{padding:15px 24px;border:none;border-radius:16px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .18s;width:100%;touch-action:manipulation;position:relative;overflow:hidden;letter-spacing:.01em}
.btn:active{transform:scale(.95);opacity:.88}
.btn-primary{background:linear-gradient(135deg,var(--orange),#dc4c00);color:#fff;box-shadow:0 4px 24px rgba(249,115,22,.35),0 1px 0 rgba(255,255,255,.12) inset}
.btn-danger{background:linear-gradient(135deg,#b91c1c,#dc2626);color:#fff;box-shadow:0 4px 24px rgba(220,38,38,.3),0 1px 0 rgba(255,255,255,.1) inset}
.btn-ghost{background:rgba(255,255,255,.05);color:var(--text2);border:1px solid var(--border2)}
.btn-success{background:linear-gradient(135deg,#15803d,#16a34a);color:#fff;box-shadow:0 4px 24px rgba(22,163,74,.3)}

.bottom-nav{position:fixed;bottom:0;left:0;right:0;z-index:50;padding:4px 12px;padding-bottom:max(8px,var(--safe-bottom));background:rgba(8,8,10,.92);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);border-top:1px solid rgba(255,255,255,.06)}
.nav-bar{display:flex;gap:2px;border-radius:16px;padding:4px;background:rgba(255,255,255,.03)}
.nav-btn{flex:1;padding:8px 4px;border-radius:13px;border:none;font-size:10px;font-weight:700;cursor:pointer;color:var(--text3);background:transparent;transition:all .22s;display:flex;flex-direction:column;align-items:center;gap:3px;touch-action:manipulation;letter-spacing:.01em}
.nav-btn.active{background:linear-gradient(135deg,rgba(249,115,22,.15),rgba(234,88,12,.08));color:#fdba74;box-shadow:0 2px 12px rgba(249,115,22,.15)}
.nav-btn svg{transition:transform .22s}
.nav-btn.active svg{transform:scale(1.12)}

.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.02em}
.stat{background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:14px;padding:10px;text-align:center}

.splash{position:fixed;inset:0;z-index:100;background:var(--bg);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px;transition:opacity .5s}
.splash-logo{animation:breathe 2.2s ease-in-out infinite}

.scan-frame{position:relative;border-radius:20px;overflow:hidden}
.scan-overlay{position:absolute;inset:0;pointer-events:none;z-index:5}
.scan-corner{position:absolute;width:30px;height:30px;border-color:var(--orange);border-style:solid}
.scan-corner.tl{top:12px;left:12px;border-width:3px 0 0 3px;border-radius:8px 0 0 0}
.scan-corner.tr{top:12px;right:12px;border-width:3px 3px 0 0;border-radius:0 8px 0 0}
.scan-corner.bl{bottom:12px;left:12px;border-width:0 0 3px 3px;border-radius:0 0 0 8px}
.scan-corner.br{bottom:12px;right:12px;border-width:0 3px 3px 0;border-radius:0 0 8px 0}
.scan-line{position:absolute;left:15px;right:15px;height:2px;background:linear-gradient(90deg,transparent,var(--orange),transparent);animation:scanline 2s ease-in-out infinite alternate;z-index:5}

.progress-track{height:5px;border-radius:4px;background:rgba(255,255,255,.07);overflow:hidden}
.progress-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,var(--orange),var(--orange2));transition:width .9s cubic-bezier(.4,0,.2,1)}

.wave-bg{position:fixed;bottom:0;left:0;width:100%;height:32vh;opacity:.08;pointer-events:none;z-index:0}

.page{min-height:100vh;min-height:100dvh;background:var(--bg);position:relative;overflow:hidden;display:flex;flex-direction:column}
.page-content{position:relative;z-index:2;flex:1;display:flex;flex-direction:column}

.ring-pulse{position:absolute;border-radius:50%;border:2px solid currentColor;animation:ringPulse 1.2s ease-out infinite}
.timer-glow{animation:greenGlow 2s ease-in-out infinite}
.streak-fire{display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg,rgba(251,146,60,.15),rgba(239,68,68,.1));border:1px solid rgba(251,146,60,.25);border-radius:20px;padding:4px 10px;font-size:11px;font-weight:800;color:#fb923c}
.monthly-strip{display:flex;gap:6px;margin-bottom:10px}
.monthly-pill{flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:10px 8px;text-align:center}
.shimmer-text{background:linear-gradient(90deg,var(--text3) 0%,rgba(255,255,255,.6) 50%,var(--text3) 100%);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:shimmer 2.5s linear infinite}
.online-dot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 6px var(--green2);animation:pulse 2s infinite}
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
    <div class="splash" id="splash-screen" style="background:radial-gradient(ellipse at 50% 40%,rgba(249,115,22,.06) 0%,var(--bg) 65%)">
      <div style="position:relative;display:flex;align-items:center;justify-content:center">
        <div style="position:absolute;width:120px;height:120px;border-radius:50%;border:1px solid rgba(249,115,22,.15);animation:ringPulse 2s ease-out infinite"></div>
        <div style="position:absolute;width:100px;height:100px;border-radius:50%;border:1px solid rgba(249,115,22,.1);animation:ringPulse 2s ease-out .4s infinite"></div>
        <div class="splash-logo" style="width:88px;height:88px;background:linear-gradient(135deg,#f97316,#c2410c);border-radius:28px;display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 8px 32px rgba(249,115,22,.4),0 0 0 1px rgba(255,255,255,.1) inset">
          ${I.flame}
        </div>
      </div>
      <div style="text-align:center;margin-top:8px">
        <div style="display:flex;align-items:center;justify-content:center;gap:3px">
          <span style="font-weight:900;font-size:22px;letter-spacing:-.5px;color:#fff">adrenalin</span>
          <span style="color:var(--orange);font-size:11px;font-weight:700;vertical-align:super">\u00ae</span>
        </div>
        <p style="color:var(--text3);font-size:11px;margin-top:5px;letter-spacing:.08em;text-transform:uppercase;font-weight:600">Personel Puantaj</p>
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
        <div style="width:6px;height:6px;border-radius:50%;background:var(--orange);animation:pulse .8s .0s infinite"></div>
        <div style="width:6px;height:6px;border-radius:50%;background:var(--orange);animation:pulse .8s .2s infinite"></div>
        <div style="width:6px;height:6px;border-radius:50%;background:var(--orange);animation:pulse .8s .4s infinite"></div>
      </div>
      <p style="color:rgba(255,255,255,.1);font-size:8px;position:absolute;bottom:max(20px,var(--safe-bottom));left:50%;transform:translateX(-50%);letter-spacing:.05em">${PWA_VERSION}</p>
    </div>`;
  return new Promise(r => setTimeout(r, 1400));
}

// ════════════════════════════════════════
// ROUTER
// ════════════════════════════════════════
async function renderApp() {
  stopLiveTimer();
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
        if (mode === 'checkin') {
          if (token.startsWith('YD-')) { await handleYDCheckin(); return; }
          if (!token.startsWith('ATT-')) { showError('Ge\u00e7ersiz QR kod.'); return; }
          showProcessing('Yoklama onaylan\u0131yor...'); await handleCheckin(token);
        } else {
          if (token.startsWith('YD-')) { showProcessing('\u00c7\u0131k\u0131\u015f onaylan\u0131yor...'); await handleYDCheckout(); return; }
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
  const clrRaw = isCheckin ? '#22c55e' : '#f97316';
  const bgGlow = isCheckin
    ? 'radial-gradient(ellipse at 50% 35%,rgba(34,197,94,.1) 0%,var(--bg) 65%)'
    : 'radial-gradient(ellipse at 50% 35%,rgba(249,115,22,.1) 0%,var(--bg) 65%)';
  const dateStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  const dayStr  = new Date().toLocaleDateString('tr-TR', { weekday: 'long' });
  document.getElementById('app')!.innerHTML = `${CSS}
    <div class="page" style="align-items:center;justify-content:center;background:${bgGlow}">
      <div style="position:relative;z-index:2;text-align:center;padding:28px 24px;max-width:340px;width:100%" class="scale-in">

        <!-- Animated rings + icon -->
        <div style="position:relative;width:100px;height:100px;margin:0 auto 24px">
          <div style="position:absolute;inset:-16px;border-radius:50%;border:2px solid ${clrRaw}30;animation:ringPulse 1.4s ease-out infinite"></div>
          <div style="position:absolute;inset:-6px;border-radius:50%;border:2px solid ${clrRaw}20;animation:ringPulse 1.4s ease-out .3s infinite"></div>
          <div style="width:100px;height:100px;background:${clrRaw}15;border:2px solid ${clrRaw}40;border-radius:50%;display:flex;align-items:center;justify-content:center;color:${clrRaw};box-shadow:0 0 40px ${clrRaw}25,0 0 80px ${clrRaw}08">
            ${isCheckin ? `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>` : `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`}
          </div>
        </div>

        <h1 style="font-size:30px;font-weight:900;letter-spacing:-.5px;margin:0 0 6px;line-height:1">${esc(title)}</h1>
        <p style="color:${clrRaw};font-size:18px;font-weight:700;margin:0 0 24px">${esc(name)}</p>

        <!-- Time card -->
        <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:18px;margin-bottom:20px;backdrop-filter:blur(12px)">
          <div style="font-size:42px;font-weight:900;letter-spacing:-1px;color:#fff;font-variant-numeric:tabular-nums;line-height:1">${esc(time)}</div>
          <div style="margin-top:6px;color:var(--text3);font-size:12px">${esc(dayStr)}, ${esc(dateStr)}</div>
        </div>

        <div style="display:flex;align-items:center;justify-content:center;gap:3px;opacity:.4">
          <span style="font-weight:900;font-size:11px">adrenalin</span>
          <span style="color:var(--orange);font-size:8px;font-weight:700">\u00ae</span>
        </div>
      </div>
    </div>`;
  if (navigator.vibrate) navigator.vibrate(isCheckin ? [80, 40, 120] : [120]);
  setTimeout(() => renderApp(), 2800);
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
  if (!currentUser || !currentAttendance) { showScanner('checkin'); return; }
  supabase.from('attendance').select('*').eq('id', currentAttendance.id).single().then(({ data }) => {
    if (data) {
      currentAttendance = data;
      if (data.status === 'checked_out') { clearSession(true); showScanner('checkin'); return; }
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
    <div class="page" style="background:radial-gradient(ellipse at 50% -10%,rgba(249,115,22,.07) 0%,var(--bg) 55%)">
      <div class="page-content">
        <div style="position:relative;z-index:2;padding:max(14px,var(--safe-top)) 16px 0;flex-shrink:0" class="fade-in">

          <!-- Header -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <div style="min-width:0">
              <div style="display:flex;align-items:center;gap:3px;margin-bottom:3px">
                <span style="font-weight:900;font-size:9px;color:rgba(255,255,255,.18);letter-spacing:.8px;text-transform:uppercase">adrenalin</span>
                <span style="color:var(--orange);font-size:6px;font-weight:700">\u00ae</span>
              </div>
              <h1 style="font-size:22px;font-weight:900;letter-spacing:-.4px;margin:0;line-height:1.15">Merhaba, ${fn}! \ud83d\udc4b</h1>
              <div style="display:flex;align-items:center;gap:5px;margin-top:4px">
                <div class="online-dot"></div>
                <span style="color:var(--orange);font-size:11px;font-weight:700">${esc(KASA_NAMES[currentUser.kasaId] || currentUser.kasaId)}</span>
                <span style="color:var(--text3);font-size:10px">\u00b7 ${esc(todayStr)}</span>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
              <span id="live-clock" style="color:var(--text3);font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:.02em">${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <div style="width:46px;height:46px;background:linear-gradient(135deg,#f97316,#c2410c);border-radius:16px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;box-shadow:0 4px 16px rgba(249,115,22,.4),0 0 0 2px rgba(249,115,22,.2);flex-shrink:0">${esc(ini)}</div>
            </div>
          </div>

          <!-- Timer card \u2014 premium glassmorphism -->
          <div class="card-glass ${isPending ? 'card-glow-amber' : 'card-glow-green'}" style="margin-bottom:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <span style="color:var(--text2);font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase">Bug\u00fcnk\u00fc Mesai</span>
              <div class="badge" style="background:${isPending ? 'rgba(245,158,11,.12)' : 'rgba(34,197,94,.12)'};color:${isPending ? 'var(--amber)' : 'var(--green2)'};border:1px solid ${isPending ? 'rgba(245,158,11,.3)' : 'rgba(34,197,94,.3)'}">
                ${isPending
                  ? `<span style="width:6px;height:6px;border-radius:50%;background:var(--amber);animation:pulse 1.2s infinite"></span> \u00c7\u0131k\u0131\u015f Bekleniyor`
                  : `<span style="width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 6px var(--green2);animation:pulse 2s infinite"></span> Aktif`}
              </div>
            </div>
            <div style="text-align:center;margin-bottom:14px">
              <div id="live-timer" class="${isPending ? '' : 'timer-glow'}" style="font-size:48px;font-weight:900;letter-spacing:2px;color:#fff;font-variant-numeric:tabular-nums;line-height:1;text-shadow:${isPending ? 'none' : '0 0 30px rgba(34,197,94,.4)'}">00:00:00</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:10px 12px">
                <p style="color:var(--text3);font-size:9px;margin:0 0 3px;text-transform:uppercase;letter-spacing:.6px;font-weight:700">Giri\u015f</p>
                <p style="color:var(--orange2);font-size:20px;font-weight:900;margin:0;letter-spacing:-.3px;font-variant-numeric:tabular-nums">${ci}</p>
              </div>
              <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:10px 12px">
                <p style="color:var(--text3);font-size:9px;margin:0 0 3px;text-transform:uppercase;letter-spacing:.6px;font-weight:700">S\u00fcre</p>
                <p id="live-duration" style="color:var(--green2);font-size:20px;font-weight:900;margin:0;letter-spacing:-.3px">--</p>
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

// ── Monthly Stats Loader ──
async function loadMonthlyStats(): Promise<{ workDays: number; totalHours: number; streak: number; tomorrowShift: string | null }> {
  if (!currentUser) return { workDays: 0, totalHours: 0, streak: 0, tomorrowShift: null };
  const today = new Date();
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const todayStr = today.toISOString().slice(0, 10);
  try {
    const [attRes, shiftRes] = await Promise.all([
      supabase.from('attendance').select('date, check_in, check_out, status').eq('personnel_id', currentUser.id).gte('date', monthStart).lte('date', todayStr).order('date', { ascending: false }),
      supabase.from('shifts').select('week_schedule').eq('personnel_id', currentUser.id).limit(1),
    ]);
    const records = attRes.data || [];
    const done = records.filter((r: any) => r.check_in && r.check_out);
    const workDays = done.length;
    const totalMins = done.reduce((acc: number, r: any) => acc + Math.round((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 60000), 0);
    const totalHours = Math.floor(totalMins / 60);
    // Streak: arka arkaya çalışılan gün sayısı
    let streak = 0;
    const sorted = [...records].sort((a: any, b: any) => b.date.localeCompare(a.date));
    for (let i = 0; i < sorted.length; i++) {
      const r: any = sorted[i];
      if (r.status === 'checked_out' || r.status === 'checked_in') {
        if (i === 0) { streak = 1; continue; }
        const prev: any = sorted[i - 1];
        const d1 = new Date(prev.date + 'T12:00:00'), d2 = new Date(r.date + 'T12:00:00');
        if (Math.round((d1.getTime() - d2.getTime()) / 86400000) <= 1) streak++; else break;
      } else break;
    }
    // Yarınki vardiya
    let tomorrowShift: string | null = null;
    const ws0 = shiftRes.data?.[0]?.week_schedule;
    if (ws0) {
      try {
        const ws = typeof ws0 === 'string' ? JSON.parse(ws0) : ws0;
        const tmw = new Date(today); tmw.setDate(tmw.getDate() + 1);
        const tmwKey = DAY_KEYS[tmw.getDay()];
        const t = ws[tmwKey];
        if (t?.isOff) tomorrowShift = t.leaveType || 'İzin';
        else if (t?.startTime && t?.endTime) tomorrowShift = `${t.startTime} – ${t.endTime}`;
      } catch {}
    }
    return { workDays, totalHours, streak, tomorrowShift };
  } catch { return { workDays: 0, totalHours: 0, streak: 0, tomorrowShift: null }; }
}

// ── Home Tab ──
async function renderHome(c: HTMLElement) {
  if (!currentUser || !currentAttendance) return;
  const isPending = currentAttendance.status === 'checkout_pending';

  // Yükleniyor skeleton
  c.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;padding-top:2px">
    ${[1,2,3].map(() => `<div style="height:64px;border-radius:16px;background:rgba(255,255,255,.03);animation:pulse 1.5s infinite"></div>`).join('')}
  </div>`;

  const today = new Date();
  const todayDate = today.toISOString().slice(0, 10);
  let shiftData: any[] | null = null;
  let teamAtt: any[] | null = null;
  let monthStats = { workDays: 0, totalHours: 0, streak: 0, tomorrowShift: null as string | null };
  try {
    const [shiftRes, teamRes, mStats] = await Promise.all([
      supabase.from('shifts').select('*').eq('personnel_id', currentUser.id).limit(1),
      supabase.from('attendance').select('personnel_id, status').eq('kasa_id', currentUser.kasaId).eq('date', todayDate),
      loadMonthlyStats(),
    ]);
    shiftData = shiftRes.data;
    teamAtt = teamRes.data;
    monthStats = mStats;
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
  const doneCount   = teamRecs.filter((r: any) => r.status === 'checked_out').length;
  const shiftIsOff  = todayShift?.isOff;
  const leaveType   = todayShift?.leaveType;
  const lc = LEAVE_COLORS[leaveType || ''] || '#ea580c';
  const monthName = new Date().toLocaleDateString('tr-TR', { month: 'long' });

  c.innerHTML = `<div class="slide-up" style="display:flex;flex-direction:column;gap:8px;padding-top:2px">

    <!-- Ayl\u0131k \u00f6zet \u015ferit -->
    <div class="monthly-strip">
      <div class="monthly-pill">
        <p style="color:var(--text3);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">${esc(monthName)}</p>
        <p style="color:#fff;font-size:18px;font-weight:900;margin:0;line-height:1">${monthStats.workDays}<span style="font-size:10px;color:var(--text3);font-weight:600;margin-left:2px">g\u00fcn</span></p>
      </div>
      <div class="monthly-pill">
        <p style="color:var(--text3);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Toplam</p>
        <p style="color:var(--orange2);font-size:18px;font-weight:900;margin:0;line-height:1">${monthStats.totalHours}<span style="font-size:10px;color:var(--text3);font-weight:600;margin-left:2px">saat</span></p>
      </div>
      <div class="monthly-pill" style="${monthStats.streak >= 5 ? 'background:rgba(251,146,60,.08);border-color:rgba(251,146,60,.2)' : ''}">
        <p style="color:var(--text3);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Seri \ud83d\udd25</p>
        <p style="color:${monthStats.streak >= 5 ? '#fb923c' : 'var(--text2)'};font-size:18px;font-weight:900;margin:0;line-height:1">${monthStats.streak}<span style="font-size:10px;color:var(--text3);font-weight:600;margin-left:2px">g\u00fcn</span></p>
      </div>
    </div>

    <!-- Vardiya kart\u0131 -->
    ${todayShift ? `
    <div class="card-glass card-glow-orange" style="padding:14px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:34px;height:34px;border-radius:10px;background:rgba(249,115,22,.12);display:flex;align-items:center;justify-content:center;color:var(--orange)">${I.cal}</div>
          <div>
            <p style="color:var(--text3);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin:0 0 2px">Bug\u00fcnk\u00fc Vardiya</p>
            ${shiftIsOff
              ? `<div class="badge" style="background:${lc}15;color:${lc};border:1px solid ${lc}25">${esc(leaveType || '\u0130zin')}</div>`
              : `<span style="color:#fff;font-size:16px;font-weight:900;letter-spacing:-.2px">${esc(todayShift.start || '')} \u2013 ${esc(todayShift.end || '')}</span>`}
          </div>
        </div>
        ${!shiftIsOff && shiftTotalMins > 0 ? `<span id="progress-pct" style="color:var(--orange2);font-size:14px;font-weight:900">%0</span>` : ''}
      </div>
      ${!shiftIsOff && shiftTotalMins > 0 ? `
      <div style="margin-top:10px">
        <div class="progress-track" style="height:6px">
          <div class="progress-fill" id="progress-fill" data-total="${shiftTotalMins}" style="width:0%"></div>
        </div>
      </div>` : ''}
    </div>` : ''}

    <!-- Yar\u0131nki vardiya -->
    ${monthStats.tomorrowShift ? `
    <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:11px 14px">
      <span style="font-size:16px">\ud83c\udf05</span>
      <div>
        <p style="color:var(--text3);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin:0 0 2px">Yar\u0131n</p>
        <p style="color:var(--text2);font-size:13px;font-weight:700;margin:0">${esc(monthStats.tomorrowShift)}</p>
      </div>
    </div>` : ''}

    <!-- Ekip durumu -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
      <div style="background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);border-radius:14px;padding:10px;text-align:center">
        <div style="display:flex;align-items:center;justify-content:center;gap:3px;margin-bottom:3px">
          <div class="online-dot" style="width:5px;height:5px"></div>
          <p style="color:rgba(34,197,94,.7);font-size:8px;font-weight:700;text-transform:uppercase;margin:0;letter-spacing:.4px">Aktif</p>
        </div>
        <p style="color:var(--green2);font-size:24px;font-weight:900;margin:0;line-height:1">${activeCount}</p>
      </div>
      <div style="background:rgba(249,115,22,.05);border:1px solid rgba(249,115,22,.12);border-radius:14px;padding:10px;text-align:center">
        <p style="color:rgba(249,115,22,.6);font-size:8px;font-weight:700;text-transform:uppercase;margin:0 0 3px;letter-spacing:.4px">\u00c7\u0131k\u0131\u015f</p>
        <p style="color:var(--orange2);font-size:24px;font-weight:900;margin:0;line-height:1">${doneCount}</p>
      </div>
      <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:10px;text-align:center">
        <p style="color:var(--text3);font-size:8px;font-weight:700;text-transform:uppercase;margin:0 0 3px;letter-spacing:.4px">Toplam</p>
        <p style="color:var(--text2);font-size:24px;font-weight:900;margin:0;line-height:1">${teamRecs.length}</p>
      </div>
    </div>

    <!-- \u00c7\u0131k\u0131\u015f butonu -->
    ${isPending ? `
    <div class="card-glass card-glow-amber" style="padding:14px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <div style="width:8px;height:8px;border-radius:50%;background:var(--amber);box-shadow:0 0 8px var(--amber);animation:pulse 1.2s infinite;flex-shrink:0"></div>
        <span style="color:var(--amber);font-size:13px;font-weight:700">\u00c7\u0131k\u0131\u015f Onay\u0131 Bekleniyor</span>
      </div>
      <p style="color:var(--text2);font-size:11px;margin:0 0 12px;line-height:1.6">PC'de \u00e7\u0131k\u0131\u015f QR kodu g\u00f6sterildi. Okutmak i\u00e7in a\u015fa\u011f\u0131daki butona bas\u0131n.</p>
      <button id="scan-co" class="btn btn-danger" style="margin-bottom:8px">${I.cam} \u00c7\u0131k\u0131\u015f QR Okut</button>
      <button id="cancel-co2" class="btn btn-ghost" style="font-size:13px">\u0130ptal Et</button>
    </div>` : `
    <button id="co-btn" class="btn btn-danger">${I.out} \u0130\u015ften \u00c7\u0131k\u0131\u015f Yap</button>`}
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
      if (currentUser.kasaId === 'yasam_destek') { showScanner('checkout'); return; }
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

// ════════════════════════════════════════
// YAŞAM DESTEK (YD) MODE
// ════════════════════════════════════════

function saveYDUser(user: PersonnelInfo) {
  localStorage.setItem('yd_user', JSON.stringify(user));
}

function loadYDUser(): PersonnelInfo | null {
  try {
    const u = localStorage.getItem('yd_user');
    return u ? JSON.parse(u) : null;
  } catch { return null; }
}

async function handleYDCheckin() {
  const saved = loadYDUser();
  if (!saved) { showYDLoginForm(); return; }
  await doYDCheckin(saved);
}

async function handleYDCheckout() {
  if (!currentUser || !currentAttendance) { showError('Oturum bulunamadı. Lütfen tekrar QR okutun.'); return; }
  try {
    const now = new Date().toISOString();
    const { error } = await supabase.from('attendance')
      .update({ status: 'checked_out', check_out: now, checkout_token: null })
      .eq('id', currentAttendance.id)
      .in('status', ['checked_in', 'checkout_pending']);
    if (error) { showError('Çıkış kaydedilemedi'); return; }
    clearSession(false);
    showSuccess('Güle Güle!', currentUser.fullName,
      new Date(now).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), false);
  } catch {
    showError('Çıkış kaydedilemedi. İnternet bağlantınızı kontrol edin.');
  }
}

async function doYDCheckin(user: PersonnelInfo) {
  showProcessing('Giriş kaydediliyor...');
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rowId = `${user.id}_${today}`;
    const { data: existing } = await supabase.from('attendance').select('*').eq('id', rowId).single();

    if (existing?.status === 'checked_out') {
      showYDDoneToday(user, existing as AttendanceRecord);
      return;
    }
    if (existing?.status === 'checked_in' || existing?.status === 'checkout_pending') {
      currentUser = user;
      currentAttendance = existing as AttendanceRecord;
      saveSession(user, existing as AttendanceRecord);
      showDashboard();
      return;
    }

    const now = new Date().toISOString();
    const sessionToken = `ATT-${user.id}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const { error } = await supabase.from('attendance').upsert([{
      id: rowId,
      personnel_id: user.id,
      personnel_name: user.fullName,
      kasa_id: user.kasaId,
      date: today,
      status: 'checked_in',
      check_in: now,
      check_out: null,
      session_token: sessionToken,
    }], { onConflict: 'id' });

    if (error) { showError('Giriş kaydedilemedi'); return; }

    const att: AttendanceRecord = {
      id: rowId, personnel_id: user.id, personnel_name: user.fullName,
      kasa_id: user.kasaId, date: today, check_in: now, check_out: null,
      status: 'checked_in', session_token: sessionToken,
    };
    currentUser = user;
    currentAttendance = att;
    saveSession(user, att);
    showSuccess('Hoş Geldiniz!', user.fullName,
      new Date(now).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), true);
  } catch (e: any) {
    if (e?.message?.includes('Failed to fetch') || e?.message?.includes('NetworkError')) {
      showError('İnternet bağlantısı kurulamadı. WiFi veya mobil verinizi kontrol edin.');
    } else {
      showError('Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.');
    }
  }
}

function showYDLoginForm() {
  stopLiveTimer();
  document.getElementById('app')!.innerHTML = `${CSS}
    <div class="page">
      ${WAVE}
      <div class="page-content" style="align-items:center;justify-content:center;padding:0 20px">
        <div style="width:100%;max-width:340px" class="fade-in">
          <div style="text-align:center;margin-bottom:28px">
            <div style="width:60px;height:60px;margin:0 auto 12px;background:linear-gradient(135deg,var(--orange),#ea580c);border-radius:18px;display:flex;align-items:center;justify-content:center;color:#fff">
              ${I.flame}
            </div>
            <h1 style="font-size:20px;font-weight:800;letter-spacing:-.3px">Yaşam Destek</h1>
            <p style="color:var(--text2);font-size:12px;margin-top:4px">İlk giriş — kimliğinizi doğrulayın</p>
          </div>
          <div id="yd-error" style="display:none;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:10px 14px;color:var(--red);font-size:12px;text-align:center;margin-bottom:12px"></div>
          <div style="margin-bottom:10px">
            <input id="yd-user" type="text" placeholder="Kullanıcı Adı" autocomplete="username"
              style="width:100%;padding:14px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:14px;color:#fff;font-size:14px;outline:none;-webkit-appearance:none" />
          </div>
          <div style="margin-bottom:20px">
            <input id="yd-pass" type="password" placeholder="Şifre" autocomplete="current-password"
              style="width:100%;padding:14px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:14px;color:#fff;font-size:14px;outline:none;-webkit-appearance:none" />
          </div>
          <button id="yd-submit" class="btn btn-primary">${I.ok} Giriş Yap</button>
        </div>
      </div>
    </div>`;

  const userEl = document.getElementById('yd-user') as HTMLInputElement;
  const passEl = document.getElementById('yd-pass') as HTMLInputElement;
  const errEl  = document.getElementById('yd-error') as HTMLElement;
  const btnEl  = document.getElementById('yd-submit') as HTMLButtonElement;

  const attempt = async () => {
    const username = userEl.value.trim();
    const password = passEl.value.trim();
    if (!username || !password) {
      errEl.style.display = 'block'; errEl.textContent = 'Kullanıcı adı ve şifre giriniz'; return;
    }
    btnEl.disabled = true;
    btnEl.innerHTML = `<div style="width:18px;height:18px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite"></div>`;
    try {
      const { data, error } = await supabase
        .from('personnel')
        .select('id, fullName, kasaId, role')
        .ilike('username', username)
        .eq('password', password)
        .eq('kasaId', 'yasam_destek')
        .eq('isActive', true)
        .single();
      if (error || !data) {
        errEl.style.display = 'block'; errEl.textContent = 'Kullanıcı adı veya şifre hatalı!';
        btnEl.disabled = false; btnEl.innerHTML = `${I.ok} Giriş Yap`; passEl.value = ''; return;
      }
      const user: PersonnelInfo = { id: data.id, fullName: data.fullName, kasaId: data.kasaId, role: data.role };
      saveYDUser(user);
      await doYDCheckin(user);
    } catch {
      errEl.style.display = 'block'; errEl.textContent = 'Bağlantı hatası. İnternet bağlantınızı kontrol edin.';
      btnEl.disabled = false; btnEl.innerHTML = `${I.ok} Giriş Yap`;
    }
  };

  btnEl.addEventListener('click', attempt);
  passEl.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
  userEl.addEventListener('keydown', e => { if (e.key === 'Enter') passEl.focus(); });
}

function showYDDoneToday(user: PersonnelInfo, att: AttendanceRecord) {
  stopLiveTimer();
  const ci = att.check_in  ? new Date(att.check_in).toLocaleTimeString('tr-TR',  { hour: '2-digit', minute: '2-digit' }) : '--:--';
  const co = att.check_out ? new Date(att.check_out).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
  document.getElementById('app')!.innerHTML = `${CSS}
    <div class="page" style="align-items:center;justify-content:center">
      ${WAVE}
      <div style="position:relative;z-index:2;text-align:center;padding:24px;max-width:340px;width:100%" class="scale-in">
        <div style="width:80px;height:80px;margin:0 auto 20px;background:rgba(249,115,22,.1);border:3px solid rgba(249,115,22,.3);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--orange)">
          ${I.ok}
        </div>
        <h1 style="font-size:22px;font-weight:800;margin:0 0 4px">Bugün Tamamlandı</h1>
        <p style="color:var(--orange);font-size:16px;font-weight:600;margin:0 0 20px">${esc(user.fullName)}</p>
        <div class="card" style="padding:16px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-around;align-items:center">
            <div style="text-align:center">
              <p style="color:var(--text3);font-size:9px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px">Giriş</p>
              <p style="color:var(--green);font-size:22px;font-weight:800;margin:0">${ci}</p>
            </div>
            <div style="color:var(--text3);font-size:18px">→</div>
            <div style="text-align:center">
              <p style="color:var(--text3);font-size:9px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px">Çıkış</p>
              <p style="color:var(--red);font-size:22px;font-weight:800;margin:0">${co}</p>
            </div>
          </div>
        </div>
        <p style="color:var(--text3);font-size:11px;line-height:1.6">Bugün için çıkış yapıldı.<br>İyi akşamlar, ${esc(user.fullName.split(' ')[0])}!</p>
      </div>
    </div>`;
}

// ── Init ──
async function init() {
  await showSplash();
  renderApp();
  if (!isOnline) showOfflineBanner();
}

init();
