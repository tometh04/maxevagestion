import { Skeleton } from "@/components/ui/skeleton"

// Suspense boundary global del dashboard. Al click en sidebar, App Router
// muestra este skeleton inmediatamente (URL cambia ya), mientras el server
// arma el RSC del page destino. Sin esto, el browser queda en la página
// previa hasta que el server termina todo el árbol.
export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-64" />
      <div className="flex gap-3 flex-wrap">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 flex-1 min-w-[140px]" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[280px] w-full" />
        <Skeleton className="h-[280px] w-full" />
      </div>
      <Skeleton className="h-[320px] w-full" />
    </div>
  )
}
