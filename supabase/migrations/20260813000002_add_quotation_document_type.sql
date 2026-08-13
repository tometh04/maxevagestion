-- =====================================================
-- Agregar tipo de documento QUOTATION
-- Para cotizaciones hechas con otra app que se suben como archivo
-- adjunto al lead (boton "Subir" en la seccion Cotizaciones del lead).
-- =====================================================
-- Additive: parte de la lista vigente (20260703000001) y solo suma
-- QUOTATION. Idempotente (DROP IF EXISTS + ADD), sin riesgo para datos
-- existentes ni otras orgs.
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
    'ETICKET',
    'HOTEL',
    'TRANSFER',
    'INVOICE',
    'INVOICE_OPERATOR',
    'INVOICE_CUSTOMER',
    'CONTRACT',
    'PAYMENT_PROOF',
    'SETTLEMENT',
    'QUOTATION',
    'OTHER'
  ));

COMMENT ON CONSTRAINT documents_type_check ON documents IS
  'Tipos de documento permitidos. QUOTATION (cotizacion adjunta hecha con otra app) agregado 2026-08-13. HOTEL/TRANSFER 2026-07-03. ETICKET/FLIGHT 2026-06-30. INVOICE_OPERATOR/INVOICE_CUSTOMER/CONTRACT 2026-06-08 (VIB-35). INVOICE legacy conservado por compatibilidad.';
