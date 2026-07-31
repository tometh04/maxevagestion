import type { LibraryContext } from "./types"
import {
  LIBRARY_BUCKET,
  LIBRARY_MAX_FILE_BYTES,
  LIBRARY_MIME_EXTENSIONS,
} from "./types"
import { LibraryPersistenceError, LibraryValidationError } from "./access"

export interface LibraryUploadTarget {
  /** URL firmada para subir directo el archivo (cliente -> storage). */
  signedUrl: string
  /** Token de la subida firmada, para uploadToSignedUrl(). */
  token: string
  /** Path definitivo del objeto en el bucket: ${orgId}/${uuid}.${ext}. */
  path: string
  mimeType: string
}

/**
 * Valida MIME/tamaño y genera una signed upload URL para que el cliente suba el
 * archivo directo al bucket privado (no pasa por el route handler, importante
 * para videos pesados). Luego el cliente confirma con createFileResource().
 */
export async function createUploadTarget(
  ctx: LibraryContext,
  input: { fileName: string; mimeType: string; size?: number | null }
): Promise<LibraryUploadTarget> {
  const extension = LIBRARY_MIME_EXTENSIONS[input.mimeType]
  if (!extension) {
    throw new LibraryValidationError(
      "Tipo de archivo no permitido. Se aceptan PDF, imágenes (PNG/JPG/WebP) y videos (MP4/WebM/MOV)."
    )
  }
  if (typeof input.size === "number" && input.size > LIBRARY_MAX_FILE_BYTES) {
    throw new LibraryValidationError("El archivo no puede superar los 500 MB")
  }

  const path = `${ctx.orgId}/${crypto.randomUUID()}.${extension}`
  const { data, error } = await ctx.supabase.storage
    .from(LIBRARY_BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data?.signedUrl || !data?.token) {
    console.error("[library] Error creando signed upload URL", {
      orgId: ctx.orgId,
      cause: error?.message ?? "missing_data",
    })
    throw new LibraryPersistenceError("No se pudo preparar la subida")
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path ?? path,
    mimeType: input.mimeType,
  }
}
