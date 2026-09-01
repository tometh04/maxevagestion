-- Qué tipos de servicio comisionan, configurable por oficina.
--
-- Hasta ahora la lista vivía hardcodeada en `lib/commissions/service-commission.ts`
-- (`COMMISSION_SERVICE_TYPES`), con SEAT/LUGGAGE/VISA afuera por ser "cargos
-- administrativos que se trasladan al pasajero sin margen". En la práctica no es
-- cierto para todas las agencias: en Lozada los asientos y el equipaje se venden
-- con margen propio y el vendedor los comisiona. Como es un criterio comercial de
-- cada oficina y no una regla del dominio, pasa a `financial_settings`, que ya es
-- por agencia y ya es donde viven las otras perillas de comisión
-- (`commission_base_net_of_iva`, `commission_iva_rate`, `commission_net_from`).
--
-- SIN BACKFILL, A PROPÓSITO. Es el caso inverso a la landmine de `accrual_date`:
-- allá el DEFAULT llenó filas que después un `UPDATE ... WHERE col IS NULL` no
-- encontró; acá el DEFAULT llenando todas las filas existentes ES el resultado
-- buscado, porque reproduce exactamente el comportamiento actual. Ninguna agencia
-- cambia de conducta al deployar; cada una opta por su cuenta desde Finanzas.

ALTER TABLE public.financial_settings
  ADD COLUMN IF NOT EXISTS commission_service_types JSONB NOT NULL
    DEFAULT '["TRANSFER","ASSISTANCE","HOTEL","FLIGHT","EXCURSION"]'::jsonb;

-- El CHECK no puede validar contra el enum `operation_service_type` con una
-- subquery, así que el catálogo se repite acá como literal y se valida por
-- containment de arrays jsonb (`<@`), que da la misma garantía en una sola
-- expresión: todo elemento del array tiene que ser un tipo conocido.
ALTER TABLE public.financial_settings
  DROP CONSTRAINT IF EXISTS financial_settings_commission_service_types_check;

ALTER TABLE public.financial_settings
  ADD CONSTRAINT financial_settings_commission_service_types_check CHECK (
    jsonb_typeof(commission_service_types) = 'array'
    AND commission_service_types
        <@ '["SEAT","LUGGAGE","VISA","TRANSFER","ASSISTANCE","HOTEL","FLIGHT","EXCURSION"]'::jsonb
  );

COMMENT ON COLUMN public.financial_settings.commission_service_types IS
  'Tipos de operation_services que comisionan por defecto en esta agencia. Es solo el DEFAULT al cargar o cambiar el tipo de un servicio: operation_services.generates_commission es la verdad de cada fila y el switch de la UI lo pisa. Default = el set histórico (TRANSFER, ASSISTANCE, HOTEL, FLIGHT, EXCURSION).';
