-- Sistema de aprobación de pagos (#14 reunión Gabi)
-- approval_status default 'NONE' = backward compat: pagos viejos no requieren aprobación.

-- payments
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'NONE'
    CHECK (approval_status IN ('NONE','PENDING_APPROVAL','APPROVED','REJECTED')),
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_pending_approval
  ON payments (created_at DESC)
  WHERE approval_status = 'PENDING_APPROVAL';

-- operator_payments
ALTER TABLE operator_payments
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'NONE'
    CHECK (approval_status IN ('NONE','PENDING_APPROVAL','APPROVED','REJECTED')),
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_operator_payments_pending_approval
  ON operator_payments (created_at DESC)
  WHERE approval_status = 'PENDING_APPROVAL';

-- alert_type new values
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_type_check' AND table_name = 'alerts'
  ) THEN
    ALTER TABLE alerts DROP CONSTRAINT alerts_type_check;
  END IF;

  ALTER TABLE alerts ADD CONSTRAINT alerts_type_check
    CHECK (type IN (
      'PAYMENT_DUE', 'PAYMENT_OVERDUE', 'UPCOMING_TRIP',
      'DOCUMENT_MISSING', 'DOCUMENT_EXPIRING', 'BIRTHDAY',
      'PASSPORT_EXPIRY', 'DESTINATION_REQUIREMENT',
      'RECURRING_PAYMENT', 'TASK_REMINDER', 'TASK_ASSIGNED',
      'MISSING_INVOICE', 'QUOTATION_ACCEPTED',
      'PAYMENT_PENDING_APPROVAL', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED',
      'OTHER'
    ));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando constraint: %', SQLERRM;
END $$;
