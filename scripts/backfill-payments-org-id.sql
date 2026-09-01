-- Backfill de payments.org_id
--
-- Encontrado el 2026-08-25 mientras se arreglaba VIB-152: al querer filtrar
-- `payments` por org_id en el nuevo helper del export, aparecieron 98 pagos con
-- `org_id` en NULL. Agregar el filtro sin mirar los datos habria hecho
-- desaparecer operaciones del export en silencio -- el mismo patron de VIB-139.
--
-- Diagnostico (medido antes de tocar nada):
--   * 98 pagos, TODOS de Lozada Rosario.
--   * TODOS creados el mismo dia: 2026-05-08. Fue un evento puntual, no un goteo.
--   * TODOS con operation_id, o sea 100% resolubles. Cero irresolubles.
--   * EXPENSE / PAID, USD 162.448,30 (96 pagos) + ARS 15.110,18 (2 pagos).
--
-- Por que quedaron sin org: existe el trigger `trg_auto_org_id_payments`, que
-- resuelve la org desde auth.uid(). Con service role no hay auth.uid(), asi que
-- un script o import que no setee org_id explicito los deja en NULL.
--
-- Impacto real: NINGUNO visible. `payments` tiene dos policies PERMISIVAS --
-- `payments_tenant_isolation` (por agency_id) y `payments_org_isolation` (por
-- org_id) -- y se combinan con OR, asi que los 98 seguian visibles por agencia.
-- Era una mina, no un incendio: cualquier lectura nueva que filtrara por org_id
-- los perdia sin aviso.
--
-- Doble verificacion antes de aplicar: derivar la org desde la operacion y
-- derivarla desde la agencia del pago dan EXACTAMENTE el mismo resultado (0
-- discrepancias). Dos fuentes independientes de acuerdo.
--
-- Aplicado a produccion el 2026-08-25. Resultado verificado: 0 pagos sin org
-- sobre 6838, y 0 pagos cuya org difiera de la de su operacion.
--
-- Idempotente: solo toca filas con org_id NULL.

BEGIN;

UPDATE payments
SET org_id = '1b326d20-d133-4112-a798-f54b5af7e7cb'  -- Lozada Rosario
WHERE org_id IS NULL
  AND operation_id IN (
    SELECT id FROM operations
    WHERE org_id = '1b326d20-d133-4112-a798-f54b5af7e7cb'
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------------
-- Esperado: sin_org = 0.
SELECT count(*)                                AS total,
       count(*) FILTER (WHERE org_id IS NULL)  AS sin_org
FROM payments;

-- Esperado: 0. Ningun pago puede quedar en una org distinta a la de su operacion.
SELECT count(*) AS pagos_en_org_equivocada
FROM payments p
JOIN operations op ON op.id = p.operation_id
WHERE p.org_id IS DISTINCT FROM op.org_id;

-- ---------------------------------------------------------------------------
-- Pendiente relacionado
-- ---------------------------------------------------------------------------
-- Con la tabla ya limpia, el cierre definitivo seria `payments.org_id NOT NULL`.
-- Antes hay que auditar que TODOS los caminos de escritura sellen la org: el
-- trigger no alcanza cuando se escribe con service role, que es justamente como
-- se crearon estos 98.
