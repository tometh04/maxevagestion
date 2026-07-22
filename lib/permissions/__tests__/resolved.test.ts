import {
  assertPermission,
  checkResolvedPermission,
  checkOwnDataOnly,
  buildDefaultMatrix,
  getCustomizedModules,
  FULL_ACCESS_MATRIX,
  type ResolvedPermissionsMatrix,
} from "../resolved"

/**
 * Matriz de prueba: SELLER con overrides de agencia que difieren del default:
 * - operations: ownDataOnly OFF (quiere ver TODAS las operaciones)
 * - cash: write habilitado
 * - commissions: ownDataOnly ON
 */
function sellerOverrideMatrix(): ResolvedPermissionsMatrix {
  const base = buildDefaultMatrix("SELLER")
  return {
    ...base,
    operations: { read: true, write: true, delete: false, export: true, ownDataOnly: false },
    cash: { read: true, write: true, delete: false, export: false, ownDataOnly: false },
    commissions: { read: true, write: false, delete: false, export: true, ownDataOnly: true },
  }
}

describe("resolved matrix helpers", () => {
  describe("assertPermission", () => {
    it("SUPER_ADMIN y ORG_OWNER siempre pasan, incluso con matrix null", () => {
      expect(assertPermission("SUPER_ADMIN", null, "settings", "write")).toBe(true)
      expect(assertPermission("ORG_OWNER", null, "accounting", "delete")).toBe(true)
    })

    it("con matrix resuelta, respeta el override de agencia por encima del default estático", () => {
      const matrix = sellerOverrideMatrix()
      // El SELLER por default NO tiene cash.write; el override lo habilita.
      expect(assertPermission("SELLER", matrix, "cash", "write")).toBe(true)
      // operations.write habilitado por el override.
      expect(assertPermission("SELLER", matrix, "operations", "write")).toBe(true)
    })

    it("sin matrix (org_id null), cae al default estático del rol", () => {
      // VIEWER estático: read sí, write no.
      expect(assertPermission("VIEWER", null, "customers", "read")).toBe(true)
      expect(assertPermission("VIEWER", null, "customers", "write")).toBe(false)
    })

    it("un módulo denegado en la matrix devuelve false", () => {
      const matrix = buildDefaultMatrix("SELLER")
      // SELLER no accede a settings.write.
      expect(assertPermission("SELLER", matrix, "settings", "write")).toBe(false)
    })
  })

  describe("checkResolvedPermission", () => {
    it("lee el flag exacto del módulo", () => {
      const matrix = sellerOverrideMatrix()
      expect(checkResolvedPermission(matrix, "cash", "write")).toBe(true)
      expect(checkResolvedPermission(matrix, "cash", "delete")).toBe(false)
    })

    it("módulo inexistente → false (no rompe)", () => {
      expect(checkResolvedPermission(FULL_ACCESS_MATRIX, "no-such-module", "read")).toBe(false)
    })
  })

  describe("checkOwnDataOnly", () => {
    it("refleja el override de ownDataOnly de la agencia", () => {
      const matrix = sellerOverrideMatrix()
      // operations: override lo apagó → ve todas.
      expect(checkOwnDataOnly(matrix, "operations")).toBe(false)
      // commissions: override lo prendió → solo propias.
      expect(checkOwnDataOnly(matrix, "commissions")).toBe(true)
    })
  })

  describe("getCustomizedModules", () => {
    it("detecta exactamente el módulo cuyo flag se cambió respecto del default", () => {
      // Partimos del default y flipeamos un único flag conocido → un solo módulo custom.
      const base = buildDefaultMatrix("SELLER")
      const matrix: ResolvedPermissionsMatrix = {
        ...base,
        cash: { ...base.cash, write: !base.cash.write },
      }
      expect(getCustomizedModules(matrix, "SELLER")).toEqual(["cash"])
    })

    it("detecta múltiples módulos alterados", () => {
      const base = buildDefaultMatrix("SELLER")
      const matrix: ResolvedPermissionsMatrix = {
        ...base,
        cash: { ...base.cash, write: !base.cash.write },
        operations: { ...base.operations, ownDataOnly: !base.operations.ownDataOnly },
      }
      expect(getCustomizedModules(matrix, "SELLER").sort()).toEqual(["cash", "operations"])
    })

    it("una matriz idéntica al default no reporta customizaciones", () => {
      const matrix = buildDefaultMatrix("CONTABLE")
      expect(getCustomizedModules(matrix, "CONTABLE")).toEqual([])
    })
  })
})
