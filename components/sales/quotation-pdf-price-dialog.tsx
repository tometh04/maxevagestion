"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, FileText, RotateCcw, Shield, Bus, Plus, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { formatQuotationCurrency } from "@/lib/quotations/presentation"
import { normalizeManualQuotationTotal } from "@/lib/quotations/totals"
import { requestQuotationJson } from "@/lib/quotation-documents/request-client"
import {
  parseQuotationPresentationContent,
  type QuotationPresentationContent,
} from "@/lib/quotation-documents/schemas"
import {
  QuotationDocumentDownloadError,
  fetchQuotationDocumentForUser,
  type QuotationDocumentPayload,
} from "@/lib/quotation-documents/client"

interface OptionEntry {
  id: string
  title: string
  /** Total calculado (suma de ítems — lo que devolvió Emilia) */
  calculated: number
  /** Total manual persistido (null = sin override) */
  manual: number | null
  /** Valor actual del input (string para edición libre) */
  input: string
}

interface Props {
  /** Id de la cotización a la que generarle el PDF. null = dialog cerrado. */
  quotationId: string | null
  onClose: () => void
  /** Se llama después de guardar los precios, para abrir/descargar el PDF. */
  onGenerate: (
    quotationId: string,
    expectedUpdatedAt: string
  ) => void | QuotationDocumentPayload | Promise<void | QuotationDocumentPayload>
  /** Si se informa, el mismo guardado puede emitir + marcar SENT de forma atómica. */
  onSend?: (
    quotationId: string,
    sendWindow: Window,
    expectedUpdatedAt: string
  ) => void | QuotationDocumentPayload | Promise<void | QuotationDocumentPayload>
  /** Preflight conocido por el caller (token/teléfono) que debe fallar antes de persistir. */
  sendValidationError?: string
}

function ListEditor({
  id,
  label,
  values,
  onChange,
  disabled,
}: {
  id: string
  label: string
  values: string[]
  onChange: (values: string[]) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={5}
        value={values.join("\n")}
        onChange={event => onChange(event.target.value.split("\n").map(value => value.trim()).filter(Boolean))}
        placeholder="Un punto por línea"
        disabled={disabled}
      />
    </div>
  )
}

/**
 * Dialog "Cambiar precio" del flujo Generar PDF.
 *
 * Muestra el total calculado de cada opción de la cotización y un input con
 * el precio final que va a ver el cliente. Precio, adicionales y contenido se
 * preparan juntos mediante PUT /api/quotations/[id]/document; esa operación
 * invalida el snapshot anterior antes de emitir el nuevo.
 */
export function QuotationPdfPriceDialog({
  quotationId,
  onClose,
  onGenerate,
  onSend,
  sendValidationError,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<QuotationDocumentPayload | null>(null)
  const requestVersion = useRef(0)
  const [currency, setCurrency] = useState("USD")
  const [quotationNumber, setQuotationNumber] = useState<string | null>(null)
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null)
  const [entries, setEntries] = useState<OptionEntry[]>([])
  // Adicionales globales de la cotización (seguro / traslado). String para
  // edición libre; "" = sin adicional (0).
  const [insurance, setInsurance] = useState("")
  const [transfer, setTransfer] = useState("")
  const [presentation, setPresentation] = useState<QuotationPresentationContent>(() => parseQuotationPresentationContent({}))

  useEffect(() => {
    requestVersion.current += 1
    setSaving(false)
    if (!quotationId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setEntries([])
      setInsurance("")
      setTransfer("")
      setPresentation(parseQuotationPresentationContent({}))
      setExpectedUpdatedAt(null)
      try {
        const { response: res, json } = await requestQuotationJson(`/api/quotations/${quotationId}`)
        if (!res.ok) throw new Error("No se pudo cargar la cotización")
        if (cancelled) return
        const q = json.data
        setCurrency(q?.currency || "USD")
        setQuotationNumber(q?.quotation_number || null)
        setExpectedUpdatedAt(q?.updated_at || null)
        setInsurance(Number(q?.insurance_amount) > 0 ? String(q.insurance_amount) : "")
        setTransfer(Number(q?.transfer_amount) > 0 ? String(q.transfer_amount) : "")
        setPresentation(parseQuotationPresentationContent(q?.presentation_content))
        const options = Array.isArray(q?.quotation_options) ? q.quotation_options : []
        const mapped: OptionEntry[] = options
          .slice()
          .sort((a: any, b: any) => Number(a.option_number || 0) - Number(b.option_number || 0))
          .map((opt: any, index: number) => {
            const manual = normalizeManualQuotationTotal(opt.manual_total_amount)
            const calculated = opt.calculated_total_amount != null
              ? Number(opt.calculated_total_amount)
              : Number(opt.total_amount || 0)
            const effective = manual ?? calculated
            return {
              id: opt.id,
              title: opt.title || `Opción ${index + 1}`,
              calculated,
              manual,
              input: effective > 0 ? String(effective) : "",
            }
          })
        setEntries(mapped)
      } catch (err: any) {
        if (!cancelled) {
          toast.error(err?.message || "Error al cargar la cotización")
          onClose()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true; requestVersion.current += 1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationId])

  const setInput = (optionId: string, value: string) => {
    setEntries(prev => prev.map(e => (e.id === optionId ? { ...e, input: value } : e)))
  }

  const resetEntry = (optionId: string) => {
    setEntries(prev => prev.map(e =>
      e.id === optionId ? { ...e, input: e.calculated > 0 ? String(e.calculated) : "" } : e
    ))
  }

  // Comisión implícita: diferencia entre el precio del input y el calculado
  const renderDiff = (entry: OptionEntry) => {
    const value = Number(entry.input)
    if (!entry.input.trim() || !Number.isFinite(value) || entry.calculated <= 0) return null
    const diff = value - entry.calculated
    if (Math.abs(diff) < 0.005) return null
    const pct = (diff / entry.calculated) * 100
    return (
      <p className={`text-xs ${diff > 0 ? "text-success" : "text-destructive"}`}>
        {diff > 0 ? "Comisión" : "Descuento"}: {formatQuotationCurrency(Math.abs(diff), currency)} ({diff > 0 ? "+" : "−"}{Math.abs(pct).toFixed(1)}%)
      </p>
    )
  }

  useEffect(() => {
    setPreview(null)
  }, [quotationId, entries, insurance, transfer, presentation])

  const handleGenerate = async (action: "download" | "send" | "preview" = "download") => {
    if (!quotationId || saving) return
    if (action === "send" && sendValidationError) {
      toast.error(sendValidationError)
      return
    }

    // Validar inputs antes de guardar
    for (const entry of entries) {
      const value = Number(entry.input)
      if (!entry.input.trim() || !Number.isFinite(value) || value <= 0) {
        toast.error(`Ingresá un precio válido para "${entry.title}"`)
        return
      }
    }
    // Adicionales: vacío = 0. Solo rechazamos valores inválidos/negativos.
    const insuranceValue = insurance.trim() ? Number(insurance) : 0
    const transferValue = transfer.trim() ? Number(transfer) : 0
    if (!Number.isFinite(insuranceValue) || insuranceValue < 0) {
      toast.error("Ingresá un monto de seguro válido (0 o mayor)")
      return
    }
    if (!Number.isFinite(transferValue) || transferValue < 0) {
      toast.error("Ingresá un monto de traslado válido (0 o mayor)")
      return
    }

    // Reservar la ventana dentro del gesto del usuario evita que el navegador
    // bloquee WhatsApp después de los awaits de preparación/emisión.
    const sendWindow = action === "send" && typeof window !== "undefined"
      ? window.open("about:blank", "_blank")
      : null
    if (action === "send" && !sendWindow) {
      toast.error("Habilitá las ventanas emergentes para abrir WhatsApp antes de enviar")
      return
    }
    if (sendWindow) sendWindow.opener = null

    setSaving(true)
    const version = requestVersion.current
    let contentSaved = false
    try {
      if (!expectedUpdatedAt) throw new Error("La cotización no tiene versión de edición")
      const { response: prepareRes, json: preparedJson } = await requestQuotationJson(`/api/quotations/${quotationId}/document`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_updated_at: expectedUpdatedAt,
          prices: entries.map(entry => {
            const value = Number(entry.input)
            return {
              option_id: entry.id,
              manual_total_amount: Math.abs(value - entry.calculated) < 0.005 ? null : value,
            }
          }),
          insurance_amount: insuranceValue,
          transfer_amount: transferValue,
          presentation_content: presentation,
        }),
      })
      if (version !== requestVersion.current) { sendWindow?.close(); return }
      if (!prepareRes.ok) {
        throw new Error(preparedJson?.error || "No se pudieron guardar los precios y el contenido")
      }
      const preparedUpdatedAt = preparedJson?.data?.updated_at
      if (typeof preparedUpdatedAt !== "string" || !preparedUpdatedAt) {
        throw new Error("El servidor no devolvió la nueva versión de la cotización")
      }
      // Preparar el documento avanza el CAS de la cotización. Si la descarga o
      // el envío posterior falla, el mismo modal debe poder reintentar sin
      // exigir una recarga y sin sobrescribir cambios concurrentes.
      setExpectedUpdatedAt(preparedUpdatedAt)
      contentSaved = true

      if (action === "preview") {
        const document = await fetchQuotationDocumentForUser(quotationId, { issue: false })
        if (version !== requestVersion.current) return
        setPreview(document)
        return
      }

      let completedDocument: void | QuotationDocumentPayload
      if (action === "send" && onSend) {
        if (!sendWindow || sendWindow.closed) {
          throw new Error("La ventana de WhatsApp se cerró antes de emitir la cotización")
        }
        completedDocument = await onSend(quotationId, sendWindow, preparedUpdatedAt)
      } else {
        completedDocument = await onGenerate(quotationId, preparedUpdatedAt)
      }
      if (version !== requestVersion.current) return
      if (completedDocument?.quotationUpdatedAt) {
        setExpectedUpdatedAt(completedDocument.quotationUpdatedAt)
      }
      onClose()
    } catch (err: any) {
      if (sendWindow && !sendWindow.closed) sendWindow.close()
      if (version !== requestVersion.current) return
      if (err instanceof QuotationDocumentDownloadError && err.document.quotationUpdatedAt) {
        setExpectedUpdatedAt(err.document.quotationUpdatedAt)
      }
      const detail = err?.message || "Error inesperado"
      toast.error(contentSaved
        ? `La cotización quedó guardada, pero no se pudo completar la emisión o descarga: ${detail}`
        : `No se pudieron guardar los cambios de la cotización: ${detail}`)
    } finally {
      if (version === requestVersion.current) setSaving(false)
    }
  }

  return (
    <Dialog open={quotationId !== null} onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Generar PDF{quotationNumber ? ` — ${quotationNumber}` : ""}
          </DialogTitle>
          <DialogDescription>
            Revisá el precio final de cada opción antes de generar el PDF. Si lo cambiás (ej. para sumar tu comisión), el PDF y la página pública van a mostrar ese total.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="prices" className="min-w-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="prices">Precios</TabsTrigger>
              <TabsTrigger value="content">Contenido del PDF</TabsTrigger>
            </TabsList>
            <TabsContent value="prices" className="space-y-4 py-1 max-h-[54vh] overflow-y-auto pr-1">
            {entries.map((entry) => {
              const hasOverride = Math.abs(Number(entry.input) - entry.calculated) >= 0.005
              return (
                <div key={entry.id} className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{entry.title}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      Calculado: {formatQuotationCurrency(entry.calculated, currency)}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`price-${entry.id}`} className="text-xs text-muted-foreground">
                      Cambiar precio (total {currency})
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`price-${entry.id}`}
                        type="number"
                        min={0}
                        step="0.01"
                        value={entry.input}
                        onChange={(e) => setInput(entry.id, e.target.value)}
                        disabled={saving}
                      />
                      {hasOverride && entry.calculated > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-9 px-2 text-muted-foreground hover:text-foreground shrink-0"
                          onClick={() => resetEntry(entry.id)}
                          disabled={saving}
                          title="Restablecer precio calculado"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    {renderDiff(entry)}
                  </div>
                </div>
              )
            })}
            {entries.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Esta cotización no tiene opciones.
              </p>
            )}

            {/* Adicionales globales: se suman al total y se muestran
                desglosados en el PDF. Vacío = no se muestran. */}
            <div className="rounded-lg border border-border/60 p-3 space-y-3">
              <p className="text-sm font-medium">Adicionales (opcional)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="addon-insurance" className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" /> Seguro ({currency})
                  </Label>
                  <Input
                    id="addon-insurance"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0"
                    value={insurance}
                    onChange={(e) => setInsurance(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="addon-transfer" className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Bus className="h-3.5 w-3.5" /> Traslado ({currency})
                  </Label>
                  <Input
                    id="addon-transfer"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0"
                    value={transfer}
                    onChange={(e) => setTransfer(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Se suman al total y se muestran desglosados en el PDF.
              </p>
            </div>
            </TabsContent>
            <TabsContent value="content" className="max-h-[54vh] space-y-5 overflow-y-auto py-2 pr-1">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="pdf-title">Título del viaje</Label>
                  <Input id="pdf-title" value={presentation.title || ""} placeholder="Ej. San Pedro de Atacama + Salar de Uyuni" onChange={event => setPresentation(current => ({ ...current, title: event.target.value || undefined }))} disabled={saving} />
                </div>
                <div className="space-y-1.5"><Label htmlFor="pdf-customer">Pasajero / cliente</Label><Input id="pdf-customer" value={presentation.customer.displayName || ""} onChange={event => setPresentation(current => ({ ...current, customer: { ...current.customer, displayName: event.target.value || undefined } }))} disabled={saving} /></div>
                <div className="space-y-1.5"><Label htmlFor="pdf-advisor-phone">Teléfono del asesor</Label><Input id="pdf-advisor-phone" value={presentation.advisorPhone || ""} onChange={event => setPresentation(current => ({ ...current, advisorPhone: event.target.value || undefined }))} disabled={saving} /></div>
                <div className="space-y-1.5"><Label htmlFor="pdf-customer-email">Email del cliente</Label><Input id="pdf-customer-email" type="email" value={presentation.customer.email || ""} onChange={event => setPresentation(current => ({ ...current, customer: { ...current.customer, email: event.target.value } }))} disabled={saving} /></div>
                <div className="space-y-1.5"><Label htmlFor="pdf-customer-phone">Teléfono del cliente</Label><Input id="pdf-customer-phone" value={presentation.customer.phone || ""} onChange={event => setPresentation(current => ({ ...current, customer: { ...current.customer, phone: event.target.value || undefined } }))} disabled={saving} /></div>
              </div>

              <div className="space-y-1.5"><Label htmlFor="pdf-overview">Presentación del programa</Label><Textarea id="pdf-overview" rows={4} value={presentation.overview || ""} onChange={event => setPresentation(current => ({ ...current, overview: event.target.value || undefined }))} placeholder="Resumen comercial que verá el cliente." disabled={saving} /></div>

              <div className="grid gap-3 sm:grid-cols-2">
                <ListEditor id="pdf-inclusions" label="Incluye" values={presentation.inclusions} onChange={values => setPresentation(current => ({ ...current, inclusions: values }))} disabled={saving} />
                <ListEditor id="pdf-exclusions" label="No incluye" values={presentation.exclusions} onChange={values => setPresentation(current => ({ ...current, exclusions: values }))} disabled={saving} />
                <ListEditor id="pdf-recommendations" label="Recomendaciones" values={presentation.recommendations} onChange={values => setPresentation(current => ({ ...current, recommendations: values }))} disabled={saving} />
                <ListEditor id="pdf-restrictions" label="Restricciones" values={presentation.restrictions} onChange={values => setPresentation(current => ({ ...current, restrictions: values }))} disabled={saving} />
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Itinerario día por día</p><p className="text-xs text-muted-foreground">Se pagina automáticamente si el programa es largo.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setPresentation(current => ({ ...current, itinerary: [...current.itinerary, { day: current.itinerary.length + 1, title: "", description: "" }] }))} disabled={saving}><Plus className="mr-1 h-3.5 w-3.5" />Día</Button></div>
                {presentation.itinerary.map((day, index) => (
                  <div key={`${day.day}-${index}`} className="space-y-2 rounded-md bg-muted/40 p-3">
                    <div className="grid grid-cols-[72px_1fr_auto] gap-2"><Input type="number" min={1} aria-label="Día" value={day.day} onChange={event => setPresentation(current => ({ ...current, itinerary: current.itinerary.map((item, itemIndex) => itemIndex === index ? { ...item, day: Number(event.target.value) } : item) }))} disabled={saving} /><Input aria-label="Título del día" placeholder="Título del día" value={day.title} onChange={event => setPresentation(current => ({ ...current, itinerary: current.itinerary.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) }))} disabled={saving} /><Button type="button" variant="ghost" size="icon" aria-label="Eliminar día" onClick={() => setPresentation(current => ({ ...current, itinerary: current.itinerary.filter((_, itemIndex) => itemIndex !== index) }))} disabled={saving}><Trash2 className="h-4 w-4" /></Button></div>
                    <Textarea rows={3} aria-label="Descripción del día" placeholder="Actividades, traslados y observaciones" value={day.description} onChange={event => setPresentation(current => ({ ...current, itinerary: current.itinerary.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) }))} disabled={saving} />
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="pdf-deposit">Seña ({currency})</Label><Input id="pdf-deposit" type="number" min={0} step="0.01" value={presentation.depositAmount ?? ""} onChange={event => setPresentation(current => ({ ...current, depositAmount: event.target.value ? Number(event.target.value) : undefined }))} disabled={saving} /></div>
                <div className="space-y-1.5"><Label htmlFor="pdf-balance">Fecha límite del saldo</Label><Input id="pdf-balance" type="date" value={presentation.balanceDueDate || ""} onChange={event => setPresentation(current => ({ ...current, balanceDueDate: event.target.value || undefined }))} disabled={saving} /></div>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {preview && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Vista previa · {preview.pageCount} {preview.pageCount === 1 ? "página" : "páginas"}</p>
            <iframe title="Vista previa de la cotización" sandbox="allow-same-origin" srcDoc={preview.html} className="h-[55vh] w-full rounded-md border bg-white" />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={() => void handleGenerate("preview")} disabled={loading || saving || entries.length === 0}>
            Guardar y ver vista previa
          </Button>
          <Button onClick={() => void handleGenerate("download")} disabled={loading || saving || entries.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Generar PDF
          </Button>
          {onSend && (
            <Button onClick={() => void handleGenerate("send")} disabled={loading || saving || entries.length === 0}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Guardar y enviar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
