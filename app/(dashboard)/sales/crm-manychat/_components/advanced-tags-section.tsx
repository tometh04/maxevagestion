"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tag as TagIcon, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { TagAssignmentDialog } from "./tag-assignment-dialog"

const COLOR_MAP: Record<string, string> = {
  red: "bg-red-100 text-red-800 border-red-300",
  green: "bg-green-100 text-green-800 border-green-300",
  purple: "bg-purple-100 text-purple-800 border-purple-300",
  orange: "bg-orange-100 text-orange-800 border-orange-300",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-300",
  blue: "bg-blue-100 text-blue-800 border-blue-300",
  gray: "bg-gray-100 text-gray-800 border-gray-300",
}

function getColorClass(color: string | null | undefined): string {
  return COLOR_MAP[color ?? "gray"] ?? COLOR_MAP.gray
}

type Tag = {
  id: string
  label: string
  category: { name: string; color: string | null }
}

type Props = {
  orgId: string
  leadId: string
  currentTags: Tag[]
  onSaved?: () => void
}

/**
 * Sección de tags inline para mostrar dentro del LeadDetailDialog en modo
 * advanced (VICO). Renderiza las tags actuales del lead agrupadas por
 * categoría + botón "Editar etiquetas" que abre el TagAssignmentDialog
 * para modificar.
 *
 * NOTA: este componente solo se monta cuando el LeadDetailDialog recibe el
 * prop opcional `tagsSection`. Lozada nunca lo pasa → este código no corre
 * en su CRM.
 */
export function AdvancedTagsSection({ orgId, leadId, currentTags, onSaved }: Props) {
  const [editOpen, setEditOpen] = useState(false)

  // Agrupar tags por categoría
  const byCategory = currentTags.reduce<Record<string, Tag[]>>((acc, t) => {
    const k = t.category.name
    if (!acc[k]) acc[k] = []
    acc[k].push(t)
    return acc
  }, {})

  const categoryNames = Object.keys(byCategory)

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <TagIcon className="h-4 w-4 text-muted-foreground" />
            Etiquetas
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditOpen(true)}
            className="h-7 gap-1"
          >
            <Pencil className="h-3 w-3" />
            Editar
          </Button>
        </div>

        {currentTags.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sin etiquetas asignadas. Tocá &quot;Editar&quot; para agregar.
          </p>
        ) : (
          <div className="space-y-2.5">
            {categoryNames.map((catName) => {
              const tags = byCategory[catName]
              const catColor = tags[0]?.category.color
              return (
                <div key={catName}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    {catName}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {tags.map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className={cn(
                          "text-[11px] px-2 py-0.5 border",
                          getColorClass(catColor)
                        )}
                      >
                        {tag.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <TagAssignmentDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        orgId={orgId}
        leadId={leadId}
        onSaved={onSaved}
      />
    </>
  )
}
