-- =====================================================
-- Migración 141: Fix execute_readonly_query a SECURITY INVOKER
-- =====================================================
-- SaaS Pilar 2c — Cierre del leak de la RPC SECURITY DEFINER.
--
-- Antes: `execute_readonly_query` corría como owner (superuser) y bypassea
-- RLS. Cualquier caller authenticated podía agregar data cross-org.
--
-- Ahora: la función corre con los permisos del caller. Si es un user
-- autenticado (JWT), las queries respetan RLS tenant_isolation y cada
-- tenant ve solo sus propias rows.
--
-- Seguro de aplicar porque ya refactorizamos lib/accounting/ledger.ts y
-- lib/accounting/journal-entries.ts para usar el server client del caller
-- en lugar de un admin client interno (mig 2c, commit d88cda5).
--
-- IMPORTANTE: usamos ALTER FUNCTION en vez de CREATE OR REPLACE para
-- tocar el atributo de seguridad sin re-parsear el body — así evitamos
-- cualquier bug de parsing de dollar-quoted strings en el SQL editor.

ALTER FUNCTION execute_readonly_query(TEXT) SECURITY INVOKER;

COMMENT ON FUNCTION execute_readonly_query(TEXT) IS
  'Ejecuta queries SELECT de forma segura. SECURITY INVOKER desde mig 141 — cada caller ve solo las rows que RLS le permite (SaaS tenant isolation).';
