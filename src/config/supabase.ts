import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  } catch (e) {
    console.warn('Supabase bağlantısı kurulamadı, offline modda çalışılıyor:', e);
    supabase = null as any;
  }
} else {
  console.warn('Supabase config eksik, offline modda çalışılıyor');
  supabase = null as any;
}

export { supabase };
