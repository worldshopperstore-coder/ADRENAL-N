import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { installConsoleIntercept } from './components/admin/DebugLogTab'
import './styles/globals.css'

installConsoleIntercept();

// ── Production Security ──
if (import.meta.env.PROD) {
  // Devtools deterrent — disable right-click context menu
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // Disable common devtools shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F12') { e.preventDefault(); return; }
    if (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key.toUpperCase())) { e.preventDefault(); return; }
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
