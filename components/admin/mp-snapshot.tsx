"use client"

import { useState } from "react"

export function MpSnapshot({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // Relink manual: recuperar org que pagó pero no se linkeó.
  const [relinkEmail, setRelinkEmail] = useState("")
  const [relinkPreapprovalId, setRelinkPreapprovalId] = useState("")
  const [relinking, setRelinking] = useState(false)
  const [relinkResult, setRelinkResult] = useState<any>(null)

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/orgs/${orgId}/mp-snapshot`)
    const body = await res.json()
    setData(body)
    setLoading(false)
  }

  async function relink() {
    setRelinking(true)
    setRelinkResult(null)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/mp-relink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payer_email: relinkEmail.trim() || undefined,
          preapproval_id: relinkPreapprovalId.trim() || undefined,
        }),
      })
      const body = await res.json()
      setRelinkResult(body)
      if (body.ok) load() // refrescar snapshot con el nuevo estado
    } catch (err: any) {
      setRelinkResult({ ok: false, message: err?.message || "Error de red" })
    } finally {
      setRelinking(false)
    }
  }

  return (
    <div className="border rounded-lg p-4">
      <button
        onClick={() => {
          setOpen(!open)
          if (!open && !data) load()
        }}
        className="text-sm font-semibold w-full text-left"
      >
        {open ? "▾" : "▸"} MP snapshot + últimos webhooks
      </button>
      {open && (
        <div className="mt-3 text-xs space-y-3">
          {loading && <div>Cargando...</div>}
          {data && (
            <>
              <div>
                <div className="font-semibold mb-1">Preapproval actual:</div>
                <pre className="bg-muted p-2 rounded overflow-x-auto max-h-64">
                  {JSON.stringify(data.preapproval, null, 2)}
                </pre>
              </div>
              <div>
                <div className="font-semibold mb-1">Últimos eventos:</div>
                {(data.recent_events as any[]).length === 0 ? (
                  <div className="text-muted-foreground">Sin eventos.</div>
                ) : (
                  (data.recent_events as any[]).map((e, i) => (
                    <div key={i} className="border-b last:border-0 py-1">
                      <span className="text-muted-foreground">
                        {new Date(e.created_at).toLocaleString("es-AR")}
                      </span>{" "}
                      <code>{e.event_type}</code>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          <div className="border-t pt-3 mt-1">
            <div className="font-semibold mb-1">Re-vincular con MP</div>
            <p className="text-muted-foreground mb-2">
              Para orgs que pagaron pero quedaron sin linkear (mp_preapproval_id
              vacío). Busca el preapproval en MP y aplica el estado. Dejá los
              campos vacíos para usar el billing_email de la org.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={relinkEmail}
                onChange={(e) => setRelinkEmail(e.target.value)}
                placeholder="payer_email (opcional)"
                className="flex-1 border rounded px-2 py-1 bg-background"
              />
              <input
                type="text"
                value={relinkPreapprovalId}
                onChange={(e) => setRelinkPreapprovalId(e.target.value)}
                placeholder="preapproval_id (opcional)"
                className="flex-1 border rounded px-2 py-1 bg-background"
              />
              <button
                onClick={relink}
                disabled={relinking}
                className="border rounded px-3 py-1 font-medium disabled:opacity-50"
              >
                {relinking ? "Buscando..." : "Re-vincular"}
              </button>
            </div>
            {relinkResult && (
              <div
                className={`mt-2 rounded p-2 ${
                  relinkResult.ok
                    ? "bg-green-500/10 text-green-700 dark:text-green-400"
                    : "bg-red-500/10 text-red-700 dark:text-red-400"
                }`}
              >
                {relinkResult.ok ? (
                  <span>
                    Linkeado ✓ {relinkResult.from_status} → {relinkResult.to_status}{" "}
                    (preapproval {relinkResult.preapproval_id}, MP:{" "}
                    {relinkResult.mp_status})
                  </span>
                ) : (
                  <span>
                    {relinkResult.message || relinkResult.reason || "No se pudo linkear"}
                    {typeof relinkResult.candidates === "number"
                      ? ` (candidatos: ${relinkResult.candidates})`
                      : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
