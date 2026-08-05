-- Schema de migração para Supabase
-- Execute este SQL no editor SQL do Supabase para adicionar os campos usados pelo frontend.

alter table shopping_purchases
  add column price numeric(10,2),
  add column quantity integer not null default 1,
  add column unit text;

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
