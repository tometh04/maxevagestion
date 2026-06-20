"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Download, Loader2 } from "lucide-react"
import {
  renderQuotationHtmlDocument,
  type OrganizationBrandingSettings,
} from "@/lib/pdf/quotation-pdf-html"
import { getQuotationStatusColors } from "@/lib/vibook-status-colors"
import {
  QUOTATION_STATUS_LABELS,
  type QuotationPresentationData,
} from "@/lib/quotations/presentation"
import type {
  PublicQuotationBranding,
  PublicQuotationViewMode,
} from "./public-quotation-document"

/** Ancho A4 en px del template (mismo valor que usa el render a PDF). */
const DOC_WIDTH = 794

interface Props {
  mode: PublicQuotationViewMode
  data: QuotationPresentationData
  branding: PublicQuotationBranding
  accepting: boolean
  downloading: boolean
  onAccept: (optionId: string) => void
  onDownload: () => void
}

/**
 * Embebe el HTML del template (idéntico al PDF) y lo escala para entrar en el
 * ancho disponible: full size en desktop, ajustado al ancho en mobile. Mide el
 * contenedor con ResizeObserver y recalcula al cargar imágenes (logo/fotos),
 * que cambian la altura.
 */
function ScaledDocument({ html }: { html: string }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState<number | undefined>(undefined)

  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    const recompute = () => {
      const available = outer.clientWidth
      const s = Math.min(1, available / DOC_WIDTH)
      setScale(s)
      setHeight(inner.scrollHeight * s)
    }

    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(outer)

    const imgs = Array.from(inner.querySelectorAll("img"))
    imgs.forEach((img) => {
      if (!img.complete) img.addEventListener("load", recompute, { once: true })
    })

    return () => ro.disconnect()
  }, [html])

  return (
    <div ref={outerRef} className="w-full overflow-hidden">
      <div style={{ height }}>
        <div
          ref={innerRef}
          className="quote-doc-sheets"
          style={{ width: DOC_WIDTH, transformOrigin: "top left", transform: `scale(${scale})` }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}

// Estilos de "hoja A4" para las páginas del template embebido en pantalla
// (el render a PDF las dimensiona aparte; en pantalla las pintamos como papel).
const SHEET_STYLES = `
  .quote-doc-sheets [data-pdf-page] {
    width: ${DOC_WIDTH}px;
    min-height: 1123px;
    margin: 0 auto 20px;
    background: #fff;
    box-shadow: 0 1px 10px rgba(0, 0, 0, 0.12);
    overflow: hidden;
  }
`

const PRINT_STYLES = `
  .quote-doc-print [data-pdf-page] {
    width: ${DOC_WIDTH}px;
    min-height: 1123px;
    margin: 0 auto;
    background: #fff;
  }
  @media print {
    .quote-doc-print [data-pdf-page] { page-break-after: always; box-shadow: none; }
    .quote-doc-print [data-pdf-page]:last-child { page-break-after: auto; }
  }
`

export function PublicQuotationHtmlDocument({
  mode,
  data,
  branding,
  accepting,
  downloading,
  onAccept,
  onDownload,
}: Props) {
  const html = useMemo(
    () => renderQuotationHtmlDocument(data, branding as unknown as OrganizationBrandingSettings),
    [data, branding]
  )

  const brandColor = branding.brand_color || "#f97316"
  const companyName = branding.company_name || data.agency_name
  const logoUrl = branding.brand_logo || null

  const statusColors = getQuotationStatusColors(data.status)
  const statusLabel = QUOTATION_STATUS_LABELS[data.status] || QUOTATION_STATUS_LABELS.DRAFT
  const canAccept = mode === "interactive" && ["SENT", "PENDING_APPROVAL"].includes(data.status)
  const accepted = ["APPROVED", "CONVERTED"].includes(data.status)

  const options = data.options.slice().sort((a, b) => a.option_number - b.option_number)
  const singleOption = options.length === 1

  // Modo print: documento a tamaño real, sin chrome, con saltos de página.
  // La vista dispara window.print() automáticamente cuando mode === "print".
  if (mode === "print") {
    return (
      <div className="light-force bg-white quote-doc-print">
        <style>{PRINT_STYLES}</style>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    )
  }

  return (
    <div className="light-force min-h-screen bg-muted">
      <style>{SHEET_STYLES}</style>

      {/* Barra superior */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={companyName}
                  width={144}
                  height={36}
                  unoptimized
                  className="h-9 w-auto object-contain"
                />
              ) : (
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0"
                  style={{ backgroundColor: brandColor }}
                >
                  {companyName.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="font-bold text-sm truncate" style={{ color: brandColor }}>
                  {companyName}
                </h2>
                <p className="text-xs text-muted-foreground">Cotización #{data.quotation_number}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={onDownload}
                disabled={downloading}
                className="h-9 gap-1.5"
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="hidden sm:inline">Descargar PDF</span>
              </Button>
              <Badge className={`${statusColors.bg} ${statusColors.text} ${statusColors.border} border`}>
                {statusLabel}
              </Badge>
            </div>
          </div>
        </div>
        <div className="h-1" style={{ backgroundColor: brandColor }} />
      </div>

      {/* Documento embebido (escalado al ancho) */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <ScaledDocument html={html} />
      </div>

      {/* Estado aceptada */}
      {accepted && (
        <div className="max-w-4xl mx-auto px-4 pb-6">
          <div className="rounded-xl border border-success/15 bg-success/5 p-5 text-center">
            <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-2" />
            <h3 className="text-lg font-bold text-success">Cotización aceptada</h3>
            <p className="text-sm text-success mt-1 max-w-md mx-auto">
              Tu asesor <span className="font-semibold">{data.seller_name}</span> se pondrá en contacto para continuar con la reserva.
            </p>
          </div>
        </div>
      )}

      {/* Barra de aceptación (fija abajo) */}
      {canAccept && (
        <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur border-t shadow-[0_-1px_10px_rgba(0,0,0,0.06)]">
          <div className="max-w-4xl mx-auto px-4 py-3">
            {singleOption ? (
              <Button
                className="w-full text-white font-semibold h-12 rounded-xl shadow-md"
                style={{ backgroundColor: brandColor }}
                onClick={() => onAccept(options[0].id)}
                disabled={accepting}
              >
                {accepting ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
                Aceptar esta cotización
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-center text-muted-foreground font-medium">Elegí la opción que querés aceptar</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {options.map((option) => (
                    <Button
                      key={option.id}
                      className="text-white font-semibold h-11 rounded-xl shadow-md"
                      style={{ backgroundColor: brandColor }}
                      onClick={() => onAccept(option.id)}
                      disabled={accepting}
                    >
                      {accepting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}
                      <span className="truncate">Aceptar {option.title}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
