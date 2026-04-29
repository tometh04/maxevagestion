-- =====================================================
-- Link orphan customer documents to operations on linkage
-- =====================================================
--
-- Caso reportado por Tomi (29/04): cuando un usuario crea un cliente y
-- escanea su pasaporte/DNI con IA antes de crear una operación, el
-- documento queda en `documents` con customer_id seteado pero
-- operation_id = NULL. Después se crea la operación y se vincula el
-- cliente vía operation_customers, pero el documento huérfano nunca se
-- actualiza, así que no aparece en la pestaña Documentos de la operación
-- (la helper getOperationVisibleDocuments lo busca también por
-- customer_id, pero ese path falló para Tomi en la OP #d8b795e7 — sea
-- por timing, RLS, o un edge case de la query con join — y la solución
-- robusta es asegurar que el doc tenga operation_id seteado).
--
-- Esta migración:
--  1. Crea un trigger AFTER INSERT en operation_customers que actualiza
--     documents.operation_id = NEW.operation_id para todos los docs del
--     cliente que aún están huérfanos (operation_id IS NULL).
--  2. Hace un backfill one-shot para docs huérfanos preexistentes cuyo
--     cliente ya está en operation_customers (resuelve la OP de Tomi sin
--     que tenga que reconectar el cliente).
--
-- El trigger es idempotente: si el cliente ya tenía sus docs vinculados a
-- una operación previa, el WHERE operation_id IS NULL los ignora.
-- Cuando el mismo cliente se vincula a una segunda operación, los docs
-- viejos quedan en la primera (correcto: el doc se "casa" con la primera
-- op que lo necesitó). La helper sigue mostrando docs en operaciones
-- subsiguientes vía la query por customer_id.

-- SECURITY DEFINER: el trigger debe poder actualizar documents incluso
-- cuando el usuario que vincula el cliente no es el que subió el doc.
-- El RLS de UPDATE de documents (migración 028) sólo permite update si
-- el user es el uploader O tiene acceso a la lead/operation asociada.
-- Para un doc huérfano (operation_id NULL, lead_id NULL), eso bloquea a
-- otros usuarios. Acá el trigger se ejecuta como definer del schema
-- (postgres) para que funcione sin importar quién dispare el insert en
-- operation_customers.
CREATE OR REPLACE FUNCTION link_orphan_customer_docs_to_operation()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE documents
  SET operation_id = NEW.operation_id
  WHERE customer_id = NEW.customer_id
    AND operation_id IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS link_orphan_customer_docs_trigger ON operation_customers;

CREATE TRIGGER link_orphan_customer_docs_trigger
AFTER INSERT ON operation_customers
FOR EACH ROW
EXECUTE FUNCTION link_orphan_customer_docs_to_operation();

-- Backfill: docs huérfanos cuyos clientes YA están en operation_customers.
-- Linkea cada doc huérfano con la primera operación donde el cliente es MAIN
-- (o la primera disponible si no es MAIN en ninguna).
--
-- operation_customers NO tiene created_at (sólo id, operation_id,
-- customer_id, role — ver migración 001), así que ordenamos por
-- operations.created_at vía JOIN para tener un criterio determinista.
WITH first_op_for_customer AS (
  SELECT DISTINCT ON (oc.customer_id)
    oc.customer_id,
    oc.operation_id
  FROM operation_customers oc
  JOIN operations o ON o.id = oc.operation_id
  ORDER BY oc.customer_id, (oc.role = 'MAIN') DESC, o.created_at ASC NULLS LAST
)
UPDATE documents d
SET operation_id = foc.operation_id
FROM first_op_for_customer foc
WHERE d.customer_id = foc.customer_id
  AND d.operation_id IS NULL;

COMMENT ON FUNCTION link_orphan_customer_docs_to_operation() IS
  'Trigger function: when a customer is linked to an operation, attach any orphan documents (customer_id set, operation_id null) to that operation. Reported by Tomi 2026-04-29 for OP #d8b795e7.';
