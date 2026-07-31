import { NextResponse } from "next/server"
import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction } from "@/lib/permissions-api"
import {
  buildLibraryContext,
  LibraryNotFoundError,
  LibraryPersistenceError,
  LibraryValidationError,
} from "./access"
import type { LibraryContext } from "./types"

type CurrentUser = Awaited<
  ReturnType<typeof getRequestPermissions>
>["user"]

interface ResolvedLibraryRequest {
  ok: true
  user: CurrentUser
  ctx: LibraryContext
  /** true si el usuario puede gestionar (crear/editar/borrar). */
  canManage: boolean
}

interface RejectedLibraryRequest {
  ok: false
  response: NextResponse
}

/**
 * Boilerplate común de las routes de la Biblioteca: resuelve permisos, exige
 * org_id y el permiso de lectura del módulo, y arma el contexto. Devuelve
 * `canManage` para que las routes de escritura lo verifiquen.
 */
export async function resolveLibraryRequest(): Promise<
  ResolvedLibraryRequest | RejectedLibraryRequest
> {
  const { user, supabase, matrix } = await getRequestPermissions()

  if (!(user as any)?.org_id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Usuario sin organización asociada" },
        { status: 400 }
      ),
    }
  }

  if (!canPerformAction(user, "library", "read", matrix ?? undefined)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  const ctx = buildLibraryContext({ supabase, user: user as any })
  const canManage = canPerformAction(user, "library", "write", matrix ?? undefined)
  return { ok: true, user, ctx, canManage }
}

/** Respuesta 403 estándar para acciones de gestión. */
export function forbidden(): NextResponse {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

/** Mapea los errores del dominio a respuestas HTTP. */
export function libraryErrorResponse(error: unknown): NextResponse {
  if (error instanceof LibraryValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof LibraryNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof LibraryPersistenceError) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  console.error("[library] Error no controlado en route", error)
  return NextResponse.json({ error: "Error interno" }, { status: 500 })
}
