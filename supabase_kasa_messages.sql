-- Kasa Sohbeti tablosu — Supabase SQL Editor'de çalıştırın
create table if not exists public.kasa_messages (
  id uuid primary key default gen_random_uuid(),
  "kasaId" text not null,
  "senderName" text not null,
  message text not null,
  reactions jsonb not null default '{}'::jsonb,
  "createdAt" timestamptz not null default now()
);

create index if not exists kasa_messages_created_idx on public.kasa_messages ("createdAt");

alter table public.kasa_messages enable row level security;

-- Herkes (anon) okuyup yazabilsin — diğer tablolarla aynı erişim modeli
create policy "kasa_messages_select" on public.kasa_messages for select using (true);
create policy "kasa_messages_insert" on public.kasa_messages for insert with check (true);
create policy "kasa_messages_update" on public.kasa_messages for update using (true);

-- Realtime yayınına ekle
alter publication supabase_realtime add table public.kasa_messages;
