-- =====================================================
-- Migración 20260630000001: agregar tipo de documento "Vuelo" (FLIGHT)
-- al CHECK constraint de documents.type
-- =====================================================
-- Pedido VICO: poder subir el voucher del vuelo (horarios, etc.) con un tipo
-- propio "Vuelo" para encontrarlo fácil entre el resto de los documentos.
--
-- Es additive — sin riesgo para datos existentes ni para otras orgs.
-- =====================================================

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_type_check
  CHECK (type IN (
    'PASSPORT',
    'DNI',
    'LICENSE',
    'VOUCHER',
    'FLIGHT',
    'INVOICE',
    'INVOICE_OPERATOR',
    'INVOICE_CUSTOMER',
    'CONTRACT',
    'PAYMENT_PROOF',
    'SETTLEMENT',
    'OTHER'
  ));

COMMENT ON CONSTRAINT documents_type_check ON documents IS
  'Tipos de documento permitidos. FLIGHT (Vuelo) agregado 2026-06-30 (pedido VICO). INVOICE_OPERATOR/INVOICE_CUSTOMER/CONTRACT agregados 2026-06-08 (VIB-35). INVOICE legacy conservado por compatibilidad.';
