-- =====================================================
-- Migración: precio de venta por servicio/pata (VIB-112)
--
-- operation_operators.sale_amount ya EXISTE en producción (2432 filas, todas
-- en 0) pero se agregó fuera del control de migraciones. Esta migración la
-- declara de forma idempotente para que una base creada desde cero sea igual a
-- producción. El tipo espeja el real en prod: NUMERIC, nullable, default 0.
--
-- Qué es: un DESGLOSE informativo de operations.sale_amount_total por pata, en
-- operations.sale_currency. Sirve para facturar cada servicio con el precio que
-- la agencia define (en vez de un reparto proporcional al costo) y para atribuir
-- la venta por producto en los reportes.
--
-- Qué NO es: la fuente de verdad de la venta. sale_amount_total lo sigue siendo
-- (de él dependen comisiones, IVA, deuda del cliente y ~15 reportes vía el
-- invariante margin_amount = sale_amount_total - operator_cost).
--
-- ⚠️ NO agregar un trigger que sume sale_amount hacia operations (como sí existe
-- para operator_cost en 20260429000002): pisaría sale_amount_total y de ahí
-- margen → comisiones → IVA → ledger. El desglose se contrasta contra el total
-- y se avisa si no cuadra; nunca se recalcula el total desde las patas.
-- =====================================================

ALTER TABLE operation_operators
  ADD COLUMN IF NOT EXISTS sale_amount NUMERIC DEFAULT 0;

COMMENT ON COLUMN operation_operators.sale_amount IS
  'Precio de venta asignado a esta pata (VIB-112), en operations.sale_currency. Desglose informativo de operations.sale_amount_total: NO alimenta el total/costo/margen y NO debe existir trigger que lo agregue hacia arriba.';
