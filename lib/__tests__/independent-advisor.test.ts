/**
 * VIB-69 — Asesor de viajes independiente (AVI).
 *
 * El asesor es un SELLER endurecido: hereda toda la restricción "solo mis datos"
 * ya existente y le agrega un techo. Lo que estos tests protegen es justamente el
 * techo — que ninguna de las vías que amplían a un vendedor (override de agencia,
 * rol adicional, permisos especiales por usuario) le abra a un freelancer datos
 * de la agencia.
 */

import {
  canPerformAction,
  isOwnDataOnlyResolved,
  applyLeadsFilters,
  applyOperationsFilters,
  applyCustomersFilters,
  resolveOperationAccessScope,
  hasAgencyOperationsSupportView,
  canCreateOperationsForOtherSellers,
  canRegisterPaymentsOnAgencyOperations,
} from "../permissions-api"
import { isIndependentAdvisor } from "../permissions"
import {
  buildDefaultMatrix,
  clampMatrixForIndependentAdvisor,
  type ResolvedPermissionsMatrix,
} from "../permissions/resolved"

const advisor = {
  role: "SELLER",
  id: "avi-1",
  is_independent_advisor: true,
}

const seller = {
  role: "SELLER",
  id: "seller-1",
  is_independent_advisor: false,
}

/** Matriz permisiva: simula una agencia que le abrió todo al rol SELLER. */
const WIDE_OPEN: ResolvedPermissionsMatrix = Object.fromEntries(
  Object.keys(buildDefaultMatrix("SELLER")).map((m) => [
    m,
    { read: true, write: true, delete: true, export: true, ownDataOnly: false },
  ])
)

describe("VIB-69 — asesor de viajes independiente", () => {
  describe("isIndependentAdvisor", () => {
    it("reconoce al asesor", () => {
      expect(isIndependentAdvisor(advisor)).toBe(true)
    })

    it("es inerte si el flag quedó prendido sobre otro rol", () => {
      // Si un admin lo asciende a ADMIN sin bajar el flag, no queremos aplicarle
      // un techo de vendedor por accidente: el flag simplemente no aplica.
      expect(isIndependentAdvisor({ role: "ADMIN", is_independent_advisor: true })).toBe(false)
    })

    it("no marca a un vendedor común", () => {
      expect(isIndependentAdvisor(seller)).toBe(false)
      expect(isIndependentAdvisor({ role: "SELLER" })).toBe(false)
    })
  })

  describe("canPerformAction", () => {
    it("le niega leads aunque la agencia se los haya habilitado al rol SELLER", () => {
      expect(canPerformAction(seller, "leads", "read", WIDE_OPEN)).toBe(true)
      expect(canPerformAction(advisor, "leads", "read", WIDE_OPEN)).toBe(false)
      expect(canPerformAction(advisor, "leads", "write", WIDE_OPEN)).toBe(false)
    })

    it("le niega leads también en el fallback estático (gates sin matrix)", () => {
      expect(canPerformAction(seller, "leads", "read")).toBe(true)
      expect(canPerformAction(advisor, "leads", "read")).toBe(false)
    })

    it("le niega caja y contabilidad aunque la matrix las habilite", () => {
      expect(canPerformAction(advisor, "cash", "read", WIDE_OPEN)).toBe(false)
      expect(canPerformAction(advisor, "accounting", "read", WIDE_OPEN)).toBe(false)
      expect(canPerformAction(advisor, "operators", "read", WIDE_OPEN)).toBe(false)
      expect(canPerformAction(advisor, "settings", "write", WIDE_OPEN)).toBe(false)
    })

    it("le conserva lo que sí necesita para trabajar", () => {
      expect(canPerformAction(advisor, "operations", "read")).toBe(true)
      expect(canPerformAction(advisor, "operations", "write")).toBe(true)
      expect(canPerformAction(advisor, "customers", "write")).toBe(true)
      expect(canPerformAction(advisor, "documents", "write")).toBe(true)
      expect(canPerformAction(advisor, "commissions", "read")).toBe(true)
    })

    it("no puede borrar", () => {
      expect(canPerformAction(advisor, "operations", "delete", WIDE_OPEN)).toBe(false)
      expect(canPerformAction(advisor, "customers", "delete", WIDE_OPEN)).toBe(false)
    })
  })

  describe("isOwnDataOnlyResolved", () => {
    it("lo mantiene en sus propios datos aunque la agencia apague ownDataOnly", () => {
      expect(isOwnDataOnlyResolved(seller, "operations", WIDE_OPEN)).toBe(false)
      expect(isOwnDataOnlyResolved(advisor, "operations", WIDE_OPEN)).toBe(true)
      expect(isOwnDataOnlyResolved(advisor, "customers", WIDE_OPEN)).toBe(true)
      expect(isOwnDataOnlyResolved(advisor, "commissions", WIDE_OPEN)).toBe(true)
    })
  })

  describe("permisos especiales de agencia", () => {
    const advisorWithLegacyFlags = {
      ...advisor,
      can_view_agency_operations_support: true,
      can_add_services_on_agency_operations: true,
      can_create_operations_for_other_sellers: true,
      can_register_payments_on_agency_operations: true,
    }

    it("no los recibe aunque hayan quedado prendidos de cuando era vendedor", () => {
      expect(hasAgencyOperationsSupportView(advisorWithLegacyFlags)).toBe(false)
      expect(canCreateOperationsForOtherSellers(advisorWithLegacyFlags)).toBe(false)
      expect(canRegisterPaymentsOnAgencyOperations(advisorWithLegacyFlags)).toBe(false)
    })

    it("el vendedor común los sigue recibiendo", () => {
      expect(
        hasAgencyOperationsSupportView({ ...seller, can_view_agency_operations_support: true })
      ).toBe(true)
    })
  })

  describe("applyLeadsFilters", () => {
    const createMockQuery = () => ({
      in: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    })

    it("corta el acceso a leads (el vendedor común ve los de sus agencias)", () => {
      expect(() => applyLeadsFilters(createMockQuery(), advisor, ["agency-1"])).toThrow(
        "No tiene permiso para ver leads"
      )

      const query = createMockQuery()
      applyLeadsFilters(query, seller, ["agency-1"])
      expect(query.in).toHaveBeenCalledWith("agency_id", ["agency-1"])
    })
  })

  describe("applyOperationsFilters", () => {
    const createMockQuery = () => ({
      in: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    })

    it("lo deja solo con sus operaciones aunque tenga los flags de agencia", () => {
      const query = createMockQuery()
      applyOperationsFilters(
        query,
        { ...advisor, can_view_agency_operations_support: true },
        ["agency-1", "agency-2"]
      )

      expect(query.eq).toHaveBeenCalledWith("seller_id", "avi-1")
      expect(query.in).not.toHaveBeenCalled()
    })
  })

  describe("resolveOperationAccessScope", () => {
    it("le da 'own' sobre sus operaciones", () => {
      const scope = resolveOperationAccessScope(
        advisor,
        { agency_id: "agency-1", seller_id: "avi-1" },
        ["agency-1"]
      )
      expect(scope).toBe("own")
    })

    it("le niega las operaciones de otro vendedor de la misma agencia", () => {
      const scope = resolveOperationAccessScope(
        { ...advisor, can_view_agency_operations_support: true, can_register_payments_on_agency_operations: true },
        { agency_id: "agency-1", seller_id: "seller-1" },
        ["agency-1"]
      )
      expect(scope).toBeNull()
    })
  })

  describe("applyCustomersFilters", () => {
    const createMockQuery = () => {
      const query: any = {
        eq: jest.fn(() => query),
        in: jest.fn(() => query),
        limit: jest.fn(() => query),
      }
      return query
    }

    /**
     * Mock mínimo de Supabase: users → org_id; operations → sin operaciones;
     * operation_customers/customers → vacío. Alcanza para distinguir la rama
     * "selector abierto" (devuelve la query tal cual) de la rama acotada.
     */
    const createMockSupabase = () =>
      ({
        from: (table: string) => {
          if (table === "users") {
            return {
              select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: { org_id: "org-1" } }) }),
              }),
            }
          }
          if (table === "operations") {
            return { select: () => ({ eq: async () => ({ data: [] }) }) }
          }
          return {
            select: () => ({
              eq: () => ({ eq: async () => ({ data: [] }) }),
              in: async () => ({ data: [] }),
            }),
          }
        },
      }) as any

    it("no le abre la cartera de clientes de la agencia en el selector", async () => {
      const query = createMockQuery()
      const { query: result } = await applyCustomersFilters(
        query,
        advisor,
        ["agency-1"],
        createMockSupabase(),
        "selector"
      )

      // Sin clientes propios todavía → query vacía, no la base entera.
      expect(query.limit).toHaveBeenCalledWith(0)
      expect(result).toBe(query)
    })

    it("al vendedor común sí (necesita asignar cualquier cliente existente)", async () => {
      const query = createMockQuery()
      await applyCustomersFilters(query, seller, ["agency-1"], createMockSupabase(), "selector")

      expect(query.limit).not.toHaveBeenCalled()
    })
  })

  describe("clampMatrixForIndependentAdvisor", () => {
    it("interseca: nunca amplía lo que la agencia ya restringió", () => {
      const strict: ResolvedPermissionsMatrix = {
        ...buildDefaultMatrix("SELLER"),
        operations: { read: true, write: false, delete: false, export: false, ownDataOnly: true },
      }
      const clamped = clampMatrixForIndependentAdvisor(strict)

      expect(clamped.operations.write).toBe(false)
      expect(clamped.leads.read).toBe(false)
    })

    it("recorta una matriz abierta al techo del asesor", () => {
      const clamped = clampMatrixForIndependentAdvisor(WIDE_OPEN)

      expect(clamped.leads.read).toBe(false)
      expect(clamped.cash.read).toBe(false)
      expect(clamped.operations.read).toBe(true)
      expect(clamped.operations.ownDataOnly).toBe(true)
      expect(clamped.operations.delete).toBe(false)
    })
  })
})
