import type {
  LibraryContext,
  LibraryResource,
  LibraryResourceType,
} from "./types"
import { LIBRARY_BUCKET } from "./types"
import {
  LibraryNotFoundError,
  LibraryPersistenceError,
  LibraryValidationError,
} from "./access"

// Tablas library_* aún no están en los types generados -> cast a `any`
// (mismo patrón que lib/support/kb.ts) hasta correr db:generate.

const RESOURCE_COLUMNS =
  "id, category_id, title, description, resource_type, storage_path, file_mime_type, file_size, original_file_name, external_url, target_roles, published, sort_order, created_at, updated_at"

const RESOURCE_SELECT = `${RESOURCE_COLUMNS}, library_categories(name, slug)`

function mapResource(row: any, signedUrl: string | null): LibraryResource {
  return {
    id: row.id,
    category_id: row.category_id,
    category_name: row.library_categories?.name ?? null,
    category_slug: row.library_categories?.slug ?? null,
    title: row.title,
    description: row.description ?? null,
    resource_type: row.resource_type,
    url: signedUrl,
    external_url: row.external_url ?? null,
    file_mime_type: row.file_mime_type ?? null,
    file_size: row.file_size ?? null,
    original_file_name: row.original_file_name ?? null,
    target_roles: row.target_roles ?? [],
    published: row.published,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** Firma en batch los recursos `file` y arma los DTOs. */
async function signRows(
  ctx: LibraryContext,
  rows: any[]
): Promise<LibraryResource[]> {
  const paths = rows
    .filter((r) => r.resource_type === "file" && r.storage_path)
    .map((r) => r.storage_path as string)

  const signedByPath = new Map<string, string>()
  if (paths.length > 0) {
    const signed = await ctx.supabase.storage
      .from(LIBRARY_BUCKET)
      .createSignedUrls(paths, 60 * 60)
    if (signed.error) {
      throw new LibraryPersistenceError("No se pudo abrir el material privado")
    }
    for (const item of signed.data ?? []) {
      if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl)
    }
  }

  return rows.map((row) =>
    mapResource(
      row,
      row.resource_type === "file"
        ? signedByPath.get(row.storage_path) ?? null
        : null
    )
  )
}

/**
 * Listado para consulta. Solo recursos publicados y no archivados, filtrados por
 * destinatarios: `target_roles` vacío (= todos) o con overlap contra los roles
 * del usuario. `includeAllTargets` (managers) omite el filtro de destinatarios.
 */
export async function listResourcesForViewer(
  ctx: LibraryContext,
  opts: { includeAllTargets?: boolean } = {}
): Promise<LibraryResource[]> {
  let query = (ctx.supabase as any)
    .from("library_resources")
    .select(RESOURCE_SELECT)
    .eq("org_id", ctx.orgId)
    .is("archived_at", null)
    .eq("published", true)
    .order("sort_order")
    .order("created_at", { ascending: false })

  if (!opts.includeAllTargets) {
    // Filtro de destinatarios: target_roles vacío (= todos) o que contenga
    // alguno de los roles del usuario. Se usa un `cs` (contains) por rol en vez
    // de un `ov` (overlap) con array multi-elemento a propósito: PostgREST separa
    // las condiciones de `.or()` por coma, así que una coma DENTRO del literal de
    // array (`{SELLER,POST_VENTA}`) rompería el filtro. `cs.{SELLER}` tiene un
    // solo elemento y no lleva comas internas.
    const roles = ctx.userRoles.filter((r) => /^[A-Z_]+$/.test(r))
    const clauses = [
      "target_roles.eq.{}",
      ...roles.map((r) => `target_roles.cs.{${r}}`),
    ]
    query = query.or(clauses.join(","))
  }

  const { data, error } = await query
  if (error) {
    console.error("[library] Error listando recursos (viewer)", error.message)
    throw new LibraryPersistenceError("No se pudo cargar la biblioteca")
  }
  return signRows(ctx, data ?? [])
}

/** Listado completo para gestión: incluye no publicados, ignora destinatarios. */
export async function listResourcesForAdmin(
  ctx: LibraryContext
): Promise<LibraryResource[]> {
  const { data, error } = await (ctx.supabase as any)
    .from("library_resources")
    .select(RESOURCE_SELECT)
    .eq("org_id", ctx.orgId)
    .is("archived_at", null)
    .order("sort_order")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[library] Error listando recursos (admin)", error.message)
    throw new LibraryPersistenceError("No se pudo cargar la biblioteca")
  }
  return signRows(ctx, data ?? [])
}

export async function getSignedResource(
  ctx: LibraryContext,
  id: string
): Promise<LibraryResource> {
  const { data, error } = await (ctx.supabase as any)
    .from("library_resources")
    .select(RESOURCE_SELECT)
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle()

  if (error) {
    console.error("[library] Error obteniendo recurso", error.message)
    throw new LibraryPersistenceError()
  }
  if (!data) throw new LibraryNotFoundError()
  const [dto] = await signRows(ctx, [data])
  return dto
}

function validateTitle(title: string): string {
  const t = title?.trim() ?? ""
  if (t.length < 2 || t.length > 200) {
    throw new LibraryValidationError("El título debe tener entre 2 y 200 caracteres")
  }
  return t
}

function normalizeTargetRoles(roles: unknown): string[] {
  if (!Array.isArray(roles)) return []
  const allowed = new Set(["ADMIN", "CONTABLE", "SELLER", "VIEWER", "POST_VENTA"])
  return Array.from(
    new Set(roles.filter((r): r is string => typeof r === "string" && allowed.has(r)))
  )
}

interface CommonResourceInput {
  title: string
  description?: string | null
  categoryId?: string | null
  targetRoles?: string[]
  published?: boolean
  sortOrder?: number
}

/** Crea un recurso tipo `link` (video de YouTube/Drive o URL cualquiera). */
export async function createLinkResource(
  ctx: LibraryContext,
  input: CommonResourceInput & { externalUrl: string }
): Promise<LibraryResource> {
  const title = validateTitle(input.title)
  let url: URL
  try {
    url = new URL(input.externalUrl)
  } catch {
    throw new LibraryValidationError("El enlace no es una URL válida")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new LibraryValidationError("El enlace debe empezar con http:// o https://")
  }

  return insertResource(ctx, {
    ...input,
    title,
    resource_type: "link",
    external_url: url.toString(),
  })
}

/**
 * Registra un recurso tipo `file` cuyo archivo ya fue subido al bucket con una
 * signed upload URL. Valida que el objeto exista en storage antes de insertar.
 */
export async function createFileResource(
  ctx: LibraryContext,
  input: CommonResourceInput & {
    storagePath: string
    fileMimeType: string
    fileSize?: number | null
    originalFileName?: string | null
  }
): Promise<LibraryResource> {
  const title = validateTitle(input.title)

  // El path debe pertenecer al org del usuario (defensa además de la RLS de storage).
  if (!input.storagePath.startsWith(`${ctx.orgId}/`)) {
    throw new LibraryValidationError("Ruta de archivo inválida")
  }

  // Verificar que el archivo realmente exista (evita registrar un recurso huérfano).
  const prefix = input.storagePath.slice(0, input.storagePath.lastIndexOf("/"))
  const fileName = input.storagePath.slice(input.storagePath.lastIndexOf("/") + 1)
  const { data: listed, error: listErr } = await ctx.supabase.storage
    .from(LIBRARY_BUCKET)
    .list(prefix, { search: fileName, limit: 1 })
  if (listErr || !listed || listed.length === 0) {
    throw new LibraryValidationError("El archivo no se encontró en el almacenamiento")
  }

  return insertResource(ctx, {
    ...input,
    title,
    resource_type: "file",
    storage_path: input.storagePath,
    file_mime_type: input.fileMimeType,
    file_size: input.fileSize ?? null,
    original_file_name: input.originalFileName?.slice(0, 240) ?? null,
  })
}

async function insertResource(
  ctx: LibraryContext,
  input: CommonResourceInput & {
    title: string
    resource_type: LibraryResourceType
    external_url?: string
    storage_path?: string
    file_mime_type?: string
    file_size?: number | null
    original_file_name?: string | null
  }
): Promise<LibraryResource> {
  const { data, error } = await (ctx.supabase as any)
    .from("library_resources")
    .insert({
      org_id: ctx.orgId,
      category_id: input.categoryId ?? null,
      title: input.title,
      description: input.description?.trim() || null,
      resource_type: input.resource_type,
      external_url: input.external_url ?? null,
      storage_path: input.storage_path ?? null,
      file_mime_type: input.file_mime_type ?? null,
      file_size: input.file_size ?? null,
      original_file_name: input.original_file_name ?? null,
      target_roles: normalizeTargetRoles(input.targetRoles),
      published: input.published ?? true,
      sort_order: input.sortOrder ?? 0,
      created_by: ctx.userId,
    })
    .select(RESOURCE_SELECT)
    .single()

  if (error) {
    // Si era un file, limpiar el objeto huérfano del storage.
    if (input.storage_path) {
      await ctx.supabase.storage.from(LIBRARY_BUCKET).remove([input.storage_path])
    }
    console.error("[library] Error creando recurso", error.message)
    throw new LibraryPersistenceError("No se pudo crear el recurso")
  }
  const [dto] = await signRows(ctx, [data])
  return dto
}

export async function updateResource(
  ctx: LibraryContext,
  id: string,
  input: {
    title?: string
    description?: string | null
    categoryId?: string | null
    targetRoles?: string[]
    published?: boolean
    sortOrder?: number
  }
): Promise<LibraryResource> {
  const patch: Record<string, unknown> = {}
  if (input.title !== undefined) patch.title = validateTitle(input.title)
  if (input.description !== undefined) patch.description = input.description?.trim() || null
  if (input.categoryId !== undefined) patch.category_id = input.categoryId
  if (input.targetRoles !== undefined) patch.target_roles = normalizeTargetRoles(input.targetRoles)
  if (input.published !== undefined) patch.published = input.published
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder

  if (Object.keys(patch).length === 0) {
    throw new LibraryValidationError("No hay cambios para guardar")
  }

  const { data, error } = await (ctx.supabase as any)
    .from("library_resources")
    .update(patch)
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .is("archived_at", null)
    .select(RESOURCE_SELECT)
    .maybeSingle()

  if (error) {
    console.error("[library] Error actualizando recurso", error.message)
    throw new LibraryPersistenceError("No se pudo actualizar el recurso")
  }
  if (!data) throw new LibraryNotFoundError()
  const [dto] = await signRows(ctx, [data])
  return dto
}

/**
 * Archiva (soft-delete) un recurso y borra su archivo del storage si es `file`.
 */
export async function archiveResource(
  ctx: LibraryContext,
  id: string
): Promise<void> {
  const { data, error } = await (ctx.supabase as any)
    .from("library_resources")
    .update({ archived_at: new Date().toISOString() })
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .is("archived_at", null)
    .select("id, storage_path")
    .maybeSingle()

  if (error) {
    console.error("[library] Error archivando recurso", error.message)
    throw new LibraryPersistenceError("No se pudo borrar el recurso")
  }
  if (!data) throw new LibraryNotFoundError()

  if (data.storage_path) {
    const remove = await ctx.supabase.storage
      .from(LIBRARY_BUCKET)
      .remove([data.storage_path])
    if (remove.error) {
      console.warn("[library] No se pudo borrar el archivo del storage", {
        path: data.storage_path,
        cause: remove.error.message,
      })
    }
  }
}
