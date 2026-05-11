"use client"
import { useEffect } from "react"

/**
 * BrandProvider — aplica el color primario del tenant al CSS root.
 *
 * Multi-tenant: el cache localStorage SIEMPRE va scopeado por org_id.
 * Bug 2026-05-06: la versión previa escribía `brand_color`, `brand_logo` y
 * `company_name` como keys globales. Si un usuario alternaba entre tenants
 * (mismo browser), el branding del anterior persistía en el siguiente.
 *
 * NOTA: el primer paint NO tiene cache disponible (no sabemos el orgId
 * todavía), así que aceptamos un sub-100ms flash al default antes de
 * aplicar el color del tenant. Es preferible al cross-tenant leak.
 */
export function BrandProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false
    async function loadBranding() {
      try {
        const res = await fetch("/api/settings/organization")
        if (!res.ok || cancelled) return
        const json = await res.json()
        const rows: Array<{ key: string; value: string; org_id: string }> =
          Array.isArray(json?.data) ? json.data : []
        const orgId = rows[0]?.org_id ?? null
        const settings: Record<string, string> = {}
        rows.forEach((r) => {
          settings[r.key] = r.value
        })

        if (cancelled) return

        if (settings.brand_color) {
          document.documentElement.style.setProperty(
            "--primary",
            settings.brand_color
          )
        }

        // Cache scoped por org_id. El sidebar y otros consumers leen sus
        // propias keys scoped (ver components/app-sidebar.tsx). Mantenemos
        // brand_color acá para que el siguiente render del MISMO tenant
        // tenga el color sin flash.
        if (orgId) {
          if (settings.brand_color) {
            localStorage.setItem(`brand_color:${orgId}`, settings.brand_color)
          } else {
            localStorage.removeItem(`brand_color:${orgId}`)
          }
        }

        // Limpieza one-shot del cache global legacy (pre-fix). Garantiza
        // que cualquier user que cargue esta versión ya no arrastre branding
        // de un tenant anterior.
        localStorage.removeItem("brand_color")
        localStorage.removeItem("brand_logo")
        localStorage.removeItem("company_name")
      } catch {
        // silent — sin cache es preferible a cache stale cross-tenant
      }
    }

    loadBranding()
    return () => {
      cancelled = true
    }
  }, [])

  return <>{children}</>
}
