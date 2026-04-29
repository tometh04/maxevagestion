-- =====================================================
-- RPC: replace_operation_operators
-- Migración 20260416000152
--
-- Motivación (ver auditoría A.4):
--   app/api/operations/[id]/route.ts hace DELETE de operation_operators y
--   después INSERT de los nuevos sin transacción. Si falla el INSERT
--   (error de validación, RLS, red), los operadores viejos ya fueron
--   borrados → la operación queda SIN operadores.
--
-- Esta RPC encapsula ambas operaciones en una transacción atómica.
-- Si cualquier parte falla, ROLLBACK automático.
--
-- Se ejecuta con SECURITY DEFINER porque la lógica ya está validada en
-- la API (permisos, ownership, etc.). La RPC se limita a garantizar
-- atomicidad.
-- =====================================================

CREATE OR REPLACE FUNCTION replace_operation_operators(
  p_operation_id UUID,
  p_operators JSONB  -- Array de objetos: [{operator_id, cost, cost_currency, product_type, notes}]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator JSONB;
BEGIN
  -- 1) Borrar todos los operation_operators existentes para esta operación
  DELETE FROM operation_operators
  WHERE operation_id = p_operation_id;

  -- 2) Insertar los nuevos (si se proveen). Si p_operators es NULL o [],
  --    simplemente no inserta nada (equivale a "remover todos").
  IF p_operators IS NOT NULL AND jsonb_array_length(p_operators) > 0 THEN
    FOR v_operator IN SELECT * FROM jsonb_array_elements(p_operators)
    LOOP
      INSERT INTO operation_operators (
        operation_id,
        operator_id,
        cost,
        cost_currency,
        product_type,
        notes
      ) VALUES (
        p_operation_id,
        (v_operator->>'operator_id')::UUID,
        COALESCE((v_operator->>'cost')::NUMERIC, 0),
        COALESCE(v_operator->>'cost_currency', 'USD'),
        NULLIF(v_operator->>'product_type', ''),
        NULLIF(v_operator->>'notes', '')
      );
    END LOOP;
  END IF;
END;
$$;

COMMENT ON FUNCTION replace_operation_operators(UUID, JSONB) IS
'Reemplaza atómicamente los operadores de una operación. DELETE + INSERT en una transacción. Si falla, rollback automático. Usado por PATCH /api/operations/[id].';

-- Permisos: authenticated puede ejecutar (la API ya valida permisos antes de llamar)
GRANT EXECUTE ON FUNCTION replace_operation_operators(UUID, JSONB) TO authenticated, service_role;
