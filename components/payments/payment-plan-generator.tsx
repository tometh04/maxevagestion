"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Calendar, Calculator, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { format, addDays, addWeeks, addMonths } from "date-fns"
import { es } from "date-fns/locale"

interface PaymentPlanGeneratorProps {
  operationId: string
  totalAmount: number
  currency: string
  onGenerated?: () => void
}

interface PlannedPayment {
  amount: number
  dueDate: Date
  description: string
}

type FrequencyType = "weekly" | "biweekly" | "monthly" | "custom"

export function PaymentPlanGenerator({
  operationId,
  totalAmount,
  currency,
  onGenerated,
}: PaymentPlanGeneratorProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [numberOfPayments, setNumberOfPayments] = useState(3)
  const [frequency, setFrequency] = useState<FrequencyType>("monthly")
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [downPayment, setDownPayment] = useState(0)
  const [payments, setPayments] = useState<PlannedPayment[]>([])

  function generatePlan() {
    const down = downPayment || 0
    const remainingAmount = totalAmount - down
    
    if (remainingAmount <= 0) {
      toast.error("El anticipo no puede ser mayor o igual al total")
      return
    }

    const basePaymentAmount = Math.floor(remainingAmount / numberOfPayments)
    const lastPaymentAdjustment = remainingAmount - (basePaymentAmount * numberOfPayments)

    const newPayments: PlannedPayment[] = []
    let currentDate = new Date(startDate)

    // Agregar anticipo si existe
    if (down > 0) {
      newPayments.push({
        amount: down,
        dueDate: new Date(),
        description: "Anticipo / Seña",
      })
    }

    // Generar cuotas
    for (let i = 0; i < numberOfPayments; i++) {
      const isLast = i === numberOfPayments - 1
      const amount = isLast ? basePaymentAmount + lastPaymentAdjustment : basePaymentAmount

      newPayments.push({
        amount,
        dueDate: currentDate,
        description: `Cuota ${i + 1} de ${numberOfPayments}`,
      })

      // Avanzar fecha según frecuencia
      switch (frequency) {
        case "weekly":
          currentDate = addWeeks(currentDate, 1)
          break
        case "biweekly":
          currentDate = addWeeks(currentDate, 2)
          break
        case "monthly":
          currentDate = addMonths(currentDate, 1)
          break
        default:
          currentDate = addMonths(currentDate, 1)
      }
    }

    setPayments(newPayments)
  }

  function removePayment(index: number) {
    setPayments(payments.filter((_, i) => i !== index))
  }

  function updatePaymentAmount(index: number, amount: number) {
    const newPayments = [...payments]
    newPayments[index].amount = amount
    setPayments(newPayments)
  }

  function updatePaymentDate(index: number, date: string) {
    const newPayments = [...payments]
    newPayments[index].dueDate = new Date(date)
    setPayments(newPayments)
  }

  async function handleSave() {
    if (payments.length === 0) {
      toast.error("Genera un plan de pagos primero")
      return
    }

    const total = payments.reduce((sum, p) => sum + p.amount, 0)
    if (Math.abs(total - totalAmount) > 1) {
      toast.error(`El total del plan (${total}) no coincide con el monto total (${totalAmount})`)
      return
    }

    setLoading(true)
    try {
      // Crear cada pago en la base de datos
      for (const payment of payments) {
        const response = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation_id: operationId,
            amount: payment.amount,
            currency,
            date_due: payment.dueDate.toISOString(),
            description: payment.description,
            status: "PENDING",
            direction: "CUSTOMER_TO_AGENCY",
          }),
        })

        if (!response.ok) {
          throw new Error("Error al crear pago")
        }
      }

      toast.success(`Se crearon ${payments.length} pagos exitosamente`)
      setOpen(false)
      setPayments([])
      onGenerated?.()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const totalPlanned = payments.reduce((sum, p) => sum + p.amount, 0)
  const difference = totalAmount - totalPlanned

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Calculator className="h-4 w-4 mr-2" />
          Generar Plan de Pagos
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Generar Plan de Pagos
          </DialogTitle>
          <DialogDescription>
            Configura las opciones para generar automáticamente las cuotas de pago.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Información del total */}
          <div className="rounded-lg bg-muted/50 p-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Monto total a financiar:</span>
              <span className="text-xl font-bold">{currency} {totalAmount.toLocaleString("es-AR")}</span>
            </div>
          </div>

          {/* Configuración */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="downPayment">Anticipo / Seña</Label>
              <Input
                id="downPayment"
                type="number"
                min="0"
                max={totalAmount}
                value={downPayment}
                onChange={(e) => setDownPayment(Number(e.target.value))}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="numberOfPayments">Número de cuotas</Label>
              <Input
                id="numberOfPayments"
                type="number"
                min="1"
                max="24"
                value={numberOfPayments}
                onChange={(e) => setNumberOfPayments(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="frequency">Frecuencia</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as FrequencyType)}>
                <SelectTrigger id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="biweekly">Quincenal</SelectItem>
                  <SelectItem value="monthly">Mensual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Fecha primera cuota</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <Button onClick={generatePlan} variant="secondary" className="w-full">
            <Calculator className="h-4 w-4 mr-2" />
            Calcular Plan
          </Button>

          {/* Tabla de pagos */}
          {payments.length > 0 && (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment, index) => (
                    <TableRow key={index}>
                      <TableCell>{payment.description}</TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={format(payment.dueDate, "yyyy-MM-dd")}
                          onChange={(e) => updatePaymentDate(index, e.target.value)}
                          className="w-36"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={payment.amount}
                          onChange={(e) => updatePaymentAmount(index, Number(e.target.value))}
                          className="w-28 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removePayment(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Resumen */}
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total planificado:</span>
                  <span className="font-semibold">{currency} {totalPlanned.toLocaleString("es-AR")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Diferencia:</span>
                  <span className={`font-semibold ${Math.abs(difference) > 1 ? "text-destructive" : "text-green-600"}`}>
                    {currency} {difference.toLocaleString("es-AR")}
                  </span>
                </div>
              </div>

              {Math.abs(difference) > 1 && (
                <p className="text-sm text-destructive">
                  ⚠️ El total planificado no coincide con el monto total. Ajusta los montos antes de guardar.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || payments.length === 0 || Math.abs(difference) > 1}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Crear {payments.length} Pagos
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

