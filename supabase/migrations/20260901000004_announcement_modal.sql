-- Novedades que se muestran como modal al entrar
--
-- POR QUE
-- -------
-- La campana de novedades es opt-in: hay que ir a buscarla y compite con todo lo
-- demas. Alcanza para "mejoramos el filtro de X", pero no para un release que
-- ademas le PIDE algo al usuario.
--
-- El caso concreto que lo motiva: la tanda contable no queda operativa hasta que
-- cada agencia defina desde cuando lleva su contabilidad en vibook y con que
-- cotizacion valua. Sin eso el Balance no se puede emitir, y hoy ninguna
-- organizacion lo tiene cargado. Un aviso que no interrumpe no va a mover esa
-- aguja.
--
-- ES UNA NOVEDAD CON CAMPOS EXTRA, NO UN CONCEPTO NUEVO
-- -----------------------------------------------------
-- El modal se apoya en la fila de `announcements` que ya existe. Asi se
-- administra donde ya se administran las novedades, el changelog global queda
-- completo —el aviso importante tambien queda en la campana— y `npm run
-- announce` se extiende en vez de duplicarse.
--
-- Todas las columnas son opcionales: una novedad comun no cambia en nada.

BEGIN;

-- ============================================================
-- 1. Los campos del modal
-- ============================================================
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS modal boolean NOT NULL DEFAULT false,
  -- Ventana de exhibicion. Ambas pueden ir en null: sin inicio arranca ya, sin
  -- fin no vence. Un modal sin vencimiento es una decision, no un olvido, asi
  -- que se permite pero la pantalla de admin lo advierte.
  ADD COLUMN IF NOT EXISTS modal_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS modal_ends_at timestamptz,
  -- Roles que ven el modal. NULL = todos.
  --
  -- Restringe la INTERRUPCION, no la informacion: la novedad se sigue viendo en
  -- la campana para cualquiera. Un vendedor no necesita que le frenen la pantalla
  -- con la configuracion contable, pero tampoco hay motivo para ocultarsela.
  ADD COLUMN IF NOT EXISTS modal_roles text[],
  -- Boton opcional. Sin esto, un aviso que pide configurar algo deja al usuario
  -- buscando donde, que es la forma mas segura de que no lo haga.
  ADD COLUMN IF NOT EXISTS modal_cta_label text,
  ADD COLUMN IF NOT EXISTS modal_cta_href text;

-- El destino tiene que ser una ruta interna. Es un campo administrable que
-- termina en un enlace que el usuario clickea: si aceptara URLs completas seria
-- una redireccion abierta cargable desde el panel.
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_modal_cta_href_interna;
ALTER TABLE announcements ADD CONSTRAINT announcements_modal_cta_href_interna
  CHECK (modal_cta_href IS NULL OR modal_cta_href ~ '^/[^/]');

CREATE INDEX IF NOT EXISTS idx_announcements_modal_vigentes
  ON announcements (published_at DESC)
  WHERE modal = true AND published = true;

COMMENT ON COLUMN announcements.modal_roles IS
  'Roles que ven el modal; NULL = todos. Restringe la interrupcion, no la informacion: la novedad se sigue viendo en la campana para cualquiera.';

-- ============================================================
-- 2. El descarte, en tabla propia
-- ============================================================
-- NO puede reusar `announcement_reads`.
--
-- `POST /api/announcements/mark-read` sin `ids` marca TODAS las novedades
-- publicadas de una sola vez —es lo que hace la campana al abrirse—. Si el
-- descarte del modal viviera ahi, cualquiera que abriera la campana perderia el
-- modal sin haberlo visto nunca, y encima en silencio.
--
-- Son dos gestos distintos: "ya lo lei en la lista" y "no me lo muestres mas en
-- el medio de la pantalla". Merecen dos registros.
CREATE TABLE IF NOT EXISTS announcement_modal_dismissals (
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dismissed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_modal_dismissals_user
  ON announcement_modal_dismissals(user_id);

ALTER TABLE announcement_modal_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_modal_dismissals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcement_modal_dismissals_self ON announcement_modal_dismissals;
CREATE POLICY announcement_modal_dismissals_self ON announcement_modal_dismissals
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = announcement_modal_dismissals.user_id
        AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = announcement_modal_dismissals.user_id
        AND u.auth_id = auth.uid()
    )
  );

COMMENT ON TABLE announcement_modal_dismissals IS
  'Usuarios que tildaron "no volver a mostrar" en el modal de una novedad. Separada de announcement_reads a proposito: abrir la campana marca todas las novedades como leidas y no debe descartar el modal.';

COMMIT;
