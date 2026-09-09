-- WhatsApp central: cada vendedor vincula su propio teléfono.
--
-- Hasta ahora un `wa_devices` pertenecía a la agencia y el módulo era solo para
-- administración. La idea del producto cambia: el vendedor vincula su línea,
-- marca sus cotizaciones como enviadas y el sistema le manda el recordatorio.
--
-- Reglas que fija esta migración:
--   * `user_id` = dueño del teléfono. NULL = teléfono de la agencia (los que ya
--     existían quedan así).
--   * Un vendedor ve SOLO su teléfono y sus conversaciones, que es la
--     convención de SELLER en todo el sistema ("solo mis datos").
--   * Los administradores siguen viendo todo, que es como funciona hoy.
--
-- No se agrega un índice único por `user_id`: cada re-vinculación por QR crea
-- una fila nueva con el mismo teléfono (ver el dedupe del listado), así que el
-- "un teléfono activo por vendedor" se resuelve en el alta, dando de baja el
-- anterior.

ALTER TABLE wa_devices ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_devices_user ON wa_devices (user_id) WHERE user_id IS NOT NULL;

-- ¿Es dueño de este teléfono? SECURITY DEFINER para poder mirar wa_devices sin
-- que la propia policy se muerda la cola.
CREATE OR REPLACE FUNCTION public.owns_wha_device(p_device_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM wa_devices d
    WHERE d.id = p_device_id AND d.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.owns_wha_device(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_wha_device(UUID) TO authenticated, service_role;

-- Las policies pasan de "solo admins" a "admins, o el dueño del teléfono".
DROP POLICY IF EXISTS "wa_devices_tenant_isolation" ON wa_devices;
CREATE POLICY "wa_devices_tenant_isolation" ON wa_devices
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT user_org_ids())
    AND (public.can_access_wha_control() OR user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT user_org_ids())
    AND (public.can_access_wha_control() OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "wa_chats_tenant_isolation" ON wa_chats;
CREATE POLICY "wa_chats_tenant_isolation" ON wa_chats
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT user_org_ids())
    AND (public.can_access_wha_control() OR public.owns_wha_device(device_id))
  )
  WITH CHECK (
    org_id IN (SELECT user_org_ids())
    AND (public.can_access_wha_control() OR public.owns_wha_device(device_id))
  );

DROP POLICY IF EXISTS "wa_messages_tenant_isolation" ON wa_messages;
CREATE POLICY "wa_messages_tenant_isolation" ON wa_messages
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT user_org_ids())
    AND (public.can_access_wha_control() OR public.owns_wha_device(device_id))
  )
  WITH CHECK (
    org_id IN (SELECT user_org_ids())
    AND (public.can_access_wha_control() OR public.owns_wha_device(device_id))
  );

DROP POLICY IF EXISTS "wa_quote_followups_tenant_isolation" ON wa_quote_followups;
CREATE POLICY "wa_quote_followups_tenant_isolation" ON wa_quote_followups
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT user_org_ids())
    AND (public.can_access_wha_control() OR public.owns_wha_device(device_id))
  )
  WITH CHECK (
    org_id IN (SELECT user_org_ids())
    AND (public.can_access_wha_control() OR public.owns_wha_device(device_id))
  );

DROP POLICY IF EXISTS "wa_lid_map_tenant_isolation" ON wa_lid_map;
CREATE POLICY "wa_lid_map_tenant_isolation" ON wa_lid_map
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT user_org_ids())
    AND (public.can_access_wha_control() OR public.owns_wha_device(device_id))
  )
  WITH CHECK (
    org_id IN (SELECT user_org_ids())
    AND (public.can_access_wha_control() OR public.owns_wha_device(device_id))
  );

-- La configuración del seguimiento es de la organización: la edita quien
-- administra, no cada vendedor.
