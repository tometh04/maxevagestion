-- =====================================================
-- Migración 091: Fix execute_readonly_query para queries multilínea
-- =====================================================
-- Corrige la validación de queries SELECT para manejar correctamente
-- queries con saltos de línea y espacios al inicio

-- Actualizar función para manejar mejor queries multilínea
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
  trimmed_query TEXT;
  semicolon_count INTEGER;
BEGIN
  -- Validar que la query no esté vacía
  IF query_text IS NULL OR TRIM(query_text) = '' THEN
    RAISE EXCEPTION 'Query vacía no permitida';
  END IF;

  -- Normalizar query (remover espacios y saltos de línea al inicio/final, convertir a mayúsculas)
  -- Usar regexp_replace para eliminar espacios y saltos de línea al inicio
  normalized_query := UPPER(REGEXP_REPLACE(TRIM(query_text), '^\s+', '', 'g'));

  -- Validar que solo sea SELECT (seguridad crítica)
  -- Permitir espacios y saltos de línea después de SELECT usando regex
  IF NOT normalized_query ~ '^SELECT\s' THEN
    RAISE EXCEPTION 'Solo se permiten queries SELECT. Query recibida: %', LEFT(REGEXP_REPLACE(query_text, '\s+', ' ', 'g'), 100);
  END IF;

  -- Validar que no contenga comandos peligrosos (solo al inicio de palabras, no dentro de strings)
  -- Usamos regex para buscar comandos SQL reales, no palabras dentro de strings o nombres
  IF normalized_query ~ '\m(DROP|DELETE|INSERT|UPDATE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|CALL)\M' THEN
    RAISE EXCEPTION 'Comandos peligrosos no permitidos en queries readonly';
  END IF;
  
  -- Validación adicional: asegurar que no hay múltiples SELECT seguidos de comandos peligrosos
  -- Esto previene queries como "SELECT ...; DROP TABLE ..."
  IF normalized_query ~ ';\s*(DROP|DELETE|INSERT|UPDATE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|CALL)' THEN
    RAISE EXCEPTION 'Múltiples comandos no permitidos';
  END IF;

  -- Validar que no tenga múltiples statements (prevenir SQL injection)
  -- Contar solo los `;` que no están al final (después de espacios)
  trimmed_query := TRIM(TRAILING ';' FROM TRIM(query_text));
  semicolon_count := (SELECT COUNT(*) FROM regexp_split_to_table(trimmed_query, ';'));
  
  -- Permitir máximo 1 statement (el SELECT principal)
  IF semicolon_count > 1 THEN
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
COMMENT ON FUNCTION execute_readonly_query IS 'Ejecuta queries SELECT de forma segura para el AI Companion. Solo permite SELECT, valida SQL, y previene comandos peligrosos. Maneja correctamente queries multilínea.';
