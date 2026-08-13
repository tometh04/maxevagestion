import {
  canPerformAction,
  canAccessResource,
  applyLeadsFilters,
  applyOperationsFilters,
  applyReportsFilters,
  isOwnDataOnlyResolved,
  canCreateOperationsForOtherSellers,
  canAssignSecondarySeller,
  isSellerWithinUserAgencies,
  canRegisterPaymentsOnAgencyOperations,
  resolveOperationAccessScope,
  isAgencyReadonlyScope,
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

    it("should widen SELLER with agency-payments permission to agency_id (para poder abrir y cobrar)", () => {
      const query = createMockQuery()
      const user = {
        role: "SELLER",
        id: "seller-1",
        can_register_payments_on_agency_operations: true,
      }
      applyOperationsFilters(query, user, ["agency-1", "agency-2"])

      expect(query.in).toHaveBeenCalledWith("agency_id", ["agency-1", "agency-2"])
      expect(query.eq).not.toHaveBeenCalledWith("seller_id", "seller-1")
    })

    it("should keep own-only for SELLER without any special flag", () => {
      const query = createMockQuery()
      const user = { role: "SELLER", id: "seller-1" }
      applyOperationsFilters(query, user, ["agency-1"])

      expect(query.eq).toHaveBeenCalledWith("seller_id", "seller-1")
      expect(query.in).not.toHaveBeenCalled()
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
    // deben quedar sin filtro (eso leakeaba operaciones de toda la org).
    //
    // 🔴 El fail-safe era `.limit(0)`, que NO servía: `.range()` (que todo
    // endpoint paginado aplica después) escribe el mismo parámetro `limit` de
    // PostgREST y lo pisa. Ahora se fuerza un `.eq("id", <uuid imposible>)`,
    // que sobrevive a la paginación.
    const NO_MATCH_UUID = "00000000-0000-0000-0000-000000000000"

    it("should return an empty result for SUPER_ADMIN when agencyIds is empty (fail-safe, no leak)", () => {
      const query = createMockQuery()
      const user = { role: "SUPER_ADMIN", id: "sa-1" }
      applyOperationsFilters(query, user, [])

      expect(query.eq).toHaveBeenCalledWith("id", NO_MATCH_UUID)
      expect(query.limit).not.toHaveBeenCalled()
      expect(query.in).not.toHaveBeenCalled()
    })

    it("should return an empty result for ADMIN when no agencyIds (fail-safe, no leak)", () => {
      const query = createMockQuery()
      const user = { role: "ADMIN", id: "admin-1" }
      applyOperationsFilters(query, user, [])

      expect(query.eq).toHaveBeenCalledWith("id", NO_MATCH_UUID)
      expect(query.limit).not.toHaveBeenCalled()
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

  // ─── Etapa 3: gates de WRITE de plata migrados de rol-fijo a matrix ───
  // Estos tests BLOQUEAN la semántica de seguridad de los gates de dinero:
  //  1) el fallback sin matrix (org null / dev) preserva EXACTAMENTE el set de
  //     roles hardcodeado que reemplazamos → deploy seguro;
  //  2) el ORG_OWNER (owner del tenant) queda habilitado, arreglando el lockout
  //     latente de los gates viejos.
  describe("money write-gates: fallback sin matrix == set previo", () => {
    // cash.write reemplaza los sets [ADMIN,SUPER_ADMIN,CONTABLE]:
    //   cash-boxes, card-transactions, payment-coupons, cash-movements reverse,
    //   payments PATCH (editar pago).
    it("cash.write sin matrix: habilita ADMIN/SUPER_ADMIN/CONTABLE, niega SELLER/VIEWER/POST_VENTA", () => {
      const can = (role: string) => canPerformAction({ role, id: "u" }, "cash", "write")
      expect(can("ADMIN")).toBe(true)
      expect(can("SUPER_ADMIN")).toBe(true)
      expect(can("CONTABLE")).toBe(true)
      expect(can("SELLER")).toBe(false)
      expect(can("VIEWER")).toBe(false)
      expect(can("POST_VENTA")).toBe(false)
    })

    // accounting.write reemplaza [ADMIN,SUPER_ADMIN,CONTABLE]:
    //   ledger-movements reverse, operator-payments PATCH, withholdings POST,
    //   recurring-payments, expenses variable.
    it("accounting.write sin matrix: habilita ADMIN/SUPER_ADMIN/CONTABLE, niega SELLER/VIEWER/POST_VENTA", () => {
      const can = (role: string) => canPerformAction({ role, id: "u" }, "accounting", "write")
      expect(can("ADMIN")).toBe(true)
      expect(can("SUPER_ADMIN")).toBe(true)
      expect(can("CONTABLE")).toBe(true)
      expect(can("SELLER")).toBe(false)
      expect(can("VIEWER")).toBe(false)
      expect(can("POST_VENTA")).toBe(false)
    })

    // commissions.write reemplaza [ADMIN,SUPER_ADMIN] (schemes, recalculate).
    // Clave: CONTABLE NO debe ganar acceso a comisiones (default write=false).
    it("commissions.write sin matrix: habilita ADMIN/SUPER_ADMIN, niega CONTABLE/SELLER/VIEWER/POST_VENTA", () => {
      const can = (role: string) => canPerformAction({ role, id: "u" }, "commissions", "write")
      expect(can("ADMIN")).toBe(true)
      expect(can("SUPER_ADMIN")).toBe(true)
      expect(can("CONTABLE")).toBe(false) // <- no debe filtrarse acceso
      expect(can("SELLER")).toBe(false)
      expect(can("VIEWER")).toBe(false)
      expect(can("POST_VENTA")).toBe(false)
    })

    it("ORG_OWNER queda habilitado en todos los write de plata (arregla lockout de gates viejos)", () => {
      const owner = { role: "ORG_OWNER", id: "o-1" }
      expect(canPerformAction(owner, "cash", "write")).toBe(true)
      expect(canPerformAction(owner, "accounting", "write")).toBe(true)
      expect(canPerformAction(owner, "commissions", "write")).toBe(true)
    })

    it("un override de agencia habilita cash.write a un SELLER (imputar pagos / cajas)", () => {
      const seller = { role: "SELLER", id: "s-1" }
      expect(canPerformAction(seller, "cash", "write")).toBe(false)
      const matrix: ResolvedPermissionsMatrix = {
        ...buildDefaultMatrix("SELLER"),
        cash: { read: true, write: true, delete: false, export: false, ownDataOnly: false },
      }
      expect(canPerformAction(seller, "cash", "write", matrix)).toBe(true)
    })

    it("un override que NIEGA cash.write a un CONTABLE lo bloquea (matrix gana al default)", () => {
      const contable = { role: "CONTABLE", id: "c-1" }
      expect(canPerformAction(contable, "cash", "write")).toBe(true)
      const matrix: ResolvedPermissionsMatrix = {
        ...buildDefaultMatrix("CONTABLE"),
        cash: { read: true, write: false, delete: false, export: false, ownDataOnly: false },
      }
      expect(canPerformAction(contable, "cash", "write", matrix)).toBe(false)
    })
  })

  // ─── Cargar operaciones a nombre de otro vendedor (flag por usuario) ──
  describe("canCreateOperationsForOtherSellers", () => {
    it("SELLER con el flag en true → true", () => {
      const user = { role: "SELLER", id: "s-1", can_create_operations_for_other_sellers: true }
      expect(canCreateOperationsForOtherSellers(user)).toBe(true)
    })

    it("SELLER sin el flag (false/undefined) → false", () => {
      expect(
        canCreateOperationsForOtherSellers({ role: "SELLER", id: "s-1", can_create_operations_for_other_sellers: false })
      ).toBe(false)
      expect(canCreateOperationsForOtherSellers({ role: "SELLER", id: "s-1" })).toBe(false)
    })

    it("un rol no-SELLER no aplica a este flag (los demás roles se habilitan por otra vía)", () => {
      const admin = { role: "ADMIN", id: "a-1", can_create_operations_for_other_sellers: true }
      expect(canCreateOperationsForOtherSellers(admin)).toBe(false)
    })
  })

  // ─── Vendedor secundario (VIB-105): NO depende del flag de arriba ─────
  describe("canAssignSecondarySeller", () => {
    it("SELLER común sin permisos especiales → true (venta compartida es su comisión, no la propiedad de la op)", () => {
      expect(canAssignSecondarySeller({ role: "SELLER", id: "s-1" })).toBe(true)
      expect(
        canAssignSecondarySeller({
          role: "SELLER",
          id: "s-1",
          can_create_operations_for_other_sellers: false,
        })
      ).toBe(true)
    })

    it("los demás roles también pueden", () => {
      expect(canAssignSecondarySeller({ role: "ADMIN", id: "a-1" })).toBe(true)
      expect(canAssignSecondarySeller({ role: "SUPER_ADMIN", id: "sa-1" })).toBe(true)
    })

    it("asesor independiente → false (es externo, no comparte comisión con el equipo)", () => {
      expect(
        canAssignSecondarySeller({ role: "SELLER", id: "s-1", is_independent_advisor: true })
      ).toBe(false)
    })
  })

  describe("canRegisterPaymentsOnAgencyOperations", () => {
    it("SELLER con el flag en true → true", () => {
      const user = { role: "SELLER", id: "s-1", can_register_payments_on_agency_operations: true }
      expect(canRegisterPaymentsOnAgencyOperations(user)).toBe(true)
    })

    it("SELLER sin el flag (false/undefined) → false", () => {
      expect(
        canRegisterPaymentsOnAgencyOperations({ role: "SELLER", id: "s-1", can_register_payments_on_agency_operations: false })
      ).toBe(false)
      expect(canRegisterPaymentsOnAgencyOperations({ role: "SELLER", id: "s-1" })).toBe(false)
    })

    it("un rol no-SELLER no aplica a este flag (los demás roles operan caja por otra vía)", () => {
      const admin = { role: "ADMIN", id: "a-1", can_register_payments_on_agency_operations: true }
      expect(canRegisterPaymentsOnAgencyOperations(admin)).toBe(false)
    })
  })

  describe("resolveOperationAccessScope — agency-payments", () => {
    const agencyIds = ["agency-1", "agency-2"]

    it("SELLER propietario → 'own' aunque tenga el flag de cobros", () => {
      const user = { role: "SELLER", id: "s-1", can_register_payments_on_agency_operations: true }
      const op = { agency_id: "agency-1", seller_id: "s-1" }
      expect(resolveOperationAccessScope(user, op, agencyIds)).toBe("own")
    })

    it("SELLER con flag de cobros sobre operación ajena de su agencia → 'agency-payments'", () => {
      const user = { role: "SELLER", id: "s-1", can_register_payments_on_agency_operations: true }
      const op = { agency_id: "agency-1", seller_id: "s-OTRO" }
      expect(resolveOperationAccessScope(user, op, agencyIds)).toBe("agency-payments")
    })

    it("SELLER sin ningún flag sobre operación ajena → null (no accede)", () => {
      const user = { role: "SELLER", id: "s-1" }
      const op = { agency_id: "agency-1", seller_id: "s-OTRO" }
      expect(resolveOperationAccessScope(user, op, agencyIds)).toBeNull()
    })

    it("SELLER con flag de cobros sobre operación de OTRA agencia → null", () => {
      const user = { role: "SELLER", id: "s-1", can_register_payments_on_agency_operations: true }
      const op = { agency_id: "agency-9", seller_id: "s-OTRO" }
      expect(resolveOperationAccessScope(user, op, agencyIds)).toBeNull()
    })

    it("postventa tiene prioridad como scope primario si el vendedor tiene ambos flags", () => {
      const user = {
        role: "SELLER",
        id: "s-1",
        can_view_agency_operations_support: true,
        can_register_payments_on_agency_operations: true,
      }
      const op = { agency_id: "agency-1", seller_id: "s-OTRO" }
      expect(resolveOperationAccessScope(user, op, agencyIds)).toBe("agency-support")
    })
  })

  describe("isAgencyReadonlyScope", () => {
    it("agency-support y agency-payments son solo lectura de datos de la op", () => {
      expect(isAgencyReadonlyScope("agency-support")).toBe(true)
      expect(isAgencyReadonlyScope("agency-payments")).toBe(true)
    })
    it("own y full pueden escribir datos de la op", () => {
      expect(isAgencyReadonlyScope("own")).toBe(false)
      expect(isAgencyReadonlyScope("full")).toBe(false)
    })
  })

  describe("isSellerWithinUserAgencies", () => {
    // Mock del builder de Supabase: from().select().eq().in().limit() → { data }
    const makeSupabase = (rows: any[]) =>
      ({
        from: () => ({
          select: () => ({
            eq: () => ({
              in: () => ({
                limit: () => Promise.resolve({ data: rows }),
              }),
            }),
          }),
        }),
      }) as any

    it("true cuando el vendedor destino comparte alguna agencia", async () => {
      const supabase = makeSupabase([{ agency_id: "agency-1" }])
      await expect(isSellerWithinUserAgencies(supabase, "seller-2", ["agency-1", "agency-2"])).resolves.toBe(true)
    })

    it("false cuando el vendedor destino no está en ninguna de las agencias", async () => {
      const supabase = makeSupabase([])
      await expect(isSellerWithinUserAgencies(supabase, "seller-2", ["agency-1"])).resolves.toBe(false)
    })

    it("false (sin consultar) cuando no hay agencias del usuario", async () => {
      const supabase = makeSupabase([{ agency_id: "agency-1" }])
      await expect(isSellerWithinUserAgencies(supabase, "seller-2", [])).resolves.toBe(false)
    })

    it("false cuando falta el id del vendedor destino", async () => {
      const supabase = makeSupabase([{ agency_id: "agency-1" }])
      await expect(isSellerWithinUserAgencies(supabase, "", ["agency-1"])).resolves.toBe(false)
    })
  })
})
