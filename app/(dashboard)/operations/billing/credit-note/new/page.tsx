"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DecimalInput } from "@/components/ui/decimal-input"
import { Label } from "@/components/ui/label"
import { Loader2, ArrowLeft, Plus, Trash2, Calculator } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import Link from "next/link"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { COMPROBANTE_LABELS } from "@/lib/afip/types"
import { translateAfipError } from "@/lib/afip/error-translator"
import {
  calculateInvoice,
  formatInvoiceMoney,
  ITEM_TAX_TREATMENT_LABELS,
  shouldHideInvoiceTaxBreakdown,
} from "@/lib/invoices/calculation"
import type { ItemTaxTreatment } from "@/lib/invoices/calculation"
import { deriveCreditNoteType, type CreditNoteKind } from "@/lib/invoices/credit-note"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface OriginalInvoiceItem {
  descripcion: string
  cantidad: number
  precio_unitario: number
  iva_porcentaje: number
  tax_treatment?: ItemTaxTreatment
  iva_id?: number
}

interface OriginalInvoice {
  id: string
  agency_id: string
  operation_id?: string | null
  customer_id?: string | null
  cbte_tipo: number
  pto_vta: number
  cbte_nro?: number
  concepto: number
  receptor_doc_tipo: number
  receptor_doc_nro: string
  receptor_nombre: string
  receptor_domicilio?: string | null
  receptor_condicion_iva?: number | null
  amount_entry_mode?: "NET" | "FINAL"
  moneda?: string
  cotizacion?: number
  fecha_emision?: string | null
  fch_serv_desde?: string | null
  fch_serv_hasta?: string | null
  status: string
  cae?: string | null
  invoice_items?: OriginalInvoiceItem[]
}

interface FormItem {
  descripcion: string
  cantidad: number
  precio_unitario: number
  iva_porcentaje: number
  tax_treatment: ItemTaxTreatment
}

// "YYYY-MM-DD" o ISO → "YYYYMMDD" para AFIP CbtesAsoc.CbteFch
function toAfipDate(dateStr?: string | null): string | undefined {
  if (!dateStr) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (m) return `${m[1]}${m[2]}${m[3]}`
  return undefined
}

export default function NewCreditNotePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const invoiceId = searchParams.get("invoiceId")
  const kind: CreditNoteKind = searchParams.get("kind") === "ND" ? "ND" : "NC"
  const kindLabel = kind === "ND" ? "Nota de Débito" : "Nota de Crédito"

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [original, setOriginal] = useState<OriginalInvoice | null>(null)
  const [items, setItems] = useState<FormItem[]>([])
  const [afipFailureAlert, setAfipFailureAlert] = useState<{ message: string; pendingRedirect: boolean } | null>(null)

  useEffect(() => {
    if (!invoiceId) {
      setLoading(false)
      return
    }
    ;(async () => {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}`)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || "No se pudo cargar la factura")
        }
        const { invoice } = await res.json()
        setOriginal(invoice)
        // Pre-cargar ítems = copia exacta de la factura (NC total por defecto).
        const mapped: FormItem[] = (invoice.invoice_items || []).map((it: OriginalInvoiceItem) => ({
          descripcion: it.descripcion,
          cantidad: Number(it.cantidad) || 1,
          precio_unitario: Number(it.precio_unitario) || 0,
          iva_porcentaje: Number(it.iva_porcentaje) || 0,
          tax_treatment: (it.tax_treatment || (Number(it.iva_porcentaje) === 0 ? "EXENTO" : "GRAVADO")) as ItemTaxTreatment,
        }))
        setItems(mapped.length > 0 ? mapped : [{ descripcion: "", cantidad: 1, precio_unitario: 0, iva_porcentaje: 21, tax_treatment: "GRAVADO" }])
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" })
      } finally {
        setLoading(false)
      }
    })()
  }, [invoiceId, toast])

  const amountEntryMode = original?.amount_entry_mode || "NET"
  const calculatedInvoice = useMemo(
    () => calculateInvoice(items, amountEntryMode),
    [items, amountEntryMode]
  )
  const formatMoney = (v: number) => formatInvoiceMoney(v, original?.moneda)

  const derivedCbteTipo = useMemo(() => {
    if (!original) return null
    try {
      return deriveCreditNoteType(original.cbte_tipo, kind)
    } catch {
      return null
    }
  }, [original, kind])

  const shouldHideTaxBreakdown = original
    ? shouldHideInvoiceTaxBreakdown({
        amountEntryMode,
        cbteTipo: derivedCbteTipo ?? original.cbte_tipo,
        receptorCondicionIva: original.receptor_condicion_iva ?? undefined,
      })
    : false

  const addItem = () =>
    setItems((prev) => [...prev, { descripcion: "", cantidad: 1, precio_unitario: 0, iva_porcentaje: 21, tax_treatment: "GRAVADO" }])
  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index))
  const updateItem = (index: number, field: keyof FormItem, value: any) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
  const updateItemTaxTreatment = (index: number, treatment: ItemTaxTreatment) =>
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? { ...it, tax_treatment: treatment, iva_porcentaje: treatment === "GRAVADO" ? (it.iva_porcentaje || 21) : 0 }
          : it
      )
    )

  const handleSubmit = async () => {
    if (!original || !derivedCbteTipo) return
    if (items.some((it) => !it.descripcion || it.precio_unitario <= 0)) {
      toast({ title: "Error", description: "Todos los ítems deben tener descripción y precio", variant: "destructive" })
      return
    }
    if (!original.cbte_nro) {
      toast({ title: "Error", description: "La factura original no tiene número (CAE). No se puede asociar.", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation_id: original.operation_id || null,
          customer_id: original.customer_id || null,
          agency_id: original.agency_id,
          pto_vta: original.pto_vta,
          cbte_tipo: derivedCbteTipo,
          concepto: original.concepto,
          receptor_doc_tipo: original.receptor_doc_tipo,
          receptor_doc_nro: original.receptor_doc_nro,
          receptor_nombre: original.receptor_nombre,
          receptor_domicilio: original.receptor_domicilio || undefined,
          receptor_condicion_iva: original.receptor_condicion_iva ?? undefined,
          amount_entry_mode: amountEntryMode,
          moneda: original.moneda || "PES",
          cotizacion: original.cotizacion || 1,
          fch_serv_desde: original.fch_serv_desde || undefined,
          fch_serv_hasta: original.fch_serv_hasta || undefined,
          items,
          // Comprobante asociado (CbtesAsoc)
          original_invoice_id: original.id,
          cbte_asoc_tipo: original.cbte_tipo,
          cbte_asoc_pto_vta: original.pto_vta,
          cbte_asoc_nro: original.cbte_nro,
          cbte_asoc_fch: toAfipDate(original.fecha_emision),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Error al crear la ${kindLabel.toLowerCase()}`)
      }

      const data = await res.json()
      const newId = data.invoice?.id
      if (!newId) {
        toast({ title: `${kindLabel} creada`, description: "Se creó como borrador." })
        router.push("/operations/billing")
        return
      }

      // Autorizar en AFIP
      const authRes = await fetch(`/api/invoices/${newId}/authorize`, { method: "POST" })
      const authData = await authRes.json()
      if (authRes.ok && authData.success) {
        toast({
          title: `✅ ${kindLabel} autorizada por AFIP`,
          description: `Nro: ${String(original.pto_vta).padStart(4, "0")}-${String(authData.data?.cbte_nro).padStart(8, "0")} | CAE: ${authData.data?.cae}`,
        })
        router.push("/operations/billing")
      } else {
        setAfipFailureAlert({
          message: authData.error || "AFIP no pudo autorizar el comprobante. Podés reintentar desde el listado.",
          pendingRedirect: true,
        })
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!invoiceId || !original) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
        <p className="text-muted-foreground">No se encontró la factura a acreditar.</p>
        <Button asChild variant="outline">
          <Link href="/operations/billing">Volver a facturación</Link>
        </Button>
      </div>
    )
  }

  if (original.status !== "authorized" || !original.cae) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
        <p className="text-muted-foreground">
          Solo se puede emitir una {kindLabel.toLowerCase()} contra una factura autorizada por AFIP.
        </p>
        <Button asChild variant="outline">
          <Link href="/operations/billing">Volver a facturación</Link>
        </Button>
      </div>
    )
  }

  if (!derivedCbteTipo) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
        <p className="text-muted-foreground">
          El comprobante original (tipo {original.cbte_tipo}) no admite {kindLabel.toLowerCase()}.
        </p>
        <Button asChild variant="outline">
          <Link href="/operations/billing">Volver a facturación</Link>
        </Button>
      </div>
    )
  }

  const asocNro = `${String(original.pto_vta).padStart(4, "0")}-${String(original.cbte_nro).padStart(8, "0")}`
  const asocLabel = COMPROBANTE_LABELS[original.cbte_tipo as keyof typeof COMPROBANTE_LABELS] ?? `Tipo ${original.cbte_tipo}`
  const newLabel = COMPROBANTE_LABELS[derivedCbteTipo as keyof typeof COMPROBANTE_LABELS] ?? kindLabel

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/operations/billing">Facturación</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{kindLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/operations/billing">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{newLabel}</h1>
          <p className="text-sm text-muted-foreground">
            Acredita: <strong>{asocLabel} {asocNro}</strong>
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Receptor (read-only, heredado de la factura) */}
          <div className="rounded-xl border border-border/40 p-5 space-y-2">
            <h3 className="text-sm font-semibold">Receptor</h3>
            <p className="text-sm">{original.receptor_nombre}</p>
            <p className="text-xs text-muted-foreground">
              Doc: {original.receptor_doc_nro} · Punto de venta {String(original.pto_vta).padStart(4, "0")} ·{" "}
              {original.moneda === "DOL" ? "USD" : "ARS"}
            </p>
          </div>

          {/* Items */}
          <div className="rounded-xl border border-border/40 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Conceptos / Ítems</h3>
                <p className="text-xs text-muted-foreground">
                  Pre-cargados desde la factura. Editá o eliminá ítems para una {kindLabel.toLowerCase()} parcial.
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={addItem}>
                <Plus className="h-4 w-4 mr-2" />
                Agregar ítem
              </Button>
            </div>
            {items.map((item, index) => {
              const itemTotals = calculatedInvoice.items[index]
              return (
                <div key={index} className="p-4 border rounded-lg space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Ítem #{index + 1}</span>
                    {items.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeItem(index)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div>
                    <Label>Descripción *</Label>
                    <Input
                      value={item.descripcion}
                      onChange={(e) => updateItem(index, "descripcion", e.target.value)}
                      placeholder="Descripción del servicio"
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-5">
                    <div>
                      <Label>Cantidad</Label>
                      <Input
                        type="number"
                        value={item.cantidad}
                        onChange={(e) => updateItem(index, "cantidad", parseFloat(e.target.value) || 0)}
                        min={1}
                      />
                    </div>
                    <div>
                      <Label>{amountEntryMode === "FINAL" ? "Precio Final" : "Precio Unit."}</Label>
                      <DecimalInput
                        value={item.precio_unitario}
                        onChange={(v) => updateItem(index, "precio_unitario", parseFloat(v) || 0)}
                      />
                    </div>
                    <div>
                      <Label>Tratamiento</Label>
                      <Select
                        value={item.tax_treatment}
                        onValueChange={(value) => updateItemTaxTreatment(index, value as ItemTaxTreatment)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GRAVADO">{ITEM_TAX_TREATMENT_LABELS.GRAVADO}</SelectItem>
                          <SelectItem value="EXENTO">{ITEM_TAX_TREATMENT_LABELS.EXENTO}</SelectItem>
                          <SelectItem value="NO_GRAVADO">{ITEM_TAX_TREATMENT_LABELS.NO_GRAVADO}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>IVA %</Label>
                      <Select
                        value={item.tax_treatment === "GRAVADO" ? item.iva_porcentaje.toString() : "0"}
                        onValueChange={(v) => updateItem(index, "iva_porcentaje", parseFloat(v))}
                        disabled={item.tax_treatment !== "GRAVADO"}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0%</SelectItem>
                          <SelectItem value="10.5">10.5%</SelectItem>
                          <SelectItem value="21">21%</SelectItem>
                          <SelectItem value="27">27%</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{amountEntryMode === "FINAL" ? "Total Final" : "Total c/IVA"}</Label>
                      <Input value={formatMoney(itemTotals?.total || 0)} disabled className="bg-muted text-right font-medium" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Resumen */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border/40 p-5 space-y-4 sticky top-6">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Resumen
            </h3>
            <div className="space-y-2">
              {!shouldHideTaxBreakdown && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Neto gravado</span>
                    <span>{formatMoney(calculatedInvoice.totals.imp_neto)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">IVA</span>
                    <span>{formatMoney(calculatedInvoice.totals.imp_iva)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-base font-semibold border-t pt-2">
                <span>Total</span>
                <span>{formatMoney(calculatedInvoice.totals.imp_total)}</span>
              </div>
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Emitir {kindLabel.toLowerCase()}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Se emitirá y autorizará en AFIP contra el punto de venta {String(original.pto_vta).padStart(4, "0")}.
            </p>
          </div>
        </div>
      </div>

      <AlertDialog open={!!afipFailureAlert} onOpenChange={() => {}}>
        <AlertDialogContent>
          {(() => {
            const t = afipFailureAlert ? translateAfipError(afipFailureAlert.message) : null
            return (
              <AlertDialogHeader>
                <AlertDialogTitle>{t?.title || "AFIP no pudo autorizar el comprobante"}</AlertDialogTitle>
                <AlertDialogDescription className="whitespace-pre-wrap">
                  {t ? `${t.explanation}\n\n${t.action}` : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
            )
          })()}
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                const redirect = afipFailureAlert?.pendingRedirect
                setAfipFailureAlert(null)
                if (redirect) router.push("/operations/billing")
              }}
            >
              Entendido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
