# Admin Phase A — Org Profile + List Discovery: Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enriquecer `/admin/orgs` con search/filter/sort/pagination + badge de completitud, y agregar perfil editable por admin en `/admin/orgs/[id]`.

**Architecture:** 9 columnas nullable nuevas en `organizations` (mig 163, ya aplicada). VIEW `organizations_with_profile_completion` (mig 164) computa el `profile_completion` 0-9 para sort/filter en la lista. Endpoint PATCH dedicado al admin con audit log. Componentes server-side por default; client-side solo para el form y los inputs interactivos (search debounce, filter selects). URL es source-of-truth para filtros (URLSearchParams), sin estado JS persistente.

**Tech Stack:** Next.js 15 App Router, React Server Components, Supabase (PostgreSQL + RLS), shadcn/ui, TailwindCSS, Jest.

**Spec:** `docs/superpowers/specs/2026-04-25-admin-phase-a-org-profile-and-list.md`

---

## File Structure

### Crear

| Path | Responsabilidad |
|---|---|
| `supabase/migrations/20260425130000_organizations_tenant_profile.sql` | Migration 163 post-hoc (SQL ya pegado en prod) |
| `supabase/migrations/20260425131000_organizations_profile_completion_view.sql` | VIEW que computa `profile_completion` |
| `lib/admin/constants.ts` | `ORGS_PAGE_SIZE`, `TAX_CATEGORIES`, types asociados |
| `lib/admin/profile-completion.ts` | Helper TS para recalcular completion del lado cliente |
| `app/api/admin/orgs/[id]/profile/route.ts` | Endpoint PATCH para que admin actualice perfil |
| `components/admin/profile-badge.tsx` | Badge 🟢/🟡/🔴 reutilizable (lista + detalle) |
| `components/admin/org-profile-card.tsx` | Server component: card del perfil en `/admin/orgs/[id]` |
| `components/admin/org-profile-form.tsx` | Client component: form inline editable |
| `components/admin/orgs-search-bar.tsx` | Client component: input con debounce que muta URL |
| `components/admin/orgs-filters.tsx` | Client component: selects + checkboxes |
| `components/admin/orgs-table.tsx` | Server component: tabla con headers clickeables |
| `components/admin/orgs-pagination.tsx` | Server component: numeritos + prev/next link-based |
| `__tests__/lib/admin/profile-completion.test.ts` | Tests del helper TS |
| `__tests__/api/admin/orgs/profile.test.ts` | Tests del endpoint PATCH |

### Modificar

| Path | Cambio |
|---|---|
| `app/admin/orgs/page.tsx` | Refactor full: aceptar searchParams, query VIEW, componentes nuevos |
| `app/admin/orgs/[id]/page.tsx` | Insertar `<OrgProfileCard>` arriba del custom plan |
| `lib/supabase/types.ts` | Regenerar tras correr migration 164 |

---

## Notas de ejecución

- **Commits locales libres, push solo con OK explícito de Tomi** (memoria `feedback_no_push_until_told.md`).
- **Migrations: SQL al chat para pegar en Supabase SQL Editor**, nunca `supabase db push` (memoria `feedback_supabase_migrations.md`). El archivo `.sql` se commitea al repo como tracking.
- **Regenerar types DESPUÉS de cada migration aplicada** con `npx supabase gen types typescript --project-id pmqvplyyxiobkllapgjp > lib/supabase/types.ts`. Importante: el output a veces empieza con un `npm warn exec` que hay que sacar manualmente del file (lo viste antes).
- **Test runner**: `npm run test` (jest configurado, ver `jest.config.js`).

---

## Task 1: Migration 163 — agregar archivo al repo (SQL ya aplicada)

**Contexto:** El SQL de las 9 columnas ya fue pegado en SQL Editor de prod 2026-04-25 y aplicado con éxito. Solo falta versionar el archivo en `supabase/migrations/` para tracking.

**Files:**
- Create: `supabase/migrations/20260425130000_organizations_tenant_profile.sql`

- [ ] **Step 1: Crear el archivo de migration**

Contenido exacto:

```sql
-- =====================================================
-- Migración 163: Tenant Profile Fields (Phase A admin)
-- =====================================================
-- Agrega 9 columnas nullable a organizations para que el tenant
-- complete su perfil (contacto, dirección fiscal, condición fiscal AR)
-- + 1 columna admin-only (internal_notes).
--
-- RLS: las policies actuales (members read + owner update) cubren las
-- nuevas columnas. internal_notes se filtra a nivel de endpoint del
-- tenant (cuando exista) — no en RLS, así admin lee normal con service_role.

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

COMMENT ON COLUMN organizations.internal_notes IS
  'Notas admin-only sobre la org. NO debe exponerse al tenant en sus endpoints.';
```

- [ ] **Step 2: Confirmar que la SQL ya está aplicada**

Verificación opcional pegando en SQL Editor:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'organizations'
  AND column_name IN (
    'contact_name','contact_phone','internal_notes',
    'address_street','address_city','address_province',
    'address_country','address_postal_code','tax_category'
  )
ORDER BY column_name;
```

Esperado: 9 rows.

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add supabase/migrations/20260425130000_organizations_tenant_profile.sql
git commit -m "feat(saas): add tenant profile fields to organizations (mig 163)

9 columnas nullable: contact (name, phone), internal_notes (admin-only),
address (street, city, province, country, postal_code) y tax_category
con CHECK constraint para condiciones fiscales AR.

SQL ya aplicada en prod 2026-04-25. Este commit solo trackea el archivo."
```

---

## Task 2: Migration 164 — VIEW de profile_completion

**Files:**
- Create: `supabase/migrations/20260425131000_organizations_profile_completion_view.sql`

- [ ] **Step 1: Crear el archivo de migration**

Contenido exacto:

```sql
-- =====================================================
-- Migración 164: VIEW organizations_with_profile_completion
-- =====================================================
-- Suma los 9 campos del perfil (excluyendo internal_notes y
-- address_country que tiene default) y expone profile_completion 0-9.
-- Usada por el listado /admin/orgs para sort/filter por completitud.

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

COMMENT ON VIEW organizations_with_profile_completion IS
  'Wrapper de organizations con profile_completion 0-9 calculado. RLS herendada de la tabla base.';
```

- [ ] **Step 2: Pegar la SQL en Supabase SQL Editor (prod) y correr**

Project: `pmqvplyyxiobkllapgjp`. Verificación post-run:

```sql
SELECT id, name, profile_completion
FROM organizations_with_profile_completion
LIMIT 5;
```

Esperado: rows con `profile_completion` integer entre 0 y 9.

Avisame en chat cuando esté corrido.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260425131000_organizations_profile_completion_view.sql
git commit -m "feat(saas): add organizations_with_profile_completion view (mig 164)

Wrapper de organizations con profile_completion 0-9 calculado en SQL.
Usada por /admin/orgs para sort/filter por completitud del perfil tenant.
internal_notes y address_country (con default) NO suman."
```

---

## Task 3: Regenerar Supabase types

**Files:**
- Modify: `lib/supabase/types.ts`

- [ ] **Step 1: Correr el generador**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx supabase gen types typescript --project-id pmqvplyyxiobkllapgjp > lib/supabase/types.ts
```

- [ ] **Step 2: Sacar contaminación de `npm warn exec` si la hay**

Abrir `lib/supabase/types.ts`, primera línea. Si dice `npm warn exec ...`, borrarla. La primera línea válida es `export type Json =`.

Verificar:

```bash
head -3 lib/supabase/types.ts
```

Esperado:
```
export type Json =
  | string
  | number
```

- [ ] **Step 3: Verificar que las nuevas columnas aparecen**

```bash
grep -A 1 "address_country\|tax_category\|profile_completion" lib/supabase/types.ts | head -20
```

Esperado: matches en la definición de `organizations` y de la view `organizations_with_profile_completion`.

- [ ] **Step 4: TypeCheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^lib/supabase/types.ts" | grep "error" | head
```

Esperado: sin output (sin errores fuera de types.ts mismo).

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "chore(types): regen supabase types after mig 163-164

Incluye 9 columnas nuevas en organizations + view
organizations_with_profile_completion."
```

---

## Task 4: Helper `lib/admin/profile-completion.ts` con TDD

**Files:**
- Create: `lib/admin/profile-completion.ts`
- Test:   `__tests__/lib/admin/profile-completion.test.ts`

- [ ] **Step 1: Escribir el test failing**

Crear `__tests__/lib/admin/profile-completion.test.ts`:

```ts
import {
  computeProfileCompletion,
  profileBadgeLevel,
  PROFILE_FIELD_COUNT,
} from "@/lib/admin/profile-completion"

describe("computeProfileCompletion", () => {
  it("returns 0 when all fields are null/undefined", () => {
    expect(computeProfileCompletion({})).toBe(0)
  })

  it("returns 9 when all 9 fields are filled", () => {
    expect(
      computeProfileCompletion({
        contact_name: "Maxi",
        contact_phone: "+5491234",
        cuit: "30123456789",
        tax_category: "RESPONSABLE_INSCRIPTO",
        billing_email: "x@y.com",
        address_street: "Av. Pellegrini 1234",
        address_city: "Rosario",
        address_province: "Santa Fe",
        address_postal_code: "S2000",
      }),
    ).toBe(9)
  })

  it("treats empty string as not-filled", () => {
    expect(computeProfileCompletion({ contact_name: "" })).toBe(0)
  })

  it("does NOT count internal_notes or address_country", () => {
    expect(
      computeProfileCompletion({
        internal_notes: "secret note",
        address_country: "AR",
      } as any),
    ).toBe(0)
  })

  it("PROFILE_FIELD_COUNT is 9", () => {
    expect(PROFILE_FIELD_COUNT).toBe(9)
  })
})

describe("profileBadgeLevel", () => {
  it("0 → empty", () => expect(profileBadgeLevel(0)).toBe("empty"))
  it("1-8 → partial", () => {
    for (let i = 1; i <= 8; i++) expect(profileBadgeLevel(i)).toBe("partial")
  })
  it("9 → complete", () => expect(profileBadgeLevel(9)).toBe("complete"))
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
npm run test -- __tests__/lib/admin/profile-completion.test.ts
```

Esperado: FAIL con error tipo "Cannot find module '@/lib/admin/profile-completion'".

- [ ] **Step 3: Implementar el helper**

Crear `lib/admin/profile-completion.ts`:

```ts
const FIELDS = [
  "contact_name",
  "contact_phone",
  "cuit",
  "tax_category",
  "billing_email",
  "address_street",
  "address_city",
  "address_province",
  "address_postal_code",
] as const

export const PROFILE_FIELD_COUNT = FIELDS.length

export type ProfileBadgeLevel = "empty" | "partial" | "complete"

export function computeProfileCompletion(
  org: Partial<Record<(typeof FIELDS)[number], string | null | undefined>>,
): number {
  return FIELDS.reduce((acc, key) => {
    const value = org[key]
    if (value !== null && value !== undefined && value !== "") return acc + 1
    return acc
  }, 0)
}

export function profileBadgeLevel(completion: number): ProfileBadgeLevel {
  if (completion === 0) return "empty"
  if (completion === PROFILE_FIELD_COUNT) return "complete"
  return "partial"
}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
npm run test -- __tests__/lib/admin/profile-completion.test.ts
```

Esperado: 5 + 3 = 8 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/profile-completion.ts __tests__/lib/admin/profile-completion.test.ts
git commit -m "feat(admin): add profile completion helper

computeProfileCompletion suma 9 campos (mismos que la SQL view).
profileBadgeLevel mapea 0→empty / 1-8→partial / 9→complete.
8 tests cubriendo casos vacío/full/empty-string/excluded-fields."
```

---

## Task 5: Constants `lib/admin/constants.ts`

**Files:**
- Create: `lib/admin/constants.ts`

- [ ] **Step 1: Crear el archivo**

```ts
export const ORGS_PAGE_SIZE = 50

export const TAX_CATEGORIES = [
  { value: "RESPONSABLE_INSCRIPTO", label: "Responsable Inscripto" },
  { value: "MONOTRIBUTO", label: "Monotributo" },
  { value: "EXENTO", label: "Exento" },
  { value: "CONSUMIDOR_FINAL", label: "Consumidor Final" },
  { value: "NO_RESPONSABLE", label: "No Responsable" },
] as const

export type TaxCategory = (typeof TAX_CATEGORIES)[number]["value"]

export const ORG_SUBSCRIPTION_STATUSES = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "SUSPENDED",
  "PENDING_PAYMENT",
] as const

export const ORG_PLANS = ["STARTER", "PROFESSIONAL", "ENTERPRISE"] as const

export type ProfileCompletionFilter = "empty" | "partial" | "complete"
```

- [ ] **Step 2: TypeCheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "lib/admin/constants" | head
```

Esperado: sin output.

- [ ] **Step 3: Commit**

```bash
git add lib/admin/constants.ts
git commit -m "feat(admin): add admin/constants.ts with PAGE_SIZE and enums"
```

---

## Task 6: Endpoint PATCH `/api/admin/orgs/[id]/profile` con TDD

**Files:**
- Create: `app/api/admin/orgs/[id]/profile/route.ts`
- Test:   `__tests__/api/admin/orgs/profile.test.ts`

- [ ] **Step 1: Escribir tests failing**

Crear `__tests__/api/admin/orgs/profile.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/admin/orgs/[id]/profile/route"

// Mocks — al estilo de los tests existentes en __tests__/api/
jest.mock("@/lib/auth")
jest.mock("@/lib/supabase/server")
jest.mock("@/lib/auth/platform")
jest.mock("@/lib/security/audit")

import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

const mockGetUser = getCurrentUser as jest.Mock
const mockServerClient = createServerClient as jest.Mock
const mockAdminClient = createAdminClient as jest.Mock
const mockIsPA = isPlatformAdmin as jest.Mock
const mockLog = logSecurityEvent as jest.Mock

function makeReq(body: any) {
  return new Request("http://test.local/api/admin/orgs/abc/profile", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const params = Promise.resolve({ id: "org-123" })

beforeEach(() => {
  jest.clearAllMocks()
  mockGetUser.mockResolvedValue({ user: { id: "user-1", auth_id: "auth-1" } })
  mockServerClient.mockResolvedValue({} as any)
  mockIsPA.mockResolvedValue(true)
  mockLog.mockResolvedValue(undefined)
})

describe("PATCH /api/admin/orgs/[id]/profile", () => {
  it("returns 403 when caller is not platform admin", async () => {
    mockIsPA.mockResolvedValue(false)
    const res = await PATCH(makeReq({ contact_name: "x" }), { params })
    expect(res.status).toBe(403)
  })

  it("returns 400 when CUIT is not 11 digits", async () => {
    const res = await PATCH(makeReq({ cuit: "1234" }), { params })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/CUIT/)
  })

  it("strips dashes from CUIT before saving", async () => {
    const updateMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const selectMock = jest.fn().mockReturnThis()
    const singleMock = jest.fn().mockResolvedValue({ data: { cuit: "30123456789" }, error: null })
    const maybeSingleMock = jest.fn().mockResolvedValue({ data: { cuit: null }, error: null })
    const fromMock = jest.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      update: updateMock,
    }))
    updateMock.mockImplementation(() => ({ eq: eqMock }))
    eqMock.mockImplementation(() => ({ select: selectMock }))
    selectMock.mockImplementation(() => ({ single: singleMock }))
    mockAdminClient.mockReturnValue({ from: fromMock })

    const res = await PATCH(makeReq({ cuit: "30-12345678-9" }), { params })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ cuit: "30123456789" }))
  })

  it("returns 400 for invalid tax_category", async () => {
    const res = await PATCH(makeReq({ tax_category: "FOO" }), { params })
    expect(res.status).toBe(400)
  })

  it("logs ORG_PROFILE_UPDATED_BY_ADMIN audit event on success", async () => {
    const fromMock = jest.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () =>
        Promise.resolve({ data: { contact_name: null }, error: null }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: () =>
        Promise.resolve({ data: { contact_name: "Maxi" }, error: null }) }) }) }),
    }))
    mockAdminClient.mockReturnValue({ from: fromMock })

    await PATCH(makeReq({ contact_name: "Maxi" }), { params })

    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "ORG_PROFILE_UPDATED_BY_ADMIN",
        target_org_id: "org-123",
        details: expect.objectContaining({
          changed_fields: ["contact_name"],
        }),
      }),
    )
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
npm run test -- __tests__/api/admin/orgs/profile.test.ts
```

Esperado: FAIL con "Cannot find module '@/app/api/admin/orgs/[id]/profile/route'".

- [ ] **Step 3: Implementar el endpoint**

Crear `app/api/admin/orgs/[id]/profile/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

const ALLOWED_FIELDS = [
  "contact_name",
  "contact_phone",
  "internal_notes",
  "address_street",
  "address_city",
  "address_province",
  "address_country",
  "address_postal_code",
  "tax_category",
  "cuit",
  "billing_email",
  "billing_name",
] as const

const VALID_TAX = new Set([
  "RESPONSABLE_INSCRIPTO",
  "MONOTRIBUTO",
  "EXENTO",
  "CONSUMIDOR_FINAL",
  "NO_RESPONSABLE",
])

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params

  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const patch: Record<string, string | null> = {}
  for (const key of ALLOWED_FIELDS) {
    if (!(key in body)) continue
    const v = body[key]
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({ error: `Invalid value for ${key}` }, { status: 400 })
    }
    patch[key] = v as string | null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  // Validaciones
  if (patch.cuit) {
    const stripped = patch.cuit.replace(/[-\s]/g, "")
    if (!/^\d{11}$/.test(stripped)) {
      return NextResponse.json({ error: "CUIT debe tener 11 dígitos" }, { status: 400 })
    }
    patch.cuit = stripped
  }

  if (patch.tax_category && !VALID_TAX.has(patch.tax_category)) {
    return NextResponse.json({ error: "tax_category inválida" }, { status: 400 })
  }

  if (patch.address_country) {
    const cc = patch.address_country.toUpperCase()
    if (!/^[A-Z]{2}$/.test(cc)) {
      return NextResponse.json(
        { error: "address_country debe ser ISO 2 letras" },
        { status: 400 },
      )
    }
    patch.address_country = cc
  }

  const admin = createAdminClient()

  // Snapshot before
  const { data: before } = await (admin.from("organizations") as any)
    .select(ALLOWED_FIELDS.join(","))
    .eq("id", orgId)
    .maybeSingle()

  if (!before) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  // Update
  const { data: updated, error } = await (admin.from("organizations") as any)
    .update(patch)
    .eq("id", orgId)
    .select("*")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit log (fire-and-forget OK, pero await para tests deterministas)
  const changed_fields = Object.keys(patch)
  const before_subset: Record<string, unknown> = {}
  const after_subset: Record<string, unknown> = {}
  for (const k of changed_fields) {
    before_subset[k] = (before as any)[k]
    after_subset[k] = (updated as any)[k]
  }

  await logSecurityEvent({
    eventType: "ORG_PROFILE_UPDATED_BY_ADMIN",
    severity: "INFO",
    actor_user_id: user.id,
    actor_auth_id: (user as any).auth_id,
    target_org_id: orgId,
    request_path: req.url,
    details: { changed_fields, before: before_subset, after: after_subset },
  })

  return NextResponse.json({ ok: true, profile: updated })
}
```

- [ ] **Step 4: Correr tests y verificar que pasan**

```bash
npm run test -- __tests__/api/admin/orgs/profile.test.ts
```

Esperado: 5 tests passing.

- [ ] **Step 5: TypeCheck completo**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "error TS" | head
```

Esperado: sin output (o solo errores pre-existentes en `lib/supabase/types.ts` que no introdujimos).

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/orgs/[id]/profile/route.ts __tests__/api/admin/orgs/profile.test.ts
git commit -m "feat(admin): PATCH /api/admin/orgs/[id]/profile

Endpoint para que platform admins editen el perfil de una org.
Valida CUIT (11 dígitos), tax_category enum, address_country ISO2.
Loguea ORG_PROFILE_UPDATED_BY_ADMIN con before/after de los campos
modificados. 5 tests cubriendo 403, 400 cuit/tax, strip de guiones,
y audit log."
```

---

## Task 7: `components/admin/profile-badge.tsx`

**Files:**
- Create: `components/admin/profile-badge.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
import { cn } from "@/lib/utils"
import {
  PROFILE_FIELD_COUNT,
  profileBadgeLevel,
} from "@/lib/admin/profile-completion"

type Props = {
  completion: number
  showCount?: boolean
  className?: string
}

const STYLES: Record<ReturnType<typeof profileBadgeLevel>, string> = {
  empty:    "bg-red-500/15 text-red-300 border-red-500/30",
  partial:  "bg-amber-500/15 text-amber-300 border-amber-500/30",
  complete: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
}

const ICONS: Record<ReturnType<typeof profileBadgeLevel>, string> = {
  empty:    "🔴",
  partial:  "🟡",
  complete: "🟢",
}

export function ProfileBadge({ completion, showCount = true, className }: Props) {
  const level = profileBadgeLevel(completion)
  return (
    <span
      title={`Perfil ${completion}/${PROFILE_FIELD_COUNT}`}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium",
        STYLES[level],
        className,
      )}
    >
      <span>{ICONS[level]}</span>
      {showCount && (
        <span>
          {completion}/{PROFILE_FIELD_COUNT}
        </span>
      )}
    </span>
  )
}
```

- [ ] **Step 2: TypeCheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "profile-badge" | head
```

Esperado: sin output.

- [ ] **Step 3: Commit**

```bash
git add components/admin/profile-badge.tsx
git commit -m "feat(admin): add ProfileBadge component (🟢/🟡/🔴 + X/9)"
```

---

## Task 8: `components/admin/org-profile-form.tsx` (client)

**Files:**
- Create: `components/admin/org-profile-form.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { TAX_CATEGORIES } from "@/lib/admin/constants"
import {
  computeProfileCompletion,
  PROFILE_FIELD_COUNT,
} from "@/lib/admin/profile-completion"
import { ProfileBadge } from "./profile-badge"

type ProfileFields = {
  contact_name: string | null
  contact_phone: string | null
  internal_notes: string | null
  address_street: string | null
  address_city: string | null
  address_province: string | null
  address_country: string | null
  address_postal_code: string | null
  tax_category: string | null
  cuit: string | null
  billing_email: string | null
  billing_name: string | null
}

type Props = {
  orgId: string
  initial: ProfileFields
  onCancel: () => void
  onSaved: () => void
}

export function OrgProfileForm({ orgId, initial, onCancel, onSaved }: Props) {
  const router = useRouter()
  const [values, setValues] = React.useState<ProfileFields>(initial)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const completion = computeProfileCompletion(values)

  function set<K extends keyof ProfileFields>(key: K, v: ProfileFields[K]) {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/profile`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      router.refresh()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Editando perfil</h3>
        <ProfileBadge completion={completion} />
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Razón social (billing_name)">
          <Input value={values.billing_name ?? ""} onChange={(e) => set("billing_name", e.target.value)} />
        </Field>
        <Field label="CUIT">
          <Input
            value={values.cuit ?? ""}
            onChange={(e) => set("cuit", e.target.value)}
            placeholder="30123456789"
          />
        </Field>
        <Field label="Condición fiscal">
          <Select
            value={values.tax_category ?? ""}
            onValueChange={(v) => set("tax_category", v || null)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {TAX_CATEGORIES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Email facturación">
          <Input
            type="email"
            value={values.billing_email ?? ""}
            onChange={(e) => set("billing_email", e.target.value)}
          />
        </Field>
        <Field label="Contacto (nombre)">
          <Input value={values.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} />
        </Field>
        <Field label="Contacto (teléfono / WhatsApp)">
          <Input
            value={values.contact_phone ?? ""}
            onChange={(e) => set("contact_phone", e.target.value)}
            placeholder="+54 9 ..."
          />
        </Field>
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase text-slate-400 mb-2">Dirección fiscal</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Calle y número">
            <Input value={values.address_street ?? ""} onChange={(e) => set("address_street", e.target.value)} />
          </Field>
          <Field label="Ciudad">
            <Input value={values.address_city ?? ""} onChange={(e) => set("address_city", e.target.value)} />
          </Field>
          <Field label="Provincia">
            <Input value={values.address_province ?? ""} onChange={(e) => set("address_province", e.target.value)} />
          </Field>
          <Field label="Código postal">
            <Input value={values.address_postal_code ?? ""} onChange={(e) => set("address_postal_code", e.target.value)} />
          </Field>
          <Field label="País (ISO2)">
            <Input
              value={values.address_country ?? "AR"}
              onChange={(e) => set("address_country", e.target.value.toUpperCase())}
              maxLength={2}
            />
          </Field>
        </div>
      </section>

      <section className="rounded border border-amber-500/30 bg-amber-500/5 p-4">
        <h4 className="text-xs font-semibold uppercase text-amber-300 mb-2">
          Notas internas · solo admin
        </h4>
        <Textarea
          value={values.internal_notes ?? ""}
          onChange={(e) => set("internal_notes", e.target.value)}
          rows={4}
          placeholder="Cualquier nota relevante para el equipo platform..."
        />
      </section>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando..." : "Guardar"}
        </Button>
      </div>

      <div className="text-xs text-slate-500">
        Completitud actual: {completion}/{PROFILE_FIELD_COUNT}
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-400">{label}</Label>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Verificar imports shadcn**

```bash
ls components/ui/textarea.tsx components/ui/label.tsx components/ui/select.tsx 2>&1
```

Si alguno falta:

```bash
npx shadcn@latest add textarea label select
```

- [ ] **Step 3: TypeCheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "org-profile-form" | head
```

Esperado: sin output.

- [ ] **Step 4: Commit**

```bash
git add components/admin/org-profile-form.tsx
# Si shadcn agregó componentes nuevos, sumarlos:
git add components/ui/textarea.tsx components/ui/label.tsx components/ui/select.tsx 2>/dev/null || true
git commit -m "feat(admin): OrgProfileForm — client form para editar perfil de org

12 campos editables (3 billing existentes + 9 nuevos + internal_notes).
Live profile completion badge mientras se tipea. PATCH a
/api/admin/orgs/[id]/profile. Sección amarilla diferenciada para
internal_notes (admin-only)."
```

---

## Task 9: `components/admin/org-profile-card.tsx` (server)

**Files:**
- Create: `components/admin/org-profile-card.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TAX_CATEGORIES } from "@/lib/admin/constants"
import {
  computeProfileCompletion,
  PROFILE_FIELD_COUNT,
} from "@/lib/admin/profile-completion"
import { ProfileBadge } from "./profile-badge"
import { OrgProfileForm } from "./org-profile-form"

type ProfileFields = {
  contact_name: string | null
  contact_phone: string | null
  internal_notes: string | null
  address_street: string | null
  address_city: string | null
  address_province: string | null
  address_country: string | null
  address_postal_code: string | null
  tax_category: string | null
  cuit: string | null
  billing_email: string | null
  billing_name: string | null
}

type Props = {
  orgId: string
  profile: ProfileFields
}

export function OrgProfileCard({ orgId, profile }: Props) {
  const [editing, setEditing] = React.useState(false)
  const completion = computeProfileCompletion(profile)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">Perfil de la agencia</CardTitle>
        <div className="flex items-center gap-3">
          <ProfileBadge completion={completion} />
          {!editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <OrgProfileForm
            orgId={orgId}
            initial={profile}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <ReadView profile={profile} completion={completion} />
        )}
      </CardContent>
    </Card>
  )
}

function ReadView({
  profile,
  completion,
}: {
  profile: ProfileFields
  completion: number
}) {
  const taxLabel =
    TAX_CATEGORIES.find((t) => t.value === profile.tax_category)?.label ?? null

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
        <Row label="Razón social" value={profile.billing_name} />
        <Row label="CUIT" value={profile.cuit} />
        <Row label="Condición fiscal" value={taxLabel} />
        <Row label="Email facturación" value={profile.billing_email} />
        <Row label="Contacto" value={joinContact(profile.contact_name, profile.contact_phone)} />
        <Row
          label="Dirección"
          value={joinAddress(profile)}
          colSpan={2}
        />
      </section>

      <section className="rounded border border-amber-500/30 bg-amber-500/5 p-4">
        <h4 className="text-xs font-semibold uppercase text-amber-300 mb-2">
          Notas internas · solo admin
        </h4>
        <p className="text-sm text-slate-300 whitespace-pre-wrap">
          {profile.internal_notes ?? <span className="text-slate-500">Sin notas</span>}
        </p>
      </section>

      <div className="text-xs text-slate-500">
        Completitud: {completion}/{PROFILE_FIELD_COUNT} (
        {profile.internal_notes ? "con notas internas" : "sin notas internas"})
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  colSpan,
}: {
  label: string
  value: string | null
  colSpan?: 2
}) {
  return (
    <div className={colSpan === 2 ? "md:col-span-2" : undefined}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm text-slate-200">
        {value ?? <span className="text-slate-500">—</span>}
      </div>
    </div>
  )
}

function joinContact(name: string | null, phone: string | null) {
  if (!name && !phone) return null
  return [name, phone].filter(Boolean).join(" · ")
}

function joinAddress(p: ProfileFields) {
  const parts = [
    p.address_street,
    p.address_city,
    p.address_province,
    p.address_country,
    p.address_postal_code,
  ].filter(Boolean)
  return parts.length ? parts.join(", ") : null
}
```

- [ ] **Step 2: Verificar import de Card**

```bash
ls components/ui/card.tsx 2>&1
```

Esperado: existe (es un shadcn standard).

- [ ] **Step 3: TypeCheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "org-profile-card" | head
```

Esperado: sin output.

- [ ] **Step 4: Commit**

```bash
git add components/admin/org-profile-card.tsx
git commit -m "feat(admin): OrgProfileCard — read/edit toggle del perfil

Card con vista read-only por default + botón Editar que swappea por
OrgProfileForm. Sección amarilla para internal_notes diferenciada
visualmente. router.refresh() después de guardar."
```

---

## Task 10: Insertar `<OrgProfileCard>` en `/admin/orgs/[id]/page.tsx`

**Files:**
- Modify: `app/admin/orgs/[id]/page.tsx`

- [ ] **Step 1: Leer el archivo actual**

```bash
wc -l app/admin/orgs/[id]/page.tsx
```

Inspeccionar dónde renderiza tenant-metrics y custom-plan para insertar el card en el medio.

- [ ] **Step 2: Agregar import + render**

Editar `app/admin/orgs/[id]/page.tsx`:

1. Sumar import:
```tsx
import { OrgProfileCard } from "@/components/admin/org-profile-card"
```

2. Asegurarse que la query de la org incluya las columnas del perfil. La query existente probablemente sea `select("*")`. Si es así, ya las incluye gracias a la mig 163. Verificar:

```bash
grep -A 5 "from(\"organizations\")" app/admin/orgs/\[id\]/page.tsx
```

3. Insertar `<OrgProfileCard>` en el JSX, **arriba del custom plan** (ver el grid existente). Algo como:

```tsx
<OrgProfileCard
  orgId={org.id}
  profile={{
    contact_name: org.contact_name,
    contact_phone: org.contact_phone,
    internal_notes: org.internal_notes,
    address_street: org.address_street,
    address_city: org.address_city,
    address_province: org.address_province,
    address_country: org.address_country,
    address_postal_code: org.address_postal_code,
    tax_category: org.tax_category,
    cuit: org.cuit,
    billing_email: org.billing_email,
    billing_name: org.billing_name,
  }}
/>
```

- [ ] **Step 3: Verificar TypeCheck + Lint**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "admin/orgs/\[id\]" | head
npm run lint 2>&1 | grep -i error | head
```

Esperado: sin output.

- [ ] **Step 4: Smoke manual local**

(Opcional si tenés `DISABLE_AUTH=true` en dev) — `npm run dev`, abrir `localhost:3044/admin/orgs/<id>`, ver que la card aparece arriba del custom plan, ver el badge.

- [ ] **Step 5: Commit**

```bash
git add app/admin/orgs/\[id\]/page.tsx
git commit -m "feat(admin): wire OrgProfileCard into /admin/orgs/[id]

Inserta el card de perfil arriba del custom plan, así el primer dato
que ve el admin al entrar a una org es: ¿quién es esta agencia?"
```

---

## Task 11: `components/admin/orgs-pagination.tsx`

**Files:**
- Create: `components/admin/orgs-pagination.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
import Link from "next/link"
import { cn } from "@/lib/utils"

type Props = {
  page: number
  totalPages: number
  buildHref: (page: number) => string
}

export function OrgsPagination({ page, totalPages, buildHref }: Props) {
  if (totalPages <= 1) return null

  const pages = pageRange(page, totalPages)

  return (
    <nav className="flex items-center justify-center gap-1 py-4">
      <PageLink href={buildHref(Math.max(1, page - 1))} disabled={page <= 1} label="◀" />
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-2 text-slate-500">
            …
          </span>
        ) : (
          <PageLink
            key={p}
            href={buildHref(p)}
            label={String(p)}
            active={p === page}
          />
        ),
      )}
      <PageLink
        href={buildHref(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        label="▶"
      />
    </nav>
  )
}

function PageLink({
  href,
  label,
  active,
  disabled,
}: {
  href: string
  label: string
  active?: boolean
  disabled?: boolean
}) {
  const className = cn(
    "inline-flex h-8 min-w-8 items-center justify-center rounded border px-2 text-sm",
    active
      ? "border-blue-500/40 bg-blue-500/15 text-blue-200"
      : "border-slate-700 text-slate-300 hover:bg-slate-800",
    disabled && "pointer-events-none opacity-40",
  )
  if (disabled) return <span className={className}>{label}</span>
  return (
    <Link href={href} className={className} aria-current={active ? "page" : undefined}>
      {label}
    </Link>
  )
}

function pageRange(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | "…")[] = []
  out.push(1)
  if (current > 3) out.push("…")
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) out.push(p)
  if (current < total - 2) out.push("…")
  out.push(total)
  return out
}
```

- [ ] **Step 2: TypeCheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "orgs-pagination" | head
```

- [ ] **Step 3: Commit**

```bash
git add components/admin/orgs-pagination.tsx
git commit -m "feat(admin): OrgsPagination component (link-based, server-friendly)"
```

---

## Task 12: `components/admin/orgs-search-bar.tsx`

**Files:**
- Create: `components/admin/orgs-search-bar.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function OrgsSearchBar() {
  const router = useRouter()
  const search = useSearchParams()
  const initial = search?.get("q") ?? ""
  const [value, setValue] = React.useState(initial)

  // Debounce 300ms — al cambiar el input, esperamos antes de empujar a la URL.
  React.useEffect(() => {
    if (value === initial) return
    const t = setTimeout(() => {
      const params = new URLSearchParams(search?.toString() ?? "")
      if (value.trim()) {
        params.set("q", value.trim())
      } else {
        params.delete("q")
      }
      params.delete("page")
      router.push(`/admin/orgs?${params.toString()}`)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function clear() {
    setValue("")
    const params = new URLSearchParams(search?.toString() ?? "")
    params.delete("q")
    params.delete("page")
    router.push(`/admin/orgs?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Buscar por nombre, slug, CUIT, email, ID..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="max-w-md"
      />
      {value && (
        <Button variant="ghost" size="sm" onClick={clear}>
          Limpiar
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeCheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "orgs-search-bar" | head
```

- [ ] **Step 3: Commit**

```bash
git add components/admin/orgs-search-bar.tsx
git commit -m "feat(admin): OrgsSearchBar (debounce 300ms, mutates URL ?q=)"
```

---

## Task 13: `components/admin/orgs-filters.tsx`

**Files:**
- Create: `components/admin/orgs-filters.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  ORG_PLANS,
  ORG_SUBSCRIPTION_STATUSES,
} from "@/lib/admin/constants"

export function OrgsFilters() {
  const router = useRouter()
  const search = useSearchParams()

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(search?.toString() ?? "")
    if (value && value !== "ALL") {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete("page")
    router.push(`/admin/orgs?${params.toString()}`)
  }

  function toggleParam(key: string, checked: boolean) {
    const params = new URLSearchParams(search?.toString() ?? "")
    if (checked) {
      params.set(key, "true")
    } else {
      params.delete(key)
    }
    params.delete("page")
    router.push(`/admin/orgs?${params.toString()}`)
  }

  const status = search?.get("status") ?? "ALL"
  const plan = search?.get("plan") ?? "ALL"
  const completion = search?.get("completion") ?? "ALL"
  const hasCustomPlan = search?.get("has_custom_plan") === "true"
  const hasPreapproval = search?.get("has_preapproval") === "true"

  return (
    <div className="flex flex-wrap items-center gap-4">
      <FilterSelect
        label="Status"
        value={status}
        options={[
          { value: "ALL", label: "Todos" },
          ...ORG_SUBSCRIPTION_STATUSES.map((s) => ({ value: s, label: s })),
        ]}
        onChange={(v) => setParam("status", v)}
      />
      <FilterSelect
        label="Plan"
        value={plan}
        options={[
          { value: "ALL", label: "Todos" },
          ...ORG_PLANS.map((p) => ({ value: p, label: p })),
          { value: "CUSTOM", label: "CUSTOM (custom_plan_id IS NOT NULL)" },
        ]}
        onChange={(v) => setParam("plan", v)}
      />
      <FilterSelect
        label="Perfil"
        value={completion}
        options={[
          { value: "ALL", label: "Todos" },
          { value: "empty", label: "Vacío" },
          { value: "partial", label: "Parcial" },
          { value: "complete", label: "Completo" },
        ]}
        onChange={(v) => setParam("completion", v)}
      />

      <div className="flex items-center gap-4 ml-2">
        <CheckRow
          id="has_custom_plan"
          label="Con custom plan"
          checked={hasCustomPlan}
          onChange={(c) => toggleParam("has_custom_plan", c)}
        />
        <CheckRow
          id="has_preapproval"
          label="Con MP preapproval"
          checked={hasPreapproval}
          onChange={(c) => toggleParam("has_preapproval", c)}
        />
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-slate-400">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function CheckRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (c: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(Boolean(c))} />
      <Label htmlFor={id} className="text-xs text-slate-300 cursor-pointer">
        {label}
      </Label>
    </div>
  )
}
```

- [ ] **Step 2: Verificar shadcn imports**

```bash
ls components/ui/checkbox.tsx 2>&1 || npx shadcn@latest add checkbox
```

- [ ] **Step 3: TypeCheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "orgs-filters" | head
```

- [ ] **Step 4: Commit**

```bash
git add components/admin/orgs-filters.tsx
git add components/ui/checkbox.tsx 2>/dev/null || true
git commit -m "feat(admin): OrgsFilters (status, plan, completion, has_*)"
```

---

## Task 14: `components/admin/orgs-table.tsx`

**Files:**
- Create: `components/admin/orgs-table.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
import Link from "next/link"
import { cn } from "@/lib/utils"
import { ProfileBadge } from "./profile-badge"

type OrgRow = {
  id: string
  name: string
  slug: string
  subscription_status: string
  plan: string
  custom_plan_id: string | null
  contact_name: string | null
  contact_phone: string | null
  created_at: string
  profile_completion: number
}

type Props = {
  orgs: OrgRow[]
  sort: string
  dir: "asc" | "desc"
  buildSortHref: (col: string) => string
}

const STATUS_COLOR: Record<string, string> = {
  TRIAL:   "bg-blue-500/15 text-blue-300",
  ACTIVE:  "bg-emerald-500/15 text-emerald-300",
  PAST_DUE: "bg-amber-500/15 text-amber-300",
  PENDING_PAYMENT: "bg-amber-500/15 text-amber-300",
  CANCELLED: "bg-slate-500/15 text-slate-300",
  SUSPENDED: "bg-red-500/15 text-red-300",
}

export function OrgsTable({ orgs, sort, dir, buildSortHref }: Props) {
  if (orgs.length === 0) {
    return (
      <div className="rounded border border-slate-800 p-8 text-center text-sm text-slate-400">
        Sin resultados.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-800">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <Th>Perfil</Th>
            <Th sortable href={buildSortHref("name")} active={sort === "name"} dir={dir}>
              Org
            </Th>
            <Th>Status</Th>
            <Th sortable href={buildSortHref("plan")} active={sort === "plan"} dir={dir}>
              Plan
            </Th>
            <Th>Contacto</Th>
            <Th
              sortable
              href={buildSortHref("created_at")}
              active={sort === "created_at"}
              dir={dir}
            >
              Creada
            </Th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => (
            <tr
              key={o.id}
              className="border-t border-slate-800 hover:bg-slate-900/40"
            >
              <Td>
                <ProfileBadge completion={o.profile_completion} showCount />
              </Td>
              <Td>
                <Link
                  href={`/admin/orgs/${o.id}`}
                  className="font-medium text-slate-100 hover:text-blue-300"
                >
                  {o.name}
                </Link>
                <div className="text-xs text-slate-500">{o.slug}</div>
              </Td>
              <Td>
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-xs",
                    STATUS_COLOR[o.subscription_status] ?? "bg-slate-700 text-slate-300",
                  )}
                >
                  {o.subscription_status}
                </span>
              </Td>
              <Td>
                {o.plan}
                {o.custom_plan_id && <span className="ml-1 text-amber-300" title="Custom plan">✦</span>}
              </Td>
              <Td>
                {o.contact_name || o.contact_phone ? (
                  <>
                    <div className="text-slate-200">{o.contact_name ?? "—"}</div>
                    <div className="text-xs text-slate-500">{o.contact_phone ?? ""}</div>
                  </>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </Td>
              <Td className="text-slate-400">{relativeTime(o.created_at)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({
  children,
  sortable,
  href,
  active,
  dir,
}: {
  children: React.ReactNode
  sortable?: boolean
  href?: string
  active?: boolean
  dir?: "asc" | "desc"
}) {
  if (!sortable) return <th className="px-3 py-2 text-left">{children}</th>
  return (
    <th className="px-3 py-2 text-left">
      <Link
        href={href!}
        className={cn(
          "inline-flex items-center gap-1 hover:text-slate-200",
          active && "text-blue-300",
        )}
      >
        {children}
        {active && <span>{dir === "asc" ? "▲" : "▼"}</span>}
      </Link>
    </th>
  )
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <td className={cn("px-3 py-2 align-top", className)}>{children}</td>
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days < 1) return "hoy"
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}m`
  return `${Math.floor(months / 12)}a`
}
```

- [ ] **Step 2: TypeCheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "orgs-table" | head
```

- [ ] **Step 3: Commit**

```bash
git add components/admin/orgs-table.tsx
git commit -m "feat(admin): OrgsTable — sortable columns + profile badge + status pill"
```

---

## Task 15: Refactor `app/admin/orgs/page.tsx`

**Files:**
- Modify: `app/admin/orgs/page.tsx`

- [ ] **Step 1: Reescribir el page server component**

Reemplazar el contenido completo de `app/admin/orgs/page.tsx` por:

```tsx
import { createAdminClient } from "@/lib/supabase/server"
import { OrgsSearchBar } from "@/components/admin/orgs-search-bar"
import { OrgsFilters } from "@/components/admin/orgs-filters"
import { OrgsTable } from "@/components/admin/orgs-table"
import { OrgsPagination } from "@/components/admin/orgs-pagination"
import { ORGS_PAGE_SIZE } from "@/lib/admin/constants"

export const dynamic = "force-dynamic"

type Search = {
  q?: string
  status?: string
  plan?: string
  completion?: string
  has_custom_plan?: string
  has_preapproval?: string
  sort?: string
  dir?: string
  page?: string
}

export default async function AdminOrgsPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const sp = await searchParams
  const q = sp.q?.trim() ?? ""
  const status = sp.status ?? null
  const plan = sp.plan ?? null
  const completion = sp.completion ?? null
  const hasCustomPlan = sp.has_custom_plan === "true"
  const hasPreapproval = sp.has_preapproval === "true"
  const sort = sp.sort ?? "created_at"
  const dir = sp.dir === "asc" ? "asc" : "desc"
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1)

  const admin = createAdminClient()

  // Base query desde la VIEW (incluye profile_completion)
  let query: any = admin
    .from("organizations_with_profile_completion")
    .select(
      `id, name, slug, subscription_status, plan, custom_plan_id,
       contact_name, contact_phone, created_at, profile_completion,
       mp_preapproval_id`,
      { count: "exact" },
    )

  // Search
  if (q) {
    if (/^[0-9a-f-]{36}$/i.test(q)) {
      query = query.eq("id", q)
    } else {
      const ilike = `%${q}%`
      query = query.or(
        [
          `name.ilike.${ilike}`,
          `slug.ilike.${ilike}`,
          `cuit.ilike.${ilike}`,
          `billing_email.ilike.${ilike}`,
          `contact_name.ilike.${ilike}`,
          `contact_phone.ilike.${ilike}`,
        ].join(","),
      )
    }
  }

  // Filters
  if (status) query = query.eq("subscription_status", status)
  if (plan === "CUSTOM") {
    query = query.not("custom_plan_id", "is", null)
  } else if (plan) {
    query = query.eq("plan", plan)
  }
  if (completion === "empty") query = query.eq("profile_completion", 0)
  if (completion === "complete") query = query.eq("profile_completion", 9)
  if (completion === "partial") {
    query = query.gt("profile_completion", 0).lt("profile_completion", 9)
  }
  if (hasCustomPlan) query = query.not("custom_plan_id", "is", null)
  if (hasPreapproval) query = query.not("mp_preapproval_id", "is", null)

  // Sort (whitelist)
  const SORTABLE = new Set(["name", "plan", "created_at", "profile_completion"])
  const sortCol = SORTABLE.has(sort) ? sort : "created_at"
  query = query.order(sortCol, { ascending: dir === "asc" })

  // Pagination
  const from = (page - 1) * ORGS_PAGE_SIZE
  const to = from + ORGS_PAGE_SIZE - 1
  query = query.range(from, to)

  const { data: orgs, count, error } = await query

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / ORGS_PAGE_SIZE))

  // Helper para construir hrefs preservando params actuales
  function buildHref(overrides: Record<string, string | null>) {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (status) params.set("status", status)
    if (plan) params.set("plan", plan)
    if (completion) params.set("completion", completion)
    if (hasCustomPlan) params.set("has_custom_plan", "true")
    if (hasPreapproval) params.set("has_preapproval", "true")
    params.set("sort", sortCol)
    params.set("dir", dir)
    params.set("page", String(page))
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) params.delete(k)
      else params.set(k, v)
    }
    return `/admin/orgs?${params.toString()}`
  }

  function buildSortHref(col: string) {
    const newDir = sortCol === col && dir === "desc" ? "asc" : "desc"
    return buildHref({ sort: col, dir: newDir, page: "1" })
  }

  function buildPageHref(p: number) {
    return buildHref({ page: String(p) })
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Organizaciones</h1>
          <p className="text-sm text-slate-400">
            {count ?? 0} {count === 1 ? "org" : "orgs"} · {ORGS_PAGE_SIZE}/pág
          </p>
        </div>
      </header>

      <div className="space-y-3">
        <OrgsSearchBar />
        <OrgsFilters />
      </div>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          Error: {error.message}
        </div>
      )}

      <OrgsTable
        orgs={(orgs ?? []) as any}
        sort={sortCol}
        dir={dir}
        buildSortHref={buildSortHref}
      />

      <OrgsPagination page={page} totalPages={totalPages} buildHref={buildPageHref} />
    </div>
  )
}
```

- [ ] **Step 2: TypeCheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "admin/orgs/page" | head
```

Esperado: sin output.

- [ ] **Step 3: Lint**

```bash
npm run lint 2>&1 | grep -E "error|warn" | head
```

- [ ] **Step 4: Commit**

```bash
git add app/admin/orgs/page.tsx
git commit -m "feat(admin): refactor /admin/orgs with search, filters, sort, pagination

Lee de la view organizations_with_profile_completion (mig 164).
Search por name/slug/cuit/email/contacto + UUID exact match.
Filtros: status / plan (incluye CUSTOM) / completion / has_custom_plan
/ has_preapproval. Sort por columnas clickeables. Paginación 50/pág
con count exacto. URL es source of truth (compartible/bookmarkeable)."
```

---

## Task 16: Smoke E2E + push final

- [ ] **Step 1: Verificar todos los tests pasan**

```bash
npm run test 2>&1 | tail -20
```

Esperado: all suites passing (incluye los nuevos `profile-completion` y `profile`).

- [ ] **Step 2: TypeCheck final**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "error TS" | grep -v "lib/supabase/types.ts" | head
```

Esperado: sin output (errores en types.ts, si hay, son contaminación pre-existente).

- [ ] **Step 3: Smoke checklist manual (después del push)**

Una vez deployado a Railway, en `admin.vibook.ai`:

- [ ] Login como `admin@vibook.ai` → cae en `/admin/orgs`.
- [ ] La lista muestra Lozada y otras orgs con badge de perfil (probablemente 🔴 0/9 o 🟡 parcial).
- [ ] Buscar "Lozada" en el search → filtra a 1 row.
- [ ] Buscar el UUID de Lozada → filtra a 1 row.
- [ ] Click en columna "Org" → ordena alfabético, flecha aparece.
- [ ] Click en filtro Status = TRIAL → solo orgs en trial.
- [ ] Click en filtro Plan = CUSTOM → solo orgs con custom plan.
- [ ] Click en checkbox "Con MP preapproval" → solo orgs con mp_preapproval_id.
- [ ] Si hay >50 orgs, paginación funciona (botones prev/next + números).
- [ ] Click en una org → entra a `/admin/orgs/[id]`.
- [ ] Card "Perfil de la agencia" aparece arriba del custom plan, con badge.
- [ ] Click "Editar" → form aparece con los campos llenos (si hay) o vacíos.
- [ ] Editar `contact_phone` y `tax_category`, guardar → vuelve a read view.
- [ ] Recargar la página → los valores persisten.
- [ ] El badge de la lista (`/admin/orgs`) ahora muestra el nuevo conteo.
- [ ] Verificar audit log: `SELECT * FROM security_audit_log WHERE event_type = 'ORG_PROFILE_UPDATED_BY_ADMIN' ORDER BY created_at DESC LIMIT 5;` — el evento debe estar.

- [ ] **Step 4: Push (con OK explícito de Tomi)**

```bash
git log origin/main..HEAD --oneline
git push origin main
```

Esperado: ~14-16 commits empujados a `main`. Railway redeploya en 1-2 min.

---

## Self-Review Checklist (autor)

- ✅ **Spec coverage**: cada feature del spec tiene una task. Migration 163 (Task 1), Migration 164 VIEW (Task 2), regen types (Task 3), helper completitud (Task 4), constants (Task 5), endpoint PATCH (Task 6), 6 componentes nuevos (Tasks 7-9, 11-14), refactor de page (Task 15), smoke (Task 16). Endpoint test cubre 403, validaciones CUIT/tax, audit log.
- ✅ **Sin placeholders**: todo tiene código completo y comandos ejecutables.
- ✅ **Type consistency**: `ProfileFields` shape igual entre form, card y endpoint. `profileBadgeLevel` enum consistente. `ORGS_PAGE_SIZE` constante única.
- ✅ **Decisiones explícitas**: sort por MRR/last_activity diferido a Phase B/C (mencionado).

## Out of Scope (recordatorio)

- Form del tenant en `/settings` para llenar el perfil (otra sesión).
- Banner nudge para tenants sin perfil (otra sesión).
- Validación required-vs-optional desde el lado tenant (otra sesión).
- Sort por MRR (Phase B).
- Sort por last_activity (Phase C).
- Audit visual "última edición tenant vs admin" (post-launch nice-to-have).
- Bulk actions, export CSV, saved filters (no urge).
