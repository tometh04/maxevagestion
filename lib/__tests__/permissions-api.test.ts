import {
  canPerformAction,
  canAccessResource,
  applyLeadsFilters,
  applyOperationsFilters,
  applyReportsFilters,
} from "../permissions-api"

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

    it("should not filter SUPER_ADMIN when agencyIds is empty (legacy / mock dev)", () => {
      const query = createMockQuery()
      const user = { role: "SUPER_ADMIN", id: "sa-1" }
      applyOperationsFilters(query, user, [])

      expect(query.in).not.toHaveBeenCalled()
      expect(query.eq).not.toHaveBeenCalled()
    })

    it("should not filter ADMIN when no agencyIds", () => {
      const query = createMockQuery()
      const user = { role: "ADMIN", id: "admin-1" }
      applyOperationsFilters(query, user, [])

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
})
