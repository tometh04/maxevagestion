-- Línea de crédito / giro en descubierto configurable por cuenta financiera.
--
-- Contexto: hasta ahora `validateSufficientBalance()` bloqueaba TODO egreso que
-- dejara la cuenta en negativo ("NUNCA se permite saldo negativo"). Ese guardrail
-- atrapa errores de carga, pero impide modelar cuentas que legítimamente operan en
-- descubierto (cuenta corriente bancaria con giro, cuenta con financiera donde se
-- paga a proveedores quedando en deuda y se netea cuando entra dinero).
--
-- `credit_limit` = monto MÁXIMO de saldo negativo permitido, EN LA MONEDA DE LA
-- CUENTA. Semántica:
--   0 (default)  → comportamiento legacy: no se permite saldo negativo.
--   N > 0        → se permite que el saldo baje hasta -N (giro en descubierto de N).
-- No existe "ilimitado" como flag: para un flotante sin tope práctico se carga un
-- número muy alto. El modelo correcto es siempre un tope explícito, no infinito.

ALTER TABLE financial_accounts
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0;

-- El límite de crédito no puede ser negativo (un límite negativo no tiene sentido).
ALTER TABLE financial_accounts
  DROP CONSTRAINT IF EXISTS financial_accounts_credit_limit_non_negative;
ALTER TABLE financial_accounts
  ADD CONSTRAINT financial_accounts_credit_limit_non_negative
  CHECK (credit_limit >= 0);

COMMENT ON COLUMN financial_accounts.credit_limit IS
  'Máximo saldo negativo permitido (giro en descubierto) en la moneda de la cuenta. 0 = no se permite negativo (default). El saldo puede bajar hasta -credit_limit.';
