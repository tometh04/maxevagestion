-- =====================================================
-- Agencia en las escrituras + fuente unificada de actividad
-- =====================================================
-- Dos cambios:
--
-- 1. `_admin_usage_events` pasa a devolver `agency_id`. En las escrituras la
--    atribucion es EXACTA: es la agencia del registro, no la de la persona que
--    lo cargo. 22 de las ~34 ramas la tienen; las 11 que no son contabilidad,
--    pagos a operadores y comisiones, o sea modulos que en este producto se
--    manejan a nivel org y no de agencia. Esas columnas van a verse vacias al
--    filtrar por agencia y eso es correcto, pero hay que decirlo en la UI o se
--    lee como un bug.
--
-- 2. `_admin_usage_actors`: una sola fuente de "persona activa" que une
--    escrituras y lecturas.
--
-- ATENCION AL DROP: `CREATE OR REPLACE` no puede cambiar el `RETURNS TABLE`, asi
-- que hay que DROP + CREATE. Y el DROP se lleva los GRANT: Postgres le vuelve a
-- dar EXECUTE a PUBLIC a la funcion nueva. Sin el REVOKE de abajo se abre
-- exactamente el agujero que documenta usage-heatmap.md. Es el riesgo numero
-- uno de esta migracion.

BEGIN;

DROP FUNCTION IF EXISTS public._admin_usage_events(TIMESTAMPTZ);

CREATE FUNCTION public._admin_usage_events(p_since TIMESTAMPTZ)
RETURNS TABLE (org_id UUID, agency_id UUID, actor_id UUID, module TEXT, occurred_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  -- CRM
  SELECT org_id, agency_id, assigned_seller_id, 'crm', created_at FROM leads
    WHERE created_at >= p_since
      AND COALESCE(LOWER(source), '') NOT IN
          ('manychat', 'callbell', 'chatsell', 'eve', 'emilia', 'agente blanco')
  UNION ALL
  SELECT org_id, NULL::UUID, user_id, 'crm', created_at FROM lead_comments WHERE created_at >= p_since

  -- Ingesta automatica (no es uso de la app)
  UNION ALL
  SELECT org_id, agency_id, NULL::UUID, 'ingestion', created_at FROM leads
    WHERE created_at >= p_since
      AND COALESCE(LOWER(source), '') IN
          ('manychat', 'callbell', 'chatsell', 'eve', 'emilia', 'agente blanco')

  -- Cotizaciones
  UNION ALL
  SELECT org_id, agency_id, COALESCE(created_by, seller_id), 'quotations', created_at FROM quotations
    WHERE created_at >= p_since

  -- Operaciones
  UNION ALL
  SELECT org_id, agency_id, seller_id, 'operations', created_at FROM operations WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, agency_id, NULL::UUID, 'operations', created_at FROM operation_services WHERE created_at >= p_since

  -- Clientes
  UNION ALL
  SELECT org_id, agency_id, created_by, 'customers', created_at FROM customers WHERE created_at >= p_since

  -- Pagos
  UNION ALL
  SELECT org_id, agency_id, created_by_user_id, 'payments', created_at FROM payments WHERE created_at >= p_since

  -- Caja
  UNION ALL
  SELECT org_id, agency_id, user_id, 'cash', created_at FROM cash_movements WHERE created_at >= p_since

  -- Facturacion AFIP
  UNION ALL
  SELECT org_id, agency_id, created_by, 'invoicing', created_at FROM invoices WHERE created_at >= p_since

  -- Contabilidad — se maneja a nivel org, sin agencia
  UNION ALL
  SELECT org_id, NULL::UUID, created_by, 'accounting', created_at FROM journal_entries WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, NULL::UUID, created_by, 'accounting', created_at FROM purchase_invoices WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, NULL::UUID, NULL::UUID, 'accounting', created_at FROM iva_purchases WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, agency_id, created_by, 'accounting', created_at FROM tax_withholdings WHERE created_at >= p_since

  -- Pagos a operadores — idem, nivel org
  UNION ALL
  SELECT org_id, NULL::UUID, created_by_user_id, 'operator_payments', created_at FROM operator_payments
    WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, NULL::UUID, created_by, 'operator_payments', created_at FROM cc_payment_groups
    WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, NULL::UUID, created_by, 'operator_payments', created_at FROM operator_adjustments
    WHERE created_at >= p_since

  -- Comisiones — idem
  UNION ALL
  SELECT org_id, NULL::UUID, NULL::UUID, 'commissions', created_at FROM monthly_commission_settlements
    WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, NULL::UUID, NULL::UUID, 'commissions', created_at FROM monthly_commission_adjustments
    WHERE created_at >= p_since

  -- Referidos
  UNION ALL
  SELECT org_id, agency_id, created_by, 'referrals', created_at FROM referral_partners WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, agency_id, created_by, 'referrals', created_at FROM referral_settlements WHERE created_at >= p_since

  -- Tareas
  UNION ALL
  SELECT org_id, agency_id, created_by, 'tasks', created_at FROM tasks WHERE created_at >= p_since

  -- Growth Studio
  UNION ALL
  SELECT org_id, agency_id, created_by, 'growth_studio', created_at FROM growth_campaigns WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, agency_id, created_by, 'growth_studio', created_at FROM growth_assets WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, agency_id, created_by, 'growth_studio', created_at FROM growth_generation_requests
    WHERE created_at >= p_since

  -- Biblioteca
  UNION ALL
  SELECT org_id, NULL::UUID, created_by, 'library', created_at FROM library_resources WHERE created_at >= p_since

  -- Configuracion y catalogos
  UNION ALL
  SELECT org_id, agency_id, NULL::UUID, 'settings', created_at FROM operators WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, agency_id, created_by, 'settings', created_at FROM financial_accounts WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, agency_id, created_by, 'settings', created_at FROM message_templates WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, agency_id, created_by, 'settings', created_at FROM pdf_templates WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, agency_id, created_by, 'settings', created_at FROM recurring_payments WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, agency_id, created_by, 'settings', created_at FROM seller_objectives WHERE created_at >= p_since
  UNION ALL
  SELECT org_id, agency_id, NULL::UUID, 'settings', created_at FROM commission_rules WHERE created_at >= p_since

  -- Soporte
  UNION ALL
  SELECT org_id, NULL::UUID, user_id, 'support', created_at FROM support_tickets WHERE created_at >= p_since
$$;

-- OBLIGATORIO despues del DROP: la funcion nueva nace con EXECUTE para PUBLIC.
REVOKE ALL ON FUNCTION public._admin_usage_events(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._admin_usage_events(TIMESTAMPTZ) TO service_role;

-- -----------------------------------------------------------------
-- Actividad humana: escrituras + lecturas
-- -----------------------------------------------------------------
-- DAU/WAU/MAU tienen que salir de las DOS señales. Alguien que entra todos los
-- dias a mirar reportes esta activo, y el heatmap de escrituras no lo ve — que
-- es literalmente el hueco que `usage_events` existe para tapar.
--
-- Es una desviacion deliberada del criterio "solo escrituras" del heatmap: alli
-- mezclarlas inflaria el volumen con page views; aca la pregunta es binaria
-- ("¿esta persona trabajo hoy?") y las dos señales responden que si.
CREATE OR REPLACE FUNCTION public._admin_usage_actors(p_since TIMESTAMPTZ)
RETURNS TABLE (
  org_id UUID,
  agency_id UUID,
  user_id UUID,
  role TEXT,
  occurred_at TIMESTAMPTZ,
  signal TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT e.org_id, e.agency_id, e.actor_id, NULL::TEXT, e.occurred_at, 'write'
  FROM public._admin_usage_events(p_since) e
  WHERE e.org_id IS NOT NULL
    AND e.actor_id IS NOT NULL
    AND e.module <> 'ingestion'
  UNION ALL
  SELECT u.org_id, u.agency_id, u.user_id, u.role, u.occurred_at, 'read'
  FROM usage_events u
  WHERE u.occurred_at >= p_since
    AND u.org_id IS NOT NULL
    AND u.user_id IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public._admin_usage_actors(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._admin_usage_actors(TIMESTAMPTZ) TO service_role;

COMMIT;
