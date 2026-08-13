-- =====================================================
-- usage_events — sink propio de telemetria de producto
-- =====================================================
-- Fase 2 del mapa de calor. La fase 1 (20260813000001) deriva la actividad de
-- las tablas de dominio: es exacta y retroactiva, pero solo ve ESCRITURAS.
-- Alguien que entra todos los dias a mirar reportes y no escribe nada aparece
-- como inactivo.
--
-- Esta tabla cubre exactamente ese hueco.
--
-- REGLA QUE SOSTIENE EL DISEÑO: si la accion ya deja una fila en una tabla de
-- dominio, NO se emite evento aca. De lo contrario el heatmap contaria lo mismo
-- dos veces y ninguna de las dos cifras seria confiable. Por eso el catalogo
-- (`lib/analytics/events.ts`) declara sink `db` solo para eventos de lectura y
-- para `ai_query_submitted` (Cerebro no deja fila por consulta).
--
-- Escrituras: solo service_role, via `createOrgAdminScope` desde
-- `app/api/telemetry/route.ts`, que resuelve el org_id de la SESION. El cliente
-- nunca manda org_id: seria dejar que cualquiera escriba telemetria en el tenant
-- que quiera.

BEGIN;

CREATE TABLE IF NOT EXISTS usage_events (
  -- bigserial y no uuid: es la tabla de mayor volumen del schema y el indice de
  -- una PK aleatoria de 16 bytes se fragmenta mucho mas que uno secuencial.
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- ON DELETE SET NULL: borrar un usuario no puede borrar la historia de uso de
  -- la agencia.
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  module TEXT,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE usage_events IS
  'Eventos de LECTURA del producto. Las escrituras se derivan de las tablas de dominio (ver _admin_usage_events). Sin PII: pasa por scrubParams().';
COMMENT ON COLUMN usage_events.occurred_at IS
  'Reloj del cliente, acotado a +-1h en el server (clampOccurredAt).';

-- La query del heatmap es "por org y modulo en los ultimos N dias".
CREATE INDEX IF NOT EXISTS idx_usage_events_org_time
  ON usage_events (org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_module_time
  ON usage_events (module, occurred_at DESC);
-- Para la purga por retencion.
CREATE INDEX IF NOT EXISTS idx_usage_events_occurred_at
  ON usage_events (occurred_at);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events FORCE ROW LEVEL SECURITY;

-- Solo platform admins leen. No hay policy de INSERT/UPDATE/DELETE: bloqueo
-- total para anon y authenticated. Los writes entran por service_role, que
-- bypassea RLS.
--
-- Decision consciente: un tenant NO ve su propio stream crudo. Cada fila dice
-- que miro cada usuario y a que hora; expuesto dentro de la agencia es una
-- herramienta de vigilancia sobre los empleados. El dia que se exponga por
-- tenant, va agregado y nunca por persona.
DROP POLICY IF EXISTS "usage_events_platform_admin_read" ON usage_events;
CREATE POLICY "usage_events_platform_admin_read" ON usage_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------
-- Lecturas por org y modulo — la otra mitad del heatmap
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_usage_reads_by_org_module(p_days INT DEFAULT 30)
RETURNS TABLE (org_id UUID, module TEXT, events BIGINT, actors BIGINT, last_event_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT e.org_id,
         COALESCE(e.module, 'other'),
         COUNT(*)::BIGINT,
         COUNT(DISTINCT e.user_id)::BIGINT,
         MAX(e.occurred_at)
  FROM usage_events e
  WHERE e.occurred_at >= NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))
  GROUP BY e.org_id, COALESCE(e.module, 'other')
$$;

REVOKE ALL ON FUNCTION public.admin_usage_reads_by_org_module(INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_usage_reads_by_org_module(INT) TO service_role;

-- -----------------------------------------------------------------
-- Referidos: faltaba en la union de escrituras
-- -----------------------------------------------------------------
-- El modulo existe, tiene reporte propio (VIB-122) y sus tablas quedaron fuera
-- de la primera version. Se agrega aca para que la columna del heatmap no
-- mienta con ceros.
--
-- `referral_commissions` NO entra: la calcula el sistema a partir de las ventas,
-- igual que `commission_records`.
CREATE OR REPLACE FUNCTION public._admin_usage_events(p_since TIMESTAMPTZ)
RETURNS TABLE (org_id UUID, actor_id UUID, module TEXT, occurred_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  -- CRM
  SELECT org_id, assigned_seller_id, 'crm', created_at FROM leads
    WHERE created_at >= p_since
      AND COALESCE(LOWER(source), '') NOT IN
          ('manychat', 'callbell', 'chatsell', 'eve', 'emilia', 'agente blanco')
  UNION ALL
  SELECT org_id, user_id, 'crm', created_at FROM lead_comments WHERE created_at >= p_since

  -- Ingesta automatica (no es uso de la app)
  UNION ALL
  SELECT org_id, NULL, 'ingestion', created_at FROM leads
    WHERE created_at >= p_since
      AND COALESCE(LOWER(source), '') IN
          ('manychat', 'callbell', 'chatsell', 'eve', 'emilia', 'agente blanco')

  -- Cotizaciones
  UNION ALL
  SELECT org_id, COALESCE(created_by, seller_id), 'quotations', created_at FROM quotations
    WHERE created_at >= p_since

  -- Operaciones
  UNION ALL
  SELECT org_id, seller_id, 'operations', created_at FROM operations WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, NULL, 'operations', created_at FROM operation_services WHERE created_at >= p_since

  -- Clientes
  UNION ALL
  SELECT org_id, created_by, 'customers', created_at FROM customers WHERE created_at >= p_since

  -- Pagos
  UNION ALL
  SELECT org_id, created_by_user_id, 'payments', created_at FROM payments WHERE created_at >= p_since

  -- Caja
  UNION ALL
  SELECT org_id, user_id, 'cash', created_at FROM cash_movements WHERE created_at >= p_since

  -- Facturacion AFIP
  UNION ALL
  SELECT org_id, created_by, 'invoicing', created_at FROM invoices WHERE created_at >= p_since

  -- Contabilidad
  UNION ALL
  SELECT org_id, created_by, 'accounting', created_at FROM journal_entries WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, created_by, 'accounting', created_at FROM purchase_invoices WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, NULL, 'accounting', created_at FROM iva_purchases WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, created_by, 'accounting', created_at FROM tax_withholdings WHERE created_at >= p_since

  -- Pagos a operadores
  UNION ALL
  SELECT org_id, created_by_user_id, 'operator_payments', created_at FROM operator_payments
    WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, created_by, 'operator_payments', created_at FROM cc_payment_groups
    WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, created_by, 'operator_payments', created_at FROM operator_adjustments
    WHERE created_at >= p_since

  -- Comisiones
  UNION ALL
  SELECT org_id, NULL, 'commissions', created_at FROM monthly_commission_settlements
    WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, NULL, 'commissions', created_at FROM monthly_commission_adjustments
    WHERE created_at >= p_since

  -- Referidos
  UNION ALL
  SELECT org_id, created_by, 'referrals', created_at FROM referral_partners WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, created_by, 'referrals', created_at FROM referral_settlements WHERE created_at >= p_since

  -- Tareas
  UNION ALL
  SELECT org_id, created_by, 'tasks', created_at FROM tasks WHERE created_at >= p_since

  -- Growth Studio
  UNION ALL
  SELECT org_id, created_by, 'growth_studio', created_at FROM growth_campaigns WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, created_by, 'growth_studio', created_at FROM growth_assets WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, created_by, 'growth_studio', created_at FROM growth_generation_requests
    WHERE created_at >= p_since

  -- Biblioteca
  UNION ALL
  SELECT org_id, created_by, 'library', created_at FROM library_resources WHERE created_at >= p_since

  -- Configuracion y catalogos
  UNION ALL
  SELECT org_id, NULL, 'settings', created_at FROM operators WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, created_by, 'settings', created_at FROM financial_accounts WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, created_by, 'settings', created_at FROM message_templates WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, created_by, 'settings', created_at FROM pdf_templates WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, created_by, 'settings', created_at FROM recurring_payments WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, created_by, 'settings', created_at FROM seller_objectives WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, NULL, 'settings', created_at FROM commission_rules WHERE created_at >= p_since

  -- Soporte
  UNION ALL
  SELECT org_id, user_id, 'support', created_at FROM support_tickets WHERE created_at >= p_since
$$;

REVOKE ALL ON FUNCTION public._admin_usage_events(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._admin_usage_events(TIMESTAMPTZ) TO service_role;

COMMIT;
