"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Plus, Loader2, Trash2, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ServiceType = "SEAT" | "LUGGAGE" | "VISA" | "TRANSFER" | "ASSISTANCE"
type Currency = "ARS" | "USD"

interface Operator {
  id: string
  name: string
}

interface OperationService {
  id: string
  operation_id: string
  service_type: ServiceType
  description: string | null
  operator_id: string | null
  sale_amount: number
  sale_currency: Currency
  cost_amount: number
  cost_currency: Currency
  margin_amount: number | null
  generates_commission: boolean
  payment_id: string | null
  operator_payment_id: string | null
  created_at: string
  operators: { id: string; name: string } | null
}

interface OperationServicesSectionProps {
  operationId: string
  operationStatus: string
  operators: Operator[]
  userRole: string
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const SERVICE_TYPE_OPTIONS: { value: ServiceType; label: string; commissions: boolean }[] = [
  { value: "SEAT", label: "Asiento", commissions: false },
  { value: "LUGGAGE", label: "Equipaje", commissions: false },
  { value: "VISA", label: "Visa", commissions: false },
  { value: "TRANSFER", label: "Traslado / Transfer", commissions: true },
  { value: "ASSISTANCE", label: "Asistencia", commissions: true },
]

const SERVICE_LABELS: Record<ServiceType, string> = {
  SEAT: "Asiento",
  LUGGAGE: "Equipaje",
  VISA: "Visa",
  TRANSFER: "Traslado / Transfer",
  ASSISTANCE: "Asistencia",
}

const formatCurrency = (amount: number, currency: Currency) => {
  const formatted = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return currency === "USD" ? `USD ${formatted}` : `$ ${formatted}`
}

// ─── Formulario vacío ─────────────────────────────────────────────────────────

const emptyForm = () => ({
  service_type: "" as ServiceType | "",
  operator_id: "",
  sale_amount: "",
  sale_currency: "ARS" as Currency,
  cost_amount: "",
  cost_currency: "ARS" as Currency,
  description: "",
})

// ─── Componente principal ─────────────────────────────────────────────────────

export function OperationServicesSection({
  operationId,
  operationStatus,
  operators,
  userRole,
}: OperationServicesSectionProps) {
  const router = useRouter()
  const isSeller = userRole === "SELLER"
  const isCancelled = operationStatus === "CANCELLED"

  const [services, setServices] = useState<OperationService[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)

  // ── Cargar servicios ──────────────────────────────────────────────────────

  const loadServices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/operations/${operationId}/services`)
      if (!res.ok) throw new Error("Error al cargar servicios")
      const data = await res.json()
      setServices(data.services || [])
    } catch (error) {
      toast.error("Error al cargar los servicios")
    } finally {
      setLoading(false)
    }
  }, [operationId])

  useEffect(() => {
    loadServices()
  }, [loadServices])

  // ── Totales ───────────────────────────────────────────────────────────────

  // Agrupamos totales por moneda
  const totals = services.reduce(
    (acc, s) => {
      // Venta
      if (!acc.sale[s.sale_currency]) acc.sale[s.sale_currency] = 0
      acc.sale[s.sale_currency] += s.sale_amount

      // Costo (solo si no es SELLER)
      if (!isSeller) {
        if (!acc.cost[s.cost_currency]) acc.cost[s.cost_currency] = 0
        acc.cost[s.cost_currency] += s.cost_amount

        // Margen (solo si misma moneda)
        if (s.margin_amount !== null) {
          if (!acc.margin[s.sale_currency]) acc.margin[s.sale_currency] = 0
          acc.margin[s.sale_currency] += s.margin_amount
        }
      }

      return acc
    },
    {
      sale: {} as Record<string, number>,
      cost: {} as Record<string, number>,
      margin: {} as Record<string, number>,
    }
  )

  // ── Abrir / cerrar dialog ─────────────────────────────────────────────────

  const openDialog = () => {
    setForm(emptyForm())
    setFormError(null)
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setFormError(null)
  }

  // ── Validar formulario ────────────────────────────────────────────────────

  const validateForm = () => {
    if (!form.service_type) return "Seleccioná un tipo de servicio"
    if (form.sale_amount === "" || Number(form.sale_amount) < 0)
      return "El precio de venta debe ser 0 o mayor"
    if (form.cost_amount === "" || Number(form.cost_amount) < 0)
      return "El costo debe ser 0 o mayor"
    return null
  }

  // ── Guardar servicio ──────────────────────────────────────────────────────

  const handleSave = async () => {
    const error = validateForm()
    if (error) {
      setFormError(error)
      return
    }

    setSaving(true)
    setFormError(null)

    try {
      const payload = {
        service_type: form.service_type,
        operator_id: form.operator_id || null,
        sale_amount: Number(form.sale_amount),
        sale_currency: form.sale_currency,
        cost_amount: Number(form.cost_amount),
        cost_currency: form.cost_currency,
        description: form.description || null,
      }

      const res = await fetch(`/api/operations/${operationId}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        setFormError(data.error || "Error al agregar el servicio")
        return
      }

      toast.success("Servicio agregado correctamente")
      closeDialog()
      await loadServices()
      router.refresh()
    } catch (error) {
      setFormError("Error inesperado al guardar el servicio")
    } finally {
      setSaving(false)
    }
  }

  // ── Eliminar servicio ─────────────────────────────────────────────────────

  const handleDelete = async (serviceId: string) => {
    if (!confirm("¿Eliminar este servicio? Se revertirán los registros contables pendientes.")) return

    setDeletingId(serviceId)
    try {
      const res = await fetch(`/api/operations/${operationId}/services/${serviceId}`, {
        method: "DELETE",
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Error al eliminar el servicio")
        return
      }

      if (data.warnings?.length) {
        data.warnings.forEach((w: string) => toast.warning(w))
      }

      toast.success("Servicio eliminado")
      await loadServices()
      router.refresh()
    } catch (error) {
      toast.error("Error inesperado al eliminar el servicio")
    } finally {
      setDeletingId(null)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Servicios adicionales</CardTitle>
              <CardDescription className="mt-1">
                Servicios incluidos en esta operación (asiento, equipaje, visa, transfer, asistencia)
              </CardDescription>
            </div>
            {!isCancelled && (
              <Button size="sm" onClick={openDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar servicio
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : services.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <p className="text-sm">No hay servicios cargados todavía.</p>
              {!isCancelled && (
                <Button variant="outline" size="sm" className="mt-3" onClick={openDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar primer servicio
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">Precio cliente</TableHead>
                    {!isSeller && (
                      <>
                        <TableHead className="text-right">Costo</TableHead>
                        <TableHead className="text-right">Margen</TableHead>
                      </>
                    )}
                    <TableHead>Comisiona</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{SERVICE_LABELS[s.service_type]}</p>
                          {s.description && (
                            <p className="text-xs text-muted-foreground">{s.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.operators?.name || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(s.sale_amount, s.sale_currency)}
                      </TableCell>
                      {!isSeller && (
                        <>
                          <TableCell className="text-right text-muted-foreground">
                            {formatCurrency(s.cost_amount, s.cost_currency)}
                          </TableCell>
                          <TableCell className="text-right">
                            {s.margin_amount !== null ? (
                              <span className={s.margin_amount >= 0 ? "text-green-600" : "text-red-600"}>
                                {formatCurrency(s.margin_amount, s.sale_currency)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">Monedas distintas</span>
                            )}
                          </TableCell>
                        </>
                      )}
                      <TableCell>
                        {s.generates_commission ? (
                          <Badge variant="secondary" className="text-xs">Sí</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!isCancelled && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(s.id)}
                            disabled={deletingId === s.id}
                          >
                            {deletingId === s.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Totales */}
              <Separator />
              <div className="flex flex-wrap gap-6 justify-end text-sm">
                <div className="text-right">
                  <p className="text-muted-foreground text-xs mb-1">Total servicios (cliente)</p>
                  {Object.entries(totals.sale).map(([currency, amount]) => (
                    <p key={currency} className="font-semibold">
                      {formatCurrency(amount, currency as Currency)}
                    </p>
                  ))}
                </div>

                {!isSeller && Object.keys(totals.cost).length > 0 && (
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs mb-1">Total costo (proveedores)</p>
                    {Object.entries(totals.cost).map(([currency, amount]) => (
                      <p key={currency} className="font-semibold text-muted-foreground">
                        {formatCurrency(amount, currency as Currency)}
                      </p>
                    ))}
                  </div>
                )}

                {!isSeller && Object.keys(totals.margin).length > 0 && (
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs mb-1">Margen servicios</p>
                    {Object.entries(totals.margin).map(([currency, amount]) => (
                      <p
                        key={currency}
                        className={`font-semibold ${amount >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {formatCurrency(amount, currency as Currency)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog: Agregar servicio ── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Agregar servicio</DialogTitle>
            <DialogDescription>
              El servicio se sumará al total de la operación y generará deuda del cliente y del proveedor.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Tipo */}
            <div className="grid gap-1.5">
              <Label>Tipo de servicio *</Label>
              <Select
                value={form.service_type}
                onValueChange={(v) => setForm({ ...form, service_type: v as ServiceType })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná un tipo..." />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span>{opt.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {opt.commissions ? "· comisiona" : "· no comisiona"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Proveedor */}
            <div className="grid gap-1.5">
              <Label>Proveedor / Operador</Label>
              <Select
                value={form.operator_id}
                onValueChange={(v) => setForm({ ...form, operator_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná un proveedor (opcional)..." />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Precio cliente */}
            <div className="grid gap-1.5">
              <Label>Precio al cliente *</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.sale_amount}
                  onChange={(e) => setForm({ ...form, sale_amount: e.target.value })}
                  className="flex-1"
                />
                <Select
                  value={form.sale_currency}
                  onValueChange={(v) => setForm({ ...form, sale_currency: v as Currency })}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Costo nuestro */}
            <div className="grid gap-1.5">
              <Label>Costo al proveedor *</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.cost_amount}
                  onChange={(e) => setForm({ ...form, cost_amount: e.target.value })}
                  className="flex-1"
                />
                <Select
                  value={form.cost_currency}
                  onValueChange={(v) => setForm({ ...form, cost_currency: v as Currency })}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Descripción */}
            <div className="grid gap-1.5">
              <Label>Descripción / Notas</Label>
              <Textarea
                placeholder="Ej: Asiento 14A, ventanilla"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>

            {/* Info comisión según tipo */}
            {form.service_type && (
              <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <p className="text-muted-foreground">
                  {COMMISSION_INFO[form.service_type as ServiceType]}
                </p>
              </div>
            )}

            {/* Error */}
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Agregar servicio"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Info contextual por tipo de servicio
const COMMISSION_INFO: Record<ServiceType, string> = {
  SEAT: "Asiento: no genera comisión al vendedor. Generará deuda del cliente y deuda al proveedor seleccionado.",
  LUGGAGE: "Equipaje: no genera comisión al vendedor. Generará deuda del cliente y deuda al proveedor seleccionado.",
  VISA: "Visa: no genera comisión al vendedor. Generará deuda del cliente y deuda al proveedor seleccionado.",
  TRANSFER: "Traslado / Transfer: sí genera comisión al vendedor sobre el margen del servicio (usando las reglas de comisión activas).",
  ASSISTANCE: "Asistencia: sí genera comisión al vendedor sobre el margen del servicio (usando las reglas de comisión activas).",
}
