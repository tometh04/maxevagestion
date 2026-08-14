-- =====================================================
-- usage_events — dimensiones de pantalla y segmentacion
-- =====================================================
-- Cuatro columnas para responder tres preguntas que hoy no se pueden hacer:
-- que PANTALLA se usa (no solo que modulo), como se agrupa la actividad en
-- SESIONES, y como se corta por ROL y por AGENCIA.
--
-- `ADD COLUMN` sin default es O(1) en PG11+: no reescribe la tabla y se puede
-- correr en caliente sobre la tabla mas grande del schema.

BEGIN;

ALTER TABLE usage_events
  -- Formato unico para los tres origenes de una vista:
  --   /operations/:id · /reports#tab:margins · /sales/leads#dlg:quotation-builder
  -- Columna dedicada y no `params->>'screen'` porque el ranking agrupa por ella
  -- en cada query: un GROUP BY sobre JSONB necesita indice de expresion.
  ADD COLUMN IF NOT EXISTS screen TEXT,
  -- Rol de analitica al momento del evento (ver lib/analytics/roles.ts).
  -- Se CONGELA a proposito: si alguien pasa de SELLER a ADMIN, los eventos
  -- viejos siguen diciendo SELLER, que es la verdad historica y lo que hace
  -- comparables las cohortes.
  ADD COLUMN IF NOT EXISTS role TEXT,
  -- SIN foreign key, a proposito. Con `REFERENCES agencies(id)`, borrar una
  -- agencia dispararia un seq scan de la tabla mas grande del schema salvo que
  -- se agregue un indice sobre esta columna — que se paga en CADA insert. Es
  -- una dimension degenerada de warehouse: si la agencia se borra, las filas
  -- historicas apuntan a un id muerto y la RPC hace LEFT JOIN y muestra "—".
  -- `org_id` si mantiene su FK con CASCADE: borrar un tenant debe llevarse su
  -- telemetria.
  ADD COLUMN IF NOT EXISTS agency_id UUID,
  -- UUID y no TEXT: 16 bytes contra 36, y el tipo valida solo. Pero la
  -- validacion tiene que pasar ANTES en JS: un session_id basura haria fallar
  -- el INSERT del batch entero de 50 eventos, no de la fila.
  ADD COLUMN IF NOT EXISTS session_id UUID;

COMMENT ON COLUMN usage_events.screen IS
  'Pantalla normalizada. Formato path[#tab:x|#dlg:x]. Ver lib/analytics/screens.ts.';
COMMENT ON COLUMN usage_events.role IS
  'Rol de analitica congelado al momento del evento. Ver lib/analytics/roles.ts.';
COMMENT ON COLUMN usage_events.agency_id IS
  'Agencia SOLO si el usuario pertenece a exactamente una. NULL = sin agencia o multi-agencia. Sin FK a proposito.';

-- Sin indices nuevos, y es deliberado: todas las queries que vienen son
-- "ventana de N dias, agrupa por X". Eso es un range scan que ya cubre
-- `idx_usage_events_org_time`; `screen`, `role` y `session_id` son claves de
-- AGRUPACION, no de filtro selectivo. Un indice sobre `screen` no aceleraria un
-- GROUP BY de toda la ventana y si encareceria cada insert.
--
-- El unico candidato futuro es (org_id, agency_id, occurred_at DESC), si el
-- drill-down por agencia se pone lento. Reevaluar con datos, no antes.

COMMIT;
