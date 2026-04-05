import { useState, useEffect, useRef } from 'react';
import { Trash2, Download, Search, AlertTriangle, Info, XCircle, ChevronDown } from 'lucide-react';

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  source?: string;
}

const LEVEL_CONFIG = {
  log:   { color: 'text-gray-300',  bg: 'bg-gray-800/40',   icon: Info,           label: 'LOG' },
  info:  { color: 'text-blue-300',  bg: 'bg-blue-900/20',   icon: Info,           label: 'INFO' },
  warn:  { color: 'text-yellow-300', bg: 'bg-yellow-900/20', icon: AlertTriangle,  label: 'WARN' },
  error: { color: 'text-red-300',   bg: 'bg-red-900/20',    icon: XCircle,        label: 'ERROR' },
};

const MAX_ENTRIES = 500;
const STORAGE_KEY = 'adrenal_debug_logs';

function loadLogs(): LogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLogs(logs: LogEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-MAX_ENTRIES)));
  } catch { /* storage full — ignore */ }
}

let logIdCounter = Date.now();
let interceptInstalled = false;
let logBuffer: LogEntry[] = loadLogs();
const listeners = new Set<() => void>();

function addLogEntry(level: LogEntry['level'], args: unknown[]) {
  const message = args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');

  const entry: LogEntry = {
    id: logIdCounter++,
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_ENTRIES) logBuffer = logBuffer.slice(-MAX_ENTRIES);
  saveLogs(logBuffer);
  listeners.forEach(fn => fn());
}

export function installConsoleIntercept() {
  if (interceptInstalled) return;
  interceptInstalled = true;

  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  const origInfo = console.info;

  console.log   = (...args: unknown[]) => { origLog(...args);   addLogEntry('log',   args); };
  console.warn  = (...args: unknown[]) => { origWarn(...args);  addLogEntry('warn',  args); };
  console.error = (...args: unknown[]) => { origError(...args); addLogEntry('error', args); };
  console.info  = (...args: unknown[]) => { origInfo(...args);  addLogEntry('info',  args); };

  // Global error handler
  window.addEventListener('error', (e) => {
    addLogEntry('error', [`[UNCAUGHT] ${e.message} at ${e.filename}:${e.lineno}`]);
  });

  window.addEventListener('unhandledrejection', (e) => {
    addLogEntry('error', [`[PROMISE] ${e.reason}`]);
  });
}

export default function DebugLogTab() {
  const [logs, setLogs] = useState<LogEntry[]>(logBuffer);
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setLogs([...logBuffer]);
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(l => {
    if (levelFilter !== 'all' && l.level !== levelFilter) return false;
    if (filter && !l.message.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const clearLogs = () => {
    logBuffer = [];
    saveLogs([]);
    setLogs([]);
  };

  const exportLogs = () => {
    const text = filteredLogs.map(l =>
      `[${new Date(l.timestamp).toLocaleTimeString('tr-TR')}] [${l.level.toUpperCase()}] ${l.message}`
    ).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-log-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const errorCount = logs.filter(l => l.level === 'error').length;
  const warnCount = logs.filter(l => l.level === 'warn').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Debug Log</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {logs.length} kayıt
            {errorCount > 0 && <span className="text-red-400 ml-2">· {errorCount} hata</span>}
            {warnCount > 0 && <span className="text-yellow-400 ml-2">· {warnCount} uyarı</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportLogs} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs text-gray-300 transition-colors">
            <Download className="w-3.5 h-3.5" /> Dışa Aktar
          </button>
          <button onClick={clearLogs} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 border border-red-800/40 rounded-lg text-xs text-red-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Temizle
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="Ara..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-gray-900/60 border border-gray-700/50 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-indigo-500/50"
          />
        </div>
        <div className="relative">
          <select
            value={levelFilter}
            onChange={e => setLevelFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 bg-gray-900/60 border border-gray-700/50 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-indigo-500/50"
          >
            <option value="all">Tümü</option>
            <option value="log">Log</option>
            <option value="info">Info</option>
            <option value="warn">Uyarı</option>
            <option value="error">Hata</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="rounded border-gray-600" />
          Otomatik kaydır
        </label>
      </div>

      {/* Log entries */}
      <div ref={scrollRef} className="h-[60vh] overflow-y-auto bg-gray-950/50 border border-gray-800/50 rounded-xl p-1 font-mono text-xs space-y-0.5">
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">Kayıt yok</div>
        ) : (
          filteredLogs.map(entry => {
            const cfg = LEVEL_CONFIG[entry.level];
            const Icon = cfg.icon;
            const time = new Date(entry.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return (
              <div key={entry.id} className={`flex items-start gap-2 px-2 py-1 rounded ${cfg.bg} ${cfg.color}`}>
                <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-60" />
                <span className="text-gray-500 flex-shrink-0">{time}</span>
                <span className="break-all">{entry.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
