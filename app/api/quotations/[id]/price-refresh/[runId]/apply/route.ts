import { NextResponse } from "next/server"
import { z } from "zod"
import {
  quotationRefreshHttpError,
  quotationRefreshRequestContext,
} from "@/lib/quotation-refresh/http-server"

export const dynamic = "force-dynamic"

const applySchema = z.object({
  expected_updated_at: z.string().datetime({ offset: true }),
  expected_run_updated_at: z.string().datetime({ offset: true }),
  decisions: z.array(z.object({
    line_id: z.string().uuid(),
    action: z.enum(["USE_REFRESHED", "USE_REPLACEMENT", "KEEP_CURRENT"]),
    candidate_id: z.string().min(1).max(1024).optional(),
  }).strict()).max(500),
  option_decisions: z.array(z.object({
    option_id: z.string().uuid(),
    sale_total: z.number().positive().max(1_000_000_000).nullable(),
    confirmed: z.boolean(),
  }).strict()).min(1).max(50),
}).strict()

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  try {
    const { id, runId } = await params
    const context = await quotationRefreshRequestContext(id, "write")
    const parsed = applySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_INPUT", message: "Las decisiones de actualización no son válidas.", issues: parsed.error.issues } },
        { status: 400 }
      )
    }
    const run = await context.module.apply({
      quotationId: id,
      runId,
      orgId: context.quotation.org_id,
      agencyId: context.quotation.agency_id,
      actorId: context.user.id,
      expectedUpdatedAt: parsed.data.expected_updated_at,
      expectedRunUpdatedAt: parsed.data.expected_run_updated_at,
      decisions: parsed.data.decisions,
      optionDecisions: parsed.data.option_decisions,
    })
    return NextResponse.json({ data: { run } }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error
    const response = quotationRefreshHttpError(error)
    return NextResponse.json(response.body, { status: response.status })
  }
}
