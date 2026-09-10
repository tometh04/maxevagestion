"use client"

import { format } from "date-fns"
import { ExternalLink, FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  QUOTATION_STATUS_LABELS,
  formatQuotationCurrency,
  getQuotationOptionPricing,
} from "@/lib/quotations/presentation"
import { getPublicQuotationPath } from "@/lib/quotations/public-links"
import { getQuotationStatusColors } from "@/lib/vibook-status-colors"
import type { OriginQuotation } from "@/lib/quotations/operation-origin"

/**
 * Filas de cotización reutilizables (VIB-184).
 *
 * Viven acá y no dentro de la card de "Origen" porque las consumen dos lugares
 * de la misma pantalla: el bloque de origen en la pestaña Info y el listado de
 * la pestaña Documentos. Duplicar el markup garantizaba que en algún momento
 * mostraran cosas distintas para la misma cotización.
 *
 * Son de sólo lectura a propósito: una cotización no se borra desde acá, se
 * gestiona en el CRM.
 */

export const QUOTATION_SOURCE_LABELS: Record<OriginQuotation["source"], string> = {
  OPERATION: "De esta operación",
  LEAD: "Del lead",
  CUSTOMER: "Del cliente",
}

export function formatRowDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : format(parsed, "dd/MM/yyyy")
}

export interface QuotationFileLike {
  id: string
  file_url: string
  uploaded_at: string
  fromLead?: boolean
  fromCustomer?: boolean
}

function QuotationAmount({ quotation }: { quotation: OriginQuotation }) {
  const pricing = getQuotationOptionPricing(
    { total_amount: quotation.total_amount },
    {
      adults: quotation.adults,
      children: quotation.children,
      infants: quotation.infants,
      pricing_mode: quotation.pricing_mode,
    }
  )

  return (
    <div className="text-right">
      <p className="text-sm font-medium tabular-nums">
        {formatQuotationCurrency(pricing.primaryAmount, quotation.currency)}
      </p>
      <p className="text-xs text-muted-foreground">{pricing.primaryLabel}</p>
    </div>
  )
}

/** Cotización armada con el cotizador (tabla `quotations`). */
export function QuotationRow({ quotation }: { quotation: OriginQuotation }) {
  const colors = getQuotationStatusColors(quotation.status)
  const createdAt = formatRowDate(quotation.created_at)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 bg-muted/20 p-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">#{quotation.quotation_number}</span>
          <Badge variant="outline" className={`${colors.bg} ${colors.text} ${colors.border}`}>
            {QUOTATION_STATUS_LABELS[quotation.status] || quotation.status}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {QUOTATION_SOURCE_LABELS[quotation.source]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {[quotation.destination, createdAt && `Creada ${createdAt}`, quotation.seller_name]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <QuotationAmount quotation={quotation} />
        {quotation.public_token ? (
          <Button asChild size="sm" variant="ghost">
            <a
              href={getPublicQuotationPath(quotation.public_token)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </a>
          </Button>
        ) : (
          // Sin token público no hay página que abrir: decirlo es mejor que un
          // botón que no lleva a ningún lado.
          <span className="text-xs text-muted-foreground">Sin link público</span>
        )}
      </div>
    </div>
  )
}

/** Cotización hecha con otra app y subida como archivo (`documents` type QUOTATION). */
export function QuotationFileRow({ file }: { file: QuotationFileLike }) {
  const uploadedAt = formatRowDate(file.uploaded_at)
  const sourceLabel = file.fromLead
    ? QUOTATION_SOURCE_LABELS.LEAD
    : file.fromCustomer
      ? QUOTATION_SOURCE_LABELS.CUSTOMER
      : QUOTATION_SOURCE_LABELS.OPERATION

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 bg-muted/20 p-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">Cotización adjunta</span>
          <Badge variant="secondary" className="text-[10px]">
            {sourceLabel}
          </Badge>
        </div>
        {uploadedAt && <p className="text-xs text-muted-foreground">Subida {uploadedAt}</p>}
      </div>
      <Button asChild size="sm" variant="ghost">
        <a href={file.file_url} target="_blank" rel="noopener noreferrer">
          Abrir
          <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
        </a>
      </Button>
    </div>
  )
}
