-- グリーティングカードの保存先（Supabase の SQL Editor で 1回だけ実行）
create table if not exists public.card_kv (
  k text primary key,
  v jsonb not null,
  updated_at timestamptz not null default now()
);
-- RLS を有効にして、ポリシーは作らない = ブラウザ(anon キー)からは読み書き不可。
-- サーバー(service_role キー)だけがアクセスできる。
alter table public.card_kv enable row level security;
