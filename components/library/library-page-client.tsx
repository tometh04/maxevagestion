"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Search,
  BookOpen,
  MonitorPlay,
  Sparkles,
  GraduationCap,
  FileText,
  Settings2,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ResourceCard } from "@/components/library/resource-card"
import type { LibraryCategory, LibraryResource } from "@/lib/library/types"

// Iconos disponibles por nombre (columna icon de library_categories).
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen,
  MonitorPlay,
  Sparkles,
  GraduationCap,
  FileText,
}

interface LibraryPageClientProps {
  categories: LibraryCategory[]
  resources: LibraryResource[]
  canManage: boolean
}

export function LibraryPageClient({
  categories,
  resources,
  canManage,
}: LibraryPageClientProps) {
  const [query, setQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let result = resources
    if (selectedCategory) {
      result = result.filter((r) => r.category_id === selectedCategory)
    }
    if (query.trim().length >= 2) {
      const q = query.toLowerCase()
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q)
      )
    }
    return result
  }, [resources, query, selectedCategory])

  const activeCategory = categories.find((c) => c.id === selectedCategory)

  return (
    <div className="space-y-6">
      {/* Search + acción de gestión */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar material..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 h-11"
          />
        </div>
        {canManage && (
          <Button asChild variant="outline" className="gap-2 shrink-0">
            <Link href="/library/admin">
              <Settings2 className="h-4 w-4" />
              Gestionar
            </Link>
          </Button>
        )}
      </div>

      {/* Grid de categorías (filtro) */}
      {categories.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {categories.map((cat) => {
            const Icon = (cat.icon && ICON_MAP[cat.icon]) || BookOpen
            const count = resources.filter((r) => r.category_id === cat.id).length
            const isActive = selectedCategory === cat.id
            return (
              <Card
                key={cat.id}
                className={`cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm ${
                  isActive ? "border-primary ring-1 ring-primary/30" : ""
                }`}
                onClick={() =>
                  setSelectedCategory(isActive ? null : cat.id)
                }
              >
                <CardHeader className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm">{cat.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {count} {count === 1 ? "recurso" : "recursos"}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            )
          })}
        </div>
      )}

      {/* Filtro activo */}
      {activeCategory && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            {activeCategory.name}
            <button
              onClick={() => setSelectedCategory(null)}
              className="ml-1 hover:text-destructive"
              aria-label="Quitar filtro"
            >
              &times;
            </button>
          </Badge>
          <span className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "recurso" : "recursos"}
          </span>
        </div>
      )}

      {/* Grilla de recursos / empty state */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">
            {resources.length === 0
              ? "Todavía no hay material de capacitación."
              : "No encontramos material con esos filtros."}
          </p>
          {canManage && resources.length === 0 && (
            <Button asChild variant="link" className="mt-2">
              <Link href="/library/admin">Cargar el primer material</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((resource) => (
            <ResourceCard key={resource.id} resource={resource} />
          ))}
        </div>
      )}
    </div>
  )
}
