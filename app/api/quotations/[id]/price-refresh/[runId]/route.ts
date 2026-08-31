import { NextResponse } from "next/server"
import { z } from "zod"
import {
  quotationRefreshHttpError,
  quotationRefreshRequestContext,
} from "@/lib/quotation-refresh/http-server"

export const dynamic = "force-dynamic"

const discardSchema = z.object({
  expected_run_updated_at: z.string().datetime({ offset: true }),
}).strict()

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  try {
    const { id, runId } = await params
    const context = await quotationRefreshRequestContext(id, "write")
    const run = await context.module.read({
      quotationId: id,
      runId,
      orgId: context.quotation.org_id,
      agencyId: context.quotation.agency_id,
    })
    return NextResponse.json({ data: { run } }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error
    const response = quotationRefreshHttpError(error)
    return NextResponse.json(response.body, { status: response.status })
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  try {
    const { id, runId } = await params
    const context = await quotationRefreshRequestContext(id, "write")
    const parsed = discardSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_INPUT", message: "La solicitud para descartar la propuesta no es válida.", issues: parsed.error.issues } },
        { status: 400 }
      )
    }
    const run = await context.module.discard({
      quotationId: id,
      runId,
      orgId: context.quotation.org_id,
      agencyId: context.quotation.agency_id,
      expectedRunUpdatedAt: parsed.data.expected_run_updated_at,
    })
    return NextResponse.json({ data: { run } }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error
    const response = quotationRefreshHttpError(error)
    return NextResponse.json(response.body, { status: response.status })
  }
}
