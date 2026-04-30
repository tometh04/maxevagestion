"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Undo2, Loader2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

type Props = {
  movementId: string
  endpoint: "cash-movements" | "ledger-movements"
  /** "INCOME" | "EXPENSE" — texto descriptivo opcional */
  movementLabel?: string
  /** Si true, ya fue reversado o es reversión: deshabilita */
  disabled?: boolean
  size?: "sm" | "default"
  variant?: "ghost" | "outline"
}

export function CashMovementReverseButton({
  movementId,
  endpoint,
  movementLabel,
  disabled,
  size = "sm",
  variant = "ghost",
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  async function confirm() {
    if (!reason.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/${endpoint}/${movementId}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Movimiento reversado")
      setOpen(false)
      setReason("")
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
        size={size}
        variant={variant}
        disabled={disabled}
        onClick={() => setOpen(true)}
        title="Reversar movimiento"
      >
        <Undo2 className="h-3 w-3 mr-1" /> Reversar
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-accent-coral" />
              Reversar movimiento
            </DialogTitle>
            <DialogDescription>
              Vas a generar un contra-movimiento que neutraliza este {movementLabel || "movimiento"}.
              El movimiento original queda en historial. <strong>Esto no se puede deshacer.</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Motivo del contra-movimiento *</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: monto erróneo, pago duplicado, error de cuenta..."
              rows={3}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button variant="destructive" onClick={confirm} disabled={!reason.trim() || busy}>
              {busy && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
              Confirmar reversión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
