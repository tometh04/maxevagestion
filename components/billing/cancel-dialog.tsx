"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

function fmt(iso: string | null) {
  if (!iso) return "fin del período pagado"
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit", month: "long", year: "numeric",
  })
}

export function CancelDialog({
  currentPeriodEndsAt,
  trialEndsAt,
  status,
}: {
  currentPeriodEndsAt: string | null
  trialEndsAt: string | null
  status: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // TRIALING: fecha de corte = trial_ends_at. ACTIVE/PAST_DUE: current_period_ends_at.
  const cutoff = status === "TRIALING" ? trialEndsAt : currentPeriodEndsAt

  async function handleCancel() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al cancelar")
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Cancelar suscripción</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Seguro que querés cancelar tu suscripción?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>Mantenés acceso hasta el <strong>{fmt(cutoff)}</strong>.</p>
              <p>Después de esa fecha perderás acceso a:</p>
              <ul className="list-disc list-inside text-muted-foreground">
                <li>Todas tus operaciones y clientes</li>
                <li>CRM y pipeline de ventas</li>
                <li>Reportes y contabilidad</li>
                <li>WhatsApp integrado</li>
              </ul>
              <p className="text-success font-medium">
                Tu información NO se borra. Si volvés a suscribirte — antes o después
                de la fecha de corte — recuperás todo tal como lo dejaste.
              </p>
              {error && <p className="text-destructive">{error}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Mantener suscripción</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={handleCancel}
            className="bg-destructive hover:bg-destructive"
          >
            {loading ? "Cancelando…" : "Sí, cancelar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
