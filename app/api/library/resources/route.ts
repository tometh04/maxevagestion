import { NextResponse } from "next/server"
import {
  resolveLibraryRequest,
  libraryErrorResponse,
  forbidden,
} from "@/lib/library/http"
import { LibraryValidationError } from "@/lib/library/access"
import {
  listResourcesForViewer,
  listResourcesForAdmin,
  createLinkResource,
  createFileResource,
} from "@/lib/library/resource-service"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const req = await resolveLibraryRequest()
    if (!req.ok) return req.response

    const { searchParams } = new URL(request.url)
    const scope = searchParams.get("scope")

    // Vista de gestión: solo para quien puede administrar.
    if (scope === "admin") {
      if (!req.canManage) return forbidden()
      const resources = await listResourcesForAdmin(req.ctx)
      return NextResponse.json({ resources })
    }

    // Vista de consulta: los managers ven todo el material publicado;
    // el resto solo lo dirigido a sus roles.
    const resources = await listResourcesForViewer(req.ctx, {
      includeAllTargets: req.canManage,
    })
    return NextResponse.json({ resources })
  } catch (error) {
    return libraryErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const req = await resolveLibraryRequest()
    if (!req.ok) return req.response
    if (!req.canManage) return forbidden()

    const body = await request.json().catch(() => ({}))
    const common = {
      title: body.title,
      description: body.description ?? null,
      categoryId: body.categoryId ?? null,
      targetRoles: Array.isArray(body.targetRoles) ? body.targetRoles : [],
      published: body.published ?? true,
      sortOrder: body.sortOrder,
    }

    if (body.resource_type === "link") {
      const resource = await createLinkResource(req.ctx, {
        ...common,
        externalUrl: body.externalUrl,
      })
      return NextResponse.json({ resource }, { status: 201 })
    }

    if (body.resource_type === "file") {
      const resource = await createFileResource(req.ctx, {
        ...common,
        storagePath: body.storagePath,
        fileMimeType: body.fileMimeType,
        fileSize: body.fileSize ?? null,
        originalFileName: body.originalFileName ?? null,
      })
      return NextResponse.json({ resource }, { status: 201 })
    }

    throw new LibraryValidationError("Tipo de recurso inválido")
  } catch (error) {
    return libraryErrorResponse(error)
  }
}
