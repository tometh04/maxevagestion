import { notFound } from "next/navigation"
import { getArticleBySlug, getRelatedArticles } from "@/lib/support/kb"
import { KbArticleView } from "@/components/ayuda/kb-article-view"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const article = await getArticleBySlug(slug)
  if (!article) return { title: "Artículo no encontrado | Vibook" }
  return {
    title: `${article.title} | Ayuda Vibook`,
    description: article.summary,
  }
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params
  const article = await getArticleBySlug(slug)

  if (!article) {
    notFound()
  }

  const related = await getRelatedArticles(article.category_id, article.id)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/ayuda" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          Centro de Ayuda
        </Link>
        {article.category_name && (
          <>
            <span>/</span>
            <span>{article.category_name}</span>
          </>
        )}
      </div>

      {/* Article */}
      <article>
        <h1 className="text-2xl font-bold tracking-tight mb-1">
          {article.title}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">{article.summary}</p>

        {/* Video tutorial */}
        {article.video_url && (
          <div className="mb-6">
            <div className="rounded-lg overflow-hidden border bg-black aspect-video">
              <video
                src={article.video_url}
                controls
                preload="metadata"
                className="w-full h-full"
                playsInline
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              🎬 Video tutorial — seguí los pasos del video o leé el artículo abajo
            </p>
          </div>
        )}

        <KbArticleView content={article.content} />
      </article>

      {/* Related articles */}
      {related.length > 0 && (
        <div className="border-t pt-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Artículos relacionados
          </h3>
          <div className="space-y-2">
            {related.map((r) => (
              <Link
                key={r.id}
                href={`/ayuda/${r.slug}`}
                className="block p-3 rounded-lg hover:bg-accent transition-colors"
              >
                <p className="text-sm font-medium hover:text-primary">
                  {r.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {r.summary}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
