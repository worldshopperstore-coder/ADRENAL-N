import { supabase } from '@/config/supabase';

export interface KasaMessage {
  id: string;
  kasaId: string;
  senderName: string;
  message: string;
  createdAt: string;
  reactions: Record<string, string[]>; // emoji -> [senderName, ...]
}

const TABLE = 'kasa_messages';

/** Son N mesajı çek (tüm kasalar ortak kanal) */
export async function loadKasaMessages(limit = 100): Promise<KasaMessage[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('createdAt', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (data || []) as KasaMessage[];
  } catch (err) {
    console.error('[KasaChat] Mesajlar yüklenemedi:', err);
    return [];
  }
}

/** Yeni mesaj gönder */
export async function sendKasaMessage(kasaId: string, senderName: string, message: string): Promise<boolean> {
  if (!supabase || !message.trim()) return false;
  try {
    const { error } = await supabase.from(TABLE).insert([{
      kasaId,
      senderName,
      message: message.trim(),
      reactions: {},
    }]);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[KasaChat] Mesaj gönderilemedi:', err);
    return false;
  }
}

/** Mesaja emoji tepkisi ekle/kaldır (toggle) */
export async function toggleKasaMessageReaction(
  messageId: string,
  emoji: string,
  senderName: string,
  currentReactions: Record<string, string[]>,
): Promise<boolean> {
  if (!supabase) return false;
  try {
    const reactions = { ...currentReactions };
    const list = new Set(reactions[emoji] || []);
    if (list.has(senderName)) {
      list.delete(senderName);
    } else {
      list.add(senderName);
    }
    if (list.size > 0) {
      reactions[emoji] = Array.from(list);
    } else {
      delete reactions[emoji];
    }

    const { error } = await supabase
      .from(TABLE)
      .update({ reactions })
      .eq('id', messageId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[KasaChat] Tepki güncellenemedi:', err);
    return false;
  }
}

/** Canlı mesaj aboneliği — yeni mesaj/güncelleme geldiğinde callback tetiklenir */
export function subscribeKasaMessages(callback: (messages: KasaMessage[]) => void): () => void {
  if (!supabase) return () => {};

  const refresh = async () => {
    const messages = await loadKasaMessages();
    callback(messages);
  };

  const channel = supabase
    .channel('kasa-messages-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE },
      refresh,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
