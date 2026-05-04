"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Users,
  User,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Loader2,
  SplitSquareHorizontal,
} from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface Customer {
  id: string
  first_name: string
  last_name: string
  email?: string
}

interface OperationCustomer {
  id: string
  operation_id: string
  customer_id: string
  role: "MAIN" | "COMPANION"
  customers: Customer
}

interface Payment {
  id: string
  amount: number
  currency: string
  status: string
  direction: string
  payer_type: string
  method: string
  date_paid?: string
  notes?: string
}

interface Allocation {
  id: string
  payment_id: string
  operation_customer_id: string
  amount: number
  currency: string
  operation_customers?: {
    id: string
    customer_id: string
    role: string
    customers: Customer
  }
}

interface PassengerBalancesSectionProps {
  operationId: string
  customers: OperationCustomer[]
  payments: Payment[]
  currency: string
  saleAmount: number
}

export function PassengerBalancesSection({
  operationId,
  customers,
  payments,
  currency,
  saleAmount,
}: PassengerBalancesSectionProps) {
  const router = useRouter()
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [loading, setLoading] = useState(true)
  const [allocDialogOpen, setAllocDialogOpen] = useState(false)
  const [allocatingPayment, setAllocatingPayment] = useState<Payment | null>(null)
  const [allocAmounts, setAllocAmounts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Fetch existing allocations
  const fetchAllocations = useCallback(async () => {
    try {
      const res = await fetch(`/api/payments/allocations?operationId=${operationId}`)
      const data = await res.json()
      setAllocations(data.allocations || [])
    } catch (err) {
      console.error("Error fetching allocations:", err)
    } finally {
      setLoading(false)
    }
  }, [operationId])

  useEffect(() => {
    fetchAllocations()
  }, [fetchAllocations])

  // Only INCOME + PAID customer payments can be allocated
  const customerPayments = payments.filter(
    (p) => p.payer_type === "CUSTOMER" && p.direction === "INCOME" && p.status === "PAID"
  )

  // Calculate per-passenger totals from allocations
  const getPassengerPaid = (opCustomerId: string) => {
    return allocations
      .filter((a) => a.operation_customer_id === opCustomerId)
      .reduce((sum, a) => sum + Number(a.amount), 0)
  }

  // Amount per passenger (split evenly by default)
  const amountPerPassenger = customers.length > 0 ? saleAmount / customers.length : saleAmount

  // Total allocated across all passengers
  const totalAllocated = allocations.reduce((sum, a) => sum + Number(a.amount), 0)

  // Total of all customer payments
  const totalCustomerPaid = customerPayments.reduce((sum, p) => sum + Number(p.amount), 0)

  // Unallocated amount
  const unallocated = totalCustomerPaid - totalAllocated

  const formatMoney = (amount: number) =>
    `${currency === "USD" ? "USD" : "$"} ${Number(amount || 0).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

  // Open allocation dialog for a specific payment
  const openAllocDialog = (payment: Payment) => {
    setAllocatingPayment(payment)
    // Pre-fill with existing allocations for this payment
    const existing = allocations.filter((a) => a.payment_id === payment.id)
    const amounts: Record<string, string> = {}
    customers.forEach((c) => {
      const alloc = existing.find((a) => a.operation_customer_id === c.id)
      amounts[c.id] = alloc ? String(alloc.amount) : ""
    })
    setAllocAmounts(amounts)
    setAllocDialogOpen(true)
  }

  // Split payment evenly among all passengers
  const splitEvenly = () => {
    if (!allocatingPayment || customers.length === 0) return
    const perPerson = Number(allocatingPayment.amount) / customers.length
    const amounts: Record<string, string> = {}
    customers.forEach((c) => {
      amounts[c.id] = perPerson.toFixed(2)
    })
    setAllocAmounts(amounts)
  }

  // Assign entire payment to one passenger
  const assignToOne = (opCustomerId: string) => {
    if (!allocatingPayment) return
    const amounts: Record<string, string> = {}
    customers.forEach((c) => {
      amounts[c.id] = c.id === opCustomerId ? String(allocatingPayment.amount) : ""
    })
    setAllocAmounts(amounts)
  }

  // Save allocations
  const saveAllocations = async () => {
    if (!allocatingPayment) return
    setSaving(true)

    try {
      const allocs = Object.entries(allocAmounts)
        .filter(([, amount]) => Number(amount) > 0)
        .map(([opCustomerId, amount]) => ({
          operationCustomerId: opCustomerId,
          amount: Number(amount),
        }))

      const res = await fetch("/api/payments/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: allocatingPayment.id,
          allocations: allocs,
        }),
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || "Error al guardar")
      }

      toast.success("Asignación guardada")
      setAllocDialogOpen(false)
      fetchAllocations()
    } catch (err: any) {
      toast.error(err.message || "Error al guardar asignación")
    } finally {
      setSaving(false)
    }
  }

  // Calculate total being allocated in dialog
  const dialogTotal = Object.values(allocAmounts).reduce(
    (sum, v) => sum + (Number(v) || 0),
    0
  )

  if (customers.length < 2) {
    return null // No need for this section if there's only 1 passenger
  }

  return (
    <div className="space-y-4">
      {/* Balance per passenger */}
      <Card className="rounded-xl border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-accent-coral" />
            Saldos por Pasajero
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Pasajero</TableHead>
                    <TableHead className="text-xs text-right">A pagar</TableHead>
                    <TableHead className="text-xs text-right">Pagado</TableHead>
                    <TableHead className="text-xs text-right">Saldo</TableHead>
                    <TableHead className="text-xs text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => {
                    const paid = getPassengerPaid(c.id)
                    const balance = amountPerPassenger - paid
                    const isFullyPaid = balance <= 0.01

                    return (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium">
                              {c.customers.first_name} {c.customers.last_name}
                            </span>
                            {c.role === "MAIN" && (
                              <Badge variant="outline" className="text-[10px]">
                                Titular
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {formatMoney(amountPerPassenger)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono font-medium text-success">
                          {formatMoney(paid)}
                        </TableCell>
                        <TableCell
                          className={`text-xs text-right font-mono font-medium ${
                            isFullyPaid ? "text-success" : "text-destructive"
                          }`}
                        >
                          {isFullyPaid ? formatMoney(0) : `-${formatMoney(balance)}`}
                        </TableCell>
                        <TableCell className="text-center">
                          {isFullyPaid ? (
                            <Badge className="bg-success/10 text-success dark:bg-success/30 dark:text-success text-[10px]">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Pagado
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Debe
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {/* Unallocated notice */}
              {unallocated > 0.01 && (
                <div className="mt-3 rounded-lg border border-accent-coral/15 bg-accent-coral/5 dark:bg-accent-coral/20 dark:border-accent-coral/30 p-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-accent-coral" />
                  <span className="text-xs text-accent-coral dark:text-accent-coral">
                    {formatMoney(unallocated)} sin asignar a pasajeros — asigná los pagos para llevar control individual.
                  </span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Payments to allocate */}
      {customerPayments.length > 0 && (
        <Card className="rounded-xl border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <SplitSquareHorizontal className="h-4 w-4 text-accent-coral" />
              Asignar Pagos a Pasajeros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Método</TableHead>
                  <TableHead className="text-xs text-right">Monto</TableHead>
                  <TableHead className="text-xs">Asignado a</TableHead>
                  <TableHead className="text-xs w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerPayments.map((p) => {
                  const paymentAllocs = allocations.filter((a) => a.payment_id === p.id)
                  const allocatedAmount = paymentAllocs.reduce(
                    (sum, a) => sum + Number(a.amount),
                    0
                  )
                  const isFullyAllocated =
                    Math.abs(allocatedAmount - Number(p.amount)) < 0.01

                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {p.date_paid
                          ? new Date(p.date_paid).toLocaleDateString("es-AR")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{p.method}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-medium">
                        {formatMoney(Number(p.amount))}
                      </TableCell>
                      <TableCell className="text-xs">
                        {paymentAllocs.length === 0 ? (
                          <span className="text-muted-foreground italic">Sin asignar</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {paymentAllocs.map((a) => {
                              const cust = customers.find(
                                (c) => c.id === a.operation_customer_id
                              )
                              return (
                                <Badge
                                  key={a.id}
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {cust
                                    ? `${cust.customers.first_name} ${cust.customers.last_name}`
                                    : "?"}{" "}
                                  ({formatMoney(Number(a.amount))})
                                </Badge>
                              )
                            })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant={isFullyAllocated ? "ghost" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => openAllocDialog(p)}
                        >
                          {isFullyAllocated ? "Editar" : "Asignar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Allocation Dialog */}
      <Dialog open={allocDialogOpen} onOpenChange={setAllocDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Asignar Pago a Pasajeros</DialogTitle>
            <DialogDescription>
              Distribuí {allocatingPayment ? formatMoney(Number(allocatingPayment.amount)) : ""}{" "}
              entre los pasajeros de la operación.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Quick actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={splitEvenly}
              >
                <SplitSquareHorizontal className="mr-1.5 h-3.5 w-3.5" />
                Dividir partes iguales
              </Button>
            </div>

            <Separator />

            {/* Per-passenger inputs */}
            <div className="space-y-3">
              {customers.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg border border-border/40 p-3"
                >
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {c.customers.first_name} {c.customers.last_name}
                    </p>
                    {c.role === "MAIN" && (
                      <span className="text-[10px] text-muted-foreground">Titular</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{currency === "USD" ? "USD" : "$"}</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="h-8 w-[120px] text-xs text-right font-mono"
                      value={allocAmounts[c.id] || ""}
                      onChange={(e) =>
                        setAllocAmounts((prev) => ({
                          ...prev,
                          [c.id]: e.target.value,
                        }))
                      }
                      placeholder="0.00"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Asignar todo a este pasajero"
                      onClick={() => assignToOne(c.id)}
                    >
                      <User className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Monto del pago:</span>
                <span className="font-mono font-medium">
                  {allocatingPayment ? formatMoney(Number(allocatingPayment.amount)) : "—"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total asignado:</span>
                <span
                  className={`font-mono font-medium ${
                    allocatingPayment && Math.abs(dialogTotal - Number(allocatingPayment.amount)) < 0.01
                      ? "text-success"
                      : dialogTotal > Number(allocatingPayment?.amount || 0)
                      ? "text-destructive"
                      : ""
                  }`}
                >
                  {formatMoney(dialogTotal)}
                </span>
              </div>
              {allocatingPayment && dialogTotal < Number(allocatingPayment.amount) - 0.01 && (
                <div className="flex justify-between text-xs">
                  <span className="text-accent-coral">Sin asignar:</span>
                  <span className="font-mono text-accent-coral">
                    {formatMoney(Number(allocatingPayment.amount) - dialogTotal)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveAllocations}
              disabled={saving || dialogTotal <= 0}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Asignación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
