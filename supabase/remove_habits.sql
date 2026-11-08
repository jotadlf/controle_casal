-- Remove permanentemente os hábitos e os dias marcados (a aba "Hábitos"
-- saiu do app). Execute no SQL Editor do Supabase depois de confirmar que
-- deseja apagar todos os hábitos — se quiser guardar o histórico, exporte
-- as tabelas habits e habit_logs antes. É seguro rodar de novo.

drop table if exists habit_logs;
drop table if exists habits;

notify pgrst, 'reload schema';
