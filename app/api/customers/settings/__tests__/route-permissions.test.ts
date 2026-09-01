// app/api/customers/settings/__tests__/route-permissions.test.ts
/**
 * @jest-environment node
 *
 * VIB-154 / VIB-158 — configuración de clientes editable desde la app.
 *
 * La pantalla `/customers/settings` se borró el 19/01/2026 (commit 0ed311d6)
 * con la nota "sistema usa valores predeterminados (no configurables)", pero la
 * tabla, esta API y el enforcement quedaron vivos. Al devolver la pantalla, el
 * gate del PUT quedó expuesto: comparaba los strings literales "ADMIN" y
 * "SUPER_ADMIN", así que dejaba afuera a ORG_OWNER —el dueño del tenant, que sí
 * puede entrar a Configuración— e ignoraba `additional_roles`. Resultado: veía
 * el tab y comía un 403 al guardar.
 *
 * Es la misma familia que el barrido de gates literales de VIB-127.
 *
 * El último test es de la clase VIB-150: manda todos los campos del schema de
 * Zod y valida las columnas como lo haría PostgREST, para que un campo nuevo
 * sin su columna rompa acá y no en producción.
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => {
      const body = JSON.stringify(data)
      return {
        status: init?.status ?? 200,
        json: async () => JSON.parse(body),
      }
    },
  },
}))

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))
jest.mock("@/lib/permissions-api", () => ({ getUserAgencyIds: jest.fn() }))

import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { PUT } from "../route"

const AGENCY_ID = "agency-1"
const ORG_ID = "org-1"
const SETTINGS_ID = "settings-1"

/** Columnas reales de `customer_settings`, tomadas de information_schema. */
const CUSTOMER_SETTINGS_COLUMNS = new Set([
  "id",
  "agency_id",
  "org_id",
  "custom_fields",
  "validations",
  "notifications",
  "integrations",
  "auto_assign_lead",
  "require_document",
  "duplicate_check_enabled",
  "duplicate_check_fields",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
])

let lastWrite: Record<string, any> | null = null

function validateColumns(payload: Record<string, any>) {
  const unknown = Object.keys(payload).filter((k) => !CUSTOMER_SETTINGS_COLUMNS.has(k))
  if (unknown.length > 0) {
    return {
      message: `Could not find the '${unknown[0]}' column of 'customer_settings' in the schema cache`,
      code: "PGRST204",
    }
  }
  return null
}

function buildSupabaseMock() {
  return {
    from() {
      const builder: any = {
        _write: null as Record<string, any> | null,
        select: () => builder,
        eq: () => builder,
        update(payload: Record<string, any>) {
          builder._write = payload
          lastWrite = payload
          return builder
        },
        insert(payload: Record<string, any>) {
          builder._write = payload
          lastWrite = payload
          return builder
        },
        single: async () => {
          // Lectura previa: ¿existe la configuración?
          if (!builder._write) return { data: { id: SETTINGS_ID }, error: null }

          const error = validateColumns(builder._write)
          if (error) return { data: null, error }

          return { data: { id: SETTINGS_ID, ...builder._write }, error: null }
        },
      }
      return builder
    },
  }
}

function mockUser(role: string, additionalRoles: string[] = []) {
  ;(getCurrentUser as jest.Mock).mockResolvedValue({
    user: {
      id: "user-1",
      role,
      roles: [role, ...additionalRoles],
      org_id: ORG_ID,
    },
  })
}

function request(body: Record<string, any>) {
  return { json: async () => body } as unknown as Request
}

/** Payload con TODOS los campos que acepta el schema de la ruta. */
function fullPayload() {
  return {
    custom_fields: [
      { name: "dni_vencimiento", type: "date", label: "Vencimiento DNI", required: false },
    ],
    validations: {
      email: { required: false, format: "email" },
      phone: { required: false, format: "phone" },
    },
    notifications: [{ event: "new_customer", enabled: true, channels: ["email"] }],
    integrations: {
      operations: { auto_link: true },
      leads: { auto_convert: false },
    },
    auto_assign_lead: false,
    require_document: false,
    duplicate_check_enabled: false,
    duplicate_check_fields: ["email"],
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  lastWrite = null
  ;(createServerClient as jest.Mock).mockResolvedValue(buildSupabaseMock())
  ;(getUserAgencyIds as jest.Mock).mockResolvedValue([AGENCY_ID])
})

describe("PUT /api/customers/settings — quién puede guardar", () => {
  it("ORG_OWNER puede guardar (antes comía 403 con el tab a la vista)", async () => {
    mockUser("ORG_OWNER")

    const res = await PUT(request({ duplicate_check_enabled: false }))

    expect(res.status).toBe(200)
    expect(lastWrite).toMatchObject({ duplicate_check_enabled: false })
  })

  it.each(["ADMIN", "SUPER_ADMIN"])("%s sigue pudiendo guardar", async (role) => {
    mockUser(role)

    const res = await PUT(request({ duplicate_check_enabled: false }))

    expect(res.status).toBe(200)
  })

  it("un SELLER con ADMIN en additional_roles puede guardar", async () => {
    mockUser("SELLER", ["ADMIN"])

    const res = await PUT(request({ duplicate_check_enabled: false }))

    expect(res.status).toBe(200)
  })

  it.each(["SELLER", "VIEWER", "CONTABLE", "POST_VENTA"])(
    "%s no puede guardar",
    async (role) => {
      mockUser(role)

      const res = await PUT(request({ duplicate_check_enabled: false }))

      expect(res.status).toBe(403)
      expect(lastWrite).toBeNull()
    }
  )

  it("un usuario sin organización no puede guardar", async () => {
    ;(getCurrentUser as jest.Mock).mockResolvedValue({
      user: { id: "user-1", role: "ADMIN", roles: ["ADMIN"], org_id: null },
    })

    const res = await PUT(request({ duplicate_check_enabled: false }))

    expect(res.status).toBe(400)
    expect(lastWrite).toBeNull()
  })
})

describe("PUT /api/customers/settings — payload", () => {
  it("guarda todos los campos del schema sin inventar columnas", async () => {
    mockUser("ADMIN")

    const res = await PUT(request(fullPayload()))

    expect(res.status).toBe(200)
    expect(validateColumns(lastWrite!)).toBeNull()
  })

  it("apagar el email obligatorio se persiste", async () => {
    mockUser("ADMIN")

    const res = await PUT(
      request({ validations: { email: { required: false, format: "email" } } })
    )

    expect(res.status).toBe(200)
    expect(lastWrite?.validations.email.required).toBe(false)
  })

  it("apagar la detección de duplicados se persiste", async () => {
    mockUser("ADMIN")

    const res = await PUT(
      request({ duplicate_check_enabled: false, duplicate_check_fields: [] })
    )

    expect(res.status).toBe(200)
    expect(lastWrite?.duplicate_check_enabled).toBe(false)
    expect(lastWrite?.duplicate_check_fields).toEqual([])
  })
})
