"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Globe2, Plus, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

interface LeadRegion {
  id: string
  code: string
  name: string
  position: number
  is_active: boolean
}

export function LeadRegionsSettings() {
  const [regions, setRegions] = useState<LeadRegion[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<LeadRegion | null>(null)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/settings/lead-regions")
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Error al cargar regiones")
      setRegions(data.regions || [])
    } catch (e: any) {
      toast.error(e?.message || "Error al cargar regiones")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openNew = () => {
    setEditing(null)
    setName("")
    setDialogOpen(true)
  }

  const openEdit = (region: LeadRegion) => {
    setEditing(region)
    setName(region.name)
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("El nombre es requerido")
      return
    }
    setSaving(true)
    try {
      const res = editing
        ? await fetch(`/api/settings/lead-regions/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmed }),
          })
        : await fetch("/api/settings/lead-regions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmed }),
          })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Error al guardar región")
      toast.success(editing ? "Región actualizada" : "Región creada")
      setDialogOpen(false)
      load()
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar región")
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (region: LeadRegion) => {
    try {
      const res = await fetch(`/api/settings/lead-regions/${region.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !region.is_active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Error al actualizar")
      setRegions((prev) => prev.map((r) => (r.id === region.id ? data.region : r)))
    } catch (e: any) {
      toast.error(e?.message || "Error al actualizar región")
    }
  }

  const handleDelete = async (region: LeadRegion) => {
    if (!confirm(`¿Eliminar la región "${region.name}"?`)) return
    try {
      const res = await fetch(`/api/settings/lead-regions/${region.id}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Error al eliminar")
      toast.success("Región eliminada")
      load()
    } catch (e: any) {
      toast.error(e?.message || "No se pudo eliminar la región")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
            <Globe2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Regiones del CRM</h2>
            <p className="text-sm text-muted-foreground">
              Configurá las regiones disponibles para clasificar leads. Desactivar una región la oculta del CRM sin borrar los leads históricos.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Nueva Región
        </Button>
      </div>

      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50">
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="w-28">Activa</TableHead>
                <TableHead className="w-40">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : regions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10">
                    <div className="flex flex-col items-center text-center gap-3">
                      <Globe2 className="h-10 w-10 text-muted-foreground" />
                      <div>
                        <h3 className="text-base font-semibold">No hay regiones</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Creá las regiones que querés usar para clasificar tus leads.
                        </p>
                      </div>
                      <Button size="sm" className="rounded-full mt-1" onClick={openNew}>
                        <Plus className="h-4 w-4 mr-2" />
                        Crear primera región
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                regions.map((region) => (
                  <TableRow key={region.id}>
                    <TableCell className="font-medium">{region.name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">{region.code}</TableCell>
                    <TableCell>
                      <Switch
                        checked={region.is_active}
                        onCheckedChange={() => handleToggleActive(region)}
                      />
                    </TableCell>
                    <TableCell className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(region)}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(region)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Región" : "Nueva Región"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Cambiá el nombre visible. El código interno no se modifica para preservar los leads existentes."
                : "El código interno se genera automáticamente a partir del nombre (ej: \"Norte de Europa\" → \"NORTE_DE_EUROPA\")."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="region-name">Nombre</Label>
              <Input
                id="region-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Norte de Europa"
                autoFocus
              />
            </div>
            {editing && (
              <div className="space-y-1.5">
                <Label>Código</Label>
                <Input value={editing.code} disabled className="font-mono text-xs" />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Guardando..." : editing ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
