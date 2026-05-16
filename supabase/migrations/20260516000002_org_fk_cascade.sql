-- Migración 2026-05-16: arreglar FKs que bloquean DELETE de organizations
--
-- PROBLEMA:
--   Al intentar borrar una org desde /admin/orgs/[id], el DELETE fallaba
--   silenciosamente (el endpoint devolvía error pero la UI lo ocultaba o
--   el toast no se veía).
--
--   Audit de pg_constraint reveló 2 FKs problemáticas:
--   1. afip_voucher_requests.org_id → NO ACTION (bloquea el delete)
--   2. users.org_id → SET NULL (no bloquea pero deja users huérfanos
--      con org_id=NULL, lo cual es bug en el modelo SaaS)
--
-- FIX:
--   Ambas FKs a ON DELETE CASCADE para que el delete de una org barra
--   todo lo asociado, incluyendo los users.
--
--   Auth.users se sigue borrando aparte (vía Supabase admin SDK) porque
--   public.users.auth_id → auth.users.id es FK propia, no a organizations.

BEGIN;

-- 1) afip_voucher_requests: NO ACTION → CASCADE
ALTER TABLE afip_voucher_requests
  DROP CONSTRAINT IF EXISTS afip_voucher_requests_org_id_fkey;
ALTER TABLE afip_voucher_requests
  ADD CONSTRAINT afip_voucher_requests_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- 2) users: SET NULL → CASCADE
-- Cuando se borra la org, los public.users de esa org se eliminan también.
-- Esto es semánticamente correcto: el user pertenece a la org, no existe
-- "fuera" de ella en el modelo SaaS.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_org_id_fkey;
ALTER TABLE users
  ADD CONSTRAINT users_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

COMMIT;

-- NOTA: dejamos SET NULL en audit_logs, billing_events y security_audit_log
-- a propósito — esos logs deben preservarse históricamente aunque la org
-- desaparezca, con org_id null indicando "org borrada".
