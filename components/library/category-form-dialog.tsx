"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import type { LibraryCategory } from "@/lib/library/types"

const ICON_OPTIONS = [
  { value: "BookOpen", label: "Libro" },
  { value: "MonitorPlay", label: "Video / Sistema" },
  { value: "Sparkles", label: "Mejores prácticas" },
  { value: "GraduationCap", label: "Capacitación" },
  { value: "FileText", label: "Documento" },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  category?: LibraryCategory | null
}

export function CategoryFormDialog({ open, onOpenChange, onSaved, category }: Props) {
  const { toast } = useToast()
  const isEdit = Boolean(category)

  const [name, setName] = useState("")
  const [icon, setIcon] = useState("BookOpen")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(category?.name ?? "")
    setIcon(category?.icon ?? "BookOpen")
  }, [open, category])

  async function handleSubmit() {
    if (name.trim().length < 2) {
      toast({ title: "Poné un nombre de al menos 2 caracteres", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const url = isEdit
        ? `/api/library/categories/${category!.id}`
        : "/api/library/categories"
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), icon }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar")

      toast({ title: isEdit ? "Categoría actualizada" : "Categoría creada" })
      onSaved()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: "No pudimos guardar la categoría",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Nombre</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Manuales de vendedores"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Icono</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ICON_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
