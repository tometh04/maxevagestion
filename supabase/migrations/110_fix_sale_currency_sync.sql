-- Migration 110: Fix sale_currency sync with currency
--
-- BUG FIX: El formulario de edición de operaciones (edit-operation-dialog.tsx)
-- solo enviaba el campo "currency" al hacer PATCH, pero nunca enviaba "sale_currency".
-- Esto causó que al cambiar una operación de USD a ARS, el campo "currency" se
-- actualizara correctamente (y la UI mostrara ARS) pero "sale_currency" quedara
-- en USD — generando que Cerebro cuente la operación como USD.
--
-- Este script corrige todos los registros donde currency != sale_currency,
-- usando "currency" como la fuente de verdad (es el campo que controla la UI).

UPDATE operations
  SET sale_currency = currency
WHERE currency IS NOT NULL
  AND sale_currency IS NOT NULL
  AND sale_currency != currency;

-- Loguear cuántas filas se afectaron
DO $$
DECLARE
  affected_rows INTEGER;
BEGIN
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE 'sale_currency sync: % operaciones corregidas', affected_rows;
END $$;
