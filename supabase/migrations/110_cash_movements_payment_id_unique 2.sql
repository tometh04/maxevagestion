-- Prevenir duplicados de cash_movements para el mismo pago
-- Un pago solo puede tener un movimiento de caja asociado
CREATE UNIQUE INDEX IF NOT EXISTS cash_movements_payment_id_unique
  ON cash_movements(payment_id)
  WHERE payment_id IS NOT NULL;

-- Eliminar duplicados existentes antes de crear el constraint
-- Mantiene el cash_movement más reciente (mayor id) por payment_id
DELETE FROM cash_movements
WHERE id IN (
  SELECT a.id
  FROM cash_movements a
  JOIN cash_movements b ON a.payment_id = b.payment_id
  WHERE a.payment_id IS NOT NULL
    AND a.created_at < b.created_at
);
