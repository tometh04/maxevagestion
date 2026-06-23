"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DecimalInput } from "@/components/ui/decimal-input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table"
import {
  Upload, FileText, Loader2, Pencil, Trash2, Eye, Plus, Scan, Check, AlertCircle, Receipt
} from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

/**
 * Normaliza un invoice_number al formato AFIP estándar: "0001-00000099"
 * (4 dígitos pto_vta + dash + 8 dígitos cbte_nro). Sin esto, el Libro IVA
 * Digital RG 4597 puede parsear mal o AFIP rechaza la importación. (SP-6.6)
 *
 * Acepta formatos del user: "1-99", "01-99", "0001-00000099", "1-0000099".
 * Rechaza: sin guión, no-numérico, vacío, demasiados dígitos.
 *
 * Devuelve la string normalizada o null si no se puede parsear.
 */
function normalizeInvoiceNumber(raw: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  // Aceptar 1-5 dígitos pto_vta + dash + 1-8 dígitos cbte_nro
  const match = trimmed.match(/^(\d{1,5})-(\d{1,8})$/)
  if (!match) return null
  const pto = match[1].padStart(4, "0")
  const nro = match[2].padStart(8, "0")
  // Si pto > 9999 o nro > 99999999, rechazar (overflow del formato AFIP)
  if (pto.length > 4 || nro.length > 8) return null
  return `${pto}-${nro}`
}

interface PurchaseInvoice {
  id: string
  operation_id: string
  operator_id: string | null
  invoice_type: string
  invoice_number: string
  invoice_date: string
  emitter_cuit: string
  emitter_name: string
  currency: string
  net_amount: number
  iva_rate: number
  iva_amount: number
  perception_iva: number
  perception_iibb: number
  other_taxes: number
  total_amount: number
  exchange_rate: number | null
  total_ars_equivalent: number | null
  document_url: string | null
  document_name: string | null
  status: string
  notes: string | null
  created_at: string
  operators?: { id: string; name: string } | null
  users?: { id: string; name: string } | null
}

interface Operator {
  id: string
  name: string
  cuit?: string
}

interface Props {
  operationId: string
  operators?: Operator[]
  currency?: string
  /** agency_id del operation para filtrar reglas de percepción multi-tenant */
  agencyId?: string | null
}

interface AppliedRule {
  type: string
  rate: number
  min_amount: number
}

export function PurchaseInvoicesSection({
  operationId,
  operators = [],
  currency = "USD",
  agencyId = null,
}: Props) {
  const { toast } = useToast()
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null)
  const [ocrProcessing, setOcrProcessing] = useState(false)
  const [ocrDebug, setOcrDebug] = useState<any>(null) // TEMPORAL: diagnóstico OCR
  const fileInputRef = useRef<HTMLInputElement>(null)

  // SP-6.5: percepciones en modo auto vs manual
  const [autoPerceptions, setAutoPerceptions] = useState(true)
  const [appliedRules, setAppliedRules] = useState<AppliedRule[]>([])
  const [masterToggleOff, setMasterToggleOff] = useState(false)
  const [calculatingPerceptions, setCalculatingPerceptions] = useState(false)

  const [form, setForm] = useState({
    operator_id: "",
    invoice_type: "FACTURA_A",
    invoice_number: "",
    invoice_date: new Date().toISOString().split("T")[0],
    emitter_cuit: "",
    emitter_name: "",
    currency: currency || "USD",
    net_amount: "",
    iva_rate: "21",
    iva_amount: "",
    perception_iva: "0",
    perception_iibb: "0",
    other_taxes: "0",
    total_amount: "",
    notes: "",
    // Archivo subido por OCR (extract_only): se guarda recién al confirmar el modal.
    document_url: "" as string | null,
    document_name: "" as string | null,
  })

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch(`/api/operations/${operationId}/purchase-invoices`)
      if (res.ok) {
        const data = await res.json()
        setInvoices(data.invoices || [])
      }
    } catch (err) {
      console.error("Error fetching purchase invoices:", err)
    } finally {
      setLoading(false)
    }
  }, [operationId])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  // Auto-calculate IVA when net_amount or iva_rate changes
  useEffect(() => {
    const net = parseFloat(form.net_amount) || 0
    const rate = parseFloat(form.iva_rate) || 0
    const iva = Math.round(net * rate / 100 * 100) / 100
    const percIva = parseFloat(form.perception_iva) || 0
    const percIibb = parseFloat(form.perception_iibb) || 0
    const otherTaxes = parseFloat(form.other_taxes) || 0
    const total = Math.round((net + iva + percIva + percIibb + otherTaxes) * 100) / 100

    setForm(prev => ({
      ...prev,
      iva_amount: iva.toString(),
      total_amount: total.toString(),
    }))
  }, [form.net_amount, form.iva_rate, form.perception_iva, form.perception_iibb, form.other_taxes])

  // Auto-fill operator CUIT when operator selected
  useEffect(() => {
    if (form.operator_id) {
      const op = operators.find(o => o.id === form.operator_id)
      if (op) {
        setForm(prev => ({
          ...prev,
          emitter_name: prev.emitter_name || op.name,
          emitter_cuit: prev.emitter_cuit || op.cuit || "",
        }))
      }
    }
  }, [form.operator_id, operators])

  // SP-6.5: auto-calcular percepciones (debounced) cuando cambia operator/net.
  // Multi-tenant: el endpoint preview filtra reglas por org (RLS) + agency_id.
  useEffect(() => {
    if (!autoPerceptions) return
    if (editingInvoice) return // no recalcular en edit, respeta valores guardados
    const net = parseFloat(form.net_amount) || 0
    if (net <= 0 || !form.emitter_cuit) {
      setAppliedRules([])
      return
    }

    const handle = setTimeout(async () => {
      setCalculatingPerceptions(true)
      try {
        const res = await fetch("/api/accounting/withholdings/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: net,
            currency: form.currency,
            type: "OPERATOR_PAYMENT",
            counterpart_cuit: form.emitter_cuit,
            agency_id: agencyId,
          }),
        })
        if (!res.ok) return
        const data = await res.json()

        if (data.master_toggle_off) {
          setMasterToggleOff(true)
          setAppliedRules([])
          return
        }
        setMasterToggleOff(false)

        const percIva = data.withholdings?.find((w: any) => w.type === "PERCEPCION_IVA")?.amount ?? 0
        const percIibb = data.withholdings?.find((w: any) => w.type === "PERCEPCION_IIBB")?.amount ?? 0

        setForm(prev => ({
          ...prev,
          perception_iva: percIva.toString(),
          perception_iibb: percIibb.toString(),
        }))
        setAppliedRules(data.applied_rules || [])
      } catch (err) {
        console.error("Error preview percepciones:", err)
      } finally {
        setCalculatingPerceptions(false)
      }
    }, 500)

    return () => clearTimeout(handle)
  }, [form.net_amount, form.emitter_cuit, form.currency, autoPerceptions, agencyId, editingInvoice])

  const resetForm = () => {
    setForm({
      operator_id: "", invoice_type: "FACTURA_A", invoice_number: "",
      invoice_date: new Date().toISOString().split("T")[0],
      emitter_cuit: "", emitter_name: "", currency: currency || "USD",
      net_amount: "", iva_rate: "21", iva_amount: "",
      perception_iva: "0", perception_iibb: "0", other_taxes: "0",
      total_amount: "", notes: "",
      document_url: "", document_name: "",
    })
    setEditingInvoice(null)
    setAutoPerceptions(true)
    setOcrDebug(null)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setOcrProcessing(true)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("extract_only", "true") // OCR + subir archivo; NO guardar todavía
      if (form.operator_id) formData.append("operator_id", form.operator_id)

      const res = await fetch(`/api/operations/${operationId}/purchase-invoices`, {
        method: "POST",
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // TEMPORAL: diagnóstico de extracción
      console.log("[OCR debug]", data.ocr_debug)
      setOcrDebug(data.ocr_debug || null)

      // Precargar el modal con lo extraído (o vacío si el OCR falló) para que el
      // usuario revise/corrija y recién al Guardar se cree la factura.
      const ex = data.extracted || {}
      setEditingInvoice(null)
      setForm(prev => ({
        ...prev,
        operator_id: prev.operator_id,
        invoice_type: ex.invoice_type || prev.invoice_type,
        invoice_number: ex.invoice_number || "",
        invoice_date: ex.invoice_date || prev.invoice_date,
        emitter_cuit: ex.emitter_cuit || "",
        emitter_name: ex.emitter_name || "",
        currency: ex.currency || prev.currency,
        net_amount: ex.net_amount ? String(ex.net_amount) : "",
        iva_rate: ex.iva_rate != null ? String(ex.iva_rate) : "21",
        iva_amount: ex.iva_amount ? String(ex.iva_amount) : "",
        perception_iva: ex.perception_iva ? String(ex.perception_iva) : "0",
        perception_iibb: ex.perception_iibb ? String(ex.perception_iibb) : "0",
        other_taxes: ex.other_taxes ? String(ex.other_taxes) : "0",
        total_amount: ex.total_amount ? String(ex.total_amount) : "",
        document_url: data.document_url || null,
        document_name: data.document_name || file.name,
      }))
      // Si el OCR leyó la factura, los importes (incluidas percepciones) son los
      // reales del documento: modo manual para no sobrescribirlos con el cálculo
      // automático por reglas. Si falló, dejamos auto para ayudar en la carga.
      setAutoPerceptions(!data.ocr_extracted)
      setShowDialog(true)

      toast({
        title: data.ocr_extracted ? "Datos extraídos con OCR" : "No se pudo leer la factura",
        description: data.ocr_extracted
          ? "Revisá los datos y guardá para registrar la factura."
          : data.ocr_error || "Completá los datos manualmente y guardá.",
        variant: data.ocr_extracted ? undefined : "destructive",
      })
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setUploading(false)
      setOcrProcessing(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleSave = async () => {
    if (!form.invoice_number || !form.emitter_cuit) {
      toast({ title: "Error", description: "Completá el Número de factura y el CUIT", variant: "destructive" })
      return
    }

    // SP-6.6: validar formato invoice_number "XXXX-XXXXXXXX". Si está mal, el Libro IVA
    // Digital RG 4597 lo parsea mal o AFIP rechaza al importar.
    const normalized = normalizeInvoiceNumber(form.invoice_number)
    if (!normalized) {
      toast({
        title: "Formato de factura inválido",
        description: 'El número de factura debe tener formato "XXXX-XXXXXXXX" (ej: 0001-00000099). Tipeás "1-99" y se autocompleta.',
        variant: "destructive",
      })
      return
    }
    // Auto-corregir el form para guardar la versión normalizada
    if (normalized !== form.invoice_number) {
      setForm(prev => ({ ...prev, invoice_number: normalized }))
    }
    const formToSave = { ...form, invoice_number: normalized }

    try {
      if (editingInvoice) {
        // Update
        const res = await fetch(
          `/api/operations/${operationId}/purchase-invoices/${editingInvoice.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...formToSave,
              net_amount: parseFloat(formToSave.net_amount) || 0,
              iva_rate: Number.isNaN(parseFloat(formToSave.iva_rate)) ? 21 : parseFloat(formToSave.iva_rate), // preserva 0 (exento)
              iva_amount: parseFloat(formToSave.iva_amount) || 0,
              perception_iva: parseFloat(formToSave.perception_iva) || 0,
              perception_iibb: parseFloat(formToSave.perception_iibb) || 0,
              other_taxes: parseFloat(formToSave.other_taxes) || 0,
              total_amount: parseFloat(formToSave.total_amount) || 0,
            }),
          }
        )
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error)
        }
        toast({ title: "Factura actualizada" })
      } else {
        // Create (manual o tras OCR extract_only). document_url/document_name
        // viajan dentro de formToSave si la factura se subió con OCR.
        const res = await fetch(`/api/operations/${operationId}/purchase-invoices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...formToSave,
            net_amount: parseFloat(formToSave.net_amount) || 0,
            iva_rate: Number.isNaN(parseFloat(formToSave.iva_rate)) ? 21 : parseFloat(formToSave.iva_rate), // preserva 0 (exento)
            iva_amount: parseFloat(formToSave.iva_amount) || 0,
            perception_iva: parseFloat(formToSave.perception_iva) || 0,
            perception_iibb: parseFloat(formToSave.perception_iibb) || 0,
            other_taxes: parseFloat(formToSave.other_taxes) || 0,
            total_amount: parseFloat(formToSave.total_amount) || 0,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error)
        }
        toast({ title: "Factura registrada" })
      }

      setShowDialog(false)
      resetForm()
      await fetchInvoices()
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    }
  }

  const handleEdit = (invoice: PurchaseInvoice) => {
    setEditingInvoice(invoice)
    setForm({
      operator_id: invoice.operator_id || "",
      invoice_type: invoice.invoice_type,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date?.split("T")[0] || "",
      emitter_cuit: invoice.emitter_cuit,
      emitter_name: invoice.emitter_name,
      currency: invoice.currency,
      net_amount: invoice.net_amount?.toString() || "",
      iva_rate: invoice.iva_rate?.toString() || "21",
      iva_amount: invoice.iva_amount?.toString() || "",
      perception_iva: invoice.perception_iva?.toString() || "0",
      perception_iibb: invoice.perception_iibb?.toString() || "0",
      other_taxes: invoice.other_taxes?.toString() || "0",
      total_amount: invoice.total_amount?.toString() || "",
      notes: invoice.notes || "",
      document_url: invoice.document_url,
      document_name: invoice.document_name,
    })
    setShowDialog(true)
  }

  const handleDelete = async (invoiceId: string) => {
    if (!confirm("¿Seguro que querés eliminar esta factura de compra?")) return

    try {
      const res = await fetch(`/api/operations/${operationId}/purchase-invoices/${invoiceId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Error al eliminar")
      toast({ title: "Factura eliminada" })
      await fetchInvoices()
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    }
  }

  const formatMoney = (amount: number, cur: string = "ARS") => {
    const prefix = cur === "USD" ? "US$" : "$"
    return `${prefix} ${Number(amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const invoiceTypeLabels: Record<string, string> = {
    FACTURA_A: "Factura A",
    FACTURA_B: "Factura B",
    FACTURA_C: "Factura C",
    NOTA_CREDITO_A: "NC A",
    NOTA_CREDITO_B: "NC B",
    NOTA_DEBITO_A: "ND A",
    NOTA_DEBITO_B: "ND B",
  }

  // Totals
  const totalIva = invoices.reduce((sum, i) => sum + Number(i.iva_amount || 0), 0)
  const totalPercepciones = invoices.reduce((sum, i) => sum + Number(i.perception_iva || 0) + Number(i.perception_iibb || 0), 0)
  const totalNeto = invoices.reduce((sum, i) => sum + Number(i.net_amount || 0), 0)

  return (
    <Card className="rounded-xl border border-border/40">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Facturas de Compra (Operadores)
            </CardTitle>
            <CardDescription>
              Facturas recibidas de operadores — Crédito fiscal IVA
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  {ocrProcessing ? "Procesando OCR..." : "Subiendo..."}
                </>
              ) : (
                <>
                  <Scan className="h-4 w-4 mr-1" />
                  Subir con OCR
                </>
              )}
            </Button>
            <Button
              size="sm"
              onClick={() => { resetForm(); setShowDialog(true) }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Cargar Manual
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay facturas de compra registradas</p>
            <p className="text-xs mt-1">Subí la factura del operador para registrar el crédito fiscal</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Neto Gravado</p>
                <p className="text-lg font-bold">{formatMoney(totalNeto)}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-success/5 p-4">
                <p className="text-xs text-success">IVA Crédito Fiscal</p>
                <p className="text-lg font-bold text-success">{formatMoney(totalIva)}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-primary/5 p-4">
                <p className="text-xs text-primary">Percepciones a Favor</p>
                <p className="text-lg font-bold text-primary">{formatMoney(totalPercepciones)}</p>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border/40 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Emisor</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-sm">
                      {inv.invoice_date ? format(new Date(inv.invoice_date + "T12:00:00"), "dd/MM/yyyy") : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {invoiceTypeLabels[inv.invoice_type] || inv.invoice_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-mono">{inv.invoice_number || "-"}</TableCell>
                    <TableCell className="text-sm">
                      <div>{inv.emitter_name || inv.operators?.name || "-"}</div>
                      <div className="text-xs text-muted-foreground">{inv.emitter_cuit}</div>
                    </TableCell>
                    <TableCell className="text-right text-sm">{formatMoney(inv.net_amount, inv.currency)}</TableCell>
                    <TableCell className="text-right text-sm text-success">{formatMoney(inv.iva_amount, inv.currency)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatMoney(inv.total_amount, inv.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "VERIFIED" ? "default" : "secondary"} className="text-xs">
                        {inv.status === "VERIFIED" ? "Verificada" : inv.status === "REJECTED" ? "Rechazada" : "Registrada"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {inv.document_url && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                            <a href={inv.document_url} target="_blank" rel="noopener noreferrer">
                              <Eye className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(inv)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(inv.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </>
        )}
      </CardContent>

      {/* Dialog for creating/editing */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) { setShowDialog(false); resetForm() } else setShowDialog(true) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle>{editingInvoice ? "Editar Factura de Compra" : "Nueva Factura de Compra"}</DialogTitle>
            <DialogDescription>
              {editingInvoice ? "Verificá y corregí los datos extraídos" : "Registrá una factura recibida del operador"}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5 space-y-5">
            {/* TEMPORAL: diagnóstico de extracción OCR. Sacar cuando se valide. */}
            {ocrDebug && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-mono text-amber-700 dark:text-amber-300 overflow-x-auto">
                <div className="font-semibold mb-1">DEBUG OCR (temporal)</div>
                <pre className="whitespace-pre-wrap break-all">{JSON.stringify(ocrDebug, null, 2)}</pre>
              </div>
            )}

            {/* Archivo adjunto (subido por OCR, aún sin guardar) */}
            {form.document_url && (
              <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{form.document_name || "Comprobante adjunto"}</span>
                </div>
                <Button variant="ghost" size="sm" className="h-7 shrink-0" asChild>
                  <a href={form.document_url} target="_blank" rel="noopener noreferrer">
                    <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                  </a>
                </Button>
              </div>
            )}

            {/* Operator */}
            <div>
              <Label>Operador</Label>
              <Select value={form.operator_id} onValueChange={v => setForm(prev => ({ ...prev, operator_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar operador" /></SelectTrigger>
                <SelectContent>
                  {operators.map(op => (
                    <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type + Number */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo de Comprobante *</Label>
                <Select value={form.invoice_type} onValueChange={v => setForm(prev => ({ ...prev, invoice_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FACTURA_A">Factura A</SelectItem>
                    <SelectItem value="FACTURA_B">Factura B</SelectItem>
                    <SelectItem value="FACTURA_C">Factura C</SelectItem>
                    <SelectItem value="NOTA_CREDITO_A">Nota de Crédito A</SelectItem>
                    <SelectItem value="NOTA_CREDITO_B">Nota de Crédito B</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Número de Factura *</Label>
                <Input
                  placeholder="0001-00012345"
                  value={form.invoice_number}
                  onChange={e => setForm(prev => ({ ...prev, invoice_number: e.target.value }))}
                  onBlur={e => {
                    // SP-6.6: auto-format al blur ("1-99" → "0001-00000099")
                    const normalized = normalizeInvoiceNumber(e.target.value)
                    if (normalized && normalized !== e.target.value) {
                      setForm(prev => ({ ...prev, invoice_number: normalized }))
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Formato: <code>XXXX-XXXXXXXX</code>. Si tipeás <code>1-99</code> se autocompleta a <code>0001-00000099</code>.
                </p>
              </div>
            </div>

            {/* Date + CUIT */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fecha de Emisión *</Label>
                <Input
                  type="date"
                  value={form.invoice_date}
                  onChange={e => setForm(prev => ({ ...prev, invoice_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>CUIT Emisor *</Label>
                <Input
                  placeholder="20-12345678-9"
                  value={form.emitter_cuit}
                  onChange={e => setForm(prev => ({ ...prev, emitter_cuit: e.target.value }))}
                />
              </div>
            </div>

            {/* Emitter name */}
            <div>
              <Label>Razón Social del Emisor</Label>
              <Input
                placeholder="Eurovips S.R.L."
                value={form.emitter_name}
                onChange={e => setForm(prev => ({ ...prev, emitter_name: e.target.value }))}
              />
            </div>

            {/* Currency + Net + IVA Rate */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Moneda</Label>
                <Select value={form.currency} onValueChange={v => setForm(prev => ({ ...prev, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Neto Gravado *</Label>
                <DecimalInput
                  placeholder="0.00"
                  value={form.net_amount}
                  onChange={v => setForm(prev => ({ ...prev, net_amount: v }))}
                />
              </div>
              <div>
                <Label>Alícuota IVA %</Label>
                <Select value={form.iva_rate} onValueChange={v => setForm(prev => ({ ...prev, iva_rate: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="21">21%</SelectItem>
                    <SelectItem value="10.5">10.5%</SelectItem>
                    <SelectItem value="27">27%</SelectItem>
                    <SelectItem value="0">Exento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* IVA Amount + Percepciones */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>IVA (auto)</Label>
                <Input type="number" step="0.01" value={form.iva_amount} readOnly className="bg-muted" />
              </div>
              <div>
                <Label>
                  Percepción IVA
                  {autoPerceptions && !masterToggleOff && <Badge variant="secondary" className="ml-2 text-[10px]">auto</Badge>}
                </Label>
                <DecimalInput
                  placeholder="0"
                  value={form.perception_iva}
                  onChange={v => setForm(prev => ({ ...prev, perception_iva: v }))}
                  readOnly={autoPerceptions && !masterToggleOff}
                  className={autoPerceptions && !masterToggleOff ? "bg-muted" : ""}
                />
              </div>
              <div>
                <Label>
                  Percepción IIBB
                  {autoPerceptions && !masterToggleOff && <Badge variant="secondary" className="ml-2 text-[10px]">auto</Badge>}
                </Label>
                <DecimalInput
                  placeholder="0"
                  value={form.perception_iibb}
                  onChange={v => setForm(prev => ({ ...prev, perception_iibb: v }))}
                  readOnly={autoPerceptions && !masterToggleOff}
                  className={autoPerceptions && !masterToggleOff ? "bg-muted" : ""}
                />
              </div>
            </div>

            {/* SP-6.5: banner percepciones automáticas */}
            {!editingInvoice && (
              <div className={`rounded-md border px-3 py-2 text-xs flex items-center justify-between ${
                masterToggleOff
                  ? "bg-muted/40 border-muted text-muted-foreground"
                  : autoPerceptions
                    ? "bg-primary/5 border-primary/15 text-primary dark:bg-primary/30 dark:border-primary dark:text-primary"
                    : "bg-accent-coral/5 border-accent-coral/15 text-accent-coral dark:bg-accent-coral/30 dark:border-accent-coral dark:text-accent-coral"
              }`}>
                <div className="flex items-center gap-2">
                  {calculatingPerceptions && <Loader2 className="h-3 w-3 animate-spin" />}
                  {masterToggleOff ? (
                    <span>Cálculo automático desactivado en Configuración → Finanzas. Cargá las percepciones manualmente.</span>
                  ) : autoPerceptions ? (
                    appliedRules.length > 0 ? (
                      <span>
                        Calculado automático según reglas de la agencia:{" "}
                        {appliedRules.map((r, i) => (
                          <span key={r.type}>
                            {i > 0 && ", "}
                            <strong>{r.type.replace("PERCEPCION_", "")} {r.rate}%</strong>
                          </span>
                        ))}
                      </span>
                    ) : parseFloat(form.net_amount) > 0 ? (
                      <span>No aplica ninguna percepción para este monto/operador (regla mínima no alcanzada o exento).</span>
                    ) : (
                      <span>Las percepciones se calculan automáticamente al ingresar Neto Gravado y CUIT del emisor.</span>
                    )
                  ) : (
                    <span>Modo manual — los valores no se actualizan automáticamente.</span>
                  )}
                </div>
                {!masterToggleOff && (
                  <Button
                    type="button" variant="ghost" size="sm"
                    className="h-6 text-xs"
                    onClick={() => setAutoPerceptions(prev => !prev)}
                  >
                    {autoPerceptions ? "Editar manualmente" : "Volver a auto"}
                  </Button>
                )}
              </div>
            )}

            {/* Other taxes + Total */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Otros Impuestos</Label>
                <DecimalInput
                  placeholder="0"
                  value={form.other_taxes}
                  onChange={v => setForm(prev => ({ ...prev, other_taxes: v }))}
                />
              </div>
              <div>
                <Label>Total Factura (auto)</Label>
                <Input type="number" step="0.01" value={form.total_amount} readOnly className="bg-muted font-bold" />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>Notas</Label>
              <Input
                placeholder="Notas adicionales..."
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => { setShowDialog(false); resetForm() }}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                <Check className="h-4 w-4 mr-1" />
                {editingInvoice ? "Guardar Cambios" : "Registrar Factura"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
