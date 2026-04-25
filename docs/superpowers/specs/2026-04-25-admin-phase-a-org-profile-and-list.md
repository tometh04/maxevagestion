# Admin Panel — Phase A: Org Profile + List Discovery

**Fecha**: 2026-04-25
**Autor**: Tomi (brainstorm con Claude)
**Estado**: spec — pendiente de plan de ejecución

## Contexto

El panel `/admin/*` (Vibook platform admin) hoy funciona pero es ciego para el rol comercial:

- `/admin/orgs` lista las orgs con datos técnicos (slug, max_users, max_agencies) pero sin contacto, dirección, condición fiscal, ni indicador de "qué tan completo está el perfil".
- `/admin/orgs/[id]` muestra métricas operativas (members, ops, MRR) y acciones de billing, pero no muestra los datos de contacto/fiscales del cliente.
- La lista no tiene búsqueda, filtros, sort ni paginación. Hardcoded `limit(200)`.

**Phase A** es la primera de cinco fases del roadmap admin (decompuesto en sesión `2026-04-25-admin-audit`). Cubre dos bloques:

1. **Perfil de la org**: agregar columnas faltantes a `organizations` y exponerlas en el detalle del admin.
2. **Lista enriquecida**: search/filter/sort/pagination en `/admin/orgs` + badge de completitud.

**Phase B** (métricas SaaS — MRR/ARR/churn), **Phase C** (org 360 con activity timeline), **Phase D** (operaciones de billing) y **Phase E** (impersonate/quick actions) van en specs aparte.

## Scope

### Incluye

- Migration que agrega 9 columnas nullable a `organizations` (datos de contacto + dirección + condición fiscal AR + notas internas admin-only).
- Migration que crea VIEW `organizations_with_profile_completion` (computa `profile_completion` 0-9).
- Refactor de `app/admin/orgs/page.tsx`: search por URL params, filtros (status / plan / completion / has_custom_plan / has_preapproval), sort por columna clickeable (name / plan / created_at / completion), paginación 50/página.
- Nuevo `components/admin/org-profile-card.tsx`: vista read-only + form inline para que admin edite/sobrescriba.
- Nuevo endpoint `app/api/admin/orgs/[id]/profile/route.ts` (PATCH).
- Componentes auxiliares: `orgs-search-bar`, `orgs-filters`, `orgs-table`, `orgs-pagination`, `profile-badge`.
- Audit log nuevo: evento `ORG_PROFILE_UPDATED_BY_ADMIN` en `security_audit_log`.

### NO incluye (queda explícitamente fuera)

- UI del tenant para llenar el perfil (form en `/settings`, banner nudge, validaciones required-vs-optional desde el lado del cliente). **Eso lo resuelve Tomi en otra sesión dedicada al tenant onboarding.**
- Sort por MRR — depende de cómputo agregado que es alcance de Phase B.
- Sort por last_activity — depende de `user_activity_log` que es alcance de Phase C.
- Audit visual "última edición fue del tenant vs admin" — se puede sumar después leyendo `security_audit_log`, no es bloqueante.
- Histórico de cambios timeline — Phase C.
- Bulk actions, export CSV, saved filter presets — no hay urgencia, sumamos cuando duela.
- Tabs en `/admin/orgs/[id]` (General / Billing / Activity) — Phase C.

## Decisiones técnicas

### 1. Modelo de datos

Migration `20260425130000_organizations_tenant_profile.sql`:

```sql
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS contact_name        TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone       TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes      TEXT,
  ADD COLUMN IF NOT EXISTS address_street      TEXT,
  ADD COLUMN IF NOT EXISTS address_city        TEXT,
  ADD COLUMN IF NOT EXISTS address_province    TEXT,
  ADD COLUMN IF NOT EXISTS address_country     TEXT DEFAULT 'AR',
  ADD COLUMN IF NOT EXISTS address_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS tax_category        TEXT
    CHECK (tax_category IN (
      'RESPONSABLE_INSCRIPTO',
      'MONOTRIBUTO',
      'EXENTO',
      'CONSUMIDOR_FINAL',
      'NO_RESPONSABLE'
    ));
```

**Ya aplicada en prod 2026-04-25** (Supabase project `pmqvplyyxiobkllapgjp`).

**RLS**: las policies actuales de `organizations` (members read + owner update) cubren las nuevas columnas. `internal_notes` se filtra a nivel de endpoint del tenant (cuando exista) — no en RLS, así admin lo lee normal con service_role.

**Indexación**: ninguna por ahora. Si search por CUIT se vuelve lento con N>1000 orgs, agregar `CREATE INDEX organizations_cuit_idx ON organizations(cuit) WHERE cuit IS NOT NULL`.

### 2. VIEW para completitud

Migration `20260425131000_organizations_profile_completion_view.sql`:

```sql
CREATE OR REPLACE VIEW organizations_with_profile_completion AS
SELECT
  o.*,
  (
    (CASE WHEN o.contact_name        IS NOT NULL AND o.contact_name        <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.contact_phone       IS NOT NULL AND o.contact_phone       <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.cuit                IS NOT NULL AND o.cuit                <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.tax_category        IS NOT NULL                                 THEN 1 ELSE 0 END) +
    (CASE WHEN o.billing_email       IS NOT NULL AND o.billing_email       <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.address_street      IS NOT NULL AND o.address_street      <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.address_city        IS NOT NULL AND o.address_city        <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.address_province    IS NOT NULL AND o.address_province    <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.address_postal_code IS NOT NULL AND o.address_postal_code <> '' THEN 1 ELSE 0 END)
  ) AS profile_completion
FROM organizations o;
```

`internal_notes` y `address_country` (default `AR`) NO cuentan para los 9 puntos.

La VIEW hereda RLS de la tabla base — admin queryea con service_role, sin problema.

### 3. Endpoint admin profile update

`app/api/admin/orgs/[id]/profile/route.ts`:

- Método: `PATCH`
- Auth: `isPlatformAdmin()` (consistente con el resto de `/api/admin/orgs/[id]/*`).
- Body acepta cualquier subset de las 9 columnas + `internal_notes` + `address_country`.
- Validaciones server-side:
  - `cuit`: si presente, 11 dígitos numéricos (regex `/^\d{11}$/` después de strip de guiones).
  - `tax_category`: si presente, debe matchear el CHECK constraint.
  - `address_country`: si presente, 2 letras uppercase (default `AR`).
  - `contact_phone`: si presente, normalizar a E.164 best-effort (no bloquear si no parsea, solo guardar tal cual).
- Update via `createAdminClient()` (bypass RLS).
- Log a `security_audit_log` con `event_type='ORG_PROFILE_UPDATED_BY_ADMIN'`, severity `INFO`, target_org_id, details = `{ changed_fields: [...], before: {...}, after: {...} }`.
- Retorna `{ ok: true, profile }` con la org actualizada.

### 4. URL params del listado

```
/admin/orgs?
  q=<search>
  &status=ACTIVE|TRIAL|SUSPENDED|CANCELLED|PAST_DUE
  &plan=STARTER|PROFESSIONAL|ENTERPRISE|CUSTOM
  &completion=empty|partial|complete
  &has_custom_plan=true
  &has_preapproval=true
  &sort=name|plan|created_at|profile_completion
  &dir=asc|desc
  &page=1
```

Params ausentes = sin filtro. URL es la fuente de verdad — server component re-renderiza al cambiar.

### 5. Search

- Detección UUID: si input matchea `/^[0-9a-f-]{36}$/` → `.eq('id', input)`.
- Si no → `.or()` con `ILIKE %input%` sobre `name, slug, cuit, billing_email, contact_name, contact_phone`.
- Sin debounce server-side (cada keystroke recarga). Para evitar overflow, el input usa form submit o un wrapper client con debounce de 300ms que actualiza la URL.

### 6. Pagination

- Page size: 50. Hardcoded en constante exportada de `lib/admin/constants.ts` (un solo lugar para cambiar).
- Total count: query separada `count: 'exact'` con los mismos filtros (sin sort/pagination).
- UI: `◀ 1 2 3 ... N ▶` con números y prev/next.

### 7. Sort

Default: `created_at DESC`. Columnas clickeables en el header de la tabla:

- `name` (text)
- `plan` (text — orden alfabético, no semántico)
- `created_at` (timestamp)
- `profile_completion` (integer)

Click toggle asc/desc. Sort actual indicado con flecha (▲ asc / ▼ desc).

`mrr` y `last_activity` quedan fuera (Phase B y C).

## Componentes UI

| Archivo | Propósito |
|---|---|
| `components/admin/org-profile-card.tsx` | Card en `/admin/orgs/[id]` — read-only con toggle a edit form. Sección admin-only para `internal_notes`. |
| `components/admin/org-profile-form.tsx` | Form interno del card. Validación client + submit a PATCH. |
| `components/admin/orgs-search-bar.tsx` | Input con debounce 300ms que actualiza la URL. Incluye botón "Limpiar" si hay query. |
| `components/admin/orgs-filters.tsx` | Selects (status, plan, completion) + checkboxes (has_custom_plan, has_preapproval). Mutan URL on change. |
| `components/admin/orgs-table.tsx` | Tabla con headers clickeables que togglean sort. Columnas: badge perfil, nombre+slug, status, plan (con ✦ si custom), contacto resumido, creada (relativa). |
| `components/admin/orgs-pagination.tsx` | Numeritos + prev/next. Lee `?page=N` de URL. |
| `components/admin/profile-badge.tsx` | Reutilizable: 🟢 / 🟡 / 🔴 + tooltip "X/9". Usa el campo `profile_completion` de la VIEW. |

## Endpoints

| Path | Método | Auth | Propósito |
|---|---|---|---|
| `/api/admin/orgs/[id]/profile` | PATCH | platform_admin | Actualizar perfil de una org. |

## Tests

- **Unit (`__tests__/lib/admin/profile-completion.test.ts`)**: helper que cuenta campos llenos, asegura que `internal_notes` y `address_country` NO suman.
- **Unit (`__tests__/api/admin/orgs/profile.test.ts`)**: validaciones del endpoint (CUIT formato, tax_category enum, country 2 letras, no-platform-admin → 403).
- **Smoke E2E manual**: editar perfil de Lozada como Tomi, ver que se persiste, ver que `security_audit_log` registra el evento, ver que la VIEW devuelve `profile_completion` correcto.
- **No se requiere test de RLS** — la VIEW hereda de `organizations` que ya está cubierto por `__tests__/isolation/`.

## Audit log

Nuevo `event_type`: `ORG_PROFILE_UPDATED_BY_ADMIN`.

Severity: `INFO`.

Details JSON:
```json
{
  "changed_fields": ["contact_phone", "tax_category"],
  "before": { "contact_phone": null, "tax_category": null },
  "after":  { "contact_phone": "+5493415551234", "tax_category": "RESPONSABLE_INSCRIPTO" }
}
```

Se registra `actor_user_id`, `target_org_id`, `request_path`, `request_ip` (todo lo que ya provee `lib/security/audit.ts::logSecurityEvent`).

## Riesgos y consideraciones

- **Tenant edita en paralelo**: si tenant y admin editan al mismo tiempo, gana el último. No hay optimistic concurrency control. Probabilidad baja (poco N de tenants), impacto bajo (un campo se sobrescribe). **Aceptado.**
- **VIEW performance con N grande**: el CASE de 9 expresiones es trivial para Postgres. Hasta 10k orgs, sin index = OK. Si crece más, materializar la columna directamente en `organizations` con trigger.
- **Search ILIKE sin index**: hasta N≤500 orgs, full scan es instantáneo. Después, considerar trigram index `pg_trgm` sobre las columnas más buscadas.
- **`internal_notes` en respuestas**: hoy admin lee con service_role, OK. Cuando el tenant tenga su settings page (otra sesión), su endpoint debe filtrar `internal_notes` explícitamente del SELECT. Spec del tenant lo va a marcar.

## Plan de despliegue

1. Migration 163 (ALTER TABLE) — **YA aplicada** 2026-04-25.
2. Migration 164 (VIEW) — pendiente, parte de la ejecución.
3. Regenerar types con `npx supabase gen types typescript --project-id pmqvplyyxiobkllapgjp > lib/supabase/types.ts`.
4. Implementar componentes + endpoint + refactor de la page.
5. Tests unitarios.
6. Smoke manual en prod después del push (admin@vibook.ai edita Lozada, ve el badge, busca por CUIT).
7. Commits locales hasta tener el flujo completo, push con OK explícito de Tomi.

## Referencias cruzadas

- Memoria `project_admin_custom_plans_sprint.md` — patrón de endpoints `/api/admin/orgs/[id]/*` usado como template.
- Memoria `project_saas_conversion.md` — RLS multi-tenant, patrón service_role en checks de platform admin.
- Feedback `feedback_supabase_migrations.md` — SQL al chat para pegar manualmente, no `supabase db push`.
- Feedback `feedback_no_push_until_told.md` — commits locales libres, push siempre con confirmación.
- Audit del admin (sesión actual) — gaps encontrados que motivaron este spec.
