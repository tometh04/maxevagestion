-- WHA Control: RLS con rol, no solo con tenant.
--
-- Las políticas de las tablas wa_* solo exigían que la fila fuera de la
-- organización del usuario (`org_id IN (SELECT user_org_ids())`), con
-- `FOR ALL TO authenticated`. El gate de rol (SUPER_ADMIN / ORG_OWNER / ADMIN)
-- vivía únicamente en las rutas de la API.
--
-- Consecuencia: cualquier usuario logueado de la organización —un vendedor, un
-- viewer— podía leer TODAS las conversaciones de WhatsApp del tenant hablando
-- directo con Supabase desde el browser con la anon key (que es pública por
-- diseño), e incluso escribir o borrar, porque la policy era FOR ALL. La UI no
-- lo ofrecía, pero el dato estaba abierto.
--
-- Ninguna ruta de la app lee estas tablas con la sesión del usuario: todas usan
-- service role, que no pasa por RLS. Así que sumar la condición de rol no
-- cambia el funcionamiento y cierra el acceso directo.

CREATE OR REPLACE FUNCTION public.can_access_wha_control()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = auth.uid()
      AND (
        u.role IN ('SUPER_ADMIN', 'ORG_OWNER', 'ADMIN')
        OR u.additional_roles && ARRAY['SUPER_ADMIN', 'ORG_OWNER', 'ADMIN']::text[]
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_wha_control() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_wha_control() TO authenticated, service_role;

-- wa_devices
DROP POLICY IF EXISTS "wa_devices_tenant_isolation" ON wa_devices;
CREATE POLICY "wa_devices_tenant_isolation" ON wa_devices
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()) AND public.can_access_wha_control())
  WITH CHECK (org_id IN (SELECT user_org_ids()) AND public.can_access_wha_control());

-- wa_chats
DROP POLICY IF EXISTS "wa_chats_tenant_isolation" ON wa_chats;
CREATE POLICY "wa_chats_tenant_isolation" ON wa_chats
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()) AND public.can_access_wha_control())
  WITH CHECK (org_id IN (SELECT user_org_ids()) AND public.can_access_wha_control());

-- wa_messages
DROP POLICY IF EXISTS "wa_messages_tenant_isolation" ON wa_messages;
CREATE POLICY "wa_messages_tenant_isolation" ON wa_messages
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()) AND public.can_access_wha_control())
  WITH CHECK (org_id IN (SELECT user_org_ids()) AND public.can_access_wha_control());

-- Datos derivados del mismo módulo: mapeo LID→teléfono (datos de contacto),
-- seguimientos post-cotización y su configuración.
DROP POLICY IF EXISTS "wa_lid_map_tenant_isolation" ON wa_lid_map;
CREATE POLICY "wa_lid_map_tenant_isolation" ON wa_lid_map
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()) AND public.can_access_wha_control())
  WITH CHECK (org_id IN (SELECT user_org_ids()) AND public.can_access_wha_control());

DROP POLICY IF EXISTS "wa_quote_followups_tenant_isolation" ON wa_quote_followups;
CREATE POLICY "wa_quote_followups_tenant_isolation" ON wa_quote_followups
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()) AND public.can_access_wha_control())
  WITH CHECK (org_id IN (SELECT user_org_ids()) AND public.can_access_wha_control());

DROP POLICY IF EXISTS "wa_followup_settings_tenant_isolation" ON wa_followup_settings;
CREATE POLICY "wa_followup_settings_tenant_isolation" ON wa_followup_settings
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()) AND public.can_access_wha_control())
  WITH CHECK (org_id IN (SELECT user_org_ids()) AND public.can_access_wha_control());
