-- =====================================================
-- Migración: el plan de cuentas es por organización, no global
-- =====================================================
-- Contexto (VIB-145): la migración 053 definió
--
--   account_code TEXT NOT NULL UNIQUE
--
-- es decir, un UNIQUE **global** sobre `account_code`. Cuando la tabla pasó a
-- ser multi-tenant (migración 134 agregó `org_id`) ese constraint quedó como
-- estaba, y desde entonces contradice el modelo: dos organizaciones no pueden
-- tener ambas su cuenta "1.1.03 — Cuentas por Cobrar".
--
-- Efecto real medido en producción al 2026-08-19:
--
--   * 19 organizaciones, pero solo Lozada Rosario tiene plan de cuentas (58).
--     Compañía de Viajes tiene 2 y el resto 0.
--   * De las 5 orgs con operaciones, 4 no tienen NINGUNA línea de asiento con
--     `chart_account_id`, y todos sus asientos son de origen AUTO_PAYMENT.
--     Nunca se generó un asiento de venta, costo ni comisión para ellas.
--
-- La causa: `seedChartOfAccountsForOrg` inserta cuenta por cuenta y lanza
-- excepción ante el primer error, así que el choque contra el UNIQUE global
-- abortaba el sembrado entero de cada org nueva.
--
-- El invariante correcto es "el código de cuenta es único DENTRO de cada
-- organización".
--
-- Nota sobre el orden de las migraciones: la 053 y la 20260414000146 usan
-- `ON CONFLICT (account_code)`, que necesita el índice viejo. Ambas corren
-- ANTES que esta, así que en una base desde cero el orden sigue siendo válido.
-- =====================================================

-- El constraint viejo se creó como UNIQUE de columna, así que Postgres lo
-- expone como constraint (con su índice homónimo). Se dropea el constraint;
-- si en algún entorno quedó solo el índice, el DROP INDEX lo cubre.
ALTER TABLE chart_of_accounts
  DROP CONSTRAINT IF EXISTS chart_of_accounts_account_code_key;

DROP INDEX IF EXISTS chart_of_accounts_account_code_key;

-- Único por organización. Las filas con org_id NULL (no debería haber ninguna)
-- quedan fuera del índice: Postgres trata los NULL como distintos entre sí.
CREATE UNIQUE INDEX IF NOT EXISTS chart_of_accounts_org_account_code_unique
  ON chart_of_accounts (org_id, account_code);

COMMENT ON INDEX chart_of_accounts_org_account_code_unique IS
  'El código de cuenta es único dentro de cada organización, no globalmente. Reemplaza al UNIQUE global de la migración 053, que impedía sembrar el plan de cuentas de una segunda org y dejaba a 4 de 5 agencias activas sin contabilidad de doble partida (VIB-145).';
