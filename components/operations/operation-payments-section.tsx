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
import { CalendarIcon, Plus, Loader2, Trash2, FileText, Download, MessageSquare } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { cn } from "@/lib/utils"

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
  method: z.string().min(1, "Método es requerido"),
  amount: z.coerce.number().min(0.01, "Monto debe ser mayor a 0"),
  currency: z.enum(["ARS", "USD"]),
  financial_account_id: z.string().min(1, "Debe seleccionar una cuenta financiera"),
  exchange_rate: z.coerce.number().optional(), // Tipo de cambio para ARS
  date_paid: z.date({
    required_error: "Fecha de pago es requerida",
  }),
  notes: z.string().optional(),
})

type PaymentFormValues = z.infer<typeof paymentSchema>

const paymentMethods = [
  { value: "Transferencia", label: "Transferencia Bancaria" },
  { value: "Efectivo", label: "Efectivo" },
  { value: "Tarjeta Crédito", label: "Tarjeta de Crédito" },
  { value: "Tarjeta Débito", label: "Tarjeta de Débito" },
  { value: "MercadoPago", label: "MercadoPago" },
  { value: "PayPal", label: "PayPal" },
  { value: "Otro", label: "Otro" },
]

interface OperationPaymentsSectionProps {
  operationId: string
  payments: any[]
  currency: string
  saleAmount: number
  operatorCost: number
  userRole: string
}

export function OperationPaymentsSection({
  operationId,
  payments,
  currency,
  saleAmount,
  operatorCost,
  userRole,
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

  // Cargar cuentas financieras cuando se abre cualquier diálogo
  useEffect(() => {
    if (incomeDialogOpen || expenseDialogOpen) {
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
        }
      }
      fetchFinancialAccounts()
    }
  }, [incomeDialogOpen, expenseDialogOpen])

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
      alert("Error al eliminar pagos pendientes")
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm("¿Eliminar este pago? También se eliminarán los movimientos contables asociados (libro mayor y caja).")) {
      return
    }
    
    setDeletingPaymentId(paymentId)
    try {
      const response = await fetch(`/api/payments?paymentId=${paymentId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al eliminar pago")
      }

      router.refresh()
    } catch (error) {
      console.error("Error:", error)
      alert(error instanceof Error ? error.message : "Error al eliminar pago")
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
      alert(error instanceof Error ? error.message : "Error al enviar recibo por WhatsApp")
    } finally {
      setSendingReceiptId(null)
    }
  }

  const handleDownloadReceipt = async (paymentId: string) => {
    setDownloadingReceiptId(paymentId)
    try {
      // Obtener datos del recibo desde la API
      const response = await fetch(`/api/receipt-data?paymentId=${paymentId}`)
      
      if (!response.ok) {
        throw new Error("Error al obtener datos del recibo")
      }

      const data = await response.json()

      // Importar jsPDF dinámicamente (solo en cliente)
      const { default: jsPDF } = await import("jspdf")
      const { format } = await import("date-fns")
      const { es } = await import("date-fns/locale")
      
      // Crear PDF
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 15
      let y = 0

      // ========== HEADER LOZADA ==========
      // Fondo dorado izquierdo
      doc.setFillColor(194, 156, 95) // Color dorado
      doc.rect(0, 0, pageWidth * 0.55, 35, "F")
      
      // Flecha blanca
      doc.setFillColor(255, 255, 255)
      doc.triangle(pageWidth * 0.45, 0, pageWidth * 0.55, 17.5, pageWidth * 0.45, 35, "F")
      
      // Fondo dorado derecho (más oscuro)
      doc.setFillColor(184, 142, 74)
      doc.rect(pageWidth * 0.55, 0, pageWidth * 0.45, 35, "F")
      
      // Logo LOZADA Viajes (texto)
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(22)
      doc.setFont("helvetica", "bold")
      doc.text("LOZADA", 15, 18)
      doc.setFontSize(16)
      doc.setFont("helvetica", "italic")
      doc.text("Viajes", 62, 22)
      
      // Datos derecha del header
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(7)
      doc.setFont("helvetica", "normal")
      
      // Recuadro "Documento no valido como factura X"
      doc.setDrawColor(255, 255, 255)
      doc.setLineWidth(0.3)
      doc.rect(pageWidth - 45, 3, 40, 12)
      doc.setFontSize(6)
      doc.text("Documento no", pageWidth - 43, 7)
      doc.text("valido como", pageWidth - 43, 10)
      doc.text("factura", pageWidth - 43, 13)
      doc.setFontSize(16)
      doc.setFont("helvetica", "bold")
      doc.text("X", pageWidth - 12, 12)
      
      // Info de contacto
      doc.setFontSize(7)
      doc.setFont("helvetica", "normal")
      doc.text(`N° Legajo: 18181`, pageWidth - 45, 20)
      doc.text(`+5493412753942`, pageWidth - 45, 24)
      doc.text(`rosario.ventas@lozadaviajes.com`, pageWidth - 45, 28)
      doc.text(`Corrientes 631 (Piso 1) Rosario, Santa Fe`, pageWidth - 45, 32)

      y = 45

      // ========== FECHA Y NUMERO RECIBO ==========
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(10)
      doc.setFont("helvetica", "normal")
      doc.text(`${data.agencyCity} ${data.fechaFormateada}`, margin, y)

      doc.setFontSize(11)
      doc.setFont("helvetica", "bold")
      doc.text(`RECIBO X: No ${data.receiptNumber}`, pageWidth - margin, y, { align: "right" })

      y += 15

      // Línea separadora
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.5)
      doc.line(margin, y, pageWidth - margin, y)
      
      y += 12

      // ========== DATOS DEL CLIENTE ==========
      doc.setFontSize(10)
      
      doc.setFont("helvetica", "bold")
      doc.text("Señor/a:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(data.customerName, margin + 25, y)
      
      y += 8
      
      doc.setFont("helvetica", "bold")
      doc.text("Domicilio:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(data.customerAddress || "-", margin + 28, y)
      
      y += 8
      
      doc.setFont("helvetica", "bold")
      doc.text("Localidad:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(data.customerCity || "-", margin + 28, y)

      y += 15

      // ========== INFORMACIÓN DEL VIAJE (si existe) ==========
      if (data.destination || data.fileCode) {
        doc.setFillColor(240, 240, 240)
        doc.rect(margin, y - 5, pageWidth - 2 * margin, 10, "F")
        doc.setFontSize(11)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(194, 156, 95) // Color dorado Lozada
        doc.text("INFORMACIÓN DEL VIAJE", margin + 5, y + 2)
        doc.setTextColor(0, 0, 0)
        y += 15

        doc.setFontSize(9)
        if (data.fileCode) {
          doc.setFont("helvetica", "bold")
          doc.text("Código de Operación:", margin, y)
          doc.setFont("helvetica", "normal")
          doc.text(data.fileCode, margin + 50, y)
          y += 7
        }
        if (data.destination) {
          doc.setFont("helvetica", "bold")
          doc.text("Destino:", margin, y)
          doc.setFont("helvetica", "normal")
          doc.text(data.destination, margin + 25, y)
          y += 7
        }
        if (data.origin) {
          doc.setFont("helvetica", "bold")
          doc.text("Origen:", margin, y)
          doc.setFont("helvetica", "normal")
          doc.text(data.origin, margin + 25, y)
          y += 7
        }
        if (data.departureDate) {
          doc.setFont("helvetica", "bold")
          doc.text("Fecha de Salida:", margin, y)
          doc.setFont("helvetica", "normal")
          const depDate = format(new Date(data.departureDate), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: es })
          doc.text(depDate, margin + 40, y)
          y += 7
        }
        if (data.returnDate) {
          doc.setFont("helvetica", "bold")
          doc.text("Fecha de Regreso:", margin, y)
          doc.setFont("helvetica", "normal")
          const retDate = format(new Date(data.returnDate), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: es })
          doc.text(retDate, margin + 45, y)
          y += 7
        }
        if (data.adults || data.children || data.infants) {
          doc.setFont("helvetica", "bold")
          doc.text("Pasajeros:", margin, y)
          doc.setFont("helvetica", "normal")
          const pasajeros = []
          if (data.adults > 0) pasajeros.push(`${data.adults} adulto${data.adults > 1 ? 's' : ''}`)
          if (data.children > 0) pasajeros.push(`${data.children} menor${data.children > 1 ? 'es' : ''}`)
          if (data.infants > 0) pasajeros.push(`${data.infants} bebé${data.infants > 1 ? 's' : ''}`)
          doc.text(pasajeros.join(", ") || "-", margin + 30, y)
          y += 7
        }
        if (data.operatorName) {
          doc.setFont("helvetica", "bold")
          doc.text("Operador:", margin, y)
          doc.setFont("helvetica", "normal")
          doc.text(data.operatorName, margin + 28, y)
          y += 7
        }

        y += 10
      }

      // ========== MONTO RECIBIDO ==========
      doc.setFont("helvetica", "bold")
      doc.setFontSize(11)
      doc.text(`Recibimos el equivalente a ${data.currencyName}: ${data.amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin, y)

      y += 12

      // CONCEPTO
      doc.setFont("helvetica", "normal")
      doc.setFontSize(10)
      doc.text(data.concepto, margin, y)

      y += 10

      // Moneda recibida
      doc.setFont("helvetica", "bold")
      doc.text("Moneda recibida:", margin, y)
      doc.setFont("helvetica", "normal")
      doc.text(data.currencyName, margin + 42, y)

      y += 20

      // ========== HISTORIAL DE PAGOS (si hay múltiples pagos) ==========
      if (data.paymentHistory && data.paymentHistory.length > 1) {
        doc.setFillColor(250, 250, 250)
        doc.rect(margin, y - 5, pageWidth - 2 * margin, 12, "F")
        doc.setFontSize(10)
        doc.setFont("helvetica", "bold")
        doc.text("HISTORIAL DE PAGOS", margin + 5, y + 2)
        y += 15

        doc.setFontSize(8)
        doc.setFont("helvetica", "bold")
        // Encabezados de tabla
        doc.text("Fecha", margin, y)
        doc.text("Monto", margin + 50, y)
        doc.text("Referencia", margin + 100, y)
        y += 6

        doc.setDrawColor(200, 200, 200)
        doc.setLineWidth(0.2)
        doc.line(margin, y, pageWidth - margin, y)
        y += 4

        doc.setFont("helvetica", "normal")
        for (const pago of data.paymentHistory) {
          const fechaPago = pago.datePaid ? format(new Date(pago.datePaid), "dd/MM/yyyy", { locale: es }) : "-"
          const montoPago = `${pago.currency} ${pago.amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          
          doc.text(fechaPago, margin, y)
          doc.text(montoPago, margin + 50, y)
          doc.text(pago.reference || "-", margin + 100, y)
          y += 6
        }
        y += 5
      }

      // ========== TOTAL ==========
      doc.setLineWidth(0.3)
      doc.line(pageWidth - 85, y, pageWidth - margin, y)
      
      y += 8
      
      doc.setFontSize(12)
      doc.setFont("helvetica", "bold")
      doc.text("TOTAL", pageWidth - 85, y)
      
      const totalFormatted = `${data.currency} ${data.amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      doc.text(totalFormatted, pageWidth - margin, y, { align: "right" })

      y += 4
      doc.line(pageWidth - 85, y, pageWidth - margin, y)

      // ========== SALDO RESTANTE ==========
      if (data.saldoRestante > 0) {
        y += 15
        doc.setFillColor(255, 243, 205) // Fondo amarillo claro
        doc.rect(margin, y - 5, pageWidth - margin * 2, 18, "F")
        
        doc.setFontSize(10)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(133, 100, 4) // Color dorado oscuro
        doc.text("SALDO PENDIENTE DE PAGO:", margin + 5, y + 3)
        
        doc.setFontSize(12)
        const saldoFormatted = `${data.currency} ${data.saldoRestante.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        doc.text(saldoFormatted, pageWidth - margin - 5, y + 3, { align: "right" })
        
        doc.setFontSize(8)
        doc.setFont("helvetica", "normal")
        doc.text(`(Total operación: ${data.currency} ${data.totalOperacion.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - Pagado: ${data.currency} ${data.totalPagado.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`, margin + 5, y + 10)
        
        doc.setTextColor(0, 0, 0)
        y += 20
      } else if (data.totalOperacion > 0) {
        y += 15
        doc.setFillColor(209, 250, 229) // Fondo verde claro
        doc.rect(margin, y - 5, pageWidth - margin * 2, 12, "F")
        
        doc.setFontSize(10)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(22, 101, 52) // Verde oscuro
        doc.text("PAGADO EN SU TOTALIDAD", pageWidth / 2, y + 3, { align: "center" })
        
        doc.setTextColor(0, 0, 0)
        y += 15
      }

      y += 15

      // ========== FIRMAS ==========
      doc.setFontSize(9)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(0, 0, 0)
      
      doc.line(margin, y, margin + 65, y)
      doc.text("Firma Cliente", margin + 18, y + 6)

      doc.line(pageWidth - margin - 65, y, pageWidth - margin, y)
      doc.text("Firma Agencia", pageWidth - margin - 48, y + 6)

      // ========== FOOTER ==========
      const footerY = pageHeight - 15
      doc.setFontSize(7)
      doc.setFont("helvetica", "italic")
      doc.setTextColor(128, 128, 128)
      
      doc.text("LOZADA VIAJES - Corrientes 631 (Piso 1 Oficina F) Rosario, Santa Fe", pageWidth / 2, footerY - 3, { align: "center" })
      doc.text("Este recibo es valido como comprobante de pago. No valido como factura.", pageWidth / 2, footerY + 1, { align: "center" })

      // Descargar el PDF
      doc.save(`recibo-${data.receiptNumber}.pdf`)
    } catch (error) {
      console.error("Error:", error)
      alert("Error al descargar el recibo")
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
      method: "Transferencia",
      amount: 0,
      currency: "USD", // Default USD
      financial_account_id: "",
      exchange_rate: undefined,
      date_paid: new Date(),
      notes: "",
    },
  })

  // Calcular totales EN USD
  // Si el pago tiene amount_usd, usarlo directamente
  // Si no, convertir: USD = amount, ARS = amount / exchange_rate (o 0 si no hay tasa)
  const customerPayments = payments.filter(p => p.payer_type === "CUSTOMER" && p.status === "PAID")
  const operatorPayments = payments.filter(p => p.payer_type === "OPERATOR" && p.status === "PAID")
  
  const calculateUsdAmount = (p: any): number => {
    // Si ya tiene amount_usd calculado, usarlo
    if (p.amount_usd != null) {
      return Number(p.amount_usd)
    }
    // Si es USD, usar el amount directamente
    if (p.currency === "USD") {
      return Number(p.amount)
    }
    // Si es ARS y tiene exchange_rate, convertir
    if (p.currency === "ARS" && p.exchange_rate) {
      return Number(p.amount) / Number(p.exchange_rate)
    }
    // Fallback: si es ARS sin exchange_rate, no podemos convertir correctamente
    // Mostrar 0 o el amount (esto no debería pasar con pagos nuevos)
    return 0
  }
  
  const totalPaidByCustomerUsd = customerPayments.reduce((sum, p) => sum + calculateUsdAmount(p), 0)
  const totalPaidToOperatorUsd = operatorPayments.reduce((sum, p) => sum + calculateUsdAmount(p), 0)
  
  const customerDebt = saleAmount - totalPaidByCustomerUsd
  const operatorDebt = operatorCost - totalPaidToOperatorUsd

  const onSubmitIncome = async (values: PaymentFormValues) => {
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
      const { payer_type, direction, ...restValues } = values
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation_id: operationId,
          payer_type: "CUSTOMER",
          direction: "INCOME",
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
        throw new Error(error.error || "Error al registrar cobro")
      }

      setIncomeDialogOpen(false)
      incomeForm.reset()
      router.refresh()
    } catch (error) {
      console.error("Error registering income:", error)
      alert(error instanceof Error ? error.message : "Error al registrar cobro")
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmitExpense = async (values: PaymentFormValues) => {
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
      const { payer_type, direction, ...restValues } = values
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation_id: operationId,
          payer_type: "OPERATOR",
          direction: "EXPENSE",
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
      alert(error instanceof Error ? error.message : "Error al registrar pago")
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
              Deuda del Cliente (USD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              USD {customerDebt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Pagado: USD {totalPaidByCustomerUsd.toLocaleString("es-AR", { minimumFractionDigits: 2 })} 
              {" / "} Total: USD {saleAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </p>
            {customerDebt <= 0 && (
              <Badge className="mt-2 bg-green-600">Pagado completo</Badge>
            )}
          </CardContent>
        </Card>

        {/* Deuda a operador */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pendiente a Operador (USD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              USD {operatorDebt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Pagado: USD {totalPaidToOperatorUsd.toLocaleString("es-AR", { minimumFractionDigits: 2 })} 
              {" / "} Total: USD {operatorCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </p>
            {operatorDebt <= 0 && (
              <Badge className="mt-2 bg-green-600">Pagado completo</Badge>
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
                className="text-red-600 hover:text-red-700"
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
                        <span className="text-xs text-muted-foreground">
                          {payment.payer_type === "CUSTOMER" ? "Cliente" : "Operador"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{payment.method || "-"}</TableCell>
                    <TableCell>
                      {payment.currency} {Number(payment.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center">
                      {payment.currency === "ARS" && payment.exchange_rate 
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
                              className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
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
                              className="h-8 w-8 text-green-500 hover:text-green-700 hover:bg-green-100"
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
                        {/* Botón de eliminar */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-100"
                          onClick={() => handleDeletePayment(payment.id)}
                          disabled={deletingPaymentId === payment.id}
                          title="Eliminar pago"
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
            <form onSubmit={incomeForm.handleSubmit(onSubmitIncome)} className="space-y-4">
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

              {/* Tipo de cambio - solo visible cuando moneda es ARS */}
              {incomeForm.watch("currency") === "ARS" && (
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
                          ? `Equivale a USD ${(incomeForm.watch("amount") / field.value).toFixed(2)}`
                          : "Ingrese el tipo de cambio para calcular el equivalente en USD"
                        }
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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

              <FormField
                control={incomeForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas (opcional)</FormLabel>
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
      {(userRole === "ADMIN" || userRole === "SUPER_ADMIN") && (
        <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Registrar Pago a Operador</DialogTitle>
              <DialogDescription>
                Registra un pago realizado al operador.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...expenseForm}>
              <form onSubmit={expenseForm.handleSubmit(onSubmitExpense)} className="space-y-4">
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

              <FormField
                  control={expenseForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas (opcional)</FormLabel>
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
                <Button type="submit" disabled={isLoading}>
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

