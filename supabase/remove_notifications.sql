-- Remove os lembretes por notificação push (desfaz o antigo
-- supabase/notifications.sql): agendamento, função, gatilho, tabela de
-- inscrições e as colunas de lembrete dos compromissos. Os compromissos em
-- si não são afetados. Execute no SQL Editor do Supabase. É seguro rodar
-- de novo.

-- agendamento (só existe se o pg_cron foi ativado e o job foi criado)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'send-reminders';
  end if;
end;
$$;

drop function if exists claim_due_reminders(text);

drop trigger if exists calendar_events_reset_reminder on calendar_events;
drop function if exists reset_event_reminder();

drop table if exists push_subscriptions;

alter table calendar_events drop column if exists reminder_minutes;
alter table calendar_events drop column if exists reminded_at;
