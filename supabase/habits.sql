-- Hábitos (aba "Hábitos"): cada hábito pertence a uma pessoa e cada dia
-- marcado é uma linha em habit_logs.
-- Rode este arquivo inteiro no SQL Editor do Supabase ANTES de publicar o
-- frontend que usa estas tabelas. É seguro rodar de novo.

create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  name text not null,
  color text not null,
  -- diario: uma vez por dia; varias_vezes: target vezes por dia; semanal: target dias por semana.
  frequency text not null default 'diario' check (frequency in ('diario', 'varias_vezes', 'semanal')),
  target integer not null default 1 check (target >= 1),
  created_at timestamptz not null default now()
);

create index if not exists habits_owner_idx on habits (owner);

create table if not exists habit_logs (
  habit_id uuid not null references habits(id) on delete cascade,
  day date not null,
  -- Quantas vezes foi feito no dia (só passa de 1 em varias_vezes).
  count integer not null default 1 check (count >= 1),
  primary key (habit_id, day)
);

alter table habits enable row level security;
alter table habit_logs enable row level security;

drop policy if exists "allow all - habits" on habits;
create policy "allow all - habits" on habits
  for all using (true) with check (true);

drop policy if exists "allow all - habit_logs" on habit_logs;
create policy "allow all - habit_logs" on habit_logs
  for all using (true) with check (true);

notify pgrst, 'reload schema';
