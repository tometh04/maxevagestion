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
            Emilia prepara un borrador con los datos del lead. Revisá que incluya origen, destino,
            fechas o noches, pasajeros y las preferencias que cambian la búsqueda.
          </p>
          <p className="rounded-lg bg-background/70 px-3 py-2 text-xs leading-relaxed text-foreground/80">
            <span className="font-medium text-foreground">Ejemplo: </span>
            Quiero un vuelo ida y vuelta de Buenos Aires a Cancún, del 10 al 17 de octubre, para 2 adultos
            con carry on; hotel all inclusive de 4 estrellas o más.
          </p>
        </div>
      </div>
    </section>
  )
}
