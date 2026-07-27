-- Permiso por vendedor: cargar operaciones a nombre de OTRO vendedor.
-- Sensible (mueve atribución de venta y cálculo de comisiones), por eso es
-- opt-in por usuario y lo habilita el admin de la agencia, vendedor por vendedor.
-- Sigue el patrón de can_view_agency_operations_support / can_add_services_on_agency_operations.
alter table public.users
  add column if not exists can_create_operations_for_other_sellers boolean not null default false;

comment on column public.users.can_create_operations_for_other_sellers is
  'Si es true, un SELLER puede crear operaciones asignándolas a otro vendedor de sus mismas agencias. Default false. Lo togglea el admin desde Configuración → Usuarios → Permisos especiales.';
