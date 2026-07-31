import { NextResponse } from "next/server"
import {
  resolveLibraryRequest,
  libraryErrorResponse,
  forbidden,
} from "@/lib/library/http"
import {
  getSignedResource,
  updateResource,
  archiveResource,
} from "@/lib/library/resource-service"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const req = await resolveLibraryRequest()
    if (!req.ok) return req.response
    const { id } = await params
    const resource = await getSignedResource(req.ctx, id)
    return NextResponse.json({ resource })
  } catch (error) {
    return libraryErrorResponse(error)
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const req = await resolveLibraryRequest()
    if (!req.ok) return req.response
    if (!req.canManage) return forbidden()

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const resource = await updateResource(req.ctx, id, {
      title: body.title,
      description: body.description,
      categoryId: body.categoryId,
      targetRoles: body.targetRoles,
      published: body.published,
      sortOrder: body.sortOrder,
    })
    return NextResponse.json({ resource })
  } catch (error) {
    return libraryErrorResponse(error)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const req = await resolveLibraryRequest()
    if (!req.ok) return req.response
    if (!req.canManage) return forbidden()

    const { id } = await params
    await archiveResource(req.ctx, id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return libraryErrorResponse(error)
  }
}
