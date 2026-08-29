/**
 * Resolución del logo del tenant para los PDF.
 *
 * `organization_settings.brand_logo` guarda la URL pública de Supabase Storage
 * (ver `app/api/settings/organization/logo/route.ts`), NO la imagen. Ni jsPDF
 * ni pdf-lib descargan nada: hay que bajarla acá.
 *
 * Sin esto, `doc.addImage(url, ...)` tira y el PDF cae al nombre en texto —
 * que es exactamente lo que venía pasando en la liquidación de servicios, el
 * itinerario y los reportes: el logo cargado por la agencia no salía en ningún
 * lado salvo en las facturas, que eran las únicas que bajaban la URL.
 *
 * Falla en silencio a propósito: un logo que no se puede bajar no puede
 * impedir generar el documento. La portada cae al nombre de la agencia, que es
 * una presentación perfectamente válida.
 */

import {
  DOCUMENT_LOGO_MAX_STORED_BYTES,
  decodeVisualImageDataUri,
  detectVisualImageMime,
  materializeVisualImage,
  readResponseBytesWithLimit,
} from "@/lib/document-assets/visual-image-server"

const FETCH_TIMEOUT_MS = 4000
const MAX_BYTES = DOCUMENT_LOGO_MAX_STORED_BYTES

export interface ResolvedLogo {
  /** Data URI listo para `jsPDF.addImage`. */
  dataUri: string
  /** Bytes crudos, para `pdf-lib`. */
  bytes: Uint8Array
  format: "PNG" | "JPEG"
}

async function materializeLogo(bytes: Buffer, declaredMime?: string): Promise<ResolvedLogo | null> {
  try {
    const detectedMime = detectVisualImageMime(bytes)
    const materialized = await materializeVisualImage({
      bytes,
      declaredMime,
      maxInputBytes: MAX_BYTES,
      maxOutputBytes: MAX_BYTES,
      output: "pdf-embeddable",
      validation: detectedMime === "image/png" || detectedMime === "image/jpeg"
        ? "legacy-raster"
        : "strict",
    })
    return {
      dataUri: materialized.dataUri,
      bytes: new Uint8Array(materialized.bytes),
      format: materialized.mime === "image/jpeg" ? "JPEG" : "PNG",
    }
  } catch {
    return null
  }
}

async function parseDataUri(value: string): Promise<ResolvedLogo | null> {
  const decoded = decodeVisualImageDataUri(value, MAX_BYTES)
  return decoded
    ? materializeLogo(decoded.bytes, decoded.declaredMime)
    : null
}

/**
 * Devuelve el logo listo para embeber, o null si no se puede usar.
 * Acepta un data URI ya armado o una URL http(s).
 */
export async function resolveTenantLogo(raw: string | null | undefined): Promise<ResolvedLogo | null> {
  const value = (raw || "").trim()
  if (!value) return null

  if (value.startsWith("data:")) return parseDataUri(value)
  if (!/^https?:\/\//i.test(value)) return null

  try {
    const response = await fetch(value, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!response.ok) return null

    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim()
    const buffer = await readResponseBytesWithLimit(response, MAX_BYTES)
    if (buffer.byteLength === 0) return null
    return materializeLogo(buffer, contentType)
  } catch {
    return null
  }
}

/** Atajo para los generadores jsPDF: data URI o "" si no se puede usar. */
export async function toEmbeddableLogo(raw: string | null | undefined): Promise<string> {
  return (await resolveTenantLogo(raw))?.dataUri ?? ""
}
