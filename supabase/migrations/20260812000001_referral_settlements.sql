-- =====================================================
-- Migración: liquidación de comisiones al referidor (VIB-86)
-- =====================================================
-- Problema que resuelve:
--
-- Hasta ahora, "pagar" una comisión de referido solo cambiaba un flag
-- (referral_commissions.status = 'PAID'). No generaba movimiento en el ledger,
-- así que la plata que la agencia le entrega al referidor NUNCA salía de
-- ninguna cuenta: el saldo de caja quedaba inflado y el egreso no figuraba en
-- ningún reporte financiero.
--
-- Era el único "pagar" de la app que no movía plata. La comisión del vendedor
-- (app/api/commissions/pay), los pagos a operador y los gastos de caja sí
-- crean su ledger_movement.
--
-- Modelo elegido: LIQUIDACIÓN (settlement), no pago fila por fila.
--
--   Al referidor no se le paga venta por venta: se le paga un total por período.
--   Una liquidación agrupa N comisiones de UN referidor en UNA moneda, genera UN
--   solo ledger_movement y da un comprobante en PDF con el detalle venta por
--   venta (que es lo que el referidor necesita para conciliar: es un tercero
--   externo, no un empleado).
--
--   Además evita una trampa: createLedgerMovement() con type='COMMISSION' y
--   operation_id dispara markCommissionsAsPaidIfLedgerExists(), que marcaría
--   como pagada la comisión del VENDEDOR de esa operación. La liquidación va con
--   operation_id NULL (cubre muchas ventas), así que el hook ni se activa.
--
-- Multi-tenant: no hay nada específico de una agencia. Toda org que use el
-- módulo de referidos obtiene el mismo comportamiento, con su propio plan de
-- cuentas y sus propias monedas.

BEGIN;

-- Base en producción con tráfico: si no se consigue un lock en 10s, cortar con
-- un error claro en vez de quedar bloqueando a los lectores de las tablas
-- involucradas. La migración es idempotente, así que reintentar es seguro.
SET LOCAL lock_timeout = '10s';

-- ─────────────────────────────────────────────────────
-- 1. referral_settlements: un pago a un referidor.
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  referral_partner_id UUID NOT NULL REFERENCES public.referral_partners(id) ON DELETE RESTRICT,

  -- Moneda y total de las COMISIONES liquidadas. Una liquidación nunca mezcla
  -- monedas: si el referidor tiene comisiones en ARS y en USD, son dos
  -- liquidaciones distintas (mismo criterio que el resto del sistema).
  currency TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  commissions_count INTEGER NOT NULL DEFAULT 0,

  -- Salida de caja: cuenta, moneda de la cuenta y monto en ESA moneda.
  -- Permite pagar una comisión en USD desde una cuenta en ARS (o viceversa)
  -- con tipo de cambio explícito, igual que /api/commissions/pay.
  -- SET NULL y no RESTRICT a propósito: el borrado de cuentas financieras es un
  -- hard delete que primero elimina los ledger_movements de la cuenta y después
  -- la cuenta (app/api/accounting/financial-accounts/[id]/route.ts). Con RESTRICT
  -- ese flujo fallaría en el último paso, dejando la cuenta sin movimientos pero
  -- sin borrar. El nombre queda copiado abajo para que el comprobante siga
  -- siendo legible aunque la cuenta ya no exista.
  account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  account_name TEXT NOT NULL,
  account_currency TEXT NOT NULL,
  cash_amount NUMERIC(14,2) NOT NULL,
  exchange_rate NUMERIC(14,4),

  ledger_movement_id UUID REFERENCES public.ledger_movements(id) ON DELETE SET NULL,

  -- Período informativo que cubre la liquidación (para el comprobante).
  period_from DATE,
  period_to DATE,

  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,

  -- true = registra la salida de caja de comisiones que YA estaban marcadas
  -- como pagadas con el flujo viejo. Importa al revertir: esas comisiones
  -- vuelven a PAID (como estaban), no a PENDING.
  is_regularization BOOLEAN NOT NULL DEFAULT false,

  -- PAID: liquidación vigente.
  -- REVERTED: se revirtió; las comisiones volvieron a PENDING y se generó el
  -- contra-movimiento en el ledger. La fila se conserva para auditoría.
  status TEXT NOT NULL DEFAULT 'PAID',
  reverted_at TIMESTAMPTZ,
  reverted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reversal_ledger_movement_id UUID REFERENCES public.ledger_movements(id) ON DELETE SET NULL,
  reversal_reason TEXT,

  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT referral_settlements_status_check
    CHECK (status IN ('PAID', 'REVERTED')),
  CONSTRAINT referral_settlements_currency_check
    CHECK (currency IN ('ARS', 'USD')),
  CONSTRAINT referral_settlements_account_currency_check
    CHECK (account_currency IN ('ARS', 'USD')),
  CONSTRAINT referral_settlements_amount_positive
    CHECK (amount > 0),
  CONSTRAINT referral_settlements_cash_amount_positive
    CHECK (cash_amount > 0),
  -- Pago cross-moneda exige tipo de cambio. Sin esto, un USD pagado desde una
  -- cuenta ARS quedaría sin trazabilidad de a cuánto se convirtió.
  CONSTRAINT referral_settlements_fx_required
    CHECK (currency = account_currency OR (exchange_rate IS NOT NULL AND exchange_rate > 0))
);

CREATE INDEX IF NOT EXISTS idx_referral_settlements_org
  ON public.referral_settlements(org_id);
CREATE INDEX IF NOT EXISTS idx_referral_settlements_partner
  ON public.referral_settlements(referral_partner_id);
CREATE INDEX IF NOT EXISTS idx_referral_settlements_paid_at
  ON public.referral_settlements(org_id, paid_at DESC);

COMMENT ON TABLE public.referral_settlements IS
  'Pago a un referidor: agrupa N referral_commissions de un mismo partner y una '
  'misma moneda, genera UN ledger_movement (salida real de caja) y respalda el '
  'comprobante en PDF. Ver VIB-86.';
COMMENT ON COLUMN public.referral_settlements.cash_amount IS
  'Monto que salió de la cuenta, EN LA MONEDA DE LA CUENTA. Difiere de `amount` '
  'cuando se paga cross-moneda (ej. comisión USD pagada desde cuenta ARS).';
COMMENT ON COLUMN public.referral_settlements.ledger_movement_id IS
  'Movimiento de ledger (type=COMMISSION) que descuenta el saldo de la cuenta. '
  'NULL solo si la liquidación quedó a medio crear por un fallo (se compensa y '
  'se borra); una fila PAID sin movimiento es una inconsistencia a auditar.';

-- ─────────────────────────────────────────────────────
-- 2. Trigger updated_at (reusa helper existente).
-- ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS referral_settlements_updated_at ON public.referral_settlements;
CREATE TRIGGER referral_settlements_updated_at
  BEFORE UPDATE ON public.referral_settlements
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─────────────────────────────────────────────────────
-- 3. RLS: aislamiento por tenant (defensa en profundidad).
-- ─────────────────────────────────────────────────────
ALTER TABLE public.referral_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_settlements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referral_settlements_tenant_isolation ON public.referral_settlements;
CREATE POLICY referral_settlements_tenant_isolation ON public.referral_settlements
  FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_settlements TO authenticated;

-- ─────────────────────────────────────────────────────
-- 4. referral_commissions: vínculo a la liquidación.
-- ─────────────────────────────────────────────────────
-- Va ÚLTIMO a propósito. Es lo único que toca una tabla que ya está en uso, y
-- `ADD COLUMN` toma AccessExclusiveLock sobre ella hasta el COMMIT: cuanto más
-- tarde se tome, menos tiempo quedan esperando los lectores de la tabla. Un
-- primer intento de esta migración murió por deadlock justamente sobre
-- referral_commissions, contra un proceso concurrente ajeno a este cambio.
--
-- Es aditiva y nullable: en Postgres ≥11 no reescribe la tabla, es metadata.
-- Las comisiones existentes quedan con settlement_id NULL, que es exactamente
-- el estado "pagada sin salida de caja" que la pantalla ofrece regularizar.
ALTER TABLE public.referral_commissions
  ADD COLUMN IF NOT EXISTS settlement_id UUID
    REFERENCES public.referral_settlements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_referral_commissions_settlement
  ON public.referral_commissions(settlement_id)
  WHERE settlement_id IS NOT NULL;

COMMENT ON COLUMN public.referral_commissions.settlement_id IS
  'Liquidación en la que se pagó esta comisión. NULL + status=PAID significa que '
  'se marcó como pagada con el flujo viejo, SIN salida de caja: la pantalla de '
  'Referidos la señala para poder regularizarla.';

COMMIT;
