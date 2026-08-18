-- ============================================================
-- Comision de servicios: al vendedor que la vende, en su propio mes
--
-- Pedido de Lozada Rosario. Hoy, cuando alguien agrega un servicio a una
-- operacion ya vendida (una asistencia, una reprogramacion), la comision de ese
-- servicio:
--   a) se le adjudica siempre al vendedor de la OPERACION, porque
--      `operation_services` no guarda quien vendio el servicio; y
--   b) se imputa al mes de la venta original, porque el Reporte de Comisiones
--      deriva el mes de `operations.operation_date`.
--
-- Esta migracion habilita que la comision de un servicio sea una fila propia,
-- de su propio vendedor y con su propia fecha de imputacion.
--
-- CAMBIO DE INVARIANTE (importante): la migracion 119 impuso
-- UNIQUE (operation_id, seller_id) —"una persona, una fila por operacion"— y
-- 20260805000001 (VIB-102) lo mantuvo a proposito, sumando porcentajes en esa
-- fila unica "en vez de pelearse con el constraint". Ese modelo NO puede
-- representar lo que se pide aca: si el mismo vendedor vende el paquete en marzo
-- y un servicio en agosto, una sola fila no puede estar en dos meses. Por eso el
-- unique pasa a ser PARCIAL: sigue valiendo para SELLER y ADVISOR_MANAGER (que
-- son las filas que produce `applyCommissionPlan`), y deja libres las de SERVICE.
--
-- Additive y idempotente. No borra ni reasigna plata existente: el backfill deja
-- el historico dando exactamente los mismos numeros que antes.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────
-- 1. operation_services.seller_id — quien vendio el servicio.
--
-- ON DELETE SET NULL y no CASCADE: dar de baja a un usuario no puede borrar
-- servicios ni arrastrar sus registros contables.
--
-- Backfill al vendedor de la operacion. Ojo: el dato historico real NO es
-- recuperable (nunca se guardo quien cargo cada servicio), asi que el backfill
-- reproduce el comportamiento viejo, no la verdad. Es a proposito: la feature se
-- acordo "de aca en adelante", sin retroactividad.
-- ─────────────────────────────────────────────────────
ALTER TABLE public.operation_services
  ADD COLUMN IF NOT EXISTS seller_id UUID
    REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.operation_services os
SET seller_id = o.seller_id
FROM public.operations o
WHERE os.operation_id = o.id
  AND os.seller_id IS NULL
  AND o.seller_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operation_services_seller_id
  ON public.operation_services(seller_id);

COMMENT ON COLUMN public.operation_services.seller_id IS
  'Vendedor que vendio este servicio; es quien cobra su comision. Por defecto '
  'quien lo carga, pero se puede elegir otro (cualquiera puede cargar un '
  'servicio). Backfilleado 2026-08-18 a operations.seller_id para el historico, '
  'que no es recuperable.';

-- ─────────────────────────────────────────────────────
-- 2. commission_records.operation_service_id — que servicio origino la comision.
--
-- ON DELETE SET NULL, NO CASCADE: si el servicio se borra y su comision YA fue
-- pagada, la fila tiene que sobrevivir como rastro auditable del pago en vez de
-- que la base la destruya en silencio. El borrado real lo hace la ruta de
-- servicios, que conserva su guard de PAID.
--
-- El unique parcial evita que un reintento duplique la comision de un servicio.
-- ─────────────────────────────────────────────────────
ALTER TABLE public.commission_records
  ADD COLUMN IF NOT EXISTS operation_service_id UUID
    REFERENCES public.operation_services(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_commission_per_operation_service
  ON public.commission_records(operation_service_id)
  WHERE operation_service_id IS NOT NULL;

COMMENT ON COLUMN public.commission_records.operation_service_id IS
  'Servicio que origino esta comision (solo kind = SERVICE). NULL en las '
  'comisiones de la venta base.';

-- ─────────────────────────────────────────────────────
-- 3. commission_records.accrual_date — mes al que se imputa la comision.
--
-- Por que una columna nueva y no reusar lo que hay:
--   - `operations.operation_date` (lo que usa hoy el reporte) es de la operacion,
--     no de la fila: mete todas las comisiones en el mes de la venta original.
--   - `date_calculated` se reescribe con now() en CADA recalculo
--     (lib/commissions/calculate.ts), por eso el reporte ya lo habia descartado.
--
-- DEFAULT CURRENT_DATE a proposito: si esta migracion se aplica ANTES de que
-- deployee el codigo, los inserts del codigo viejo —que todavia no manda la
-- columna— siguen funcionando en vez de fallar.
--
-- Backfill = operation_date, con date_calculated como respaldo, para que
-- cualquier periodo ya cerrado siga dando identico despues del cambio.
-- ─────────────────────────────────────────────────────
ALTER TABLE public.commission_records
  ADD COLUMN IF NOT EXISTS accrual_date DATE DEFAULT CURRENT_DATE;

UPDATE public.commission_records cr
SET accrual_date = o.operation_date
FROM public.operations o
WHERE cr.operation_id = o.id
  AND cr.accrual_date IS NULL
  AND o.operation_date IS NOT NULL;

UPDATE public.commission_records
SET accrual_date = date_calculated::date
WHERE accrual_date IS NULL;

ALTER TABLE public.commission_records
  ALTER COLUMN accrual_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_records_accrual_date
  ON public.commission_records(accrual_date);

COMMENT ON COLUMN public.commission_records.accrual_date IS
  'Fecha a la que se imputa la comision, propia de la fila. Para SELLER y '
  'ADVISOR_MANAGER es operations.operation_date; para SERVICE es la fecha en que '
  'se vendio el servicio, que puede caer en un mes muy posterior al de la venta '
  'original. Es la fecha por la que filtra el Reporte de Comisiones.';

-- ─────────────────────────────────────────────────────
-- 4. kind: sumar 'SERVICE'.
-- Additive: parte de la lista vigente (20260805000001) y solo suma SERVICE.
-- Idempotente (DROP IF EXISTS + ADD), sin riesgo para datos existentes.
-- ─────────────────────────────────────────────────────
ALTER TABLE public.commission_records
  DROP CONSTRAINT IF EXISTS commission_records_kind_check;

ALTER TABLE public.commission_records
  ADD CONSTRAINT commission_records_kind_check
  CHECK (kind IN ('SELLER', 'ADVISOR_MANAGER', 'SERVICE'));

COMMENT ON CONSTRAINT commission_records_kind_check ON public.commission_records IS
  'Tipos de comision permitidos. SERVICE (comision de un servicio agregado a la '
  'operacion, con su propio vendedor y su propio mes) agregado 2026-08-18. '
  'ADVISOR_MANAGER (VIB-102) agregado 2026-08-05. SELLER es el default historico.';

-- ─────────────────────────────────────────────────────
-- 5. El unique de la migracion 119 pasa a ser parcial.
--
-- SELLER y ADVISOR_MANAGER conservan "una persona, una fila por operacion":
-- son las que produce y reconcilia `applyCommissionPlan`, y ese algoritmo
-- depende de poder mapear seller_id -> fila unica.
--
-- SERVICE queda fuera: una operacion puede acumular varios servicios, del mismo
-- o de distintos vendedores, en meses distintos. Su unicidad la garantiza
-- `unique_commission_per_operation_service` (punto 2), que es la correcta para
-- esas filas.
-- ─────────────────────────────────────────────────────
ALTER TABLE public.commission_records
  DROP CONSTRAINT IF EXISTS unique_commission_operation_seller;

CREATE UNIQUE INDEX IF NOT EXISTS unique_commission_operation_seller_non_service
  ON public.commission_records(operation_id, seller_id)
  WHERE kind <> 'SERVICE';

COMMIT;
