/**
 * Lectura de complementos desde DB. La lógica vive en `entitlements.ts` (pura);
 * acá solo está el I/O.
 *
 * Cacheado con `React.cache` igual que `resolveUserPermissions`: el layout del
 * dashboard, las páginas y las rutas de API lo llaman dentro del mismo request
 * sin re-fetchear.
 */
import { cache } from "react"

import {
  resolveAddonEntitlements,
  type AddonCatalogRow,
  type AddonEntitlementMap,
  type AddonInclusionRow,
  type OrganizationAddonRow,
} from "@/lib/addons/entitlements"

/**
 * Resuelve los complementos de una org.
 *
 * FALLA ABIERTO a propósito: ante cualquier error devuelve el mapa "todo
 * habilitado". Esto es la capa de FACTURACIÓN, no de autorización — cortarle la
 * app entera a un tenant porque falló un SELECT sería mucho peor que no cobrar
 * un complemento un mes. La autorización real (permisos, `org_id`, RLS) sigue
 * intacta debajo y no depende de esto.
 *
 * NO usar `hasAddon()` para proteger datos.
 */
export const resolveOrgAddons = cache(
  async (supabase: any, orgId: string | null | undefined): Promise<AddonEntitlementMap> => {
    const failOpen = () =>
      resolveAddonEntitlements({
        plan: null,
        hasCustomPlan: false,
        catalog: null,
        inclusions: null,
        orgRows: null,
      })

    if (!orgId) return failOpen()

    try {
      const [orgRes, catalogRes, inclusionsRes, rowsRes] = await Promise.all([
        supabase
          .from("organizations")
          .select("plan, custom_plan_id")
          .eq("id", orgId)
          .maybeSingle(),
        supabase
          .from("subscription_addons")
          .select("addon_key, price_ars_monthly, active, enforcement, sort_order"),
        supabase
          .from("subscription_addon_plan_inclusions")
          .select("addon_key, plan_id, included_until"),
        supabase
          .from("organization_addons")
          .select(
            "addon_key, status, price_ars_monthly_snapshot, price_source, " +
              "billable_from, cancel_effective_at, requested_at, activated_at"
          )
          .eq("org_id", orgId),
      ])

      if (orgRes.error || catalogRes.error || inclusionsRes.error || rowsRes.error) {
        console.error("[addons] error resolviendo complementos:", {
          orgId,
          org: orgRes.error?.message,
          catalog: catalogRes.error?.message,
          inclusions: inclusionsRes.error?.message,
          rows: rowsRes.error?.message,
        })
        return failOpen()
      }

      return resolveAddonEntitlements({
        plan: (orgRes.data?.plan as string | null) ?? null,
        hasCustomPlan: Boolean(orgRes.data?.custom_plan_id),
        catalog: (catalogRes.data ?? []) as AddonCatalogRow[],
        inclusions: (inclusionsRes.data ?? []) as AddonInclusionRow[],
        orgRows: (rowsRes.data ?? []) as OrganizationAddonRow[],
      })
    } catch (err) {
      console.error("[addons] excepción resolviendo complementos:", { orgId, err })
      return failOpen()
    }
  }
)
