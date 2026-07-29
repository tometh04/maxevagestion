-- VIB-86 — Permitir fijar a mano la comisión del referidor en una venta puntual.
--
-- El referidor se marca en el CLIENTE y todas sus ventas futuras generan
-- comisión automáticamente. El cliente (Yamil, Lozada) pidió conservar ese
-- comportamiento pero poder ajustar el porcentaje de una venta concreta cuando
-- se pacta algo distinto.
--
-- Hasta ahora no era posible: `createOrUpdateReferralCommission` se ejecuta en
-- cada edición de la operación y reescribe el porcentaje desde el override del
-- cliente o el default del referidor, así que cualquier ajuste manual duraba
-- hasta la próxima edición.
--
-- Mismo patrón que operations.commission_split_mode:
--   AUTO   (default): el porcentaje lo resuelve el sistema y el recálculo lo
--                     reescribe.
--   MANUAL: alguien lo fijó para esta venta; el recálculo lo respeta y solo
--           actualiza el monto si cambia el margen.
--
-- Migración aditiva y con default que reproduce el comportamiento actual. El
-- módulo de referidos está sin estrenar (0 filas en toda la base), así que no
-- hay datos que migrar.
alter table public.referral_commissions
  add column if not exists percentage_mode text not null default 'AUTO';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'referral_commissions_percentage_mode_check'
  ) then
    alter table public.referral_commissions
      add constraint referral_commissions_percentage_mode_check
      check (percentage_mode in ('AUTO', 'MANUAL'));
  end if;
end $$;

comment on column public.referral_commissions.percentage_mode is
  'AUTO (default): el porcentaje sale del override del cliente o del default del referidor, y el recálculo lo reescribe. MANUAL: lo fijó un administrador para esta venta y el recálculo no lo pisa; el monto sí se recalcula si cambia el margen.';

-- Rollback:
--   alter table public.referral_commissions drop column if exists percentage_mode;
