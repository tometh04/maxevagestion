/**
 * Visual QA helper for quotation layouts.
 *
 * Usage:
 *   npx tsx scripts/render-quotation-model-fixture.ts <output.pdf> [kyo|standard|stress]
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright"
import {
  KYO_2026_MANIFEST,
  KYO_FULL_ITINERARY_FIXTURE,
  VIBOOK_STANDARD_MANIFEST,
  cloneQuotationJson,
  renderQuotationDocument,
} from "@/lib/quotation-documents"
import { freezeQuotationDocumentAssets } from "@/lib/quotation-documents/assets-server"

function createStressFixture() {
  const model = cloneQuotationJson(KYO_FULL_ITINERARY_FIXTURE)
  model.narrative.overview = `${"Descripción extensa del viaje y sus servicios, con información necesaria para el pasajero. ".repeat(34)} OVERVIEW_END`
  model.narrative.inclusions = Array.from({ length: 32 }, (_, index) => (
    `Servicio incluido ${index + 1}: ${"detalle operativo y comercial completo ".repeat(5)}`
  ))
  model.narrative.recommendations = Array.from({ length: 24 }, (_, index) => (
    `Recomendación ${index + 1}: ${"información importante para preparar el viaje ".repeat(5)}`
  ))
  model.commercial.terms = Array.from({ length: 28 }, (_, index) => (
    `Condición ${index + 1}: ${"aplica según disponibilidad, confirmación y condiciones del prestador ".repeat(5)}`
  ))
  model.commercial.paymentSchedule = Array.from({ length: 20 }, (_, index) => ({
    label: `Cuota ${index + 1}`,
    amount: 250 + index * 10,
    dueDate: `2026-${String((index % 12) + 1).padStart(2, "0")}-15`,
    notes: `${"Detalle de vencimiento y forma de acreditación. ".repeat(8)} PAYMENT_${index + 1}_END`,
  }))
  return model
}

async function main() {
  const outputPath = path.resolve(process.argv[2] || "tmp/pdfs/quotation-model-preview.pdf")
  const preset = process.argv[3] === "standard" ? "standard" : process.argv[3] === "stress" ? "stress" : "kyo"
  const manifest = preset === "standard" ? VIBOOK_STANDARD_MANIFEST : KYO_2026_MANIFEST
  const model = preset === "stress" ? createStressFixture() : KYO_FULL_ITINERARY_FIXTURE
  const document = renderQuotationDocument({ model, manifest })
  const frozen = await freezeQuotationDocumentAssets(document.html)
  const html = frozen.html

  const page = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style></head><body>${html}</body></html>`
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath.replace(/\.pdf$/i, ".html"), page, "utf8")

  const browser = await chromium.launch({ headless: true })
  try {
    const browserPage = await browser.newPage({ viewport: { width: 794, height: 1123 } })
    await browserPage.setContent(page, { waitUntil: "networkidle" })
    await browserPage.evaluate(async () => {
      await Promise.all(Array.from(document.images).map(image => image.decode().catch(() => undefined)))
      if (document.fonts?.ready) await document.fonts.ready
    })
    await browserPage.emulateMedia({ media: "print" })
    await browserPage.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
    })
  } finally {
    await browser.close()
  }

  console.log(JSON.stringify({
    outputPath,
    pageCount: document.pageCount,
    layout: document.layoutKey,
    omittedRemoteAssetCount: frozen.omittedRemoteAssetCount,
  }))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
