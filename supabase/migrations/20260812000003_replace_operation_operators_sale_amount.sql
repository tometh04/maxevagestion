-- =====================================================
-- Migración: replace_operation_operators ahora persiste sale_amount (VIB-112)
--
-- La RPC hace DELETE + INSERT atómico de las patas de una operación. Su versión
-- vigente (20260716000001) NO incluía sale_amount en el INSERT, así que el
-- precio de venta por pata se BORRABA en cada edición de la operación — motivo
-- por el cual la columna estaba siempre en 0 aunque el payload la trajera.
--
-- Copia exacta de la versión vigente + sale_amount en la lista de columnas.
-- Misma firma (UUID, JSONB) → CREATE OR REPLACE sin DROP.
-- =====================================================
CREATE OR REPLACE FUNCTION replace_operation_operators(
  p_operation_id UUID,
  p_operators JSONB  -- [{operator_id, cost, cost_currency, product_type, notes, passenger_detail, file_code, payment_due_date, sale_amount}]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator JSONB;
BEGIN
  DELETE FROM operation_operators
  WHERE operation_id = p_operation_id;

  IF p_operators IS NOT NULL AND jsonb_array_length(p_operators) > 0 THEN
    FOR v_operator IN SELECT * FROM jsonb_array_elements(p_operators)
    LOOP
      INSERT INTO operation_operators (
        operation_id,
        operator_id,
        cost,
        cost_currency,
        product_type,
        notes,
        passenger_detail,
        file_code,
        payment_due_date,
        sale_amount
      ) VALUES (
        p_operation_id,
        (v_operator->>'operator_id')::UUID,
        COALESCE((v_operator->>'cost')::NUMERIC, 0),
        COALESCE(v_operator->>'cost_currency', 'USD'),
        NULLIF(v_operator->>'product_type', ''),
        NULLIF(v_operator->>'notes', ''),
        (v_operator->'passenger_detail')::jsonb,
        NULLIF(v_operator->>'file_code', ''),
        NULLIF(v_operator->>'payment_due_date', '')::DATE,
        COALESCE((v_operator->>'sale_amount')::NUMERIC, 0)
      );
    END LOOP;
  END IF;
END;
$$;

COMMENT ON FUNCTION replace_operation_operators(UUID, JSONB) IS
'Reemplaza atómicamente los operadores de una operación (DELETE + INSERT). Persiste passenger_detail, file_code, payment_due_date y sale_amount (VIB-112). Usado por PATCH/POST de /api/operations.';

GRANT EXECUTE ON FUNCTION replace_operation_operators(UUID, JSONB) TO authenticated, service_role;
