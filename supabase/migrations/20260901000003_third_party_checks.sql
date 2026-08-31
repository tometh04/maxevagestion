-- Cheques de terceros: un cheque recibido no es plata todavia
--
-- EL PROBLEMA CONTABLE
-- --------------------
-- Hoy "Cheque" existe solo como etiqueta en el selector de forma de pago
-- (`lib/payments/payment-methods.ts`). El cobro entra a Caja o a un banco igual
-- que si fuera efectivo, y ahi termina: no hay numero, ni banco, ni librador, ni
-- fecha de cobro, ni estado.
--
-- Contablemente eso esta mal, y no por una formalidad. Un cheque recibido es un
-- **valor a depositar**: todavia no es dinero disponible, puede rebotar, y puede
-- endosarse para pagarle a un operador sin pasar nunca por la caja. Registrarlo
-- como efectivo infla la caja con plata que no existe y deja al contador sin
-- forma de saber cuanto de lo que figura como disponible es realmente cobrable.
--
-- Es la unica prestacion del modulo financiero que los tres sistemas argentinos
-- que miramos —Aptour, SAVIA, SiFactura— listan y vibook no tiene.
--
-- ADVERTENCIA HONESTA SOBRE EL USO REAL
-- --------------------------------------
-- De 6.300 pagos en produccion, **cero** usan el metodo "Cheque", que ya esta en
-- el desplegable hace meses. Puede ser que las agencias no operen con cheques o
-- que los carguen como Efectivo por falta de una opcion mejor. Se construye
-- igual por decision del usuario, sabiendo esto.
--
-- LA DECISION DE DISENO: LA CARTERA ES UNA CUENTA FINANCIERA
-- ----------------------------------------------------------
-- El cheque en cartera vive en una `financial_accounts` de tipo nuevo
-- CHECK_PORTFOLIO, mapeada a la cuenta 1.1.09 Valores a Depositar.
--
-- Eso hace que no haya que inventar nada: el saldo, el mayor, las
-- transferencias, el balance y los estados contables ya saben trabajar con
-- cuentas financieras. Cobrar con cheque es un cobro contra esa cuenta;
-- depositarlo es una transferencia de la cartera al banco, que
-- `createTransferJournalEntry` ya resuelve.
--
-- La tabla de abajo NO guarda plata: guarda la **identidad** del cheque (numero,
-- banco, librador, vencimiento) y su **estado**. La plata la sigue llevando el
-- ledger, que es donde tiene que estar.
--
-- POR QUE EL ESTADO NO VA EN `payments.status`
-- ---------------------------------------------
-- El CHECK `payments_status_check` admite solo PENDING, PAID y OVERDUE. Meter
-- ahi RECHAZADO o ENDOSADO obligaria a tocar un constraint del que dependen
-- todos los flujos de cobro, de pago a operadores y de conciliacion. El ciclo de
-- vida de un cheque es un problema del cheque, no del pago que lo origino.

BEGIN;

-- ============================================================
-- 1. La cuenta contable: 1.1.09 Valores a Depositar
-- ============================================================
-- Para todas las orgs que ya tienen plan. Las nuevas la heredan solas: el
-- trigger de 20260901000002 clona el plan de la org template, que recibe la
-- cuenta en esta misma migracion.
--
-- Todo se deriva de 1.1.01 (Caja) en lugar de hardcodearse: mismo rubro padre,
-- misma subcategoria, mismo account_type. Asi la cuenta queda colgada donde
-- corresponde en cada org aunque alguna haya tocado su plan.
INSERT INTO chart_of_accounts (
  org_id, account_code, account_name, category, subcategory, account_type,
  level, parent_id, is_movement_account, is_active, display_order, description
)
SELECT
  caja.org_id,
  '1.1.09',
  'Valores a Depositar',
  caja.category,
  caja.subcategory,
  caja.account_type,
  caja.level,
  caja.parent_id,
  true,
  true,
  caja.display_order + 8,
  'Cheques de terceros recibidos y todavia no depositados. No son dinero disponible: pueden rebotar o endosarse.'
FROM chart_of_accounts caja
WHERE caja.account_code = '1.1.01'
  AND NOT EXISTS (
    SELECT 1 FROM chart_of_accounts c
    WHERE c.org_id = caja.org_id AND c.account_code = '1.1.09'
  );

-- ============================================================
-- 2. El tipo de cuenta financiera
-- ============================================================
-- La lista de tipos validos esta duplicada a mano: este CHECK y el array
-- `validTypes` de app/api/accounting/financial-accounts/route.ts. Si se toca uno
-- solo, el alta falla con un error generico.
ALTER TABLE financial_accounts DROP CONSTRAINT IF EXISTS financial_accounts_type_check;

ALTER TABLE financial_accounts ADD CONSTRAINT financial_accounts_type_check
  CHECK (type IN (
    'SAVINGS_ARS', 'SAVINGS_USD', 'CHECKING_ARS', 'CHECKING_USD',
    'CASH_ARS', 'CASH_USD', 'CREDIT_CARD', 'ASSETS', 'PARTNER',
    'CHECK_PORTFOLIO'
  ));

-- ============================================================
-- 3. La tabla
-- ============================================================
CREATE TABLE IF NOT EXISTS public.third_party_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,

  -- El pago que lo origino. SET NULL y no CASCADE ni RESTRICT, a proposito:
  --
  --   - CASCADE borraria el cheque al borrar el pago, incluso si el cheque ya
  --     fue depositado y tiene movimientos de ledger propios. Quedarian esos
  --     movimientos sin nada que los explique.
  --   - RESTRICT bloquearia el borrado del pago con un error generico de FK. Ya
  --     nos paso con `tax_withholdings.operation_id`: una percepcion huerfana
  --     impedia borrar la operacion y el mensaje no decia por que.
  --
  -- Con SET NULL el cheque sobrevive con todos sus datos —son propios, no
  -- derivados del pago— y el arqueo de cartera muestra la diferencia.
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,

  -- Identidad del cheque. Es lo que se compara contra el papel.
  numero TEXT NOT NULL,
  banco TEXT NOT NULL,
  librador TEXT,
  cuit_librador TEXT,

  importe NUMERIC(15, 2) NOT NULL CHECK (importe > 0),
  moneda TEXT NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS', 'USD')),

  fecha_emision DATE,
  -- La fecha desde la que se puede cobrar. Es el dato que ordena la cartera: un
  -- cheque a 90 dias no es lo mismo que uno al dia aunque el importe sea igual.
  fecha_cobro DATE NOT NULL,

  estado TEXT NOT NULL DEFAULT 'EN_CARTERA'
    CHECK (estado IN ('EN_CARTERA', 'DEPOSITADO', 'RECHAZADO', 'ENDOSADO')),
  fecha_estado DATE,

  -- Donde esta parado el cheque mientras esta en cartera.
  portfolio_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  -- A donde fue si se deposito.
  deposited_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  -- A quien se le endoso si se endoso.
  endorsed_operator_id UUID REFERENCES public.operators(id) ON DELETE SET NULL,

  -- Rastro contable de cada transicion.
  deposit_movement_id UUID REFERENCES public.ledger_movements(id) ON DELETE SET NULL,
  rejection_movement_id UUID REFERENCES public.ledger_movements(id) ON DELETE SET NULL,
  endorsement_movement_id UUID REFERENCES public.ledger_movements(id) ON DELETE SET NULL,

  notas TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dos cheques distintos pueden tener el mismo numero si son de bancos distintos,
-- y el mismo banco puede repetir numeracion entre chequeras. La combinacion que
-- si tiene que ser unica dentro de una agencia es banco + numero: si aparece
-- repetida, es que se cargo dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS third_party_checks_org_banco_numero_unique
  ON public.third_party_checks (org_id, banco, numero);

CREATE INDEX IF NOT EXISTS idx_third_party_checks_org_estado
  ON public.third_party_checks (org_id, estado);
CREATE INDEX IF NOT EXISTS idx_third_party_checks_fecha_cobro
  ON public.third_party_checks (org_id, fecha_cobro);
CREATE INDEX IF NOT EXISTS idx_third_party_checks_payment
  ON public.third_party_checks (payment_id);

DROP TRIGGER IF EXISTS third_party_checks_updated_at ON public.third_party_checks;
CREATE TRIGGER third_party_checks_updated_at
  BEFORE UPDATE ON public.third_party_checks
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE public.third_party_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS third_party_checks_tenant_isolation ON public.third_party_checks;
CREATE POLICY third_party_checks_tenant_isolation ON public.third_party_checks
  FOR ALL
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

COMMENT ON TABLE public.third_party_checks IS
  'Cheques de terceros recibidos: identidad y ciclo de vida. La plata la lleva el ledger contra la cuenta 1.1.09 Valores a Depositar; esta tabla no duplica saldos.';

COMMENT ON COLUMN public.third_party_checks.fecha_cobro IS
  'Fecha desde la que el cheque se puede cobrar. Ordena la cartera: un cheque a 90 dias no vale lo mismo que uno al dia.';

COMMIT;
