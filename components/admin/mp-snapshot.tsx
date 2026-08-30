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

  // Link de pago per-org: preapproval atado al email real de MP del cliente.
  const [payerEmail, setPayerEmail] = useState("")
  const [genFreeTrialDays, setGenFreeTrialDays] = useState("")
  const [genLoading, setGenLoading] = useState(false)
  const [genResult, setGenResult] = useState<any>(null)

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

  async function generateLink() {
    setGenLoading(true)
    setGenResult(null)
    try {
      const trialDays = Number(genFreeTrialDays)
      const res = await fetch(`/api/admin/orgs/${orgId}/mp-preapproval-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payer_email: payerEmail.trim(),
          free_trial_days:
            Number.isFinite(trialDays) && trialDays > 0 ? Math.floor(trialDays) : undefined,
        }),
      })
      const body = await res.json()
      setGenResult(body.ok ? body : { ok: false, message: body.error || "No se pudo generar" })
    } catch (err: any) {
      setGenResult({ ok: false, message: err?.message || "Error de red" })
    } finally {
      setGenLoading(false)
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
                <div className="font-semibold mb-1">Intentos de cobro:</div>
                {Array.isArray(data.charge_attempts) ? (
                  data.charge_attempts.length === 0 ? (
                    <div className="text-muted-foreground">
                      MP no reporta intentos de cobro para este preapproval.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {(data.charge_attempts as any[]).map((a) => (
                        <div key={a.id} className="border-b last:border-0 py-1">
                          <div className="flex flex-wrap items-center gap-x-2">
                            <span className="text-muted-foreground">
                              {a.debit_date || a.date_created
                                ? new Date(a.debit_date || a.date_created).toLocaleString("es-AR")
                                : "sin fecha"}
                            </span>
                            <code
                              className={
                                a.payment_status === "approved"
                                  ? "text-green-700 dark:text-green-400"
                                  : a.payment_status === "rejected"
                                    ? "text-red-700 dark:text-red-400"
                                    : ""
                              }
                            >
                              {a.payment_status ?? a.status}
                            </code>
                            {a.transaction_amount != null && (
                              <span>${Number(a.transaction_amount).toLocaleString("es-AR")}</span>
                            )}
                            {a.retry_attempt != null && <span>intento #{a.retry_attempt}</span>}
                          </div>
                          {a.reason_label && (
                            <div className="text-muted-foreground">
                              Motivo: {a.reason_label}
                              {a.reason_retryable === false && " — no sirve reintentar el mismo medio"}
                              {a.reason_action ? ` → ${a.reason_action}` : ""}
                            </div>
                          )}
                          {a.next_retry_date && (
                            <div className="text-muted-foreground">
                              Próximo reintento de MP:{" "}
                              {new Date(a.next_retry_date).toLocaleString("es-AR")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="text-red-700 dark:text-red-400">
                    No se pudo consultar MP: {(data.charge_attempts as any)?.error}
                  </div>
                )}
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

          <div className="border-t pt-3 mt-1">
            <div className="font-semibold mb-1">Generar link de pago per-org</div>
            <p className="text-muted-foreground mb-2">
              Crea un preapproval atado al email real de la cuenta de Mercado Pago
              del cliente (mejor aprobación antifraude que el link genérico). El
              cliente debe pagarlo con esa cuenta. No cambia el estado hasta que
              el pago se aprueba.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={payerEmail}
                onChange={(e) => setPayerEmail(e.target.value)}
                placeholder="email de la cuenta MP del cliente"
                className="flex-1 border rounded px-2 py-1 bg-background"
              />
              <input
                type="number"
                min={0}
                max={365}
                value={genFreeTrialDays}
                onChange={(e) => setGenFreeTrialDays(e.target.value)}
                placeholder="días 1er cobro"
                title="Días hasta el primer cobro (difiere el débito si ya están cubiertos). Vacío = cobro al aceptar."
                className="w-32 border rounded px-2 py-1 bg-background"
              />
              <button
                onClick={generateLink}
                disabled={genLoading || !payerEmail.trim()}
                className="border rounded px-3 py-1 font-medium disabled:opacity-50"
              >
                {genLoading ? "Generando..." : "Generar link"}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              "días 1er cobro": si ya están cubiertos hasta una fecha, poné los días
              hasta esa fecha para diferir el primer débito. Vacío = cobra al aceptar.
            </p>
            {genResult && (
              <div
                className={`mt-2 rounded p-2 ${
                  genResult.ok
                    ? "bg-green-500/10 text-green-700 dark:text-green-400"
                    : "bg-red-500/10 text-red-700 dark:text-red-400"
                }`}
              >
                {genResult.ok ? (
                  <div className="space-y-1">
                    <div>Link generado ✓ (payer: {genResult.payer_email})</div>
                    <a
                      href={genResult.init_point}
                      target="_blank"
                      rel="noreferrer"
                      className="underline break-all"
                    >
                      {genResult.init_point}
                    </a>
                    <button
                      onClick={() => navigator.clipboard?.writeText(genResult.init_point)}
                      className="block border rounded px-2 py-0.5 text-[11px] mt-1"
                    >
                      Copiar link
                    </button>
                  </div>
                ) : (
                  <span>{genResult.message}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
