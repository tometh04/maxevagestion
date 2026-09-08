"use client"

/**
 * Ventas de un cliente que quedaron sin comisión de referido.
 *
 * La comisión al referidor se calcula al guardar la venta. Si el referidor se
 * carga después, esas ventas ya pasaron y nadie vuelve a mirarlas. Acá se
 * eligen las que corresponden y se generan.
 *
 * Vive en un solo archivo porque hay dos puertas de entrada y tienen que
 * comportarse igual: el paso que aparece al asignar un referidor recién cargado
 * (diálogo de editar cliente) y el botón de la ficha, para el cliente que ya lo
 * tenía guardado de antes.
 */

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { parseDateOnlyLocal } from "@/lib/utils/date-only"
import { format } from "date-fns"
import { es } from "date-fns/locale"

export interface PendingReferralOperation {
  operationId: string
  fileCode: string | null
  operationDate: string | null
  destination: string | null
  marginAmount: number
  currency: string
  percentage: number
  amount: number
}

export interface PendingReferralPayload {
  referral: { partnerId: string | null; partnerName: string | null; percentage: number }
  operations: PendingReferralOperation[]
  truncated: boolean
}

const fmtMoney = (value: number, currency: string) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 2,
  }).format(value || 0)

const fmtDate = (value: string | null) => {
  const parsed = value ? parseDateOnlyLocal(value) : null
  return parsed ? format(parsed, "dd/MM/yyyy", { locale: es }) : "Sin fecha"
}

/** Estado y llamadas del flujo. Lo comparten las dos puertas de entrada. */
export function usePendingReferralCommissions(customerId: string) {
  const [payload, setPayload] = useState<PendingReferralPayload | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)

  const load = useCallback(async (): Promise<PendingReferralPayload | null> => {
    setLoading(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/referral-commissions`)
      if (!res.ok) return null
      const data = (await res.json()) as PendingReferralPayload
      setPayload(data)
      // Nada tildado por default: cada tilde genera plata a favor del referidor,
      // así que la elección tiene que ser explícita.
      setSelected(new Set())
      return data
    } catch (error) {
      // No se avisa con un error rojo: esto corre después de guardar el cliente,
      // que sí funcionó.
      console.error("Error buscando ventas sin comisión de referido:", error)
      return null
    } finally {
      setLoading(false)
    }
  }, [customerId])

  const toggle = useCallback((operationId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(operationId)) next.delete(operationId)
      else next.add(operationId)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setPayload(null)
    setSelected(new Set())
  }, [])

  const apply = useCallback(async (): Promise<boolean> => {
    if (selected.size === 0) return false
    setApplying(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/referral-commissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationIds: Array.from(selected) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "No se pudieron generar las comisiones")

      toast.success(
        data.created === 1
          ? "Se generó la comisión del referidor"
          : `Se generaron ${data.created} comisiones del referidor`,
        data.failed > 0
          ? { description: `${data.failed} venta(s) no se pudieron procesar.` }
          : undefined
      )
      return true
    } catch (error) {
      console.error("Error generando comisiones de referido:", error)
      toast.error(error instanceof Error ? error.message : "No se pudieron generar las comisiones")
      return false
    } finally {
      setApplying(false)
    }
  }, [customerId, selected])

  return { payload, selected, loading, applying, load, toggle, apply, reset }
}

interface PendingReferralContentProps {
  payload: PendingReferralPayload
  selected: Set<string>
  applying: boolean
  onToggle: (operationId: string) => void
  onApply: () => void
  onSkip: () => void
  /** Texto del botón que cierra sin generar nada. */
  skipLabel?: string
}

/** Lista de ventas + acciones. El encabezado lo pone cada puerta de entrada. */
export function PendingReferralContent({
  payload,
  selected,
  applying,
  onToggle,
  onApply,
  onSkip,
  skipLabel = "Ahora no",
}: PendingReferralContentProps) {
  const chosen = payload.operations.filter((op) => selected.has(op.operationId))
  const total = chosen.reduce((sum, op) => sum + op.amount, 0)
  const currencies = new Set(chosen.map((op) => op.currency))
  const mixedCurrencies = currencies.size > 1

  return (
    <>
      <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
        {payload.operations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todas las ventas de este cliente ya tienen su comisión de referido.
          </p>
        ) : (
          payload.operations.map((op) => (
            <label
              key={op.operationId}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <Checkbox
                checked={selected.has(op.operationId)}
                onCheckedChange={() => onToggle(op.operationId)}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {fmtDate(op.operationDate)} · {op.destination || "Sin destino"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {op.fileCode || op.operationId.slice(0, 8)} · Ganancia{" "}
                  {fmtMoney(op.marginAmount, op.currency)}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums whitespace-nowrap">
                {fmtMoney(op.amount, op.currency)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({op.percentage}%)
                </span>
              </p>
            </label>
          ))
        )}

        {payload.truncated && (
          <p className="text-xs text-muted-foreground">
            Se revisaron las ventas más recientes del cliente. Si falta alguna más vieja, editala y
            guardala para que genere la comisión.
          </p>
        )}
      </div>

      <DialogFooter className="px-6 pb-5">
        <div className="mr-auto text-sm">
          {chosen.length > 0 && !mixedCurrencies && (
            <>
              <span className="text-muted-foreground">Total a generar: </span>
              <span className="font-semibold tabular-nums">
                {fmtMoney(total, chosen[0].currency)}
              </span>
            </>
          )}
          {mixedCurrencies && (
            <span className="text-muted-foreground">
              Elegiste ventas en distintas monedas: cada comisión queda en la suya.
            </span>
          )}
        </div>
        <Button variant="outline" onClick={onSkip} disabled={applying}>
          {skipLabel}
        </Button>
        <Button onClick={onApply} disabled={applying || selected.size === 0}>
          {applying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generando...
            </>
          ) : (
            `Generar comisión (${selected.size})`
          )}
        </Button>
      </DialogFooter>
    </>
  )
}

interface PendingReferralDialogProps {
  customerId: string
  customerName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Se llama después de generar comisiones, para refrescar la pantalla. */
  onApplied?: () => void
}

/**
 * Diálogo suelto para la ficha del cliente: el referidor ya estaba guardado y
 * el administrador quiere completar las ventas anteriores.
 */
export function PendingReferralDialog({
  customerId,
  customerName,
  open,
  onOpenChange,
  onApplied,
}: PendingReferralDialogProps) {
  const { payload, selected, loading, applying, load, toggle, apply, reset } =
    usePendingReferralCommissions(customerId)

  useEffect(() => {
    if (open) load()
    else reset()
  }, [open, load, reset])

  const handleApply = async () => {
    const ok = await apply()
    if (ok) {
      onOpenChange(false)
      onApplied?.()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Comisión de ventas anteriores</DialogTitle>
          <DialogDescription>
            {payload?.referral.partnerName
              ? `${payload.referral.partnerName} es el referidor de ${customerName}.`
              : `Referidor de ${customerName}.`}{" "}
            Estas ventas no generaron comisión porque ya estaban cargadas. Elegí a cuáles
            corresponde aplicársela.
          </DialogDescription>
        </DialogHeader>

        {loading || !payload ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <PendingReferralContent
            payload={payload}
            selected={selected}
            applying={applying}
            onToggle={toggle}
            onApply={handleApply}
            onSkip={() => onOpenChange(false)}
            skipLabel="Cerrar"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
