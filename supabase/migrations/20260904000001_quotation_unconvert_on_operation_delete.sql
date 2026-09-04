-- Borrar una operación creada desde una cotización.
--
-- Hasta acá era imposible, para cualquiera. Dos candados:
--
--   1. `quotation_provider_bookings.operation_id` estaba en ON DELETE RESTRICT,
--      así que el seguimiento de la reserva con el proveedor bloqueaba el
--      borrado aunque la reserva nunca hubiera salido de QUEUED.
--   2. `quotations.operation_id` es ON DELETE SET NULL y ese UPDATE en cascada
--      dispara el guard de ciclo de vida, que lo rechazaba incluso ejecutando
--      como service_role ("quotation operation link is immutable outside
--      conversion").
--
-- El usuario sólo veía "Error al eliminar operación". Lo reportó Lozada con dos
-- operaciones cargadas de prueba que no podía sacar del listado.
--
-- El seguimiento de la reserva pasa a CASCADE: sin operación no tiene qué
-- seguir, y que la reserva esté realmente tomada en el proveedor lo corta la
-- ruta de borrado con un mensaje que se entiende. El guard aprende la
-- desconversión: si la operación ya no existe, la cotización se puede
-- desvincular y volver a APPROVED para convertirla de nuevo.

ALTER TABLE public.quotation_provider_bookings
  DROP CONSTRAINT quotation_provider_bookings_operation_id_fkey,
  ADD CONSTRAINT quotation_provider_bookings_operation_id_fkey
    FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.guard_quotation_lifecycle_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Desconversión, paso 1: se borró la operación y la FK limpia el vínculo.
  -- Exige que la operación YA NO EXISTA, condición que un UPDATE de usuario no
  -- puede fabricar: `operation_id` es inmutable salvo por esta cascada.
  IF OLD.operation_id IS NOT NULL
    AND NEW.operation_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.operations WHERE id = OLD.operation_id)
  THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'la cotización no puede cambiar de estado en el mismo paso que se desvincula'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  -- Desconversión, paso 2: la cotización quedó CONVERTED apuntando a nada, así
  -- que vuelve a APPROVED y se puede convertir de nuevo. Sólo se llega acá
  -- después del paso 1.
  IF OLD.status = 'CONVERTED'
    AND OLD.operation_id IS NULL
    AND NEW.status = 'APPROVED'
    AND NEW.operation_id IS NULL
    AND NEW.converted_at IS NULL
    AND NEW.approved_at IS NOT DISTINCT FROM OLD.approved_at
    AND NEW.approved_by IS NOT DISTINCT FROM OLD.approved_by
    AND NEW.rejection_reason IS NOT DISTINCT FROM OLD.rejection_reason
  THEN
    RETURN NEW;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' AND (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
    OR NEW.converted_at IS DISTINCT FROM OLD.converted_at
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
  ) THEN
    RAISE EXCEPTION 'quotation lifecycle mutations are server-only'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('SENT', 'PENDING_APPROVAL', 'REJECTED', 'EXPIRED'))
    OR (OLD.status = 'SENT' AND NEW.status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED'))
    OR (OLD.status = 'PENDING_APPROVAL' AND NEW.status IN ('SENT', 'APPROVED', 'REJECTED', 'EXPIRED'))
    OR (OLD.status = 'APPROVED' AND NEW.status IN ('CONVERTING', 'CONVERTED'))
    OR (OLD.status = 'CONVERTING' AND NEW.status IN ('APPROVED', 'CONVERTED'))
  ) THEN
    RAISE EXCEPTION 'invalid quotation lifecycle transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '55000';
  END IF;

  IF NEW.operation_id IS DISTINCT FROM OLD.operation_id THEN
    IF OLD.operation_id IS NOT NULL
      OR NEW.operation_id IS NULL
      OR NEW.status <> 'CONVERTED'
      OR OLD.status NOT IN ('APPROVED', 'CONVERTING')
    THEN
      RAISE EXCEPTION 'quotation operation link is immutable outside conversion'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF NEW.converted_at IS DISTINCT FROM OLD.converted_at AND (
    OLD.converted_at IS NOT NULL
    OR NEW.converted_at IS NULL
    OR NEW.status <> 'CONVERTED'
  ) THEN
    RAISE EXCEPTION 'quotation converted_at is immutable outside conversion'
      USING ERRCODE = '55000';
  END IF;

  IF (NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR NEW.approved_by IS DISTINCT FROM OLD.approved_by)
    AND NEW.status <> 'APPROVED'
  THEN
    RAISE EXCEPTION 'quotation approval metadata requires APPROVED status'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
    AND NEW.status <> 'REJECTED'
  THEN
    RAISE EXCEPTION 'quotation rejection metadata requires REJECTED status'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$function$;
