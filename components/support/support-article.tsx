"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Loader2, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface ArticleData {
  title: string
  content: string
  category_name?: string
  updated_at?: string
}

interface SupportArticleProps {
  slug: string
  onBack: () => void
}

export function SupportArticle({ slug, onBack }: SupportArticleProps) {
  const [article, setArticle] = useState<ArticleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    fetch(`/api/support/articles/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found")
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setArticle(data.article)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !article) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <BookOpen className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No pudimos cargar este artículo.
        </p>
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Volver
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Article header */}
      <div className="px-4 py-3 border-b space-y-1">
        <button
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Volver
        </button>
        {article.category_name && (
          <p className="text-xs text-primary font-medium">
            {article.category_name}
          </p>
        )}
        <h2 className="text-base font-semibold leading-tight">
          {article.title}
        </h2>
      </div>

      {/* Article content */}
      <ScrollArea className="flex-1">
        <div className="p-4 prose prose-sm dark:prose-invert max-w-none prose-headings:text-sm prose-headings:font-semibold prose-p:text-sm prose-li:text-sm prose-p:leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {article.content}
          </ReactMarkdown>
        </div>
      </ScrollArea>

      {/* Footer — link to full page */}
      <div className="px-4 py-2 border-t">
        <a
          href={`/ayuda/${slug}`}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <BookOpen className="h-3 w-3" />
          Abrir en página completa
        </a>
      </div>
    </div>
  )
}
