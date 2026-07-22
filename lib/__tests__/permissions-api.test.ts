import {
  canPerformAction,
  canAccessResource,
  applyLeadsFilters,
  applyOperationsFilters,
  applyReportsFilters,
  isOwnDataOnlyResolved,
} from "../permissions-api"
import { buildDefaultMatrix, type ResolvedPermissionsMatrix } from "../permissions/resolved"

describe("Permissions API", () => {
  // ─── canPerformAction ────────────────────────────────────────────────
  describe("canPerformAction", () => {
    it("should allow SUPER_ADMIN to perform any action", () => {
      const user = { role: "SUPER_ADMIN", id: "user-1" }
      expect(canPerformAction(user, "leads", "read")).toBe(true)
      expect(canPerformAction(user, "leads", "write")).toBe(true)
      expect(canPerformAction(user, "leads", "delete")).toBe(true)
      expect(canPerformAction(user, "settings", "write")).toBe(true)
    })

    it("should allow ADMIN to read and write but not delete leads", () => {
      const user = { role: "ADMIN", id: "user-2" }
      expect(canPerformAction(user, "leads", "read")).toBe(true)
      expect(canPerformAction(user, "leads", "write")).toBe(true)
      expect(canPerformAction(user, "leads", "delete")).toBe(false)
    })

    it("should deny CONTABLE from reading leads", () => {
      const user = { role: "CONTABLE", id: "user-3" }
      expect(canPerformAction(user, "leads", "read")).toBe(false)
    })

    it("should allow CONTABLE to read and write accounting", () => {
      const user = { role: "CONTABLE", id: "user-3" }
      expect(canPerformAction(user, "accounting", "read")).toBe(true)
      expect(canPerformAction(user, "accounting", "write")).toBe(true)
    })

    it("should allow SELLER to read and write own leads", () => {
      const user = { role: "SELLER", id: "user-4" }
      expect(canPerformAction(user, "leads", "read")).toBe(true)
      expect(canPerformAction(user, "leads", "write")).toBe(true)
      expect(canPerformAction(user, "leads", "delete")).toBe(false)
    })

    it("should deny SELLER from accessing cash module", () => {
      const user = { role: "SELLER", id: "user-4" }
      expect(canPerformAction(user, "cash", "read")).toBe(false)
    })

    it("should deny VIEWER from writing to any module", () => {
      const user = { role: "VIEWER", id: "user-5" }
      expect(canPerformAction(user, "leads", "write")).toBe(false)
      expect(canPerformAction(user, "operations", "write")).toBe(false)
      expect(canPerformAction(user, "cash", "write")).toBe(false)
    })

    it("should allow VIEWER to read most modules", () => {
      const user = { role: "VIEWER", id: "user-5" }
      expect(canPerformAction(user, "leads", "read")).toBe(true)
      expect(canPerformAction(user, "operations", "read")).toBe(true)
      expect(canPerformAction(user, "dashboard", "read")).toBe(true)
    })
  })

  // ─── canAccessResource ──────────────────────────────────────────────
  describe("canAccessResource", () => {
    it("should always allow SUPER_ADMIN", () => {
      expect(canAccessResource("SUPER_ADMIN", "other-user", "user-1")).toBe(true)
      expect(canAccessResource("SUPER_ADMIN", null, "user-1")).toBe(true)
    })

    it("should always allow ADMIN", () => {
      expect(canAccessResource("ADMIN", "other-user", "user-2")).toBe(true)
    })

    it("should allow SELLER to access own resources", () => {
      expect(canAccessResource("SELLER", "user-3", "user-3")).toBe(true)
    })

    it("should deny SELLER access to other's resources", () => {
      expect(canAccessResource("SELLER", "other-user", "user-3")).toBe(false)
    })

    it("should deny SELLER when resource owner is null", () => {
      expect(canAccessResource("SELLER", null, "user-3")).toBe(false)
    })

    it("should deny SELLER when resource owner is undefined", () => {
      expect(canAccessResource("SELLER", undefined, "user-3")).toBe(false)
    })

    it("should deny VIEWER (not SUPER_ADMIN, ADMIN, or SELLER)", () => {
      expect(canAccessResource("VIEWER", "user-5", "user-5")).toBe(false)
    })

    it("should deny CONTABLE", () => {
      expect(canAccessResource("CONTABLE", "user-6", "user-6")).toBe(false)
    })
  })

  // ─── applyLeadsFilters ──────────────────────────────────────────────
  describe("applyLeadsFilters", () => {
    const createMockQuery = () => ({
      in: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    })

    it("should filter SELLER by agency_id when agencyIds available", () => {
      const query = createMockQuery()
      const user = { role: "SELLER", id: "seller-1" }
      const result = applyLeadsFilters(query, user, ["agency-1", "agency-2"])

      expect(query.in).toHaveBeenCalledWith("agency_id", ["agency-1", "agency-2"])
    })

    it("should filter SELLER by assigned_seller_id when no agencyIds", () => {
      const query = createMockQuery()
      const user = { role: "SELLER", id: "seller-1" }
      const result = applyLeadsFilters(query, user, [])

      expect(query.eq).toHaveBeenCalledWith("assigned_seller_id", "seller-1")
    })

    it("should throw error for CONTABLE", () => {
      const query = createMockQuery()
      const user = { role: "CONTABLE", id: "contable-1" }

      expect(() => applyLeadsFilters(query, user, [])).toThrow("No tiene permiso para ver leads")
    })

    it("should filter ADMIN by agency_id", () => {
      const query = createMockQuery()
      const user = { role: "ADMIN", id: "admin-1" }
      applyLeadsFilters(query, user, ["agency-1"])

      expect(query.in).toHaveBeenCalledWith("agency_id", ["agency-1"])
    })

    it("should filter SUPER_ADMIN by agency_id (multi-tenant: always scope to org)", () => {
      const query = createMockQuery()
      const user = { role: "SUPER_ADMIN", id: "sa-1" }
      applyLeadsFilters(query, user, ["agency-1"])

      // Multi-tenant: SUPER_ADMIN es SUPER_ADMIN DENTRO de su org. Los agencyIds
      // vienen pre-filtrados por org (getUserAgencyIds), así que filtrar por
      // ellos también acota al org incluso para SUPER_ADMIN.
      expect(query.in).toHaveBeenCalledWith("agency_id", ["agency-1"])
    })

    it("should not filter SUPER_ADMIN when agencyIds is empty (legacy / mock dev)", () => {
      const query = createMockQuery()
      const user = { role: "SUPER_ADMIN", id: "sa-1" }
      applyLeadsFilters(query, user, [])

      expect(query.in).not.toHaveBeenCalled()
      expect(query.eq).not.toHaveBeenCalled()
    })
  })

  // ─── applyOperationsFilters ──────────────────────────────────────────
  describe("applyOperationsFilters", () => {
    const createMockQuery = () => ({
      in: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    })

    it("should filter SELLER by seller_id", () => {
      const query = createMockQuery()
      const user = { role: "SELLER", id: "seller-1" }
      applyOperationsFilters(query, user, ["agency-1"])

      expect(query.eq).toHaveBeenCalledWith("seller_id", "seller-1")
    })

    it("should filter SELLER with support permission by agency_id", () => {
      const query = createMockQuery()
      const user = {
        role: "SELLER",
        id: "seller-1",
        can_view_agency_operations_support: true,
      }
      applyOperationsFilters(query, user, ["agency-1", "agency-2"])

      expect(query.in).toHaveBeenCalledWith("agency_id", ["agency-1", "agency-2"])
      expect(query.eq).not.toHaveBeenCalledWith("seller_id", "seller-1")
    })

    it("should fall back to seller_id when support SELLER has no agencies", () => {
      const query = createMockQuery()
      const user = {
        role: "SELLER",
        id: "seller-1",
        can_view_agency_operations_support: true,
      }
      applyOperationsFilters(query, user, [])

      expect(query.eq).toHaveBeenCalledWith("seller_id", "seller-1")
    })

    it("should filter ADMIN by agency_id", () => {
      const query = createMockQuery()
      const user = { role: "ADMIN", id: "admin-1" }
      applyOperationsFilters(query, user, ["agency-1", "agency-2"])

      expect(query.in).toHaveBeenCalledWith("agency_id", ["agency-1", "agency-2"])
    })

    it("should filter SUPER_ADMIN by agency_id (multi-tenant: always scope to org)", () => {
      const query = createMockQuery()
      const user = { role: "SUPER_ADMIN", id: "sa-1" }
      applyOperationsFilters(query, user, ["agency-1"])

      expect(query.in).toHaveBeenCalledWith("agency_id", ["agency-1"])
    })

    // Fix cross-tenant (2026-05-18): con agencyIds vacío, ADMIN/SUPER_ADMIN NO
    // deben quedar sin filtro (eso leakeaba operaciones de toda la org). Ahora
    // se fuerza limit(0) → 0 resultados en vez de "todo".
    it("should limit(0) SUPER_ADMIN when agencyIds is empty (fail-safe, no leak)", () => {
      const query = createMockQuery()
      const user = { role: "SUPER_ADMIN", id: "sa-1" }
      applyOperationsFilters(query, user, [])

      expect(query.limit).toHaveBeenCalledWith(0)
      expect(query.in).not.toHaveBeenCalled()
    })

    it("should limit(0) ADMIN when no agencyIds (fail-safe, no leak)", () => {
      const query = createMockQuery()
      const user = { role: "ADMIN", id: "admin-1" }
      applyOperationsFilters(query, user, [])

      expect(query.limit).toHaveBeenCalledWith(0)
      expect(query.in).not.toHaveBeenCalled()
    })
  })

  // ─── applyReportsFilters ────────────────────────────────────────────
  describe("applyReportsFilters", () => {
    it("should allow CONTABLE with ownDataOnly=false", () => {
      const user = { role: "CONTABLE", id: "c-1" }
      const result = applyReportsFilters(user, [])

      expect(result.canAccess).toBe(true)
      expect(result.ownDataOnly).toBe(false)
    })

    it("should allow SELLER with ownDataOnly=true", () => {
      const user = { role: "SELLER", id: "s-1" }
      const result = applyReportsFilters(user, [])

      expect(result.canAccess).toBe(true)
      expect(result.ownDataOnly).toBe(true)
    })

    it("should allow SUPER_ADMIN with ownDataOnly=false", () => {
      const user = { role: "SUPER_ADMIN", id: "sa-1" }
      const result = applyReportsFilters(user, [])

      expect(result.canAccess).toBe(true)
      expect(result.ownDataOnly).toBe(false)
    })

    it("should allow ADMIN with ownDataOnly=false", () => {
      const user = { role: "ADMIN", id: "a-1" }
      const result = applyReportsFilters(user, [])

      expect(result.canAccess).toBe(true)
      expect(result.ownDataOnly).toBe(false)
    })

    it("should allow VIEWER with ownDataOnly=false", () => {
      const user = { role: "VIEWER", id: "v-1" }
      const result = applyReportsFilters(user, [])

      expect(result.canAccess).toBe(true)
      expect(result.ownDataOnly).toBe(false)
    })
  })

  // ─── Matrix dinámica por agencia (Etapa 1: wiring de overrides) ───────
  // Cubre el mecanismo que usan calendar/events, /api/commissions,
  // canAccessDocumentResource, etc.: cuando se pasa la matrix resuelta, los
  // overrides por agencia ganan sobre los defaults estáticos del rol.
  describe("matrix-aware overrides", () => {
    it("canPerformAction: un override de agencia habilita un permiso que el default niega", () => {
      const user = { role: "SELLER", id: "s-1" }
      // SELLER por default NO tiene cash.write.
      expect(canPerformAction(user, "cash", "write")).toBe(false)

      const matrix: ResolvedPermissionsMatrix = {
        ...buildDefaultMatrix("SELLER"),
        cash: { read: true, write: true, delete: false, export: false, ownDataOnly: false },
      }
      expect(canPerformAction(user, "cash", "write", matrix)).toBe(true)
    })

    it("isOwnDataOnlyResolved: apagar ownDataOnly en la matrix hace que un SELLER vea todo (calendario)", () => {
      const user = { role: "SELLER", id: "s-1" }
      // Default SELLER operations → solo lo propio.
      expect(isOwnDataOnlyResolved(user, "operations")).toBe(true)

      const matrix: ResolvedPermissionsMatrix = {
        ...buildDefaultMatrix("SELLER"),
        operations: { read: true, write: true, delete: false, export: true, ownDataOnly: false },
      }
      expect(isOwnDataOnlyResolved(user, "operations", matrix)).toBe(false)
    })

    it("isOwnDataOnlyResolved: prender ownDataOnly restringe a un ADMIN (comisiones propias)", () => {
      const user = { role: "ADMIN", id: "a-1" }
      // Default ADMIN commissions → ve todas (ownDataOnly false).
      expect(isOwnDataOnlyResolved(user, "commissions")).toBe(false)

      const matrix: ResolvedPermissionsMatrix = {
        ...buildDefaultMatrix("ADMIN"),
        commissions: { read: true, write: false, delete: false, export: true, ownDataOnly: true },
      }
      expect(isOwnDataOnlyResolved(user, "commissions", matrix)).toBe(true)
    })

    it("canViewAll de comisiones = read && !ownDataOnly: ADMIN restringido deja de ver todas", () => {
      const user = { role: "ADMIN", id: "a-1" }
      const canViewAll = (m?: ResolvedPermissionsMatrix) =>
        canPerformAction(user, "commissions", "read", m) &&
        !isOwnDataOnlyResolved(user, "commissions", m)

      expect(canViewAll()).toBe(true) // default: ve todas
      const restricted: ResolvedPermissionsMatrix = {
        ...buildDefaultMatrix("ADMIN"),
        commissions: { read: true, write: false, delete: false, export: true, ownDataOnly: true },
      }
      expect(canViewAll(restricted)).toBe(false) // override: solo propias
    })

    it("SUPER_ADMIN/ORG_OWNER nunca quedan restringidos por la matrix", () => {
      const sa = { role: "SUPER_ADMIN", id: "sa-1" }
      const matrix: ResolvedPermissionsMatrix = {
        ...buildDefaultMatrix("SELLER"),
        commissions: { read: false, write: false, delete: false, export: false, ownDataOnly: true },
      }
      expect(canPerformAction(sa, "commissions", "read", matrix)).toBe(true)
      expect(isOwnDataOnlyResolved(sa, "commissions", matrix)).toBe(false)
    })
  })
})
