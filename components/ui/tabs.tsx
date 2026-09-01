"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"
import { trackViewOpened } from "@/lib/analytics/view-tracking"

/**
 * `Tabs` era un re-export pelado de Radix. Ahora además emite telemetría de vista.
 *
 * Por qué acá y no en cada pantalla: el pathname no alcanza para saber qué mira
 * la gente. `/reports` es UNA ruta con doce vistas atrás, `/operations/[id]`
 * tiene nueve, `/tools/settings` siete. Instrumentando este archivo quedan
 * cubiertos los 126 `TabsTrigger` del repo **y los que se agreguen después**,
 * sin una sola línea en los componentes. La alternativa era un hook en 31
 * archivos que se degrada en el primer PR en que alguien se olvide.
 *
 * Emite en mount además de en cada cambio: el 95% de los `<Tabs>` del repo son
 * no controlados (`defaultValue` sin `onValueChange`), y para esos el handler
 * nunca dispara para la vista inicial — que es justo la más vista de todas.
 *
 * `screens.ts` dedupea por 2 s, así que el mount y el primer cambio no cuentan
 * doble, y los tabs anidados que remontan tampoco.
 *
 * Radix ya trae `"use client"` en su dist, así que el `"use client"` de arriba
 * no cambia nada del árbol server/client: el único server component que importa
 * `Tabs` (`app/(dashboard)/my/balance/page.tsx`) le pasa solo props serializables.
 */
const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ onValueChange, ...props }, ref) => {
  const initialView = props.value ?? props.defaultValue

  React.useEffect(() => {
    if (initialView) trackViewOpened("tab", initialView)
  }, [initialView])

  const handleValueChange = React.useCallback(
    (value: string) => {
      trackViewOpened("tab", value)
      onValueChange?.(value)
    },
    [onValueChange]
  )

  return <TabsPrimitive.Root ref={ref} onValueChange={handleValueChange} {...props} />
})
Tabs.displayName = TabsPrimitive.Root.displayName

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // `max-w-full flex-wrap` hace que la barra pase a una segunda fila cuando
      // hay más tabs de los que entran a lo ancho (Reportes, etc.) en vez de
      // cortarse: así se ven y se pueden clickear todos sin scroll ni hovers
      // escondidos. Con pocos tabs se comporta igual que antes (una sola fila
      // del ancho de su contenido). `justify-start` alinea las filas a la
      // izquierda. Mismo criterio que ya usa la pantalla de Configuración.
      "inline-flex flex-wrap items-center justify-start bg-transparent border-b border-border/40 rounded-none p-0 h-auto gap-0 text-muted-foreground max-w-full",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground/70 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-foreground/80",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }

