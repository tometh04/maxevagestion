-- =====================================================
-- Migración: paquetes cerrados con cupo (VIB-183)
-- =====================================================
-- Qué resuelve:
--
-- Una agencia arma un "paquete cerrado" agrupando varios operadores (un hotel +
-- un aéreo + una asistencia) y le pone un cupo de plazas. Al vender, el
-- vendedor elige el paquete desde el alta de operación y el cupo se descuenta.
--
-- ─────────────────────────────────────────────────────
-- El cupo disponible es DERIVADO, no un contador
-- ─────────────────────────────────────────────────────
--
--   disponible = total_quota − Σ seats de reservas cuya operación existe y no
--                está cancelada
--
-- `total_quota` es el techo y NUNCA se decrementa. No hay columna de saldo, no
-- hay `status` ni `released_at` en la reserva: una reserva existe ⟺ la
-- operación existe, y está activa ⟺ la operación no está CANCELLED. No hay nada
-- que se pueda desincronizar ni nada que reparar si un proceso muere a mitad.
--
-- Esto NO es una preferencia de estilo. La migración 015_create_tariffs_and_quotas
-- ya intentó esta misma feature con el modelo opuesto: `quotas.reserved_quota`
-- como contador mutable mantenido por el trigger `update_quota_reserved_count()`,
-- con `available_quota` como columna generada. Cualquier escritura que esquive el
-- trigger, o una excepción a mitad de camino, lo desincroniza para siempre y sin
-- forma de recomputarlo. Esas tablas (`tariffs`, `tariff_items`, `quotas`,
-- `quota_reservations`) están MUERTAS: ningún archivo de la app las consume.
-- No reusarlas ni imitarlas.
--
-- ─────────────────────────────────────────────────────
-- El enforcement vive en la base, no en la ruta
-- ─────────────────────────────────────────────────────
--
-- A `travel_package_bookings` se le da SOLO `SELECT` a `authenticated`. Escribir
-- esa tabla únicamente es posible desde las RPC `SECURITY DEFINER` de más abajo,
-- que lockean el paquete, cuentan las filas reales y recién ahí insertan.
--
-- O sea: no es "la ruta se acuerda de llamar a la RPC" — es que no existe otro
-- camino, ni desde un import, ni desde un script, ni desde un endpoint futuro.
-- Es lo que pide AGENTS.md: "la base de datos posee constraints, RLS, índices y
-- triggers cuando protegen integridad compartida entre flujos".
--
-- Los DELETE por acción referencial de FK no chequean permisos de tabla, así que
-- borrar una operación sigue liberando su cupo pese al GRANT recortado — que es
-- exactamente el comportamiento buscado.
--
-- Molde del lock + conteo derivado: `enforce_quotation_document_quota`
-- (20260901000006_quotation_quotas.sql), que usa el mismo `pg_advisory_xact_lock`
-- y la misma familia de ERRCODE (P42xx) para "cupo agotado".
--
-- Multi-tenant: nada específico de una agencia. Toda org que use el módulo
-- obtiene el mismo comportamiento.

BEGIN;

-- Base en producción con tráfico: si no se consigue un lock en 10s, cortar con
-- un error claro en vez de bloquear a los lectores. La migración es idempotente,
-- así que reintentar es seguro.
SET LOCAL lock_timeout = '10s';

-- ─────────────────────────────────────────────────────
-- 1. travel_packages: el paquete y su cupo.
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.travel_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- NULL = paquete de toda la org. Con valor, es de esa oficina.
  -- SET NULL y no RESTRICT: cerrar una agencia no puede quedar bloqueado por un
  -- paquete, y el paquete no deja de existir porque se cierre la oficina.
  agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  description TEXT,
  destination TEXT,
  departure_date DATE,
  return_date DATE,

  -- Techo de plazas. NUNCA se decrementa: lo consumido se deriva de
  -- travel_package_bookings. Bajarlo por debajo de lo ya vendido está
  -- bloqueado por set_travel_package_quota().
  total_quota INTEGER NOT NULL,

  -- Precio de venta sugerido del paquete completo. Es un default para el alta
  -- de operación, no una fuente de verdad: la venta real vive en
  -- operations.sale_amount_total y puede diferir.
  sale_amount_total NUMERIC(14,2),
  sale_currency TEXT NOT NULL DEFAULT 'USD',

  -- CLOSED es el archivado: no se puede vender, sí se sigue viendo en
  -- Paquetería con su historial. Es la alternativa correcta al borrado, que
  -- queda bloqueado en cuanto hubo una venta (ver el RESTRICT de bookings).
  status TEXT NOT NULL DEFAULT 'ACTIVE',

  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT travel_packages_name_check
    CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT travel_packages_total_quota_check
    CHECK (total_quota >= 0),
  CONSTRAINT travel_packages_sale_amount_check
    CHECK (sale_amount_total IS NULL OR sale_amount_total >= 0),
  CONSTRAINT travel_packages_sale_currency_check
    CHECK (sale_currency IN ('ARS', 'USD')),
  CONSTRAINT travel_packages_status_check
    CHECK (status IN ('ACTIVE', 'CLOSED')),
  CONSTRAINT travel_packages_dates_check
    CHECK (return_date IS NULL OR departure_date IS NULL OR return_date >= departure_date)
);

CREATE INDEX IF NOT EXISTS idx_travel_packages_org
  ON public.travel_packages(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_packages_agency
  ON public.travel_packages(agency_id)
  WHERE agency_id IS NOT NULL;

COMMENT ON TABLE public.travel_packages IS
  'Paquete cerrado: agrupa operadores (travel_package_items) y tiene un cupo de '
  'plazas. Lo consumido se DERIVA de travel_package_bookings, nunca se guarda. '
  'Ver VIB-183.';
COMMENT ON COLUMN public.travel_packages.total_quota IS
  'Techo de plazas. Nunca se decrementa: el disponible es total_quota menos la '
  'suma de seats de las reservas activas.';

-- ─────────────────────────────────────────────────────
-- 2. travel_package_items: las patas del paquete.
-- ─────────────────────────────────────────────────────
-- Espejo de las columnas de operation_operators que tienen sentido en una
-- plantilla, para que aplicar un paquete sea copiar filas.
CREATE TABLE IF NOT EXISTS public.travel_package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- CASCADE: un ítem no significa nada fuera de su paquete, no guarda ningún
  -- dato financiero ni histórico (es configuración de catálogo) y el borrado del
  -- padre ya está gateado por permiso y bloqueado si hubo ventas.
  -- Es lo OPUESTO al antecedente del borrado de cuentas financieras, donde la
  -- cascada arrasaba ledger_movements, que son historia contable irreconstruible.
  package_id UUID NOT NULL REFERENCES public.travel_packages(id) ON DELETE CASCADE,

  -- RESTRICT a propósito: CASCADE borraría una pata en silencio y el paquete
  -- quedaría vendiendo menos de lo que promete; SET NULL lo dejaría inaplicable
  -- (operation_operators.operator_id es NOT NULL). RESTRICT fuerza a que se
  -- avise. El DELETE de /api/operators lo pre-chequea con mensaje legible.
  operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE RESTRICT,

  -- Vocabulario de operation_operators.product_type (inglés: FLIGHT, HOTEL...).
  -- SIN CHECK: la migración 20260611000001 lo sacó a propósito para permitir los
  -- custom_product_types de cada org.
  product_type TEXT,

  cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_currency TEXT NOT NULL DEFAULT 'USD',

  -- Desglose informativo de la venta, mismo criterio que
  -- operation_operators.sale_amount (VIB-112): no es fuente de verdad.
  sale_amount NUMERIC(14,2) NOT NULL DEFAULT 0,

  notes TEXT,

  -- El orden importa: la primera pata define el operador principal de la
  -- operación que se cree a partir del paquete.
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT travel_package_items_cost_check CHECK (cost >= 0),
  CONSTRAINT travel_package_items_sale_amount_check CHECK (sale_amount >= 0),
  CONSTRAINT travel_package_items_cost_currency_check
    CHECK (cost_currency IN ('ARS', 'USD'))
);

-- Sin UNIQUE(package_id, operator_id): la migración 20260515000001 quitó ese
-- mismo UNIQUE de operation_operators justamente porque el mismo operador puede
-- aparecer dos veces con distinto producto.
CREATE INDEX IF NOT EXISTS idx_travel_package_items_package
  ON public.travel_package_items(package_id, sort_order);

COMMENT ON TABLE public.travel_package_items IS
  'Patas de un paquete cerrado. Al aplicar el paquete en el alta de operación se '
  'copian a operation_operators; a partir de ahí son independientes (el paquete '
  'fija el cupo, no los precios).';

-- ─────────────────────────────────────────────────────
-- 3. travel_package_bookings: el consumo del cupo.
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.travel_package_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- RESTRICT, la decisión más importante de la tabla. Con CASCADE, borrar un
  -- paquete borraría la única traza de qué operaciones lo consumieron y
  -- "liberaría" un cupo que ya no existe. RESTRICT convierte "borrar un paquete
  -- vendido" en un error explícito y empuja al camino correcto: status='CLOSED'.
  package_id UUID NOT NULL REFERENCES public.travel_packages(id) ON DELETE RESTRICT,

  -- CASCADE: ESTE es el mecanismo de liberación del cupo. Borrar la operación
  -- borra la reserva y el cupo vuelve solo, sin código que se pueda olvidar de
  -- correr. NOT NULL porque no existe la reserva sin operación (nada de holds
  -- huérfanos). UNIQUE porque una operación consume a lo sumo un paquete, y es
  -- además la clave de idempotencia de book_travel_package_seats.
  operation_id UUID NOT NULL UNIQUE REFERENCES public.operations(id) ON DELETE CASCADE,

  -- Plazas tomadas = pasajeros de la operación. Se actualiza si cambian los
  -- pasajeros (revalidate_travel_package_booking).
  seats INTEGER NOT NULL DEFAULT 1,

  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT travel_package_bookings_seats_check CHECK (seats > 0)
);

-- El índice caliente: lo recorre cada toma de cupo dentro del lock.
CREATE INDEX IF NOT EXISTS idx_travel_package_bookings_package
  ON public.travel_package_bookings(package_id);
CREATE INDEX IF NOT EXISTS idx_travel_package_bookings_org
  ON public.travel_package_bookings(org_id, created_at DESC);

COMMENT ON TABLE public.travel_package_bookings IS
  'Consumo de cupo: una fila por operación que se vendió sobre un paquete. NO '
  'tiene columna de estado a propósito: la reserva está activa si su operación '
  'existe y no está CANCELLED. Solo escribible desde las RPC SECURITY DEFINER.';
COMMENT ON COLUMN public.travel_package_bookings.seats IS
  'Plazas que consume esta venta (una por pasajero). Cambiar los pasajeros de la '
  'operación lo actualiza previa revalidación del cupo.';

-- ─────────────────────────────────────────────────────
-- 4. Triggers updated_at (reusan el helper existente).
-- ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS travel_packages_updated_at ON public.travel_packages;
CREATE TRIGGER travel_packages_updated_at
  BEFORE UPDATE ON public.travel_packages
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS travel_package_items_updated_at ON public.travel_package_items;
CREATE TRIGGER travel_package_items_updated_at
  BEFORE UPDATE ON public.travel_package_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS travel_package_bookings_updated_at ON public.travel_package_bookings;
CREATE TRIGGER travel_package_bookings_updated_at
  BEFORE UPDATE ON public.travel_package_bookings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─────────────────────────────────────────────────────
-- 5. RLS: aislamiento por tenant (defensa en profundidad).
-- ─────────────────────────────────────────────────────
-- El filtro fino por agencia y rol vive en la API (canPerformAction,
-- getScopedAgenciesForUser), no acá. Mismo criterio que library y referrals.
--
-- FORCE no afecta a las RPC de más abajo: son SECURITY DEFINER y su dueño
-- (postgres) tiene BYPASSRLS.
ALTER TABLE public.travel_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_packages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS travel_packages_tenant_isolation ON public.travel_packages;
CREATE POLICY travel_packages_tenant_isolation ON public.travel_packages
  FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_packages TO authenticated;

ALTER TABLE public.travel_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS travel_package_items_tenant_isolation ON public.travel_package_items;
CREATE POLICY travel_package_items_tenant_isolation ON public.travel_package_items
  FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_package_items TO authenticated;

ALTER TABLE public.travel_package_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_bookings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS travel_package_bookings_tenant_isolation ON public.travel_package_bookings;
CREATE POLICY travel_package_bookings_tenant_isolation ON public.travel_package_bookings
  FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- SOLO SELECT. Este GRANT recortado es el enforcement del cupo: sin INSERT ni
-- UPDATE ni DELETE para `authenticated`, la única forma de tomar o modificar una
-- reserva es a través de las RPC de más abajo, que lockean y cuentan primero.
-- Agregar aquí un INSERT "para que sea más fácil" es abrir la sobreventa.
GRANT SELECT ON public.travel_package_bookings TO authenticated;

-- ─────────────────────────────────────────────────────
-- 6. get_travel_package_availability: la definición ÚNICA de "consumido".
-- ─────────────────────────────────────────────────────
-- La usan el pre-chequeo del alta, el selector del diálogo y la pantalla
-- Paquetería, para que nadie reimplemente el JOIN por su cuenta.
--
-- `remaining` puede venir negativo si alguna vez se bajó el cupo por afuera de
-- set_travel_package_quota: se devuelve crudo a propósito (el dato tiene que ser
-- honesto); quien lo muestre decide si lo clampea.
CREATE OR REPLACE FUNCTION public.get_travel_package_availability(
  p_org_id UUID,
  p_package_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  package_id UUID,
  total_quota INTEGER,
  consumed INTEGER,
  remaining INTEGER,
  active_bookings INTEGER,
  cancelled_bookings INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Con p_org_id NULL la comparación nunca es true y no devuelve nada: falla
  -- cerrado, que es lo que se quiere en una función que bypasea RLS.
  SELECT
    p.id,
    p.total_quota,
    COALESCE(SUM(b.seats) FILTER (WHERE o.status IS DISTINCT FROM 'CANCELLED'), 0)::INTEGER,
    (p.total_quota - COALESCE(SUM(b.seats) FILTER (WHERE o.status IS DISTINCT FROM 'CANCELLED'), 0))::INTEGER,
    COUNT(b.id) FILTER (WHERE o.status IS DISTINCT FROM 'CANCELLED')::INTEGER,
    COUNT(b.id) FILTER (WHERE o.status = 'CANCELLED')::INTEGER
  FROM public.travel_packages p
  LEFT JOIN public.travel_package_bookings b ON b.package_id = p.id
  LEFT JOIN public.operations o ON o.id = b.operation_id
  WHERE p.org_id = p_org_id
    AND (p_package_ids IS NULL OR p.id = ANY(p_package_ids))
  GROUP BY p.id, p.total_quota;
$$;

COMMENT ON FUNCTION public.get_travel_package_availability(UUID, UUID[]) IS
'Cupo consumido y disponible por paquete, derivado de travel_package_bookings. '
'Definición única de "consumido": suma de seats de reservas cuya operación no '
'está CANCELLED.';

REVOKE ALL ON FUNCTION public.get_travel_package_availability(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_travel_package_availability(UUID, UUID[]) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────
-- 7. book_travel_package_seats: tomar cupo (el corazón de la feature).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.book_travel_package_seats(
  p_package_id UUID,
  p_operation_id UUID,
  p_org_id UUID,
  p_seats INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pkg public.travel_packages%ROWTYPE;
  v_existing public.travel_package_bookings%ROWTYPE;
  v_consumed INTEGER;
  v_booking_id UUID;
BEGIN
  -- p_org_id SIEMPRE lo pone el servidor desde la sesión, nunca el body.
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Falta la organización' USING ERRCODE = 'P0001';
  END IF;
  IF p_seats IS NULL OR p_seats < 1 THEN
    RAISE EXCEPTION 'Las plazas a reservar deben ser al menos 1' USING ERRCODE = 'P0001';
  END IF;

  -- Serialización primaria: se lockea el paquete, que es el recurso que se
  -- consume. Cualquier otra transacción que quiera tomar cupo del mismo paquete
  -- espera acá.
  SELECT * INTO v_pkg
  FROM public.travel_packages
  WHERE id = p_package_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El paquete seleccionado no existe' USING ERRCODE = 'P0002';
  END IF;

  -- Defensa en profundidad sobre la clave lógica, por si mañana el conteo deja
  -- de pasar por la fila del paquete. Mismo patrón que la cuota de cotizaciones.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('travel-package-quota:' || p_package_id::TEXT, 0)
  );

  -- La función bypasea RLS: validar la operación a mano es obligatorio.
  IF NOT EXISTS (
    SELECT 1 FROM public.operations WHERE id = p_operation_id AND org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'La operación no existe' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotencia (AGENTS.md regla 6): un reintento del alta no puede fallar ni
  -- consumir dos veces. Va ANTES del chequeo de status para que un reintento
  -- sobre un paquete recién cerrado tampoco rompa.
  SELECT * INTO v_existing
  FROM public.travel_package_bookings
  WHERE operation_id = p_operation_id;

  IF FOUND THEN
    IF v_existing.package_id <> p_package_id THEN
      RAISE EXCEPTION 'La operación ya consume cupo de otro paquete'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(SUM(b.seats), 0)::INTEGER INTO v_consumed
    FROM public.travel_package_bookings b
    JOIN public.operations o ON o.id = b.operation_id
    WHERE b.package_id = p_package_id
      AND o.status IS DISTINCT FROM 'CANCELLED';

    RETURN jsonb_build_object(
      'booking_id', v_existing.id,
      'seats', v_existing.seats,
      'total_quota', v_pkg.total_quota,
      'consumed', v_consumed,
      'remaining', v_pkg.total_quota - v_consumed,
      'already_booked', true
    );
  END IF;

  IF v_pkg.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'El paquete está cerrado y no admite ventas nuevas'
      USING ERRCODE = 'P0001';
  END IF;

  -- Conteo derivado, dentro del lock.
  SELECT COALESCE(SUM(b.seats), 0)::INTEGER INTO v_consumed
  FROM public.travel_package_bookings b
  JOIN public.operations o ON o.id = b.operation_id
  WHERE b.package_id = p_package_id
    AND o.status IS DISTINCT FROM 'CANCELLED';

  IF v_consumed + p_seats > v_pkg.total_quota THEN
    RAISE EXCEPTION 'travel package quota exhausted'
      USING
        ERRCODE = 'P4301',
        DETAIL = jsonb_build_object(
          'code', 'TRAVEL_PACKAGE_QUOTA_EXHAUSTED',
          'total_quota', v_pkg.total_quota,
          'consumed', v_consumed,
          'requested', p_seats,
          'remaining', GREATEST(v_pkg.total_quota - v_consumed, 0)
        )::TEXT;
  END IF;

  INSERT INTO public.travel_package_bookings (
    org_id, package_id, operation_id, seats, created_by
  ) VALUES (
    p_org_id, p_package_id, p_operation_id, p_seats, auth.uid()
  )
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object(
    'booking_id', v_booking_id,
    'seats', p_seats,
    'total_quota', v_pkg.total_quota,
    'consumed', v_consumed + p_seats,
    'remaining', v_pkg.total_quota - v_consumed - p_seats,
    'already_booked', false
  );
END;
$$;

COMMENT ON FUNCTION public.book_travel_package_seats(UUID, UUID, UUID, INTEGER) IS
'Toma cupo de un paquete para una operación: lockea el paquete, cuenta las '
'reservas activas y recién ahí inserta. ERRCODE P4301 = cupo agotado (la ruta lo '
'mapea a 409). Idempotente por operation_id. Único camino de escritura de '
'travel_package_bookings.';

REVOKE ALL ON FUNCTION public.book_travel_package_seats(UUID, UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_travel_package_seats(UUID, UUID, UUID, INTEGER) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────
-- 8. revalidate_travel_package_booking: los dos agujeros del modelo derivado.
-- ─────────────────────────────────────────────────────
-- Cancelar libera el cupo solo (el conteo excluye las CANCELLED), pero hay dos
-- caminos por los que el consumo puede CRECER sin pasar por book_...:
--
--   a) subir los pasajeros de una operación que ya tiene reserva;
--   b) des-cancelar una operación cuyo lugar ya se revendió.
--
-- Los dos entran por acá. Sin esta función el invariante no se sostiene.
CREATE OR REPLACE FUNCTION public.revalidate_travel_package_booking(
  p_operation_id UUID,
  p_org_id UUID,
  p_seats INTEGER DEFAULT NULL,          -- NULL = conservar las plazas actuales
  p_will_be_active BOOLEAN DEFAULT NULL  -- NULL = deducir del status actual
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.travel_package_bookings%ROWTYPE;
  v_pkg public.travel_packages%ROWTYPE;
  v_status TEXT;
  v_target_seats INTEGER;
  v_will_be_active BOOLEAN;
  v_consumed INTEGER;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Falta la organización' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_booking
  FROM public.travel_package_bookings
  WHERE operation_id = p_operation_id AND org_id = p_org_id;

  -- La enorme mayoría de las operaciones no tiene paquete. No es un error:
  -- el caller llama siempre y esta salida le dice que no hay nada que hacer.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_booking', false);
  END IF;

  SELECT * INTO v_pkg
  FROM public.travel_packages
  WHERE id = v_booking.package_id
  FOR UPDATE;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('travel-package-quota:' || v_booking.package_id::TEXT, 0)
  );

  SELECT status INTO v_status FROM public.operations WHERE id = p_operation_id;

  v_target_seats := COALESCE(p_seats, v_booking.seats);
  v_will_be_active := COALESCE(p_will_be_active, v_status IS DISTINCT FROM 'CANCELLED');

  IF v_target_seats < 1 THEN
    RAISE EXCEPTION 'Las plazas a reservar deben ser al menos 1' USING ERRCODE = 'P0001';
  END IF;

  -- Consumido por las DEMÁS operaciones. Excluir la propia es lo que permite
  -- subir de 2 a 3 plazas chequeando solo el delta, y lo que hace que
  -- des-cancelar se valide contra lo que se vendió mientras tanto.
  SELECT COALESCE(SUM(b.seats), 0)::INTEGER INTO v_consumed
  FROM public.travel_package_bookings b
  JOIN public.operations o ON o.id = b.operation_id
  WHERE b.package_id = v_booking.package_id
    AND b.operation_id <> p_operation_id
    AND o.status IS DISTINCT FROM 'CANCELLED';

  -- Una operación cancelada no consume: se guardan las plazas nuevas para que,
  -- si se reactiva, el chequeo de arriba use el número correcto.
  IF v_will_be_active AND v_consumed + v_target_seats > v_pkg.total_quota THEN
    RAISE EXCEPTION 'travel package quota exhausted'
      USING
        ERRCODE = 'P4301',
        DETAIL = jsonb_build_object(
          'code', 'TRAVEL_PACKAGE_QUOTA_EXHAUSTED',
          'total_quota', v_pkg.total_quota,
          'consumed', v_consumed,
          'requested', v_target_seats,
          'remaining', GREATEST(v_pkg.total_quota - v_consumed, 0)
        )::TEXT;
  END IF;

  IF v_target_seats <> v_booking.seats THEN
    UPDATE public.travel_package_bookings
    SET seats = v_target_seats
    WHERE id = v_booking.id;
  END IF;

  RETURN jsonb_build_object(
    'has_booking', true,
    'booking_id', v_booking.id,
    'package_id', v_booking.package_id,
    'seats', v_target_seats,
    'total_quota', v_pkg.total_quota,
    'consumed', v_consumed + (CASE WHEN v_will_be_active THEN v_target_seats ELSE 0 END),
    'remaining', v_pkg.total_quota - v_consumed - (CASE WHEN v_will_be_active THEN v_target_seats ELSE 0 END)
  );
END;
$$;

COMMENT ON FUNCTION public.revalidate_travel_package_booking(UUID, UUID, INTEGER, BOOLEAN) IS
'Revalida el cupo de una operación que ya tiene reserva, al cambiar sus '
'pasajeros o al sacarla de CANCELLED. Devuelve has_booking=false si la operación '
'no consume ningún paquete. P4301 si no entra.';

REVOKE ALL ON FUNCTION public.revalidate_travel_package_booking(UUID, UUID, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revalidate_travel_package_booking(UUID, UUID, INTEGER, BOOLEAN) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────
-- 9. set_travel_package_quota: cambiar el cupo sin dejarlo bajo lo vendido.
-- ─────────────────────────────────────────────────────
-- Sin esto, bajar el cupo deja el disponible negativo y la pantalla miente.
CREATE OR REPLACE FUNCTION public.set_travel_package_quota(
  p_package_id UUID,
  p_org_id UUID,
  p_total_quota INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pkg public.travel_packages%ROWTYPE;
  v_consumed INTEGER;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Falta la organización' USING ERRCODE = 'P0001';
  END IF;
  IF p_total_quota IS NULL OR p_total_quota < 0 THEN
    RAISE EXCEPTION 'El cupo no puede ser negativo' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_pkg
  FROM public.travel_packages
  WHERE id = p_package_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El paquete seleccionado no existe' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('travel-package-quota:' || p_package_id::TEXT, 0)
  );

  SELECT COALESCE(SUM(b.seats), 0)::INTEGER INTO v_consumed
  FROM public.travel_package_bookings b
  JOIN public.operations o ON o.id = b.operation_id
  WHERE b.package_id = p_package_id
    AND o.status IS DISTINCT FROM 'CANCELLED';

  IF p_total_quota < v_consumed THEN
    RAISE EXCEPTION 'travel package quota below consumed'
      USING
        ERRCODE = 'P4302',
        DETAIL = jsonb_build_object(
          'code', 'TRAVEL_PACKAGE_QUOTA_BELOW_CONSUMED',
          'total_quota', p_total_quota,
          'consumed', v_consumed
        )::TEXT;
  END IF;

  UPDATE public.travel_packages
  SET total_quota = p_total_quota
  WHERE id = p_package_id;

  RETURN jsonb_build_object(
    'total_quota', p_total_quota,
    'consumed', v_consumed,
    'remaining', p_total_quota - v_consumed
  );
END;
$$;

COMMENT ON FUNCTION public.set_travel_package_quota(UUID, UUID, INTEGER) IS
'Cambia el cupo de un paquete con lock, rechazando (P4302) bajarlo por debajo de '
'las plazas ya vendidas.';

REVOKE ALL ON FUNCTION public.set_travel_package_quota(UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_travel_package_quota(UUID, UUID, INTEGER) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────
-- 10. replace_travel_package_items: reemplazo atómico de las patas.
-- ─────────────────────────────────────────────────────
-- Molde: replace_operation_operators (20260812000003), MÁS el scope por org que
-- a esa función le falta — no repetir esa deuda en una función nueva.
--
-- La protección contra "una lista vacía del cliente borra todo en silencio" no
-- vive acá sino en la ruta (flag items_replace + gate itemsLoaded), igual que
-- con operation_legs.
CREATE OR REPLACE FUNCTION public.replace_travel_package_items(
  p_package_id UUID,
  p_org_id UUID,
  p_items JSONB  -- [{operator_id, product_type, cost, cost_currency, sale_amount, notes}]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_index INTEGER := 0;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Falta la organización' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.travel_packages
    WHERE id = p_package_id AND org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'El paquete seleccionado no existe' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.travel_package_items WHERE package_id = p_package_id;

  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.travel_package_items (
        org_id, package_id, operator_id, product_type,
        cost, cost_currency, sale_amount, notes, sort_order
      ) VALUES (
        p_org_id,
        p_package_id,
        (v_item->>'operator_id')::UUID,
        NULLIF(v_item->>'product_type', ''),
        COALESCE((v_item->>'cost')::NUMERIC, 0),
        COALESCE(NULLIF(v_item->>'cost_currency', ''), 'USD'),
        COALESCE((v_item->>'sale_amount')::NUMERIC, 0),
        NULLIF(v_item->>'notes', ''),
        v_index
      );
      v_index := v_index + 1;
    END LOOP;
  END IF;

  RETURN v_index;
END;
$$;

COMMENT ON FUNCTION public.replace_travel_package_items(UUID, UUID, JSONB) IS
'Reemplaza atómicamente las patas de un paquete (DELETE + INSERT en una '
'transacción). sort_order sale del orden del array: la primera pata define el '
'operador principal al aplicar el paquete.';

REVOKE ALL ON FUNCTION public.replace_travel_package_items(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_travel_package_items(UUID, UUID, JSONB) TO authenticated, service_role;

COMMIT;
