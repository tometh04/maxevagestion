import { NextResponse } from "next/server"
import { z } from "zod"
import {
  quotationRefreshHttpError,
  quotationRefreshRequestContext,
} from "@/lib/quotation-refresh/http-server"

export const dynamic = "force-dynamic"

const startSchema = z.object({
  expected_updated_at: z.string().datetime({ offset: true }),
  idempotency_key: z.string().uuid(),
}).strict()

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const parsed = startSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_INPUT", message: "La solicitud de actualización no es válida.", issues: parsed.error.issues } },
        { status: 400 }
      )
    }
    const context = await quotationRefreshRequestContext(id, "write")
    const run = await context.module.start({
      quotationId: id,
      orgId: context.quotation.org_id,
      agencyId: context.quotation.agency_id,
      actorId: context.user.id,
      expectedUpdatedAt: parsed.data.expected_updated_at,
      idempotencyKey: parsed.data.idempotency_key,
    })
    return NextResponse.json({ data: { run } }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if ((error as { digest?: string })?.digest === "NEXT_REDIRECT") throw error
    const response = quotationRefreshHttpError(error)
    return NextResponse.json(response.body, { status: response.status })
  }
}
