-- =====================================================
-- Mapa de calor de uso del producto (platform admin)
-- =====================================================
-- Responde "quien usa que" a nivel plataforma sin instrumentar nada nuevo:
-- deriva la actividad de las escrituras que ya existen en cada bounded context.
--
-- Por que no GA4: los ad blockers se comen 20-40% de los hits y `org_id` viaja
-- como dimension user-scoped, asi que no se puede cruzar contra
-- subscription_status ni MRR. Para "esta agencia dejo de facturar hace 3
-- semanas" la unica fuente confiable es Postgres.
--
-- SEGURIDAD:
--   * SECURITY INVOKER a proposito. Se invocan con service_role desde
--     `app/admin/usage/page.tsx`, que ya esta detras de `isPlatformAdmin()`.
--     Un SECURITY DEFINER aca seria una escalada innecesaria.
--   * Postgres otorga EXECUTE a PUBLIC por default en toda funcion nueva. Sin
--     el REVOKE de abajo, cualquier usuario autenticado podria llamarlas y
--     enumerar la actividad de todos los tenants (RLS filtraria las filas, pero
--     igual expone la superficie). El REVOKE es obligatorio, no cosmetico.

BEGIN;

-- -----------------------------------------------------------------
-- Fuente unificada de eventos
-- -----------------------------------------------------------------
-- Un evento = una fila escrita por un usuario en un modulo del producto.
--
-- Criterio de inclusion: la fila la crea una persona usando la app.
--
-- Excluido a proposito, con motivo:
--   ledger_movements, commission_records  -> derivados automaticos de payments
--   alerts, notifications                 -> generados por crons
--   audit_logs, billing_events            -> sistema, no producto
--   wa_messages, whatsapp_messages,
--   conversations                         -> trafico de integraciones
--   users, agencies                       -> alta de tenant, no uso diario
--
-- `leads` se parte en dos: la ingesta por webhook (Manychat, Callbell, Eve,
-- Chatsell, Agente Blanco) NO es uso de la app, es trafico entrante. Va al
-- modulo `ingestion`, separado, porque igual interesa: una org cuya ingesta se
-- corta tiene un problema. Un canal nuevo que no este en la lista cae del lado
-- manual hasta que se agregue aca.
--
-- `actor_id` es quien lo hizo, o el proxy mas cercano (vendedor asignado).
-- NULL cuando la tabla solo guarda el sujeto (ej: seller_id en una liquidacion
-- de comisiones es a quien se le liquida, no quien la genero).
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

COMMENT ON FUNCTION public._admin_usage_events(TIMESTAMPTZ) IS
  'Interno. Union de escrituras de usuario por modulo. Ver 20260813000010_admin_usage_heatmap.sql.';

-- -----------------------------------------------------------------
-- 1. Matriz org x modulo — el mapa de calor
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_usage_by_org_module(p_days INT DEFAULT 30)
RETURNS TABLE (org_id UUID, module TEXT, events BIGINT, actors BIGINT, last_event_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT e.org_id,
         e.module,
         COUNT(*)::BIGINT,
         COUNT(DISTINCT e.actor_id)::BIGINT,
         MAX(e.occurred_at)
  FROM public._admin_usage_events(NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))) e
  WHERE e.org_id IS NOT NULL
  GROUP BY e.org_id, e.module
$$;

-- -----------------------------------------------------------------
-- 2. Resumen por org — la tabla de churn
-- -----------------------------------------------------------------
-- `actors` y `active_days` no se pueden derivar sumando la matriz de arriba
-- (son DISTINCT sobre toda la ventana), por eso es una funcion aparte.
CREATE OR REPLACE FUNCTION public.admin_usage_by_org(p_days INT DEFAULT 30)
RETURNS TABLE (
  org_id UUID,
  org_name TEXT,
  slug TEXT,
  subscription_status TEXT,
  plan TEXT,
  org_created_at TIMESTAMPTZ,
  events BIGINT,
  user_events BIGINT,
  actors BIGINT,
  active_days BIGINT,
  modules_used BIGINT,
  last_event_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ev AS (
    SELECT *
    FROM public._admin_usage_events(NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1)))
    WHERE org_id IS NOT NULL
  )
  SELECT o.id,
         o.name::TEXT,
         o.slug::TEXT,
         o.subscription_status::TEXT,
         o.plan::TEXT,
         o.created_at,
         COUNT(ev.occurred_at)::BIGINT,
         COUNT(*) FILTER (WHERE ev.module <> 'ingestion')::BIGINT,
         COUNT(DISTINCT ev.actor_id)::BIGINT,
         COUNT(DISTINCT (ev.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE)
           FILTER (WHERE ev.module <> 'ingestion')::BIGINT,
         COUNT(DISTINCT ev.module) FILTER (WHERE ev.module <> 'ingestion')::BIGINT,
         MAX(ev.occurred_at) FILTER (WHERE ev.module <> 'ingestion')
  FROM organizations o
  LEFT JOIN ev ON ev.org_id = o.id
  GROUP BY o.id, o.name, o.slug, o.subscription_status, o.plan, o.created_at
$$;

-- -----------------------------------------------------------------
-- 3. Dia de semana x hora — cuando se usa
-- -----------------------------------------------------------------
-- En hora de Buenos Aires: en UTC el pico de la tarde argentina cae despues de
-- medianoche y el heatmap queda ilegible.
CREATE OR REPLACE FUNCTION public.admin_usage_by_hour(p_days INT DEFAULT 30)
RETURNS TABLE (dow SMALLINT, hour SMALLINT, events BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXTRACT(ISODOW FROM local_ts)::SMALLINT,
         EXTRACT(HOUR FROM local_ts)::SMALLINT,
         COUNT(*)::BIGINT
  FROM (
    SELECT occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires' AS local_ts
    FROM public._admin_usage_events(NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1)))
    WHERE org_id IS NOT NULL AND module <> 'ingestion'
  ) t
  GROUP BY 1, 2
$$;

-- -----------------------------------------------------------------
-- 4. Serie diaria — la tendencia
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_usage_daily(p_days INT DEFAULT 30)
RETURNS TABLE (day DATE, events BIGINT, active_orgs BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE,
         COUNT(*)::BIGINT,
         COUNT(DISTINCT org_id)::BIGINT
  FROM public._admin_usage_events(NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1)))
  WHERE org_id IS NOT NULL AND module <> 'ingestion'
  GROUP BY 1
$$;

-- -----------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------
REVOKE ALL ON FUNCTION public._admin_usage_events(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_by_org_module(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_by_org(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_by_hour(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_daily(INT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._admin_usage_events(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_by_org_module(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_by_org(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_by_hour(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_daily(INT) TO service_role;

COMMIT;
