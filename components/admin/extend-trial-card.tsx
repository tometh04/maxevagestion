"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function ExtendTrialCard({
  orgId,
  currentTrialEndsAt,
}: {
  orgId: string
  currentTrialEndsAt: string | null
}) {
  const router = useRouter()
  const [days, setDays] = useState("7")
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function submit() {
    setSubmitting(true)
    setMsg(null)
    const res = await fetch(`/api/admin/orgs/${orgId}/extend-trial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: Number(days) }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) setMsg(`Error: ${data.error}`)
    else {
      setMsg(`Nuevo trial_ends_at: ${new Date(data.trial_ends_at).toLocaleDateString("es-AR")}`)
      router.refresh()
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <h2 className="font-semibold">Extender trial</h2>
      <div className="text-xs text-muted-foreground">
        Trial actual vence:{" "}
        {currentTrialEndsAt
          ? new Date(currentTrialEndsAt).toLocaleDateString("es-AR")
          : "sin trial activo"}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm">Extender por</span>
        <input
          type="number"
          className="w-20 border rounded px-2 py-1 bg-background text-sm"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          min={1}
          max={365}
        />
        <span className="text-sm">días</span>
        <button
          onClick={submit}
          disabled={submitting}
          className="text-sm px-3 py-1 rounded bg-primary text-white disabled:opacity-50"
        >
          {submitting ? "..." : "Extender"}
        </button>
      </div>
      {msg && <div className="text-xs text-muted-foreground">{msg}</div>}
    </div>
  )
}
