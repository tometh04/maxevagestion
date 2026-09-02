"use client"

import { useState, useEffect, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import Link from "next/link"
import { format } from "date-fns"
import {
  FileText, RefreshCw,
  Eye, Loader2, Briefcase, Download
} from "lucide-react"
import { downloadQuotationPdfFromPriceDialog } from "@/lib/pdf/quotation-pdf-html"
import {
  formatQuotationCurrency,
  getQuotationOptionPricing,
  QUOTATION_STATUS_LABELS,
} from "@/lib/quotations/presentation"
import { QuotationPdfPriceDialog } from "@/components/sales/quotation-pdf-price-dialog"
import { QuotationPriceRefreshDialog } from "@/components/sales/quotation-price-refresh-dialog"
import {
  fetchQuotationDocumentForUser,
  QuotationDocumentDownloadError,
  type QuotationDocumentPayload,
} from "@/lib/quotation-documents/client"
import { getQuotationCustomerTotal } from "@/lib/quotations/totals"
import { hasReadyQuotationDocument } from "@/lib/quotations/document-projection"
import { isQuotationContentEditable } from "@/lib/quotations/lifecycle"
import { getQuotationStatusColors } from "@/lib/vibook-status-colors"
import { QuotationQuotaCard } from "@/components/sales/quotation-quota-card"
import { QuotationBookingDialog } from "@/components/sales/quotation-booking-dialog"

interface QuotationsDashboardProps {
  sellers: Array<{ id: string; name: string }>
  agencies: Array<{ id: string; name: string }>
  currentUserRole: string
  currentUserId: string
}

function getQuotationDisplayAmount(quotation: any) {
  const options = Array.isArray(quotation.quotation_options)
    ? quotation.quotation_options
    : []
  const acceptedOption = options.find((option: any) => option.is_selected)
    || options.find((option: any) => Number(option.option_number) === 1)
    || { total_amount: quotation.total_amount || 0 }
  const customerTotal = getQuotationCustomerTotal(acceptedOption, {
    insuranceAmount: quotation.insurance_amount,
    transferAmount: quotation.transfer_amount,
  })
  const pricing = getQuotationOptionPricing(
    { total_amount: customerTotal },
    {
      adults: Number(quotation.adults || 0),
      children: Number(quotation.children || 0),
      infants: Number(quotation.infants || 0),
      pricing_mode: quotation.pricing_mode,
    }
  )

  return {
    amount: formatQuotationCurrency(pricing.primaryAmount, quotation.currency),
    label: pricing.primaryLabel,
  }
}

export function QuotationsDashboard({ sellers, agencies, currentUserRole, currentUserId }: QuotationsDashboardProps) {
  const [sellerId, setSellerId] = useState("ALL")
  const [agencyId, setAgencyId] = useState("ALL")
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0)
  const [quotationsList, setQuotationsList] = useState<any[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [selectedQuotation, setSelectedQuotation] = useState<any>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  // Cotización con el dialog "Cambiar precio" abierto antes de generar el PDF
  const [pdfPriceQuotation, setPdfPriceQuotation] = useState<any | null>(null)
  const [priceRefreshQuotationId, setPriceRefreshQuotationId] = useState<string | null>(null)

  const isSeller = currentUserRole === "SELLER"

  const fetchQuotationsList = useCallback(async () => {
    setLoadingList(true)
    try {
      const params = new URLSearchParams()
      if (sellerId !== "ALL") params.set("seller_id", sellerId)
      if (agencyId !== "ALL") params.set("agency_id", agencyId)
      params.set("limit", "100")

      const res = await fetch(`/api/quotations?${params}`, { cache: "no-store" })
      if (res.ok) {
        const json = await res.json()
        setQuotationsList(json.data || [])
      }
    } catch (err) {
      console.error("Error fetching quotations list:", err)
    } finally {
      setLoadingList(false)
    }
  }, [sellerId, agencyId])

  const handleDownloadPDF = async (
    quotation: any,
    propagateError = false,
    expectedUpdatedAt?: string
  ) => {
    const applyIssuedDocument = (document: QuotationDocumentPayload) => {
      if (!document.issuedDocumentId) return
      setQuotationsList(current => current.map(item => item.id === quotation.id
        ? {
            ...item,
            active_document_id: document.issuedDocumentId,
            status: document.quotationStatus || item.status,
            document: {
              status: "READY",
              active_document_id: document.issuedDocumentId,
            },
          }
        : item))
    }
    setDownloadingId(quotation.id)
    try {
      const document = await downloadQuotationPdfFromPriceDialog({
        quotationId: quotation.id,
        publicToken: quotation.public_token,
        expectedUpdatedAt,
      })
      applyIssuedDocument(document)
      void fetchQuotationsList()
      return document
    } catch (err) {
      console.error("Error downloading PDF:", err)
      if (err instanceof QuotationDocumentDownloadError) {
        applyIssuedDocument(err.document)
      }
      void fetchQuotationsList()
      if (propagateError) throw err
      toast.error(err instanceof Error ? err.message : "Error al descargar PDF")
    } finally {
      setDownloadingId(null)
    }
  }

  useEffect(() => {
    fetchQuotationsList()
  }, [fetchQuotationsList])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">PDFs emitidos y cotizaciones de la organización</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          void fetchQuotationsList()
          setQuotaRefreshKey((value) => value + 1)
        }} disabled={loadingList}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loadingList ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Filters */}
      {!isSeller && (
        <div className="flex gap-3 flex-wrap">
          <Select value={sellerId} onValueChange={setSellerId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los vendedores</SelectItem>
              {sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={agencyId} onValueChange={setAgencyId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Agencia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las agencias</SelectItem>
              {agencies.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <QuotationQuotaCard key={quotaRefreshKey} />

      {/* Quotations List Table */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Listado de Cotizaciones
        </h3>
        {loadingList ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : quotationsList.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No hay cotizaciones</p>
        ) : (
          <div className="rounded-xl border border-border/40">
            <div className="max-h-[50vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/50 z-10">
                  <TableRow>
                    <TableHead className="text-xs">Numero</TableHead>
                    <TableHead className="text-xs">Lead</TableHead>
                    <TableHead className="text-xs">Destino</TableHead>
                    <TableHead className="text-xs">Vendedor</TableHead>
                    <TableHead className="text-xs">Monto</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotationsList.map((q) => {
                    const statusColors = getQuotationStatusColors(q.status)
                    const statusLabel = QUOTATION_STATUS_LABELS[q.status] || q.status
                    const statusClasses = `${statusColors.bg} ${statusColors.text} ${statusColors.border}`
                    const documentReady = hasReadyQuotationDocument(q)
                    const quotationEditable = isQuotationContentEditable(q.status)
                    const canConvert = q.status === "APPROVED" || q.price_confirmation?.confirmed === true
                    const canRefreshPrices = ["DRAFT", "SENT", "PENDING_APPROVAL"].includes(q.status)
                    const displayAmount = getQuotationDisplayAmount(q)

                    return (
                      <TableRow key={q.id}>
                        <TableCell className="text-xs font-medium">{q.quotation_number}</TableCell>
                        <TableCell className="text-xs">
                          {q.lead?.contact_name || "-"}
                        </TableCell>
                        <TableCell className="text-xs">{q.destination}</TableCell>
                        <TableCell className="text-xs">{q.seller?.name || "-"}</TableCell>
                        <TableCell className="text-xs font-medium tabular-nums">
                          {displayAmount.amount}
                          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                            {displayAmount.label === "Precio por persona" ? "pp" : "total"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${statusClasses}`}>
                              {statusLabel}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={documentReady
                                ? "text-[10px] px-1.5 py-0 border-success/30 text-success"
                                : "text-[10px] px-1.5 py-0 text-muted-foreground"}
                            >
                              {documentReady ? "Documento emitido" : "Sin emitir"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(q.created_at), "dd/MM/yy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {canRefreshPrices && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => setPriceRefreshQuotationId(q.id)}
                                title="Actualizar precio y disponibilidad"
                                aria-label={`Actualizar precio y disponibilidad de ${q.quotation_number}`}
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {q.public_token && q.active_document_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => window.open(`/cotizacion/${q.public_token}`, "_blank")}
                                title="Ver cotizacion publica"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                if (quotationEditable) {
                                  setPdfPriceQuotation(q)
                                } else {
                                  void handleDownloadPDF(q)
                                }
                              }}
                              disabled={downloadingId === q.id || (!quotationEditable && !documentReady)}
                              title={!quotationEditable && !documentReady ? "La cotización no tiene un PDF emitido" : "Descargar PDF"}
                            >
                              {downloadingId === q.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            {canConvert && (
                              <Button
                                variant="default"
                                size="sm"
                                className="h-7 text-xs bg-success hover:bg-success/90"
                                onClick={() => {
                                  setSelectedQuotation(q)
                                  setConvertDialogOpen(true)
                                }}
                              >
                                <Briefcase className="h-3.5 w-3.5 mr-1" />
                                Convertir y reservar
                              </Button>
                            )}
                            {q.status === "CONVERTED" && q.operation_id && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                asChild
                              >
                                <Link href={`/operations/${q.operation_id}`}>
                                  <Briefcase className="h-3.5 w-3.5 mr-1" />
                                  Operacion
                                </Link>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Card>

      <QuotationPriceRefreshDialog
        quotationId={priceRefreshQuotationId}
        onClose={() => setPriceRefreshQuotationId(null)}
        onApplied={async () => {
          await fetchQuotationsList()
          setQuotaRefreshKey((value) => value + 1)
        }}
      />

      {/* Cambiar precio antes de generar el PDF */}
      <QuotationPdfPriceDialog
        quotationId={pdfPriceQuotation?.id ?? null}
        onClose={() => setPdfPriceQuotation(null)}
        onGenerate={async (_quotationId, expectedUpdatedAt) => {
          if (pdfPriceQuotation) return handleDownloadPDF(pdfPriceQuotation, true, expectedUpdatedAt)
        }}
        sendValidationError={!pdfPriceQuotation?.public_token
          ? "La cotización no tiene enlace público"
          : !(pdfPriceQuotation.lead?.contact_phone || "").replace(/[^0-9+]/g, "")
            ? "El lead no tiene un teléfono para WhatsApp"
            : undefined}
        onSend={pdfPriceQuotation && ["DRAFT", "SENT", "PENDING_APPROVAL"].includes(pdfPriceQuotation.status) ? async (_quotationId, sendWindow, expectedUpdatedAt) => {
          const token = pdfPriceQuotation.public_token
          const rawPhone = pdfPriceQuotation.lead?.contact_phone || ""
          const phone = rawPhone.replace(/[^0-9+]/g, "")
          if (!token) throw new Error("La cotización no tiene enlace público")
          if (!phone) throw new Error("El lead no tiene un teléfono para WhatsApp")
          const document = await fetchQuotationDocumentForUser(pdfPriceQuotation.id, {
            issue: true,
            markSent: true,
            expectedUpdatedAt,
          })
          const publicUrl = `${window.location.origin}/cotizacion/${token}`
          const cleanPhone = phone.startsWith("+") ? phone.slice(1) : phone
          const message = encodeURIComponent(`Hola ${pdfPriceQuotation.lead?.contact_name || ""}! Te paso tu cotización:\n\n${publicUrl}\n\nQuedo a disposición por cualquier consulta.`)
          await fetchQuotationsList()
          const whatsappUrl = `https://wa.me/${cleanPhone}?text=${message}`
          sendWindow.location.href = whatsappUrl
          toast.success("Cotización preparada para enviar")
          return document
        } : undefined}
      />

      <QuotationBookingDialog
        quotation={selectedQuotation}
        open={convertDialogOpen}
        onOpenChange={(open) => { setConvertDialogOpen(open); if (!open) setSelectedQuotation(null) }}
        onQueued={() => { void fetchQuotationsList() }}
      />
    </div>
  )
}
