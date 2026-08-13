/**
 * @jest-environment node
 *
 * Tests de la banda de marca del kit de reportes.
 *
 * Regresión concreta: cuando `brand_logo` no se podía embeber (una URL, un SVG,
 * un base64 corrupto), la portada quedaba con una tarjeta blanca huérfana y el
 * nombre de la agencia dibujado por debajo, medio tapado. La tarjeta se pintaba
 * ANTES de intentar la imagen y nunca se limpiaba.
 */

import { ReportPdfBuilder, type ReportPdfCompany } from "@/lib/pdf/report-kit"

/** PNG 1x1 transparente, válido y embebible. */
const VALID_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

function company(logo: string): ReportPdfCompany {
  return {
    name: "Lozada Viajes SRL",
    address: "Córdoba 1234, Rosario",
    phone: "+54 341 555-5555",
    email: "hola@lozada.com",
    website: "lozada.com",
    taxId: "30-71234567-9",
    logo,
  }
}

function renderCover(logo: string): string {
  const b = new ReportPdfBuilder({
    company: company(logo),
    generatedAt: new Date("2026-07-27T12:00:00Z"),
    title: "REPORTE DE CAJA",
    subtitle: "Al 27/07/2026",
    meta: "Tramos: 7 · 15 · 30 días",
    continuationLine: "Reporte de caja",
  })
  b.coverBand()
  // jsPDF no comprime por defecto: el texto viaja legible en el stream.
  return Buffer.from(b.finish()).toString("latin1")
}

/** El nombre se dibuja carácter a carácter; alcanza con buscar un fragmento. */
function hasCompanyName(pdf: string): boolean {
  return pdf.includes("LOZADA VIAJES SRL")
}

/**
 * La tarjeta blanca del logo es el único `roundedRect` de la portada, y es lo
 * único que emite curvas Bézier (operador `c`): la banda y el pie son
 * rectángulos y líneas rectas. Buscar el blanco no alcanza, porque jsPDF usa
 * el mismo "1. g" para el texto blanco del encabezado.
 *
 * El test "logo válido" hace de contraprueba: si este detector dejara de
 * detectar, ese caso fallaría en vez de dejar pasar a los demás por vacío.
 */
function hasWhiteLogoCard(pdf: string): boolean {
  return /\d\s+c\s/.test(pdf)
}

describe("ReportPdfBuilder.coverBand", () => {
  it("sin logo: dibuja el nombre y no deja tarjeta blanca", () => {
    const pdf = renderCover("")
    expect(hasCompanyName(pdf)).toBe(true)
    expect(hasWhiteLogoCard(pdf)).toBe(false)
  })

  it("logo por URL: no intenta embeberlo y cae al nombre, sin mancha blanca", () => {
    const pdf = renderCover("https://cdn.lozada.com/logo.png")
    expect(hasCompanyName(pdf)).toBe(true)
    expect(hasWhiteLogoCard(pdf)).toBe(false)
  })

  it("logo SVG: no es embebible, cae al nombre sin mancha blanca", () => {
    const pdf = renderCover("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")
    expect(hasCompanyName(pdf)).toBe(true)
    expect(hasWhiteLogoCard(pdf)).toBe(false)
  })

  it("base64 corrupto: cae al nombre sin mancha blanca", () => {
    const pdf = renderCover("data:image/png;base64,esto-no-es-una-imagen")
    expect(hasCompanyName(pdf)).toBe(true)
    expect(hasWhiteLogoCard(pdf)).toBe(false)
  })

  it("logo válido: lo embebe sobre la tarjeta blanca y no repite el nombre", () => {
    const pdf = renderCover(VALID_PNG)
    expect(pdf).toContain("/Image")
    expect(hasCompanyName(pdf)).toBe(false)
    // Contraprueba: acá la tarjeta SÍ tiene que estar. Si este assert fallara,
    // el detector no sirve y los tests de arriba estarían pasando por vacío.
    expect(hasWhiteLogoCard(pdf)).toBe(true)
  })

  it("el pie sigue mostrando el nombre aunque la banda use el logo", () => {
    // El nombre nunca se pierde del documento: vive en el pie de cada página.
    const b = new ReportPdfBuilder({
      company: company(VALID_PNG),
      generatedAt: new Date("2026-07-27T12:00:00Z"),
      title: "REPORTE",
      continuationLine: "Reporte",
    })
    b.coverBand()
    const pdf = Buffer.from(b.finish()).toString("latin1")
    expect(pdf).toContain("Lozada Viajes SRL")
  })
})
