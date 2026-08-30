-- Schema de migração para Supabase
-- Execute este SQL no editor SQL do Supabase para adicionar os campos usados pelo frontend.

alter table shopping_purchases
  add column if not exists price numeric(10,2),
  add column if not exists quantity integer not null default 1,
  add column if not exists unit text;

-- Caso já exista algum dado antigo e você queira garantir consistência,
-- mantenha quantity como 1 quando não for informado:
update shopping_purchases
set quantity = 1
where quantity is null;

-- Opcional: ajusta a política de uso se quiser permitir valores nulos no preço/unidade
-- (não é obrigatório, mas recomendado para compatibilidade com dados antigos).
alter table shopping_purchases
  alter column price drop not null,
  alter column unit drop not null;

-- Tabela de eventos do calendário (consultas, compromissos etc).
create table if not exists calendar_events (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  event_date date not null,
  event_time time,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists calendar_events_event_date_idx on calendar_events (event_date);

-- Horário de término (opcional): quando preenchido, o compromisso "cobre"
-- o intervalo entre event_time e event_end_time na agenda do dia.
alter table calendar_events
  add column if not exists event_end_time time;

-- Recorrência de contas: uma conta pode se repetir indefinidamente (ex:
-- aluguel) ou ser parcelada por uma quantidade fixa de meses (ex:
-- financiamento em 12x). start_month marca o mês de referência da 1ª
-- parcela/ocorrência e é usado para calcular em qual parcela a conta está.
alter table bills
  add column if not exists recurrence_type text not null default 'recurring',
  add column if not exists installments_total integer,
  add column if not exists start_month date not null default date_trunc('month', now())::date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bills_recurrence_type_check'
  ) then
    alter table bills
      add constraint bills_recurrence_type_check
      check (recurrence_type in ('recurring', 'installment'));
  end if;
end $$;
