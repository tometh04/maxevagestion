-- Agregar ASSISTANCE al constraint de type en operations
DO $$
BEGIN
  -- Eliminar constraint existente de operations.type
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'operations_type_check' AND table_name = 'operations'
  ) THEN
    ALTER TABLE operations DROP CONSTRAINT operations_type_check;
  END IF;

  -- Crear nuevo constraint con ASSISTANCE
  ALTER TABLE operations ADD CONSTRAINT operations_type_check
    CHECK (type IN ('FLIGHT', 'HOTEL', 'PACKAGE', 'CRUISE', 'TRANSFER', 'MIXED', 'ASSISTANCE'));

  -- También actualizar el constraint de product_type en operation_operators (si existe)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'operation_operators_product_type_check' AND table_name = 'operation_operators'
  ) THEN
    ALTER TABLE operation_operators DROP CONSTRAINT operation_operators_product_type_check;
  END IF;

  ALTER TABLE operation_operators ADD CONSTRAINT operation_operators_product_type_check
    CHECK (product_type IN ('FLIGHT', 'HOTEL', 'PACKAGE', 'CRUISE', 'TRANSFER', 'MIXED', 'ASSISTANCE'));

EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando constraint: %', SQLERRM;
END $$;
