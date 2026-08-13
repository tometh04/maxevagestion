-- Reemplazo atómico de la estructura de una cotización (opciones + items).
--
-- Problema que resuelve: el PATCH de /api/quotations/[id] borraba todas las
-- opciones y después insertaba las nuevas en llamadas separadas de PostgREST.
-- Si el insert fallaba a mitad (conflicto de option_number, RLS, una columna
-- inexistente), las opciones viejas ya no existían y no había con qué
-- restaurarlas: el rollback sólo reponía el header. Acá delete + insert viven
-- en una sola función = una sola transacción.
--
-- SECURITY INVOKER (default) a propósito: la función corre con los permisos de
-- quien la llama, así que las policies de RLS de quotation_options /
-- quotation_items se aplican igual que con los inserts directos. No usar
-- SECURITY DEFINER acá: p_quotation_id viene del cliente y habilitaría escribir
-- en cotizaciones de otro tenant.
--
-- Preserva `is_selected`: el insert reemplaza las filas (los ids cambian), así
-- que guardamos qué option_number había aceptado el cliente y lo re-aplicamos.
-- Sin esto, editar una cotización aceptada rompía el convert a operación
-- ("No hay opción seleccionada").
--
-- OJO al agregar columnas a quotation_options / quotation_items: el INSERT usa
-- `SELECT *` sobre jsonb_populate_recordset, que devuelve NULL para las claves
-- ausentes en el jsonb. Una columna nueva NOT NULL DEFAULT x fallaría hasta que
-- el payload de lib/quotations/persistence.ts la incluya explícitamente. Ese
-- fallo es seguro: la transacción entera hace rollback y la ruta cae al camino
-- legacy, que sí respeta los defaults.

CREATE OR REPLACE FUNCTION replace_quotation_structure(
  p_quotation_id UUID,
  p_options JSONB,
  p_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_selected_option_number INTEGER;
BEGIN
  SELECT option_number
    INTO v_selected_option_number
    FROM quotation_options
   WHERE quotation_id = p_quotation_id
     AND is_selected IS TRUE
   ORDER BY option_number
   LIMIT 1;

  -- Los items con option_id caen por CASCADE, pero borramos explícitamente
  -- para llevarnos también los huérfanos legacy (option_id NULL).
  DELETE FROM quotation_items WHERE quotation_id = p_quotation_id;
  DELETE FROM quotation_options WHERE quotation_id = p_quotation_id;

  INSERT INTO quotation_options
  SELECT * FROM jsonb_populate_recordset(NULL::quotation_options, p_options);

  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO quotation_items
    SELECT * FROM jsonb_populate_recordset(NULL::quotation_items, p_items);
  END IF;

  IF v_selected_option_number IS NOT NULL THEN
    UPDATE quotation_options
       SET is_selected = TRUE
     WHERE quotation_id = p_quotation_id
       AND option_number = v_selected_option_number;
  END IF;
END;
$$;

COMMENT ON FUNCTION replace_quotation_structure(UUID, JSONB, JSONB) IS
  'Reemplaza opciones e items de una cotización en una sola transacción, preservando is_selected por option_number.';
