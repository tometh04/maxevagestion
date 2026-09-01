"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { DecimalInput } from "@/components/ui/decimal-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Plus, Split, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  faltantePorRepartir,
  repartirEnPartesIguales,
  validarReparto,
} from "@/lib/expenses/split-expense"

/**
 * Dividir un gasto entre oficinas.
 *
 * El diálogo trabaja en importes, no en porcentajes: el reparto tiene que dar
 * exacto al centavo y "50%" de 2.336,46 obliga a decidir a quién le toca el
 * medio centavo. El botón de partes iguales completa los importes ya resueltos.
 *
 * Lo que ve el usuario mientras escribe sale de `lib/expenses/split-expense.ts`,
 * las mismas reglas que aplica la función de base de datos al guardar.
 */

interface Agency {
  id: string
  name: string
}

export interface SplittableExpense {
  id: string
  category: string
  amount: number
  currency: string
  movement_date: string
  notes: string | null
  agency_id?: string | null
}

interface Parte {
  agencyId: string
  /** Texto crudo del input: "" mientras está vacío. */
  amount: string
}

interface SplitExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense: SplittableExpense | null
  agencies: Agency[]
  onSuccess: () => void
}

function aNumero(texto: string): number {
  const n = Number(texto)
  return Number.isFinite(n) ? n : NaN
}

export function SplitExpenseDialog({
  open,
  onOpenChange,
  expense,
  agencies,
  onSuccess,
}: SplitExpenseDialogProps) {
  const [partes, setPartes] = useState<Parte[]>([])
  const [saving, setSaving] = useState(false)

  const total = expense?.amount ?? 0

  // Arranca con dos partes: la oficina que ya tiene el gasto y una a elegir.
  useEffect(() => {
    if (!open || !expense) return
    const propia = expense.agency_id && agencies.some((a) => a.id === expense.agency_id)
      ? expense.agency_id
      : agencies[0]?.id ?? ""
    const otra = agencies.find((a) => a.id !== propia)?.id ?? ""
    const mitades = repartirEnPartesIguales(expense.amount, 2)
    setPartes([
      { agencyId: propia, amount: mitades[0]?.toFixed(2) ?? "" },
      { agencyId: otra, amount: mitades[1]?.toFixed(2) ?? "" },
    ])
    // Depende del id y no del objeto: si dependiera de `expense` o de
    // `agencies`, un re-render del padre reconstruiría el reparto y le borraría
    // al usuario los importes que estaba escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id])

  const partesParaValidar = useMemo(
    () => partes.map((p) => ({ agencyId: p.agencyId, amount: aNumero(p.amount) })),
    [partes]
  )

  const validacion = useMemo(
    () => validarReparto(total, partesParaValidar),
    [total, partesParaValidar]
  )
  const falta = useMemo(
    () => faltantePorRepartir(total, partesParaValidar),
    [total, partesParaValidar]
  )

  const formatear = (monto: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: expense?.currency || "USD",
      minimumFractionDigits: 2,
    }).format(monto)

  const repartirIgual = () => {
    const montos = repartirEnPartesIguales(total, partes.length)
    setPartes((prev) => prev.map((p, i) => ({ ...p, amount: montos[i]?.toFixed(2) ?? "" })))
  }

  const agregarParte = () => {
    const usadas = new Set(partes.map((p) => p.agencyId))
    const libre = agencies.find((a) => !usadas.has(a.id))
    if (!libre) return
    setPartes((prev) => [...prev, { agencyId: libre.id, amount: "" }])
  }

  const quitarParte = (i: number) => {
    setPartes((prev) => prev.filter((_, idx) => idx !== i))
  }

  const actualizar = (i: number, campo: keyof Parte, valor: string) => {
    setPartes((prev) => prev.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)))
  }

  const handleSubmit = async () => {
    if (!expense || !validacion.ok) return
    setSaving(true)
    try {
      const res = await fetch(`/api/expenses/variable/${expense.id}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shares: partesParaValidar.map((p) => ({ agency_id: p.agencyId, amount: p.amount })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "No se pudo dividir el gasto")
        return
      }
      toast.success(`Gasto dividido entre ${partes.length} oficinas`)
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      console.error("Error dividiendo el gasto:", err)
      toast.error("No se pudo dividir el gasto")
    } finally {
      setSaving(false)
    }
  }

  if (!expense) return null

  const puedeAgregar = partes.length < agencies.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Split className="h-4 w-4" />
            Dividir gasto entre oficinas
          </DialogTitle>
          <DialogDescription>
            El gasto no cambia de importe ni sale de otra cuenta: sólo se reparte a qué
            oficina se le imputa.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
          <p className="text-sm font-medium">{expense.notes || expense.category}</p>
          <p className="text-lg font-semibold tabular-nums">{formatear(total)}</p>
        </div>

        <div className="space-y-2">
          {partes.map((parte, i) => {
            const usadasPorOtras = new Set(
              partes.filter((_, idx) => idx !== i).map((p) => p.agencyId)
            )
            return (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  {i === 0 && <Label className="text-xs text-muted-foreground">Oficina</Label>}
                  <Select
                    value={parte.agencyId}
                    onValueChange={(v) => actualizar(i, "agencyId", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Elegir oficina" />
                    </SelectTrigger>
                    <SelectContent>
                      {agencies.map((agency) => (
                        <SelectItem
                          key={agency.id}
                          value={agency.id}
                          disabled={usadasPorOtras.has(agency.id)}
                        >
                          {agency.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-36 space-y-1">
                  {i === 0 && <Label className="text-xs text-muted-foreground">Importe</Label>}
                  <DecimalInput
                    className="text-right tabular-nums"
                    placeholder="0.00"
                    value={parte.amount}
                    onChange={(e: any) => actualizar(i, "amount", e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  disabled={partes.length <= 2}
                  onClick={() => quitarParte(i)}
                  aria-label="Quitar oficina"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={repartirIgual}>
              Partes iguales
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={agregarParte}
              disabled={!puedeAgregar}
            >
              <Plus className="h-4 w-4 mr-1" />
              Oficina
            </Button>
          </div>
          <p
            className={`text-sm tabular-nums ${
              validacion.ok ? "text-muted-foreground" : "text-destructive"
            }`}
          >
            {validacion.ok
              ? "El reparto cierra"
              : falta > 0
                ? `Falta repartir ${formatear(falta)}`
                : falta < 0
                  ? `Sobran ${formatear(Math.abs(falta))}`
                  : validacion.error}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !validacion.ok}>
            {saving ? "Dividiendo..." : "Dividir gasto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
