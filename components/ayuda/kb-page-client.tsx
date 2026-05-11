"use client"

import { useState, useMemo } from "react"
import { Search, BookOpen, FileText, ChevronRight, Plane, DollarSign, Users, Settings, BarChart3, ShoppingCart, Calculator, Bell, Play } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { KbCategory, KbArticle } from "@/lib/support/kb"
import Link from "next/link"

// Mapeo de iconos por nombre
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Plane,
  DollarSign,
  Users,
  Settings,
  BarChart3,
  ShoppingCart,
  Calculator,
  Bell,
  BookOpen,
  FileText,
}

interface KbPageClientProps {
  categories: KbCategory[]
  articles: KbArticle[]
}

export function KbPageClient({ categories, articles }: KbPageClientProps) {
  const [query, setQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // Filtrar artículos
  const filteredArticles = useMemo(() => {
    let result = articles

    if (selectedCategory) {
      result = result.filter((a) => a.category_slug === selectedCategory)
    }

    if (query.trim().length >= 2) {
      const q = query.toLowerCase()
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.content.toLowerCase().includes(q)
      )
    }

    return result
  }, [articles, query, selectedCategory])

  const showingResults = query.trim().length >= 2 || selectedCategory

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar artículos de ayuda..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 h-11"
        />
      </div>

      {/* Categories grid */}
      {!showingResults && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {categories.map((cat) => {
            const Icon = ICON_MAP[cat.icon] || BookOpen
            return (
              <Card
                key={cat.id}
                className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
                onClick={() => setSelectedCategory(cat.slug)}
              >
                <CardHeader className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm">{cat.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {cat.article_count}{" "}
                        {cat.article_count === 1 ? "artículo" : "artículos"}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            )
          })}
        </div>
      )}

      {/* Active filter */}
      {selectedCategory && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            {categories.find((c) => c.slug === selectedCategory)?.name}
            <button
              onClick={() => setSelectedCategory(null)}
              className="ml-1 hover:text-destructive"
            >
              &times;
            </button>
          </Badge>
          <span className="text-sm text-muted-foreground">
            {filteredArticles.length}{" "}
            {filteredArticles.length === 1 ? "artículo" : "artículos"}
          </span>
        </div>
      )}

      {/* Article list */}
      {showingResults && (
        <div className="space-y-1">
          {filteredArticles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">
                No encontramos artículos
                {query ? ` para "${query}"` : ""}
              </p>
            </div>
          ) : (
            filteredArticles.map((article) => (
              <Link
                key={article.id}
                href={`/ayuda/${article.slug}`}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors group"
              >
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium group-hover:text-primary truncate">
                      {article.title}
                    </p>
                    {article.video_url && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5 shrink-0">
                        <Play className="h-2.5 w-2.5" />
                        Video
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {article.summary}
                  </p>
                  {article.category_name && (
                    <p className="text-xs text-primary/70 mt-1">
                      {article.category_name}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
              </Link>
            ))
          )}
        </div>
      )}

      {/* All articles when nothing is filtered */}
      {!showingResults && articles.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Todos los artículos
          </h3>
          <div className="space-y-1">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/ayuda/${article.slug}`}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors group"
              >
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium group-hover:text-primary truncate">
                      {article.title}
                    </p>
                    {article.video_url && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5 shrink-0">
                        <Play className="h-2.5 w-2.5" />
                        Video
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {article.summary}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {article.category_name}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
