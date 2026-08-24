import { readFile } from "node:fs/promises"
import path from "node:path"

const MAX_ASSET_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_ASSET_BYTES = 20 * 1024 * 1024
const ASSET_TIMEOUT_MS = 6_000
const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="

const MIME_BY_EXTENSION: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
}

function decodeHtmlSource(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"')
}

function assetSources(html: string): string[] {
  const values = new Set<string>()
  for (const match of Array.from(html.matchAll(/<img\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)')/gi))) {
    values.add(match[1] || match[2])
  }
  for (const match of Array.from(html.matchAll(/url\(\s*([^)]+?)\s*\)/gi))) {
    const value = match[1].trim()
    const quotePair = [
      ["&quot;", "&quot;"],
      ["&#34;", "&#34;"],
      ["&#034;", "&#034;"],
      ["&#39;", "&#39;"],
      ["&#039;", "&#039;"],
      ['"', '"'],
      ["'", "'"],
    ].find(([opening, closing]) => value.startsWith(opening) && value.endsWith(closing))
    const source = quotePair
      ? value.slice(quotePair[0].length, -quotePair[1].length)
      : value
    if (source) values.add(source)
  }
  return Array.from(values)
}

function dataUri(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString("base64")}`
}

function internalAsset(source: string, publicDir: string): { cacheKey: string; filePath: string; mime: string } | null {
  if (!source.startsWith("/")) return null
  const parsed = new URL(source, "http://quotation.local")
  const relative = decodeURIComponent(parsed.pathname).replace(/^\/+/, "")
  const filePath = path.resolve(publicDir, relative)
  const publicRoot = `${path.resolve(publicDir)}${path.sep}`
  if (!filePath.startsWith(publicRoot)) throw new Error("Ruta de asset fuera de public")
  const mime = MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()]
  if (!mime) throw new Error(`Formato de asset no soportado: ${path.extname(filePath)}`)
  return { cacheKey: filePath.toLowerCase(), filePath, mime }
}

function approvedRemoteHosts(): Set<string> {
  const hosts = new Set<string>()
  for (const value of [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (!value) continue
    try { hosts.add(new URL(value).hostname.toLowerCase()) } catch { /* configuración inválida: no habilitar */ }
  }
  for (const value of (process.env.QUOTATION_DOCUMENT_ASSET_HOSTS || "").split(",")) {
    const host = value.trim().toLowerCase()
    if (host) hosts.add(host)
  }
  return hosts
}

async function fetchApprovedImage(source: string): Promise<
  | { kind: "ok"; cacheKey: string; buffer: Buffer; mime: string }
  | { kind: "unapproved" }
  | { kind: "failed"; reason: string }
> {
  let url: URL
  try { url = new URL(source) } catch { return { kind: "unapproved" } }
  if (url.protocol !== "https:") return { kind: "unapproved" }

  const hostname = url.hostname.toLowerCase()
  const approved = approvedRemoteHosts()
  if (!approved.has(hostname) && !hostname.endsWith(".supabase.co")) return { kind: "unapproved" }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ASSET_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    })
    if (!response.ok) return { kind: "failed", reason: `HTTP ${response.status}` }
    const declaredLength = Number(response.headers.get("content-length") || 0)
    if (declaredLength > MAX_ASSET_BYTES) return { kind: "failed", reason: "asset demasiado grande" }
    const mime = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
    if (!["image/gif", "image/jpeg", "image/png", "image/webp"].includes(mime)) {
      return { kind: "failed", reason: "tipo de contenido no permitido" }
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > MAX_ASSET_BYTES) return { kind: "failed", reason: "asset demasiado grande" }
    return { kind: "ok", cacheKey: url.toString(), buffer, mime }
  } catch (error) {
    return { kind: "failed", reason: error instanceof Error ? error.message : "error de red" }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Convierte los assets visuales del HTML emitido a data URIs. Así el snapshot
 * no depende de URLs firmadas, logos reemplazados ni archivos públicos futuros.
 * Los assets remotos sólo se descargan desde hosts explícitamente aprobados;
 * cualquier otro host se sustituye por un píxel transparente para evitar SSRF.
 */
export async function freezeQuotationDocumentAssets(
  html: string,
  options: { publicDir?: string; additionalSources?: readonly string[] } = {}
): Promise<{
  html: string
  frozenAssetCount: number
  omittedRemoteAssetCount: number
  frozenSources: Record<string, string>
}> {
  const publicDir = options.publicDir || path.join(process.cwd(), "public")
  const resolvedByKey = new Map<string, string>()
  const sourceVariants = new Map<string, Set<string>>()
  for (const encodedSource of assetSources(html)) {
    const source = decodeHtmlSource(encodedSource)
    const variants = sourceVariants.get(source) || new Set<string>()
    variants.add(encodedSource)
    sourceVariants.set(source, variants)
  }
  for (const source of options.additionalSources || []) {
    const normalized = decodeHtmlSource(source.trim())
    if (normalized && !sourceVariants.has(normalized)) {
      sourceVariants.set(normalized, new Set())
    }
  }

  let frozenHtml = html
  let frozenAssetCount = 0
  let omittedRemoteAssetCount = 0
  let totalBytes = 0
  const frozenSources: Record<string, string> = {}

  for (const [source, encodedVariants] of Array.from(sourceVariants.entries())) {
    let replacement: string
    const local = source.startsWith("data:") ? null : internalAsset(source, publicDir)
    if (source.startsWith("data:")) {
      replacement = source
    } else if (local) {
      const cached = resolvedByKey.get(local.cacheKey)
      if (cached) {
        replacement = cached
      } else {
        const buffer = await readFile(local.filePath)
        if (buffer.byteLength > MAX_ASSET_BYTES || totalBytes + buffer.byteLength > MAX_TOTAL_ASSET_BYTES) {
          throw new Error(`El asset ${local.filePath} excede el límite permitido`)
        }
        totalBytes += buffer.byteLength
        replacement = dataUri(buffer, local.mime)
        resolvedByKey.set(local.cacheKey, replacement)
      }
      frozenAssetCount += 1
    } else {
      const remote = await fetchApprovedImage(source)
      if (remote.kind === "failed") {
        throw new Error(`No se pudo congelar el asset aprobado ${source}: ${remote.reason}`)
      }
      if (remote.kind === "ok" && totalBytes + remote.buffer.byteLength <= MAX_TOTAL_ASSET_BYTES) {
        const cached = resolvedByKey.get(remote.cacheKey)
        replacement = cached || dataUri(remote.buffer, remote.mime)
        if (!cached) {
          totalBytes += remote.buffer.byteLength
          resolvedByKey.set(remote.cacheKey, replacement)
        }
        frozenAssetCount += 1
      } else if (remote.kind === "ok") {
        throw new Error(`Los assets del documento exceden el límite total permitido`)
      } else {
        replacement = TRANSPARENT_PIXEL
        omittedRemoteAssetCount += 1
      }
    }

    frozenSources[source] = replacement
    for (const encodedSource of Array.from(encodedVariants)) {
      frozenHtml = frozenHtml.replaceAll(encodedSource, replacement)
    }
  }

  return { html: frozenHtml, frozenAssetCount, omittedRemoteAssetCount, frozenSources }
}
