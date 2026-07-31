import { NextResponse } from "next/server"
import {
  resolveLibraryRequest,
  libraryErrorResponse,
  forbidden,
} from "@/lib/library/http"
import { createUploadTarget } from "@/lib/library/upload-service"

export const dynamic = "force-dynamic"

/**
 * Devuelve una signed upload URL para subir un archivo directo al bucket privado
 * (cliente -> storage). Luego el cliente confirma con POST /api/library/resources
 * (resource_type: "file", storagePath, ...).
 */
export async function POST(request: Request) {
  try {
    const req = await resolveLibraryRequest()
    if (!req.ok) return req.response
    if (!req.canManage) return forbidden()

    const body = await request.json().catch(() => ({}))
    const target = await createUploadTarget(req.ctx, {
      fileName: body.fileName,
      mimeType: body.mimeType,
      size: body.size ?? null,
    })
    return NextResponse.json(target)
  } catch (error) {
    return libraryErrorResponse(error)
  }
}
