-- Fix: 500 en /api/announcements para usuarios autenticados.
-- Causa: la policy announcements_admin_all hacía EXISTS(... platform_admins ...),
-- y platform_admins tiene una policy RLS auto-referencial → "infinite recursion
-- detected in policy for relation platform_admins". Con rol anon no se disparaba
-- (la policy admin es TO authenticated), pero con el rol authenticated del usuario
-- real la query de SELECT evaluaba la policy admin → recursión → error.
--
-- Las novedades se escriben SIEMPRE con el admin client (service role, que bypassa
-- RLS), así que esta policy de escritura es innecesaria. Se elimina:
--   - Lectura: sigue via announcements_read (published = true).
--   - Escritura: sin policy → denegada para authenticated/anon; solo service role
--     (admin API + script npm run announce) puede escribir. Más seguro.

DROP POLICY IF EXISTS announcements_admin_all ON announcements;
