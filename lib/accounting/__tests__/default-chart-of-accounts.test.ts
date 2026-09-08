/**
 * El plan de cuentas default es la plantilla con la que arranca toda org nueva.
 *
 * Antes se clonaba de una organización real (`lozada-viajes`) y por eso "estaba
 * bien" por construcción: el motor contable y el plan eran el mismo dato. Ahora
 * la plantilla vive en el código, así que hace falta un test que la ate a los
 * códigos que el motor busca. Sin esto, agregar una cuenta a `ACCOUNT_CODES` y
 * olvidarse de la plantilla deja a las agencias nuevas sin esa cuenta, y el
 * asiento que la necesita se saltea en silencio.
 */
import { ACCOUNT_CODES, isDebitNaturalAccount } from "../account-codes"
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  DEFAULT_CHART_ACCOUNT_COUNT,
} from "../default-chart-of-accounts"

describe("DEFAULT_CHART_OF_ACCOUNTS", () => {
  const codigos = new Set(DEFAULT_CHART_OF_ACCOUNTS.map((c) => c.code))

  it("no tiene códigos repetidos", () => {
    expect(codigos.size).toBe(DEFAULT_CHART_ACCOUNT_COUNT)
  })

  it("incluye todos los códigos que el motor contable busca por código", () => {
    const faltantes = Object.entries(ACCOUNT_CODES)
      .filter(([, code]) => !codigos.has(code))
      .map(([nombre, code]) => `${nombre} (${code})`)

    expect(faltantes).toEqual([])
  })

  it("cada subcuenta cuelga de un rubro que existe en la plantilla", () => {
    const huerfanas = DEFAULT_CHART_OF_ACCOUNTS.filter(
      (c) => c.parentCode !== null && !codigos.has(c.parentCode)
    ).map((c) => c.code)

    expect(huerfanas).toEqual([])
  })

  it("los rubros son de nivel 1 sin padre y no reciben movimientos", () => {
    for (const cuenta of DEFAULT_CHART_OF_ACCOUNTS) {
      if (cuenta.level === 1) {
        expect({ code: cuenta.code, parent: cuenta.parentCode, mov: cuenta.isMovement }).toEqual({
          code: cuenta.code,
          parent: null,
          mov: false,
        })
      } else {
        // Una subcuenta suelta no aparece en ningún reporte jerárquico.
        expect(cuenta.parentCode).not.toBeNull()
      }
    }
  })

  it("el código de cada subcuenta empieza con el de su rubro", () => {
    // Los reportes agrupan por prefijo (`account_code.startsWith("4.1")` en
    // financial-statements), así que colgar 4.3.05 de 4.1 rompería el balance
    // sin que ninguna FK se queje.
    const inconsistentes = DEFAULT_CHART_OF_ACCOUNTS.filter(
      (c) => c.parentCode !== null && !c.code.startsWith(`${c.parentCode}.`)
    ).map((c) => `${c.code} -> ${c.parentCode}`)

    expect(inconsistentes).toEqual([])
  })

  it("cada cuenta hereda la categoría y subcategoría de su rubro", () => {
    const porCodigo = new Map(DEFAULT_CHART_OF_ACCOUNTS.map((c) => [c.code, c]))

    for (const cuenta of DEFAULT_CHART_OF_ACCOUNTS) {
      if (!cuenta.parentCode) continue
      const padre = porCodigo.get(cuenta.parentCode)!
      expect(`${cuenta.code}:${cuenta.category}`).toBe(`${cuenta.code}:${padre.category}`)
      if (padre.subcategory !== null) {
        expect(`${cuenta.code}:${cuenta.subcategory}`).toBe(`${cuenta.code}:${padre.subcategory}`)
      }
    }
  })

  it("las cuentas de ACTIVO, COSTOS y GASTOS son de Debe natural y las demás no", () => {
    // El signo del saldo sale de acá: una cuenta con la categoría equivocada
    // muestra el saldo invertido en el mayor y en el balance.
    const debeNatural = DEFAULT_CHART_OF_ACCOUNTS.filter((c) =>
      isDebitNaturalAccount(c.category, c.subcategory)
    ).map((c) => c.code)

    expect(debeNatural).toContain(ACCOUNT_CODES.CAJA)
    expect(debeNatural).toContain(ACCOUNT_CODES.CUENTAS_POR_COBRAR)
    expect(debeNatural).toContain(ACCOUNT_CODES.COSTO_OPERADORES)
    expect(debeNatural).toContain(ACCOUNT_CODES.COMISIONES_VENDEDORES)

    expect(debeNatural).not.toContain(ACCOUNT_CODES.CUENTAS_POR_PAGAR)
    expect(debeNatural).not.toContain(ACCOUNT_CODES.VENTAS)
    expect(debeNatural).not.toContain(ACCOUNT_CODES.CAPITAL_SOCIAL)
  })

  it("las cuentas de orden van de a pares deudora/acreedora", () => {
    // Si una quedara sin contrapartida, el compromiso no se cancela y ensucia
    // el pie del balance.
    const deudoras = DEFAULT_CHART_OF_ACCOUNTS.filter(
      (c) => c.subcategory === "DEUDORAS" && c.level === 2
    )
    const acreedoras = DEFAULT_CHART_OF_ACCOUNTS.filter(
      (c) => c.subcategory === "ACREEDORAS" && c.level === 2
    )

    expect(deudoras.length).toBe(acreedoras.length)
    expect(codigos.has(ACCOUNT_CODES.ORDEN_VENTAS_SIN_FACTURAR_CONTRA)).toBe(true)
    expect(codigos.has(ACCOUNT_CODES.ORDEN_FACTURAS_A_RECIBIR_CONTRA)).toBe(true)
  })

  it("no menciona a ninguna agencia concreta", () => {
    // La plantilla es genérica: si vuelve a aparecer el nombre de un tenant es
    // que alguien copió cuentas de una agencia real.
    const texto = JSON.stringify(DEFAULT_CHART_OF_ACCOUNTS).toLowerCase()
    expect(texto).not.toContain("lozada")
  })
})
