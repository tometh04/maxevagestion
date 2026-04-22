"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CustomPlanForm } from "./custom-plan-form"

type CustomPlan = {
  display_name: string
  base_price_ars: number
  discount_percent: number
  discount_ends_at: string | null
  features: { extras: Array<{ key: string; label: string; enabled: boolean }> }
  limits: Record<string, number>
  billing_method: "MP" | "MANUAL"
  notes: string | null
}

export function CustomPlanDisplay({
  orgId,
  plan,
}: {
  orgId: string
  plan: CustomPlan
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function onDelete() {
    if (!confirm("¿Borrar custom plan? Esto cancela preapproval MP y vuelve al plan Enterprise base.")) return
    setDeleting(true)
    const res = await fetch(`/api/admin/orgs/${orgId}/custom-plan`, { method: "DELETE" })
    setDeleting(false)
    if (res.ok) router.refresh()
    else alert("Error borrando el plan")
  }

  if (editing) {
    return <CustomPlanForm orgId={orgId} initial={plan} />
  }

  const effectiveNow =
    plan.base_price_ars * (1 - (plan.discount_percent ?? 0) / 100)

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold">{plan.display_name}</h2>
          <div className="text-xs text-muted-foreground">
            Método: {plan.billing_method} · {plan.discount_percent > 0 ? `${plan.discount_percent}% off` : "sin descuento"}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="text-xs px-2 py-1 rounded border hover:bg-muted"
          >
            Editar
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="text-xs px-2 py-1 rounded border text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 disabled:opacity-50"
          >
            {deleting ? "Borrando..." : "Borrar plan"}
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Precio base</dt>
        <dd>${plan.base_price_ars.toLocaleString("es-AR")} / mes</dd>
        <dt className="text-muted-foreground">Precio efectivo (ahora)</dt>
        <dd className="font-semibold">${effectiveNow.toLocaleString("es-AR")} / mes</dd>
        {plan.discount_ends_at && (
          <>
            <dt className="text-muted-foreground">Descuento vence</dt>
            <dd>{new Date(plan.discount_ends_at).toLocaleDateString("es-AR")}</dd>
          </>
        )}
      </dl>

      {plan.features?.extras?.length > 0 && (
        <div className="text-sm">
          <div className="text-muted-foreground mb-1">Extras acordadas:</div>
          <ul className="list-disc list-inside text-xs">
            {plan.features.extras
              .filter((e) => e.enabled)
              .map((e, i) => (
                <li key={i}>
                  {e.label}{" "}
                  <code className="text-muted-foreground">({e.key})</code>
                </li>
              ))}
          </ul>
        </div>
      )}

      {plan.notes && (
        <div className="text-xs text-muted-foreground whitespace-pre-wrap border-t pt-2">
          {plan.notes}
        </div>
      )}
    </div>
  )
}
