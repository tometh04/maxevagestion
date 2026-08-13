"use client"

// Loader de Google Analytics 4.
//
// Se monta una sola vez en `app/layout.tsx`. Espeja el idiom de
// `components/perf-nav-logger.tsx`: client component chico, gateado por env,
// que devuelve null.
//
// La exclusion de `/cotizacion/*` se hace ACA, con `usePathname()`, antes de
// renderizar ningun <Script>. Como `usePathname()` funciona durante el render
// server de un client component, el snippet de gtag ni siquiera aparece en el
// HTML de esas paginas: no queda inerte, queda ausente.
//
// Por que no leer `x-pathname` de los headers: `middleware.ts` setea ese header
// en la linea ~93 pero retorna antes, en la ~64, para `/cotizacion/*` — y
// tambien para el bypass DISABLE_AUTH, para el branch de envs placeholder y para
// el webhook de manychat. "Falta el header" significa cuatro cosas distintas y
// ningun default es seguro.

// Este componente solo carga gtag.js. El `js` + `config` los encola
// `lib/analytics/ga/track.ts`: `next/script` inyecta los scripts inline recien
// despues de la hidratacion, asi que un config inline competiria con el primer
// page_view y se perderia. Ver `ensureBootstrap()` ahi.

import Script from "next/script"
import { usePathname } from "next/navigation"

import { GA_MEASUREMENT_ID, isGaEnabled } from "@/lib/analytics/ga/config"
import { isAnalyticsEnabledPath } from "@/lib/analytics/ga/paths"

export function GoogleAnalytics() {
  const pathname = usePathname()

  if (!isGaEnabled()) return null
  if (!isAnalyticsEnabledPath(pathname)) return null

  return (
    <Script
      id="ga-loader"
      strategy="afterInteractive"
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
    />
  )
}
