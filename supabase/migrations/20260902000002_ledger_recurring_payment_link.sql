-- VIB-179 — Que un gasto fijo pagado se pueda borrar desde la pantalla
--
-- EL PEDIDO
-- ---------
-- Yamil: "necesito eliminar 4 gastos (...) son gastos fijos x eso no puedo
-- eliminarlos". Un gasto VARIABLE se borra desde Gastos → ⋮ → Eliminar desde
-- julio; uno FIJO no tiene esa acción, así que cada vez que se paga uno con la
-- fecha o el importe equivocados hay que pedirlo por WhatsApp y que alguien lo
-- borre a mano en la base.
--
-- POR QUÉ HACE FALTA ESTA COLUMNA
-- -------------------------------
-- Cuando se paga un gasto fijo, lo único que queda del vínculo con la
-- recurrencia es el TEXTO del concepto: "Gasto recurrente: <descripción>". No
-- hay ninguna columna que los una.
--
-- Para borrar el movimiento eso alcanzaría. Lo que no alcanza es para lo que
-- viene después: al borrar el pago, la recurrencia tiene que volver a quedar
-- pendiente del período que se borró, o el gasto se saltea un mes. Y para eso
-- hay que saber CUÁL recurrencia es. Dos oficinas pueden tener un gasto fijo
-- con la misma descripción —en Lozada conviven "Marketing" de Rosario y
-- "Marketing Bs As"—, y el movimiento no guarda la oficina: la hereda de la
-- cuenta financiera. Resolver eso por texto es adivinar.
--
-- ON DELETE SET NULL: si alguien borra la definición del gasto fijo, los pagos
-- que ya ocurrieron siguen existiendo. Son plata que salió.

BEGIN;

ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS recurring_payment_id UUID
  REFERENCES recurring_payments(id) ON DELETE SET NULL;

COMMENT ON COLUMN ledger_movements.recurring_payment_id IS
  'Gasto fijo que originó este movimiento (VIB-179). Permite borrar el pago y devolver la recurrencia al período que se borró. Antes el vínculo era sólo el texto del concepto.';

CREATE INDEX IF NOT EXISTS idx_ledger_movements_recurring_payment
  ON ledger_movements (recurring_payment_id)
  WHERE recurring_payment_id IS NOT NULL;

-- ============================================================
-- Backfill
-- ============================================================
-- Sólo donde el texto identifica UNA sola recurrencia dentro de la misma
-- organización. Donde hay dos con la misma descripción se deja en NULL a
-- propósito: adivinar mal el vínculo es peor que no tenerlo, porque el borrado
-- devolvería el período equivocado.
--
-- Se acota a los movimientos de dinero (`account_id` no nulo): las dos líneas
-- del asiento comparten concepto y no son el gasto, son su contabilidad.
WITH unicas AS (
  -- `array_agg(...)[1]` y no `min()`: no existe min(uuid). El HAVING garantiza
  -- que el grupo tiene exactamente una fila, así que el primero es el único.
  SELECT rp.org_id, rp.description, (array_agg(rp.id))[1] AS recurring_id
  FROM recurring_payments rp
  WHERE rp.description IS NOT NULL AND btrim(rp.description) <> ''
  GROUP BY rp.org_id, rp.description
  HAVING count(*) = 1
)
UPDATE ledger_movements lm
   SET recurring_payment_id = u.recurring_id
  FROM unicas u
 WHERE lm.recurring_payment_id IS NULL
   AND lm.account_id IS NOT NULL
   AND lm.org_id = u.org_id
   AND lm.concept = 'Gasto recurrente: ' || u.description;

COMMIT;
