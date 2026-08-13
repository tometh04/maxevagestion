"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

type Props = {
  orgId: string
  memberId: string
  email: string
  isActive: boolean
  /** true si esta fila es la del propio platform admin logueado */
  isSelf: boolean
}

export function MemberRowActions({ orgId, memberId, email, isActive, isSelf }: Props) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function toggle() {
    // Confirmación solo al desactivar (acción disruptiva).
    if (isActive) {
      const ok = window.confirm(
        `¿Desactivar a ${email}? Le corta el acceso de inmediato (no puede loguearse). Se puede reactivar después. No borra su historial.`,
      )
      if (!ok) return
    }

    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !isActive }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (data.warning) window.alert(data.warning)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido")
    } finally {
      setBusy(false)
    }
  }

  if (isSelf) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        variant={isActive ? "ghost" : "outline"}
        onClick={toggle}
        disabled={busy}
        className={
          isActive
            ? "h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            : "h-7 px-2 text-xs"
        }
      >
        {busy ? "..." : isActive ? "Desactivar" : "Reactivar"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
