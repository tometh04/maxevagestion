import { Suspense } from "react"
import { getCategories, getAllArticles } from "@/lib/support/kb"
import { KbPageClient } from "@/components/ayuda/kb-page-client"

export const metadata = {
  title: "Centro de Ayuda | Vibook",
}

export default async function AyudaPage() {
  const [categories, articles] = await Promise.all([
    getCategories(),
    getAllArticles(),
  ])

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Centro de Ayuda</h1>
        <p className="text-muted-foreground mt-1">
          Encontrá respuestas a las preguntas más frecuentes sobre Vibook
        </p>
      </div>

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando...</div>}>
        <KbPageClient categories={categories} articles={articles} />
      </Suspense>
    </div>
  )
}
