/**
 * Asiento de apertura — VIB-141.
 *
 * POR QUÉ HACE FALTA
 * ------------------
 * Una agencia que empieza a llevar contabilidad el 1° de septiembre no nació ese
 * día. Ya tenía plata en caja, clientes que le debían y operadores a los que les
 * debía. Sin registrar ese punto de partida, el balance de septiembre muestra
 * los cobros del mes pero no el saldo desde el que se cobró, y no cierra.
 *
 * El asiento de apertura retrata ese punto de partida: los saldos al día
 * ANTERIOR a la fecha de inicio.
 *
 * DE DÓNDE SALEN LOS NÚMEROS
 * --------------------------
 * De lo operativo, no de una carga manual. vibook ya sabe cuánta plata hay en
 * cada cuenta, cuánto deben los clientes y cuánto se les debe a los operadores.
 * Pedirle esos números a la agencia sería pedirle que transcriba lo que el
 * sistema ya tiene, con la posibilidad de equivocarse en el camino.
 *
 * LA CONTRAPARTIDA: RESULTADOS ACUMULADOS
 * ---------------------------------------
 * Los saldos por sí solos no balancean, y no tienen por qué: la diferencia entre
 * lo que la agencia tiene y lo que debe es lo que ganó antes de empezar a llevar
 * contabilidad formal. Eso es Resultados Acumulados: no es capital aportado ni
 * un ajuste de plug, es historia del negocio.
 *
 * Que la diferencia se llame por su nombre importa. Un asiento de apertura que
 * la escondiera en "otros" dejaría al contador sin saber de dónde salió el
 * patrimonio con el que arranca.
 *
 * UN ASIENTO POR MONEDA
 * ---------------------
 * Un asiento tiene una sola moneda. Una agencia con caja en pesos y en dólares
 * necesita dos asientos de apertura, cada uno balanceado en lo suyo y con su
 * propia línea de Resultados Acumulados. Mezclarlas exigiría valuar al tipo de
 * cambio del día de apertura y convertiría el asiento en una opinión.
 */
import { ACCOUNT_CODES } from "./account-codes"

const UMBRAL = 0.01
const redondear = (n: number) => Math.round(n * 100) / 100

/**
 * Un saldo de apertura, con el signo indicando de qué lado va.
 *
 * Positivo = saldo deudor (plata en caja, clientes que deben, anticipos a
 * proveedores). Negativo = saldo acreedor (deuda con operadores, anticipos
 * cobrados a clientes).
 *
 * Se pide firmado en vez de deducir el lado por el tipo de cuenta porque una
 * cuenta puede quedar del lado contrario al natural, y eso es información real:
 * una cuenta bancaria en descubierto tiene saldo acreedor.
 */
export interface SaldoDeApertura {
  /** Código del plan de cuentas. */
  codigo: string
  /** Firmado: positivo va al Debe, negativo al Haber. */
  monto: number
  /** Qué representa, para que el asiento se pueda leer sin adivinar. */
  detalle: string
}

export interface LineaDeApertura {
  codigo: string
  debe: number
  haber: number
  detalle: string
}

export interface AsientoDeApertura {
  currency: string
  lineas: LineaDeApertura[]
  /**
   * La diferencia que absorbió Resultados Acumulados. Positiva si la agencia
   * arranca con patrimonio, negativa si arranca con pérdidas acumuladas.
   */
  resultadosAcumulados: number
  totalDebe: number
  totalHaber: number
}

/**
 * Arma el asiento de apertura de una moneda.
 *
 * Devuelve `null` si no hay ningún saldo: una agencia que arranca de cero no
 * necesita apertura, y generar un asiento vacío solo ensuciaría el libro.
 */
export function armarAsientoDeApertura(
  saldos: SaldoDeApertura[],
  currency: string
): AsientoDeApertura | null {
  const lineas: LineaDeApertura[] = []

  for (const s of saldos) {
    const monto = redondear(Number(s.monto) || 0)
    // Un saldo en cero no se registra: no aporta información y alarga el
    // asiento con renglones que el contador tiene que descartar a ojo.
    if (Math.abs(monto) < UMBRAL) continue

    lineas.push({
      codigo: s.codigo,
      debe: monto > 0 ? monto : 0,
      haber: monto < 0 ? Math.abs(monto) : 0,
      detalle: s.detalle,
    })
  }

  if (lineas.length === 0) return null

  const debeParcial = redondear(lineas.reduce((t, l) => t + l.debe, 0))
  const haberParcial = redondear(lineas.reduce((t, l) => t + l.haber, 0))
  const diferencia = redondear(debeParcial - haberParcial)

  // La contrapartida. Si el Debe pesa más, la agencia arranca con patrimonio y
  // Resultados Acumulados va al Haber; si pesa más el Haber, arranca con
  // pérdidas acumuladas y va al Debe.
  if (Math.abs(diferencia) >= UMBRAL) {
    lineas.push({
      codigo: ACCOUNT_CODES.RESULTADOS_ACUMULADOS,
      debe: diferencia < 0 ? Math.abs(diferencia) : 0,
      haber: diferencia > 0 ? diferencia : 0,
      detalle: "Resultado acumulado al inicio de la contabilidad",
    })
  }

  const totalDebe = redondear(lineas.reduce((t, l) => t + l.debe, 0))
  const totalHaber = redondear(lineas.reduce((t, l) => t + l.haber, 0))

  return {
    currency,
    lineas,
    resultadosAcumulados: diferencia,
    totalDebe,
    totalHaber,
  }
}

/**
 * Los saldos operativos de una agencia a una fecha, ya separados por moneda.
 *
 * Lo arma el recolector; se declara acá para que la forma del dato viva junto a
 * la regla que lo consume.
 */
export interface SaldosOperativos {
  /** Saldo de cada cuenta financiera, mapeado a su cuenta del plan. */
  cuentasFinancieras: Array<{ codigo: string; nombre: string; saldo: number }>
  /** Lo que los clientes le deben a la agencia. */
  cuentasPorCobrar: number
  /** Lo que los clientes pagaron de más. */
  anticiposDeClientes: number
  /** Lo que la agencia les debe a los operadores. */
  cuentasPorPagar: number
  /** Lo que la agencia les pagó de más a los operadores. */
  anticiposAProveedores: number
}

/**
 * Traduce los saldos operativos a saldos firmados, listos para el asiento.
 *
 * Es donde se decide de qué lado va cada cosa, y por eso está separado del
 * armado: es la parte que un contador querría revisar.
 */
export function saldosDesdeOperativo(s: SaldosOperativos): SaldoDeApertura[] {
  const saldos: SaldoDeApertura[] = []

  for (const c of s.cuentasFinancieras) {
    // Firmado tal cual viene: una cuenta en descubierto tiene saldo acreedor y
    // el asiento tiene que decirlo, no esconderlo.
    saldos.push({ codigo: c.codigo, monto: c.saldo, detalle: `Saldo inicial — ${c.nombre}` })
  }

  saldos.push({
    codigo: ACCOUNT_CODES.CUENTAS_POR_COBRAR,
    monto: Math.abs(s.cuentasPorCobrar),
    detalle: "Deuda de clientes al inicio",
  })
  saldos.push({
    codigo: ACCOUNT_CODES.ANTICIPOS_PROVEEDORES,
    monto: Math.abs(s.anticiposAProveedores),
    detalle: "Anticipos a operadores al inicio",
  })
  saldos.push({
    codigo: ACCOUNT_CODES.CUENTAS_POR_PAGAR,
    monto: -Math.abs(s.cuentasPorPagar),
    detalle: "Deuda con operadores al inicio",
  })
  saldos.push({
    codigo: ACCOUNT_CODES.ANTICIPOS_CLIENTES,
    monto: -Math.abs(s.anticiposDeClientes),
    detalle: "Anticipos cobrados a clientes al inicio",
  })

  return saldos
}
