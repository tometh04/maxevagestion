-- =====================================================
-- Migración 123: Agregar columnas de impuestos faltantes
-- La UI de Impuestos mostraba estos campos pero no existían en la DB
-- =====================================================

-- Alícuota IVA por defecto (21% para agencias de viajes)
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS default_iva_rate NUMERIC(5,2) DEFAULT 21.00;

-- Régimen fiscal (agencia de viajes = IVA sobre margen)
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS tax_regime TEXT DEFAULT 'TRAVEL_AGENCY' CHECK (tax_regime IN ('TRAVEL_AGENCY', 'GENERAL', 'RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA', 'EXENTO', 'NO_RESPONSABLE'));

-- Retención Ganancias (% al pagar a operadores RI)
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS retention_ganancias_rate NUMERIC(5,2) DEFAULT 0;

-- Retención IVA (% al pagar a operadores RI)
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS retention_iva_rate NUMERIC(5,2) DEFAULT 0;

-- Jurisdicción principal IIBB
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS iibb_jurisdiction TEXT DEFAULT 'SANTA_FE';

-- Alícuota IIBB (%)
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS iibb_rate NUMERIC(5,2) DEFAULT 3.50;

-- Convenio Multilateral
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS iibb_convenio_multilateral BOOLEAN DEFAULT false;
