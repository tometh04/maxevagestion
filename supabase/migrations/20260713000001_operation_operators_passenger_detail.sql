-- =====================================================
-- Migración: detalle del servicio para el pasajero (por operation_operator)
--
-- La agencia puede cargar, por cada servicio y según su tipo, la info que ve
-- el pasajero en el "Detalle de la Operación": hotel, régimen de comidas,
-- tipo de habitación, check-in/out (alojamiento); aerolínea, vuelo/ruta, fecha
-- (aéreo); o un texto libre (otros). Todo opcional.
--
-- Se guarda como JSONB flexible porque los campos varían por tipo de servicio.
-- El statement usa este detalle como fuente principal (fallback: tramos →
-- campos de la operación → blanco). Nunca muestra el operador mayorista.
-- =====================================================

ALTER TABLE operation_operators
  ADD COLUMN IF NOT EXISTS passenger_detail JSONB;

COMMENT ON COLUMN operation_operators.passenger_detail IS
  'Detalle del servicio para el pasajero (JSONB, opcional, por tipo): { hotel_name, meal_plan, room_type, checkin, checkout, airline, flight_info, flight_date, detail }. Lo usa el PDF "Detalle de la Operación".';

-- ---------------------------------------------------------------------------
-- RPC: replace_operation_operators — ahora persiste passenger_detail.
-- La RPC hace DELETE + INSERT atómico; si no insertáramos passenger_detail acá,
-- se perdería en cada edición de la operación.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION replace_operation_operators(
  p_operation_id UUID,
  p_operators JSONB  -- [{operator_id, cost, cost_currency, product_type, notes, passenger_detail}]
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
        passenger_detail
      ) VALUES (
        p_operation_id,
        (v_operator->>'operator_id')::UUID,
        COALESCE((v_operator->>'cost')::NUMERIC, 0),
        COALESCE(v_operator->>'cost_currency', 'USD'),
        NULLIF(v_operator->>'product_type', ''),
        NULLIF(v_operator->>'notes', ''),
        (v_operator->'passenger_detail')::jsonb
      );
    END LOOP;
  END IF;
END;
$$;

COMMENT ON FUNCTION replace_operation_operators(UUID, JSONB) IS
'Reemplaza atómicamente los operadores de una operación (DELETE + INSERT). Persiste passenger_detail. Usado por PATCH/POST de /api/operations.';

GRANT EXECUTE ON FUNCTION replace_operation_operators(UUID, JSONB) TO authenticated, service_role;
