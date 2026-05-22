"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export function CriticalActions({
  orgId,
  orgName,
  orgSlug,
  currentStatus,
}: {
  orgId: string
  orgName: string
  orgSlug: string
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
    if (res.ok) {
      toast.success("Acción aplicada")
      router.refresh()
    } else {
      const errBody = await res.json().catch(() => ({}))
      toast.error(errBody?.error ?? res.statusText ?? "Error en la acción")
    }
  }

  // Destroy con doble confirmación: primero "DESTRUIR <nombre>", después el slug exacto.
  // Action irreversible — borra TODA la data del tenant + auth.users (libera emails).
  async function destroyOrg() {
    const step1Phrase = `DESTRUIR ${orgName}`
    const step1 = prompt(
      `⚠️ ACCIÓN IRREVERSIBLE\n\n` +
        `Vas a borrar COMPLETAMENTE la organización "${orgName}":\n` +
        `• Todas sus operaciones, leads, clientes, pagos, alertas, facturas\n` +
        `• Todas sus agencias, settings, integraciones\n` +
        `• Todos los usuarios (incluyendo sus emails — quedan libres para registrarse de nuevo)\n` +
        `• Todos los movimientos contables\n\n` +
        `Esta acción NO se puede deshacer.\n\n` +
        `Para continuar, escribí literal: ${step1Phrase}`
    )
    if (step1 !== step1Phrase) {
      if (step1 !== null) toast.error("Confirmación incorrecta")
      return
    }

    const step2 = prompt(
      `Última confirmación.\n\n` +
        `Escribí el SLUG exacto de la org para destruirla:\n\n` +
        `Slug: ${orgSlug}`
    )
    if (step2 !== orgSlug) {
      if (step2 !== null) toast.error("Slug no coincide. Cancelado.")
      return
    }

    setBusy(true)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/destroy`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: orgSlug, reason: "Admin action via /admin/orgs" }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(
          `Tenant destruido. ${data.users_destroyed} usuarios eliminados.${
            data.auth_delete_failures > 0
              ? ` ⚠️ ${data.auth_delete_failures} fallos al borrar auth users — revisar logs.`
              : ""
          }`,
          { duration: 8000 }
        )
        router.push("/admin/orgs")
      } else {
        toast.error(data?.error ?? `Error ${res.status}`)
      }
    } catch (e: any) {
      toast.error(e?.message || "Error en la acción")
    } finally {
      setBusy(false)
    }
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

      <div className="mt-4 pt-4 border-t border-destructive/30">
        <h3 className="text-sm font-semibold text-destructive mb-1">Zona peligrosa</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Eliminar tenant borra COMPLETAMENTE la organización: data, settings, agencias,
          usuarios y sus emails. NO se puede deshacer. Requiere doble confirmación.
        </p>
        <button
          onClick={destroyOrg}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded border border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 font-medium"
        >
          🗑️ Eliminar tenant (irreversible)
        </button>
      </div>
    </div>
  )
}
