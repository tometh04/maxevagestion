-- ============================================================================
-- MIGRATION — Formas de pago en presupuestos (#18 reunión Gabi)
-- ============================================================================
-- Cada cotización puede listar las formas de pago aceptadas (Efectivo ARS,
-- Efectivo USD, Transferencia, Tarjeta, MP, Crédito, etc.) para que el cliente
-- las vea en el presupuesto público.
--
-- Default '{}' = sin cambio para data existente.
-- ============================================================================

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS payment_methods TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN quotations.payment_methods IS
  'Formas de pago aceptadas mostradas al cliente en el presupuesto público. Valores: EFECTIVO_ARS, EFECTIVO_USD, TRANSFERENCIA, TARJETA, MP, CREDITO';
