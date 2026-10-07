-- Remove permanentemente as contas recorrentes, seus pagamentos e os
-- registros de manutenção do carro.
-- Execute no SQL Editor do Supabase depois de confirmar que deseja apagar
-- todos os dados dessas funcionalidades.

drop table if exists bill_payments;
drop table if exists bills;
drop table if exists car_maintenance;
