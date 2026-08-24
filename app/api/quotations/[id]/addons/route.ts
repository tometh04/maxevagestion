import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/** See the price route: add-ons are part of the same atomic document draft. */
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
