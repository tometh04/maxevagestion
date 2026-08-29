import { createCanvas, loadImage } from "@napi-rs/canvas"

const DEFAULT_MAX_INPUT_BYTES = 5 * 1024 * 1024
const DEFAULT_MAX_OUTPUT_BYTES = 5 * 1024 * 1024
const DEFAULT_MAX_DIMENSION = 8_192
const DEFAULT_MAX_PIXELS = 32_000_000

export const DOCUMENT_LOGO_MAX_SOURCE_BYTES = 2 * 1024 * 1024
export const DOCUMENT_LOGO_MAX_STORED_BYTES = 5 * 1024 * 1024

export type VisualImageMime =
  | "image/gif"
  | "image/jpeg"
  | "image/png"
  | "image/svg+xml"
  | "image/webp"

export type MaterializedVisualImageMime = Exclude<VisualImageMime, "image/svg+xml">

export class VisualImageError extends Error {
  constructor(
    public readonly code:
      | "INVALID_CONTENT"
      | "TOO_LARGE"
      | "UNSAFE_SVG"
      | "UNSUPPORTED_FORMAT",
    message: string,
    public readonly causeValue?: unknown
  ) {
    super(message)
    this.name = "VisualImageError"
  }
}

export interface MaterializedVisualImage {
  bytes: Buffer
  dataUri: string
  extension: "gif" | "jpg" | "png" | "webp"
  height: number
  mime: MaterializedVisualImageMime
  sourceMime: VisualImageMime
  transformed: boolean
  width: number
}

function startsWithBytes(bytes: Buffer, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value)
}

export function detectVisualImageMime(bytes: Buffer): VisualImageMime | null {
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png"
  }
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a") {
    return "image/gif"
  }
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp"
  }

  const text = bytes.subarray(0, Math.min(bytes.byteLength, 16_384)).toString("utf8")
  const withoutBom = text.replace(/^\uFEFF/, "").trimStart()
  if (/<!(?:doctype|entity)\b/i.test(withoutBom) && /<svg\b/i.test(withoutBom)) {
    return "image/svg+xml"
  }
  if (/^(?:<\?xml\b[^>]*>\s*)?(?:<!--[^]*?-->\s*)*<svg\b/i.test(withoutBom)) {
    return "image/svg+xml"
  }
  return null
}

interface ImageDimensions {
  width: number
  height: number
}

function jpegDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.lastIndexOf(Buffer.from([0xff, 0xd9])) < 2) return null
  let offset = 2
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3,
    0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb,
    0xcd, 0xce, 0xcf,
  ])

  while (offset + 3 < bytes.byteLength) {
    while (offset < bytes.byteLength && bytes[offset] !== 0xff) offset += 1
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.byteLength) return null

    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue
    if (marker === 0xda || offset + 1 >= bytes.byteLength) return null

    const length = bytes.readUInt16BE(offset)
    if (length < 2 || offset + length > bytes.byteLength) return null
    if (startOfFrame.has(marker)) {
      if (length < 7) return null
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      }
    }
    offset += length
  }
  return null
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return crc >>> 0
})

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.byteLength; index += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function hasValidPngStructure(bytes: Buffer): boolean {
  let offset = 8
  let sawHeader = false
  let sawData = false
  while (offset + 12 <= bytes.byteLength) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii")
    const next = offset + 12 + length
    if (next > bytes.byteLength) return false
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length)
    const actualCrc = crc32(bytes.subarray(offset + 4, offset + 8 + length))
    if (actualCrc !== expectedCrc) return false
    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) return false
      sawHeader = true
    }
    if (type === "IDAT") sawData = true
    if (type === "IEND") return length === 0 && sawHeader && sawData
    offset = next
  }
  return false
}

function svgDimensions(bytes: Buffer): ImageDimensions | null {
  const source = bytes.toString("utf8").replace(/^\uFEFF/, "").trimStart()
  const root = /^(?:<\?xml\b[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b([^>]*)>/i.exec(source)?.[1]
  if (root === undefined) return null

  const length = (name: string): { present: boolean; relative: boolean; value: number | null } => {
    const raw = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(root)?.[2]?.trim()
    if (!raw) return { present: false, relative: false, value: null }
    if (/^\d+(?:\.\d+)?%$/.test(raw)) {
      return { present: true, relative: true, value: null }
    }
    const parsed = /^(\d+(?:\.\d+)?)(px|pt|pc|in|cm|mm|q)?$/i.exec(raw)
    if (!parsed) return { present: true, relative: false, value: null }
    const unitScale: Record<string, number> = {
      "": 1,
      px: 1,
      pt: 96 / 72,
      pc: 16,
      in: 96,
      cm: 96 / 2.54,
      mm: 96 / 25.4,
      q: 96 / 101.6,
    }
    const value = Number.parseFloat(parsed[1]) * unitScale[(parsed[2] || "").toLowerCase()]
    return {
      present: true,
      relative: false,
      value: Number.isFinite(value) && value > 0 ? value : null,
    }
  }
  const widthAttribute = length("width")
  const heightAttribute = length("height")
  if (
    (widthAttribute.present && !widthAttribute.value && !widthAttribute.relative)
    || (heightAttribute.present && !heightAttribute.value && !heightAttribute.relative)
  ) return null
  const width = widthAttribute.value
  const height = heightAttribute.value
  const viewBoxRaw = /(?:^|\s)viewBox\s*=\s*(["'])(.*?)\1/i.exec(root)?.[2]
  const viewBox = viewBoxRaw
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  const viewWidth = viewBox?.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2] > 0
    ? viewBox[2]
    : null
  const viewHeight = viewBox?.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3] > 0
    ? viewBox[3]
    : null

  if (width && height) return { width, height }
  if (viewWidth && viewHeight) {
    if (width) return { width, height: width * viewHeight / viewWidth }
    if (height) return { width: height * viewWidth / viewHeight, height }
    return { width: viewWidth, height: viewHeight }
  }
  return null
}

function webpDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.byteLength < 30) return null
  if (bytes.readUInt32LE(4) + 8 > bytes.byteLength) return null
  const chunkLength = bytes.readUInt32LE(16)
  if (20 + chunkLength > bytes.byteLength) return null
  const chunk = bytes.subarray(12, 16).toString("ascii")
  if (chunk === "VP8X") {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    }
  }
  if (chunk === "VP8 ") {
    if (!startsWithBytes(bytes.subarray(23), [0x9d, 0x01, 0x2a])) return null
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    }
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + ((bytes[22] & 0xc0) >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    }
  }
  return null
}

function rasterDimensions(bytes: Buffer, mime: Exclude<VisualImageMime, "image/svg+xml">): ImageDimensions | null {
  if (mime === "image/png") {
    if (
      bytes.byteLength < 24
      || bytes.subarray(12, 16).toString("ascii") !== "IHDR"
      || !hasValidPngStructure(bytes)
    ) return null
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }
  if (mime === "image/gif") {
    if (bytes.byteLength < 14 || bytes[bytes.byteLength - 1] !== 0x3b) return null
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) }
  }
  if (mime === "image/jpeg") return jpegDimensions(bytes)
  return webpDimensions(bytes)
}

function assertDimensions(
  dimensions: ImageDimensions,
  limits: { maxDimension: number; maxPixels: number }
): void {
  const { width, height } = dimensions
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new VisualImageError("INVALID_CONTENT", "El recurso no contiene dimensiones válidas")
  }
  if (
    width > limits.maxDimension
    || height > limits.maxDimension
    || width > limits.maxPixels / height
  ) {
    throw new VisualImageError("TOO_LARGE", "El recurso visual excede las dimensiones permitidas")
  }
}

function decodedCodePoint(value: string, radix: number): string {
  const codePoint = Number.parseInt(value, radix)
  if (
    !Number.isInteger(codePoint)
    || codePoint < 0
    || codePoint > 0x10ffff
    || (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) return "\uFFFD"
  return String.fromCodePoint(codePoint)
}

async function assertSafeSvg(
  bytes: Buffer,
  limits: { maxDimension: number; maxEmbeddedBytes: number; maxPixels: number }
): Promise<void> {
  const source = bytes.toString("utf8")
  const normalizedSource = source
    .replace(/&#x([0-9a-f]+);?/gi, (_, value) => decodedCodePoint(value, 16))
    .replace(/&#([0-9]+);?/g, (_, value) => decodedCodePoint(value, 10))
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, value) => decodedCodePoint(value, 16))
    .replace(/\\([^\r\n])/g, "$1")
  const forbidden = [
    /<!doctype\b/i,
    /<!entity\b/i,
    /<\s*(?:[a-z_][\w.-]*:)?(?:script|foreignObject|iframe|object|embed|link|meta|audio|video)\b/i,
    /\s(?:[a-z_][\w.-]*:)?on[a-z]+\s*=/i,
    /javascript\s*:/i,
    /@import\b/i,
  ]
  if (forbidden.some(pattern => pattern.test(normalizedSource))) {
    throw new VisualImageError("UNSAFE_SVG", "SVG no seguro: contiene contenido activo")
  }

  const hrefPattern = /\b(?:href|xlink:href)\s*=\s*(["'])([\s\S]*?)\1/gi
  let hrefMatch: RegExpExecArray | null
  let totalEmbeddedBytes = 0
  while ((hrefMatch = hrefPattern.exec(normalizedSource)) !== null) {
    const target = hrefMatch[2].trim()
    if (target.startsWith("#")) continue
    if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(target)) {
      const decoded = decodeVisualImageDataUri(target, limits.maxEmbeddedBytes)
      if (!decoded) {
        throw new VisualImageError("UNSAFE_SVG", "SVG no seguro: contiene una imagen embebida inválida")
      }
      totalEmbeddedBytes += decoded.bytes.byteLength
      if (totalEmbeddedBytes > limits.maxEmbeddedBytes) {
        throw new VisualImageError("TOO_LARGE", "Las imágenes embebidas del SVG exceden el tamaño permitido")
      }
      const detectedMime = detectVisualImageMime(decoded.bytes)
      if (!detectedMime || !["image/png", "image/jpeg", "image/webp"].includes(detectedMime)) {
        throw new VisualImageError("UNSAFE_SVG", "SVG no seguro: contiene una imagen embebida inválida")
      }
      await materializeVisualImage({
        bytes: decoded.bytes,
        declaredMime: decoded.declaredMime,
        maxDimension: limits.maxDimension,
        maxInputBytes: limits.maxEmbeddedBytes,
        maxOutputBytes: limits.maxEmbeddedBytes,
        maxPixels: limits.maxPixels,
      })
      continue
    }
    throw new VisualImageError("UNSAFE_SVG", "SVG no seguro: contiene una referencia externa")
  }

  const urlPattern = /url\(\s*(["']?)([\s\S]*?)\1\s*\)/gi
  let urlMatch: RegExpExecArray | null
  while ((urlMatch = urlPattern.exec(normalizedSource)) !== null) {
    if (!urlMatch[2].trim().startsWith("#")) {
      throw new VisualImageError("UNSAFE_SVG", "SVG no seguro: contiene una referencia externa")
    }
  }
}

function extensionForMime(mime: MaterializedVisualImageMime): MaterializedVisualImage["extension"] {
  if (mime === "image/jpeg") return "jpg"
  if (mime === "image/webp") return "webp"
  if (mime === "image/gif") return "gif"
  return "png"
}

function dataUri(bytes: Buffer, mime: MaterializedVisualImageMime): string {
  return `data:${mime};base64,${bytes.toString("base64")}`
}

export async function readResponseBytesWithLimit(
  response: Pick<Response, "arrayBuffer" | "body" | "headers">,
  maxBytes: number
): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length") || 0)
  if (declaredLength > maxBytes) {
    throw new VisualImageError("TOO_LARGE", "El recurso visual excede el tamaño permitido")
  }

  const reader = response.body?.getReader()
  if (!reader) {
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) {
      throw new VisualImageError("TOO_LARGE", "El recurso visual excede el tamaño permitido")
    }
    return bytes
  }

  const chunks: Buffer[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = Buffer.from(value)
    totalBytes += chunk.byteLength
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new VisualImageError("TOO_LARGE", "El recurso visual excede el tamaño permitido")
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, totalBytes)
}

async function inspectImage(
  bytes: Buffer,
  sourceMime: VisualImageMime,
  limits: { maxDimension: number; maxPixels: number },
  expectedDimensions?: ImageDimensions
): Promise<{ image: Awaited<ReturnType<typeof loadImage>>; width: number; height: number }> {
  try {
    if (expectedDimensions) assertDimensions(expectedDimensions, limits)
    const image = await loadImage(bytes)
    const width = Number(image.width)
    const height = Number(image.height)
    assertDimensions({ width, height }, limits)
    return { image, width, height }
  } catch (error) {
    if (error instanceof VisualImageError) throw error
    throw new VisualImageError("INVALID_CONTENT", "El recurso no contiene una imagen válida", error)
  }
}

/**
 * Interface única para validar y materializar imágenes usadas por documentos.
 * El MIME real se detecta por bytes. SVG sólo se admite como entrada segura y
 * siempre sale rasterizado; los raster existentes conservan sus bytes salvo
 * que el caller pida una variante compatible con jsPDF/pdf-lib. El perfil
 * legacy-raster valida la firma sin imponer dimensiones nuevas a assets ya
 * publicados; uploads y conversiones usan el perfil estricto por defecto.
 */
export async function materializeVisualImage(input: {
  bytes: Buffer | Uint8Array
  declaredMime?: string | null
  maxDimension?: number
  maxInputBytes?: number
  maxOutputBytes?: number
  maxPixels?: number
  output?: "preserve" | "pdf-embeddable"
  validation?: "strict" | "legacy-raster"
}): Promise<MaterializedVisualImage> {
  const bytes = Buffer.from(input.bytes)
  const maxInputBytes = input.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES
  const maxOutputBytes = input.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
  if (bytes.byteLength === 0) {
    throw new VisualImageError("INVALID_CONTENT", "El recurso visual está vacío")
  }
  if (bytes.byteLength > maxInputBytes) {
    throw new VisualImageError("TOO_LARGE", "El recurso visual excede el tamaño permitido")
  }

  const sourceMime = detectVisualImageMime(bytes)
  if (!sourceMime) {
    throw new VisualImageError("INVALID_CONTENT", "El recurso contiene contenido visual inválido")
  }
  const mustRasterize = sourceMime === "image/svg+xml"
    || (input.output === "pdf-embeddable" && !["image/png", "image/jpeg"].includes(sourceMime))
  const preserveLegacyRaster = input.validation === "legacy-raster"
    && sourceMime !== "image/svg+xml"
    && !mustRasterize

  if (sourceMime === "image/svg+xml") {
    await assertSafeSvg(bytes, {
      maxDimension: input.maxDimension ?? DEFAULT_MAX_DIMENSION,
      maxEmbeddedBytes: maxInputBytes,
      maxPixels: input.maxPixels ?? DEFAULT_MAX_PIXELS,
    })
  }
  const headerDimensions = sourceMime === "image/svg+xml"
    ? svgDimensions(bytes)
    : rasterDimensions(bytes, sourceMime)
  if (!headerDimensions) {
    throw new VisualImageError("INVALID_CONTENT", "El recurso no contiene una imagen válida")
  }
  const inspected = preserveLegacyRaster
    ? { image: null, ...headerDimensions! }
    : await inspectImage(
        bytes,
        sourceMime,
        {
          maxDimension: input.maxDimension ?? DEFAULT_MAX_DIMENSION,
          maxPixels: input.maxPixels ?? DEFAULT_MAX_PIXELS,
        },
        headerDimensions || undefined
      )

  let materializedBytes: Buffer = bytes
  let mime: MaterializedVisualImageMime = sourceMime === "image/svg+xml" ? "image/png" : sourceMime
  if (mustRasterize) {
    if (!inspected.image) {
      throw new VisualImageError("INVALID_CONTENT", "No se pudieron leer las dimensiones del recurso")
    }
    const canvas = createCanvas(inspected.width, inspected.height)
    canvas.getContext("2d").drawImage(inspected.image, 0, 0, inspected.width, inspected.height)
    materializedBytes = canvas.toBuffer("image/png")
    mime = "image/png"
  }
  if (materializedBytes.byteLength > maxOutputBytes) {
    throw new VisualImageError("TOO_LARGE", "La variante materializada excede el tamaño permitido")
  }

  return {
    bytes: materializedBytes,
    dataUri: dataUri(materializedBytes, mime),
    extension: extensionForMime(mime),
    height: inspected.height,
    mime,
    sourceMime,
    transformed: mustRasterize,
    width: inspected.width,
  }
}

export function decodeVisualImageDataUri(value: string, maxBytes?: number): {
  bytes: Buffer
  declaredMime: string
} | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(value.trim())
  if (!match) return null
  try {
    const encoded = match[2].replace(/\s/g, "")
    if (maxBytes && encoded.length > Math.ceil(maxBytes / 3) * 4 + 4) return null
    const bytes = Buffer.from(encoded, "base64")
    if (bytes.byteLength === 0) return null
    if (maxBytes && bytes.byteLength > maxBytes) return null
    return { bytes, declaredMime: match[1].toLowerCase() }
  } catch {
    return null
  }
}
