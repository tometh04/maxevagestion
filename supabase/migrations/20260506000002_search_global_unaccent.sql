-- ============================================================
-- Bug fix 2026-05-06: ⌘K búsqueda no es accent-insensitive
-- ============================================================
-- El endpoint /api/search hace `column ILIKE '%query%'` directo. Como la
-- DB tiene strings con tildes ("Cancún", "México") y los users tipean sin
-- tildes ("cancun", "mexico"), las búsquedas no matchean. Bug funcional
-- crítico — Vibook es AR/LATAM, casi todos los users tipean sin tilde.
--
-- Fix: extension `unaccent` + RPC `search_global_unaccent` que normaliza
-- ambos lados (column y query) antes del LIKE. Multi-tenant-safe:
-- respeta org_id + role + agency_ids del user.
--
-- Tipos retornados:
--   customer   - clientes (first_name + last_name + email + phone)
--   operation  - operaciones (file_code + destination + reservation_codes +
--                pasajero asociado via operation_customers)
--   operator   - operadores (name + contact_email)
--   lead       - leads (contact_name + destination)
--
-- El endpoint TS hace el formatting final del title/subtitle.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION search_global_unaccent(
  p_query       TEXT,
  p_user_id     UUID,
  p_org_id      UUID,
  p_role        TEXT,
  p_agency_ids  UUID[]
)
RETURNS TABLE(
  id              UUID,
  result_type     TEXT,
  title           TEXT,
  subtitle        TEXT,
  -- Columnas extra usadas por el endpoint para formatting fino
  file_code       TEXT,
  destination     TEXT,
  status          TEXT,
  email           TEXT,
  phone           TEXT,
  reservation_code_air   TEXT,
  reservation_code_hotel TEXT,
  passenger_name  TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH q AS (
    SELECT lower(unaccent(p_query)) AS norm_query,
           '%' || lower(unaccent(p_query)) || '%' AS pat
  ),
  customer_results AS (
    SELECT DISTINCT ON (c.id)
      c.id,
      'customer'::TEXT AS result_type,
      (COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))::TEXT AS title,
      COALESCE(c.email, c.phone, 'Sin contacto')::TEXT AS subtitle,
      NULL::TEXT AS file_code,
      NULL::TEXT AS destination,
      NULL::TEXT AS status,
      c.email,
      c.phone,
      NULL::TEXT AS reservation_code_air,
      NULL::TEXT AS reservation_code_hotel,
      NULL::TEXT AS passenger_name
    FROM customers c, q
    WHERE
      (p_org_id IS NULL OR c.org_id = p_org_id)
      AND (
        lower(unaccent(COALESCE(c.first_name, ''))) ILIKE q.pat
        OR lower(unaccent(COALESCE(c.last_name, ''))) ILIKE q.pat
        OR lower(COALESCE(c.email, '')) ILIKE q.pat
        OR lower(COALESCE(c.phone, '')) ILIKE q.pat
      )
    LIMIT 5
  ),
  operation_results AS (
    SELECT DISTINCT ON (o.id)
      o.id,
      'operation'::TEXT AS result_type,
      COALESCE(o.file_code, o.destination, 'Sin código')::TEXT AS title,
      COALESCE(o.destination, '')::TEXT AS subtitle,
      o.file_code,
      o.destination,
      o.status,
      NULL::TEXT AS email,
      NULL::TEXT AS phone,
      o.reservation_code_air,
      o.reservation_code_hotel,
      NULL::TEXT AS passenger_name
    FROM operations o, q
    WHERE
      (p_org_id IS NULL OR o.org_id = p_org_id)
      AND (
        p_role = 'SUPER_ADMIN'
        OR (p_role = 'SELLER' AND o.seller_id = p_user_id)
        OR (
          p_role <> 'SELLER' AND p_role <> 'SUPER_ADMIN'
          AND (
            cardinality(COALESCE(p_agency_ids, ARRAY[]::uuid[])) = 0
            OR o.agency_id = ANY(p_agency_ids)
          )
        )
      )
      AND (
        lower(unaccent(COALESCE(o.file_code, ''))) ILIKE q.pat
        OR lower(unaccent(COALESCE(o.destination, ''))) ILIKE q.pat
        OR lower(COALESCE(o.reservation_code_air, '')) ILIKE q.pat
        OR lower(COALESCE(o.reservation_code_hotel, '')) ILIKE q.pat
      )
    LIMIT 5
  ),
  passenger_results AS (
    SELECT DISTINCT ON (o.id)
      o.id,
      'operation'::TEXT AS result_type,
      (COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '') || ' - ' ||
        COALESCE(o.file_code, 'Sin código'))::TEXT AS title,
      COALESCE(o.destination, '')::TEXT AS subtitle,
      o.file_code,
      o.destination,
      o.status,
      NULL::TEXT AS email,
      NULL::TEXT AS phone,
      o.reservation_code_air,
      o.reservation_code_hotel,
      (COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))::TEXT AS passenger_name
    FROM operation_customers oc
      INNER JOIN operations o ON o.id = oc.operation_id
      INNER JOIN customers c ON c.id = oc.customer_id,
      q
    WHERE
      (p_org_id IS NULL OR o.org_id = p_org_id)
      AND (
        p_role = 'SUPER_ADMIN'
        OR (p_role = 'SELLER' AND o.seller_id = p_user_id)
        OR (
          p_role <> 'SELLER' AND p_role <> 'SUPER_ADMIN'
          AND (
            cardinality(COALESCE(p_agency_ids, ARRAY[]::uuid[])) = 0
            OR o.agency_id = ANY(p_agency_ids)
          )
        )
      )
      AND (
        lower(unaccent(COALESCE(c.first_name, ''))) ILIKE q.pat
        OR lower(unaccent(COALESCE(c.last_name, ''))) ILIKE q.pat
      )
    LIMIT 5
  ),
  operator_results AS (
    SELECT DISTINCT ON (op.id)
      op.id,
      'operator'::TEXT AS result_type,
      COALESCE(op.name, 'Sin nombre')::TEXT AS title,
      COALESCE(op.contact_email, 'Sin email')::TEXT AS subtitle,
      NULL::TEXT AS file_code,
      NULL::TEXT AS destination,
      NULL::TEXT AS status,
      op.contact_email AS email,
      NULL::TEXT AS phone,
      NULL::TEXT AS reservation_code_air,
      NULL::TEXT AS reservation_code_hotel,
      NULL::TEXT AS passenger_name
    FROM operators op, q
    WHERE
      (p_org_id IS NULL OR op.org_id = p_org_id)
      AND (
        lower(unaccent(COALESCE(op.name, ''))) ILIKE q.pat
        OR lower(COALESCE(op.contact_email, '')) ILIKE q.pat
      )
    LIMIT 5
  ),
  lead_results AS (
    SELECT DISTINCT ON (l.id)
      l.id,
      'lead'::TEXT AS result_type,
      COALESCE(l.contact_name, 'Sin nombre')::TEXT AS title,
      COALESCE(l.destination, 'Sin destino')::TEXT AS subtitle,
      NULL::TEXT AS file_code,
      l.destination,
      l.status,
      NULL::TEXT AS email,
      NULL::TEXT AS phone,
      NULL::TEXT AS reservation_code_air,
      NULL::TEXT AS reservation_code_hotel,
      NULL::TEXT AS passenger_name
    FROM leads l, q
    WHERE
      (p_org_id IS NULL OR l.org_id = p_org_id)
      AND (
        p_role = 'SUPER_ADMIN'
        OR (p_role = 'SELLER' AND l.assigned_seller_id = p_user_id)
        OR (
          p_role <> 'SELLER' AND p_role <> 'SUPER_ADMIN'
          AND (
            cardinality(COALESCE(p_agency_ids, ARRAY[]::uuid[])) = 0
            OR l.agency_id = ANY(p_agency_ids)
          )
        )
      )
      AND (
        lower(unaccent(COALESCE(l.contact_name, ''))) ILIKE q.pat
        OR lower(unaccent(COALESCE(l.destination, ''))) ILIKE q.pat
      )
    LIMIT 5
  )
  SELECT * FROM customer_results
  UNION ALL SELECT * FROM operation_results
  UNION ALL SELECT * FROM passenger_results
  UNION ALL SELECT * FROM operator_results
  UNION ALL SELECT * FROM lead_results;
$$;

COMMENT ON FUNCTION search_global_unaccent IS
  'Búsqueda global ⌘K accent-insensitive. Normaliza columna y query con
   unaccent + lower antes del ILIKE. Retorna hasta 25 filas (5 por entity)
   con tipos: customer, operation, operator, lead. Multi-tenant safe:
   respeta org_id + role + agency_ids del user.';
