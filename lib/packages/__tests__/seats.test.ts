import { computeOperationSeats } from "../seats"

/**
 * El cupo de un paquete se mide en plazas, y esta función es la única que decide
 * cuántas ocupa una venta. La usan el alta (para tomar) y la edición (para
 * revalidar): si divergieran, el consumido del paquete quedaría mal.
 */
describe("computeOperationSeats", () => {
  it("suma adultos, menores e infantes", () => {
    expect(computeOperationSeats({ adults: 2, children: 1, infants: 1 })).toBe(4)
  })

  it("los infantes ocupan plaza", () => {
    // Supuesto explícito de VIB-183: correcto para cupo hotelero o de paquete
    // armado. Si la agencia dice que el bebé en falda no ocupa, se cambia acá y
    // este test es el que tiene que fallar primero.
    expect(computeOperationSeats({ adults: 1, infants: 1 })).toBe(2)
  })

  it("una operación sin pasajeros cargados ocupa una plaza", () => {
    // Devolver 0 haría que la RPC rechace la venta (seats > 0) y bloquearía el
    // alta por un campo que no es obligatorio en todas las agencias.
    expect(computeOperationSeats({})).toBe(1)
    expect(computeOperationSeats({ adults: 0, children: 0, infants: 0 })).toBe(1)
    expect(computeOperationSeats({ adults: null, children: undefined })).toBe(1)
  })

  it("acepta números que llegan como texto desde el formulario", () => {
    expect(computeOperationSeats({ adults: "3", children: "2" })).toBe(5)
  })

  it("ignora basura y negativos en vez de restar plazas", () => {
    expect(computeOperationSeats({ adults: 2, children: -5 })).toBe(2)
    expect(computeOperationSeats({ adults: 2, children: "abc" as any })).toBe(2)
  })

  it("trunca decimales: no existe media plaza", () => {
    expect(computeOperationSeats({ adults: 2.7 })).toBe(2)
  })
})
