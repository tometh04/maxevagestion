/**
 * @jest-environment node
 *
 * Reclasificar una salida de caja como "no es gasto".
 *
 * El flag decide si un egreso cuenta en el reporte de Gastos. Antes sólo se
 * podía elegir al crear el movimiento, así que un error de carga sólo se
 * arreglaba borrando un egreso que realmente ocurrió.
 *
 * Lo que se fija acá es el criterio, no el CRUD: que sacar plata de los
 * reportes exija un motivo, que el motivo ya cargado alcance, y que el flag no
 * acepte cualquier cosa.
 */

import { PATCH } from "@/app/api/expenses/variable/[id]/route"
import { getRequestPermissions } from "@/lib/permissions/request"
import { createAdminClient } from "@/lib/supabase/server"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/permissions/request", () => ({ getRequestPermissions: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
  createServerClient: jest.fn(),
}))
jest.mock("@/lib/accounting/ledger", () => ({ invalidateBalanceCache: jest.fn() }))

const MOV_ID = "e12e1955-49e7-453d-9861-cf1536151785"

/** Lo que quedó escrito en cash_movements en la última llamada. */
let updated: Record<string, any> | null = null

function setup({
  role = "ADMIN",
  notes = null as string | null,
}: { role?: string; notes?: string | null } = {}) {
  updated = null

  const existing = {
    id: MOV_ID,
    type: "EXPENSE",
    financial_account_id: "acc-1",
    ledger_movement_id: null,
    org_id: "org-1",
    notes,
  }

  const readClient: any = {
    from: () => ({
      select: () => ({
        eq: function () { return this },
        single: async () => ({ data: existing, error: null }),
        maybeSingle: async () => ({ data: { id: "cat-1" }, error: null }),
      }),
    }),
  }

  ;(getRequestPermissions as jest.Mock).mockResolvedValue({
    user: { id: "u-1", role, org_id: "org-1" },
    supabase: readClient,
    matrix: null,
  })

  ;(createAdminClient as jest.Mock).mockReturnValue({
    from: () => ({
      update: (data: Record<string, any>) => {
        updated = data
        return { eq: function () { return this }, then: (r: any) => r({ error: null }) }
      },
      select: () => ({
        eq: function () { return this },
        single: async () => ({ data: existing, error: null }),
      }),
    }),
  })
}

const patch = (body: Record<string, any>) =>
  PATCH(
    new Request(`http://localhost/api/expenses/variable/${MOV_ID}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: MOV_ID }) }
  )

describe("PATCH /api/expenses/variable/[id] — reclasificar como no-gasto", () => {
  it("marca la salida como que no es gasto cuando viene el motivo", async () => {
    setup()
    const res = await patch({
      is_agency_expense: false,
      notes: "ajuste de caja, no es un gasto",
    })
    expect(res.status).toBe(200)
    expect(updated).toMatchObject({ is_agency_expense: false })
  })

  it("exige el motivo para sacar algo de los gastos", async () => {
    // Sin motivo la decisión no es auditable: dentro de dos meses nadie sabe
    // por qué ese egreso no cuenta.
    setup()
    const res = await patch({ is_agency_expense: false })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/motivo/i)
    expect(updated).toBeNull()
  })

  it("rechaza un motivo en blanco", async () => {
    setup()
    const res = await patch({ is_agency_expense: false, notes: "   " })
    expect(res.status).toBe(400)
  })

  it("si el movimiento ya traía motivo, ese alcanza", async () => {
    setup({ notes: "retiro de socio" })
    const res = await patch({ is_agency_expense: false })
    expect(res.status).toBe(200)
    expect(updated).toMatchObject({ is_agency_expense: false })
  })

  it("volver a marcarlo como gasto NO exige motivo", async () => {
    // Es restituir el default, no sacar plata de ningún lado.
    setup()
    const res = await patch({ is_agency_expense: true })
    expect(res.status).toBe(200)
    expect(updated).toMatchObject({ is_agency_expense: true })
  })

  it("rechaza un valor que no sea booleano", async () => {
    setup()
    expect((await patch({ is_agency_expense: "false" })).status).toBe(400)
    expect(updated).toBeNull()
  })

  it("no toca el flag si no viene en el body", async () => {
    // Editar la categoría no puede reclasificar el gasto de rebote.
    setup()
    const res = await patch({ notes: "otra nota" })
    expect(res.status).toBe(200)
    expect(updated).not.toHaveProperty("is_agency_expense")
  })

  it("un VIEWER no puede reclasificar", async () => {
    setup({ role: "VIEWER" })
    const res = await patch({ is_agency_expense: false, notes: "porque si" })
    expect(res.status).toBe(403)
    expect(updated).toBeNull()
  })
})
