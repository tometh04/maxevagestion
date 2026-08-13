import { NextResponse } from "next/server"
import {
  resolveLibraryRequest,
  libraryErrorResponse,
  forbidden,
} from "@/lib/library/http"
import { updateCategory, deleteCategory } from "@/lib/library/category-service"

export const dynamic = "force-dynamic"

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
    const category = await updateCategory(req.ctx, id, {
      name: body.name,
      icon: body.icon,
      sort_order: body.sort_order,
    })
    return NextResponse.json({ category })
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
    await deleteCategory(req.ctx, id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return libraryErrorResponse(error)
  }
}
