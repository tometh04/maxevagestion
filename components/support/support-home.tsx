"use client"

import { useState, useCallback, useEffect } from "react"
import {
  Search, BookOpen, MessageCircle, ChevronRight, FileText,
  Clock, LifeBuoy, Sparkles, History,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { WidgetView } from "./support-widget"

interface SearchResult {
  id: string
  title: string
  slug: string
  summary: string
  category_name: string
}

const POPULAR_ARTICLES = [
  { title: "Crear una operación", slug: "crear-operacion" },
  { title: "Registrar un cobro", slug: "registrar-cobro" },
  { title: "Asignar pago a operación", slug: "asignar-pago-operacion" },
  { title: "Crear un cliente", slug: "crear-cliente" },
  { title: "Ver estado de caja", slug: "estado-caja" },
]

interface RecentConversation {
  id: string
  title: string
  updated_at: string
  last_message: { content: string } | null
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "ahora"
  if (diffMin < 60) return `${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}d`
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" })
}

interface SupportHomeProps {
  onNavigate: (view: WidgetView) => void
}

export function SupportHome({ onNavigate }: SupportHomeProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [recentConvos, setRecentConvos] = useState<RecentConversation[]>([])

  useEffect(() => {
    fetch("/api/support/conversations")
      .then((res) => res.json())
      .then((data) => setRecentConvos((data.conversations || []).slice(0, 3)))
      .catch(() => {})
  }, [])

  const handleSearch = useCallback(
    async (q: string) => {
      setQuery(q)
      if (q.trim().length < 2) {
        setResults([])
        setSearched(false)
        return
      }

      setSearching(true)
      setSearched(true)
      try {
        const res = await fetch(
          `/api/support/search?q=${encodeURIComponent(q.trim())}`
        )
        const data = await res.json()
        setResults(data.results || [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    },
    []
  )

  // Debounce manual
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null)
  const onInputChange = (value: string) => {
    setQuery(value)
    if (timer) clearTimeout(timer)
    const t = setTimeout(() => handleSearch(value), 300)
    setTimer(t)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar en la ayuda..."
            value={query}
            onChange={(e) => onInputChange(e.target.value)}
            className="pl-9 h-9"
            autoFocus
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Search results */}
          {searched && (
            <div className="space-y-1">
              {searching ? (
                <p className="text-sm text-muted-foreground px-2 py-4 text-center">
                  Buscando...
                </p>
              ) : results.length > 0 ? (
                results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() =>
                      onNavigate({ screen: "article", slug: r.slug })
                    }
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-accent transition-colors group"
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary">
                          {r.title}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {r.summary}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground px-2 py-4 text-center">
                  No encontramos resultados para &ldquo;{query}&rdquo;
                </p>
              )}
            </div>
          )}

          {/* Default content — when not searching */}
          {!searched && (
            <>
              {/* Primary CTAs */}
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto py-3 border-primary/20 hover:border-primary/40"
                  onClick={() => onNavigate({ screen: "chat" })}
                >
                  <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">Chatear con IA</p>
                    <p className="text-[11px] text-muted-foreground">Respuestas instantáneas 24/7</p>
                  </div>
                  <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto py-2.5"
                  onClick={() => onNavigate({ screen: "ticket" })}
                >
                  <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                    <LifeBuoy className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">Crear ticket</p>
                    <p className="text-[11px] text-muted-foreground">Contactá al equipo de soporte</p>
                  </div>
                  <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto py-2.5"
                  onClick={() => onNavigate({ screen: "my-tickets" })}
                >
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">Mis tickets</p>
                    <p className="text-[11px] text-muted-foreground">Ver estado y respuestas</p>
                  </div>
                  <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                </Button>
              </div>

              {/* Recent conversations */}
              {recentConvos.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Conversaciones recientes
                      </h4>
                    </div>
                    <button
                      onClick={() => onNavigate({ screen: "conversations" })}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Ver todas
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {recentConvos.map((c) => (
                      <button
                        key={c.id}
                        onClick={() =>
                          onNavigate({ screen: "chat", conversationId: c.id })
                        }
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate group-hover:text-primary">
                              {c.title || "Sin título"}
                            </p>
                            {c.last_message && (
                              <p className="text-[11px] text-muted-foreground truncate">
                                {c.last_message.content}
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatDate(c.updated_at)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Popular articles */}
              <div>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Artículos populares
                  </h4>
                </div>
                <div className="space-y-0.5">
                  {POPULAR_ARTICLES.map((article) => (
                    <button
                      key={article.slug}
                      onClick={() =>
                        onNavigate({
                          screen: "article",
                          slug: article.slug,
                        })
                      }
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent transition-colors group flex items-center gap-2"
                    >
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm group-hover:text-primary truncate">
                        {article.title}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Browse all */}
              <div className="pt-2">
                <a
                  href="/ayuda"
                  className="text-xs text-primary hover:underline flex items-center gap-1 px-1"
                >
                  <BookOpen className="h-3 w-3" />
                  Ver todos los artículos de ayuda
                </a>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
