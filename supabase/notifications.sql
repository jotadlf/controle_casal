-- Notificações (lembretes de compromissos via Web Push, Android).
-- Rode este arquivo inteiro no SQL Editor do Supabase ANTES de publicar a
-- versão do app que tem o campo "Lembrar". É seguro rodar de novo.
-- O agendamento (pg_cron) fica no final, com instruções.

-- Quantos minutos antes do início o dono do compromisso é avisado.
-- null = sem lembrete. Compromissos já existentes ficam com 15 min.
-- Só vale pra compromissos com horário (os de dia todo não avisam).
alter table calendar_events
  add column if not exists reminder_minutes integer default 15;

-- Quando o lembrete foi enviado (null = ainda não enviado). Volta pra null
-- quando a data, o horário ou a antecedência mudam, pra avisar de novo.
alter table calendar_events
  add column if not exists reminded_at timestamptz;

create or replace function reset_event_reminder()
returns trigger
language plpgsql
as $$
begin
  if new.event_date is distinct from old.event_date
     or new.event_time is distinct from old.event_time
     or new.reminder_minutes is distinct from old.reminder_minutes then
    new.reminded_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists calendar_events_reset_reminder on calendar_events;
create trigger calendar_events_reset_reminder
  before update on calendar_events
  for each row execute function reset_event_reminder();

-- Inscrições de push: uma por aparelho/navegador, ligada ao nome de quem
-- está usando o app nele (Jairon/Bruna).
create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  user_name text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_name);

-- Pega os lembretes que já devem ser enviados e marca como enviados, numa
-- operação só (se o agendador rodar duas vezes, ninguém recebe repetido).
-- Datas/horários do app são horário de Brasília. Lembretes atrasados mais
-- de 30 min (ex.: compromisso criado já em cima da hora) são descartados.
create or replace function claim_due_reminders(tz text default 'America/Sao_Paulo')
returns setof calendar_events
language sql
as $$
  update calendar_events
     set reminded_at = now()
   where reminded_at is null
     and reminder_minutes is not null
     and event_time is not null
     and ((event_date + event_time) at time zone tz) - make_interval(mins => reminder_minutes) <= now()
     and ((event_date + event_time) at time zone tz) - make_interval(mins => reminder_minutes) > now() - interval '30 minutes'
  returning *;
$$;

-- só a Edge Function (service role) pode chamar
revoke execute on function claim_due_reminders(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Agendamento: chama a Edge Function "send-reminders" a cada minuto.
-- 1. Em Database → Extensions, ative "pg_cron" e "pg_net".
-- 2. Troque SEU-PROJETO e SUA-ANON-KEY abaixo (os mesmos do .env) e rode
--    só este trecho.
--
-- select cron.schedule(
--   'send-reminders',
--   '* * * * *',
--   $$
--   select net.http_post(
--     url := 'https://SEU-PROJETO.supabase.co/functions/v1/send-reminders',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer SUA-ANON-KEY',
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
--
-- Pra parar: select cron.unschedule('send-reminders');
