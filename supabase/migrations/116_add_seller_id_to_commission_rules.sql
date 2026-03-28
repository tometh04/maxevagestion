-- Add seller_id column to commission_rules so each seller can have
-- their own commission percentage configured from Settings → Comisiones.
-- When seller_id IS NULL the rule acts as a generic fallback for all sellers.

ALTER TABLE commission_rules
  ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Index for fast lookup by seller
CREATE INDEX IF NOT EXISTS idx_commission_rules_seller_id
  ON commission_rules (seller_id);

-- Seed initial per-seller rules from the previously hard-coded percentages.
-- All rules are type='SELLER', basis='FIXED_PERCENTAGE', valid from today, no expiry.
INSERT INTO commission_rules (type, basis, value, seller_id, valid_from)
VALUES
  ('SELLER', 'FIXED_PERCENTAGE', 50, 'e86b35c1-f10c-4524-8f28-4a61ef6a3f20', CURRENT_DATE),  -- Maximiliano Di Franco
  ('SELLER', 'FIXED_PERCENTAGE', 35, '84c54c89-e6c3-4bac-80ac-9e2186eb3aaf', CURRENT_DATE),  -- Santiago Nader
  ('SELLER', 'FIXED_PERCENTAGE', 45, 'eca8bd76-50af-46f2-9d20-148e620a8f23', CURRENT_DATE),  -- Ramiro Airaldi
  ('SELLER', 'FIXED_PERCENTAGE', 35, 'a7fb94f9-1ef6-4749-b6eb-ac17b7f08a05', CURRENT_DATE),  -- Micaela Nader
  ('SELLER', 'FIXED_PERCENTAGE', 20, '888c7097-512d-47f3-96e8-25074de4179d', CURRENT_DATE),  -- Josefina Giordano
  ('SELLER', 'FIXED_PERCENTAGE', 15, 'c9d53499-e9bc-4f11-97b6-1eaf3f049723', CURRENT_DATE),  -- Candela Bertolotto
  ('SELLER', 'FIXED_PERCENTAGE', 15, '0f843ee8-2890-48ee-a51b-6d3511b980cc', CURRENT_DATE),  -- Emilia Roca
  ('SELLER', 'FIXED_PERCENTAGE', 13, 'd7b3e47e-1de9-456f-8d7d-6f26555a5a59', CURRENT_DATE),  -- Emilia Di Vito
  ('SELLER', 'FIXED_PERCENTAGE', 13, '92455378-c875-4a37-8ed1-617e91cf90e0', CURRENT_DATE),  -- Malena Rodriguez
  ('SELLER', 'FIXED_PERCENTAGE', 20, 'b9496cdb-7d18-473c-b9d8-2dafcc7e7912', CURRENT_DATE),  -- Yamil Isnaldo
  ('SELLER', 'FIXED_PERCENTAGE', 10, '3591726c-2891-49f4-94f4-27f15d584b16', CURRENT_DATE),  -- Martina Schiriatti
  ('SELLER', 'FIXED_PERCENTAGE', 50, '8ff855bb-d531-4ed5-a0bf-2888cc97f79f', CURRENT_DATE),  -- Julieta Suarez
  ('SELLER', 'FIXED_PERCENTAGE', 20, 'c6cc61f6-0954-4a26-b72b-40c1f0f5566f', CURRENT_DATE)   -- Naza
ON CONFLICT DO NOTHING;
