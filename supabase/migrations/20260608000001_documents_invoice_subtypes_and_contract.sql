-- =====================================================
-- Migración 20260608000001: separar "Factura" en
-- "Factura Operador" / "Factura Cliente" y agregar "Contrato"
-- al CHECK constraint de documents.type (VIB-35)
-- =====================================================
-- Pedido VIB-35: al subir documentos dentro de una operación el
-- desplegable de "Tipo de Documento" tenía una única opción "Factura"
-- que no distinguía el origen del comprobante, y no incluía "Contrato".
--
-- Se agregan tres tipos nuevos:
--   * INVOICE_OPERATOR — factura emitida por el proveedor/operador
--   * INVOICE_CUSTOMER — factura emitida a favor del cliente
--   * CONTRACT         — contrato
--
-- INVOICE (legacy) se conserva en el constraint para no romper los
-- documentos ya cargados con ese tipo. Es additive — sin riesgo para
-- datos existentes ni para otras orgs.
-- =====================================================

-- Borrar el CHECK constraint viejo de documents.type
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_type_check;

-- Volver a crear con los nuevos tipos incluidos
ALTER TABLE documents
  ADD CONSTRAINT documents_type_check
  CHECK (type IN (
    'PASSPORT',
    'DNI',
    'LICENSE',
    'VOUCHER',
    'INVOICE',
    'INVOICE_OPERATOR',
    'INVOICE_CUSTOMER',
    'CONTRACT',
    'PAYMENT_PROOF',
    'SETTLEMENT',
    'OTHER'
  ));

COMMENT ON CONSTRAINT documents_type_check ON documents IS
  'Tipos de documento permitidos. INVOICE_OPERATOR/INVOICE_CUSTOMER/CONTRACT agregados 2026-06-08 (VIB-35). INVOICE legacy conservado por compatibilidad.';
