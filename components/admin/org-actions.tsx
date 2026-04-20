"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

const PLANS = ["STARTER", "PRO", "ENTERPRISE"]
const STATUS = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"]

export function AdminOrgActions({
  orgId,
  currentStatus,
  currentPlan,
}: {
  orgId: string
  currentStatus: string | null
  currentPlan: string | null
}) {
  const router = useRouter()
  const [status, setStatus] = useState(currentStatus ?? "TRIAL")
  const [plan, setPlan] = useState(currentPlan ?? "STARTER")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, subscription_status: status }),
      })
      const body = await res.json()
      if (!res.ok) {
        setMessage(`Error: ${body.error || res.statusText}`)
      } else {
        setMessage("Guardado.")
        router.refresh()
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold">Acciones</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-muted-foreground block mb-1">Plan</span>
          <select
            className="w-full border rounded px-2 py-1 bg-background"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          >
            {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground block mb-1">Status</span>
          <select
            className="w-full border rounded px-2 py-1 bg-background"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="text-sm px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
      </div>
    </div>
  )
}
