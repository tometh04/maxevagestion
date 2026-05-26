-- =====================================================
-- Migración 20260522000003: Agregar tipo 'SETTLEMENT' (Liquidación)
-- al CHECK constraint de documents.type
-- =====================================================
-- Pedido por Vico Travel (Andrés) 2026-05-22: necesitan poder subir
-- liquidaciones (facturas o resúmenes que les manda el operador con
-- el detalle de lo cobrado/comisionado por un periodo) como tipo de
-- documento separado, no mezclado con "Factura" u "Otro".
--
-- Es additive (agrega una opción al enum) — sin riesgo para datos
-- existentes ni para otras orgs.
-- =====================================================

-- Borrar el CHECK constraint viejo de documents.type (puede tener
-- distintos nombres según cuándo se creó la tabla; intentamos ambos)
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_type_check;

-- Volver a crear con SETTLEMENT incluido
ALTER TABLE documents
  ADD CONSTRAINT documents_type_check
  CHECK (type IN ('PASSPORT', 'DNI', 'VOUCHER', 'INVOICE', 'PAYMENT_PROOF', 'SETTLEMENT', 'OTHER'));

COMMENT ON CONSTRAINT documents_type_check ON documents IS
  'Tipos de documento permitidos. SETTLEMENT agregado 2026-05-22 a pedido de Vico Travel.';
