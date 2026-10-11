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

-- Simplificação da lista de compras: removidos preço/quantidade/unidade e
-- sessão de compras (mercado + total + criação automática de conta), já
-- que o frontend não usa mais nada disso. Remove também on_list, campo
-- vestigial que não é mais referenciado em lugar nenhum.
-- ATENÇÃO: isso apaga permanentemente qualquer preço/quantidade/unidade e
-- sessão de compras já registrados.
alter table shopping_purchases
  drop column if exists session_id,
  drop column if exists price,
  drop column if exists quantity,
  drop column if exists unit;

drop table if exists shopping_sessions;

alter table shopping_items
  drop column if exists on_list;

-- Filmes (aba "Filmes"): a tabela "movies" e a lista do Top 250 do IMDB
-- ficam em supabase/movies.sql. Rode aquele arquivo também.
