-- Agrega columnas para distinguir entre donaciones por transferencia y Payku.
-- Correr UNA sola vez en: Supabase Dashboard → SQL Editor → New query.

alter table public.donations
  add column if not exists payment_method text default 'transferencia',
  add column if not exists payku_order_id text;

-- Las filas existentes (10 donaciones de San Rafael) se setean automáticamente
-- en 'transferencia' gracias al default. Verificamos:
update public.donations
set payment_method = 'transferencia'
where payment_method is null;

-- Index para queries de agregación por método de pago.
create index if not exists donations_payment_method_idx
  on public.donations (payment_method);

create index if not exists donations_payku_order_id_idx
  on public.donations (payku_order_id);

-- Query útil después: ver el total por método
-- select payment_method, count(*) as donaciones, sum(amount) as total
-- from public.donations
-- group by payment_method;
