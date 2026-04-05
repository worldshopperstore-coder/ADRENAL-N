import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { installConsoleIntercept } from './components/admin/DebugLogTab'
import './styles/globals.css'

installConsoleIntercept();

// ── Production Security & Professional Branding ──
if (import.meta.env.PROD) {
  // Professional console branding
  const brandStyle = 'color:#f97316;font-size:14px;font-weight:bold;text-shadow:1px 1px 2px rgba(0,0,0,.3)';
  const warnStyle = 'color:#ef4444;font-size:12px;font-weight:bold';
  const infoStyle = 'color:#6b7280;font-size:10px';
  console.log('%c\u26a1 Adrenalin D\u00fcnyas\u0131\u00ae Kurumsal Y\u00f6netim Sistemi', brandStyle);
  console.log('%c\u26d4 Bu taray\u0131c\u0131 \u00f6zelli\u011fi geli\u015ftiriciler i\u00e7indir.', warnStyle);
  console.log('%cBu konsolu kullanman\u0131z\u0131 isteyen biri olduysa, bu bir doland\u0131r\u0131c\u0131l\u0131k giri\u015fimidir.', warnStyle);
  console.log('%cv3.0.0 \u2022 Developed by Adrenalin Engineering', infoStyle);

  // Silence all further console output in production
  const noop = () => {};
  console.log = noop;
  console.debug = noop;
  console.info = noop;
  console.warn = noop;
  console.trace = noop;

  // Devtools deterrent — disable right-click context menu
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // Disable common devtools shortcuts
  document.addEventListener('keydown', (e) => {
    // F12
    if (e.key === 'F12') { e.preventDefault(); return; }
    // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C
    if (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key.toUpperCase())) { e.preventDefault(); return; }
    // Ctrl+U (view source)
    if (e.ctrlKey && e.key.toUpperCase() === 'U') { e.preventDefault(); return; }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
