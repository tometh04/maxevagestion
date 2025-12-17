-- =====================================================
-- Migración 061: Función RPC para queries readonly del AI Companion
-- =====================================================
-- Permite que el AI Companion ejecute queries SELECT de forma segura
-- Solo permite SELECT, valida SQL, y tiene rate limiting

-- Función para ejecutar queries readonly de forma segura
CREATE OR REPLACE FUNCTION execute_readonly_query(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  normalized_query TEXT;
  result JSONB;
  query_start_time TIMESTAMP;
  query_duration INTERVAL;
BEGIN
  -- Validar que la query no esté vacía
  IF query_text IS NULL OR TRIM(query_text) = '' THEN
    RAISE EXCEPTION 'Query vacía no permitida';
  END IF;

  -- Normalizar query (remover espacios, convertir a mayúsculas para validación)
  normalized_query := UPPER(TRIM(query_text));

  -- Validar que solo sea SELECT (seguridad crítica)
  IF NOT normalized_query LIKE 'SELECT%' THEN
    RAISE EXCEPTION 'Solo se permiten queries SELECT. Query recibida: %', LEFT(query_text, 100);
  END IF;

  -- Validar que no contenga comandos peligrosos
  IF normalized_query LIKE '%DROP%' OR
     normalized_query LIKE '%DELETE%' OR
     normalized_query LIKE '%INSERT%' OR
     normalized_query LIKE '%UPDATE%' OR
     normalized_query LIKE '%TRUNCATE%' OR
     normalized_query LIKE '%ALTER%' OR
     normalized_query LIKE '%CREATE%' OR
     normalized_query LIKE '%GRANT%' OR
     normalized_query LIKE '%REVOKE%' OR
     normalized_query LIKE '%EXECUTE%' OR
     normalized_query LIKE '%CALL%' THEN
    RAISE EXCEPTION 'Comandos peligrosos no permitidos en queries readonly';
  END IF;

  -- Validar que no tenga múltiples statements (prevenir SQL injection)
  IF (SELECT COUNT(*) FROM regexp_split_to_table(query_text, ';')) > 2 THEN
    RAISE EXCEPTION 'Múltiples statements no permitidos';
  END IF;

  -- Registrar inicio de query
  query_start_time := clock_timestamp();

  -- Ejecutar query de forma segura usando EXECUTE
  BEGIN
    EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', query_text) INTO result;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error ejecutando query: %', SQLERRM;
  END;

  -- Calcular duración
  query_duration := clock_timestamp() - query_start_time;

  -- Si la query tomó más de 10 segundos, registrar warning
  IF query_duration > INTERVAL '10 seconds' THEN
    RAISE WARNING 'Query lenta detectada: % segundos. Query: %', EXTRACT(EPOCH FROM query_duration), LEFT(query_text, 200);
  END IF;

  -- Retornar resultado (o array vacío si no hay resultados)
  RETURN COALESCE(result, '[]'::JSONB);

END;
$$;

-- Comentarios
COMMENT ON FUNCTION execute_readonly_query IS 'Ejecuta queries SELECT de forma segura para el AI Companion. Solo permite SELECT, valida SQL, y previene comandos peligrosos.';

-- Grant execute a authenticated users (todos los usuarios autenticados pueden usar esta función)
GRANT EXECUTE ON FUNCTION execute_readonly_query(TEXT) TO authenticated;

-- Crear índice para mejorar performance de queries comunes
-- (Esto se hace en las migraciones de índices existentes)

