import Image from "next/image"

// Suspense boundary global del dashboard. Al click en sidebar, App Router
// muestra esto inmediatamente (URL cambia ya), mientras el server arma el
// RSC del page destino. Sin esto, el browser queda en la página previa
// hasta que el server termina todo el árbol.
//
// Iteración 2026-05-06: pasamos de "skeletons + logo arriba" a un overlay
// flotante centrado con logo + backdrop blur. Razones:
//   1) Las páginas tienen layouts muy distintos (dashboard, /operations,
//      /customers, /accounting/*). Los skeletons del dashboard no calzaban
//      en ningún otro path y se veía feo flash de cajas grises.
//   2) UX más limpia: una sola animación brandeada que indica "está
//      cargando algo", no detalles del layout esperado.
//   3) `pointer-events-none` en la card asegura que el sidebar y el
//      header siguen recibiendo clicks (la URL ya cambió, pero el user
//      puede cancelar yendo a otro lado).
//
// El overlay no es full-screen: ocupa solo el área del main content
// (gracias a que loading.tsx es per-segment), así el sidebar se ve.
export default function DashboardLoading() {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-background/40 backdrop-blur-sm pointer-events-none">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/40 bg-card/80 px-10 py-8 shadow-lg backdrop-blur-md">
        <div className="relative h-14 w-36 animate-pulse">
          <Image
            src="/vibook-logo.png"
            alt="Vibook"
            fill
            sizes="144px"
            className="object-contain"
            priority
          />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">Cargando…</p>
      </div>
    </div>
  )
}
