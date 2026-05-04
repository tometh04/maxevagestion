"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function CriticalActions({
  orgId,
  orgName,
  currentStatus,
}: {
  orgId: string
  orgName: string
  currentStatus: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function post(path: string, body?: any, confirmTextMatch?: string) {
    if (confirmTextMatch) {
      const input = prompt(`Para confirmar, escribí: ${confirmTextMatch}`)
      if (input !== confirmTextMatch) return
    }
    setBusy(true)
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    })
    setBusy(false)
    if (res.ok) router.refresh()
    else alert(`Error: ${(await res.json()).error ?? res.statusText}`)
  }

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <h2 className="font-semibold">Acciones críticas</h2>
      <div className="flex flex-wrap gap-2">
        {currentStatus !== "SUSPENDED" && (
          <button
            onClick={() =>
              post(`/api/admin/orgs/${orgId}/suspend`, { reason: "Admin action" }, orgName)
            }
            disabled={busy}
            className="text-xs px-3 py-1 rounded border text-destructive hover:bg-destructive/5 dark:hover:bg-destructive/10 disabled:opacity-50"
          >
            Suspender acceso
          </button>
        )}
        {currentStatus === "SUSPENDED" && (
          <button
            onClick={() => post(`/api/admin/orgs/${orgId}/unsuspend`)}
            disabled={busy}
            className="text-xs px-3 py-1 rounded border hover:bg-muted disabled:opacity-50"
          >
            Desuspender
          </button>
        )}
        {currentStatus !== "CANCELLED" && (
          <button
            onClick={() =>
              post(
                `/api/admin/orgs/${orgId}/cancel-subscription`,
                { reason: "Admin action" },
                orgName
              )
            }
            disabled={busy}
            className="text-xs px-3 py-1 rounded border text-destructive hover:bg-destructive/5 dark:hover:bg-destructive/10 disabled:opacity-50"
          >
            Cancelar suscripción
          </button>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        Suspender / cancelar pide escribir el nombre de la org como confirmación.
      </div>
    </div>
  )
}
