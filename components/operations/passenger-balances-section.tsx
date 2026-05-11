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
  expected_amount?: number | null
  customers: Customer
}

interface Payment {
  id: string
  amount: number
  currency: string
  amount_usd?: number | null      // USD equivalent computed al crear el pago (fuente de verdad para FX)
  exchange_rate?: number | null   // T/C usado para convertir ARS↔USD (fallback si amount_usd null)
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

  // Bug fix Santi 2026-05-11: expected_amount editable per pasajero. Si NULL,
  // fallback al even-split del restante (saleAmount - sum(explicits)) / count(null).
  // Estado local para edición optimista; al guardar se sincroniza con DB.
  const [editingPassengerId, setEditingPassengerId] = useState<string | null>(null)
  const [editingExpected, setEditingExpected] = useState<string>("")
  const [localExpected, setLocalExpected] = useState<Record<string, number | null>>(() => {
    const init: Record<string, number | null> = {}
    customers.forEach((c) => {
      init[c.id] = c.expected_amount != null ? Number(c.expected_amount) : null
    })
    return init
  })
  const [savingExpectedId, setSavingExpectedId] = useState<string | null>(null)

  const getExpectedAmount = (opCustomerId: string): number => {
    const explicit = localExpected[opCustomerId]
    if (explicit != null) return Number(explicit)
    // Even-split del restante
    const explicitSum = Object.values(localExpected).reduce<number>(
      (sum, v) => sum + (v != null ? Number(v) : 0),
      0
    )
    const remaining = saleAmount - explicitSum
    const noExplicitCount = customers.filter((c) => localExpected[c.id] == null).length
    return noExplicitCount > 0 ? Math.max(0, remaining / noExplicitCount) : 0
  }

  const startEditingExpected = (c: OperationCustomer) => {
    setEditingPassengerId(c.id)
    setEditingExpected(
      localExpected[c.id] != null ? String(localExpected[c.id]) : ""
    )
  }

  const cancelEditingExpected = () => {
    setEditingPassengerId(null)
    setEditingExpected("")
  }

  const saveExpected = async (opCustomerId: string) => {
    const raw = editingExpected.trim()
    const valueToSave: number | null = raw === "" ? null : Number(raw)
    if (valueToSave !== null && (!Number.isFinite(valueToSave) || valueToSave < 0)) {
      toast.error("El monto debe ser un número >= 0")
      return
    }

    setSavingExpectedId(opCustomerId)
    // Optimistic update
    const prev = localExpected[opCustomerId]
    setLocalExpected((cur) => ({ ...cur, [opCustomerId]: valueToSave }))

    try {
      const res = await fetch(
        `/api/operations/${operationId}/customers/${opCustomerId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expected_amount: valueToSave }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || "Error al guardar")
      }
      toast.success("Monto actualizado")
      setEditingPassengerId(null)
      setEditingExpected("")
    } catch (err: any) {
      // Revertir
      setLocalExpected((cur) => ({ ...cur, [opCustomerId]: prev ?? null }))
      toast.error(err.message || "Error al guardar")
    } finally {
      setSavingExpectedId(null)
    }
  }

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

  // Map de paymentId → payment para lookup rápido al convertir allocations.
  const paymentsById = customerPayments.reduce<Record<string, Payment>>((acc, p) => {
    acc[p.id] = p
    return acc
  }, {})

  /**
   * Convierte el monto de una allocation a la moneda de la operación.
   *
   * - Si ya está en op currency → as-is
   * - Si está en otra moneda → busca el pago padre y usa:
   *   1. amount_usd (proporcional al ratio allocation/payment) — preferido
   *   2. exchange_rate del pago — fallback
   *   3. null si nada matchea (no se cuenta)
   *
   * Bug fix 2026-05-11 (Santi): antes las allocations en ARS para op USD se
   * descartaban. Ahora se convierten para reflejar correctamente el "Pagado"
   * de cada pasajero en la moneda de la operación.
   */
  const convertAllocationToOpCurrency = (a: Allocation): number | null => {
    const allocCcy = a.currency || currency
    const allocAmount = Number(a.amount)
    if (allocCcy === currency) return allocAmount

    const parentPayment = paymentsById[a.payment_id]
    if (!parentPayment) return null

    const paymentAmount = Number(parentPayment.amount)
    if (!paymentAmount || paymentAmount <= 0) return null

    // Caso 1: op USD, alloc ARS → necesitamos USD value
    if (currency === "USD" && allocCcy === "ARS") {
      if (parentPayment.amount_usd != null) {
        // Proporcional: si payment es ARS 200k = USD 139.86, y la allocation es
        // ARS 100k (mitad), entonces aporta USD 69.93
        return (allocAmount / paymentAmount) * Number(parentPayment.amount_usd)
      }
      if (parentPayment.exchange_rate && Number(parentPayment.exchange_rate) > 0) {
        return allocAmount / Number(parentPayment.exchange_rate)
      }
      return null
    }

    // Caso 2: op ARS, alloc USD → necesitamos ARS value
    if (currency === "ARS" && allocCcy === "USD") {
      if (parentPayment.amount_usd != null && Number(parentPayment.amount_usd) > 0) {
        // Proporcional: si payment es USD 100 = ARS 143000, alloc USD 50 → ARS 71500
        return (allocAmount / Number(parentPayment.amount_usd)) * paymentAmount
      }
      if (parentPayment.exchange_rate && Number(parentPayment.exchange_rate) > 0) {
        return allocAmount * Number(parentPayment.exchange_rate)
      }
      return null
    }

    return null
  }

  // Pagado per passenger en op currency. Suma allocations directas + convertidas.
  const getPassengerPaid = (opCustomerId: string) => {
    return allocations
      .filter((a) => a.operation_customer_id === opCustomerId)
      .reduce((sum, a) => {
        const converted = convertAllocationToOpCurrency(a)
        return converted != null ? sum + converted : sum
      }, 0)
  }

  // Amount per passenger: SOLO usado en el dialog de Asignar para el placeholder.
  // El "A pagar" de la tabla usa getExpectedAmount(c.id) que respeta expected_amount custom.
  const amountPerPassenger = customers.length > 0 ? saleAmount / customers.length : saleAmount

  // Total allocated en la moneda de la operación (con conversión FX).
  // Bug fix Santi: antes filtraba `a.currency === op currency`, descartando
  // allocations en otra moneda. Ahora se convierten via amount_usd/exchange_rate.
  const totalAllocated = allocations.reduce((sum, a) => {
    const converted = convertAllocationToOpCurrency(a)
    return converted != null ? sum + converted : sum
  }, 0)

  // Total de pagos por moneda (cada pago suma a su propia moneda, NO mezcla USD+ARS)
  // Bug fix 2026-05-11 (Santi): antes se sumaba sum(amount) ignorando currency,
  // dando "USD 203.000" cuando eran USD 3.000 + ARS 200.000.
  const paidByCurrency = customerPayments.reduce<Record<string, number>>((acc, p) => {
    const c = p.currency || currency
    acc[c] = (acc[c] || 0) + Number(p.amount || 0)
    return acc
  }, {})

  // Unallocated por moneda
  const allocatedByCurrency = allocations.reduce<Record<string, number>>((acc, a) => {
    const c = a.currency || currency
    acc[c] = (acc[c] || 0) + Number(a.amount || 0)
    return acc
  }, {})
  const unallocatedByCurrency: Record<string, number> = {}
  Object.entries(paidByCurrency).forEach(([c, paid]) => {
    const allocated = allocatedByCurrency[c] || 0
    const diff = paid - allocated
    if (diff > 0.01) unallocatedByCurrency[c] = diff
  })

  const formatMoney = (amount: number, ccyOverride?: string) => {
    const ccy = ccyOverride || currency
    const symbol = ccy === "USD" ? "USD" : "$"
    return `${symbol} ${Number(amount || 0).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

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
                    const expected = getExpectedAmount(c.id)
                    const balance = expected - paid
                    const isFullyPaid = balance <= 0.01
                    const isEditing = editingPassengerId === c.id
                    const hasCustomAmount = localExpected[c.id] != null

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
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-muted-foreground">{currency === "USD" ? "USD" : "$"}</span>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                autoFocus
                                value={editingExpected}
                                onChange={(e) => setEditingExpected(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveExpected(c.id)
                                  if (e.key === "Escape") cancelEditingExpected()
                                }}
                                onBlur={() => saveExpected(c.id)}
                                disabled={savingExpectedId === c.id}
                                placeholder="Vacío = even-split"
                                className="h-7 w-[140px] text-xs text-right font-mono"
                              />
                              {savingExpectedId === c.id && <Loader2 className="h-3 w-3 animate-spin" />}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditingExpected(c)}
                              className="inline-flex items-center gap-1.5 hover:underline cursor-pointer w-full justify-end"
                              title={hasCustomAmount ? "Click para editar el monto" : "Click para definir un monto custom (vacío = even-split)"}
                            >
                              {formatMoney(expected)}
                              {!hasCustomAmount && (
                                <span className="text-[9px] text-muted-foreground opacity-60">(split)</span>
                              )}
                            </button>
                          )}
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

              {/* Unallocated notice — desglosado por moneda para no mezclar USD con ARS */}
              {Object.keys(unallocatedByCurrency).length > 0 && (
                <div className="mt-3 rounded-lg border border-accent-coral/15 bg-accent-coral/5 dark:bg-accent-coral/20 dark:border-accent-coral/30 p-3 flex items-start gap-2">
                  <DollarSign className="h-4 w-4 text-accent-coral mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-accent-coral dark:text-accent-coral space-y-0.5">
                    <p>Sin asignar a pasajeros:</p>
                    {Object.entries(unallocatedByCurrency).map(([ccy, amount]) => (
                      <p key={ccy} className="font-mono">
                        · {formatMoney(amount, ccy)}
                      </p>
                    ))}
                    <p className="opacity-80">Asigná los pagos para llevar control individual.</p>
                  </div>
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
                        {formatMoney(Number(p.amount), p.currency)}
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
                                  ({formatMoney(Number(a.amount), a.currency)})
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
              Distribuí {allocatingPayment ? formatMoney(Number(allocatingPayment.amount), allocatingPayment.currency) : ""}{" "}
              entre los pasajeros de la operación.
              {allocatingPayment && allocatingPayment.currency !== currency && (
                <span className="block mt-1 text-accent-coral">
                  ⚠ Este pago está en {allocatingPayment.currency} y la operación en {currency}. Los montos se contabilizan por separado.
                </span>
              )}
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
                    <span className="text-xs text-muted-foreground">{(allocatingPayment?.currency || currency) === "USD" ? "USD" : "$"}</span>
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
                  {allocatingPayment ? formatMoney(Number(allocatingPayment.amount), allocatingPayment.currency) : "—"}
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
                  {formatMoney(dialogTotal, allocatingPayment?.currency)}
                </span>
              </div>
              {allocatingPayment && dialogTotal < Number(allocatingPayment.amount) - 0.01 && (
                <div className="flex justify-between text-xs">
                  <span className="text-accent-coral">Sin asignar:</span>
                  <span className="font-mono text-accent-coral">
                    {formatMoney(Number(allocatingPayment.amount) - dialogTotal, allocatingPayment.currency)}
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
