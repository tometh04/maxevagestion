"use client"

import { useState, useEffect, useCallback } from "react"
import { Megaphone, Plus, Sparkles, TrendingUp, Wrench, Eye, EyeOff, Trash2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
}

const typeConfig: Record<AnnouncementType, { label: string; icon: typeof Sparkles; className: string }> = {
  NEW: { label: "Nuevo", icon: Sparkles, className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  IMPROVEMENT: { label: "Mejora", icon: TrendingUp, className: "bg-blue-50 text-blue-700 border-blue-200" },
  FIX: { label: "Corrección", icon: Wrench, className: "bg-orange-50 text-orange-700 border-orange-200" },
}

const emptyDraft = { id: "", title: "", body: "", type: "NEW" as AnnouncementType, published: true }

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [saving, setSaving] = useState(false)
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
    setDraft({ id: a.id, title: a.title, body: a.body, type: a.type, published: a.published })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!draft.title.trim() || !draft.body.trim()) return
    setSaving(true)
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
        }),
      })
      if (!res.ok) throw new Error("save failed")
      setDialogOpen(false)
      await load()
    } catch (e) {
      console.error("Error saving announcement:", e)
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
          </div>
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
