import type { LibraryContext, LibraryCategory } from "./types"
import { LibraryPersistenceError, LibraryValidationError } from "./access"

// Nota: las tablas library_* no están en los types generados hasta correr
// db:generate tras aplicar las migraciones. Usamos cast a `any` (mismo patrón
// que lib/support/kb.ts) hasta entonces.

const CATEGORY_COLUMNS =
  "id, name, slug, icon, sort_order, created_at, updated_at"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

function mapCategory(row: any): LibraryCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon ?? null,
    sort_order: row.sort_order,
    resource_count: row.library_resources?.[0]?.count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function listCategories(
  ctx: LibraryContext
): Promise<LibraryCategory[]> {
  const { data, error } = await (ctx.supabase as any)
    .from("library_categories")
    .select(`${CATEGORY_COLUMNS}, library_resources(count)`)
    .eq("org_id", ctx.orgId)
    .order("sort_order")

  if (error) {
    console.error("[library] Error listando categorías", error.message)
    throw new LibraryPersistenceError("No se pudieron cargar las categorías")
  }
  return (data ?? []).map(mapCategory)
}

export async function createCategory(
  ctx: LibraryContext,
  input: { name: string; icon?: string | null; sort_order?: number }
): Promise<LibraryCategory> {
  const name = input.name?.trim() ?? ""
  if (name.length < 2 || name.length > 120) {
    throw new LibraryValidationError("El nombre debe tener entre 2 y 120 caracteres")
  }
  const slug = slugify(name)
  if (!slug) {
    throw new LibraryValidationError("El nombre no es válido")
  }

  const { data, error } = await (ctx.supabase as any)
    .from("library_categories")
    .insert({
      org_id: ctx.orgId,
      name,
      slug,
      icon: input.icon ?? null,
      sort_order: input.sort_order ?? 0,
      created_by: ctx.userId,
    })
    .select(CATEGORY_COLUMNS)
    .single()

  if (error) {
    if (error.code === "23505") {
      throw new LibraryValidationError("Ya existe una categoría con ese nombre")
    }
    console.error("[library] Error creando categoría", error.message)
    throw new LibraryPersistenceError("No se pudo crear la categoría")
  }
  return mapCategory(data)
}

export async function updateCategory(
  ctx: LibraryContext,
  id: string,
  input: { name?: string; icon?: string | null; sort_order?: number }
): Promise<LibraryCategory> {
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length < 2 || name.length > 120) {
      throw new LibraryValidationError("El nombre debe tener entre 2 y 120 caracteres")
    }
    patch.name = name
    patch.slug = slugify(name)
  }
  if (input.icon !== undefined) patch.icon = input.icon
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order

  if (Object.keys(patch).length === 0) {
    throw new LibraryValidationError("No hay cambios para guardar")
  }

  const { data, error } = await (ctx.supabase as any)
    .from("library_categories")
    .update(patch)
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .select(CATEGORY_COLUMNS)
    .maybeSingle()

  if (error) {
    if (error.code === "23505") {
      throw new LibraryValidationError("Ya existe una categoría con ese nombre")
    }
    console.error("[library] Error actualizando categoría", error.message)
    throw new LibraryPersistenceError("No se pudo actualizar la categoría")
  }
  if (!data) throw new LibraryValidationError("Categoría no encontrada")
  return mapCategory(data)
}

/**
 * Borra la categoría. Los recursos asociados NO se borran: quedan con
 * category_id = NULL (ON DELETE SET NULL en la FK).
 */
export async function deleteCategory(
  ctx: LibraryContext,
  id: string
): Promise<void> {
  const { error } = await (ctx.supabase as any)
    .from("library_categories")
    .delete()
    .eq("org_id", ctx.orgId)
    .eq("id", id)

  if (error) {
    console.error("[library] Error borrando categoría", error.message)
    throw new LibraryPersistenceError("No se pudo borrar la categoría")
  }
}
