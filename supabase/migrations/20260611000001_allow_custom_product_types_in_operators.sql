-- Migración 20260611000001: Permitir custom product_types en operation_operators
--
-- Contexto: la migración 066 agregó la columna product_type con un CHECK constraint
-- que solo acepta: FLIGHT, HOTEL, PACKAGE, CRUISE, TRANSFER, MIXED.
-- La migración 20260609000002 agregó custom_product_types a operation_settings,
-- permitiendo a las agencias definir tipos propios (ej: "Circuito").
-- Al seleccionar un tipo custom en el editor de operación, el RPC
-- replace_operation_operators falla con violación de CHECK constraint.
-- Fix: eliminar el constraint para permitir cualquier valor de texto.

ALTER TABLE operation_operators
  DROP CONSTRAINT IF EXISTS operation_operators_product_type_check;

COMMENT ON COLUMN operation_operators.product_type IS
  'Tipo de producto del operador en esta operación. Acepta valores estándar (FLIGHT, HOTEL, PACKAGE, CRUISE, TRANSFER, MIXED) y tipos custom definidos en operation_settings.custom_product_types.';
