import { Sparkles } from "lucide-react"

export function EmiliaPromptGuide() {
  return (
    <section
      role="note"
      aria-label="Cómo pedirle una cotización a Emilia"
      data-tour="emilia.prompt-guide"
      className="mx-auto max-w-2xl rounded-xl border border-border/60 bg-muted/30 p-4 text-left"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-foreground">Cómo pedirle una cotización a Emilia</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Podés buscar vuelos, hoteles o ambos. Incluí origen, destino, fechas y pasajeros;
            para hoteles también podés indicar régimen y categoría.
          </p>
          <ul className="space-y-1.5 rounded-lg bg-background/70 px-3 py-2 text-xs leading-relaxed text-foreground/80">
            <li>
              <span className="font-medium text-foreground">Vuelo: </span>
              Cotizá vuelos ida y vuelta de Buenos Aires a Cancún del 10 al 17 de octubre para 2 adultos.
            </li>
            <li>
              <span className="font-medium text-foreground">Hotel: </span>
              Cotizá hotel en Cancún del 10 al 17 de octubre para 2 adultos, all inclusive, de 4 estrellas o más.
            </li>
            <li>
              <span className="font-medium text-foreground">Vuelo + hotel: </span>
              Cotizá vuelo y hotel a Aruba saliendo desde Buenos Aires el 5 de diciembre y volviendo el 20, para 2 adultos.
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
