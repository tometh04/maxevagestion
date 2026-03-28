-- Migration 122: Mark legacy commission tables as deprecated
-- Tables commission_schemes, commissions, commission_details are superseded by commission_records + commission_rules
-- Keeping tables for historical data reference, but they are no longer used by the application
--
-- Legacy tables were created in migration 073_create_commissions.sql
-- The active commission system uses:
--   - commission_records (individual commission entries per operation/seller)
--   - commission_rules (configurable commission rules per agency/seller)

COMMENT ON TABLE commissions IS 'DEPRECATED: Use commission_records instead. Legacy table from migration 073, no longer referenced by application code.';
COMMENT ON TABLE commission_schemes IS 'DEPRECATED: Use commission_rules instead. Legacy table from migration 073, no longer referenced by application code.';
COMMENT ON TABLE commission_details IS 'DEPRECATED: Use commission_records instead. Legacy table from migration 073, no longer referenced by application code.';
