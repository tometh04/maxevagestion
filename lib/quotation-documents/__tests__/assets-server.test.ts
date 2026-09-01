import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createCanvas } from "@napi-rs/canvas"
import { freezeQuotationDocumentAssets } from "@/lib/quotation-documents/assets-server"

describe("quotation document asset snapshots", () => {
  let fixtureRoot: string
  const originalHosts = process.env.QUOTATION_DOCUMENT_ASSET_HOSTS
  const originalFetch = (global as typeof globalThis & { fetch?: typeof fetch }).fetch

  beforeEach(async () => {
    fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "quotation-assets-"))
    await mkdir(path.join(fixtureRoot, "quotation-models"), { recursive: true })
    await writeFile(
      path.join(fixtureRoot, "quotation-models", "background.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      )
    )
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

  it("normalizes an approved SVG logo to a PDF-safe raster image", async () => {
    process.env.QUOTATION_DOCUMENT_ASSET_HOSTS = "images.example.com"
    const source = "https://images.example.com/tenant-logo.svg"
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#0f766e"/></svg>'
    )
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => name.toLowerCase() === "content-type"
          ? "image/svg+xml"
          : name.toLowerCase() === "content-length"
            ? String(svg.byteLength)
            : null,
      },
      arrayBuffer: async () => svg,
    }) as unknown as typeof fetch

    const frozen = await freezeQuotationDocumentAssets(`<img src="${source}">`, {
      publicDir: fixtureRoot,
    })

    expect(frozen.frozenAssetCount).toBe(1)
    expect(frozen.omittedRemoteAssetCount).toBe(0)
    expect(frozen.frozenSources[source]).toMatch(/^data:image\/png;base64,/)
    expect(frozen.html).not.toContain(source)
  })

  it("uses remote bytes as authority when legacy storage serves a generic MIME", async () => {
    process.env.QUOTATION_DOCUMENT_ASSET_HOSTS = "images.example.com"
    const source = "https://images.example.com/legacy-logo"
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    )
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => name.toLowerCase() === "content-type"
          ? "application/octet-stream"
          : name.toLowerCase() === "content-length"
            ? String(png.byteLength)
            : null,
      },
      arrayBuffer: async () => png,
    }) as unknown as typeof fetch

    const frozen = await freezeQuotationDocumentAssets(`<img src="${source}">`, {
      publicDir: fixtureRoot,
    })

    expect(frozen.frozenSources[source]).toBe(`data:image/png;base64,${png.toString("base64")}`)
  })

  it("normalizes legacy SVG data URIs instead of trusting them", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#0f766e"/></svg>'
    )
    const source = `data:image/svg+xml;base64,${svg.toString("base64")}`

    const frozen = await freezeQuotationDocumentAssets(`<img src="${source}">`, {
      publicDir: fixtureRoot,
    })

    expect(frozen.frozenSources[source]).toMatch(/^data:image\/png;base64,iVBOR/)
    expect(frozen.html).not.toContain("data:image/svg+xml")
  })

  it("rejects active content inside SVG data URIs", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><script>alert(1)</script></svg>'
    )
    const source = `data:image/svg+xml;base64,${svg.toString("base64")}`

    await expect(freezeQuotationDocumentAssets(`<img src="${source}">`, {
      publicDir: fixtureRoot,
    })).rejects.toThrow("SVG no seguro")
  })

  it("rejects a remote response whose bytes are not an image", async () => {
    process.env.QUOTATION_DOCUMENT_ASSET_HOSTS = "images.example.com"
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (name: string) => name.toLowerCase() === "content-type" ? "image/png" : null },
      arrayBuffer: async () => Buffer.from("not-an-image"),
    }) as unknown as typeof fetch

    await expect(freezeQuotationDocumentAssets(
      '<img src="https://images.example.com/not-an-image.png">',
      { publicDir: fixtureRoot }
    )).rejects.toThrow("contenido visual inválido")
  })

  it("preserves existing raster bytes without imposing new dimension limits", async () => {
    process.env.QUOTATION_DOCUMENT_ASSET_HOSTS = "images.example.com"
    const source = "https://images.example.com/legacy-wide.png"
    const canvas = createCanvas(9_000, 1)
    const png = canvas.toBuffer("image/png")
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => name.toLowerCase() === "content-type"
          ? "image/png"
          : name.toLowerCase() === "content-length"
            ? String(png.byteLength)
            : null,
      },
      arrayBuffer: async () => png,
    }) as unknown as typeof fetch

    const frozen = await freezeQuotationDocumentAssets(`<img src="${source}">`, {
      publicDir: fixtureRoot,
    })

    expect(frozen.frozenSources[source]).toBe(`data:image/png;base64,${png.toString("base64")}`)
  })
})
