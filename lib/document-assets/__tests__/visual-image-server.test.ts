import { createCanvas } from "@napi-rs/canvas"
import {
  decodeVisualImageDataUri,
  materializeVisualImage,
  readResponseBytesWithLimit,
} from "@/lib/document-assets/visual-image-server"

const SAFE_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" fill="#0f766e"/></svg>'
)

function rasterFixture(mime: "image/jpeg" | "image/png" | "image/webp"): Buffer {
  const canvas = createCanvas(2, 1)
  canvas.getContext("2d").fillRect(0, 0, 2, 1)
  return mime === "image/png"
    ? canvas.toBuffer("image/png")
    : canvas.toBuffer(mime)
}

function rewriteIhdrCrc(bytes: Buffer): void {
  let crc = 0xffffffff
  for (let index = 12; index < 29; index += 1) {
    crc ^= bytes[index]
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
  }
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29)
}

describe("visual document asset materialization", () => {
  it.each([
    ["image/png" as const, "png" as const],
    ["image/jpeg" as const, "jpg" as const],
    ["image/webp" as const, "webp" as const],
  ])("preserves valid %s bytes", async (mime, extension) => {
    const bytes = rasterFixture(mime)
    const materialized = await materializeVisualImage({
      bytes,
      declaredMime: "image/svg+xml",
    })

    expect(materialized.mime).toBe(mime)
    expect(materialized.extension).toBe(extension)
    expect(materialized.bytes.equals(bytes)).toBe(true)
    expect(materialized.transformed).toBe(false)
  })

  it("treats declared MIME as advisory when the image bytes are valid", async () => {
    const bytes = rasterFixture("image/png")
    const materialized = await materializeVisualImage({
      bytes,
      declaredMime: "application/octet-stream",
    })

    expect(materialized.mime).toBe("image/png")
    expect(materialized.bytes.equals(bytes)).toBe(true)
  })

  it("rasterizes a safe SVG to a PNG with bounded dimensions", async () => {
    const materialized = await materializeVisualImage({ bytes: SAFE_SVG })

    expect(materialized.sourceMime).toBe("image/svg+xml")
    expect(materialized.mime).toBe("image/png")
    expect(materialized.dataUri).toMatch(/^data:image\/png;base64,iVBOR/)
    expect(materialized.width).toBe(120)
    expect(materialized.height).toBe(40)
    expect(materialized.transformed).toBe(true)
  })

  it("validates raster images embedded inside an SVG before decoding the SVG", async () => {
    const embedded = Buffer.from(rasterFixture("image/png"))
    embedded.writeUInt32BE(100_000, 16)
    embedded.writeUInt32BE(100_000, 20)
    rewriteIhdrCrc(embedded)
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><image href="data:image/png;base64,${embedded.toString("base64")}" /></svg>`
    )

    await expect(materializeVisualImage({ bytes: svg }))
      .rejects.toMatchObject({ code: "TOO_LARGE" })
  })

  it("preflights absolute SVG units and rejects oversized explicit dimensions", async () => {
    const absoluteUnits = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="1in"><rect width="100%" height="100%"/></svg>'
    )
    const materialized = await materializeVisualImage({ bytes: absoluteUnits })
    expect(materialized.mime).toBe("image/png")
    expect(materialized.width).toBeGreaterThan(0)
    expect(materialized.height).toBeGreaterThan(0)

    const oversized = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100000in" height="1in" viewBox="0 0 1 1"/>'
    )
    await expect(materializeVisualImage({ bytes: oversized }))
      .rejects.toMatchObject({ code: "TOO_LARGE" })
  })

  it("uses a bounded viewBox for SVGs with relative root dimensions", async () => {
    const percentages = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 120 40"/>'
    )
    const materialized = await materializeVisualImage({ bytes: percentages })
    expect(materialized.width).toBe(120)
    expect(materialized.height).toBe(40)

    const unbounded = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"/>'
    )
    await expect(materializeVisualImage({ bytes: unbounded }))
      .rejects.toMatchObject({ code: "INVALID_CONTENT" })
  })

  it("does not confuse similarly named SVG attributes with root dimensions", async () => {
    const misleading = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" stroke-width="1" viewBox="0 0 100000 100000"/>'
    )
    await expect(materializeVisualImage({ bytes: misleading }))
      .rejects.toMatchObject({ code: "TOO_LARGE" })
  })

  it("preflights the real SVG root instead of markup inside comments", async () => {
    const misleading = Buffer.from(
      '<!-- <svg width="1" height="1"> --><svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"/>'
    )
    await expect(materializeVisualImage({ bytes: misleading }))
      .rejects.toMatchObject({ code: "TOO_LARGE" })
  })

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/2000/svg"><x:script>alert(1)</x:script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject /></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/2000/svg"><x:foreignObject /></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" />',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png" /></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="\nhttps://example.com/a.png" /></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>.x{fill:url(\nhttps://example.com/a.svg)}</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@\\69mport "https://example.com/a.css"</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>.x{fill:u\\72l("https://example.com/a.svg")}</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="jav&#x61;script:alert(1)" /></svg>',
    '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" />',
  ])("rejects unsafe SVG content", async source => {
    await expect(materializeVisualImage({ bytes: Buffer.from(source) }))
      .rejects.toMatchObject({ code: "UNSAFE_SVG" })
  })

  it("rejects bytes that only claim to be a supported image", async () => {
    await expect(materializeVisualImage({
      bytes: Buffer.from("not-an-image"),
      declaredMime: "image/png",
    })).rejects.toMatchObject({ code: "INVALID_CONTENT" })
  })

  it("converts WebP when a PDF consumer requires PNG or JPEG", async () => {
    const materialized = await materializeVisualImage({
      bytes: rasterFixture("image/webp"),
      output: "pdf-embeddable",
    })

    expect(materialized.mime).toBe("image/png")
    expect(materialized.dataUri).toMatch(/^data:image\/png;base64,iVBOR/)
  })

  it("preserves a legacy raster without imposing new dimension limits", async () => {
    const canvas = createCanvas(9_000, 1)
    const bytes = canvas.toBuffer("image/png")

    await expect(materializeVisualImage({ bytes }))
      .rejects.toMatchObject({ code: "TOO_LARGE" })

    const compatible = await materializeVisualImage({
      bytes,
      validation: "legacy-raster",
    })
    expect(compatible.bytes.equals(bytes)).toBe(true)
    expect(compatible.transformed).toBe(false)
    expect(compatible.width).toBe(9_000)
    expect(compatible.height).toBe(1)
  })

  it("rejects raster signatures without valid image headers in compatibility mode", async () => {
    const truncatedPng = rasterFixture("image/png").subarray(0, 24)
    await expect(materializeVisualImage({
      bytes: truncatedPng,
      validation: "legacy-raster",
    })).rejects.toMatchObject({ code: "INVALID_CONTENT" })
  })

  it("rejects oversized raster dimensions before bitmap decoding", async () => {
    const oversizedPngHeader = Buffer.from(rasterFixture("image/png"))
    oversizedPngHeader.writeUInt32BE(100_000, 16)
    oversizedPngHeader.writeUInt32BE(100_000, 20)
    rewriteIhdrCrc(oversizedPngHeader)

    await expect(materializeVisualImage({ bytes: oversizedPngHeader }))
      .rejects.toMatchObject({ code: "TOO_LARGE" })
  })

  it("decodes legacy base64 data URIs for the same validation path", () => {
    const value = `data:image/svg+xml;base64,${SAFE_SVG.toString("base64")}`
    expect(decodeVisualImageDataUri(value)).toEqual({
      bytes: SAFE_SVG,
      declaredMime: "image/svg+xml",
    })
  })

  it("rejects oversized data URIs before allocating their decoded bytes", () => {
    const value = `data:image/png;base64,${Buffer.alloc(16).toString("base64")}`
    expect(decodeVisualImageDataUri(value, 4)).toBeNull()
  })

  it("stops streaming a remote response when it crosses the byte limit", async () => {
    const chunks = [new Uint8Array(6), new Uint8Array(6)]
    const response = {
      arrayBuffer: async () => new ArrayBuffer(0),
      body: {
        getReader: () => ({
          cancel: jest.fn().mockResolvedValue(undefined),
          read: jest.fn()
            .mockResolvedValueOnce({ done: false, value: chunks[0] })
            .mockResolvedValueOnce({ done: false, value: chunks[1] })
            .mockResolvedValue({ done: true, value: undefined }),
        }),
      },
      headers: { get: () => null },
    } as unknown as Pick<Response, "arrayBuffer" | "body" | "headers">
    await expect(readResponseBytesWithLimit(response, 8))
      .rejects.toMatchObject({ code: "TOO_LARGE" })
  })
})
