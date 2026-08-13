import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

// VIB-70 — Biblioteca (capacitaciones).
// Contexto y tipos del bounded context "library". El alcance es por org: todo
// se scopea por org_id. El filtro por rol (target_roles) es visibilidad de
// negocio y se resuelve acá, no en RLS.

export const LIBRARY_BUCKET = "library-assets"

/** 500MB — los videos pueden ser pesados. Coincide con el file_size_limit del bucket. */
export const LIBRARY_MAX_FILE_BYTES = 500 * 1024 * 1024

/** MIME permitidos -> extensión. Debe coincidir con allowed_mime_types del bucket. */
export const LIBRARY_MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
}

/**
 * Roles que se pueden elegir como destinatarios de un recurso. SUPER_ADMIN y
 * ORG_OWNER no se listan: siempre ven todo. Debe coincidir con el CHECK
 * library_resources_target_roles_check de la migración.
 */
export const LIBRARY_TARGET_ROLES = [
  "ADMIN",
  "CONTABLE",
  "SELLER",
  "VIEWER",
  "POST_VENTA",
] as const

export type LibraryTargetRole = (typeof LIBRARY_TARGET_ROLES)[number]

export type LibraryResourceType = "file" | "link"

/**
 * Contexto de request para el módulo. Se arma en la API route a partir de
 * getRequestPermissions(). `userRoles` son los roles efectivos del usuario
 * (role + additional_roles), usados para filtrar destinatarios.
 */
export interface LibraryContext {
  supabase: SupabaseClient<Database>
  orgId: string
  userId: string
  userRoles: string[]
}

export interface LibraryCategory {
  id: string
  name: string
  slug: string
  icon: string | null
  sort_order: number
  resource_count?: number
  created_at: string
  updated_at: string
}

export interface LibraryResource {
  id: string
  category_id: string | null
  category_name?: string | null
  category_slug?: string | null
  title: string
  description: string | null
  resource_type: LibraryResourceType
  /** signed URL para recursos `file`; null para `link`. */
  url: string | null
  external_url: string | null
  file_mime_type: string | null
  file_size: number | null
  original_file_name: string | null
  target_roles: string[]
  published: boolean
  sort_order: number
  created_at: string
  updated_at: string
}
