import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { quotationDocumentToPresentation } from "@/lib/quotation-documents/presentation"
import {
  QuotationDocumentServerError,
  renderQuotationDocumentForPublic,
} from "@/lib/quotation-documents/server"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = createAdminClient()
    const document = await renderQuotationDocumentForPublic({ supabase, token })

    return NextResponse.json({
      document: {
        html: document.html,
        filename: document.filename,
        pageCount: document.pageCount,
        layoutKey: document.layoutKey,
        layoutVersion: document.layoutVersion,
        revisionId: document.revisionId,
        issuedDocumentId: document.issuedDocumentId,
        contentHash: document.contentHash,
        quotationStatus: document.quotationStatus,
        acceptanceEnabled: Boolean(document.issuedDocumentId),
        presentation: quotationDocumentToPresentation(
          document.model,
          document.quotationStatus
        ),
        branding: {
          // Emisiones nuevas guardan el logo como data URI dentro del snapshot;
          // así el chrome público no cambia si luego reemplazan el archivo.
          brand_logo: document.model.agency.logoUrl?.startsWith("data:")
            ? document.model.agency.logoUrl
            : document.manifest.assets.logoPath || document.model.agency.logoUrl,
          brand_color: document.manifest.theme.primaryColor,
          company_name: document.manifest.branding.displayName || document.model.agency.name,
          company_address: document.manifest.branding.address || document.model.agency.address,
          company_phone: document.manifest.branding.phone || document.model.agency.phone,
          company_email: document.manifest.branding.email || document.model.agency.email,
          company_website: document.manifest.branding.website || document.model.agency.website,
          company_instagram: document.manifest.branding.instagram || document.model.agency.instagram,
          company_legajo: document.manifest.branding.travelLicense || document.model.agency.travelLicense,
          company_tax_id: document.manifest.branding.taxId || document.model.agency.taxId,
        },
      },
    }, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error: unknown) {
    if (error instanceof QuotationDocumentServerError && error.code === "NOT_FOUND") {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }
    if (error instanceof QuotationDocumentServerError && error.code === "NOT_ISSUED") {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 })
    }
    console.error("[public-quotation-document] generation failed", error)
    return NextResponse.json({ error: "No se pudo cargar la cotización" }, { status: 500 })
  }
}
