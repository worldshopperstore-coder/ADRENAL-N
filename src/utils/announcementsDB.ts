import { supabase } from '@/config/supabase';

export interface Announcement {
  id: string;
  message: string;
  created_by: string;
  created_at: string;
  is_active: boolean;
}

export async function getActiveAnnouncements(): Promise<Announcement[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

export async function addAnnouncement(message: string, createdBy: string): Promise<{ error: any }> {
  if (!supabase) return { error: 'Supabase bağlantısı yok' };
  const { error } = await supabase
    .from('announcements')
    .insert({ message, created_by: createdBy, is_active: true });
  return { error };
}

export async function deactivateAnnouncement(id: string): Promise<{ error: any }> {
  if (!supabase) return { error: 'Supabase bağlantısı yok' };
  const { error } = await supabase
    .from('announcements')
    .update({ is_active: false })
    .eq('id', id);
  return { error };
}
