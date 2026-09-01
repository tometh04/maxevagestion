/**
 * Estado de Resultados y Balance — VIB-143 (E2).
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * La agencia vende en dólares y cobra en pesos, así que los libros mirados por
 * moneda no cierran: en Lozada 2026 daban ingresos por ARS 40 M contra gastos
 * por ARS 463 M, y ninguna de las dos columnas es real.
 *
 * Un estado contable se expresa en UNA moneda. Acá se convierte cada línea a la
 * moneda de presentación de la agencia usando la cotización del MES del
 * movimiento, que es el criterio que definió el cliente.
 *
 * LO QUE NO HACE, A PROPÓSITO
 * ---------------------------
 * Si falta la cotización de un mes, NO inventa un valor ni usa la de otro mes:
 * devuelve esas líneas en `sinCotizacion` para que la pantalla lo diga. Un
 * estado contable con un mes valuado a una cotización inventada es peor que uno
 * que avisa que le falta un dato.
 */

export type Moneda = "ARS" | "USD"

/** Una línea de asiento ya lista para convertir. */
export interface LineaContable {
  account_code: string
  account_name: string
  category: string
  currency: string
  debit: number
  credit: number
  /** Fecha del movimiento, para elegir la cotización del mes. */
  movement_date: string
  /**
   * Tipo de asiento de cierre, si la línea pertenece a uno.
   *
   * Lo necesita el Estado de Resultados para excluir la refundición. Ver
   * `esLineaDeRefundicion`.
   */
  close_kind?: string | null
}

/**
 * Si la línea pertenece al asiento que cancela las cuentas de resultado.
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * El asiento de refundición está fechado el último día del ejercicio, o sea
 * DENTRO del rango que el Estado de Resultados consulta. Como debita las
 * cuentas 4.1 y acredita las 4.2 y 4.3 por exactamente su saldo, incluirlo hace
 * que el estado de ese mismo año muestre todo en cero: el asiento que anula las
 * cuentas se suma a las cuentas que anula.
 *
 * Por eso el Estado de Resultados lo excluye y el Balance no. Así el estado del
 * ejercicio sigue mostrando lo que pasó ese año, y el balance muestra el
 * resultado ya absorbido en el patrimonio. Es lo que un contador espera de los
 * dos informes.
 *
 * El traslado a Resultados Acumulados no hace falta excluirlo —toca 3.1.04 y
 * 3.1.03, que no son cuentas de resultado— pero se filtra igual: si mañana
 * alguien cambia las cuentas del traslado, el estado no se rompe en silencio.
 */
export function esLineaDeCierreDeEjercicio(l: LineaContable): boolean {
  return l.close_kind === "REFUNDICION" || l.close_kind === "TRASLADO_RESULTADO"
}

/** Cotización mensual: clave "YYYY-MM" → pesos por dólar. */
export type Cotizaciones = Record<string, number>

export interface RenglonEstado {
  account_code: string
  account_name: string
  amount: number
}

export interface EstadoDeResultados {
  ingresos: RenglonEstado[]
  costos: RenglonEstado[]
  gastos: RenglonEstado[]
  totalIngresos: number
  totalCostos: number
  totalGastos: number
  resultado: number
  currency: Moneda
  /** Meses sin cotización cargada y cuántas líneas quedaron afuera. */
  sinCotizacion: Array<{ mes: string; lineas: number }>
}

export interface Balance {
  activo: RenglonEstado[]
  pasivo: RenglonEstado[]
  patrimonio: RenglonEstado[]
  totalActivo: number
  totalPasivo: number
  totalPatrimonio: number
  /**
   * Activo − (Pasivo + PN). En un balance completo es cero. Se expone en vez de
   * esconderlo: mientras la cobertura contable no sea total, no va a cerrar, y
   * taparlo sería mentir.
   */
  descuadre: number
  /**
   * Cuentas de orden (VIB-140). Van al PIE del balance, aparte del Activo, el
   * Pasivo y el Patrimonio: registran compromisos que no son ninguna de esas
   * tres cosas. Deudoras y acreedoras se cancelan entre sí.
   */
  orden: {
    deudoras: RenglonEstado[]
    acreedoras: RenglonEstado[]
    total: number
  }
  currency: Moneda
  sinCotizacion: Array<{ mes: string; lineas: number }>
}

const redondear = (n: number) => Math.round(n * 100) / 100

/** "YYYY-MM" de una fecha, que es la clave de la cotización mensual. */
export function mesDe(fecha: string): string {
  return String(fecha).slice(0, 7)
}

/**
 * Convierte un importe a la moneda de presentación.
 *
 * Devuelve null si hace falta una cotización y no está: el caller decide qué
 * hacer, y nunca es "poner cero".
 */
export function convertir(
  monto: number,
  desde: string,
  hacia: Moneda,
  cotizacion: number | undefined
): number | null {
  if (monto === 0) return 0
  if (desde === hacia) return monto
  if (!cotizacion || cotizacion <= 0) return null

  // La cotización siempre es pesos por dólar, en cualquier dirección.
  return hacia === "USD" ? monto / cotizacion : monto * cotizacion
}

/** Agrupa por cuenta, sumando y ordenando por código. */
function agrupar(
  acumulado: Map<string, RenglonEstado>
): RenglonEstado[] {
  return Array.from(acumulado.values())
    .map((r) => ({ ...r, amount: redondear(r.amount) }))
    .filter((r) => r.amount !== 0)
    .sort((a, b) => a.account_code.localeCompare(b.account_code))
}

/**
 * Recorre las líneas convirtiendo, y separa las que no se pudieron valuar.
 *
 * `signo` decide qué lado suma para cada grupo: en las cuentas de resultado
 * positivo (ingresos) suma el Haber; en costos y gastos, el Debe.
 */
function acumular(
  lineas: LineaContable[],
  cotizaciones: Cotizaciones,
  moneda: Moneda,
  incluir: (l: LineaContable) => boolean,
  signo: (l: LineaContable) => number
) {
  const porCuenta = new Map<string, RenglonEstado>()
  const faltantes = new Map<string, number>()

  for (const l of lineas) {
    if (!incluir(l)) continue

    const bruto = signo(l)
    if (bruto === 0) continue

    const mes = mesDe(l.movement_date)
    const convertido = convertir(bruto, l.currency, moneda, cotizaciones[mes])
    if (convertido === null) {
      faltantes.set(mes, (faltantes.get(mes) ?? 0) + 1)
      continue
    }

    const actual = porCuenta.get(l.account_code)
    if (actual) actual.amount += convertido
    else
      porCuenta.set(l.account_code, {
        account_code: l.account_code,
        account_name: l.account_name,
        amount: convertido,
      })
  }

  return {
    renglones: agrupar(porCuenta),
    faltantes: Array.from(faltantes.entries())
      .map(([mes, lineas]) => ({ mes, lineas }))
      .sort((a, b) => a.mes.localeCompare(b.mes)),
  }
}

function sumar(renglones: RenglonEstado[]): number {
  return redondear(renglones.reduce((acc, r) => acc + r.amount, 0))
}

/** Une los faltantes de varios grupos sin repetir el mes. */
function unirFaltantes(
  ...grupos: Array<Array<{ mes: string; lineas: number }>>
): Array<{ mes: string; lineas: number }> {
  const total = new Map<string, number>()
  for (const g of grupos) for (const f of g) total.set(f.mes, (total.get(f.mes) ?? 0) + f.lineas)
  return Array.from(total.entries())
    .map(([mes, lineas]) => ({ mes, lineas }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
}

export function armarEstadoDeResultados(
  todasLasLineas: LineaContable[],
  cotizaciones: Cotizaciones,
  moneda: Moneda
): EstadoDeResultados {
  // El asiento de cierre de ejercicio queda afuera. Está fechado dentro del
  // rango y cancela exactamente estas mismas cuentas, así que incluirlo haría
  // que el estado del año cerrado muestre todo en cero. Ver
  // `esLineaDeCierreDeEjercicio`.
  const lineas = todasLasLineas.filter((l) => !esLineaDeCierreDeEjercicio(l))

  // Ingresos (4.1.x): son de naturaleza acreedora, así que suma el Haber y
  // resta el Debe (una nota de crédito, por ejemplo).
  const ingresos = acumular(
    lineas,
    cotizaciones,
    moneda,
    (l) => l.account_code.startsWith("4.1"),
    (l) => l.credit - l.debit
  )
  // Costos (4.2.x) y gastos (4.3.x): naturaleza deudora.
  const costos = acumular(
    lineas,
    cotizaciones,
    moneda,
    (l) => l.account_code.startsWith("4.2"),
    (l) => l.debit - l.credit
  )
  const gastos = acumular(
    lineas,
    cotizaciones,
    moneda,
    (l) => l.account_code.startsWith("4.3"),
    (l) => l.debit - l.credit
  )

  const totalIngresos = sumar(ingresos.renglones)
  const totalCostos = sumar(costos.renglones)
  const totalGastos = sumar(gastos.renglones)

  return {
    ingresos: ingresos.renglones,
    costos: costos.renglones,
    gastos: gastos.renglones,
    totalIngresos,
    totalCostos,
    totalGastos,
    resultado: redondear(totalIngresos - totalCostos - totalGastos),
    currency: moneda,
    sinCotizacion: unirFaltantes(ingresos.faltantes, costos.faltantes, gastos.faltantes),
  }
}

export function armarBalance(
  lineas: LineaContable[],
  cotizaciones: Cotizaciones,
  moneda: Moneda
): Balance {
  // Activo: deudor. Pasivo y Patrimonio Neto: acreedores.
  const activo = acumular(
    lineas,
    cotizaciones,
    moneda,
    (l) => l.category === "ACTIVO",
    (l) => l.debit - l.credit
  )
  const pasivo = acumular(
    lineas,
    cotizaciones,
    moneda,
    (l) => l.category === "PASIVO",
    (l) => l.credit - l.debit
  )
  const patrimonio = acumular(
    lineas,
    cotizaciones,
    moneda,
    (l) => l.category === "PATRIMONIO_NETO",
    (l) => l.credit - l.debit
  )

  // Las de orden no entran en ninguno de los tres grupos de arriba porque su
  // categoría es ORDEN: quedan fuera por construcción, no por un filtro.
  const ordenDeudoras = acumular(
    lineas,
    cotizaciones,
    moneda,
    (l) => l.category === "ORDEN" && l.account_code.startsWith("5.1"),
    (l) => l.debit - l.credit
  )
  const ordenAcreedoras = acumular(
    lineas,
    cotizaciones,
    moneda,
    (l) => l.category === "ORDEN" && l.account_code.startsWith("5.2"),
    (l) => l.credit - l.debit
  )

  const totalActivo = sumar(activo.renglones)
  const totalPasivo = sumar(pasivo.renglones)
  const totalPatrimonio = sumar(patrimonio.renglones)

  return {
    activo: activo.renglones,
    pasivo: pasivo.renglones,
    patrimonio: patrimonio.renglones,
    totalActivo,
    totalPasivo,
    totalPatrimonio,
    descuadre: redondear(totalActivo - (totalPasivo + totalPatrimonio)),
    orden: {
      deudoras: ordenDeudoras.renglones,
      acreedoras: ordenAcreedoras.renglones,
      total: sumar(ordenDeudoras.renglones),
    },
    currency: moneda,
    sinCotizacion: unirFaltantes(
      activo.faltantes,
      pasivo.faltantes,
      patrimonio.faltantes,
      ordenDeudoras.faltantes,
      ordenAcreedoras.faltantes
    ),
  }
}
