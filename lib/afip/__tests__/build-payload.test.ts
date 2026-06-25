// Mock del SDK de AFIP: el constructor de AfipService instancia el SDK,
// no queremos red ni credenciales reales en el test.
jest.mock("@afipsdk/afip.js", () => {
  return jest.fn().mockImplementation(() => ({
    ElectronicBilling: {},
  }))
})

// exchange-rates usa react.cache() (no disponible fuera del runtime de Next).
jest.mock("@/lib/accounting/exchange-rates", () => ({
  getExchangeRateWithFallback: jest.fn(),
}))

import { AfipService } from "../afip-service"

function makeService() {
  const config: any = { cuit: "20304018101", environment: "homologacion", api_key: "test" }
  return new AfipService(config, {} as any, "org-1")
}

// buildAfipPayload es privado; lo accedemos vía cast para testear la lógica.
function buildPayload(draft: any) {
  const svc = makeService() as any
  return svc.buildAfipPayload(draft)
}

const baseFactura = {
  cbte_tipo: 6,
  pto_vta: 5,
  concepto: 1,
  receptor_doc_tipo: 99,
  receptor_doc_nro: "0",
  fecha_emision: "2026-06-23",
  imp_total: 1938.09,
  imp_neto: 1888.09,
  imp_iva: 50,
  receptor_condicion_iva: 5,
  moneda: "DOL",
  cotizacion: 1461.5,
  invoice_items: [],
}

describe("buildAfipPayload — CbtesAsoc", () => {
  it("NO incluye CbtesAsoc para una factura normal", () => {
    const payload = buildPayload(baseFactura)
    expect(payload.CbtesAsoc).toBeUndefined()
    expect(payload.CbteTipo).toBe(6)
  })

  it("incluye CbtesAsoc para una NC B (tipo 8)", () => {
    const payload = buildPayload({
      ...baseFactura,
      cbte_tipo: 8,
      cbte_asoc_tipo: 6,
      cbte_asoc_pto_vta: 5,
      cbte_asoc_nro: 1341,
      cbte_asoc_fch: "20260623",
    })
    expect(payload.CbtesAsoc).toEqual([
      { Tipo: 6, PtoVta: 5, Nro: 1341, CbteFch: 20260623 },
    ])
  })

  it("incluye Cuit en CbtesAsoc cuando se provee", () => {
    const payload = buildPayload({
      ...baseFactura,
      cbte_tipo: 8,
      cbte_asoc_tipo: 6,
      cbte_asoc_pto_vta: 5,
      cbte_asoc_nro: 1341,
      cbte_asoc_cuit: "20304018101",
    })
    expect(payload.CbtesAsoc[0].Cuit).toBe(20304018101)
  })

  it("NO incluye CbtesAsoc si es NC pero faltan los datos del asociado", () => {
    const payload = buildPayload({ ...baseFactura, cbte_tipo: 8 })
    expect(payload.CbtesAsoc).toBeUndefined()
  })
})
