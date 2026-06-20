"use client"

import { useEffect, useState } from "react"
import { Loader2, FileText, RotateCcw, Shield, Bus } from "lucide-react"
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
import { toast } from "sonner"
import { formatQuotationCurrency } from "@/lib/quotations/presentation"
import { normalizeManualQuotationTotal } from "@/lib/quotations/totals"

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
  onGenerate: (quotationId: string) => void
}

/**
 * Dialog "Cambiar precio" del flujo Generar PDF.
 *
 * Muestra el total calculado de cada opción de la cotización y un input con
 * el precio final que va a ver el cliente. Si la agencia lo cambia (ej. para
 * sumar su comisión), se persiste como manual_total_amount de la opción vía
 * PATCH /api/quotations/[id]/price — la página pública y el PDF resuelven el
 * total con ese override, así ambos muestran el mismo precio.
 */
export function QuotationPdfPriceDialog({ quotationId, onClose, onGenerate }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currency, setCurrency] = useState("USD")
  const [quotationNumber, setQuotationNumber] = useState<string | null>(null)
  const [entries, setEntries] = useState<OptionEntry[]>([])
  // Adicionales globales de la cotización (seguro / traslado). String para
  // edición libre; "" = sin adicional (0).
  const [insurance, setInsurance] = useState("")
  const [transfer, setTransfer] = useState("")

  useEffect(() => {
    if (!quotationId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setEntries([])
      setInsurance("")
      setTransfer("")
      try {
        const res = await fetch(`/api/quotations/${quotationId}`)
        if (!res.ok) throw new Error("No se pudo cargar la cotización")
        const json = await res.json()
        if (cancelled) return
        const q = json.data
        setCurrency(q?.currency || "USD")
        setQuotationNumber(q?.quotation_number || null)
        setInsurance(Number(q?.insurance_amount) > 0 ? String(q.insurance_amount) : "")
        setTransfer(Number(q?.transfer_amount) > 0 ? String(q.transfer_amount) : "")
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
    return () => { cancelled = true }
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

  const handleGenerate = async () => {
    if (!quotationId) return

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

    setSaving(true)
    try {
      for (const entry of entries) {
        const value = Number(entry.input)
        // Si coincide con el calculado → guardar null (sin override). Si no,
        // es un precio manual. Solo llamamos a la API cuando cambió algo.
        const desiredManual = Math.abs(value - entry.calculated) < 0.005 ? null : value
        if (desiredManual === entry.manual) continue

        const res = await fetch(`/api/quotations/${quotationId}/price`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ option_id: entry.id, manual_total_amount: desiredManual }),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          toast.error(json?.error || `No se pudo guardar el precio de "${entry.title}"`)
          return
        }
      }

      // Adicionales globales (seguro / traslado) → header de la cotización.
      const addonsRes = await fetch(`/api/quotations/${quotationId}/addons`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insurance_amount: insuranceValue, transfer_amount: transferValue }),
      })
      if (!addonsRes.ok) {
        const json = await addonsRes.json().catch(() => ({}))
        toast.error(json?.error || "No se pudieron guardar el seguro y traslado")
        return
      }

      onGenerate(quotationId)
      onClose()
    } catch (err: any) {
      toast.error("Error al guardar precios: " + (err?.message || ""))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={quotationId !== null} onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="sm:max-w-[480px]">
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
          <div className="space-y-4 py-1 max-h-[50vh] overflow-y-auto">
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
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={loading || saving || entries.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Generar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
