"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FileText, Loader2, Receipt } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { parseDateOnlyLocal } from "@/lib/utils/date-only"
import { paymentMethodLabel } from "@/lib/payments/payment-methods"
import { downloadReceiptPdf } from "@/lib/pdf/receipt-pdf"

/**
 * Recibos de la operación, en modo lectura (VIB-129).
 *
 * Yamil lo pidió así: "que los vendedores además de poder ver sus operaciones
 * puedan descargar sus recibos por su cuenta (además sirve para un doble
 * control, si no lo ven creado me piden a mí que registre esa venta) **pero que
 * no puedan generar pagos ni cobros** como hasta ahora".
 *
 * Por eso NO es la sección de Pagos con los botones escondidos: es una vista
 * aparte, sin una sola acción de escritura. El vendedor ve que el cobro se
 * aplicó y se baja el comprobante; nada más.
 *
 * El servidor ya garantizaba el alcance desde antes: `buildReceiptPdfData`
 * corta con 403 si un SELLER pide el recibo de una operación que no es suya. Esta
 * pantalla no amplía permisos, destapa los que ya existían.
 */

interface OperationPayment {
  id: string
  status?: string | null
  direction?: string | null
  payer_type?: string | null
  amount?: number | string | null
  currency?: string | null
  method?: string | null
  date_paid?: string | null
  notes?: string | null
}

interface OperationReceiptsSectionProps {
  payments: OperationPayment[]
}

function formatAmount(amount: unknown, currency?: string | null) {
  const n = typeof amount === "number" ? amount : Number(amount ?? 0)
  const safe = Number.isFinite(n) ? n : 0
  return `${currency || "ARS"} ${safe.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  const parsed = parseDateOnlyLocal(value)
  return parsed ? format(parsed, "dd/MM/yyyy", { locale: es }) : value
}

export function OperationReceiptsSection({ payments }: OperationReceiptsSectionProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // Misma condición que usa el botón de recibo en la sección de Pagos: solo los
  // cobros al pasajero ya cobrados tienen comprobante.
  const receipts = (payments || []).filter(
    (p) => p.status === "PAID" && p.direction === "INCOME" && p.payer_type === "CUSTOMER"
  )

  const handleDownload = async (paymentId: string) => {
    setDownloadingId(paymentId)
    try {
      await downloadReceiptPdf(paymentId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al descargar el recibo")
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <Card className="rounded-xl border border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4" />
          Recibos
        </CardTitle>
        <CardDescription>
          Cobros ya registrados en esta operación. Podés descargar el comprobante de cada uno.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {receipts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
            Todavía no hay cobros registrados en esta operación.
          </div>
        ) : (
          <div className="rounded-xl border border-border/40 overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Forma de pago</TableHead>
                  <TableHead className="text-right">Recibo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="text-sm">{formatDate(payment.date_paid)}</TableCell>
                    <TableCell className="font-medium">
                      {formatAmount(payment.amount, payment.currency)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {paymentMethodLabel(payment.method)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-accent-teal hover:text-accent-teal/80 hover:bg-accent-teal/10"
                        onClick={() => handleDownload(payment.id)}
                        disabled={downloadingId === payment.id}
                      >
                        {downloadingId === payment.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <FileText className="mr-2 h-4 w-4" />
                        )}
                        Descargar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
