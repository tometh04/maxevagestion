import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { freezeQuotationDocumentAssets } from "@/lib/quotation-documents/assets-server"

describe("quotation document asset snapshots", () => {
  let fixtureRoot: string
  const originalHosts = process.env.QUOTATION_DOCUMENT_ASSET_HOSTS
  const originalFetch = (global as typeof globalThis & { fetch?: typeof fetch }).fetch

  beforeEach(async () => {
    fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "quotation-assets-"))
    await mkdir(path.join(fixtureRoot, "quotation-models"), { recursive: true })
    await writeFile(path.join(fixtureRoot, "quotation-models", "background.png"), Buffer.from([1, 2, 3, 4]))
    delete (process.env as Record<string, string | undefined>).QUOTATION_DOCUMENT_ASSET_HOSTS
  })

  afterEach(async () => {
    if (originalHosts === undefined) {
      delete (process.env as Record<string, string | undefined>).QUOTATION_DOCUMENT_ASSET_HOSTS
    }
    else process.env.QUOTATION_DOCUMENT_ASSET_HOSTS = originalHosts
    jest.restoreAllMocks()
    if (originalFetch) global.fetch = originalFetch
    else Reflect.deleteProperty(global, "fetch")
    await rm(fixtureRoot, { recursive: true, force: true })
  })

  it("embeds an internal asset once and replaces every occurrence", async () => {
    const source = "/quotation-models/background.png?quotation-page=1"
    const html = `<img src="${source}"><div style="background-image:url(&quot;${source}&quot;)"></div>`

    const frozen = await freezeQuotationDocumentAssets(html, { publicDir: fixtureRoot })

    expect(frozen.frozenAssetCount).toBe(1)
    expect(frozen.omittedRemoteAssetCount).toBe(0)
    expect(frozen.html).not.toContain(source)
    expect((frozen.html.match(/data:image\/png;base64,/g) || [])).toHaveLength(2)
    expect(frozen.frozenSources[source]).toMatch(/^data:image\/png;base64,/)
  })

  it("freezes an additional chrome logo even when it is outside the HTML", async () => {
    const source = "/quotation-models/background.png"
    const frozen = await freezeQuotationDocumentAssets("<p>Documento</p>", {
      publicDir: fixtureRoot,
      additionalSources: [source],
    })

    expect(frozen.frozenAssetCount).toBe(1)
    expect(frozen.frozenSources[source]).toMatch(/^data:image\/png;base64,/)
  })

  it("never fetches an unapproved remote host", async () => {
    const fetchSpy = jest.fn()
    global.fetch = fetchSpy as unknown as typeof fetch
    const frozen = await freezeQuotationDocumentAssets('<img src="https://untrusted.example/photo.jpg">', {
      publicDir: fixtureRoot,
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(frozen.omittedRemoteAssetCount).toBe(1)
    expect(frozen.html).toContain("data:image/gif;base64")
  })

  it("fails issuance when an explicitly approved asset cannot be frozen", async () => {
    process.env.QUOTATION_DOCUMENT_ASSET_HOSTS = "images.example.com"
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
    }) as unknown as typeof fetch

    await expect(freezeQuotationDocumentAssets(
      '<img src="https://images.example.com/photo.jpg">',
      { publicDir: fixtureRoot }
    )).rejects.toThrow("No se pudo congelar el asset aprobado")
  })
})
