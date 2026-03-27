"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { COMPROBANTE_LABELS, CONDICION_IVA_LABELS, DOCUMENTO_LABELS, IVA_PORCENTAJES } from "@/lib/afip/types"

interface NewInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agencyId: string
  operationId?: string
  operationData?: {
    destination?: string | null
    sale_amount_total?: number | null
    currency?: string | null
    departure_date?: string | null
    return_date?: string | null
  }
  onSuccess?: (invoice: any) => void
}

const COMPROBANTE_OPTIONS = [
  { value: "6", label: "Factura B" },
  { value: "1", label: "Factura A" },
  { value: "11", label: "Factura C" },
  { value: "19", label: "Factura E (Exportación)" },
]

const DOC_OPTIONS = [
  { value: "80", label: "CUIT" },
  { value: "96", label: "DNI" },
  { value: "99", label: "Otro" },
]

const IVA_OPTIONS = [
  { value: "5", label: "21%", pct: 21 },
  { value: "4", label: "10.5%", pct: 10.5 },
  { value: "3", label: "0%", pct: 0 },
  { value: "6", label: "27%", pct: 27 },
]

const CONDICION_OPTIONS = [
  { value: "5", label: "Consumidor Final" },
  { value: "1", label: "Responsable Inscripto" },
  { value: "6", label: "Monotributista" },
  { value: "4", label: "Exento" },
  { value: "3", label: "No Responsable" },
]

export function NewInvoiceDialog({
  open,
  onOpenChange,
  agencyId,
  operationId,
  operationData,
  onSuccess,
}: NewInvoiceDialogProps) {
  const { toast } = useToast()

  const isUsd = operationData?.currency === "USD"

  // Form state
  const [cbteTipo, setCbteTipo] = useState("6")
  const [concepto, setConcepto] = useState("2") // Servicios
  const [docTipo, setDocTipo] = useState("96") // DNI default
  const [docNro, setDocNro] = useState("")
  const [nombre, setNombre] = useState("")
  const [condicionIva, setCondicionIva] = useState("5") // Consumidor Final
  const [descripcion, setDescripcion] = useState(
    operationData?.destination ? `Servicio turístico - ${operationData.destination}` : ""
  )
  const [impNeto, setImpNeto] = useState(String(operationData?.sale_amount_total || ""))
  const [ivaId, setIvaId] = useState(isUsd ? "3" : "5") // 0% para turismo exterior, 21% local
  const [moneda, setMoneda] = useState(isUsd ? "DOL" : "PES")
  const [cotizacion, setCotizacion] = useState("1")
  const [fchServDesde, setFchServDesde] = useState(
    operationData?.departure_date ? operationData.departure_date.split("T")[0] : ""
  )
  const [fchServHasta, setFchServHasta] = useState(
    operationData?.return_date ? operationData.return_date.split("T")[0] : ""
  )
  const [notes, setNotes] = useState("")
  const [pto_vta, setPtoVta] = useState(1)

  // Result state
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ cae: string; cbte_nro: number; cae_fch_vto: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState("")

  // Load default pto_vta from AFIP status
  useEffect(() => {
    if (!open || !agencyId) return
    fetch(`/api/settings/afip/status?agencyId=${agencyId}`)
      .then(r => r.json())
      .then(d => {
        if (d.configured && d.config?.punto_venta) {
          setPtoVta(d.config.punto_venta)
        }
      })
      .catch(() => {})
  }, [open, agencyId])

  // Computed values
  const selectedIva = IVA_OPTIONS.find(o => o.value === ivaId)
  const netoNum = parseFloat(impNeto) || 0
  const ivaNum = netoNum * ((selectedIva?.pct || 0) / 100)
  const totalNum = netoNum + ivaNum

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agencyId || !docNro || !nombre || !impNeto) return

    setSubmitting(true)
    setErrorMsg("")
    setResult(null)

    try {
      // Step 1: Create draft
      const createRes = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agency_id: agencyId,
          operation_id: operationId || null,
          pto_vta,
          cbte_tipo: parseInt(cbteTipo),
          concepto: parseInt(concepto),
          receptor_doc_tipo: parseInt(docTipo),
          receptor_doc_nro: docNro.replace(/\D/g, ""),
          receptor_nombre: nombre,
          receptor_condicion_iva: parseInt(condicionIva),
          items: [{
            descripcion,
            cantidad: 1,
            precio_unitario: netoNum,
            iva_id: parseInt(ivaId),
            iva_porcentaje: selectedIva?.pct || 0,
          }],
          moneda,
          cotizacion: moneda === "DOL" ? parseFloat(cotizacion) || 1 : 1,
          fch_serv_desde: fchServDesde || undefined,
          fch_serv_hasta: fchServHasta || undefined,
          notes: notes || undefined,
        }),
      })

      const createData = await createRes.json()
      if (!createRes.ok || !createData.invoice) {
        setErrorMsg(createData.error || "Error al crear factura")
        return
      }

      const invoiceId = createData.invoice.id

      // Step 2: Authorize
      const authRes = await fetch(`/api/invoices/${invoiceId}/authorize`, {
        method: "POST",
      })
      const authData = await authRes.json()

      if (authRes.ok && authData.success) {
        setResult({
          cae: authData.data.cae,
          cbte_nro: authData.data.cbte_nro,
          cae_fch_vto: authData.data.cae_fch_vto,
        })
        onSuccess?.({ id: invoiceId, ...authData.data })
      } else {
        const errDetails = authData.details?.map((e: any) => e.Msg).join(", ") || ""
        setErrorMsg(authData.error + (errDetails ? `: ${errDetails}` : ""))
      }
    } catch {
      setErrorMsg("Error de conexión")
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (submitting) return
    setResult(null)
    setErrorMsg("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Factura Electrónica</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium text-green-800 dark:text-green-300">Factura autorizada por AFIP</p>
                <p className="text-sm text-green-700 dark:text-green-400">
                  N° {String(result.cbte_nro).padStart(8, "0")}
                </p>
                <p className="text-sm font-mono text-green-700 dark:text-green-400">
                  CAE: {result.cae}
                </p>
                <p className="text-xs text-green-600 dark:text-green-500">
                  Vence: {result.cae_fch_vto}
                </p>
              </div>
            </div>
            <Button onClick={handleClose} className="w-full">Cerrar</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {errorMsg && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800 text-sm text-red-800 dark:text-red-300">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>{errorMsg}</p>
              </div>
            )}

            {/* Tipo comprobante */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Comprobante</Label>
                <Select value={cbteTipo} onValueChange={setCbteTipo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPROBANTE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Concepto</Label>
                <Select value={concepto} onValueChange={setConcepto}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">Servicios</SelectItem>
                    <SelectItem value="1">Productos</SelectItem>
                    <SelectItem value="3">Productos y Servicios</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Receptor */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Datos del Receptor</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Documento</Label>
                  <Select value={docTipo} onValueChange={setDocTipo}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Número de Documento</Label>
                  <Input
                    placeholder={docTipo === "80" ? "30712345678" : "12345678"}
                    value={docNro}
                    onChange={e => setDocNro(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre / Razón Social</Label>
                  <Input
                    placeholder="Apellido, Nombre"
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Condición IVA</Label>
                  <Select value={condicionIva} onValueChange={setCondicionIva}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDICION_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Montos */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Detalle</p>
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Textarea
                  placeholder="Servicio turístico - ..."
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  rows={2}
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Importe Neto</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={impNeto}
                    onChange={e => setImpNeto(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Alícuota IVA</Label>
                  <Select value={ivaId} onValueChange={setIvaId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IVA_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Moneda</Label>
                  <Select value={moneda} onValueChange={setMoneda}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PES">ARS (Pesos)</SelectItem>
                      <SelectItem value="DOL">USD (Dólares)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {moneda === "DOL" && (
                <div className="space-y-2">
                  <Label>Cotización USD</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    value={cotizacion}
                    onChange={e => setCotizacion(e.target.value)}
                    className="w-40"
                  />
                </div>
              )}
              {/* Resumen */}
              <div className="flex gap-4 p-3 bg-muted/50 rounded-lg text-sm">
                <span className="text-muted-foreground">Neto: <strong>{netoNum.toFixed(2)}</strong></span>
                <span className="text-muted-foreground">IVA ({selectedIva?.pct}%): <strong>{ivaNum.toFixed(2)}</strong></span>
                <span className="font-semibold">Total: {moneda === "DOL" ? "USD" : "$"} {totalNum.toFixed(2)}</span>
              </div>
            </div>

            {/* Fechas de servicio */}
            {(concepto === "2" || concepto === "3") && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fecha servicio desde</Label>
                  <Input
                    type="date"
                    value={fchServDesde}
                    onChange={e => setFchServDesde(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fecha servicio hasta</Label>
                  <Input
                    type="date"
                    value={fchServHasta}
                    onChange={e => setFchServHasta(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Notas */}
            <div className="space-y-2">
              <Label>Notas internas (no van en la factura)</Label>
              <Textarea
                placeholder="Observaciones..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || !docNro || !nombre || !impNeto}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando a AFIP...
                  </>
                ) : (
                  "Facturar"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
