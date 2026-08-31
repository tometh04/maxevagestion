"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Configuración del embebido de Conversaciones para un tenant.
 *
 * El slug de la empresa habilita la sección: sin él, el ítem no aparece en el
 * sidebar y la ruta 404ea. La red por agencia elige qué bandeja abre cada
 * sucursal — sin red, Agente Blanco muestra la primera por orden alfabético y
 * parece que faltan chats.
 *
 * Los dos valores los asigna Agente Blanco.
 */
export interface AgencyNetworkRow {
  id: string
  name: string
  network: string | null
}

export function AgenteBlancoCard({
  orgId,
  currentSlug,
  agencies,
}: {
  orgId: string
  currentSlug: string | null
  agencies: AgencyNetworkRow[]
}) {
  const router = useRouter()
  const [slug, setSlug] = React.useState(currentSlug ?? "")
  const [networks, setNetworks] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(agencies.map((a) => [a.id, a.network ?? ""])),
  )
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function submit(body: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/agente-blanco`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.error || `HTTP ${res.status}`)
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido")
    } finally {
      setSaving(false)
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const trimmedSlug = slug.trim().toLowerCase()
    if (trimmedSlug === "" && currentSlug) {
      setError('Para desactivar la sección usá el botón "Quitar".')
      return
    }
    submit({
      slug: trimmedSlug || null,
      networks: Object.fromEntries(
        agencies.map((a) => [a.id, networks[a.id]?.trim() || null]),
      ),
    })
  }

  function handleClear() {
    const ok = window.confirm(
      `¿Quitar el slug "${currentSlug}"? La sección Conversaciones deja de existir para esta org.`,
    )
    if (!ok) return
    setSlug("")
    submit({ slug: null })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conversaciones (Agente Blanco)</CardTitle>
        <CardDescription>
          Identificadores que asigna Agente Blanco. Sin el slug de la empresa, la sección no
          existe para el tenant.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="agente-blanco-slug" className="text-xs text-muted-foreground">
                Slug de la empresa
              </Label>
              <Input
                id="agente-blanco-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Ej: lozada-viajes"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {currentSlug && (
              <Button type="button" variant="ghost" onClick={handleClear} disabled={saving}>
                Quitar
              </Button>
            )}
          </div>

          {agencies.length > 0 && (
            <div className="space-y-2.5">
              <div>
                <p className="text-xs font-medium text-foreground">Red por agencia</p>
                <p className="text-xs text-muted-foreground">
                  Cuenta de Instagram o número de WhatsApp conectado. Solo hace falta si la
                  empresa tiene más de una.
                </p>
              </div>
              <div className="space-y-2">
                {agencies.map((agency) => (
                  <div key={agency.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                    <Label
                      htmlFor={`agente-blanco-network-${agency.id}`}
                      className="text-xs text-muted-foreground sm:w-44 sm:shrink-0"
                    >
                      {agency.name}
                    </Label>
                    <Input
                      id={`agente-blanco-network-${agency.id}`}
                      value={networks[agency.id] ?? ""}
                      onChange={(e) =>
                        setNetworks((prev) => ({ ...prev, [agency.id]: e.target.value }))
                      }
                      placeholder="Ej: lozadaviajesrosario"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>

        <p className="mt-3 text-xs text-muted-foreground">
          {currentSlug ? (
            <>
              Activo: <span className="font-medium text-foreground">{currentSlug}</span>
            </>
          ) : (
            "Sin configurar — esta org no ve la sección Conversaciones."
          )}
        </p>

        {error && (
          <div className="mt-3 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
