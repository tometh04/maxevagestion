// Synthetic browser benchmark: real html2canvas/jsPDF with an unrelated slow CRM image.
const { build } = require('esbuild')
const { chromium } = require('playwright')
const { PDFDocument } = require('pdf-lib')

async function main() {
  const bundle = await build({
    stdin: { contents: 'export { renderHtmlToPdfBlob } from "./lib/pdf/quote-pdf-designs"', resolveDir: process.cwd() },
    bundle: true, write: false, format: 'iife', globalName: 'quoteBenchmark', platform: 'browser',
  })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.route('https://pdf-benchmark.invalid/**', async route => {
      if (route.request().url().endsWith('/slow.svg')) {
        await new Promise(resolve => setTimeout(resolve, 3000))
        await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' })
      } else await route.fulfill({ contentType: 'text/html', body: '<html><body><main id="crm"></main></body></html>' })
    })
    await page.goto('https://pdf-benchmark.invalid/')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const result = await page.evaluate(async () => {
      document.querySelector('#crm').innerHTML = '<img src="/slow.svg">' + '<div>CRM unrelated row</div>'.repeat(3000)
      const start = performance.now()
      const blob = await quoteBenchmark.renderHtmlToPdfBlob('<html><head><style>body{margin:0;font-family:Arial} [data-pdf-page]{padding:40px;background:white}</style></head><body><div data-pdf-page><h1>Cotización de prueba</h1><p>USD 1.250 — dos pasajeros</p></div><div data-pdf-page><h1>Condiciones</h1><p>Segunda página</p></div></body></html>')
      return { milliseconds: Math.round(performance.now() - start), bytes: blob.size, remainingFrames: document.querySelectorAll('iframe').length, pdfBytes: Array.from(new Uint8Array(await blob.arrayBuffer())) }
    })
    const pdf = await PDFDocument.load(Uint8Array.from(result.pdfBytes))
    delete result.pdfBytes
    result.pages = pdf.getPageCount()
    console.log(JSON.stringify(result))
    if (result.pages !== 2) throw new Error('Expected two PDF pages')
    if (result.bytes < 1000 || result.remainingFrames !== 0) throw new Error('Invalid output or leaked iframe')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
