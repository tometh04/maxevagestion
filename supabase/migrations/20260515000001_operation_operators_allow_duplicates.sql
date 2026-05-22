-- Migración 2026-05-15: permitir mismo operador 2+ veces en una operación
--
-- PROBLEMA (reportado por Yami, Lozada):
--   Cuando una operación tiene el mismo operador (ej: Eurovips) cargado
--   2 veces — uno para el paquete y otro para los aéreos, porque cada
--   producto se paga por separado — el sistema tira:
--     "No se pudo sincronizar los operadores de la operación. No se
--     guardaron los cambios."
--
--   Causa: la tabla operation_operators tiene UNIQUE(operation_id,
--   operator_id) (mig 052). El RPC replace_operation_operators hace
--   DELETE+INSERT en transacción; cuando intenta insertar la segunda
--   fila con el mismo operador, el constraint la rechaza → rollback
--   → la edición entera falla.
--
-- FIX:
--   Dropear el UNIQUE constraint. El use case legítimo (mismo operador,
--   distintos productos) lo justifica. No hay queries de producción que
--   asuman unicidad — la lógica de costos/deudas suma por operator_id
--   sin importar cuántas filas haya. Solo la mig inicial 052 usaba
--   ON CONFLICT y eso ya corrió hace un año.
--
-- IMPACTO:
--   - Lozada y todas las agencias pueden cargar mismo operador N veces
--     en una operación
--   - Reportes de deuda por operador siguen funcionando (sum por operator_id)
--   - new-operation-dialog y edit-operation-dialog ya soportan múltiples
--     filas (sección "Operadores Múltiples")
--   - No requiere cambios de código

BEGIN;

ALTER TABLE operation_operators
  DROP CONSTRAINT IF EXISTS operation_operators_operation_id_operator_id_key;

COMMENT ON TABLE operation_operators IS
  'Operadores asignados a una operación. Permite mismo operator_id N veces (ej: Eurovips paquete + Eurovips aéreos) con costos/notes independientes. La unicidad de la fila la garantiza el PK (id).';

COMMIT;
