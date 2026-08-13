-- =====================================================
-- Migración: pago de resumen de tarjeta multi-moneda + patas por moneda
-- =====================================================
-- Contexto: un mismo resumen de tarjeta se paga en parte en ARS y en parte en
-- USD, al mismo tiempo, cada parte desde su propia cuenta. El modelo anterior
-- era mono-moneda (cc_payment_groups.currency/source_account_id/total_amount).
--
-- Ahora un pago puede tener varias "patas" (una por moneda), cada una con su
-- cuenta origen, su total y su tipo de cambio. Los columnas mono-moneda del
-- grupo pasan a ser opcionales: se siguen poblando para pagos de una sola
-- moneda (compat hacia atrás), y quedan NULL cuando hay varias patas (la verdad
-- por moneda vive en cc_payment_legs).
--
-- La atribución por agencia de cada consumo va en cash_movements.agency_id (la
-- columna ya existe), no requiere cambios de esquema acá.

CREATE TABLE IF NOT EXISTS cc_payment_legs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES cc_payment_groups(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  source_account_id UUID NOT NULL REFERENCES financial_accounts(id),
  total_amount NUMERIC(18,2) NOT NULL,
  exchange_rate NUMERIC(18,4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (group_id, currency)
);

CREATE INDEX IF NOT EXISTS idx_cc_payment_legs_group ON cc_payment_legs(group_id);
CREATE INDEX IF NOT EXISTS idx_cc_payment_legs_org ON cc_payment_legs(org_id);

-- Mismo patrón que cc_payment_groups (acceso admin-only vía service role).
ALTER TABLE cc_payment_legs DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE cc_payment_legs IS
  'Patas por moneda de un pago de resumen de tarjeta (cc_payment_groups). Cada pata: moneda, cuenta origen, total y TC. Permite pagar ARS y USD en el mismo pago.';

-- Los columnas mono-moneda del grupo pasan a opcionales (NULL en pagos multi-moneda).
ALTER TABLE cc_payment_groups ALTER COLUMN currency DROP NOT NULL;
ALTER TABLE cc_payment_groups ALTER COLUMN source_account_id DROP NOT NULL;
ALTER TABLE cc_payment_groups ALTER COLUMN total_amount DROP NOT NULL;
