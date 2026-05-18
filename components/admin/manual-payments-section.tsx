"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

type ManualPayment = {
  id: string
  amount_ars: number
  paid_at: string
  covers_from: string
  covers_to: string
  payment_method: string | null
  receipt_ref: string | null
}

export function ManualPaymentsSection({
  orgId,
  payments,
}: {
  orgId: string
  payments: ManualPayment[]
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    amount_ars: "",
    paid_at: new Date().toISOString().slice(0, 10),
    covers_from: new Date().toISOString().slice(0, 10),
    covers_to: "",
    payment_method: "",
    receipt_ref: "",
  })
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const res = await fetch(`/api/admin/orgs/${orgId}/manual-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount_ars: Number(form.amount_ars),
        paid_at: new Date(form.paid_at).toISOString(),
        covers_from: form.covers_from,
        covers_to: form.covers_to,
        payment_method: form.payment_method || null,
        receipt_ref: form.receipt_ref || null,
      }),
    })
    setBusy(false)
    if (res.ok) {
      setCreating(false)
      toast.success("Pago manual registrado")
      router.refresh()
    } else {
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error || "Error registrando el pago manual")
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Pagos manuales</h2>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="text-xs px-2 py-1 rounded bg-primary text-white"
          >
            Registrar pago
          </button>
        )}
      </div>

      {creating && (
        <div className="space-y-2 border rounded p-3 bg-muted/50">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label>
              <span className="text-muted-foreground text-xs">Monto ARS</span>
              <input
                type="text"
                inputMode="decimal"
                className="w-full border rounded px-2 py-1 bg-background"
                value={form.amount_ars}
                onChange={(e) => {
                  const raw = e.target.value.replace(",", ".")
                  if (raw === "" || /^\d*\.?\d*$/.test(raw)) setForm({ ...form, amount_ars: raw })
                }}
              />
            </label>
            <label>
              <span className="text-muted-foreground text-xs">Fecha de pago</span>
              <input
                type="date"
                className="w-full border rounded px-2 py-1 bg-background"
                value={form.paid_at}
                onChange={(e) => setForm({ ...form, paid_at: e.target.value })}
              />
            </label>
            <label>
              <span className="text-muted-foreground text-xs">Cubre desde</span>
              <input
                type="date"
                className="w-full border rounded px-2 py-1 bg-background"
                value={form.covers_from}
                onChange={(e) => setForm({ ...form, covers_from: e.target.value })}
              />
            </label>
            <label>
              <span className="text-muted-foreground text-xs">Cubre hasta</span>
              <input
                type="date"
                className="w-full border rounded px-2 py-1 bg-background"
                value={form.covers_to}
                onChange={(e) => setForm({ ...form, covers_to: e.target.value })}
              />
            </label>
            <label>
              <span className="text-muted-foreground text-xs">Método</span>
              <input
                className="w-full border rounded px-2 py-1 bg-background"
                placeholder="Transferencia BBVA / Factura A"
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              />
            </label>
            <label>
              <span className="text-muted-foreground text-xs">Nro comprobante</span>
              <input
                className="w-full border rounded px-2 py-1 bg-background"
                value={form.receipt_ref}
                onChange={(e) => setForm({ ...form, receipt_ref: e.target.value })}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={busy}
              className="text-xs px-3 py-1 rounded bg-primary text-white disabled:opacity-50"
            >
              {busy ? "..." : "Registrar"}
            </button>
            <button
              onClick={() => setCreating(false)}
              className="text-xs px-3 py-1 rounded border"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {payments.length === 0 ? (
        <div className="text-xs text-muted-foreground">Sin pagos registrados.</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-1">Fecha</th>
              <th>Monto</th>
              <th>Cubre</th>
              <th>Método</th>
              <th>Ref</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-1">{new Date(p.paid_at).toLocaleDateString("es-AR")}</td>
                <td>${Number(p.amount_ars).toLocaleString("es-AR")}</td>
                <td>
                  {p.covers_from} → {p.covers_to}
                </td>
                <td>{p.payment_method ?? "—"}</td>
                <td className="font-mono">{p.receipt_ref ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
