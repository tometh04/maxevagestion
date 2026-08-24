import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { quotationDocumentToPresentation } from "@/lib/quotation-documents/presentation"
import {
  QuotationDocumentServerError,
  renderQuotationDocumentForPublic,
} from "@/lib/quotation-documents/server"

export const dynamic = "force-dynamic"

const acceptSchema = z.object({
  option_id: z.string().uuid(),
  issued_document_id: z.string().uuid(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const document = await renderQuotationDocumentForPublic({
      supabase: createAdminClient(),
      token,
    })
    return NextResponse.json({
      data: quotationDocumentToPresentation(document.model, document.quotationStatus),
      document: {
        issued_document_id: document.issuedDocumentId,
        content_hash: document.contentHash,
        acceptance_enabled: Boolean(document.issuedDocumentId),
      },
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof QuotationDocumentServerError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "NOT_ISSUED" ? 409 : 500
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    console.error("[public-quotations] read failed", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const parsed = acceptSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: "Solicitud de aceptación inválida" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin.rpc("accept_issued_quotation_option", {
      p_public_token: token,
      p_document_id: parsed.data.issued_document_id,
      p_content_hash: parsed.data.content_hash,
      p_option_id: parsed.data.option_id,
    })
    if (error) {
      console.error("[public-quotations] atomic acceptance failed", error)
      return NextResponse.json({ error: "No se pudo aceptar la cotización" }, { status: 500 })
    }

    const result = data && typeof data === "object" && !Array.isArray(data)
      ? data as Record<string, unknown>
      : {}
    if (result.accepted !== true) {
      const code = String(result.code || "INVALID_STATE")
      const response = code === "NOT_FOUND"
        ? { status: 404, error: "Cotización no encontrada" }
        : code === "EXPIRED"
          ? { status: 400, error: "La cotización ha vencido" }
          : code === "DOCUMENT_CHANGED"
            ? { status: 409, error: "La propuesta cambió. Actualizá la página antes de aceptar." }
            : code === "OPTION_NOT_FOUND"
              ? { status: 400, error: "La opción elegida no pertenece al documento" }
              : { status: 409, error: "Esta cotización ya no puede ser aceptada" }
      return NextResponse.json({ error: response.error, code }, { status: response.status })
    }

    const sellerId = typeof result.seller_id === "string" ? result.seller_id : null
    const orgId = typeof result.org_id === "string" ? result.org_id : null
    if (sellerId && orgId) {
      const quotationNumber = typeof result.quotation_number === "string" ? result.quotation_number : ""
      const destination = typeof result.destination === "string" ? result.destination : ""
      const description = `Cliente aceptó cotización ${quotationNumber}${destination ? ` a ${destination}` : ""}`.trim()
      const { error: alertError } = await admin.from("alerts").insert({
        user_id: sellerId,
        org_id: orgId,
        type: "QUOTATION_ACCEPTED",
        description,
        date_due: new Date().toISOString().split("T")[0],
        status: "PENDING",
      })
      if (alertError) {
        console.warn("[public-quotations] acceptance alert failed", alertError.message)
      }
    }

    return NextResponse.json({ success: true, message: "Cotización aceptada" })
  } catch (error) {
    console.error("[public-quotations] unexpected acceptance error", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
