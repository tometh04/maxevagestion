/**
 * VIB-102 — Validación del vínculo vendedor → administrador.
 *
 * Lo que se protege acá no es la usabilidad del formulario: el administrador
 * termina con una fila de comisión en cada venta del vendedor, así que un id de
 * otra organización es plata y datos cruzando de tenant.
 */

import { normalizeAdvisorManagerLink } from "@/lib/commissions/advisor-manager-link"

const ORG = "org-1"

/** Cliente mínimo: devuelve `row` si el id (y la org, si se filtró) coinciden. */
function createClient(rows: Array<{ id: string; org_id: string; is_independent_advisor?: boolean }>) {
  const client = {
    from: () => {
      const filters: Record<string, any> = {}
      const builder: any = {
        select: () => builder,
        eq: (column: string, value: any) => {
          filters[column] = value
          return builder
        },
        maybeSingle: async () => {
          const match = rows.find((r) =>
            Object.entries(filters).every(([column, value]) => (r as any)[column] === value)
          )
          return { data: match ?? null, error: null }
        },
      }
      return builder
    },
  }
  return client as any
}

const base = {
  orgId: ORG,
  targetUserId: "free",
}

describe("normalizeAdvisorManagerLink", () => {
  it("no toca nada si el request no manda ninguno de los dos campos", async () => {
    const result = await normalizeAdvisorManagerLink({
      ...base,
      supabase: createClient([]),
      input: {},
    })

    expect(result).toEqual({ ok: true, values: {} })
  })

  it("guarda administrador y porcentaje juntos", async () => {
    const result = await normalizeAdvisorManagerLink({
      ...base,
      supabase: createClient([{ id: "mica", org_id: ORG, is_independent_advisor: false }]),
      input: { advisor_manager_id: "mica", advisor_manager_percentage: 5 },
    })

    expect(result).toEqual({
      ok: true,
      values: { advisor_manager_id: "mica", advisor_manager_percentage: 5 },
    })
  })

  it("quitar el administrador limpia también el porcentaje", async () => {
    // Si el porcentaje quedara suelto, reasignar un administrador más adelante
    // lo reviviría con un número viejo que nadie volvió a mirar.
    const result = await normalizeAdvisorManagerLink({
      ...base,
      supabase: createClient([]),
      currentManagerId: "mica",
      input: { advisor_manager_id: null },
    })

    expect(result).toEqual({
      ok: true,
      values: { advisor_manager_id: null, advisor_manager_percentage: null },
    })
  })

  it("trata el centinela del select como 'sin administrador'", async () => {
    const result = await normalizeAdvisorManagerLink({
      ...base,
      supabase: createClient([]),
      input: { advisor_manager_id: "NONE" },
    })

    expect(result).toEqual({
      ok: true,
      values: { advisor_manager_id: null, advisor_manager_percentage: null },
    })
  })

  it("rechaza un administrador de otra organización", async () => {
    const result = await normalizeAdvisorManagerLink({
      ...base,
      supabase: createClient([{ id: "ajeno", org_id: "otra-org" }]),
      input: { advisor_manager_id: "ajeno", advisor_manager_percentage: 5 },
    })

    expect(result).toEqual({
      ok: false,
      error: "El administrador seleccionado no existe en la organización",
    })
  })

  it("rechaza que un vendedor sea su propio administrador", async () => {
    const result = await normalizeAdvisorManagerLink({
      ...base,
      supabase: createClient([{ id: "free", org_id: ORG }]),
      input: { advisor_manager_id: "free", advisor_manager_percentage: 5 },
    })

    expect(result.ok).toBe(false)
  })

  it("rechaza a un asesor independiente como administrador", async () => {
    // Vería comisiones de ventas que no son suyas, que es justo lo que el modo
    // asesor independiente existe para impedir.
    const result = await normalizeAdvisorManagerLink({
      ...base,
      supabase: createClient([{ id: "otro-free", org_id: ORG, is_independent_advisor: true }]),
      input: { advisor_manager_id: "otro-free", advisor_manager_percentage: 5 },
    })

    expect(result).toEqual({
      ok: false,
      error: "Un asesor independiente no puede administrar a otro vendedor",
    })
  })

  it("rechaza porcentajes fuera de rango", async () => {
    const client = createClient([{ id: "mica", org_id: ORG }])

    for (const pct of [-1, 101, "abc"]) {
      const result = await normalizeAdvisorManagerLink({
        ...base,
        supabase: client,
        input: { advisor_manager_id: "mica", advisor_manager_percentage: pct },
      })
      expect(result.ok).toBe(false)
    }
  })

  it("cambiar solo el porcentaje conserva el administrador actual", async () => {
    const result = await normalizeAdvisorManagerLink({
      ...base,
      supabase: createClient([{ id: "mica", org_id: ORG }]),
      currentManagerId: "mica",
      input: { advisor_manager_percentage: 7 },
    })

    expect(result).toEqual({
      ok: true,
      values: { advisor_manager_id: "mica", advisor_manager_percentage: 7 },
    })
  })
})
