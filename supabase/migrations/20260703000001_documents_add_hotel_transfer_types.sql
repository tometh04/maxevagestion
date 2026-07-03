-- =====================================================
-- Migración 20260703000001: agregar tipos de documento "Hotel" (HOTEL)
-- y "Traslado" (TRANSFER) al CHECK constraint de documents.type
-- =====================================================
-- Pedido VICO: al subir documentos dentro de una operación necesitan poder
-- clasificar el voucher de hotel y el de traslado por separado, para
-- encontrarlos fácil entre el resto de los documentos.
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
    'HOTEL',
    'TRANSFER',
    'INVOICE',
    'INVOICE_OPERATOR',
    'INVOICE_CUSTOMER',
    'CONTRACT',
    'PAYMENT_PROOF',
    'SETTLEMENT',
    'OTHER'
  ));

COMMENT ON CONSTRAINT documents_type_check ON documents IS
  'Tipos de documento permitidos. HOTEL (Hotel) y TRANSFER (Traslado) agregados 2026-07-03 (pedido VICO). ETICKET (E-Ticket) agregado 2026-06-30 (pedido VICO, declaración jurada Punta Cana). FLIGHT (Vuelo) agregado 2026-06-30. INVOICE_OPERATOR/INVOICE_CUSTOMER/CONTRACT agregados 2026-06-08 (VIB-35). INVOICE legacy conservado por compatibilidad.';
