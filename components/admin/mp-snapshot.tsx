"use client"

import { useState } from "react"

export function MpSnapshot({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/orgs/${orgId}/mp-snapshot`)
    const body = await res.json()
    setData(body)
    setLoading(false)
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
        </div>
      )}
    </div>
  )
}
