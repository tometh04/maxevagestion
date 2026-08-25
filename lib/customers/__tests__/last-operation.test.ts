/**
 * @jest-environment node
 *
 * VIB-153 — cartera de clientes por vendedor para recontacto.
 *
 * La decisión de producto que fija este helper: el vendedor de un cliente es el
 * de su ÚLTIMA operación. Con el criterio alternativo ("todos los que alguna vez
 * le vendieron") el mismo pasajero le aparecería a dos vendedores y recibiría
 * dos llamados de la misma agencia ofreciéndole lo mismo.
 */

import { resolveLastOperation } from "../last-operation"

function op(operation_date: string | null, extra: Record<string, any> = {}) {
  return {
    operations: {
      operation_date,
      destination: "Cancún",
      seller_id: "s1",
      sellers: { id: "s1", name: "Micaela" },
      ...extra,
    },
  }
}

describe("resolveLastOperation", () => {
  it("devuelve null si el cliente no tiene operaciones", () => {
    expect(resolveLastOperation([])).toBeNull()
    expect(resolveLastOperation(null)).toBeNull()
    expect(resolveLastOperation(undefined)).toBeNull()
  })

  it("elige la operación más reciente, sin importar el orden en que vengan", () => {
    const result = resolveLastOperation([
      op("2026-01-15", { destination: "Bariloche", sellers: { name: "Ana" }, seller_id: "sA" }),
      op("2026-08-20", { destination: "Cancún", sellers: { name: "Beto" }, seller_id: "sB" }),
      op("2026-04-02", { destination: "Madrid", sellers: { name: "Caro" }, seller_id: "sC" }),
    ])

    expect(result?.date).toBe("2026-08-20")
    expect(result?.destination).toBe("Cancún")
    expect(result?.seller_name).toBe("Beto")
    expect(result?.seller_id).toBe("sB")
  })

  it("un cliente con dos vendedores queda con el de la venta más reciente", () => {
    // El caso que motivó la decisión: sin esto aparecería en la cartera de los dos.
    const result = resolveLastOperation([
      op("2024-03-01", { seller_id: "vendedor-viejo", sellers: { name: "Vendedor Viejo" } }),
      op("2026-07-10", { seller_id: "vendedor-actual", sellers: { name: "Vendedor Actual" } }),
    ])

    expect(result?.seller_id).toBe("vendedor-actual")
  })

  it("descarta las operaciones sin fecha en vez de tratarlas como las más viejas", () => {
    const result = resolveLastOperation([
      op(null, { seller_id: "sin-fecha", sellers: { name: "Sin Fecha" } }),
      op("2026-05-05", { seller_id: "con-fecha", sellers: { name: "Con Fecha" } }),
    ])

    expect(result?.seller_id).toBe("con-fecha")
  })

  it("devuelve null si ninguna operación tiene fecha", () => {
    expect(resolveLastOperation([op(null), op(null)])).toBeNull()
  })

  it("tolera filas rotas sin romper el listado", () => {
    const result = resolveLastOperation([
      { operations: null },
      {} as any,
      op("2026-06-01"),
    ])

    expect(result?.date).toBe("2026-06-01")
  })

  it("deja en null el vendedor y el destino cuando no vienen", () => {
    const result = resolveLastOperation([
      op("2026-06-01", { destination: null, seller_id: null, sellers: null }),
    ])

    expect(result?.date).toBe("2026-06-01")
    expect(result?.destination).toBeNull()
    expect(result?.seller_id).toBeNull()
    expect(result?.seller_name).toBeNull()
  })

  it("compara fechas como texto, que para columnas DATE ordena igual que cronológicamente", () => {
    // Diciembre vs enero: un orden ingenuo por número de mes se equivocaría.
    const result = resolveLastOperation([op("2026-12-31"), op("2027-01-01")])

    expect(result?.date).toBe("2027-01-01")
  })
})
