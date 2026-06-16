-- Knowledge Vault — Supabase 스키마
-- Supabase 대시보드 > SQL Editor에 붙여넣고 실행하세요

create table if not exists vault_memos (
  id          uuid primary key default gen_random_uuid(),
  user_name   text not null,
  note_title  text not null,
  memo        text default '',
  updated_at  timestamptz default now(),
  unique (user_name, note_title)
);

-- 개인용이라 RLS 없이 anon 키로 읽기/쓰기 허용
alter table vault_memos enable row level security;
create policy "anon all" on vault_memos for all using (true) with check (true);
