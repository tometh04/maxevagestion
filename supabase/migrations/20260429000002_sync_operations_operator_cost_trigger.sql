-- =====================================================
-- Sync operations.operator_cost with SUM(operation_operators.cost)
-- =====================================================
--
-- Caso reportado por Tomi (29/04):
--   - OP af4dabf3: operador agregado después que NO figura al editar
--     costos. Costo de Lozada $2.825 + costo nuevo $4.401 ya pagado.
--   - OP b359476d: vista muestra $7.276, edit dialog muestra $7.447.
--     Centralizado en eurovips.
--
-- Causa raíz: coexisten dos modelos de costo en el schema:
--   - operations.operator_cost (legacy, costo único, lo muestra
--     operation-detail-client.tsx)
--   - operation_operators[] (modelo nuevo de migraciones 052/066, lo
--     usa edit-operation-dialog.tsx)
--
-- El PATCH handler en /api/operations/[id] sincroniza cuando recibe
-- operators[], pero si la modificación de operation_operators ocurre por
-- otro camino (script SQL, otro endpoint, importación legacy) o si el
-- PATCH se hace SIN incluir operators[], el campo legacy queda obsoleto.
--
-- Este trigger mantiene operations.operator_cost = SUM(operation_operators.cost)
-- automáticamente sin importar quién/cómo modifique la tabla.
--
-- Solo dispara IF new_total > 0: las operaciones legacy single-operator
-- (que viven solo del campo legacy y nunca tienen rows en
-- operation_operators) no se afectan.

CREATE OR REPLACE FUNCTION sync_operations_operator_cost()
RETURNS TRIGGER AS $$
DECLARE
  target_op_id UUID;
  new_total NUMERIC;
BEGIN
  target_op_id := COALESCE(NEW.operation_id, OLD.operation_id);

  SELECT COALESCE(SUM(cost), 0)
  INTO new_total
  FROM operation_operators
  WHERE operation_id = target_op_id;

  -- Si quedaron 0 rows después del DELETE, no pisamos operator_cost
  -- (la operación volvió a ser legacy single-operator o quedó sin operadores).
  IF new_total > 0 THEN
    UPDATE operations
    SET operator_cost = new_total
    WHERE id = target_op_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sync_operator_cost_on_operation_operators ON operation_operators;

CREATE TRIGGER sync_operator_cost_on_operation_operators
AFTER INSERT OR UPDATE OR DELETE ON operation_operators
FOR EACH ROW
EXECUTE FUNCTION sync_operations_operator_cost();

COMMENT ON FUNCTION sync_operations_operator_cost() IS
  'Mantiene operations.operator_cost = SUM(operation_operators.cost). Reportado por Tomi 2026-04-29 — OPs af4dabf3 y b359476d con drift entre el campo legacy y el modelo multi-operador.';
