-- Limpieza del duplicado de "Alberto Javier Zurano" (DNI 17798216)
-- Reportado por agencia el 2026-06-02. Se crearon dos clientes idénticos
-- porque la vendedora no veía el cliente recién creado y reintentó.
--
-- ⚠️  ATENCIÓN: la FK de varias tablas a customers es ON DELETE CASCADE.
-- Si borrás un customer que tiene payments/invoices/messages/interactions
-- vinculados, esos registros SE PIERDEN. Por eso este script SOLO borra
-- duplicados que estén COMPLETAMENTE LIMPIOS (cero relaciones).
--
-- CORRER EN ORDEN:
--   1) Paso A: identificar ambos clientes y ver TODAS sus relaciones.
--   2) Paso B: borrar SOLO si el duplicado tiene 0 en todas las tablas.
--
-- IMPORTANTE: reemplazar <ORG_ID> por el org_id real de la agencia
-- (consultable en la tabla organizations o desde el admin panel).

-- ============================================================
-- PASO A — IDENTIFICAR (correr primero, NO borra nada)
-- ============================================================
-- Muestra los 2 (o más) clientes con ese DNI, ordenados del más viejo al
-- más nuevo, con counts de TODAS las tablas que tienen FK a customers.
-- El que vamos a borrar tiene que tener TODOS los counts en 0.
SELECT
  c.id,
  c.first_name || ' ' || c.last_name AS nombre,
  c.document_number,
  c.created_at,
  c.created_by,
  u.first_name || ' ' || u.last_name AS created_by_name,
  (SELECT COUNT(*) FROM operation_customers oc WHERE oc.customer_id = c.id) AS operations_count,
  (SELECT COUNT(*) FROM payments p WHERE p.customer_id = c.id) AS payments_count,
  (SELECT COUNT(*) FROM invoices i WHERE i.customer_id = c.id) AS invoices_count,
  (SELECT COUNT(*) FROM customer_interactions ci WHERE ci.customer_id = c.id) AS interactions_count,
  (SELECT COUNT(*) FROM notes n WHERE n.customer_id = c.id) AS notes_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.customer_id = c.id) AS tasks_count,
  (SELECT COUNT(*) FROM quotations q WHERE q.customer_id = c.id) AS quotations_count
FROM customers c
LEFT JOIN users u ON u.id = c.created_by
WHERE c.document_number = '17798216'
  AND c.org_id = '<ORG_ID>'   -- ← REEMPLAZAR
ORDER BY c.created_at;

-- ============================================================
-- PASO B — BORRAR (solo después de confirmar Paso A)
-- ============================================================
-- Regla: borra SOLO los duplicados que tengan 0 en TODAS las tablas
-- relacionadas, dejando el más viejo como sobreviviente. Si el duplicado
-- tiene aunque sea un payment/invoice/etc, NO borra nada (caso a fusionar
-- manualmente).
--
-- El RETURNING al final muestra qué se borró. Si devuelve 0 filas,
-- no se borró nada — chequear que el duplicado realmente está vacío.

WITH ranked AS (
  SELECT
    c.id,
    c.created_at,
    -- "es borrable" = no tiene NADA vinculado
    (
      (SELECT COUNT(*) FROM operation_customers oc WHERE oc.customer_id = c.id) +
      (SELECT COUNT(*) FROM payments p WHERE p.customer_id = c.id) +
      (SELECT COUNT(*) FROM invoices i WHERE i.customer_id = c.id) +
      (SELECT COUNT(*) FROM customer_interactions ci WHERE ci.customer_id = c.id) +
      (SELECT COUNT(*) FROM notes n WHERE n.customer_id = c.id) +
      (SELECT COUNT(*) FROM tasks t WHERE t.customer_id = c.id) +
      (SELECT COUNT(*) FROM quotations q WHERE q.customer_id = c.id)
    ) AS total_refs,
    ROW_NUMBER() OVER (ORDER BY c.created_at ASC) AS rn
  FROM customers c
  WHERE c.document_number = '17798216'
    AND c.org_id = '<ORG_ID>'   -- ← REEMPLAZAR
)
DELETE FROM customers
WHERE id IN (
  -- Solo borra duplicados (rn > 1) que están COMPLETAMENTE LIMPIOS (total_refs = 0)
  SELECT id FROM ranked WHERE rn > 1 AND total_refs = 0
)
RETURNING id, first_name, last_name, document_number;
