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
import { formatArs } from "@/lib/billing/plans"

function fmt(iso: string | null) {
  if (!iso) return "el fin del período pagado"
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit", month: "long", year: "numeric",
  })
}

const PRO_PRICE_ARS = 119000

/**
 * Acción "Bajar a plan PRO" para orgs Enterprise activas.
 *
 * Programa el downgrade al fin del período: la org sigue con Enterprise hasta
 * `effectiveAt` y ese día pasa a PRO, momento en que deberá regularizar el pago.
 * No cobra nada ahora ni toca MercadoPago.
 */
export function DowngradeDialog({
  effectiveAt,
  lostExtras,
}: {
  /** current_period_ends_at — hasta cuándo conserva el plan actual. */
  effectiveAt: string | null
  /** Labels de los extras del custom plan que se pierden al bajar a PRO. */
  lostExtras?: string[]
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleDowngrade() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/schedule-downgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPlan: "PRO" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al programar el downgrade")
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
        <Button variant="outline">Bajar a plan PRO</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bajar al plan PRO</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                Seguís con tu plan actual y todos sus beneficios hasta el{" "}
                <strong>{fmt(effectiveAt)}</strong>.
              </p>
              <p>
                Ese día tu cuenta pasa al plan <strong>PRO</strong> (
                {formatArs(PRO_PRICE_ARS)}/mes) y vas a tener que completar el pago de
                PRO para seguir usándola.
              </p>
              {lostExtras && lostExtras.length > 0 && (
                <>
                  <p>Al pasar a PRO dejás de tener:</p>
                  <ul className="list-disc list-inside text-muted-foreground">
                    {lostExtras.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className="text-muted-foreground">
                Podés deshacer este cambio en cualquier momento antes de esa fecha.
              </p>
              {error && <p className="text-destructive">{error}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>No, mantener mi plan</AlertDialogCancel>
          <AlertDialogAction disabled={loading} onClick={handleDowngrade}>
            {loading ? "Programando…" : "Sí, bajar a PRO"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Botón para deshacer un downgrade programado (acción reversible, sin confirmación).
 */
export function UndoDowngradeButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleUndo() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/schedule-downgrade", { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al deshacer el downgrade")
      router.refresh()
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="space-y-1">
      <Button variant="outline" size="sm" onClick={handleUndo} disabled={loading}>
        {loading ? "Deshaciendo…" : "Deshacer downgrade"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
