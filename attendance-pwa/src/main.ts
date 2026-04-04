import { createClient } from '@supabase/supabase-js';
import { Html5Qrcode } from 'html5-qrcode';

// ── Supabase ──
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://mipafqwsibhazkszzcxb.supabase.co';
const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Cby57dwYK-5-gpuUGGE_aQ_nFzy41cv';
const supabase = createClient(supabaseUrl, supabaseKey);

const PWA_VERSION = 'v4.0';

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

// ── Session Persist ──
function saveSession(user: PersonnelInfo, att: AttendanceRecord) {
  currentUser = user; currentAttendance = att;
  localStorage.setItem('pwa_user', JSON.stringify(user));
  localStorage.setItem('pwa_attendance', JSON.stringify(att));
  // Kalıcı ipucu — session kaybolsa bile kullanıcı kurtarılabilsin
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
  // Checkout sonrası hint'i de sil, yoksa kurtarma için bırak
  if (full) localStorage.removeItem('pwa_user_hint');
}

/** Oturum kurtarma: localStorage kaybolmuşsa DB'den aktif kaydı bul */
async function tryRecoverSession(): Promise<boolean> {
  try {
    const hint = localStorage.getItem('pwa_user_hint');
    if (!hint) return false;
    const user: PersonnelInfo = JSON.parse(hint);
    const today = new Date().toISOString().slice(0, 10);
    const rowId = `${user.id}_${today}`;
    const { data, error } = await supabase.from('attendance').select('*').eq('id', rowId).single();
    if (error || !data) return false;
    // Sadece aktif oturumları kurtar (checked_in veya checkout_pending)
    if (data.status === 'checked_in' || data.status === 'checkout_pending') {
      saveSession(user, data);
      return true;
    }
    return false;
  } catch { return false; }
}

// ── Constants ──
const BG = `background:linear-gradient(135deg,#09090b 0%,#111827 40%,#0f172a 100%)`;
const KASA_NAMES: Record<string, string> = { wildpark: 'WildPark', sinema: 'XD Sinema', face2face: 'Face2Face', genel: 'Genel Yönetim' };
const LEAVE_COLORS: Record<string, string> = { 'Yıllık İzin': '#3b82f6', 'Hastalık İzni': '#ef4444', 'Mazeret İzni': '#f59e0b', 'İzin': '#ea580c' };
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
// DB'deki İngilizce key → getDay() index eşlemesi
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_KEY_TO_TR: Record<string, string> = { monday:'Pazartesi', tuesday:'Salı', wednesday:'Çarşamba', thursday:'Perşembe', friday:'Cuma', saturday:'Cumartesi', sunday:'Pazar' };
const COLORS = ['#f97316', '#06b6d4', '#ec4899', '#f59e0b', '#22c55e', '#ea580c'];

const WAVE = `<svg style="position:fixed;bottom:0;left:0;width:100%;height:35vh;opacity:0.15;pointer-events:none;z-index:0" viewBox="0 0 1440 400" preserveAspectRatio="none">
  <defs><linearGradient id="wg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f97316" stop-opacity="0.5"/><stop offset="100%" stop-color="#dc2626" stop-opacity="0.3"/></linearGradient>
  <linearGradient id="wg2" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#ea580c" stop-opacity="0.3"/><stop offset="100%" stop-color="#ef4444" stop-opacity="0.2"/></linearGradient></defs>
  <path fill="url(#wg1)"><animate attributeName="d" dur="8s" repeatCount="indefinite" values="M0,200 C200,100 400,300 720,180 C1040,60 1250,280 1440,200 L1440,400 L0,400Z;M0,250 C250,150 500,350 720,220 C940,90 1200,300 1440,250 L1440,400 L0,400Z;M0,200 C200,100 400,300 720,180 C1040,60 1250,280 1440,200 L1440,400 L0,400Z"/></path>
  <path fill="url(#wg2)"><animate attributeName="d" dur="10s" repeatCount="indefinite" values="M0,280 C300,200 600,350 900,260 C1200,170 1350,320 1440,280 L1440,400 L0,400Z;M0,300 C350,240 550,380 900,300 C1250,220 1300,350 1440,300 L1440,400 L0,400Z;M0,280 C300,200 600,350 900,260 C1200,170 1350,320 1440,280 L1440,400 L0,400Z"/></path>
</svg>`;

const CSS = `<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body,html,#app{width:100%;height:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
body{overscroll-behavior:none;user-select:none;-webkit-user-select:none;touch-action:pan-y}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes scaleIn{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes glow{0%,100%{box-shadow:0 0 12px rgba(249,115,22,.25)}50%{box-shadow:0 0 24px rgba(249,115,22,.5)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
.fi{animation:fadeIn .5s ease-out both}
.si{animation:scaleIn .5s cubic-bezier(.175,.885,.32,1.275) both}
.su{animation:slideUp .4s ease-out both}
.card{background:rgba(255,255,255,.03);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.06);border-radius:18px;padding:16px;transition:transform .2s,border-color .3s}
.card:active{transform:scale(.98)}
.card-active{border-color:rgba(34,197,94,.3);background:rgba(34,197,94,.04);box-shadow:0 0 20px rgba(34,197,94,.06)}
.card-pending{border-color:rgba(245,158,11,.25);background:rgba(245,158,11,.03);box-shadow:0 0 20px rgba(245,158,11,.06)}
.btn{padding:15px 28px;border:none;border-radius:16px;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .2s;width:100%;touch-action:manipulation;position:relative;overflow:hidden}
.btn:active{transform:scale(.95);opacity:.85}
.btn-p{background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;box-shadow:0 6px 24px rgba(249,115,22,.35)}
.btn-d{background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;box-shadow:0 6px 24px rgba(220,38,38,.3)}
.btn-g{background:rgba(255,255,255,.04);color:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(8px)}
.tbar{display:flex;gap:3px;background:rgba(255,255,255,.03);border-radius:16px;padding:4px;border:1px solid rgba(255,255,255,.05);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.tb{flex:1;padding:10px 8px;border-radius:13px;border:none;font-size:11px;font-weight:600;cursor:pointer;color:rgba(255,255,255,.3);background:transparent;transition:all .25s;display:flex;flex-direction:column;align-items:center;gap:4px;touch-action:manipulation}
.tb.a{background:rgba(249,115,22,.12);color:#fdba74;box-shadow:0 2px 12px rgba(249,115,22,.15)}
.bg{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600}
.stat-card{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);border-radius:14px;padding:12px;text-align:center;backdrop-filter:blur(8px);transition:transform .15s}
.stat-card:active{transform:scale(.97)}
.brand{font-weight:800;font-size:11px;letter-spacing:.5px;text-transform:uppercase}
.glass{background:rgba(255,255,255,.03);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.06)}
</style>`;

// ── Icons ──
const I = {
  qr: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
  home: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  users: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
  cal: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  out: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  clk: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  ok: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`,
  x: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  cam: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
};

// ════════════════════════════════════════
// ROUTER
// ════════════════════════════════════════
async function renderApp() {
  if (loadSession()) { showDashboard(); return; }
  // Session kaybolmuş olabilir — DB'den kurtarmayı dene
  const recovered = await tryRecoverSession();
  if (recovered) { showDashboard(); return; }
  showScanner('checkin');
}

// ════════════════════════════════════════
// QR SCANNER
// ════════════════════════════════════════
function showScanner(mode: 'checkin' | 'checkout') {
  const app = document.getElementById('app')!;
  const isOut = mode === 'checkout';
  const clr = isOut ? '#ef4444' : '#fb923c';
  app.innerHTML = `${CSS}
    <div style="min-height:100vh;min-height:100dvh;${BG};display:flex;flex-direction:column;align-items:center;position:relative;overflow:hidden">
      ${WAVE}
      <div style="position:relative;z-index:1;width:100%;max-width:400px;padding:0 16px">
        <div style="text-align:center;padding:32px 0 14px" class="fi">
          <div style="width:52px;height:52px;margin:0 auto 8px;background:${clr}15;border:2px solid ${clr}40;border-radius:50%;display:flex;align-items:center;justify-content:center;color:${clr}">
            ${isOut ? I.out : I.qr}
          </div>
          <div style="display:flex;align-items:center;justify-content:center;gap:4px;margin-bottom:10px"><span class="brand" style="color:rgba(255,255,255,.25)">adrenalin</span><span style="color:#f97316;font-size:9px;font-weight:700">®</span></div>
          <h1 style="color:#fff;font-size:20px;font-weight:800;margin:0 0 4px;letter-spacing:-.3px">${isOut ? 'Çıkış QR Kodu' : 'Puantaj Giriş'}</h1>
          <p style="color:rgba(255,255,255,.35);font-size:12px">${isOut ? 'PC\'deki çıkış QR kodunu okutun' : 'PC\'deki QR kodu okutun'}</p>
          <p style="color:rgba(255,255,255,.08);font-size:8px;margin-top:6px">${PWA_VERSION}</p>
        </div>
        <div id="qr-reader" style="width:100%;border-radius:16px;overflow:hidden" class="fi"></div>
        <p style="color:rgba(255,255,255,.15);font-size:9px;text-align:center;margin-top:10px">Kameranızı QR koda doğrultun</p>
        ${isOut ? `<button id="cancel-co" class="btn btn-g" style="margin-top:14px">İptal</button>` : ''}
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
  if (scanner) { try { await scanner.stop(); } catch {} }
  const el = document.getElementById('qr-reader');
  if (!el) return;
  scanner = new Html5Qrcode('qr-reader');
  try {
    await scanner.start({ facingMode: 'environment' }, { fps: 20, qrbox: { width: 260, height: 260 }, aspectRatio: 1, disableFlip: true },
      async (decoded) => {
        try { await scanner?.stop(); } catch {}
        // Anında haptic + görsel feedback
        if (navigator.vibrate) navigator.vibrate(50);
        let token = '';
        try { const url = new URL(decoded); token = url.searchParams.get('token') || ''; } catch { token = decoded; }
        if (mode === 'checkin') {
          if (!token.startsWith('ATT-')) { showError('Geçersiz QR kod.'); return; }
          showProcessing('Yoklama onaylanıyor...'); await handleCheckin(token);
        } else {
          if (!token.startsWith('OUT-')) { showError('Geçersiz çıkış QR kodu.'); return; }
          showProcessing('Çıkış onaylanıyor...'); await handleCheckoutScan(token);
        }
      }, () => {});
  } catch { showError('Kamera erişimi sağlanamadı. Tarayıcıdan kamera iznini verin.'); }
}

async function handleCheckin(token: string) {
  try {
    const { data, error } = await supabase.from('attendance').select('*').eq('session_token', token).eq('status', 'pending').single();
    if (error || !data) { showError(`QR doğrulanamadı: ${error?.message || 'Kayıt bulunamadı'}`); return; }
    const { error: upErr } = await supabase.from('attendance').update({ status: 'checked_in', check_in: new Date().toISOString() }).eq('id', data.id);
    if (upErr) { showError('Giriş kaydedilemedi'); return; }
    const { data: pData } = await supabase.from('personnel').select('id, fullName, kasaId, role').eq('id', data.personnel_id).single();
    const user: PersonnelInfo = pData || { id: data.personnel_id, fullName: data.personnel_name, kasaId: data.kasa_id, role: 'personel' };
    data.status = 'checked_in'; data.check_in = new Date().toISOString();
    saveSession(user, data);
    showSuccess('Hoş Geldiniz!', user.fullName, new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), true);
  } catch (e: any) {
    if (e?.message?.includes('Failed to fetch') || e?.message?.includes('NetworkError')) {
      showError('İnternet bağlantısı kurulamadı. WiFi veya mobil verinizi kontrol edin ve tekrar deneyin.');
    } else {
      showError(`Beklenmeyen hata: ${e?.message || 'Bilinmeyen hata'}`);
    }
  }
}

async function handleCheckoutScan(token: string) {
  const { data, error } = await supabase.from('attendance').select('*').eq('checkout_token', token).eq('status', 'checkout_pending').single();
  if (error || !data) { showError('Geçersiz veya süresi dolmuş çıkış QR kodu.'); return; }
  const { error: upErr } = await supabase.from('attendance').update({ status: 'checked_out', check_out: new Date().toISOString(), checkout_token: null }).eq('id', data.id);
  if (upErr) { showError('Çıkış kaydedilemedi'); return; }
  clearSession(true);
  showSuccess('Güle Güle!', data.personnel_name, new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), false);
}

// ════════════════════════════════════════
// PROCESSING / SUCCESS / ERROR
// ════════════════════════════════════════
function showProcessing(msg: string) {
  document.getElementById('app')!.innerHTML = `${CSS}<div style="min-height:100vh;${BG};display:flex;align-items:center;justify-content:center;position:relative">${WAVE}<div style="position:relative;z-index:1;text-align:center" class="fi"><div style="width:56px;height:56px;margin:0 auto 16px;border:3px solid rgba(249,115,22,.2);border-top-color:#fb923c;border-radius:50%;animation:spin 1s linear infinite"></div><p style="color:#fb923c;font-size:15px;font-weight:600">${msg}</p></div></div>`;
}

function showSuccess(title: string, name: string, time: string, isCheckin: boolean) {
  const clr = isCheckin ? '#22c55e' : '#f97316';
  const dateStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  document.getElementById('app')!.innerHTML = `${CSS}<div style="min-height:100vh;min-height:100dvh;${BG};display:flex;align-items:center;justify-content:center;position:relative">${WAVE}<div style="position:relative;z-index:1;text-align:center;padding:24px;max-width:340px;width:100%" class="si">
    <div style="width:84px;height:84px;margin:0 auto 20px;background:${clr}15;border:3px solid ${clr}40;border-radius:50%;display:flex;align-items:center;justify-content:center;color:${clr};box-shadow:0 0 40px ${clr}20">${isCheckin ? I.ok : I.out}</div>
    <h1 style="color:#fff;font-size:26px;font-weight:800;margin:0 0 4px;letter-spacing:-.3px">${title}</h1>
    <p style="color:${clr};font-size:19px;font-weight:700;margin:0 0 18px">${name}</p>
    <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:16px;margin-bottom:24px">
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:4px"><div style="color:${clr}">${I.clk}</div><span style="color:#fff;font-size:22px;font-weight:700">${time}</span></div>
      <p style="color:rgba(255,255,255,.2);font-size:11px;margin:0">${dateStr}</p>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;gap:4px"><span class="brand" style="color:rgba(255,255,255,.15)">adrenalin</span><span style="color:#f97316;font-size:9px;font-weight:700">®</span></div>
  </div></div>`;
  if (navigator.vibrate) navigator.vibrate(isCheckin ? [100, 50, 100] : [150]);
  setTimeout(() => renderApp(), 2500);
}

function showError(msg: string) {
  document.getElementById('app')!.innerHTML = `${CSS}<div style="min-height:100vh;${BG};display:flex;align-items:center;justify-content:center;position:relative">${WAVE}<div style="position:relative;z-index:1;text-align:center;padding:20px;max-width:320px" class="fi">
    <div style="width:56px;height:56px;margin:0 auto 12px;background:rgba(239,68,68,.15);border:3px solid rgba(239,68,68,.4);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#ef4444">${I.x}</div>
    <h2 style="color:#ef4444;font-size:17px;font-weight:700;margin:0 0 8px">Hata</h2>
    <p style="color:rgba(255,255,255,.5);font-size:12px;line-height:1.5;margin:0 0 16px">${msg}</p>
    <button id="retry" class="btn btn-p">Tekrar Dene</button></div></div>`;
  document.getElementById('retry')?.addEventListener('click', () => renderApp());
}

// ════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════
function showDashboard() {
  if (!currentUser || !currentAttendance) { showScanner('checkin'); return; }
  // Refresh from DB
  supabase.from('attendance').select('*').eq('id', currentAttendance.id).single().then(({ data }) => {
    if (data) {
      currentAttendance = data;
      // Çıkış yapılmışsa session'\u0131 temizle ve tarayıcıya yönlendir
      if (data.status === 'checked_out') {
        clearSession(true);
        showScanner('checkin');
        return;
      }
      if (currentUser) saveSession(currentUser, data);
    }
    renderDash();
  }).then(null, () => renderDash());
}

function renderDash() {
  if (!currentUser || !currentAttendance) return;
  const app = document.getElementById('app')!;
  const ci = currentAttendance.check_in ? new Date(currentAttendance.check_in).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
  const co = currentAttendance.check_out ? new Date(currentAttendance.check_out).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
  const fn = currentUser.fullName.split(' ')[0];
  const ini = currentUser.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const isPending = currentAttendance.status === 'checkout_pending';
  const isCheckedOut = currentAttendance.status === 'checked_out';
  const todayStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' });

  // Calculate work duration
  let durationStr = '';
  if (currentAttendance.check_in) {
    const start = new Date(currentAttendance.check_in).getTime();
    const end = currentAttendance.check_out ? new Date(currentAttendance.check_out).getTime() : Date.now();
    const mins = Math.floor((end - start) / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    durationStr = `${h}s ${m}dk`;
  }

  app.innerHTML = `${CSS}
    <div style="min-height:100vh;min-height:100dvh;${BG};position:relative;overflow-x:hidden;display:flex;flex-direction:column">
      ${WAVE}
      <div style="position:relative;z-index:2;padding:max(16px,env(safe-area-inset-top)) 16px 0;flex-shrink:0" class="fi">
        <!-- Profile Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div>
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px"><span class="brand" style="color:rgba(255,255,255,.2)">adrenalin</span><span style="color:#f97316;font-size:8px;font-weight:700">®</span></div>
            <h1 style="color:#fff;font-size:18px;font-weight:700;margin:0">Merhaba, ${fn}!</h1>
            <p style="color:rgba(249,115,22,.5);font-size:11px;margin:2px 0 0">${KASA_NAMES[currentUser.kasaId] || currentUser.kasaId}</p>
            <p style="color:rgba(255,255,255,.15);font-size:10px;margin:2px 0 0">${todayStr}</p>
          </div>
          <div style="width:42px;height:42px;background:linear-gradient(135deg,#f97316,#ea580c);border-radius:14px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;border:2px solid rgba(249,115,22,.3)">${ini}</div>
        </div>
        <!-- Status Card -->
        <div class="card ${isPending ? 'card-pending' : 'card-active'}" style="margin-bottom:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:6px"><div style="color:#22c55e">${I.clk}</div><span style="color:rgba(255,255,255,.4);font-size:11px">Bugünkü Mesai</span></div>
            <div class="bg" style="background:${isPending ? 'rgba(245,158,11,.12)' : 'rgba(34,197,94,.12)'};color:${isPending ? '#f59e0b' : '#22c55e'};border:1px solid ${isPending ? 'rgba(245,158,11,.2)' : 'rgba(34,197,94,.2)'}">
              ${isPending ? `${I.clk} Çıkış Bekl.` : `<span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block"></span> Aktif`}
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <div class="stat-card" style="flex:1"><p style="color:rgba(255,255,255,.25);font-size:9px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px">Giriş</p><p style="color:#f97316;font-size:20px;font-weight:800;margin:0;letter-spacing:-.5px">${ci}</p></div>
            <div class="stat-card" style="flex:1"><p style="color:rgba(255,255,255,.25);font-size:9px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px">Çıkış</p><p style="color:${currentAttendance.check_out ? '#ef4444' : 'rgba(255,255,255,.12)'};font-size:20px;font-weight:800;margin:0;letter-spacing:-.5px">${co}</p></div>
            <div class="stat-card" style="flex:1"><p style="color:rgba(255,255,255,.25);font-size:9px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px">Süre</p><p style="color:#22c55e;font-size:18px;font-weight:800;margin:0">${durationStr || '--'}</p></div>
          </div>
        </div>
      </div>
      <div style="position:relative;z-index:2;flex:1;overflow-y:auto;padding:0 16px 90px;-webkit-overflow-scrolling:touch;scroll-behavior:smooth" id="tc"></div>
      <div style="position:fixed;bottom:0;left:0;right:0;z-index:10;padding:6px 16px;padding-bottom:max(8px,env(safe-area-inset-bottom));background:rgba(9,9,11,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,.04)">
        <div class="tbar">
          <button class="tb ${activeTab==='home'?'a':''}" data-t="home">${I.home}<span>Ana Sayfa</span></button>
          <button class="tb ${activeTab==='team'?'a':''}" data-t="team">${I.users}<span>Ekibim</span></button>
          <button class="tb ${activeTab==='schedule'?'a':''}" data-t="schedule">${I.cal}<span>Mesai</span></button>
        </div>
      </div>
    </div>`;

  document.querySelectorAll('.tb[data-t]').forEach(b => b.addEventListener('click', () => {
    activeTab = (b as HTMLElement).dataset.t as any; showDashboard();
  }));

  const tc = document.getElementById('tc')!;
  if (activeTab === 'home') renderHome(tc, isPending, isCheckedOut);
  else if (activeTab === 'team') renderTeam(tc);
  else renderSchedule(tc);
}

// ── Home Tab ──
async function renderHome(c: HTMLElement, isPending: boolean, isCheckedOut: boolean = false) {
  if (!currentUser || !currentAttendance) return;

  // Load shift schedule + team summary in parallel
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
  } catch {
    // İnternet yok — mevcut verilerle devam et
  }

  // Parse shift schedule for today
  let todayShift: WeekDay | null = null;
  if (shiftData?.[0]?.week_schedule) {
    try {
      const ws = typeof shiftData[0].week_schedule === 'string' ? JSON.parse(shiftData[0].week_schedule) : shiftData[0].week_schedule;
      const dayKey = DAY_KEYS[today.getDay()];
      const raw = ws[dayKey];
      if (raw) todayShift = { start: raw.startTime || raw.start, end: raw.endTime || raw.end, isOff: raw.isOff, leaveType: raw.leaveType };
    } catch {}
  }

  // Calculate live time
  let workedMins = 0;
  let remainMins = 0;
  let shiftTotalMins = 0;
  let progressPct = 0;
  if (currentAttendance.check_in) {
    const start = new Date(currentAttendance.check_in).getTime();
    workedMins = Math.floor((Date.now() - start) / 60000);
  }
  if (todayShift && todayShift.start && todayShift.end && !todayShift.isOff) {
    const [sh, sm] = todayShift.start.split(':').map(Number);
    const [eh, em] = todayShift.end.split(':').map(Number);
    shiftTotalMins = (eh * 60 + em) - (sh * 60 + sm);
    if (shiftTotalMins > 0) {
      remainMins = Math.max(0, shiftTotalMins - workedMins);
      progressPct = Math.min(100, Math.round((workedMins / shiftTotalMins) * 100));
    }
  }

  // Team summary
  const teamRecs = teamAtt || [];
  const activeCount = teamRecs.filter((r: any) => r.status === 'checked_in' || r.status === 'checkout_pending').length;
  const doneCount = teamRecs.filter((r: any) => r.status === 'checked_out').length;

  const fmtDur = (m: number) => `${Math.floor(m / 60)}s ${m % 60}dk`;
  const shiftIsOff = todayShift?.isOff;
  const leaveType = todayShift?.leaveType;
  const lc = LEAVE_COLORS[leaveType || ''] || '#ea580c';

  c.innerHTML = `<div class="fi">
    ${/* Today's Shift Card */
    todayShift ? `
    <div class="card" style="margin-bottom:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:6px"><div style="color:#f97316">${I.cal}</div><span style="color:rgba(255,255,255,.4);font-size:11px;font-weight:600">Bugünkü Vardiya</span></div>
        ${shiftIsOff 
          ? `<div class="bg" style="background:${lc}18;color:${lc};border:1px solid ${lc}30">${leaveType || 'İzin'}</div>`
          : `<span style="color:#f97316;font-size:15px;font-weight:700">${todayShift.start} – ${todayShift.end}</span>`}
      </div>
      ${!shiftIsOff && shiftTotalMins > 0 ? `
      <div style="margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="color:rgba(255,255,255,.3);font-size:10px">Çalışılan: ${fmtDur(workedMins)}</span>
          <span style="color:rgba(255,255,255,.3);font-size:10px">Kalan: ${fmtDur(remainMins)}</span>
        </div>
        <div style="height:6px;border-radius:4px;background:rgba(255,255,255,.06);overflow:hidden">
          <div style="height:100%;width:${progressPct}%;border-radius:4px;background:linear-gradient(90deg,#f97316,#ea580c);transition:width .5s"></div>
        </div>
        <p style="color:rgba(255,255,255,.15);font-size:9px;text-align:center;margin-top:3px">${progressPct}%</p>
      </div>` : ''}
    </div>` : ''}

    ${ /* Team Summary */ ''}
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <div class="stat-card" style="flex:1;border-color:rgba(34,197,94,.15)"><p style="color:rgba(255,255,255,.25);font-size:9px;margin:0 0 2px">Aktif</p><p style="color:#22c55e;font-size:20px;font-weight:800;margin:0">${activeCount}</p></div>
      <div class="stat-card" style="flex:1;border-color:rgba(249,115,22,.15)"><p style="color:rgba(255,255,255,.25);font-size:9px;margin:0 0 2px">Çıkış</p><p style="color:#fb923c;font-size:20px;font-weight:800;margin:0">${doneCount}</p></div>
      <div class="stat-card" style="flex:1;border-color:rgba(255,255,255,.08)"><p style="color:rgba(255,255,255,.25);font-size:9px;margin:0 0 2px">Toplam</p><p style="color:rgba(255,255,255,.5);font-size:20px;font-weight:800;margin:0">${teamRecs.length}</p></div>
    </div>

    ${isPending ? `
    <div class="card card-pending" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:8px;height:8px;border-radius:50%;background:#f59e0b;animation:pulse 1.5s infinite"></div><span style="color:#f59e0b;font-size:12px;font-weight:600">Çıkış Onayı Bekleniyor</span></div>
      <p style="color:rgba(255,255,255,.35);font-size:11px;margin:0 0 10px">PC'de çıkış QR kodu gösterildi. Okutmak için butona basın.</p>
      <button id="scan-co" class="btn btn-d">${I.cam} Çıkış QR Okut</button>
      <button id="cancel-co2" class="btn btn-g" style="margin-top:6px;font-size:13px">İptal Et</button>
    </div>` : isCheckedOut ? `
    <div class="card" style="margin-bottom:10px;border-color:rgba(239,68,68,.2);background:rgba(239,68,68,.04)">
      <div style="display:flex;align-items:center;gap:6px"><div style="color:#ef4444">${I.ok}</div><span style="color:#ef4444;font-size:12px;font-weight:600">Mesai Tamamlandı</span></div>
    </div>` : `
    <button id="co-btn" class="btn btn-d" style="margin-bottom:10px">${I.out} İşten Çıkış Yap</button>`}
  </div>`;

  if (isPending) {
    document.getElementById('scan-co')?.addEventListener('click', () => showScanner('checkout'));
    document.getElementById('cancel-co2')?.addEventListener('click', async () => {
      if (!currentAttendance) return;
      await supabase.from('attendance').update({ status: 'checked_in', checkout_token: null }).eq('id', currentAttendance.id);
      currentAttendance.status = 'checked_in'; if (currentUser) saveSession(currentUser, currentAttendance); showDashboard();
    });
  } else if (!isCheckedOut) {
    document.getElementById('co-btn')?.addEventListener('click', async () => {
      if (!currentUser || !currentAttendance) return;
      // Önce kamerayı hemen aç, DB'yi arka planda yap
      const tk = `OUT-${currentUser.id}-${Date.now()}-${Math.random().toString(36).substring(2,8)}`;
      showScanner('checkout');
      try {
        const { error, data } = await supabase.from('attendance').update({ status: 'checkout_pending', checkout_token: tk }).eq('id', currentAttendance.id).eq('status', 'checked_in').select();
        if (error) { showError(`Çıkış talebi gönderilemedi: ${error.message}`); return; }
        if (!data || data.length === 0) { showError(`Kayıt bulunamadı. ID: ${currentAttendance.id}, Status: ${currentAttendance.status}`); return; }
        currentAttendance.status = 'checkout_pending'; currentAttendance.checkout_token = tk;
        if (currentUser) saveSession(currentUser, currentAttendance);
      } catch (e: any) {
        showError('İnternet bağlantısı yok. Çıkış yapabilmek için internet gerekli.');
      }
    });
  }
}

// ── Team Tab ──
async function renderTeam(c: HTMLElement) {
  if (!currentUser) return;
  c.innerHTML = `<div style="text-align:center;padding:20px"><div style="width:28px;height:28px;margin:0 auto;border:2px solid rgba(249,115,22,.3);border-top-color:#fb923c;border-radius:50%;animation:spin 1s linear infinite"></div></div>`;
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
    c.innerHTML = `<div class="fi" style="text-align:center;padding:24px"><p style="color:rgba(255,255,255,.35);font-size:13px">İnternet bağlantısı yok.<br>Ekip bilgileri yüklenemedi.</p></div>`;
    return;
  }
  const recs = att || []; const all = (pers || []).filter((p: any) => p.role !== 'genel_mudur');

  // Build shift map: personnel_id → today's shift
  const shiftMap = new Map<string, WeekDay>();
  const seenIds = new Set<string>();
  for (const s of (shifts || [])) {
    if (seenIds.has(s.personnel_id)) continue; // Only take the most recent shift
    seenIds.add(s.personnel_id);
    try {
      const sched = typeof s.week_schedule === 'string' ? JSON.parse(s.week_schedule) : s.week_schedule;
      const raw = sched?.[dayKey];
      if (raw) shiftMap.set(s.personnel_id, { start: raw.startTime || raw.start, end: raw.endTime || raw.end, isOff: raw.isOff, leaveType: raw.leaveType });
    } catch {}
  }

  // Sort: active first, then checked out, then not present
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

  c.innerHTML = `<div class="fi">
    <h3 style="color:rgba(255,255,255,.25);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px">Ekibim — ${KASA_NAMES[currentUser.kasaId]||''}</h3>
    ${sorted.map((p: any, i: number) => {
      const a = recs.find((r: any) => r.personnel_id === p.id);
      const on = a && (a.status === 'checked_in' || a.status === 'checkout_pending');
      const out = a && a.status === 'checked_out';
      const cin = a?.check_in ? new Date(a.check_in).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '';
      const cout = a?.check_out ? new Date(a.check_out).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '';
      const cl = COLORS[i%COLORS.length]; const ini = p.fullName.split(' ').map((n:string)=>n[0]).join('').substring(0,2);
      const me = p.id === currentUser!.id;
      const shift = shiftMap.get(p.id);
      const isOff = shift?.isOff;
      const leaveLbl = shift?.leaveType || 'İzin';
      const lClr = LEAVE_COLORS[leaveLbl] || '#ea580c';

      // Late check: if checked in after shift start
      let isLate = false;
      if (shift && shift.start && !isOff && cin) {
        const [sh, sm] = shift.start.split(':').map(Number);
        const [ch, cm] = cin.split(':').map(Number);
        if (ch * 60 + cm > sh * 60 + sm + 5) isLate = true; // 5 min tolerance
      }

      return `<div class="card" style="margin-bottom:6px;${me?'border-color:rgba(249,115,22,.3)':''}">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:${cl}20;border:2px solid ${cl}40;display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0">
            <span style="color:${cl};font-size:13px;font-weight:700">${ini}</span>
            ${on?`<div style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid #09090b"></div>`:''}
          </div>
          <div style="flex:1;min-width:0">
            <p style="color:#fff;font-size:13px;font-weight:600;margin:0">${p.fullName}${me?' <span style="color:#fb923c;font-size:9px">(Sen)</span>':''}</p>
            <div style="display:flex;align-items:center;gap:6px;margin-top:2px;flex-wrap:wrap">
              <span style="color:rgba(255,255,255,.25);font-size:10px">${on?`Giriş: ${cin}`:out?`${cin} → ${cout}`:'Henüz giriş yapmadı'}</span>
              ${isLate ? `<span style="color:#ef4444;font-size:9px;font-weight:600">● Geç</span>` : ''}
            </div>
            ${shift ? `<div style="margin-top:3px">
              ${isOff 
                ? `<span style="color:${lClr};font-size:9px;font-weight:600;background:${lClr}15;padding:1px 6px;border-radius:6px;border:1px solid ${lClr}25">${leaveLbl}</span>`
                : `<span style="color:rgba(255,255,255,.2);font-size:9px;background:rgba(255,255,255,.03);padding:1px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.06)">${I.clk} ${shift.start} – ${shift.end}</span>`}
            </div>` : ''}
          </div>
          <div class="bg" style="background:${on?'rgba(34,197,94,.12)':out?'rgba(249,115,22,.12)':'rgba(255,255,255,.04)'};color:${on?'#22c55e':out?'#fb923c':'rgba(255,255,255,.25)'}">${on?'Aktif':out?'Çıkış':'Yok'}</div>
        </div>
      </div>`;
    }).join('')}
    ${all.length===0?'<p style="color:rgba(255,255,255,.25);font-size:12px;text-align:center;padding:16px">Personel bulunamadı</p>':''}
  </div>`;
}

// ── Schedule Tab ──
async function renderSchedule(c: HTMLElement) {
  if (!currentUser) return;
  c.innerHTML = `<div style="text-align:center;padding:20px"><div style="width:28px;height:28px;margin:0 auto;border:2px solid rgba(249,115,22,.3);border-top-color:#fb923c;border-radius:50%;animation:spin 1s linear infinite"></div></div>`;
  const today = new Date(); const wa = new Date(today); wa.setDate(wa.getDate()-6);
  let shiftData: any[] | null = null;
  let attData: any[] | null = null;
  try {
    const [shiftRes, attRes] = await Promise.all([
      supabase.from('shifts').select('*').eq('personnel_id', currentUser.id).limit(1),
      supabase.from('attendance').select('*').eq('personnel_id', currentUser.id).gte('date', wa.toISOString().slice(0,10)).order('date', { ascending: false })
    ]);
    shiftData = shiftRes.data; attData = attRes.data;
  } catch {
    c.innerHTML = `<div class="fi" style="text-align:center;padding:24px"><p style="color:rgba(255,255,255,.35);font-size:13px">İnternet bağlantısı yok.<br>Mesai bilgileri yüklenemedi.</p></div>`;
    return;
  }
  const recs = attData || []; const shift = shiftData?.[0];
  let ws: Record<string, WeekDay> = {};
  if (shift?.week_schedule) { try { ws = typeof shift.week_schedule === 'string' ? JSON.parse(shift.week_schedule) : shift.week_schedule; } catch {} }

  c.innerHTML = `<div class="fi">
    ${Object.keys(ws).length>0?`<h3 style="color:rgba(255,255,255,.25);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px">Mesai Programı</h3>
    ${ ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].filter(d => ws[d] != null).map((day) => {
      const info = ws[day] as any;
      const lc = LEAVE_COLORS[info.leaveType||'']||'#ea580c';
      const dayLabel = DAY_KEY_TO_TR[day] || day;
      const shiftStart = info.startTime || info.start || '';
      const shiftEnd = info.endTime || info.end || '';
      return `<div class="card" style="margin-bottom:4px;padding:10px"><div style="display:flex;align-items:center;justify-content:space-between">
        <span style="color:#fff;font-size:12px;font-weight:600">${dayLabel}</span>
        ${info.isOff?`<span class="bg" style="background:${lc}18;color:${lc}">${info.leaveType||'İzin'}</span>`
        :`<span style="color:rgba(255,255,255,.4);font-size:11px">${shiftStart} - ${shiftEnd}</span>`}
      </div></div>`;
    }).join('')}`:`<div class="card" style="margin-bottom:8px;padding:16px;text-align:center"><p style="color:rgba(255,255,255,.3);font-size:12px;margin:0">Mesai programınız henüz tanımlanmamış.</p><p style="color:rgba(255,255,255,.15);font-size:10px;margin:4px 0 0">Yöneticinizden vardiya planı oluşturmasını isteyin.</p></div>`}
    <h3 style="color:rgba(255,255,255,.25);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:12px 0 8px">Son Yoklamalar</h3>
    ${recs.length>0?recs.map((r:any)=>{
      const cin=r.check_in?new Date(r.check_in).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}):'--:--';
      const cout=r.check_out?new Date(r.check_out).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}):'--:--';
      const dateObj = new Date(r.date + 'T00:00:00');
      const dateStr = dateObj.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const dayStr = DAYS[dateObj.getDay()];
      const durationMin = r.check_in && r.check_out ? Math.floor((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 60000) : 0;
      const durH = Math.floor(durationMin / 60);
      const durM = durationMin % 60;
      const statusClr = r.status === 'checked_in' ? '#22c55e' : r.status === 'checked_out' ? '#f97316' : '#f59e0b';
      const statusLbl = r.status === 'checked_in' ? 'Aktif' : r.status === 'checked_out' ? 'Tamamlandı' : 'Bekliyor';
      return `<div class="card" style="margin-bottom:4px;padding:12px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="color:#fff;font-size:12px;font-weight:600">${dateStr}</span>
          <span style="color:rgba(255,255,255,.2);font-size:10px">${dayStr}</span>
        </div>
        <div class="bg" style="background:${statusClr}15;color:${statusClr};border:1px solid ${statusClr}25;font-size:9px">${statusLbl}</div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="display:flex;align-items:center;gap:4px">${I.clk}<span style="color:#f97316;font-size:12px;font-weight:600">${cin}</span></div>
          <span style="color:rgba(255,255,255,.1)">→</span>
          <div style="display:flex;align-items:center;gap:4px">${I.clk}<span style="color:#ef4444;font-size:12px;font-weight:600">${cout}</span></div>
        </div>
        ${durationMin > 0 ? `<span style="color:#22c55e;font-size:10px;font-weight:600;background:rgba(34,197,94,.1);padding:2px 8px;border-radius:8px;border:1px solid rgba(34,197,94,.15)">${durH}s ${durM}dk</span>` : ''}
      </div></div>`;
    }).join(''):'<p style="color:rgba(255,255,255,.2);font-size:11px;text-align:center;padding:12px">Kayıt yok</p>'}
  </div>`;
}

// ── Init ──
renderApp();