/**
 * `getUserAgencyIds` es el que decide qué agencias ve alguien. Todo lo que
 * filtra por agencia (leads, operaciones, clientes, reportes) parte de esta
 * lista, así que un caso de borde acá se propaga a toda la app.
 *
 * El caso peligroso es el usuario SIN `org_id`. Antes el filtro por tenant era
 * condicional (`if (orgId) q = q.eq('org_id', orgId)`), así que un rol amplio
 * sin org se llevaba TODAS las agencias de la plataforma. En prod hay 10
 * usuarios así —tests viejos, altas abandonadas, un platform admin— y lo único
 * que los frenaba era el redirect del middleware.
 */
import { getUserAgencyIds } from "../permissions-api"

type Fila = Record<string, unknown>

/**
 * Mock mínimo de PostgREST: cada `.from()` devuelve un builder encadenable y
 * "thenable", que resuelve con las filas que la tabla tenga registradas.
 * Guarda además los filtros aplicados para poder afirmar sobre ellos.
 */
function mockSupabase(tablas: Record<string, Fila[]>) {
  const filtros: Array<{ tabla: string; columna: string; valor: unknown }> = []

  const builder = (tabla: string) => {
    let filas = [...(tablas[tabla] ?? [])]

    const self: any = {
      select: () => self,
      eq: (columna: string, valor: unknown) => {
        filtros.push({ tabla, columna, valor })
        filas = filas.filter((f) => f[columna] === valor)
        return self
      },
      in: (columna: string, valores: unknown[]) => {
        filas = filas.filter((f) => valores.includes(f[columna]))
        return self
      },
      maybeSingle: async () => ({ data: filas[0] ?? null, error: null }),
      then: (resolve: (r: { data: Fila[]; error: null }) => unknown) =>
        resolve({ data: filas, error: null }),
    }
    return self
  }

  return { supabase: { from: builder } as any, filtros }
}

const AGENCIAS = [
  { id: "ag-propia-1", org_id: "org-mia" },
  { id: "ag-propia-2", org_id: "org-mia" },
  { id: "ag-ajena", org_id: "org-de-otro-cliente" },
]

describe("getUserAgencyIds", () => {
  describe("usuario sin org_id", () => {
    it("no devuelve NINGUNA agencia aunque el rol sea amplio", async () => {
      const { supabase } = mockSupabase({
        users: [{ id: "u-sin-org", org_id: null }],
        agencies: AGENCIAS,
      })

      const ids = await getUserAgencyIds(supabase, "u-sin-org", "SUPER_ADMIN")

      expect(ids).toEqual([])
    })

    it("ignora los user_agencies sueltos que apunten a otros tenants", async () => {
      // Caso real: mateoadmin@gmail.com tenía org_id NULL y filas de
      // user_agencies en cuatro orgs distintas.
      const { supabase } = mockSupabase({
        users: [{ id: "u-sin-org", org_id: null }],
        agencies: AGENCIAS,
        user_agencies: [
          { user_id: "u-sin-org", agency_id: "ag-ajena" },
          { user_id: "u-sin-org", agency_id: "ag-propia-1" },
        ],
      })

      const ids = await getUserAgencyIds(supabase, "u-sin-org", "SELLER")

      expect(ids).toEqual([])
    })
  })

  describe("usuario con org_id", () => {
    it("a un rol amplio le da todas las agencias de SU org, no las de la plataforma", async () => {
      const { supabase, filtros } = mockSupabase({
        users: [{ id: "u-admin", org_id: "org-mia" }],
        agencies: AGENCIAS,
      })

      const ids = await getUserAgencyIds(supabase, "u-admin", "SUPER_ADMIN")

      expect(ids).toEqual(["ag-propia-1", "ag-propia-2"])
      expect(filtros).toContainEqual({
        tabla: "agencies",
        columna: "org_id",
        valor: "org-mia",
      })
    })

    it("a un rol acotado le da la intersección con las agencias de su org", async () => {
      const { supabase } = mockSupabase({
        users: [{ id: "u-seller", org_id: "org-mia" }],
        agencies: AGENCIAS,
        user_agencies: [
          { user_id: "u-seller", agency_id: "ag-propia-2" },
          // Fila cruzada: no tiene que sobrevivir al filtro por org.
          { user_id: "u-seller", agency_id: "ag-ajena" },
        ],
      })

      const ids = await getUserAgencyIds(supabase, "u-seller", "SELLER")

      expect(ids).toEqual(["ag-propia-2"])
    })

    it("devuelve vacío si el rol acotado no tiene ninguna agencia asignada", async () => {
      const { supabase } = mockSupabase({
        users: [{ id: "u-seller", org_id: "org-mia" }],
        agencies: AGENCIAS,
        user_agencies: [],
      })

      expect(await getUserAgencyIds(supabase, "u-seller", "SELLER")).toEqual([])
    })
  })
})
