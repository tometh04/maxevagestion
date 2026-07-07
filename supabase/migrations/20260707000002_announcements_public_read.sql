-- Fix: la novedad no se veía para los usuarios de las agencias.
-- La policy de lectura original usaba `TO authenticated`, pero el server client
-- (lib/supabase/server.ts) lee con la anon key + cookies y en este proyecto la
-- RLS por rol es poco confiable (por eso todo filtra org_id explícito). El patrón
-- probado para tablas globales es el de kb_articles: SELECT sin restricción de rol,
-- gateado solo por `published = true`. El endpoint HTTP igual exige usuario logueado
-- (getCurrentUser), así que no se expone data sensible.

DROP POLICY IF EXISTS announcements_read ON announcements;
CREATE POLICY announcements_read ON announcements
  FOR SELECT
  USING (published = true);

-- announcement_reads (tracking de "leído" por usuario) sigue scopeada por usuario:
-- se recrea sin `TO authenticated` para que funcione con el mismo path del server
-- client, manteniendo el gate por users.auth_id = auth.uid().
DROP POLICY IF EXISTS announcement_reads_self ON announcement_reads;
CREATE POLICY announcement_reads_self ON announcement_reads
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = announcement_reads.user_id
        AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = announcement_reads.user_id
        AND u.auth_id = auth.uid()
    )
  );
