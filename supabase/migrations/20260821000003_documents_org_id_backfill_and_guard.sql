-- VIB-139 - Los documentos se guardaban sin org_id y quedaban invisibles
--
-- Sintoma reportado por Milla Cero: "cargo el DNI, me dice que esta cargado
-- correctamente pero no puedo verlo".
--
-- Causa: las tres rutas que insertan en `documents` (upload, upload-with-ocr y
-- expenses/receipts) nunca escribian `org_id`, pero la pantalla del cliente
-- filtra por `.eq("org_id", userOrgId)`. El insert entra -- por eso el mensaje
-- de exito -- y despues la lectura no lo encuentra nunca.
--
-- Alcance medido en produccion antes de esta migracion: 1177 de 1327
-- documentos (89%) con org_id NULL, en 5 agencias, desde 2026-02-23.
-- La pantalla de la OPERACION si los mostraba, porque lee con service role y
-- sin filtro de org; por eso el problema se veia solo desde el cliente.
--
-- Esta migracion hace dos cosas: rellena lo existente y evita que vuelva a
-- pasar. El fix de codigo va aparte y es la fuente de verdad; el trigger es
-- red de seguridad para cualquier ruta futura que se olvide.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Backfill
-- ---------------------------------------------------------------------------
-- Se resuelve por prioridad: cliente -> operacion -> lead -> autor del upload.
-- Verificado antes de correr: 1169 resuelven por cliente, 6 por operacion,
-- 2 por autor, 0 quedan sin resolver.
--
-- Solo toca filas con org_id NULL: nunca reescribe una org ya asignada, asi
-- que no puede mover un documento de agencia. Es idempotente.

-- Es la MISMA expresion que usa el trigger de abajo, a proposito: asi una sola
-- lectura alcanza para auditar las dos mitades.

UPDATE documents d
SET org_id = COALESCE(
      (SELECT c.org_id  FROM customers  c  WHERE c.id  = d.customer_id),
      (SELECT op.org_id FROM operations op WHERE op.id = d.operation_id),
      (SELECT l.org_id  FROM leads      l  WHERE l.id  = d.lead_id),
      (SELECT u.org_id  FROM users      u  WHERE u.id  = d.uploaded_by_user_id)
    )
WHERE d.org_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Red de seguridad
-- ---------------------------------------------------------------------------
-- Tres rutas distintas se olvidaron del org_id de forma independiente, asi que
-- el guard va en la tabla y no en cada ruta.
--
-- Deliberadamente solo RELLENA cuando viene NULL: si el codigo manda un org_id,
-- gana el codigo. El trigger no puede reescribir la org de un documento, o sea
-- que no puede usarse para mover datos entre tenants.

CREATE OR REPLACE FUNCTION set_document_org_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(
           (SELECT c.org_id  FROM customers  c  WHERE c.id  = NEW.customer_id),
           (SELECT op.org_id FROM operations op WHERE op.id = NEW.operation_id),
           (SELECT l.org_id  FROM leads      l  WHERE l.id  = NEW.lead_id),
           (SELECT u.org_id  FROM users      u  WHERE u.id  = NEW.uploaded_by_user_id)
         )
    INTO NEW.org_id;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_documents_set_org_id ON documents;

CREATE TRIGGER trg_documents_set_org_id
BEFORE INSERT ON documents
FOR EACH ROW
EXECUTE FUNCTION set_document_org_id();

-- Indice para la lectura de la pantalla del cliente, que es (customer_id, org_id).
CREATE INDEX IF NOT EXISTS idx_documents_customer_org
  ON documents (customer_id, org_id)
  WHERE customer_id IS NOT NULL;

COMMIT;

-- ---------------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------------
-- Esperado: sin_org = 0.
SELECT count(*) FILTER (WHERE org_id IS NULL) AS sin_org,
       count(*)                               AS total
FROM documents;

-- Esperado: cero. Ningun documento puede haber quedado en una org distinta a
-- la del cliente al que pertenece.
SELECT count(*) AS documentos_en_org_equivocada
FROM documents d
JOIN customers c ON c.id = d.customer_id
WHERE d.org_id IS DISTINCT FROM c.org_id;
