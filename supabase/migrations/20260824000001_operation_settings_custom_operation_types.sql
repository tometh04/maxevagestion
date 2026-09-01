-- VIB-150 - "Error al actualizar configuracion" al crear un tipo de operacion
--
-- Reportado por Lozada Gualeguaychu con severidad critical.
--
-- Causa: el commit f4040bb2 (2026-06-11, "tipos de operacion personalizables
-- desde configuracion") agrego `custom_operation_types` al schema de Zod de
-- `app/api/operations/settings/route.ts` y a la pantalla, pero NUNCA creo la
-- columna. El campo validado se spreadea a `updateData`, PostgREST rechaza el
-- UPDATE entero con "Could not find the 'custom_operation_types' column" y la
-- ruta devuelve 500 con ese mensaje generico.
--
-- Misma clase de bug que el de `legs_replace` documentado en
-- `app/api/operations/[id]/__tests__/route-legs.test.ts`: una clave que no es
-- columna no rompe solo su campo, rompe la escritura completa.
--
-- Por que no exploto antes: al cargar la pantalla, `loadSettings` reemplaza el
-- estado con lo que devuelve la API, que no trae la clave porque la columna no
-- existe. Recien cuando alguien toca la pestana "Tipos de Operacion" la clave
-- se reintroduce en el estado, y a partir de ahi falla el guardado de TODA la
-- pantalla, no solo de esa pestana. Por eso Gualeguaychu pudo guardar bien el
-- 2026-07-08, despues de que la feature ya estaba publicada.
--
-- Efecto colateral del bug: la feature de tipos de operacion personalizados
-- nunca funciono para ninguna agencia. El GET tampoco podia devolverlos, asi
-- que el selector de las pantallas de alta y edicion de operaciones jamas los
-- mostro.

BEGIN;

-- Misma forma que `custom_product_types`, que si existia y funciona:
-- jsonb, default array vacio, nullable. La UI ya tolera null con
-- `(settings.custom_operation_types || [])`.
ALTER TABLE operation_settings
  ADD COLUMN IF NOT EXISTS custom_operation_types jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN operation_settings.custom_operation_types IS
  'Tipos de operacion propios de la agencia: [{value, label}]. Se suman a los estandar en el selector "Tipo" al crear o editar una operacion (VIB-150).';

-- Las filas viejas quedan en NULL porque el DEFAULT solo aplica a inserts
-- nuevos. Se normalizan a [] para que la columna se comporte igual que
-- custom_product_types en toda la app.
UPDATE operation_settings
SET custom_operation_types = '[]'::jsonb
WHERE custom_operation_types IS NULL;

COMMIT;

-- ---------------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------------
-- Esperado: la columna existe, ninguna fila en NULL.
SELECT count(*)                                            AS filas,
       count(*) FILTER (WHERE custom_operation_types IS NULL) AS en_null
FROM operation_settings;
