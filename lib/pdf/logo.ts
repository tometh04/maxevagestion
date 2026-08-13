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

/** jsPDF y pdf-lib solo embeben PNG y JPEG. */
const EMBEDDABLE_MIME = /^image\/(png|jpe?g)$/i
const FETCH_TIMEOUT_MS = 4000
const MAX_BYTES = 2_000_000

export interface ResolvedLogo {
  /** Data URI listo para `jsPDF.addImage`. */
  dataUri: string
  /** Bytes crudos, para `pdf-lib`. */
  bytes: Uint8Array
  format: "PNG" | "JPEG"
}

function parseDataUri(value: string): ResolvedLogo | null {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(value)
  if (!match) return null
  const [, mime, base64] = match
  if (!EMBEDDABLE_MIME.test(mime)) return null
  try {
    const bytes = Buffer.from(base64, "base64")
    if (bytes.byteLength === 0) return null
    return {
      dataUri: value,
      bytes: new Uint8Array(bytes),
      format: /jpe?g$/i.test(mime) ? "JPEG" : "PNG",
    }
  } catch {
    return null
  }
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
    if (!EMBEDDABLE_MIME.test(contentType)) return null

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null

    const isJpeg = /jpe?g$/i.test(contentType)
    const mime = isJpeg ? "image/jpeg" : "image/png"
    return {
      dataUri: `data:${mime};base64,${buffer.toString("base64")}`,
      bytes: new Uint8Array(buffer),
      format: isJpeg ? "JPEG" : "PNG",
    }
  } catch {
    return null
  }
}

/** Atajo para los generadores jsPDF: data URI o "" si no se puede usar. */
export async function toEmbeddableLogo(raw: string | null | undefined): Promise<string> {
  return (await resolveTenantLogo(raw))?.dataUri ?? ""
}
