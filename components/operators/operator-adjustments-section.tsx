"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plus, Gift } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { useRouter } from "next/navigation"

interface Adjustment {
  id: string
  amount: number
  currency: string
  reason: string
  created_at: string
  created_by: string
  users?: { name: string } | null
}

interface Props {
  operatorId: string
  operatorName: string
  /** Solo SUPER_ADMIN / ORG_OWNER pueden crear ajustes */
  canCreate: boolean
  /** Ajustes pre-cargados desde el server (SSR) */
  initialAdjustments: Adjustment[]
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
}

export function OperatorAdjustmentsSection({
  operatorId,
  operatorName,
  canCreate,
  initialAdjustments,
}: Props) {
  const router = useRouter()
  const [adjustments, setAdjustments] = useState<Adjustment[]>(initialAdjustments)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("USD")
  const [reason, setReason] = useState("")

  const resetForm = () => {
    setAmount("")
    setCurrency("USD")
    setReason("")
    setError(null)
  }

  const handleSubmit = async () => {
    setError(null)
    const parsedAmount = parseFloat(amount.replace(",", "."))

    if (!parsedAmount || parsedAmount <= 0) {
      setError("Ingresá un monto válido mayor a 0")
      return
    }
    if (!reason.trim() || reason.trim().length < 3) {
      setError("El motivo es obligatorio (mínimo 3 caracteres)")
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/operators/${operatorId}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parsedAmount,
          currency,
          reason: reason.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Error al registrar ajuste")
        return
      }

      // Agregar al inicio de la lista
      setAdjustments((prev) => [
        { ...data.adjustment, users: { name: "Vos" } },
        ...prev,
      ])
      setDialogOpen(false)
      resetForm()
      // Refresh server data para que el balance se actualice
      router.refresh()
    } catch {
      setError("Error de conexión")
    } finally {
      setLoading(false)
    }
  }

  // Totales por moneda
  const totalsByCurrency: Record<string, number> = {}
  for (const adj of adjustments) {
    const cur = adj.currency || "USD"
    totalsByCurrency[cur] = (totalsByCurrency[cur] || 0) + (Number(adj.amount) || 0)
  }

  if (adjustments.length === 0 && !canCreate) {
    return null
  }

  return (
    <>
      <Card className="rounded-xl border-border/40">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Ajustes / Créditos a Favor</CardTitle>
            {Object.entries(totalsByCurrency).map(([cur, total]) => (
              <Badge key={cur} variant="secondary" className="ml-2">
                -{formatMoney(total, cur)}
              </Badge>
            ))}
          </div>
          {canCreate && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                resetForm()
                setDialogOpen(true)
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Nuevo Ajuste
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay ajustes registrados para este operador.
            </p>
          ) : (
            <div className="rounded-xl border border-border/40 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Registrado por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.map((adj) => (
                    <TableRow key={adj.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(adj.created_at), "dd/MM/yyyy HH:mm", {
                          locale: es,
                        })}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        -{formatMoney(adj.amount, adj.currency)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate" title={adj.reason}>
                        {adj.reason}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {adj.users?.name || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog para crear ajuste */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Ajuste — {operatorName}</DialogTitle>
            <DialogDescription>
              Registrá un crédito a favor del operador. Esto reduce el saldo
              pendiente sin afectar los costos de las operaciones ni las
              comisiones de las vendedoras.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label htmlFor="adj-amount">Monto</Label>
                <Input
                  id="adj-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="1000.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="adj-currency">Moneda</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="adj-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="ARS">ARS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="adj-reason">Motivo (obligatorio)</Label>
              <Textarea
                id="adj-reason"
                placeholder="Ej: Crédito por volumen de ventas, gift card, bonificación..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Guardando..." : "Registrar Ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
