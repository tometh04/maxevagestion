-- VIB-183 fix: guardar una venta sobre un paquete devolvía "Error interno".
--
-- `book_travel_package_seats` insertaba `created_by = auth.uid()`, y la FK de esa
-- columna apunta a `public.users(id)`.
--
-- En este esquema `public.users` tiene `id` Y `auth_id` por separado, y NUNCA
-- coinciden: medido en producción, 0 de 127 usuarios tienen `users.id` igual al
-- id de `auth.users`. Así que el INSERT violaba la FK con 23503, la ruta lo
-- mapeaba al caso por defecto (500 "Error interno") y NINGUNA venta sobre un
-- paquete se podía guardar.
--
-- La pista estaba a la vista en el propio esquema: `get_user_org_id` recibe
-- `p_user_auth_id`, justamente porque el id de auth no es el de la app.
--
-- Ahora se resuelve el id de la app desde `auth_id`. Si no hay sesión de usuario
-- (service_role, cron), queda NULL, que es lo correcto: la columna es nullable y
-- la reserva no pierde nada por no saber quién la creó.
--
-- Copia exacta de la versión de 20260908000001 con ese único cambio.

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
AS $fn$
DECLARE
  v_pkg public.travel_packages%ROWTYPE;
  v_existing public.travel_package_bookings%ROWTYPE;
  v_consumed INTEGER;
  v_booking_id UUID;
  v_actor UUID;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Falta la organizacion' USING ERRCODE = 'P0001';
  END IF;
  IF p_seats IS NULL OR p_seats < 1 THEN
    RAISE EXCEPTION 'Las plazas a reservar deben ser al menos 1' USING ERRCODE = 'P0001';
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

  IF NOT EXISTS (
    SELECT 1 FROM public.operations WHERE id = p_operation_id AND org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'La operacion no existe' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing
  FROM public.travel_package_bookings
  WHERE operation_id = p_operation_id;

  IF FOUND THEN
    IF v_existing.package_id <> p_package_id THEN
      RAISE EXCEPTION 'La operacion ya consume cupo de otro paquete' USING ERRCODE = 'P0001';
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
    RAISE EXCEPTION 'El paquete esta cerrado y no admite ventas nuevas' USING ERRCODE = 'P0001';
  END IF;

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

  -- ACÁ está el fix: users.id NO es auth.uid().
  SELECT id INTO v_actor FROM public.users WHERE auth_id = auth.uid();

  INSERT INTO public.travel_package_bookings (org_id, package_id, operation_id, seats, created_by)
  VALUES (p_org_id, p_package_id, p_operation_id, p_seats, v_actor)
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
$fn$;
