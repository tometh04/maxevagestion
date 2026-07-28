-- Permiso por vendedor: registrar cobros/pagos en operaciones de OTROS
-- vendedores de sus mismas agencias (no solo en las propias).
-- Sensible (mueve plata: cobros al pasajero y pagos al operador), por eso es
-- opt-in por usuario y lo habilita el admin de la agencia, vendedor por vendedor.
-- Sigue el patrón de can_view_agency_operations_support /
-- can_create_operations_for_other_sellers.
alter table public.users
  add column if not exists can_register_payments_on_agency_operations boolean not null default false;

comment on column public.users.can_register_payments_on_agency_operations is
  'Si es true, un SELLER puede registrar cobros/pagos en operaciones de sus mismas agencias aunque no sea el vendedor asignado. Default false. Lo togglea el admin desde Configuración → Usuarios → Permisos especiales.';
