-- VIB-63 — Reparto de comisiones en ventas compartidas entre dos vendedores.
--
-- Regla del cliente: en una venta compartida cada vendedor cobra la MITAD de su
-- porcentaje, salvo que uno "absorba": entonces el otro cobra su mitad y el
-- absorbente cobra su porcentaje MENOS lo que cobró el otro.
--
--   Jose (20%) + Santi (35%, absorbe) -> Jose 10, Santi 25
--
-- Quién absorbe es configuración por vendedor, no algo hardcodeado.
--
-- Migración puramente ADITIVA y con defaults que reproducen el comportamiento
-- deseado por defecto ('HALF' = la regla general). No cambia ningún dato
-- existente ni el resultado de ninguna operación ya cargada: la asignación de
-- 'ABSORB' a vendedores concretos va en una migración de datos aparte, cuando el
-- cliente confirme quiénes absorben.

-- 1) Modo de reparto por vendedor.
-- Texto y no booleano a propósito: si mañana aparece un tercer modo (por
-- ejemplo, un porcentaje fijo pactado) entra sin migrar el tipo de la columna.
alter table public.users
  add column if not exists shared_sale_commission_mode text not null default 'HALF';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_shared_sale_commission_mode_check'
  ) then
    alter table public.users
      add constraint users_shared_sale_commission_mode_check
      check (shared_sale_commission_mode in ('HALF', 'ABSORB'));
  end if;
end $$;

comment on column public.users.shared_sale_commission_mode is
  'Cómo participa este vendedor en una venta compartida. HALF (default): cobra la mitad de su porcentaje. ABSORB: cobra su porcentaje menos lo que cobra el otro vendedor, o sea que el total de la venta es su porcentaje. Lo configura el admin desde Configuración → Usuarios.';

-- 2) Origen de los porcentajes de la operación.
-- AUTO (default): commission_pct_primary/secondary son un SNAPSHOT de salida que
--   el recálculo reescribe. El servidor ignora lo que mande el navegador.
-- MANUAL: alguien fijó los porcentajes a mano y el recálculo no los pisa.
--
-- Esta distinción es el corazón del fix: hasta ahora el porcentaje que decidía
-- cuánto cobra cada vendedor venía en el body del request, y una regresión de UI
-- que lo mandaba en 0 alcanzó para dejar ventas sin comisionar.
alter table public.operations
  add column if not exists commission_split_mode text not null default 'AUTO';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'operations_commission_split_mode_check'
  ) then
    alter table public.operations
      add constraint operations_commission_split_mode_check
      check (commission_split_mode in ('AUTO', 'MANUAL'));
  end if;
end $$;

comment on column public.operations.commission_split_mode is
  'AUTO (default): los commission_pct_* son un snapshot que recalcula el servidor a partir del porcentaje y el modo de cada vendedor. MANUAL: porcentajes fijados a mano; el recálculo no los pisa.';

-- Rollback:
--   alter table public.operations drop column if exists commission_split_mode;
--   alter table public.users drop column if exists shared_sale_commission_mode;
-- Ambas son aditivas: dropearlas devuelve el esquema al estado anterior sin
-- pérdida de datos de negocio.
