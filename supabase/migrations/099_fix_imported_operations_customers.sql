-- Fix retroactivo: vincular operaciones importadas con sus clientes
-- Las operaciones importadas no creaban registros en operation_customers,
-- lo que hacía que no aparecieran al buscar por nombre de cliente.
--
-- Este script busca operaciones que NO tienen ningún cliente vinculado
-- e intenta vincularlas buscando coincidencias por email entre el
-- customer_email del import y la tabla customers.
--
-- NOTA: Solo vincula operaciones que no tienen NINGÚN registro en operation_customers.
-- No afecta operaciones creadas normalmente (que ya tienen su vínculo).

-- Paso 1: Insertar operation_customers faltantes
-- Busca operaciones sin clientes que tengan un lead con contact_email que coincida con un customer
INSERT INTO operation_customers (operation_id, customer_id, role)
SELECT DISTINCT o.id, c.id, 'MAIN'
FROM operations o
LEFT JOIN operation_customers oc ON oc.operation_id = o.id
LEFT JOIN leads l ON l.id = o.lead_id
JOIN customers c ON LOWER(c.email) = LOWER(l.contact_email)
WHERE oc.id IS NULL
AND l.contact_email IS NOT NULL
AND c.email IS NOT NULL;

-- Notificar a PostgREST para que recargue el schema
NOTIFY pgrst, 'reload schema';
