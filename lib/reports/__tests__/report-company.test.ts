/**
 * @jest-environment node
 *
 * Tests de la resolución del logo del tenant para los PDF de reportes.
 *
 * `organization_settings.brand_logo` guarda una URL pública de Supabase
 * Storage, no un data URI, y jsPDF no descarga nada. Sin esta conversión el
 * logo nunca aparecía en el PDF.
 */

import { toEmbeddableLogo } from "@/lib/reports/report-company"

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
)

function mockFetch(response: {
  ok?: boolean
  contentType?: string
  body?: Buffer
}): jest.Mock {
  const fn = jest.fn(async () => ({
    ok: response.ok ?? true,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === "content-type" ? (response.contentType ?? "image/png") : null,
    },
    arrayBuffer: async () => {
      const buf = response.body ?? PNG_BYTES
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    },
  }))
  ;(global as any).fetch = fn
  return fn
}

describe("toEmbeddableLogo", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    ;(global as any).fetch = originalFetch
    jest.restoreAllMocks()
  })

  it("baja la URL del logo y la devuelve como data URI", async () => {
    const fetchMock = mockFetch({ contentType: "image/png" })
    const result = await toEmbeddableLogo("https://cdn.supabase.co/logo.png")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.startsWith("data:image/png;base64,")).toBe(true)
    expect(result.length).toBeGreaterThan("data:image/png;base64,".length)
  })

  it("normaliza el content-type de JPEG", async () => {
    mockFetch({ contentType: "image/jpeg; charset=binary" })
    const result = await toEmbeddableLogo("https://cdn.supabase.co/logo.jpg")
    expect(result.startsWith("data:image/jpeg;base64,")).toBe(true)
  })

  it("deja pasar un data URI que ya sirve, sin bajar nada", async () => {
    const fetchMock = mockFetch({})
    const dataUri = `data:image/png;base64,${PNG_BYTES.toString("base64")}`
    expect(await toEmbeddableLogo(dataUri)).toBe(dataUri)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("descarta formatos que jsPDF no sabe dibujar", async () => {
    mockFetch({ contentType: "image/svg+xml" })
    expect(await toEmbeddableLogo("https://cdn.supabase.co/logo.svg")).toBe("")
    expect(await toEmbeddableLogo("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBe("")
  })

  it("descarta respuestas con error o vacías", async () => {
    mockFetch({ ok: false })
    expect(await toEmbeddableLogo("https://cdn.supabase.co/404.png")).toBe("")

    mockFetch({ body: Buffer.alloc(0) })
    expect(await toEmbeddableLogo("https://cdn.supabase.co/vacio.png")).toBe("")
  })

  it("descarta imágenes desproporcionadas", async () => {
    mockFetch({ body: Buffer.alloc(3_000_000, 1) })
    expect(await toEmbeddableLogo("https://cdn.supabase.co/enorme.png")).toBe("")
  })

  it("si la descarga falla, devuelve vacío en vez de romper el reporte", async () => {
    ;(global as any).fetch = jest.fn(async () => {
      throw new Error("ECONNREFUSED")
    })
    expect(await toEmbeddableLogo("https://cdn.supabase.co/logo.png")).toBe("")
  })

  it("ignora valores que no son ni URL ni data URI", async () => {
    expect(await toEmbeddableLogo("")).toBe("")
    expect(await toEmbeddableLogo("   ")).toBe("")
    expect(await toEmbeddableLogo("logo.png")).toBe("")
  })
})
