/**
 * @jest-environment node
 */
import { buildAfipQrPayload, buildAfipQrUrl } from "@/lib/afip/qr"

describe("buildAfipQrPayload", () => {
  const baseInvoice = {
    fecha_emision: "2026-04-24",
    pto_vta: 1,
    cbte_tipo: 6,
    cbte_nro: 42,
    imp_total: 12100.5,
    moneda: "PES",
    cotizacion: 1,
    receptor_doc_tipo: 99,
    receptor_doc_nro: "0",
    cae: "12345678901234",
  }

  it("builds payload with all required RG 4291 fields", () => {
    const payload = buildAfipQrPayload(baseInvoice as any, "20123456789")
    expect(payload).toEqual({
      ver: 1,
      fecha: "2026-04-24",
      cuit: 20123456789,
      ptoVta: 1,
      tipoCmp: 6,
      nroCmp: 42,
      importe: 12100.5,
      moneda: "PES",
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      tipoCodAut: "E",
      codAut: 12345678901234,
    })
  })

  it("converts string CAE to number", () => {
    const payload = buildAfipQrPayload(baseInvoice as any, "20123456789")
    expect(typeof payload.codAut).toBe("number")
    expect(payload.codAut).toBe(12345678901234)
  })

  it("converts string doc nro to number", () => {
    const inv = { ...baseInvoice, receptor_doc_nro: "20999888777" }
    const payload = buildAfipQrPayload(inv as any, "20123456789")
    expect(payload.nroDocRec).toBe(20999888777)
  })

  it("handles USD currency", () => {
    const inv = { ...baseInvoice, moneda: "DOL", cotizacion: 1415 }
    const payload = buildAfipQrPayload(inv as any, "20123456789")
    expect(payload.moneda).toBe("DOL")
    expect(payload.ctz).toBe(1415)
  })
})

describe("buildAfipQrUrl", () => {
  it("encodes payload as base64 URL-safe and prepends AFIP URL", () => {
    const payload = {
      ver: 1 as const,
      fecha: "2026-04-24",
      cuit: 20123456789,
      ptoVta: 1,
      tipoCmp: 6,
      nroCmp: 42,
      importe: 12100.5,
      moneda: "PES",
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      tipoCodAut: "E" as const,
      codAut: 12345678901234,
    }
    const url = buildAfipQrUrl(payload)
    expect(url).toMatch(/^https:\/\/www\.afip\.gob\.ar\/fe\/qr\/\?p=/)
    const encoded = url.slice("https://www.afip.gob.ar/fe/qr/?p=".length)
    // base64 URL-safe: no +, no /, no = padding
    expect(encoded).not.toMatch(/[+/=]/)
    // Decodable back to the original payload
    const standard = encoded.replace(/-/g, "+").replace(/_/g, "/")
    const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4)
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf-8"))
    expect(decoded).toEqual(payload)
  })
})
