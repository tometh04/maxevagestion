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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Plus, Loader2, Trash2, AlertCircle, CalendarIcon } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { es } from "date-fns/locale"

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

interface FinancialAccount {
  id: string
  name: string
  type: string
  currency: "ARS" | "USD"
  current_balance?: number
  is_active?: boolean
}

interface ServicePayment {
  id: string
  operation_id: string
  operation_service_id: string | null
  payer_type: string
  direction: string
  method: string
  amount: number
  currency: string
  exchange_rate: number | null
  amount_usd: number | null
  date_paid: string | null
  date_due: string | null
  status: string
  reference: string | null
}

interface OperationServicesSectionProps {
  operationId: string
  operationStatus: string
  operators: Operator[]
  userRole: string
  servicePayments?: ServicePayment[]
  operationCurrency?: string
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

const paymentMethods = [
  { value: "Transferencia", label: "Transferencia Bancaria" },
  { value: "Efectivo", label: "Efectivo" },
  { value: "Tarjeta Crédito", label: "Tarjeta de Crédito" },
  { value: "Tarjeta Débito", label: "Tarjeta de Débito" },
  { value: "MercadoPago", label: "MercadoPago" },
  { value: "PayPal", label: "PayPal" },
  { value: "Otro", label: "Otro" },
]

const formatCurrency = (amount: number, currency: Currency | string) => {
  const formatted = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return currency === "USD" ? `USD ${formatted}` : `$ ${formatted}`
}

// ─── Schema pagos de servicios ─────────────────────────────────────────────────

const servicePaymentSchema = z.object({
  operation_service_id: z.string().min(1, "Seleccioná un servicio"),
  payer_type: z.enum(["CUSTOMER", "OPERATOR"]),
  direction: z.enum(["INCOME", "EXPENSE"]),
  method: z.string().min(1, "Método es requerido"),
  amount: z.coerce.number().min(0.01, "Monto debe ser mayor a 0"),
  currency: z.enum(["ARS", "USD"]),
  financial_account_id: z.string().min(1, "Debe seleccionar una cuenta financiera"),
  exchange_rate: z.coerce.number().optional(),
  date_paid: z.date({ required_error: "Fecha de pago es requerida" }),
  notes: z.string().optional(),
})

type ServicePaymentFormValues = z.infer<typeof servicePaymentSchema>

// ─── Formulario vacío (servicio) ───────────────────────────────────────────────

const emptyServiceForm = () => ({
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
  servicePayments = [],
  operationCurrency = "USD",
}: OperationServicesSectionProps) {
  const router = useRouter()
  const isSeller = userRole === "SELLER"
  const isCancelled = operationStatus === "CANCELLED"

  // ── Estado servicios ──────────────────────────────────────────────────────
  const [services, setServices] = useState<OperationService[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyServiceForm())
  const [formError, setFormError] = useState<string | null>(null)

  // ── Estado pagos de servicios ─────────────────────────────────────────────
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false)
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])

  const paymentForm = useForm<ServicePaymentFormValues>({
    resolver: zodResolver(servicePaymentSchema),
    defaultValues: {
      operation_service_id: "",
      payer_type: "CUSTOMER",
      direction: "INCOME",
      method: "Transferencia",
      amount: 0,
      currency: "ARS",
      financial_account_id: "",
      exchange_rate: undefined,
      date_paid: new Date(),
      notes: "",
    },
  })

  // ── Cargar cuentas financieras cuando se abre el dialog de pago ──────────
  useEffect(() => {
    if (paymentDialogOpen) {
      const fetchAccounts = async () => {
        try {
          const res = await fetch("/api/accounting/financial-accounts?excludeAccountingOnly=true")
          if (res.ok) {
            const data = await res.json()
            setFinancialAccounts((data.accounts || []).filter((a: FinancialAccount) => a.is_active !== false))
          }
        } catch (e) {
          console.error("Error fetching financial accounts:", e)
        }
      }
      fetchAccounts()
    }
  }, [paymentDialogOpen])

  // ── Cargar servicios ──────────────────────────────────────────────────────

  const loadServices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/operations/${operationId}/services`)
      if (!res.ok) throw new Error("Error al cargar servicios")
      const data = await res.json()
      setServices(data.services || [])
    } catch {
      toast.error("Error al cargar los servicios")
    } finally {
      setLoading(false)
    }
  }, [operationId])

  useEffect(() => {
    loadServices()
  }, [loadServices])

  // ── Totales servicios ─────────────────────────────────────────────────────

  const serviceTotals = services.reduce(
    (acc, s) => {
      if (!acc.sale[s.sale_currency]) acc.sale[s.sale_currency] = 0
      acc.sale[s.sale_currency] += s.sale_amount

      if (!isSeller) {
        if (!acc.cost[s.cost_currency]) acc.cost[s.cost_currency] = 0
        acc.cost[s.cost_currency] += s.cost_amount

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

  // ── Totales pagos de servicios ────────────────────────────────────────────

  const servicePaymentTotals = servicePayments.reduce(
    (acc, p) => {
      if (p.status === "PAID") {
        if (!acc[p.currency]) acc[p.currency] = 0
        acc[p.currency] += Number(p.amount)
      }
      return acc
    },
    {} as Record<string, number>
  )

  // ── Abrir / cerrar dialog servicio ────────────────────────────────────────

  const openDialog = () => {
    setForm(emptyServiceForm())
    setFormError(null)
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setFormError(null)
  }

  // ── Validar formulario servicio ───────────────────────────────────────────

  const validateServiceForm = () => {
    if (!form.service_type) return "Seleccioná un tipo de servicio"
    if (form.sale_amount === "" || Number(form.sale_amount) < 0)
      return "El precio de venta debe ser 0 o mayor"
    if (form.cost_amount === "" || Number(form.cost_amount) < 0)
      return "El costo debe ser 0 o mayor"
    return null
  }

  // ── Guardar servicio ──────────────────────────────────────────────────────

  const handleSaveService = async () => {
    const error = validateServiceForm()
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
        const msg = [data.error, data.details, data.hint].filter(Boolean).join(" — ")
        setFormError(msg || "Error al agregar el servicio")
        return
      }

      toast.success("Servicio agregado correctamente")
      closeDialog()
      await loadServices()
      router.refresh()
    } catch {
      setFormError("Error inesperado al guardar el servicio")
    } finally {
      setSaving(false)
    }
  }

  // ── Eliminar servicio ─────────────────────────────────────────────────────

  const handleDeleteService = async (serviceId: string) => {
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
    } catch {
      toast.error("Error inesperado al eliminar el servicio")
    } finally {
      setDeletingId(null)
    }
  }

  // ── Registrar pago de servicio ────────────────────────────────────────────

  const openPaymentDialog = () => {
    paymentForm.reset({
      operation_service_id: services.length === 1 ? services[0].id : "",
      payer_type: "CUSTOMER",
      direction: "INCOME",
      method: "Transferencia",
      amount: 0,
      currency: "ARS",
      financial_account_id: "",
      exchange_rate: undefined,
      date_paid: new Date(),
      notes: "",
    })
    setPaymentDialogOpen(true)
  }

  const onSubmitServicePayment = async (values: ServicePaymentFormValues) => {
    if (values.currency === "ARS" && !values.exchange_rate) {
      paymentForm.setError("exchange_rate", { message: "Ingresá el tipo de cambio para ARS" })
      return
    }

    setIsSubmittingPayment(true)
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation_id: operationId,
          operation_service_id: values.operation_service_id,
          payer_type: values.payer_type,
          direction: values.direction,
          method: values.method,
          amount: values.amount,
          currency: values.currency,
          financial_account_id: values.financial_account_id,
          exchange_rate: values.currency === "ARS" ? values.exchange_rate : null,
          date_paid: values.date_paid.toISOString().split("T")[0],
          date_due: values.date_paid.toISOString().split("T")[0],
          status: "PAID",
          notes: values.notes,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Error al registrar el pago")
      }

      toast.success("Pago de servicio registrado correctamente")
      setPaymentDialogOpen(false)
      paymentForm.reset()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado")
    } finally {
      setIsSubmittingPayment(false)
    }
  }

  // ── Eliminar pago ─────────────────────────────────────────────────────────

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm("¿Eliminar este pago? También se eliminarán los movimientos contables asociados.")) return

    setDeletingPaymentId(paymentId)
    try {
      const res = await fetch(`/api/payments?paymentId=${paymentId}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Error al eliminar pago")
      }

      toast.success("Pago eliminado")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al eliminar pago")
    } finally {
      setDeletingPaymentId(null)
    }
  }

  // ── Helper: obtener nombre del servicio por ID ────────────────────────────

  const getServiceLabel = (serviceId: string) => {
    const svc = services.find(s => s.id === serviceId)
    return svc ? SERVICE_LABELS[svc.service_type] : "Servicio"
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* ────────────────────────── SECCIÓN 1: Lista de servicios ─────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Servicios adicionales</CardTitle>
              <CardDescription className="mt-1">
                Asiento, equipaje, visa, transfer, asistencia — cargados en esta operación
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
                            onClick={() => handleDeleteService(s.id)}
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

              {/* Totales servicios */}
              <Separator />
              <div className="flex flex-wrap gap-6 justify-end text-sm">
                <div className="text-right">
                  <p className="text-muted-foreground text-xs mb-1">Total servicios (cliente)</p>
                  {Object.entries(serviceTotals.sale).map(([currency, amount]) => (
                    <p key={currency} className="font-semibold">
                      {formatCurrency(amount, currency as Currency)}
                    </p>
                  ))}
                </div>

                {!isSeller && Object.keys(serviceTotals.cost).length > 0 && (
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs mb-1">Total costo (proveedores)</p>
                    {Object.entries(serviceTotals.cost).map(([currency, amount]) => (
                      <p key={currency} className="font-semibold text-muted-foreground">
                        {formatCurrency(amount, currency as Currency)}
                      </p>
                    ))}
                  </div>
                )}

                {!isSeller && Object.keys(serviceTotals.margin).length > 0 && (
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs mb-1">Margen servicios</p>
                    {Object.entries(serviceTotals.margin).map(([currency, amount]) => (
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

      {/* ──────────────────── SECCIÓN 2: Pagos de servicios ──────────────── */}
      {services.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Pagos de Servicios</CardTitle>
                <CardDescription className="mt-1">
                  Cobros del cliente y pagos a proveedores por los servicios adicionales
                </CardDescription>
              </div>
              {!isCancelled && (
                <Button size="sm" onClick={openPaymentDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Registrar pago
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {servicePayments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <p className="text-sm">No hay pagos de servicios registrados.</p>
                {!isCancelled && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={openPaymentDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    Registrar primer pago
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Servicio</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-center">T/C</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {servicePayments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">
                          {(() => {
                            try {
                              const d = p.date_paid || p.date_due
                              if (!d) return "-"
                              return format(new Date(d), "dd/MM/yyyy", { locale: es })
                            } catch { return "-" }
                          })()}
                        </TableCell>
                        <TableCell className="text-sm">
                          {p.operation_service_id ? getServiceLabel(p.operation_service_id) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.direction === "INCOME" ? "default" : "destructive"}>
                            {p.direction === "INCOME" ? "Cobro" : "Pago"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{p.method || "-"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {p.currency} {Number(p.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {p.currency === "ARS" && p.exchange_rate
                            ? Number(p.exchange_rate).toLocaleString("es-AR", { minimumFractionDigits: 0 })
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.status === "PAID" ? "default" : "secondary"}>
                            {p.status === "PAID" ? "Pagado" : "Pendiente"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDeletePayment(p.id)}
                            disabled={deletingPaymentId === p.id}
                            title="Eliminar pago"
                          >
                            {deletingPaymentId === p.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Total pagos de servicios */}
                {Object.keys(servicePaymentTotals).length > 0 && (
                  <>
                    <Separator />
                    <div className="flex justify-end gap-6 text-sm">
                      <div className="text-right">
                        <p className="text-muted-foreground text-xs mb-1">Total cobrado / pagado</p>
                        {Object.entries(servicePaymentTotals).map(([currency, amount]) => (
                          <p key={currency} className="font-semibold">
                            {formatCurrency(amount, currency as Currency)}
                          </p>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Dialog: Agregar servicio ─────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Agregar servicio</DialogTitle>
            <DialogDescription>
              El servicio generará deuda al proveedor. El pago del cliente se registra desde &quot;Pagos de Servicios&quot;.
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
            <Button onClick={handleSaveService} disabled={saving}>
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

      {/* ─── Dialog: Registrar pago de servicio ──────────────────────────── */}
      <Dialog open={paymentDialogOpen} onOpenChange={(open) => { if (!open) setPaymentDialogOpen(false) }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Registrar pago de servicio</DialogTitle>
            <DialogDescription>
              Registrá un cobro al cliente o un pago al proveedor por un servicio adicional.
            </DialogDescription>
          </DialogHeader>

          <Form {...paymentForm}>
            <form onSubmit={paymentForm.handleSubmit(onSubmitServicePayment)} className="space-y-4">
              {/* Selector de servicio */}
              <FormField
                control={paymentForm.control}
                name="operation_service_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Servicio *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccioná el servicio..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {SERVICE_LABELS[s.service_type]}
                            {s.description ? ` — ${s.description}` : ""}
                            {" "}
                            <span className="text-muted-foreground text-xs">
                              ({formatCurrency(s.sale_amount, s.sale_currency)})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Tipo de pago */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={paymentForm.control}
                  name="payer_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parte</FormLabel>
                      <Select
                        onValueChange={(v) => {
                          field.onChange(v)
                          paymentForm.setValue("direction", v === "CUSTOMER" ? "INCOME" : "EXPENSE")
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="CUSTOMER">Cliente (cobro)</SelectItem>
                          <SelectItem value="OPERATOR">Proveedor (pago)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={paymentForm.control}
                  name="method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Método</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {paymentMethods.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Monto y moneda */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={paymentForm.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monto</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={paymentForm.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Moneda</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ARS">ARS</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Tipo de cambio - solo cuando moneda es ARS */}
              {paymentForm.watch("currency") === "ARS" && (
                <FormField
                  control={paymentForm.control}
                  name="exchange_rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Cambio (ARS por 1 USD) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Ej: 1200"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        {field.value && paymentForm.watch("amount")
                          ? `Equivale a USD ${(paymentForm.watch("amount") / Number(field.value)).toFixed(2)}`
                          : "Ingresá el tipo de cambio para calcular el equivalente en USD"
                        }
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Fecha */}
              <FormField
                control={paymentForm.control}
                name="date_paid"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha del Pago</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value
                              ? format(field.value, "PPP", { locale: es })
                              : <span>Seleccionar fecha</span>
                            }
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Cuenta financiera */}
              <FormField
                control={paymentForm.control}
                name="financial_account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuenta Financiera *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar cuenta..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {financialAccounts
                          .filter((acc) => acc.currency === paymentForm.watch("currency"))
                          .map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.name} ({acc.currency})
                              {acc.current_balance !== undefined && userRole !== "SELLER" && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  — Saldo: {acc.current_balance.toLocaleString("es-AR")}
                                </span>
                              )}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Notas */}
              <FormField
                control={paymentForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas</FormLabel>
                    <FormControl>
                      <Input placeholder="Referencia o notas..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPaymentDialogOpen(false)}
                  disabled={isSubmittingPayment}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmittingPayment}>
                  {isSubmittingPayment ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Registrar pago"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Info contextual por tipo de servicio ─────────────────────────────────────

const COMMISSION_INFO: Record<ServiceType, string> = {
  SEAT: "Asiento: no genera comisión al vendedor. Se generará deuda al proveedor seleccionado.",
  LUGGAGE: "Equipaje: no genera comisión al vendedor. Se generará deuda al proveedor seleccionado.",
  VISA: "Visa: no genera comisión al vendedor. Se generará deuda al proveedor seleccionado.",
  TRANSFER: "Traslado / Transfer: sí genera comisión al vendedor sobre el margen (usando las reglas de comisión activas).",
  ASSISTANCE: "Asistencia: sí genera comisión al vendedor sobre el margen (usando las reglas de comisión activas).",
}
