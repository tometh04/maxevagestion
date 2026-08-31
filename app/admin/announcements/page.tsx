"use client"

import { useState, useEffect, useCallback } from "react"
import { Megaphone, Plus, Sparkles, TrendingUp, Wrench, Eye, EyeOff, Trash2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { ROLES_VALIDOS } from "@/lib/announcements/modal-payload"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { PageHeader } from "@/components/admin/page-header"
import { DataTableShell } from "@/components/admin/data-table-shell"
import { EmptyState } from "@/components/admin/empty-state"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

type AnnouncementType = "NEW" | "IMPROVEMENT" | "FIX"

interface Announcement {
  id: string
  title: string
  body: string
  type: AnnouncementType
  published: boolean
  published_at: string
  created_at: string
  updated_at: string
  modal: boolean
  modal_starts_at: string | null
  modal_ends_at: string | null
  modal_roles: string[] | null
  modal_cta_label: string | null
  modal_cta_href: string | null
}

const typeConfig: Record<AnnouncementType, { label: string; icon: typeof Sparkles; className: string }> = {
  NEW: { label: "Nuevo", icon: Sparkles, className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  IMPROVEMENT: { label: "Mejora", icon: TrendingUp, className: "bg-blue-50 text-blue-700 border-blue-200" },
  FIX: { label: "Corrección", icon: Wrench, className: "bg-orange-50 text-orange-700 border-orange-200" },
}

const emptyDraft = {
  id: "",
  title: "",
  body: "",
  type: "NEW" as AnnouncementType,
  published: true,
  // El modal arranca apagado: interrumpir a toda la base tiene que ser una
  // decisión explícita, no lo que pasa si nadie toca nada.
  modal: false,
  modal_starts_at: "",
  modal_ends_at: "",
  modal_roles: [] as string[],
  modal_cta_label: "",
  modal_cta_href: "",
}

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEditing = draft.id !== ""

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/announcements")
      const data = await res.json()
      setAnnouncements(data.announcements || [])
    } catch (e) {
      console.error("Error loading announcements:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setDraft(emptyDraft)
    setDialogOpen(true)
  }

  const openEdit = (a: Announcement) => {
    setDraft({
      id: a.id,
      title: a.title,
      body: a.body,
      type: a.type,
      published: a.published,
      modal: a.modal ?? false,
      // Los inputs de fecha trabajan con YYYY-MM-DD; la base guarda timestamps.
      modal_starts_at: a.modal_starts_at?.slice(0, 10) ?? "",
      modal_ends_at: a.modal_ends_at?.slice(0, 10) ?? "",
      modal_roles: a.modal_roles ?? [],
      modal_cta_label: a.modal_cta_label ?? "",
      modal_cta_href: a.modal_cta_href ?? "",
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!draft.title.trim() || !draft.body.trim()) return
    setSaving(true)
    setError(null)
    try {
      const url = isEditing ? `/api/admin/announcements/${draft.id}` : "/api/admin/announcements"
      const method = isEditing ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          body: draft.body,
          type: draft.type,
          published: draft.published,
          modal: draft.modal,
          modal_starts_at: draft.modal_starts_at || null,
          modal_ends_at: draft.modal_ends_at || null,
          modal_roles: draft.modal_roles,
          modal_cta_label: draft.modal_cta_label || null,
          modal_cta_href: draft.modal_cta_href || null,
        }),
      })
      if (!res.ok) {
        // El backend explica qué está mal (destino externo, botón a medias,
        // rol inexistente). Mostrarlo es más útil que "no se pudo guardar".
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || "No se pudo guardar la novedad")
      }
      setDialogOpen(false)
      await load()
    } catch (e: any) {
      console.error("Error saving announcement:", e)
      setError(e?.message ?? "No se pudo guardar la novedad")
    } finally {
      setSaving(false)
    }
  }

  const togglePublished = async (a: Announcement) => {
    try {
      await fetch(`/api/admin/announcements/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !a.published }),
      })
      await load()
    } catch (e) {
      console.error("Error toggling publish:", e)
    }
  }

  const remove = async (a: Announcement) => {
    if (!confirm(`¿Eliminar la novedad "${a.title}"?`)) return
    try {
      await fetch(`/api/admin/announcements/${a.id}`, { method: "DELETE" })
      await load()
    } catch (e) {
      console.error("Error deleting announcement:", e)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Novedades"
        description="Changelog global del producto — visible para todos los usuarios de todas las orgs."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva novedad
          </Button>
        }
      />

      <DataTableShell>
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : announcements.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="Sin novedades todavía"
            description="Creá la primera novedad para comunicar un cambio o mejora del sistema."
          />
        ) : (
          <div className="divide-y divide-border">
            {announcements.map((a) => {
              const config = typeConfig[a.type]
              const Icon = config.icon
              return (
                <div key={a.id} className="flex items-start gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={`gap-1 text-[11px] ${config.className}`}>
                        <Icon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                      {a.published ? (
                        <Badge variant="outline" className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200">
                          Publicada
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] text-muted-foreground">
                          Borrador
                        </Badge>
                      )}
                    </div>
                    <p className="font-medium text-sm text-foreground">{a.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap line-clamp-2">{a.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(a.published_at), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => togglePublished(a)} title={a.published ? "Despublicar" : "Publicar"}>
                      {a.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(a)} title="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(a)} title="Eliminar" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DataTableShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Editar novedad" : "Nueva novedad"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Ej: Nuevo módulo de reportes"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body">Descripción</Label>
              <Textarea
                id="body"
                rows={5}
                value={draft.body}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                placeholder="Contá qué cambió y cómo aprovecharlo…"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="space-y-1.5 flex-1">
                <Label>Tipo</Label>
                <Select value={draft.type} onValueChange={(v) => setDraft((d) => ({ ...d, type: v as AnnouncementType }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEW">Nuevo</SelectItem>
                    <SelectItem value="IMPROVEMENT">Mejora</SelectItem>
                    <SelectItem value="FIX">Corrección</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 flex-1">
                <Label>Estado</Label>
                <Select
                  value={draft.published ? "yes" : "no"}
                  onValueChange={(v) => setDraft((d) => ({ ...d, published: v === "yes" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Publicada</SelectItem>
                    <SelectItem value="no">Borrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Mostrar como modal.
                Se usa para releases grandes que además le piden algo al usuario.
                Va apagado por defecto: interrumpir a toda la base tiene que ser
                una decisión, no lo que pasa si nadie toca nada. */}
            <div className="rounded-md border p-3.5 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <Checkbox
                  checked={draft.modal}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, modal: v === true }))}
                  className="mt-0.5"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Mostrar como modal al entrar</span>
                  <span className="block text-xs text-muted-foreground">
                    Además de aparecer en la campana, interrumpe una vez por ingreso hasta que el
                    usuario lo descarte o venza.
                  </span>
                </span>
              </label>

              {draft.modal && (
                <div className="space-y-3 border-t pt-3">
                  <div className="flex gap-3">
                    <div className="space-y-1.5 flex-1">
                      <Label htmlFor="modal-from">Desde</Label>
                      <Input
                        id="modal-from"
                        type="date"
                        value={draft.modal_starts_at}
                        onChange={(e) => setDraft((d) => ({ ...d, modal_starts_at: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <Label htmlFor="modal-until">Hasta</Label>
                      <Input
                        id="modal-until"
                        type="date"
                        value={draft.modal_ends_at}
                        onChange={(e) => setDraft((d) => ({ ...d, modal_ends_at: e.target.value }))}
                      />
                    </div>
                  </div>
                  {!draft.modal_ends_at && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Sin fecha de fin el modal no vence: va a seguir apareciendo hasta que cada
                      usuario lo descarte.
                    </p>
                  )}

                  <div className="space-y-1.5">
                    <Label>Roles que lo ven</Label>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {ROLES_VALIDOS.map((rol) => (
                        <label key={rol} className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <Checkbox
                            checked={draft.modal_roles.includes(rol)}
                            onCheckedChange={(v) =>
                              setDraft((d) => ({
                                ...d,
                                modal_roles:
                                  v === true
                                    ? [...d.modal_roles, rol]
                                    : d.modal_roles.filter((r) => r !== rol),
                              }))
                            }
                          />
                          {rol}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sin ninguno marcado lo ven todos. Esto restringe el modal, no la novedad: en
                      la campana la sigue viendo cualquiera.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <div className="space-y-1.5 flex-1">
                      <Label htmlFor="cta-label">Texto del botón</Label>
                      <Input
                        id="cta-label"
                        placeholder="Configurar contabilidad"
                        value={draft.modal_cta_label}
                        onChange={(e) => setDraft((d) => ({ ...d, modal_cta_label: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <Label htmlFor="cta-href">Destino</Label>
                      <Input
                        id="cta-href"
                        placeholder="/finances/settings"
                        value={draft.modal_cta_href}
                        onChange={(e) => setDraft((d) => ({ ...d, modal_cta_href: e.target.value }))}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    El destino tiene que ser una ruta interna. Los dos campos van juntos o ninguno.
                  </p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive px-1">{error}</p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !draft.title.trim() || !draft.body.trim()}>
              {saving ? "Guardando…" : isEditing ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
