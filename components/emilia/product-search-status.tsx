import type { ProductState } from "@/lib/emilia/progressive-turn"

export function ProductSearchStatus({ product, state }: {
  product: "flights" | "hotels"
  state?: ProductState
}) {
  if (!state || state === "available") return null
  const label = product === "flights" ? "vuelos" : "hoteles"
  return (
    <div className="space-y-2 py-2" role="status" aria-live="polite">
      <p className="text-sm text-muted-foreground">
        {state === "searching" ? `Buscando ${label}…`
          : state === "failed" ? `No pudimos completar la búsqueda de ${label}.`
          : `No encontramos ${label} para este pedido.`}
      </p>
      {state === "searching" && (
        <div aria-hidden="true" className="space-y-2 rounded-lg border border-border p-4 motion-safe:animate-pulse">
          <div className="h-3 w-2/5 rounded bg-muted" />
          <div className="h-3 w-3/5 rounded bg-muted" />
        </div>
      )}
    </div>
  )
}
