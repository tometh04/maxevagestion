"use client"

/**
 * Reclasificar una salida de caja como "no es gasto" (o de vuelta a gasto).
 *
 * POR QUÉ ESTÁ EN CAJA Y NO EN GASTOS
 * -----------------------------------
 * El flag sólo se podía elegir AL CREAR el movimiento. Si se cargaba mal, el
 * único camino era borrarlo y volver a cargarlo — o sea, borrar un egreso que
 * realmente ocurrió. Reportado por Lozada sobre un ajuste de caja que quedaba
 * figurando como gasto.
 *
 * La acción vive acá y no en la pantalla de Gastos porque esa pantalla filtra
 * `is_touristic = false` y no llega a listar todos los egresos: justamente el
 * movimiento que lo motivó era invisible ahí. Caja los muestra todos.
 *
 * NO MUEVE PLATA. El egreso sigue saliendo de la cuenta igual; lo único que
 * cambia es si cuenta como gasto de la agencia en los reportes.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Receipt, Ban, Loader2 } from "lucide-react"
import { toast } from "sonner"

type Props = {
  movementId: string
  /** Estado actual. `false` = ya está marcado como salida que no es gasto. */
  isAgencyExpense: boolean
  /** Motivo ya cargado; se ofrece como punto de partida. */
  currentNotes?: string | null
  disabled?: boolean
}

export function CashMovementExpenseFlagButton({
  movementId,
  isAgencyExpense,
  currentNotes,
  disabled,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(currentNotes ?? "")
  const [busy, setBusy] = useState(false)

  // Marcar algo como "no es gasto" saca plata de los reportes, así que exige
  // decir por qué. Volver a marcarlo como gasto no: es restituir el default.
  const marcandoNoGasto = isAgencyExpense
  const faltaMotivo = marcandoNoGasto && !reason.trim()

  async function confirm() {
    if (faltaMotivo) return
    setBusy(true)
    try {
      const res = await fetch(`/api/expenses/variable/${movementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_agency_expense: !isAgencyExpense,
          ...(marcandoNoGasto ? { notes: reason.trim() } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "No se pudo actualizar")
      toast.success(
        marcandoNoGasto
          ? "Marcado como salida que no es gasto"
          : "Vuelve a contar como gasto de la agencia"
      )
      setOpen(false)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || "Error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={
          marcandoNoGasto
            ? "Sacarlo de los gastos sin borrar el movimiento"
            : "Volver a contarlo como gasto"
        }
      >
        {marcandoNoGasto ? (
          <>
            <Ban className="h-3 w-3 mr-1" /> No es gasto
          </>
        ) : (
          <>
            <Receipt className="h-3 w-3 mr-1" /> Es gasto
          </>
        )}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!busy) setOpen(o)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {marcandoNoGasto ? "Marcar como salida que no es gasto" : "Volver a contarlo como gasto"}
            </DialogTitle>
            <DialogDescription>
              {marcandoNoGasto ? (
                <>
                  Deja de aparecer en el reporte de Gastos.{" "}
                  <strong>La plata no se toca</strong>: el egreso sigue saliendo de la cuenta
                  igual. Sirve para retiros, ajustes de caja o pagos que ya están descontados
                  en otro lado.
                </>
              ) : (
                <>Vuelve a contar como gasto de la agencia en los reportes.</>
              )}
            </DialogDescription>
          </DialogHeader>

          {marcandoNoGasto && (
            <div className="space-y-2 py-2">
              <Label htmlFor="motivo-no-gasto">Motivo</Label>
              <Textarea
                id="motivo-no-gasto"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Por qué esta salida no es un gasto de la agencia"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Queda como detalle del movimiento: es lo que hace auditable la decisión.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={confirm} disabled={busy || faltaMotivo}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
