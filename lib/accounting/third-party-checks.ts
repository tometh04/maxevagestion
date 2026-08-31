/**
 * Cheques de terceros: ciclo de vida y arqueo de cartera.
 *
 * Logica pura, sin base de datos, para que las reglas que importan se puedan
 * probar solas. Los efectos contables de cada transicion los escribe la API
 * reusando el ledger que ya existe; aca vive el "que se puede hacer y que no".
 *
 * La idea de fondo: un cheque recibido no es plata, es una promesa de plata.
 * Vive en la cuenta 1.1.09 Valores a Depositar hasta que se convierte en dinero
 * (deposito), se usa para pagar sin pasar por caja (endoso) o se cae (rechazo).
 */

export type EstadoCheque = "EN_CARTERA" | "DEPOSITADO" | "RECHAZADO" | "ENDOSADO"

export const ESTADOS_CHEQUE: EstadoCheque[] = [
  "EN_CARTERA",
  "DEPOSITADO",
  "RECHAZADO",
  "ENDOSADO",
]

export const ETIQUETA_ESTADO: Record<EstadoCheque, string> = {
  EN_CARTERA: "En cartera",
  DEPOSITADO: "Depositado",
  RECHAZADO: "Rechazado",
  ENDOSADO: "Endosado",
}

/**
 * Que transiciones son legitimas.
 *
 * El caso que se olvida siempre es **DEPOSITADO → RECHAZADO**: lo normal no es
 * que un cheque rebote en la mano, es que rebote DESPUES de depositarlo, cuando
 * el banco lo devuelve dias mas tarde. Un modelo que solo permita rechazar
 * desde cartera obliga a la agencia a mentirle al sistema.
 *
 * ENDOSADO no tiene salida en esta entrega, y es una limitacion consciente: si
 * un cheque endosado a un operador rebota, hay que reponer la deuda con ese
 * operador Y la del cliente, o sea dos reversiones encadenadas con reglas
 * propias. Se prefiere bloquearlo con un mensaje que lo explique antes que
 * generar un asiento a medias en el modulo mas delicado del sistema.
 */
export const TRANSICIONES: Record<EstadoCheque, EstadoCheque[]> = {
  EN_CARTERA: ["DEPOSITADO", "RECHAZADO", "ENDOSADO"],
  DEPOSITADO: ["RECHAZADO"],
  ENDOSADO: [],
  RECHAZADO: [],
}

export interface ResultadoTransicion {
  ok: boolean
  motivo?: string
}

export function puedeTransicionar(desde: EstadoCheque, hacia: EstadoCheque): ResultadoTransicion {
  if (desde === hacia) {
    return { ok: false, motivo: `El cheque ya figura como ${ETIQUETA_ESTADO[hacia].toLowerCase()}.` }
  }

  if (TRANSICIONES[desde]?.includes(hacia)) return { ok: true }

  if (desde === "RECHAZADO") {
    return {
      ok: false,
      motivo:
        "Un cheque rechazado no vuelve atras. Si el librador lo reemplazo, cargá el cheque nuevo: es otro papel.",
    }
  }

  if (desde === "ENDOSADO") {
    return {
      ok: false,
      motivo:
        "El cheque ya se entregó a un operador. Para revertirlo hay que reponer la deuda con ese operador y la del cliente, y eso todavía no se puede hacer solo desde acá.",
    }
  }

  return {
    ok: false,
    motivo: `No se puede pasar de ${ETIQUETA_ESTADO[desde].toLowerCase()} a ${ETIQUETA_ESTADO[hacia].toLowerCase()}.`,
  }
}

// ============================================================
// Alta
// ============================================================

export interface DatosCheque {
  numero?: string | null
  banco?: string | null
  importe?: number | null
  moneda?: string | null
  fecha_cobro?: string | null
  fecha_emision?: string | null
}

/**
 * Que datos hacen falta para que el cheque sirva de algo.
 *
 * El criterio no es "completar el formulario": es que el registro alcance para
 * reclamarle a alguien. Sin numero y banco no se identifica el papel; sin fecha
 * de cobro no se sabe cuando es exigible, que es justamente lo que distingue un
 * cheque de un billete.
 */
export function validarCheque(datos: DatosCheque): string[] {
  const errores: string[] = []

  if (!datos.numero?.trim()) errores.push("Falta el número del cheque.")
  if (!datos.banco?.trim()) errores.push("Falta el banco.")

  const importe = Number(datos.importe)
  if (!Number.isFinite(importe) || importe <= 0) {
    errores.push("El importe tiene que ser mayor a cero.")
  }

  if (datos.moneda && !["ARS", "USD"].includes(datos.moneda)) {
    errores.push("La moneda tiene que ser ARS o USD.")
  }

  if (!datos.fecha_cobro) {
    errores.push("Falta la fecha de cobro.")
  } else if (datos.fecha_emision && datos.fecha_emision > datos.fecha_cobro) {
    errores.push("La fecha de cobro no puede ser anterior a la de emisión.")
  }

  return errores
}

// ============================================================
// Cartera
// ============================================================

export interface ChequeEnCartera {
  id: string
  importe: number
  moneda: string
  fecha_cobro: string
  estado: EstadoCheque
}

export interface TotalPorMoneda {
  moneda: string
  cantidad: number
  importe: number
}

/**
 * Cuanto hay en cartera, por moneda.
 *
 * Nunca se suman monedas distintas. Un cheque en dolares y uno en pesos no
 * hacen un total: convertirlos exigiria una cotizacion que en este momento
 * nadie definio, y un numero inventado en un arqueo es peor que dos numeros
 * separados. Mismo criterio que el resto del modulo contable.
 */
export function totalesPorMoneda(cheques: ChequeEnCartera[]): TotalPorMoneda[] {
  const acc = new Map<string, TotalPorMoneda>()

  for (const c of cheques) {
    const actual = acc.get(c.moneda) ?? { moneda: c.moneda, cantidad: 0, importe: 0 }
    actual.cantidad += 1
    actual.importe += Number(c.importe) || 0
    acc.set(c.moneda, actual)
  }

  return Array.from(acc.values()).sort((a, b) => a.moneda.localeCompare(b.moneda))
}

export type Vencimiento = "VENCIDO" | "AL_DIA" | "A_VENCER"

/**
 * Un cheque "vencido" en esta cartera es uno cuya fecha de cobro ya paso y que
 * sigue sin depositarse. No es un problema contable —el importe es el mismo—
 * pero es plata que la agencia podria tener y no tiene, y esa es la razon de
 * ser de la pantalla.
 */
export function clasificarVencimiento(fechaCobro: string, hoy: string): Vencimiento {
  if (fechaCobro < hoy) return "VENCIDO"
  if (fechaCobro === hoy) return "AL_DIA"
  return "A_VENCER"
}

// ============================================================
// Arqueo
// ============================================================

export interface Arqueo {
  saldoContable: number
  totalCheques: number
  diferencia: number
  cuadra: boolean
}

/** Un peso de diferencia es redondeo; mas que eso es un problema. */
export const TOLERANCIA_ARQUEO = 1

/**
 * Compara el saldo de la cuenta de cartera contra la suma de los cheques que
 * figuran en cartera.
 *
 * Tienen que dar igual: cada cheque entro al ledger contra esa cuenta y cada
 * transicion lo saco. Si difieren, hay un cheque cargado sin su movimiento o un
 * movimiento sin su cheque —por ejemplo, si se borro el pago que lo origino—.
 *
 * El arqueo existe porque esa diferencia es exactamente el tipo de cosa que en
 * este sistema se rompe en silencio. Verla es todo lo que hace falta para
 * arreglarla.
 */
export function arquearCartera(saldoContable: number, cheques: ChequeEnCartera[]): Arqueo {
  const totalCheques = cheques.reduce((s, c) => s + (Number(c.importe) || 0), 0)
  const diferencia = Number(saldoContable) - totalCheques

  return {
    saldoContable: Number(saldoContable) || 0,
    totalCheques,
    diferencia,
    cuadra: Math.abs(diferencia) <= TOLERANCIA_ARQUEO,
  }
}
