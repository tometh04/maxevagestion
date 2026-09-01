/**
 * Diferencia de cambio — VIB-141 (D).
 *
 * Estos tests están escritos con casos que un contador puede leer y verificar a
 * mano, con números redondos y el razonamiento explícito. Es a propósito: si
 * alguien discute un resultado, tiene que poder señalar exactamente qué test
 * está mal.
 */
import {
  calcularDiferenciaPorCobro,
  calcularRevaluacion,
  CUENTAS_DIFERENCIA,
} from "../fx-difference"

describe("calcularDiferenciaPorCobro — libros en PESOS, venta en dólares", () => {
  // El caso clásico: la agencia lleva sus libros en pesos y tiene una cuenta
  // por cobrar en dólares. Cada cobro la cancela a un tipo distinto.
  const base = {
    monedaDeuda: "USD" as const,
    monedaFuncional: "ARS" as const,
    cotizacionReconocimiento: 1500,
  }

  it("si el peso se devaluó, hay ganancia", () => {
    // Se cobran ARS 800.000 a 1600 → cancela USD 500 de deuda.
    // Esa deuda estaba en libros a 1500 → ARS 750.000.
    // Entraron 800.000 por algo que valía 750.000: ganancia de 50.000.
    const r = calcularDiferenciaPorCobro({
      ...base,
      montoCobrado: 800_000,
      monedaCobro: "ARS",
      cotizacionCobro: 1600,
    })
    expect(r).toEqual({ monto: 50_000, tipo: "FX_GAIN" })
  })

  it("si el peso se apreció, hay pérdida", () => {
    // Se cobran ARS 700.000 a 1400 → cancela USD 500, que estaba a 1500
    // (ARS 750.000). Entraron 700.000 por algo que valía 750.000.
    const r = calcularDiferenciaPorCobro({
      ...base,
      montoCobrado: 700_000,
      monedaCobro: "ARS",
      cotizacionCobro: 1400,
    })
    expect(r).toEqual({ monto: 50_000, tipo: "FX_LOSS" })
  })

  it("si cobra al mismo tipo del reconocimiento, no hay diferencia", () => {
    const r = calcularDiferenciaPorCobro({
      ...base,
      montoCobrado: 750_000,
      monedaCobro: "ARS",
      cotizacionCobro: 1500,
    })
    expect(r).toEqual({ monto: 0, tipo: null })
  })

  it("reconoce en cada cobro, no al cancelarse la deuda", () => {
    // Dos cobros parciales de una misma deuda, a tipos distintos. Cada uno
    // genera su propia diferencia, en su propio mes.
    const primero = calcularDiferenciaPorCobro({
      ...base,
      montoCobrado: 800_000,
      monedaCobro: "ARS",
      cotizacionCobro: 1600,
    })
    const segundo = calcularDiferenciaPorCobro({
      ...base,
      montoCobrado: 700_000,
      monedaCobro: "ARS",
      cotizacionCobro: 1400,
    })
    expect(primero.tipo).toBe("FX_GAIN")
    expect(segundo.tipo).toBe("FX_LOSS")
  })

  it("cobrar dólares por una deuda en dólares TAMBIÉN genera diferencia", () => {
    // Este caso es contraintuitivo y por eso está acá. Con los libros en pesos,
    // la cuenta por cobrar quedó congelada a 1500 (ARS 750.000 por USD 500).
    // Cuando entran esos USD 500, valen ARS 800.000 al tipo de hoy. La deuda se
    // cancela por 750.000 y entró un activo de 800.000: la diferencia de 50.000
    // es resultado financiero.
    //
    // Que no haya conversión en el cobro no significa que no haya diferencia:
    // la diferencia nace de que la deuda estaba valuada a otro tipo de cambio.
    const r = calcularDiferenciaPorCobro({
      ...base,
      montoCobrado: 500,
      monedaCobro: "USD",
      cotizacionCobro: 1600,
    })
    expect(r).toEqual({ monto: 50_000, tipo: "FX_GAIN" })
  })
})

describe("calcularDiferenciaPorCobro — libros en DÓLARES", () => {
  // El caso de Lozada. La deuda ya está en la moneda funcional, así que
  // cobrarla NO genera diferencia: los pesos que entran cancelan deuda por su
  // equivalente. La exposición pasa al saldo en pesos, y eso lo resuelve la
  // revaluación.
  it("cobrar en pesos una deuda en dólares no genera diferencia", () => {
    const r = calcularDiferenciaPorCobro({
      montoCobrado: 800_000,
      monedaCobro: "ARS",
      cotizacionCobro: 1600,
      monedaDeuda: "USD",
      monedaFuncional: "USD",
      cotizacionReconocimiento: 1500,
    })
    expect(r).toEqual({ monto: 0, tipo: null })
  })
})

describe("calcularDiferenciaPorCobro — casos que no se registran", () => {
  const base = {
    monedaCobro: "ARS" as const,
    monedaDeuda: "USD" as const,
    monedaFuncional: "ARS" as const,
    cotizacionCobro: 1600,
    cotizacionReconocimiento: 1500,
  }

  it("un cobro en cero", () => {
    expect(calcularDiferenciaPorCobro({ ...base, montoCobrado: 0 }).tipo).toBeNull()
  })

  it("una cotización inválida no inventa un resultado", () => {
    // Preferimos no registrar antes que registrar mal.
    expect(
      calcularDiferenciaPorCobro({ ...base, montoCobrado: 1000, cotizacionCobro: 0 }).tipo
    ).toBeNull()
    expect(
      calcularDiferenciaPorCobro({ ...base, montoCobrado: 1000, cotizacionReconocimiento: 0 }).tipo
    ).toBeNull()
  })

  it("una diferencia menor a un centavo es ruido de redondeo", () => {
    const r = calcularDiferenciaPorCobro({
      ...base,
      montoCobrado: 1600,
      cotizacionCobro: 1600,
      cotizacionReconocimiento: 1599.995,
    })
    expect(r.tipo).toBeNull()
  })
})

describe("calcularRevaluacion — saldos en otra moneda al cierre", () => {
  // El caso de Lozada: libros en dólares, plata en pesos.
  const base = {
    monedaSaldo: "ARS" as const,
    monedaFuncional: "USD" as const,
  }

  it("si el peso se apreció, los pesos valen más dólares: ganancia", () => {
    // ARS 1.520.000 valuados a 1600 son USD 950. Al cierre a 1520 valen
    // USD 1.000. Ganancia de USD 50.
    const r = calcularRevaluacion({
      ...base,
      saldo: 1_520_000,
      cotizacionAnterior: 1600,
      cotizacionCierre: 1520,
    })
    expect(r).toEqual({ monto: 50, tipo: "FX_GAIN" })
  })

  it("si el peso se devaluó, los pesos valen menos dólares: pérdida", () => {
    // ARS 1.520.000 valuados a 1520 son USD 1.000. Al cierre a 1600 valen
    // USD 950. Pérdida de USD 50.
    const r = calcularRevaluacion({
      ...base,
      saldo: 1_520_000,
      cotizacionAnterior: 1520,
      cotizacionCierre: 1600,
    })
    expect(r).toEqual({ monto: 50, tipo: "FX_LOSS" })
  })

  it("un saldo que ya está en la moneda funcional no se revalúa", () => {
    // Es lo que pidió el cliente: "los saldos en usd los mantenemos".
    const r = calcularRevaluacion({
      saldo: 1000,
      monedaSaldo: "USD",
      monedaFuncional: "USD",
      cotizacionAnterior: 1520,
      cotizacionCierre: 1600,
    })
    expect(r).toEqual({ monto: 0, tipo: null })
  })

  it("un saldo en cero no genera diferencia", () => {
    expect(
      calcularRevaluacion({ ...base, saldo: 0, cotizacionAnterior: 1520, cotizacionCierre: 1600 })
        .tipo
    ).toBeNull()
  })

  it("un saldo negativo también se revalúa, con el signo invertido", () => {
    // Una cuenta en descubierto es un pasivo en pesos: si el peso se aprecia,
    // deber pesos cuesta más dólares.
    const r = calcularRevaluacion({
      ...base,
      saldo: -1_520_000,
      cotizacionAnterior: 1600,
      cotizacionCierre: 1520,
    })
    expect(r).toEqual({ monto: 50, tipo: "FX_LOSS" })
  })

  it("sin cotización de cierre no revalúa nada", () => {
    expect(
      calcularRevaluacion({ ...base, saldo: 1000, cotizacionAnterior: 1520, cotizacionCierre: 0 })
        .tipo
    ).toBeNull()
  })
})

describe("cuentas del plan", () => {
  it("cada tipo va a su cuenta de resultado", () => {
    expect(CUENTAS_DIFERENCIA.FX_GAIN).toBe("4.1.05")
    expect(CUENTAS_DIFERENCIA.FX_LOSS).toBe("4.3.13")
  })
})
