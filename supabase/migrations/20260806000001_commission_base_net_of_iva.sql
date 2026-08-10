-- =====================================================
-- Migración: Base de comisiones neta de IVA (VIB-95)
-- =====================================================
-- Yamil (Lozada Rosario) pidió que las comisiones de vendedores y
-- referidores se calculen sobre la ganancia NETA de IVA, no sobre la
-- bruta. Ganancia neta = ganancia bruta × (1 − alícuota).
--
-- Es opt-in y POR AGENCIA: default OFF, así ninguna otra agencia cambia
-- de comportamiento salvo que lo active explícitamente.
--
-- Independiente del IVA fiscal (iva_sales / default_iva_rate): esto solo
-- afecta la base con la que se reparten las comisiones. No toca el libro
-- de IVA ni lo que se declara.
-- =====================================================

ALTER TABLE financial_settings
  ADD COLUMN IF NOT EXISTS commission_base_net_of_iva BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commission_iva_rate NUMERIC(5,4) NOT NULL DEFAULT 0.105
    CHECK (commission_iva_rate >= 0 AND commission_iva_rate < 1),
  ADD COLUMN IF NOT EXISTS commission_net_from DATE DEFAULT NULL;

COMMENT ON COLUMN financial_settings.commission_base_net_of_iva IS
  'Si está activo, las comisiones (vendedor y referidor) se calculan sobre la ganancia neta de IVA en vez de la bruta. Opt-in por agencia (VIB-95).';
COMMENT ON COLUMN financial_settings.commission_iva_rate IS
  'Alícuota de IVA a descontar de la ganancia bruta para obtener la base de comisiones (ej. 0.105 = 10,5%). Solo aplica si commission_base_net_of_iva = true. Independiente del IVA fiscal.';
COMMENT ON COLUMN financial_settings.commission_net_from IS
  'Fecha de corte: solo las operaciones con operation_date >= este valor usan base neta. NULL = aplica a todas las operaciones cuando el flag está activo.';
