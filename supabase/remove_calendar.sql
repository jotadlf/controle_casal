-- Remove permanentemente os compromissos do calendário (o calendário saiu
-- do app). Execute no SQL Editor do Supabase depois de confirmar que deseja
-- apagar todos os compromissos — se for levá-los pra outro sistema, exporte
-- a tabela calendar_events antes. É seguro rodar de novo.

drop table if exists calendar_events;
