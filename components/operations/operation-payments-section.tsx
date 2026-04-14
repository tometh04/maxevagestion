"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { CalendarIcon, Plus, Loader2, Trash2, FileText, Download, MessageSquare, Pencil, CheckCircle2, CreditCard, Banknote, Landmark, StickyNote, Receipt } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { cn } from "@/lib/utils"
import { downloadReceiptPdf } from "@/lib/pdf/receipt-pdf"
import {
  calculateAmountInSaleCurrency,
  normalizeSupportedCurrency,
  requiresCustomerIncomeExchangeRate,
} from "@/lib/payments/customer-income-fx"
import { toast } from "sonner"
import {
  getOperationBaseOperatorPayments,
  type OperationOperatorPaymentLike,
  type OperationServicePaymentRelationLike,
} from "@/lib/operations/payment-operators"

interface FinancialAccount {
  id: string
  name: string
  type: string
  currency: "ARS" | "USD"
  current_balance?: number
  is_active?: boolean
}

const paymentSchema = z.object({
  payer_type: z.enum(["CUSTOMER", "OPERATOR"]),
  direction: z.enum(["INCOME", "EXPENSE"]),
  operator_id: z.string().optional(),
  method: z.string().min(1, "Método es requerido"),
  amount: z.coerce.number().min(0.01, "Monto debe ser mayor a 0"),
  currency: z.enum(["ARS", "USD"]),
  financial_account_id: z.string().min(1, "Debe seleccionar una cuenta financiera"),
  exchange_rate: z.coerce.number().optional(), // Tipo de cambio cuando la cobranza requiere conversion
  date_paid: z.date({
    required_error: "Fecha de pago es requerida",
  }),
  notes: z.string().optional(),
})

type PaymentFormValues = z.infer<typeof paymentSchema>

const editPaymentSchema = z.object({
  payer_type: z.enum(["CUSTOMER", "OPERATOR"]),
  direction: z.enum(["INCOME", "EXPENSE"]),
  method: z.string().min(1, "Método es requerido"),
  amount: z.coerce.number().min(0.01, "Monto debe ser mayor a 0"),
  currency: z.enum(["ARS", "USD"]),
  financial_account_id: z.string().optional(), // Opcional en edición (requerido solo si PAID)
  exchange_rate: z.coerce.number().optional(),
  date_paid: z.date({
    required_error: "Fecha de pago es requerida",
  }),
  notes: z.string().optional(),
})

type EditPaymentFormValues = z.infer<typeof editPaymentSchema>

const paymentMethods = [
  { value: "Transferencia", label: "Transferencia Bancaria" },
  { value: "Efectivo", label: "Efectivo" },
  { value: "Tarjeta Crédito", label: "Tarjeta de Crédito" },
  { value: "Tarjeta Débito", label: "Tarjeta de Débito" },
  { value: "MercadoPago", label: "MercadoPago" },
  { value: "PayPal", label: "PayPal" },
  { value: "Otro", label: "Otro" },
]

const NO_BASE_OPERATOR_DEBT_MESSAGE =
  "No hay deudas pendientes de la operación base. Si necesitás pagar un servicio, hacelo desde la pestaña Servicios."

interface OperationPaymentsSectionProps {
  operationId: string
  payments: any[]
  currency: string
  saleCurrency: string
  saleAmount: number
  operatorCost: number
  userRole: string
  operators: Array<{ id: string; name: string }>
  operatorPayments?: OperationOperatorPaymentLike[]
  operationServices?: OperationServicePaymentRelationLike[]
  destination?: string
}

function isInternationalDestination(destination?: string | null): boolean {
  if (!destination) return false
  const normalized = destination.trim().toLowerCase()
  const domesticKeywords = ["argentina", "nacional", "cabotaje", "domestic"]
  return !domesticKeywords.some((kw) => normalized.includes(kw))
}

export function OperationPaymentsSection({
  operationId,
  payments,
  currency,
  saleCurrency,
  saleAmount,
  operatorCost,
  userRole,
  operators,
  operatorPayments = [],
  operationServices = [],
  destination,
}: OperationPaymentsSectionProps) {
  const router = useRouter()
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false)
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null)
  const [sendingReceiptId, setSendingReceiptId] = useState<string | null>(null)
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingPayment, setEditingPayment] = useState<any>(null)
  const [markAsPaid, setMarkAsPaid] = useState(false)
  const [applyRg5617, setApplyRg5617] = useState(false)
  const [applyRg3819, setApplyRg3819] = useState(false)
  const operatorNameById = new Map(operators.map((operator) => [operator.id, operator.name]))
  const customerSaleCurrency = normalizeSupportedCurrency(saleCurrency || currency)

  // Cargar cuentas financieras cuando se abre cualquier diálogo
  useEffect(() => {
    if (incomeDialogOpen || expenseDialogOpen || editDialogOpen) {
      const fetchFinancialAccounts = async () => {
        try {
          const response = await fetch("/api/accounting/financial-accounts?excludeAccountingOnly=true")
          if (response.ok) {
            const data = await response.json()
            const accounts = (data.accounts || []).filter(
              (acc: FinancialAccount) => acc.is_active !== false
            )
            setFinancialAccounts(accounts)
          }
        } catch (error) {
          console.error("Error fetching financial accounts:", error)
          toast.error("Error al cargar cuentas financieras")
        }
      }
      fetchFinancialAccounts()
    }
  }, [incomeDialogOpen, expenseDialogOpen, editDialogOpen])

  // Pagos pendientes (los auto-generados que nunca se pagaron)
  const pendingPayments = payments.filter(p => p.status === "PENDING")
  const hasPendingToClean = pendingPayments.length > 0

  const handleDeletePendingPayments = async () => {
    if (!confirm("¿Eliminar todos los pagos pendientes auto-generados? Solo quedarán los pagos realmente registrados.")) {
      return
    }
    
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/payments/cleanup?operationId=${operationId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Error al eliminar pagos")
      }

      router.refresh()
    } catch (error) {
      console.error("Error:", error)
      toast.error("Error al eliminar pagos pendientes")
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeletePayment = async (payment: any) => {
    if (payment?.source === "OPERATOR_BULK") {
      toast.error("Los pagos generados desde Pago Masivo no se pueden eliminar desde esta pantalla")
      return
    }

    if (!confirm("¿Eliminar este pago? También se eliminarán los movimientos contables asociados (libro mayor y caja).")) {
      return
    }
    
    setDeletingPaymentId(payment.id)
    try {
      const response = await fetch(`/api/payments?paymentId=${payment.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al eliminar pago")
      }

      router.refresh()
    } catch (error) {
      console.error("Error:", error)
      toast.error(error instanceof Error ? error.message : "Error al eliminar pago")
    } finally {
      setDeletingPaymentId(null)
    }
  }

  const handleSendReceiptWhatsApp = async (paymentId: string) => {
    setSendingReceiptId(paymentId)
    try {
      const response = await fetch("/api/whatsapp/send-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al enviar recibo por WhatsApp")
      }

      const data = await response.json()
      
      // Abrir WhatsApp en nueva pestaña
      if (data.whatsappLink) {
        window.open(data.whatsappLink, "_blank")
      }
      
      alert("Mensaje WhatsApp creado exitosamente. Se abrirá WhatsApp para enviarlo.")
      router.refresh()
    } catch (error) {
      console.error("Error sending receipt via WhatsApp:", error)
      toast.error(error instanceof Error ? error.message : "Error al enviar recibo por WhatsApp")
    } finally {
      setSendingReceiptId(null)
    }
  }

  const handleDownloadReceipt = async (paymentId: string) => {
    setDownloadingReceiptId(paymentId)
    try {
      await downloadReceiptPdf(paymentId)
    } catch (error) {
      console.error("Error:", error)
      toast.error(error instanceof Error ? error.message : "Error al descargar el recibo")
    } finally {
      setDownloadingReceiptId(null)
    }
  }

  const incomeForm = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payer_type: "CUSTOMER",
      direction: "INCOME",
      method: "Transferencia",
      amount: 0,
      currency: "USD", // Default USD
      financial_account_id: "",
      exchange_rate: undefined,
      date_paid: new Date(),
      notes: "",
    },
  })

  const expenseForm = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payer_type: "OPERATOR",
      direction: "EXPENSE",
      operator_id: operators.length === 1 ? operators[0].id : "",
      method: "Transferencia",
      amount: 0,
      currency: "USD", // Default USD
      financial_account_id: "",
      exchange_rate: undefined,
      date_paid: new Date(),
      notes: "",
    },
  })

  useEffect(() => {
    const currentOperatorId = expenseForm.getValues("operator_id")

    if (operators.length === 1) {
      expenseForm.setValue("operator_id", operators[0].id, { shouldValidate: true })
      return
    }

    if (currentOperatorId && !operators.some((operator) => operator.id === currentOperatorId)) {
      expenseForm.setValue("operator_id", "", { shouldValidate: true })
    }
  }, [expenseForm, operators])

  const editForm = useForm<EditPaymentFormValues>({
    resolver: zodResolver(editPaymentSchema),
    defaultValues: {
      payer_type: "CUSTOMER",
      direction: "INCOME",
      method: "Transferencia",
      amount: 0,
      currency: "USD",
      financial_account_id: "",
      exchange_rate: undefined,
      date_paid: new Date(),
      notes: "",
    },
  })

  const canEditPayments = ["ADMIN", "SUPER_ADMIN", "CONTABLE"].includes(userRole)
  const incomePaymentCurrency = incomeForm.watch("currency")
  const incomeNeedsExchangeRate = requiresCustomerIncomeExchangeRate({
    payerType: "CUSTOMER",
    direction: "INCOME",
    paymentCurrency: incomePaymentCurrency,
    saleCurrency: customerSaleCurrency,
  })
  const editPaymentCurrency = editForm.watch("currency")
  const isEditingCustomerIncome =
    editingPayment?.payer_type === "CUSTOMER" && editingPayment?.direction === "INCOME"
  const editNeedsExchangeRate = isEditingCustomerIncome
    ? requiresCustomerIncomeExchangeRate({
        payerType: editingPayment?.payer_type,
        direction: editingPayment?.direction,
        paymentCurrency: editPaymentCurrency,
        saleCurrency: customerSaleCurrency,
      })
    : editPaymentCurrency === "ARS"

  const formatSaleCurrencyPreview = (amount: number, paymentCurrency: string, exchangeRate?: number | null) => {
    const equivalent = calculateAmountInSaleCurrency({
      amount,
      paymentCurrency,
      saleCurrency: customerSaleCurrency,
      exchangeRate: exchangeRate ?? null,
    })

    if (equivalent == null) {
      return `La operación está en ${customerSaleCurrency}, el cobro en ${paymentCurrency}. Ingrese el tipo de cambio.`
    }

    return `Equivale a ${customerSaleCurrency} ${equivalent.toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  const handleOpenEditDialog = (payment: any) => {
    if (payment?.source === "OPERATOR_BULK") {
      toast.error("Los pagos generados desde Pago Masivo no se pueden editar desde esta pantalla")
      return
    }

    setEditingPayment(payment)
    setMarkAsPaid(false)
    editForm.reset({
      payer_type: payment.payer_type,
      direction: payment.direction,
      method: payment.method || "Transferencia",
      amount: Number(payment.amount),
      currency: payment.currency || "USD",
      financial_account_id: "", // Se selecciona de nuevo
      exchange_rate: payment.exchange_rate ? Number(payment.exchange_rate) : undefined,
      date_paid: payment.date_paid ? new Date(payment.date_paid + "T12:00:00") : new Date(),
      notes: payment.reference || "",
    })
    setEditDialogOpen(true)
  }

  const onSubmitEdit = async (values: EditPaymentFormValues) => {
    if (!editingPayment) return

    // Si es PAID o se está marcando como pagado, necesita cuenta financiera
    if ((editingPayment.status === "PAID" || markAsPaid) && !values.financial_account_id) {
      alert("Debe seleccionar una cuenta financiera")
      return
    }

    if (editNeedsExchangeRate && !values.exchange_rate) {
      alert(
        isEditingCustomerIncome
          ? "Debe ingresar el tipo de cambio cuando la moneda del cobro difiere de la moneda de la operación"
          : "Debe ingresar el tipo de cambio para pagos en ARS"
      )
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: editingPayment.id,
          amount: values.amount,
          currency: values.currency,
          method: values.method,
          date_paid: values.date_paid.toISOString().split("T")[0],
          exchange_rate: editNeedsExchangeRate ? values.exchange_rate : null,
          financial_account_id: values.financial_account_id || null,
          notes: values.notes,
          markAsPaid: markAsPaid || undefined,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al editar pago")
      }

      setEditDialogOpen(false)
      setEditingPayment(null)
      setMarkAsPaid(false)
      editForm.reset()
      router.refresh()
    } catch (error) {
      console.error("Error editing payment:", error)
      toast.error(error instanceof Error ? error.message : "Error al editar pago")
    } finally {
      setIsLoading(false)
    }
  }

  // Calcular totales en la MONEDA de la operación (no siempre USD)
  const opCurrency = currency || "USD"
  const currencySymbol = opCurrency === "ARS" ? "$" : "USD"

  const customerPayments = payments.filter(p => p.payer_type === "CUSTOMER" && p.status === "PAID")
  const operatorExpensePayments = payments.filter(p => p.payer_type === "OPERATOR" && p.status === "PAID")
  const baseOperatorPayments = getOperationBaseOperatorPayments({
    operatorPayments,
    operationServices,
  })

  // Convierte un pago a la moneda de la operación
  const calculateAmountInOpCurrency = (p: any): number => {
    const paymentAmount = Number(p.amount)
    const paymentCurrency = p.currency || "USD"
    const exchangeRate = Number(p.exchange_rate) || 0

    // Si el pago ya está en la moneda de la operación, usar directo
    if (paymentCurrency === opCurrency) {
      return paymentAmount
    }

    // Conversión entre monedas usando el tipo de cambio del pago
    if (opCurrency === "USD" && paymentCurrency === "ARS") {
      // Operación en USD, pago en ARS → dividir por TC
      if (p.amount_usd != null) return Number(p.amount_usd)
      return exchangeRate > 0 ? paymentAmount / exchangeRate : 0
    }
    if (opCurrency === "ARS" && paymentCurrency === "USD") {
      // Operación en ARS, pago en USD → multiplicar por TC
      return exchangeRate > 0 ? paymentAmount * exchangeRate : paymentAmount
    }

    return paymentAmount
  }

  const totalPaidByCustomer = customerPayments.reduce((sum, p) => sum + calculateAmountInOpCurrency(p), 0)
  const totalPaidToOperatorByPayments = operatorExpensePayments.reduce((sum, p) => sum + calculateAmountInOpCurrency(p), 0)
  const totalRegisteredOperatorAmount = baseOperatorPayments.reduce((sum, payment) => {
    return sum + (Number(payment.amount) || 0)
  }, 0)
  const totalRegisteredOperatorPaid = baseOperatorPayments.reduce((sum, payment) => {
    return sum + (Number(payment.paid_amount) || 0)
  }, 0)
  const totalRegisteredOperatorPending = baseOperatorPayments.reduce((sum, payment) => {
    const amount = Number(payment.amount) || 0
    const paidAmount = Number(payment.paid_amount) || 0
    return sum + Math.max(0, amount - paidAmount)
  }, 0)
  const hasRegisteredBaseOperatorDebt = baseOperatorPayments.length > 0

  const customerDebt = saleAmount - totalPaidByCustomer
  const totalPaidToOperator = hasRegisteredBaseOperatorDebt
    ? totalRegisteredOperatorPaid
    : totalPaidToOperatorByPayments
  const displayedOperatorTotal = hasRegisteredBaseOperatorDebt
    ? totalRegisteredOperatorAmount
    : operatorCost
  const operatorDebt = hasRegisteredBaseOperatorDebt
    ? totalRegisteredOperatorPending
    : operatorCost - totalPaidToOperatorByPayments

  const onSubmitIncome = async (values: PaymentFormValues) => {
    // Validar cuenta financiera
    if (!values.financial_account_id) {
      alert("Debe seleccionar una cuenta financiera")
      return
    }

    if (incomeNeedsExchangeRate && !values.exchange_rate) {
      alert("Debe ingresar el tipo de cambio cuando la moneda del cobro difiere de la moneda de la operación")
      return
    }
    
    setIsLoading(true)
    try {
      const { payer_type, direction, ...restValues } = values
      const datePaidStr = values.date_paid.toISOString().split("T")[0]
      // Create payment as PAID directly (single atomic call)
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation_id: operationId,
          payer_type: "CUSTOMER",
          direction: "INCOME",
          ...restValues,
          financial_account_id: values.financial_account_id,
          exchange_rate: incomeNeedsExchangeRate ? values.exchange_rate : null,
          date_paid: datePaidStr,
          date_due: datePaidStr,
          status: "PAID",
          apply_rg5617: applyRg5617,
          apply_rg3819: applyRg3819,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al registrar cobro")
      }

      setIncomeDialogOpen(false)
      incomeForm.reset()
      setApplyRg5617(false)
      setApplyRg3819(false)
      router.refresh()
    } catch (error) {
      console.error("Error registering income:", error)
      toast.error(error instanceof Error ? error.message : "Error al registrar cobro")
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmitExpense = async (values: PaymentFormValues) => {
    if (operators.length === 0) {
      toast.error(NO_BASE_OPERATOR_DEBT_MESSAGE)
      return
    }

    if (!values.operator_id) {
      expenseForm.setError("operator_id", { message: "Debe seleccionar un operador" })
      return
    }

    // Validar cuenta financiera
    if (!values.financial_account_id) {
      alert("Debe seleccionar una cuenta financiera")
      return
    }

    // Validar tipo de cambio si es ARS
    if (values.currency === "ARS" && !values.exchange_rate) {
      alert("Debe ingresar el tipo de cambio para pagos en ARS")
      return
    }
    
    setIsLoading(true)
    try {
      const { payer_type, direction, operator_id, ...restValues } = values
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation_id: operationId,
          payer_type: "OPERATOR",
          direction: "EXPENSE",
          operator_id: operator_id || null,
          ...restValues,
          financial_account_id: values.financial_account_id,
          exchange_rate: values.currency === "ARS" ? values.exchange_rate : null,
          date_paid: values.date_paid.toISOString().split("T")[0],
          date_due: values.date_paid.toISOString().split("T")[0],
          status: "PAID",
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al registrar pago")
      }

      setExpenseDialogOpen(false)
      expenseForm.reset()
      router.refresh()
    } catch (error) {
      console.error("Error registering expense:", error)
      toast.error(error instanceof Error ? error.message : "Error al registrar pago")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        {/* Deuda del cliente */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Deuda del Cliente ({opCurrency})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currencySymbol} {customerDebt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Pagado: {currencySymbol} {totalPaidByCustomer.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              {" / "} Total: {currencySymbol} {saleAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </p>
            {customerDebt <= 0 && (
              <Badge className="mt-2 bg-success">Pagado completo</Badge>
            )}
          </CardContent>
        </Card>

        {/* Deuda a operador */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pendiente a Operador ({opCurrency})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currencySymbol} {operatorDebt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Pagado: {currencySymbol} {totalPaidToOperator.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              {" / "} Total: {currencySymbol} {displayedOperatorTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </p>
            {operatorDebt <= 0 && (
              <Badge className="mt-2 bg-success">Pagado completo</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Historial de Pagos</CardTitle>
          <div className="flex gap-2">
            {hasPendingToClean && (
              <Button 
                onClick={handleDeletePendingPayments} 
                size="sm" 
                variant="outline"
                className="text-destructive hover:text-destructive/80"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Limpiar auto-generados
              </Button>
            )}
            {/* Botón Registrar Cobro - visible para todos */}
            <Button onClick={() => setIncomeDialogOpen(true)} size="sm" variant="default">
              <Plus className="mr-2 h-4 w-4" />
              Registrar Cobro
            </Button>
            {/* Botón Registrar Pago - solo para ADMIN y SUPER_ADMIN */}
            {(userRole === "ADMIN" || userRole === "SUPER_ADMIN") && (
              <Button onClick={() => setExpenseDialogOpen(true)} size="sm" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Registrar Pago
            </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay pagos registrados. Usa el botón &quot;Registrar Pago&quot; cuando recibas un pago del cliente o pagues al operador.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Monto Original</TableHead>
                  <TableHead>T/C</TableHead>
                  <TableHead>Equiv. USD</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[100px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment: any) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {(() => {
                        try {
                          const d = payment.date_paid || payment.date_due
                          if (!d) return "-"
                          return format(new Date(d), "dd/MM/yyyy", { locale: es })
                        } catch { return "-" }
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={payment.direction === "INCOME" ? "default" : "destructive"}>
                          {payment.direction === "INCOME" ? "Ingreso" : "Egreso"}
                        </Badge>
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">
                            {payment.payer_type === "CUSTOMER" ? "Cliente" : "Operador"}
                          </span>
                          {payment.source === "OPERATOR_BULK" && (
                            <Badge variant="secondary" className="w-fit text-[10px]">
                              Pago Masivo
                            </Badge>
                          )}
                          {payment.payer_type === "OPERATOR" && payment.operator_id && (
                            <span className="text-xs font-medium">
                              {operatorNameById.get(payment.operator_id) || "Operador seleccionado"}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{payment.method || "-"}</TableCell>
                    <TableCell>
                      {payment.currency} {Number(payment.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center">
                      {payment.exchange_rate
                        ? Number(payment.exchange_rate).toLocaleString("es-AR", { minimumFractionDigits: 2 })
                        : "-"
                      }
                    </TableCell>
                    <TableCell>
                      {(() => {
                        // Calcular USD equivalente
                        if (payment.amount_usd != null) {
                          return `USD ${Number(payment.amount_usd).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                        }
                        if (payment.currency === "USD") {
                          return `USD ${Number(payment.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                        }
                        if (payment.currency === "ARS" && payment.exchange_rate) {
                          const usd = Number(payment.amount) / Number(payment.exchange_rate)
                          return `USD ${usd.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                        }
                        return "-"
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={payment.status === "PAID" ? "default" : "secondary"}>
                        {payment.status === "PAID" ? "Pagado" : "Pendiente"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Botón de recibo - solo para pagos pagados */}
                        {payment.status === "PAID" && payment.direction === "INCOME" && payment.payer_type === "CUSTOMER" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-info hover:text-info/80 hover:bg-info/10"
                              onClick={() => handleDownloadReceipt(payment.id)}
                              disabled={downloadingReceiptId === payment.id}
                              title="Descargar recibo PDF"
                            >
                              {downloadingReceiptId === payment.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <FileText className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-success hover:text-success/80 hover:bg-success/10"
                              onClick={() => handleSendReceiptWhatsApp(payment.id)}
                              disabled={sendingReceiptId === payment.id}
                              title="Enviar recibo por WhatsApp"
                            >
                              {sendingReceiptId === payment.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MessageSquare className="h-4 w-4" />
                              )}
                            </Button>
                          </>
                        )}
                        {/* Botón de editar - solo ADMIN/SUPER_ADMIN/CONTABLE */}
                        {canEditPayments && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-warning hover:text-warning/80 hover:bg-warning/10"
                            onClick={() => handleOpenEditDialog(payment)}
                            disabled={payment.source === "OPERATOR_BULK"}
                            title={payment.source === "OPERATOR_BULK" ? "Pago generado desde Pago Masivo" : "Editar pago"}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Botón de eliminar */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                          onClick={() => handleDeletePayment(payment)}
                          disabled={payment.source === "OPERATOR_BULK" || deletingPaymentId === payment.id}
                          title={payment.source === "OPERATOR_BULK" ? "Pago generado desde Pago Masivo" : "Eliminar pago"}
                        >
                          {deletingPaymentId === payment.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog para registrar cobro (INCOME) */}
      <Dialog open={incomeDialogOpen} onOpenChange={setIncomeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Cobro</DialogTitle>
            <DialogDescription>
              Registra un cobro recibido del cliente.
            </DialogDescription>
          </DialogHeader>

          <Form {...incomeForm}>
            <form onSubmit={incomeForm.handleSubmit(onSubmitIncome)} className="px-6 py-5 space-y-5">
              {/* Sub-card: Método y Monto */}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-foreground/70">Pago</span>
                </div>
                <FormField
                  control={incomeForm.control}
                  name="method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Método de Pago</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {paymentMethods.map((method) => (
                            <SelectItem key={method.value} value={method.value}>
                              {method.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={incomeForm.control}
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
                    control={incomeForm.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Moneda</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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
              </div>

              {incomeNeedsExchangeRate && (
                <FormField
                  control={incomeForm.control}
                  name="exchange_rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Cambio (ARS por 1 USD)</FormLabel>
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
                        {field.value && incomeForm.watch("amount")
                          ? formatSaleCurrencyPreview(
                              Number(incomeForm.watch("amount") || 0),
                              incomePaymentCurrency,
                              Number(field.value)
                            )
                          : `La operación está en ${customerSaleCurrency}, el cobro en ${incomePaymentCurrency}. Ingrese el tipo de cambio.`
                        }
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Sub-card: Fecha y Cuenta */}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-1.5">
                  <Landmark className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-xs font-medium text-foreground/70">Destino del cobro</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={incomeForm.control}
                    name="date_paid"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Fecha del Cobro</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP", { locale: es })
                                ) : (
                                  <span>Seleccionar fecha</span>
                                )}
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

                  <FormField
                    control={incomeForm.control}
                    name="financial_account_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cuenta Financiera *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar cuenta" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {financialAccounts
                              .filter((acc) => acc.currency === incomeForm.watch("currency"))
                              .map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.name} ({account.currency})
                                  {account.current_balance !== undefined && userRole !== "SELLER" && (
                                    <span className="text-xs text-muted-foreground ml-2">
                                      - Balance: {account.current_balance.toLocaleString("es-AR", {
                                        style: "currency",
                                        currency: account.currency,
                                      })}
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
                </div>
              </div>

              {/* Percepciones opcionales */}
              {isInternationalDestination(destination) && (() => {
                const watchedMethod = incomeForm.watch("method")
                const watchedAmount = Number(incomeForm.watch("amount") || 0)
                const watchedCurrency = incomeForm.watch("currency")
                const isCash = watchedMethod === "Efectivo"
                return (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Receipt className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-xs font-medium text-foreground/70">Percepciones Impositivas</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Destino: <span className="font-medium text-foreground">{destination}</span> (internacional)
                    </p>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="income-rg5617"
                        checked={applyRg5617}
                        onCheckedChange={(checked) => setApplyRg5617(checked === true)}
                      />
                      <label htmlFor="income-rg5617" className="text-sm leading-tight cursor-pointer">
                        <span className="font-medium">RG 5617 — 30%</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          Percepción Ganancias/Bienes Personales.
                          {watchedAmount > 0 && (
                            <span className="font-medium text-foreground ml-1">
                              ({watchedCurrency} {(watchedAmount * 0.3).toLocaleString("es-AR", { minimumFractionDigits: 2 })})
                            </span>
                          )}
                        </span>
                      </label>
                    </div>
                    {isCash && (
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="income-rg3819"
                          checked={applyRg3819}
                          onCheckedChange={(checked) => setApplyRg3819(checked === true)}
                        />
                        <label htmlFor="income-rg3819" className="text-sm leading-tight cursor-pointer">
                          <span className="font-medium">RG 3819 — 5%</span>
                          <span className="block text-xs text-muted-foreground mt-0.5">
                            Percepción adicional por pago en efectivo.
                            {watchedAmount > 0 && (
                              <span className="font-medium text-foreground ml-1">
                                ({watchedCurrency} {(watchedAmount * 0.05).toLocaleString("es-AR", { minimumFractionDigits: 2 })})
                              </span>
                            )}
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                )
              })()}

              <FormField
                control={incomeForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5"><StickyNote className="h-3 w-3 text-muted-foreground" /> Notas (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Referencia, comprobante, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIncomeDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Registrar Cobro"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog para registrar pago a operador (EXPENSE) - Solo ADMIN/SUPER_ADMIN */}
      {/* Dialog para editar pago - Solo ADMIN/SUPER_ADMIN/CONTABLE */}
      {canEditPayments && (
        <Dialog open={editDialogOpen} onOpenChange={(open) => {
          setEditDialogOpen(open)
          if (!open) {
            setEditingPayment(null)
            setMarkAsPaid(false)
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Pago</DialogTitle>
              <DialogDescription>
                Modifica los datos del pago. Los movimientos contables se actualizarán automáticamente.
              </DialogDescription>
            </DialogHeader>

            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="px-6 py-5 space-y-5">
                {/* Sub-card: Método y Monto */}
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-medium text-foreground/70">Pago</span>
                  </div>
                  <FormField
                    control={editForm.control}
                    name="method"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Método de Pago</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {paymentMethods.map((method) => (
                              <SelectItem key={method.value} value={method.value}>
                                {method.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
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
                      control={editForm.control}
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
                </div>

                {editNeedsExchangeRate && (
                  <FormField
                    control={editForm.control}
                    name="exchange_rate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Cambio (ARS por 1 USD)</FormLabel>
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
                          {field.value && editForm.watch("amount")
                            ? isEditingCustomerIncome
                              ? formatSaleCurrencyPreview(
                                  Number(editForm.watch("amount") || 0),
                                  editPaymentCurrency,
                                  Number(field.value)
                                )
                              : `Equivale a USD ${(Number(editForm.watch("amount") || 0) / Number(field.value)).toFixed(2)}`
                            : isEditingCustomerIncome
                              ? `La operación está en ${customerSaleCurrency}, el cobro en ${editPaymentCurrency}. Ingrese el tipo de cambio.`
                              : "Ingrese el tipo de cambio para calcular el equivalente en USD"
                          }
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Sub-card: Fecha y Estado */}
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                  <div className="flex items-center gap-1.5">
                    <Landmark className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs font-medium text-foreground/70">Fecha y Cuenta</span>
                  </div>
                  <FormField
                    control={editForm.control}
                    name="date_paid"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Fecha del Pago</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP", { locale: es })
                                ) : (
                                  <span>Seleccionar fecha</span>
                                )}
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

                  {/* Switch para marcar como pagado - para cualquier pago PENDING */}
                  {editingPayment?.status === "PENDING" && (
                    <div className="flex items-center justify-between rounded-xl border border-border/30 bg-background p-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-success" />
                          <span className="text-sm font-medium">Marcar como pagado</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Registra este pago como realizado y selecciona la cuenta de origen
                        </p>
                      </div>
                      <Switch
                        checked={markAsPaid}
                        onCheckedChange={setMarkAsPaid}
                      />
                    </div>
                  )}

                  {/* Cuenta financiera - si el pago está PAID o se está marcando como pagado */}
                  {(editingPayment?.status === "PAID" || markAsPaid) && (
                    <FormField
                      control={editForm.control}
                      name="financial_account_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cuenta Financiera *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar cuenta" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {financialAccounts
                                .filter((acc) => acc.currency === editForm.watch("currency"))
                                .map((account) => (
                                  <SelectItem key={account.id} value={account.id}>
                                    {account.name} ({account.currency})
                                    {account.current_balance !== undefined && (
                                      <span className="text-xs text-muted-foreground ml-2">
                                        - Balance: {account.current_balance.toLocaleString("es-AR", {
                                          style: "currency",
                                          currency: account.currency,
                                        })}
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
                  )}
                </div>

                <FormField
                  control={editForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5"><StickyNote className="h-3 w-3 text-muted-foreground" /> Notas (opcional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Referencia, comprobante, etc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => {
                    setEditDialogOpen(false)
                    setEditingPayment(null)
                  }}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      "Guardar Cambios"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      {(userRole === "ADMIN" || userRole === "SUPER_ADMIN") && (
        <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Registrar Pago a Operador</DialogTitle>
              <DialogDescription>
                Registra un pago realizado al operador.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...expenseForm}>
              <form onSubmit={expenseForm.handleSubmit(onSubmitExpense)} className="px-6 py-5 space-y-5">
                {/* Operador */}
                <FormField
                  control={expenseForm.control}
                  name="operator_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Operador</FormLabel>
                      {operators.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{NO_BASE_OPERATOR_DEBT_MESSAGE}</p>
                      ) : operators.length === 1 ? (
                        <Select value={operators[0].id} disabled>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={operators[0].id}>{operators[0].name}</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar operador" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {operators.map((op) => (
                              <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Sub-card: Método y Monto */}
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                  <div className="flex items-center gap-1.5">
                    <Banknote className="h-3.5 w-3.5 text-warning" />
                    <span className="text-xs font-medium text-foreground/70">Pago al Operador</span>
                  </div>
                  <FormField
                    control={expenseForm.control}
                    name="method"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Método de Pago</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {paymentMethods.map((method) => (
                              <SelectItem key={method.value} value={method.value}>
                                {method.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={expenseForm.control}
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
                      control={expenseForm.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Moneda</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                </div>

                {/* Tipo de cambio - solo visible cuando moneda es ARS */}
                {expenseForm.watch("currency") === "ARS" && (
                  <FormField
                    control={expenseForm.control}
                    name="exchange_rate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Cambio (ARS por 1 USD)</FormLabel>
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
                          {field.value && expenseForm.watch("amount")
                            ? `Equivale a USD ${(expenseForm.watch("amount") / field.value).toFixed(2)}`
                            : "Ingrese el tipo de cambio para calcular el equivalente en USD"
                          }
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Sub-card: Fecha y Cuenta */}
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                  <div className="flex items-center gap-1.5">
                    <Landmark className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs font-medium text-foreground/70">Destino del pago</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={expenseForm.control}
                      name="date_paid"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Fecha del Pago</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "PPP", { locale: es })
                                  ) : (
                                    <span>Seleccionar fecha</span>
                                  )}
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

                    <FormField
                      control={expenseForm.control}
                      name="financial_account_id"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Cuenta Financiera *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar cuenta" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {financialAccounts
                                .filter((acc) => acc.currency === expenseForm.watch("currency"))
                                .map((account) => (
                                  <SelectItem key={account.id} value={account.id}>
                                    {account.name} ({account.currency})
                                    {account.current_balance !== undefined && (
                                      <span className="text-xs text-muted-foreground ml-2">
                                        - Balance: {account.current_balance.toLocaleString("es-AR", {
                                          style: "currency",
                                          currency: account.currency,
                                        })}
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
                  </div>
                </div>

                <FormField
                  control={expenseForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5"><StickyNote className="h-3 w-3 text-muted-foreground" /> Notas (opcional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Referencia, comprobante, etc." {...field} />
                      </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setExpenseDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isLoading || operators.length === 0}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Registrar Pago"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      )}
    </>
  )
}

