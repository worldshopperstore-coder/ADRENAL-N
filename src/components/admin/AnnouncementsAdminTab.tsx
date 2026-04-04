import { useState, useEffect } from 'react';
import { Megaphone, Trash2, Send, RefreshCw } from 'lucide-react';
import { getActiveAnnouncements, addAnnouncement, deactivateAnnouncement, type Announcement } from '@/utils/announcementsDB';
import { getUserSession } from '@/utils/session';

export default function AnnouncementsAdminTab() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const session = getUserSession();
  const createdBy: string = session?.personnel?.fullName ?? 'Admin';

  const load = async () => {
    setLoading(true);
    setAnnouncements(await getActiveAnnouncements());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    const { error } = await addAnnouncement(message.trim(), createdBy);
    setSending(false);
    if (error) {
      const msg = typeof error === 'string' ? error : (error as any)?.message ?? 'Bilinmeyen hata';
      const isTableMissing = msg.includes('does not exist') || msg.includes('relation');
      setStatusMsg({ ok: false, text: isTableMissing
        ? 'Supabase\'de \'announcements\' tablosu oluşturulmalı. SQL Editor\'den tabloyu oluşturun.'
        : 'Hata: ' + msg
      });
    } else {
      setMessage('');
      setStatusMsg({ ok: true, text: 'Duyuru yayınlandı!' });
      load();
    }
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleDelete = async (id: string) => {
    await deactivateAnnouncement(id);
    load();
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleString('tr-TR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center">
          <Megaphone className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Duyurular</h2>
          <p className="text-xs text-gray-500">Tüm personele anlık mesaj gönder</p>
        </div>
      </div>

      {/* Yeni duyuru yazma alanı */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4 shadow-boltify-card">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Send className="w-4 h-4 text-amber-400" />
          Yeni Duyuru Yaz
        </h3>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Tüm kasalardaki personele iletmek istediğiniz mesajı yazın..."
          rows={4}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500/50 resize-none"
        />
        <div className="flex items-center justify-between flex-wrap gap-2">
          {statusMsg ? (
            <span className={`text-xs font-medium ${statusMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
              {statusMsg.text}
            </span>
          ) : (
            <span className="text-xs text-gray-600">{message.length} karakter</span>
          )}
          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Gönderiliyor...' : 'Yayınla'}
          </button>
        </div>
      </div>

      {/* Aktif duyurular listesi */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Aktif Duyurular
          </h3>
          <button
            onClick={load}
            className="text-xs text-gray-500 hover:text-white flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Yenile
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-gray-500 text-sm">Yükleniyor...</div>
        ) : announcements.length === 0 ? (
          <div className="py-10 text-center text-gray-600 text-sm bg-gray-900 rounded-xl border border-gray-800">
            Şu an aktif duyuru yok.
          </div>
        ) : (
          <div className="space-y-2">
            {announcements.map(a => (
              <div
                key={a.id}
                className="bg-gray-900 border border-amber-500/20 rounded-xl p-4 flex items-start gap-4"
              >
                <Megaphone className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white leading-relaxed">{a.message}</p>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {a.created_by} · {fmtDate(a.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(a.id)}
                  title="Duyuruyu kaldır"
                  className="p-2 sm:p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
