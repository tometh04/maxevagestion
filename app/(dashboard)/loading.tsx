import Image from "next/image"
import { Skeleton } from "@/components/ui/skeleton"

// Suspense boundary global del dashboard. Al click en sidebar, App Router
// muestra esto inmediatamente (URL cambia ya), mientras el server arma el
// RSC del page destino. Sin esto, el browser queda en la página previa
// hasta que el server termina todo el árbol.
//
// Pendientes 2.3 — antes era sólo skeletons. Ahora muestra logo Vibook
// pulsante + texto "Cargando…" arriba para que se sienta brandeado y dé
// feedback explícito de que algo está pasando (vs skeletons fríos).
export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center py-8">
        <div className="relative h-12 w-32 animate-pulse">
          <Image
            src="/vibook-logo.png"
            alt="Vibook"
            fill
            sizes="128px"
            className="object-contain"
            priority
          />
        </div>
        <p className="mt-3 text-sm text-muted-foreground animate-pulse">Cargando…</p>
      </div>
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
