-- VIB-149 — Mover plata entre cuentas propias no es un gasto.
--
-- Una transferencia entre dos cuentas de la agencia (o una compra/venta de
-- dólares) se registra como un par de movimientos espejo: EXPENSE en la cuenta
-- que entrega e INCOME en la que recibe. La plata no salió de la agencia,
-- cambió de bolsillo.
--
-- Pero los reportes de resultado suman todos los `ledger_movements` con
-- `type = 'EXPENSE'`, así que cada transferencia inflaba los gastos del período
-- y bajaba el resultado informado. Medido en producción al 2026-09-11: 219
-- movimientos de salida por ARS 804.485.115 y USD 646.239 — entre el 30% y el
-- 49% de los "gastos" en pesos de Lozada Rosario en cada trimestre de 2026.
--
-- La marca va en la base y no en el texto del concepto: un reporte no tiene por
-- qué adivinar de qué se trata un movimiento leyéndole la descripción.

alter table ledger_movements
  add column if not exists is_internal_transfer boolean not null default false;

comment on column ledger_movements.is_internal_transfer is
  'true en las DOS patas de un movimiento entre cuentas propias de la agencia (transferencia o compra/venta de dólares). Mueve el saldo de las cuentas pero no es ingreso ni gasto: queda fuera de los reportes de resultado. VIB-149.';

-- Backfill de las transferencias ya registradas.
--
-- El texto del concepto se usa UNA sola vez, acá, y no alcanza por sí solo: se
-- exige además que exista la pata espejo (mismo concepto, mismo día, tipo
-- opuesto, misma org). Una transferencia siempre tiene las dos patas; un gasto
-- real que alguien bautizó "Transferencia de ..." a mano, no.
--
-- Verificado contra producción antes de escribir esto: las 438 patas que
-- matchean el patrón son 219 pares exactos, sin una sola huérfana.
--
-- El día se compara con `movement_day` —la fecha de negocio del movimiento,
-- VIB-178— y no con `movement_date`: las dos patas se insertan con
-- milisegundos de diferencia, así que un instante no sirve para aparearlas.
-- Verificado: no hay un solo movimiento con `movement_day` nulo.
with candidatas as (
  select
    id,
    org_id,
    concept,
    type,
    movement_day as dia
  from ledger_movements
  where account_id is not null
    and (
      concept ~* '^(compra|venta) de d[oó]lares'
      or concept ~* '^transferencia (de "|a |desde )'
    )
),
con_espejo as (
  select c.id
  from candidatas c
  where exists (
    select 1
    from candidatas espejo
    where espejo.org_id is not distinct from c.org_id
      and espejo.concept = c.concept
      and espejo.dia = c.dia
      and espejo.type <> c.type
  )
)
update ledger_movements lm
set is_internal_transfer = true
from con_espejo
where lm.id = con_espejo.id;
