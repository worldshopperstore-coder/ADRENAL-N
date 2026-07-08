import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { loadKasaMessages, sendKasaMessage, toggleKasaMessageReaction, subscribeKasaMessages, type KasaMessage } from '@/utils/kasaChat';
import { playNotifySound } from '@/utils/notifySound';

const QUICK_EMOJIS = ['👍', '✅', '🙏', '❤️'];

const KASA_LABELS: Record<string, string> = {
  wildpark: 'WildPark',
  sinema: 'XD Sinema',
  face2face: 'Face2Face',
};

interface Props {
  kasaId: string;
  senderName: string;
}

export default function KasaChatWidget({ kasaId, senderName }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<KasaMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);
  const openRef = useRef(open);
  openRef.current = open;

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  }, []);

  useEffect(() => {
    loadKasaMessages().then(msgs => {
      setMessages(msgs);
      isFirstLoad.current = false;
      scrollToBottom();
    });

    const unsubscribe = subscribeKasaMessages((msgs) => {
      setMessages(prev => {
        const isNew = msgs.length > prev.length;
        const lastMsg = msgs[msgs.length - 1];
        const isFromOther = lastMsg && lastMsg.senderName !== senderName;
        if (isNew && isFromOther && !isFirstLoad.current) {
          playNotifySound();
          if (!openRef.current) setUnread(u => u + 1);
        }
        return msgs;
      });
      scrollToBottom();
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) {
      setUnread(0);
      scrollToBottom();
    }
  }, [open, scrollToBottom]);

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    const ok = await sendKasaMessage(kasaId, senderName, draft);
    if (ok) setDraft('');
    setSending(false);
  };

  const handleReact = async (msg: KasaMessage, emoji: string) => {
    await toggleKasaMessageReaction(msg.id, emoji, senderName, msg.reactions || {});
  };

  return (
    <>
      {/* Yüzen buton */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-orange-600 to-orange-500 shadow-lg shadow-orange-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        title="Kasa Sohbeti"
      >
        {open ? <X className="w-6 h-6 text-white" /> : <MessageCircle className="w-6 h-6 text-white" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center border-2 border-gray-950">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-40 w-[340px] max-w-[92vw] h-[480px] max-h-[70vh] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/80">
            <div>
              <p className="text-sm font-bold text-white">Kasa Sohbeti</p>
              <p className="text-[10px] text-gray-500">WildPark · XD Sinema · Face2Face</p>
            </div>
            <span className="text-[10px] px-2 py-1 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30 font-semibold">
              {KASA_LABELS[kasaId] || kasaId}
            </span>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
            {messages.length === 0 && (
              <p className="text-center text-xs text-gray-600 mt-8">Henüz mesaj yok</p>
            )}
            {messages.map(msg => {
              const isMine = msg.senderName === senderName;
              const time = new Date(msg.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
              const reactionEntries = Object.entries(msg.reactions || {}).filter(([, users]) => users.length > 0);
              return (
                <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${isMine ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-100'}`}>
                    {!isMine && <p className="text-[10px] font-bold text-orange-300 mb-0.5">{msg.senderName}</p>}
                    <p className="text-sm break-words">{msg.message}</p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 px-1">
                    <span className="text-[9px] text-gray-600">{time}</span>
                    {reactionEntries.map(([emoji, users]) => (
                      <button
                        key={emoji}
                        onClick={() => handleReact(msg, emoji)}
                        className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${
                          users.includes(senderName) ? 'bg-orange-500/20 border-orange-500/50' : 'bg-gray-800 border-gray-700'
                        }`}
                        title={users.join(', ')}
                      >
                        {emoji} {users.length}
                      </button>
                    ))}
                    <div className="flex gap-0.5 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      {QUICK_EMOJIS.map(e => (
                        <button
                          key={e}
                          onClick={() => handleReact(msg, e)}
                          className="text-[11px] w-5 h-5 flex items-center justify-center rounded hover:bg-gray-800"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-2.5 border-t border-gray-800 flex items-center gap-2">
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Mesaj yaz..."
              className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500"
            />
            <button
              onClick={handleSend}
              disabled={!draft.trim() || sending}
              className="w-10 h-10 flex-shrink-0 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-40 flex items-center justify-center transition-colors"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
