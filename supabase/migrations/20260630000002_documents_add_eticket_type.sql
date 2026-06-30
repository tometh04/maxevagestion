-- =====================================================
-- Migración 20260630000002: agregar tipo de documento "E-Ticket" (ETICKET)
-- al CHECK constraint de documents.type
-- =====================================================
-- Pedido VICO: el e-ticket es una declaración jurada obligatoria para todos
-- los pasajeros que viajan a Punta Cana (República Dominicana). Necesitan un
-- tipo propio para encontrarlo fácil entre el resto de los documentos.
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
    'ETICKET',
    'INVOICE',
    'INVOICE_OPERATOR',
    'INVOICE_CUSTOMER',
    'CONTRACT',
    'PAYMENT_PROOF',
    'SETTLEMENT',
    'OTHER'
  ));

COMMENT ON CONSTRAINT documents_type_check ON documents IS
  'Tipos de documento permitidos. ETICKET (E-Ticket) agregado 2026-06-30 (pedido VICO, declaración jurada Punta Cana). FLIGHT (Vuelo) agregado 2026-06-30. INVOICE_OPERATOR/INVOICE_CUSTOMER/CONTRACT agregados 2026-06-08 (VIB-35). INVOICE legacy conservado por compatibilidad.';
