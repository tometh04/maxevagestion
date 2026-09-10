"use client"

import Link from "next/link"
import { ExternalLink, Sprout } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  QuotationFileRow,
  QuotationRow,
  formatRowDate,
  type QuotationFileLike,
} from "@/components/quotations/quotation-rows"
import type { OperationOrigin } from "@/lib/quotations/operation-origin"

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

export type OriginQuotationFile = QuotationFileLike

interface OperationOriginSectionProps {
  origin: OperationOrigin
  /** Adjuntos type QUOTATION que ya viajaban en el listado de documentos. */
  quotationFiles: OriginQuotationFile[]
}

export function OperationOriginSection({ origin, quotationFiles }: OperationOriginSectionProps) {
  const { lead, quotations } = origin
  const hasSomething = Boolean(lead) || quotations.length > 0 || quotationFiles.length > 0

  // Una operación cargada a mano no tiene origen que contar: no se dibuja una
  // card vacía sólo para decir que no hay nada.
  if (!hasSomething) return null

  const leadCreatedAt = formatRowDate(lead?.created_at)

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
                  {[
                    lead.destination,
                    lead.seller_name && `Vendedor: ${lead.seller_name}`,
                    leadCreatedAt && `Creado ${leadCreatedAt}`,
                  ]
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
              {quotations.map((quotation) => (
                <QuotationRow key={quotation.id} quotation={quotation} />
              ))}
              {quotationFiles.map((file) => (
                <QuotationFileRow key={file.id} file={file} />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
