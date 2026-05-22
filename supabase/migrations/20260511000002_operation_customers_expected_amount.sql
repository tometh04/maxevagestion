-- Migración 2026-05-11: per-passenger expected amount
--
-- PROBLEMA (reportado por Santi):
--   Operaciones con múltiples pasajeros asignan saleAmount / N por defecto
--   (split 50/50 si hay 2). No hay forma de override cuando cada pasajero
--   debe un monto distinto (ej: Lisandro USD 10.000, Luciano USD 5.150).
--
-- FIX:
--   Agregar columna nullable expected_amount. Si está seteada, ese es el
--   monto que debe ese pasajero. Si NULL, fallback al even-split del
--   restante (saleAmount - sum(explicits)) / count(nullables).
--
-- IMPACTO:
--   - Operations existentes: expected_amount queda NULL → mismo comportamiento
--     que antes (even split). Cero risk para Lozada Rosario/Madero.
--   - Nuevas asignaciones: el user puede definir el monto exacto por pasajero
--     inline en la tabla de Saldos por Pasajero.

BEGIN;

ALTER TABLE operation_customers
  ADD COLUMN IF NOT EXISTS expected_amount NUMERIC(18,2) NULL
    CHECK (expected_amount IS NULL OR expected_amount >= 0);

COMMENT ON COLUMN operation_customers.expected_amount IS
  'Monto que debe pagar este pasajero. Si NULL, se calcula via even-split del restante.';

COMMIT;
