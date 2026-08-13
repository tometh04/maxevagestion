"use client"

// Pageviews manuales y normalizados.
//
// GA4 los manda solos (config + Enhanced Measurement), pero con la URL cruda:
// eso implica un page_path distinto por operacion (/operations/<uuid>) y, peor,
// mandarle a Google el buscador del admin (`?q=<nombre|CUIT|email>`). Por eso el
// config va con `send_page_view: false` y el hit lo armamos aca.
//
// Usa `useSearchParams()`, asi que el sitio de montaje tiene que envolverlo en
// <Suspense> para no forzar el CSR-bailout de Next.

import { useEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"

import { normalizePath, normalizeQuery } from "@/lib/analytics/ga/paths"
import { setPageContext, trackPageView } from "@/lib/analytics/ga/track"
import { moduleFromPath } from "@/lib/analytics/modules"
import { trackEvent } from "@/lib/analytics/track"

export function AnalyticsPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const lastSent = useRef<string | null>(null)

  // La dependencia es la clave YA normalizada, no la URL cruda. Dos efectos:
  // no se re-emite en renders sin navegacion real, y el debounce del buscador
  // (`?q=J` -> `?q=Ju` -> ...) colapsa a la misma clave en vez de mandar un
  // page_view por tecla.
  const search = searchParams?.toString() ?? ""
  const key = `${normalizePath(pathname)}${normalizeQuery(search)}`

  useEffect(() => {
    if (lastSent.current === key) return
    lastSent.current = key
    setPageContext()
    trackPageView(pathname ?? "/", search)

    // Mismo hit de navegacion, otro sink. GA recibe el page_view con la ruta
    // normalizada; la DB recibe el modulo, que es la unidad con la que se lee el
    // mapa de calor. Es el unico emisor de `module_viewed`: sin esto, el mapa
    // solo ve escrituras y quien entra todos los dias a mirar reportes figura
    // como inactivo.
    const productModule = moduleFromPath(pathname)
    if (productModule) trackEvent("module_viewed", { module: productModule })
    // `pathname`/`search` se leen para armar el hit, pero la identidad del efecto
    // es la clave normalizada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return null
}
