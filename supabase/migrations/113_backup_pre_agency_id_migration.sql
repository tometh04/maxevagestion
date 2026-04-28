-- =====================================================
-- Migration 113: BACKUPS pre-migración Fase 1 import multi-tenant
-- =====================================================
-- Crea snapshots de las 4 tablas a las que vamos a agregar agency_id.
-- Estos backups permiten restauración completa si el backfill falla.
-- Se pueden borrar después de validar que Fase 1 quedó estable (>1 semana).
--
-- Spec: docs/superpowers/specs/2026-04-28-import-multitenant-design.md
-- Plan: docs/superpowers/plans/2026-04-28-import-multitenant-fase1.md
-- =====================================================

CREATE TABLE IF NOT EXISTS customers_backup_2026_04_28 AS
  SELECT * FROM customers;

CREATE TABLE IF NOT EXISTS operators_backup_2026_04_28 AS
  SELECT * FROM operators;

CREATE TABLE IF NOT EXISTS payments_backup_2026_04_28 AS
  SELECT * FROM payments;

CREATE TABLE IF NOT EXISTS cash_movements_backup_2026_04_28 AS
  SELECT * FROM cash_movements;

-- Verificación (counts deben coincidir con Pre-flight 8 de Task 1):
--   customers: 645
--   operators: 24
--   payments: 2.739
--   cash_movements: 2.343
SELECT 'customers_backup' AS tabla, COUNT(*) AS filas FROM customers_backup_2026_04_28
UNION ALL SELECT 'operators_backup', COUNT(*) FROM operators_backup_2026_04_28
UNION ALL SELECT 'payments_backup', COUNT(*) FROM payments_backup_2026_04_28
UNION ALL SELECT 'cash_movements_backup', COUNT(*) FROM cash_movements_backup_2026_04_28;
