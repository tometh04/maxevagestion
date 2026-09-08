/**
 * Cuántas plazas de un paquete consume una operación (VIB-183).
 *
 * Decisión de producto: el cupo se mide en PLAZAS, no en reservas. Una venta de
 * 4 pasajeros sobre un paquete de 10 deja 6 libres.
 *
 * Vive en una función propia y no inline en la ruta por dos razones. La primera
 * es que se usa en dos lugares que tienen que coincidir sí o sí (el alta toma el
 * cupo, el PATCH lo revalida al cambiar los pasajeros); si divergen, el
 * consumido queda mal. La segunda es el supuesto de abajo.
 *
 * SUPUESTO A CONFIRMAR: los infantes cuentan como plaza. Es lo correcto para un
 * cupo hotelero o de paquete armado, y discutible para un charter donde el bebé
 * va en falda. Si la agencia dice que no ocupan, se saca `infants` de la suma
 * acá y no hay que tocar nada más.
 */

export interface OperationPax {
  adults?: number | string | null
  children?: number | string | null
  infants?: number | string | null
}

function toCount(value: number | string | null | undefined): number {
  const parsed = Number(value)
  // Un negativo o un NaN no puede restar plazas.
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

export function computeOperationSeats(pax: OperationPax): number {
  const total = toCount(pax.adults) + toCount(pax.children) + toCount(pax.infants)
  // Una operación sin pasajeros cargados igual ocupa un lugar del paquete: si
  // devolviera 0, la RPC rechazaría la venta (seats > 0) y el alta quedaría
  // bloqueada por un campo que ni siquiera es obligatorio en todas las agencias.
  return total > 0 ? total : 1
}
