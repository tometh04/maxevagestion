import { NextResponse } from "next/server"
import {
  resolveLibraryRequest,
  libraryErrorResponse,
  forbidden,
} from "@/lib/library/http"
import { listCategories, createCategory } from "@/lib/library/category-service"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const req = await resolveLibraryRequest()
    if (!req.ok) return req.response
    const categories = await listCategories(req.ctx)
    return NextResponse.json({ categories })
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
    const category = await createCategory(req.ctx, {
      name: body.name,
      icon: body.icon ?? null,
      sort_order: body.sort_order,
    })
    return NextResponse.json({ category }, { status: 201 })
  } catch (error) {
    return libraryErrorResponse(error)
  }
}
