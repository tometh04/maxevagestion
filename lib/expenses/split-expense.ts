/**
 * División de un gasto de agencia entre oficinas.
 *
 * QUÉ RESUELVE
 * ------------
 * Un gasto compartido (la pauta de Facebook, el contador, un sistema) se paga
 * una sola vez pero le corresponde a más de una oficina. Hasta ahora la única
 * forma de repartirlo era cargarlo ya dividido: si entraba entero, no había
 * manera de corregirlo, porque el gasto no se puede editar de monto ni de
 * oficina. La salida era borrarlo y volver a cargarlo dos veces —- borrar un
 * egreso que realmente ocurrió.
 *
 * Medido en Lozada: Yamil ya venía haciendo el reparto a mano al cargar (dos
 * filas de USD 825,73 creadas con 100 ms de diferencia, 1.400/600, 646,80/277,20).
 * O sea que el reparto es la operación real; lo que faltaba era poder hacerlo
 * después.
 *
 * EL INVARIANTE
 * -------------
 * Dividir NO mueve plata: el egreso ya ocurrió, salió de la misma cuenta, el
 * mismo día, por el mismo importe. Lo único que cambia es a qué oficina se le
 * imputa. Por eso lo que se fija acá es que **la suma de las partes sea
 * exactamente igual al total**, al centavo. Si el reparto no cierra, no se
 * divide: un gasto que al partirse cambia de importe es plata inventada o
 * desaparecida.
 *
 * Todo se calcula en centavos enteros. Repartir en flotante y redondear cada
 * parte hace que 100 / 3 dé 33,33 × 3 = 99,99 y el gasto pierda un centavo.
 */

/** Una parte del reparto: cuánto le toca a qué oficina. */
export interface ParteDelGasto {
  agencyId: string
  amount: number
}

export type ResultadoValidacion = { ok: true } | { ok: false; error: string }

/** Pasa a centavos enteros para no arrastrar el error del punto flotante. */
function aCentavos(monto: number): number {
  return Math.round(monto * 100)
}

/**
 * Reparte un total en `partes` iguales, al centavo.
 *
 * El resto se le da a las primeras partes, de a un centavo, así la suma cierra
 * exacto: 100 en 3 da [33,34 / 33,33 / 33,33] y no [33,33 × 3].
 */
export function repartirEnPartesIguales(total: number, partes: number): number[] {
  if (!Number.isFinite(total) || total <= 0) return []
  if (!Number.isInteger(partes) || partes < 1) return []

  const totalCentavos = aCentavos(total)
  const base = Math.floor(totalCentavos / partes)
  const resto = totalCentavos - base * partes

  return Array.from({ length: partes }, (_, i) => (base + (i < resto ? 1 : 0)) / 100)
}

/**
 * ¿Este reparto se puede aplicar al gasto?
 *
 * Devuelve el mensaje que ve el usuario, no un código: el diálogo lo muestra
 * tal cual y la API lo devuelve en el 400.
 */
export function validarReparto(total: number, partes: ParteDelGasto[]): ResultadoValidacion {
  if (!Array.isArray(partes) || partes.length < 2) {
    return { ok: false, error: "Hay que repartir el gasto entre al menos dos oficinas" }
  }

  for (const parte of partes) {
    if (!parte.agencyId) {
      return { ok: false, error: "Falta elegir la oficina de una de las partes" }
    }
    if (!Number.isFinite(parte.amount) || aCentavos(parte.amount) <= 0) {
      return { ok: false, error: "Cada parte tiene que tener un importe mayor a 0" }
    }
  }

  const oficinas = new Set(partes.map((p) => p.agencyId))
  if (oficinas.size !== partes.length) {
    return { ok: false, error: "No se puede repartir dos veces a la misma oficina" }
  }

  const totalCentavos = aCentavos(total)
  const sumaCentavos = partes.reduce((acc, p) => acc + aCentavos(p.amount), 0)
  if (sumaCentavos !== totalCentavos) {
    const diferencia = (sumaCentavos - totalCentavos) / 100
    return {
      ok: false,
      error:
        diferencia > 0
          ? `Las partes suman ${diferencia.toFixed(2)} de más que el gasto`
          : `Faltan ${Math.abs(diferencia).toFixed(2)} para llegar al total del gasto`,
    }
  }

  return { ok: true }
}

/** Cuánto falta (o sobra) para que el reparto cierre. En positivo = falta. */
export function faltantePorRepartir(total: number, partes: ParteDelGasto[]): number {
  const asignado = partes.reduce(
    (acc, p) => acc + (Number.isFinite(p.amount) ? aCentavos(p.amount) : 0),
    0
  )
  return (aCentavos(total) - asignado) / 100
}
