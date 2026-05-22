"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase/client"

type Tag = {
  id: string
  label: string
}

type Category = {
  id: string
  name: string
  color: string | null
  cardinality: string
  tags: Tag[]
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  leadId: string
  onSaved?: () => void
}

export function TagAssignmentDialog({ open, onOpenChange, orgId, leadId, onSaved }: Props) {
  

  const [categories, setCategories] = useState<Category[]>([])
  const [assigned, setAssigned] = useState<Set<string>>(new Set())
  const [allTagIds, setAllTagIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return

    async function load() {
      setLoading(true)
      const [catsResult, assignmentsResult] = await Promise.all([
        supabase
          .from("lead_tag_categories")
          .select("id, name, color, cardinality, lead_tags(id, label)")
          .eq("org_id", orgId)
          .order("display_order", { ascending: true }),
        supabase
          .from("lead_tag_assignments")
          .select("tag_id")
          .eq("lead_id", leadId),
      ])

      const cats: Category[] = (catsResult.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        cardinality: c.cardinality,
        tags: (c.lead_tags as Tag[] | null) ?? [],
      }))

      setCategories(cats)
      setAllTagIds(cats.flatMap((c) => c.tags.map((t) => t.id)))
      setAssigned(new Set((assignmentsResult.data ?? []).map((a) => a.tag_id)))
      setLoading(false)
    }

    load()
  }, [open, orgId, leadId])

  function toggle(category: Category, tagId: string) {
    const next = new Set(assigned)

    if (category.cardinality === "one") {
      // Clear all tags in this category first
      for (const t of category.tags) {
        next.delete(t.id)
      }
      // Then add the clicked one (unless it was already selected — deselect it)
      if (!assigned.has(tagId)) {
        next.add(tagId)
      }
    } else {
      if (next.has(tagId)) {
        next.delete(tagId)
      } else {
        next.add(tagId)
      }
    }

    setAssigned(next)
  }

  async function handleSave() {
    setSaving(true)

    const toRemove = allTagIds.filter((id) => !assigned.has(id))

    if (toRemove.length > 0) {
      await supabase
        .from("lead_tag_assignments")
        .delete()
        .eq("lead_id", leadId)
        .in("tag_id", toRemove)
    }

    if (assigned.size > 0) {
      const upsertRows = Array.from(assigned).map((tag_id) => ({
        org_id: orgId,
        lead_id: leadId,
        tag_id,
      }))
      await supabase
        .from("lead_tag_assignments")
        .upsert(upsertRows, { onConflict: "lead_id,tag_id" })
    }

    setSaving(false)
    onSaved?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Etiquetas</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Cargando...</p>
        ) : (
          <div className="flex flex-col gap-4 py-2 max-h-[60vh] overflow-y-auto">
            {categories.map((category) => (
              <div key={category.id}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {category.name}
                </p>
                <div className="flex flex-wrap gap-2">
                  {category.tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={assigned.has(tag.id) ? "default" : "outline"}
                      className="cursor-pointer select-none"
                      onClick={() => toggle(category, tag.id)}
                    >
                      {tag.label}
                    </Badge>
                  ))}
                  {category.tags.length === 0 && (
                    <p className="text-xs text-muted-foreground">Sin etiquetas en esta categoría</p>
                  )}
                </div>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay categorías configuradas.</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
