-- =====================================================
-- Migración: fecha máxima de pago del cliente por operación
--
-- La agencia define hasta cuándo tiene el pasajero para completar el pago de
-- la operación. Antes el "Detalle de la Operación" (statement PDF) derivaba
-- esa fecha de operator_payments.due_date / payments.date_due y terminaba
-- mostrando la fecha de SALIDA, lo que confunde al pasajero (el saldo suele
-- vencer ~1 mes antes de viajar). Ahora es un campo explícito de la operación.
--
-- Read-time: el statement usa esta fecha; si es NULL muestra "a convenir".
-- No afecta contabilidad ni vencimientos a operadores.
-- =====================================================

ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS customer_payment_deadline DATE;

COMMENT ON COLUMN operations.customer_payment_deadline IS
  'Fecha máxima para que el cliente complete el pago de la operación. La define la agencia. Usada en el PDF "Detalle de la Operación". NULL → "a convenir".';
