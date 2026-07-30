-- VIB-69: Asesor de viajes independiente (AVI).
--
-- Freelancer que vende para la agencia: carga sus ventas en el sistema y ve
-- únicamente sus propias operaciones, sus clientes, sus comisiones y sus
-- documentos. No accede al CRM/leads de la agencia ni al resto de la
-- información.
--
-- Se modela como un SELLER endurecido en vez de un rol nuevo a propósito: la
-- restricción "solo mis datos" ya está implementada y auditada para SELLER en
-- toda la app (filtros de operaciones/comisiones/reportes, RPCs con
-- p_role = 'SELLER', selectores de vendedor, reglas de comisión con
-- type = 'SELLER'). Un string de rol nuevo caería en la rama "else" de esos
-- checks — es decir, vería TODA la agencia — y quedaría fuera de las comisiones.
--
-- El endurecimiento sobre SELLER vive en lib/permissions.ts
-- (INDEPENDENT_ADVISOR_PERMS) y se aplica como intersección: un asesor
-- independiente nunca puede recibir más permisos que ese techo, ni siquiera vía
-- overrides de agency_role_permissions o additional_roles.

alter table public.users
  add column if not exists is_independent_advisor boolean not null default false;

comment on column public.users.is_independent_advisor is
  'VIB-69. Si es true (solo válido con role = SELLER), el usuario es un asesor de viajes independiente: ve y gestiona únicamente sus propias operaciones, clientes, comisiones y documentos, sin acceso a leads/CRM ni al resto de la información de la agencia. Lo asigna el admin desde Configuración → Usuarios.';

create index if not exists idx_users_independent_advisor
  on public.users (org_id)
  where is_independent_advisor;
