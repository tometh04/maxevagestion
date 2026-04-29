-- Seller Objectives / Goals System
-- Allows admin to set rules for bonus commissions based on sales targets

CREATE TABLE IF NOT EXISTS seller_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- Metric to track
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'TRIPS_SOLD',           -- Number of trips sold in period
    'REVENUE_AMOUNT',       -- Total revenue amount in period
    'MARGIN_AMOUNT',        -- Total margin amount in period
    'NEW_CUSTOMERS',        -- New customers acquired
    'CONVERSION_RATE'       -- Lead to operation conversion rate
  )),

  -- Target value
  target_value NUMERIC NOT NULL,
  target_currency TEXT DEFAULT 'ARS', -- For monetary metrics

  -- Reward when objective is met
  reward_type TEXT NOT NULL CHECK (reward_type IN (
    'BONUS_PERCENTAGE',     -- Extra commission percentage
    'BONUS_FIXED',          -- Fixed bonus amount
    'PERCENTAGE_INCREASE'   -- Increase base commission percentage
  )),
  reward_value NUMERIC NOT NULL,
  reward_currency TEXT DEFAULT 'ARS',

  -- Period
  period_type TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (period_type IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),

  -- Applicability
  seller_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = applies to all sellers
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

-- Track objective progress/completion
CREATE TABLE IF NOT EXISTS seller_objective_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id UUID NOT NULL REFERENCES seller_objectives(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Progress
  current_value NUMERIC NOT NULL DEFAULT 0,
  target_value NUMERIC NOT NULL,
  is_achieved BOOLEAN NOT NULL DEFAULT false,
  achieved_at TIMESTAMPTZ,

  -- Reward
  reward_amount NUMERIC,
  reward_paid BOOLEAN NOT NULL DEFAULT false,
  reward_paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seller_objectives_agency ON seller_objectives(agency_id);
CREATE INDEX IF NOT EXISTS idx_seller_objectives_seller ON seller_objectives(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_objective_records_seller ON seller_objective_records(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_objective_records_period ON seller_objective_records(period_start, period_end);

COMMENT ON TABLE seller_objectives IS 'Commission bonus rules based on sales objectives';
COMMENT ON TABLE seller_objective_records IS 'Tracking of seller progress towards objectives';
