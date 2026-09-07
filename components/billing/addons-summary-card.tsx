import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { resolveOrgAddons } from "@/lib/addons/server"
import { ADDON_KEYS } from "@/lib/addons/catalog"
import { formatArs } from "@/lib/billing/plans"

/**
 * Resumen de complementos con link a la pantalla completa.
 *
 * Server Component: la resolución ya está cacheada con React.cache, así que
 * renderizarlo no agrega round-trips a la página de suscripción.
 *
 * Se monta en las DOS ramas de /settings/subscription, incluida la de custom
 * plan: una agencia con contrato propio también contrata adicionales.
 */
export async function AddonsSummaryCard({ supabase, orgId }: { supabase: any; orgId: string | null }) {
  const entitlements = await resolveOrgAddons(supabase, orgId)

  const contratados = ADDON_KEYS.map((k) => entitlements[k]).filter(
    (e) => e.state === "ACTIVE" || e.state === "SCHEDULED_CANCEL" || e.state === "INCLUDED"
  )
  const disponibles = ADDON_KEYS.filter((k) => entitlements[k].availableInCatalog).length

  // Sin catálogo publicado la sección no existe todavía: no mostramos una card
  // vacía que no lleva a ningún lado.
  if (disponibles === 0 && contratados.length === 0) return null

  const mensual = contratados.reduce((acc, e) => acc + e.priceArsMonthly, 0)

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div>
          <p className="text-sm font-medium">Complementos</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {contratados.length === 0
              ? `${disponibles} ${disponibles === 1 ? "disponible" : "disponibles"} para sumar a tu cuenta`
              : `${contratados.length} ${contratados.length === 1 ? "activo" : "activos"}${
                  mensual > 0 ? ` · ${formatArs(mensual)} por mes` : " · sin cargo"
                }`}
          </p>
        </div>
        <Link
          href="/addons"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          {contratados.length === 0 ? "Ver complementos" : "Administrar"}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  )
}
