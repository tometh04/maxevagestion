"use client"

import Link from "next/link"
import { format } from "date-fns"
import { ExternalLink, FileText, Sprout } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  QUOTATION_STATUS_LABELS,
  formatQuotationCurrency,
  getQuotationOptionPricing,
} from "@/lib/quotations/presentation"
import { getPublicQuotationPath } from "@/lib/quotations/public-links"
import { getQuotationStatusColors } from "@/lib/vibook-status-colors"
import type { OperationOrigin, OriginQuotation } from "@/lib/quotations/operation-origin"

/**
 * "Origen de la venta" (VIB-184): de dónde salió esta operación.
 *
 * Junta en un solo lugar el lead que la originó y las cotizaciones que se
 * armaron para cerrarla, sean del cotizador (`quotations`) o subidas como
 * archivo desde otra app (`documents` con type `QUOTATION`). Antes había que
 * abrir el CRM en otra pestaña y buscar el lead a mano.
 *
 * El componente no decide permisos: si el usuario no puede ver leads, el server
 * manda `origin` vacío y esto no se renderiza.
 */

export interface OriginQuotationFile {
  id: string
  file_url: string
  uploaded_at: string
  fromLead?: boolean
  fromCustomer?: boolean
}

interface OperationOriginSectionProps {
  origin: OperationOrigin
  /** Adjuntos type QUOTATION que ya viajaban en el listado de documentos. */
  quotationFiles: OriginQuotationFile[]
}

const SOURCE_LABELS: Record<OriginQuotation["source"], string> = {
  OPERATION: "De esta operación",
  LEAD: "Del lead",
  CUSTOMER: "Del cliente",
}

function formatDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : format(parsed, "dd/MM/yyyy")
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

export function OperationOriginSection({ origin, quotationFiles }: OperationOriginSectionProps) {
  const { lead, quotations } = origin
  const hasSomething = Boolean(lead) || quotations.length > 0 || quotationFiles.length > 0

  // Una operación cargada a mano no tiene origen que contar: no se dibuja una
  // card vacía sólo para decir que no hay nada.
  if (!hasSomething) return null

  const leadCreatedAt = formatDate(lead?.created_at)

  return (
    <Card className="rounded-xl border border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sprout className="h-4 w-4 text-muted-foreground" />
          Origen de la venta
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {lead && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{lead.contact_name}</p>
                <p className="text-xs text-muted-foreground">
                  {[lead.destination, lead.seller_name && `Vendedor: ${lead.seller_name}`, leadCreatedAt && `Creado ${leadCreatedAt}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href={`/sales/crm-manychat?leadId=${lead.id}`}>
                  Ver en CRM
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Presupuesto</p>
                <p className="mt-0.5 text-sm font-medium tabular-nums">
                  {lead.quoted_price === null
                    ? "-"
                    : lead.quoted_price.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Región</p>
                <p className="mt-0.5 text-sm font-medium">{lead.region || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Canal</p>
                <p className="mt-0.5 text-sm font-medium">{lead.source || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contacto</p>
                <p className="mt-0.5 truncate text-sm font-medium">
                  {lead.contact_phone || lead.contact_email || "-"}
                </p>
              </div>
            </div>

            {lead.notes && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notas del lead</p>
                <p className="mt-1 whitespace-pre-wrap rounded-xl border border-border/40 bg-muted/20 p-3 text-sm">
                  {lead.notes}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cotizaciones</p>

          {quotations.length === 0 && quotationFiles.length === 0 ? (
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
              Este lead no tiene cotizaciones cargadas
            </div>
          ) : (
            <div className="space-y-2">
              {quotations.map((quotation) => {
                const colors = getQuotationStatusColors(quotation.status)
                const createdAt = formatDate(quotation.created_at)

                return (
                  <div
                    key={quotation.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 bg-muted/20 p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">#{quotation.quotation_number}</span>
                        <Badge variant="outline" className={`${colors.bg} ${colors.text} ${colors.border}`}>
                          {QUOTATION_STATUS_LABELS[quotation.status] || quotation.status}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {SOURCE_LABELS[quotation.source]}
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
                        // Sin token público no hay página que abrir: decirlo es
                        // mejor que un botón que no lleva a ningún lado.
                        <span className="text-xs text-muted-foreground">Sin link público</span>
                      )}
                    </div>
                  </div>
                )
              })}

              {quotationFiles.map((file) => {
                const uploadedAt = formatDate(file.uploaded_at)
                const sourceLabel = file.fromLead
                  ? SOURCE_LABELS.LEAD
                  : file.fromCustomer
                    ? SOURCE_LABELS.CUSTOMER
                    : SOURCE_LABELS.OPERATION

                return (
                  <div
                    key={file.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 bg-muted/20 p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-medium">Cotización adjunta</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {sourceLabel}
                        </Badge>
                      </div>
                      {uploadedAt && (
                        <p className="text-xs text-muted-foreground">Subida {uploadedAt}</p>
                      )}
                    </div>
                    <Button asChild size="sm" variant="ghost">
                      <a href={file.file_url} target="_blank" rel="noopener noreferrer">
                        Abrir
                        <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
