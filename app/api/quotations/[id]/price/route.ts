import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Retired in favour of PUT /api/quotations/[id]/document.
 *
 * A price cannot be changed safely in isolation: every customer-visible field
 * and every option price must be persisted atomically while invalidating the
 * previously issued snapshot. Keeping this endpoint writable would re-open a
 * path where the public document and the accepted commercial value diverge.
 */
export async function PATCH(
  _request: Request,
  _context: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    {
      error: "Este endpoint fue reemplazado por la preparación atómica del documento",
      code: "QUOTATION_DOCUMENT_PREPARE_REQUIRED",
    },
    { status: 410 }
  )
}
