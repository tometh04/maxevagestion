import { freezeQuotationDocumentAssets } from "@/lib/quotation-documents/assets-server"
import { waitForQuotationDocumentFonts } from "@/lib/quotation-documents/fonts-client"
import {
  baseDocumentStyle,
  OPEN_SANS_FONT_ASSET_PATH,
} from "@/lib/quotation-documents/html"
import { KYO_2026_MANIFEST } from "@/lib/quotation-documents/manifests"

describe("quotation document fonts", () => {
  it("embeds the local Open Sans weight range in the canonical snapshot", async () => {
    const html = `<style>${baseDocumentStyle(KYO_2026_MANIFEST)}</style>`

    expect(html).toContain("@font-face")
    expect(html).toContain("font-family:'Vibook Open Sans'")
    expect(html).toContain("font-weight:400 800")
    expect(html).toContain(OPEN_SANS_FONT_ASSET_PATH)
    expect(html).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/)

    const frozen = await freezeQuotationDocumentAssets(html)

    expect(frozen.frozenAssetCount).toBe(1)
    expect(frozen.html).toContain("data:font/woff2;base64,")
    expect(frozen.html).not.toContain(OPEN_SANS_FONT_ASSET_PATH)
  })

  it("forces layout before waiting for browser font readiness", async () => {
    let releaseFonts!: () => void
    const ready = new Promise<void>((resolve) => {
      releaseFonts = resolve
    })
    const renderRoot = { getBoundingClientRect: jest.fn() }
    let completed = false

    const waiting = waitForQuotationDocumentFonts({ fonts: { ready } }, renderRoot)
      .then(() => {
        completed = true
      })

    await Promise.resolve()
    expect(renderRoot.getBoundingClientRect).toHaveBeenCalledTimes(1)
    expect(completed).toBe(false)

    releaseFonts()
    await waiting
    expect(completed).toBe(true)
  })
})
