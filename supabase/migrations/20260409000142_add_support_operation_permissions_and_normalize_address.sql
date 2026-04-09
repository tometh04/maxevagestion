alter table public.users
  add column if not exists can_view_agency_operations_support boolean not null default false,
  add column if not exists can_add_services_on_agency_operations boolean not null default false;

insert into public.organization_settings (key, value, updated_at)
values
  ('address', 'Corrientes 631 Piso 1 Oficina F', now()),
  ('company_address', 'Corrientes 631 Piso 1 Oficina F', now())
on conflict (key) do update
set
  value = excluded.value,
  updated_at = excluded.updated_at;
