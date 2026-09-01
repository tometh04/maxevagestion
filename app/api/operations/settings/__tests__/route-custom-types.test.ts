// app/api/operations/settings/__tests__/route-custom-types.test.ts
/**
 * @jest-environment node
 *
 * VIB-150 — "Error al actualizar configuración" al crear un tipo de operación.
 *
 * El commit f4040bb2 (2026-06-11) agregó `custom_operation_types` al schema de
 * Zod de esta ruta y a la pantalla, pero nunca creó la columna. El campo
 * validado se spreadea a `updateData`, PostgREST rechaza el UPDATE entero con
 * "Could not find the 'custom_operation_types' column" y la ruta devuelve un
 * 500 con un mensaje genérico.
 *
 * Es la misma clase de bug que `legs_replace` en
 * `app/api/operations/[id]/__tests__/route-legs.test.ts`: una clave que no es
 * columna no rompe solo su campo, rompe la escritura completa. Por eso el mock
 * de abajo valida las columnas como lo haría PostgREST.
 *
 * No exploto antes porque `loadSettings` reemplaza el estado con lo que
 * devuelve la API, que no traía la clave. Recién al tocar la pestaña "Tipos de
 * Operación" la clave se reintroduce y a partir de ahí falla el guardado de
 * TODA la pantalla.
 *
 * El test que importa es `guarda todos los campos del schema`: manda un payload
 * con cada campo que la ruta acepta, así cualquier campo nuevo que se agregue
 * sin su columna hace fallar la suite en vez de llegar al cliente.
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
const SETTINGS_ID = "settings-1"

/**
 * Columnas reales de `operation_settings`, tomadas de information_schema en
 * producción DESPUÉS de la migración 20260824000001. `custom_operation_types`
 * está en la lista justamente porque este test cubre que ahora existe.
 */
const OPERATION_SETTINGS_COLUMNS = new Set([
  "id",
  "agency_id",
  "org_id",
  "custom_statuses",
  "workflows",
  "auto_alerts",
  "document_templates",
  "custom_product_types",
  "custom_operation_types",
  "default_status",
  "require_destination",
  "require_departure_date",
  "require_operator",
  "require_customer",
  "alert_payment_due_days",
  "alert_operator_payment_days",
  "alert_upcoming_trip_days",
  "checkin_enabled",
  "checkin_default_hours",
  "checkin_airline_lead_times",
  "auto_generate_quotation",
  "auto_generate_invoice",
  "require_documents_before_confirmation",
  "auto_create_ledger_entry",
  "auto_create_iva_entry",
  "auto_create_operator_payment",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
])

/** Lo último que se intentó escribir, para poder afirmar sobre el payload. */
let lastWrite: Record<string, any> | null = null

/**
 * Rechaza claves que no son columnas, igual que PostgREST. Es el corazón del
 * test: sin esto, el bug pasa desapercibido porque el mock aceptaría cualquier
 * objeto.
 */
function validateColumns(payload: Record<string, any>) {
  const unknown = Object.keys(payload).filter((k) => !OPERATION_SETTINGS_COLUMNS.has(k))
  if (unknown.length > 0) {
    return {
      message: `Could not find the '${unknown[0]}' column of 'operation_settings' in the schema cache`,
      code: "PGRST204",
    }
  }
  return null
}

function buildSupabaseMock({ existing }: { existing: boolean }) {
  return {
    from(table: string) {
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
        maybeSingle: async () => ({ data: { org_id: "org-1" }, error: null }),
        single: async () => {
          if (table === "agencies") return { data: { org_id: "org-1" }, error: null }

          // Lectura previa: ¿existe la configuración?
          if (!builder._write) {
            return existing
              ? { data: { id: SETTINGS_ID }, error: null }
              : { data: null, error: { code: "PGRST116" } }
          }

          const error = validateColumns(builder._write)
          if (error) return { data: null, error }

          return { data: { id: SETTINGS_ID, ...builder._write }, error: null }
        },
      }
      return builder
    },
  }
}

/** Payload con TODOS los campos que acepta el schema de la ruta. */
function fullPayload() {
  return {
    custom_statuses: [{ value: "EN_CURSO", label: "En curso", color: "#fff", order: 1 }],
    workflows: { algo: true },
    auto_alerts: [{ type: "PAYMENT", enabled: true, days_before: 3, channels: ["email"] }],
    document_templates: [],
    custom_product_types: [{ value: "CIRCUITO", label: "Circuito" }],
    custom_operation_types: [{ value: "CIRCUITO", label: "Circuito" }],
    default_status: "PENDING",
    require_destination: true,
    require_departure_date: true,
    require_operator: false,
    require_customer: true,
    alert_payment_due_days: 5,
    alert_operator_payment_days: 7,
    alert_upcoming_trip_days: 10,
    checkin_enabled: true,
    checkin_default_hours: 48,
    checkin_airline_lead_times: [{ airline: "AR", hours: 48 }],
    auto_generate_quotation: false,
    auto_generate_invoice: false,
    require_documents_before_confirmation: false,
    auto_create_ledger_entry: true,
    auto_create_iva_entry: true,
    auto_create_operator_payment: true,
  }
}

function request(body: Record<string, unknown>) {
  return { json: async () => body } as any
}

beforeEach(() => {
  jest.clearAllMocks()
  lastWrite = null
  ;(getUserAgencyIds as jest.Mock).mockResolvedValue([AGENCY_ID])
  ;(getCurrentUser as jest.Mock).mockResolvedValue({
    user: { id: "user-1", org_id: "org-1", role: "ADMIN", roles: ["ADMIN"] },
  })
  ;(createServerClient as jest.Mock).mockResolvedValue(buildSupabaseMock({ existing: true }))
})

describe("PUT /api/operations/settings — tipos personalizados (VIB-150)", () => {
  it("guarda un tipo de operacion personalizado sin romper el update", async () => {
    const response = await PUT(
      request({ custom_operation_types: [{ value: "CIRCUITO", label: "Circuito" }] })
    )

    expect(response.status).toBe(200)
    expect(lastWrite?.custom_operation_types).toEqual([{ value: "CIRCUITO", label: "Circuito" }])
  })

  it("guarda todos los campos del schema (cualquier campo sin columna rompe acá)", async () => {
    const response = await PUT(request(fullPayload()))
    const body = await response.json()

    // Si esto falla con 500, hay un campo aceptado por Zod que no es columna:
    // exactamente el bug de VIB-150. El nombre sale en el mensaje del mock.
    expect(body.error).toBeUndefined()
    expect(response.status).toBe(200)
  })

  it("permite vaciar la lista de tipos de operacion", async () => {
    const response = await PUT(request({ custom_operation_types: [] }))

    expect(response.status).toBe(200)
    expect(lastWrite?.custom_operation_types).toEqual([])
  })

  it("tambien funciona al crear la configuracion por primera vez", async () => {
    ;(createServerClient as jest.Mock).mockResolvedValue(buildSupabaseMock({ existing: false }))

    const response = await PUT(
      request({ custom_operation_types: [{ value: "CIRCUITO", label: "Circuito" }] })
    )

    expect(response.status).toBe(200)
    expect(lastWrite?.custom_operation_types).toEqual([{ value: "CIRCUITO", label: "Circuito" }])
    expect(lastWrite?.agency_id).toBe(AGENCY_ID)
  })

  it("el mock detecta una clave que no es columna (guarda del guarda)", async () => {
    // Comprueba que el test de arriba puede fallar de verdad: si el mock
    // aceptara cualquier cosa, la suite entera no probaria nada.
    const error = validateColumns({ custom_operation_types: [], campo_inexistente: 1 })

    expect(error?.message).toContain("campo_inexistente")
  })

  it("no autoriza a un vendedor a tocar los catalogos de la agencia", async () => {
    ;(getCurrentUser as jest.Mock).mockResolvedValue({
      user: { id: "user-2", org_id: "org-1", role: "SELLER", roles: ["SELLER"] },
    })

    const response = await PUT(request({ custom_operation_types: [] }))

    expect(response.status).toBe(403)
  })
})
