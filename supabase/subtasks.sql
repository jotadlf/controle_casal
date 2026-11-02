-- Microtarefas (checklist dentro de uma tarefa da aba "Tarefas").
-- Rode este arquivo inteiro no SQL Editor do Supabase ANTES de publicar o
-- frontend que usa esta tabela. É seguro rodar de novo.

create table if not exists repair_subtasks (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references repair_requests(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists repair_subtasks_request_id_idx on repair_subtasks (request_id);

alter table repair_subtasks enable row level security;

drop policy if exists "allow all - repair_subtasks" on repair_subtasks;
create policy "allow all - repair_subtasks" on repair_subtasks
  for all using (true) with check (true);

notify pgrst, 'reload schema';
