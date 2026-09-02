/**
 * Sincronizar el importe de la suscripción con Mercado Pago cuando cambian los
 * complementos.
 *
 * MP no tiene concepto de items: un preapproval es UN `transaction_amount`. Así
 * que el importe que se empuja es siempre el TOTAL recalculado
 * (`plan base + complementos`), nunca un delta — un delta se desincronizaría en
 * cuanto cambie el precio del plan por otro lado.
 *
 * La regla más importante de este módulo:
 *
 *   UNA ALTA SELF-SERVE NUNCA DISPARA CANCEL+RECREATE EN MP.
 *
 * `applyPriceChange` cancela y recrea el preapproval cuando el aumento supera el
 * 20%, y los tres callers que ya existen dejan la org en PAST_DUE cuando eso
 * pasa (ver app/api/admin/orgs/[id]/change-plan/route.ts). Para alguien que solo
 * prendió un complemento eso significaría perder el acceso al ERP entero por
 * comprar más. Cuando el cambio cruza el umbral y no hay autorización explícita,
 * no se llama a MP: la org queda en PENDING_REAUTH y el cliente decide.
 *
 * INVARIANTE: este módulo NUNCA escribe `organizations.subscription_status`.
 */
import { computeAddonsMonthlyArs, computeSubscriptionTotalArs } from "@/lib/addons/pricing"
import { resolveAddonEntitlements } from "@/lib/addons/entitlements"
import { shouldRequireMpReauth } from "@/lib/billing/custom-plans"
import { applyPriceChange } from "@/lib/billing/mp-update"
import { getPlanPricing } from "@/lib/billing/plan-pricing"
import type { MrrCustomPlan, MrrOrg } from "@/lib/billing/effective-price"

export type AddonSyncOutcome =
  | { kind: "NO_CHANGE"; targetAmountArs: number }
  /** La org no cobra por MP (la mayoría hoy): se factura a mano. */
  | { kind: "NO_MP"; targetAmountArs: number; note: string }
  | { kind: "UPDATED_IN_PLACE"; targetAmountArs: number }
  | { kind: "REAUTH_PENDING"; targetAmountArs: number; checkoutUrl: string; newPreapprovalId: string }
  /** Cruza el umbral y nadie autorizó re-autorizar: no se tocó MP. */
  | { kind: "DEFERRED"; reason: "EXCEEDS_THRESHOLD"; targetAmountArs: number; currentAmountArs: number }

export interface SyncAddonsOptions {
  /** Solo el admin puede forzar el camino de re-autorización, mirando la pantalla. */
  allowReauth: boolean
  source: "self_serve" | "admin" | "cron"
  actorUserId?: string | null
}

const ORG_COLUMNS =
  "id, plan, subscription_status, custom_plan_id, manual_mrr_override_ars, " +
  "agreed_plan_price_ars, agreed_plan_id, mp_preapproval_id, billing_email, " +
  "addons_mp_synced_amount_ars, current_period_ends_at"

/**
 * Recalcula el total y lo empuja a MP si corresponde. Devuelve qué pasó, sin
 * escribir `subscription_status` en ningún caso.
 */
export async function syncAddonsToMp(
  admin: any,
  orgId: string,
  opts: SyncAddonsOptions
): Promise<AddonSyncOutcome> {
  const [{ data: org }, planPrices] = await Promise.all([
    admin.from("organizations").select(ORG_COLUMNS).eq("id", orgId).maybeSingle(),
    getPlanPricing(admin),
  ])
  if (!org) throw new Error(`syncAddonsToMp: organización ${orgId} no encontrada`)

  const [{ data: customPlan }, { data: catalog }, { data: inclusions }, { data: rows }] =
    await Promise.all([
      org.custom_plan_id
        ? admin
            .from("custom_plans")
            .select("base_price_ars, discount_percent, discount_ends_at")
            .eq("id", org.custom_plan_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from("subscription_addons")
        .select("addon_key, price_ars_monthly, active, enforcement, sort_order"),
      admin
        .from("subscription_addon_plan_inclusions")
        .select("addon_key, plan_id, included_until"),
      admin
        .from("organization_addons")
        .select(
          "addon_key, status, price_ars_monthly_snapshot, price_source, " +
            "billable_from, cancel_effective_at"
        )
        .eq("org_id", orgId),
    ])

  const entitlements = resolveAddonEntitlements({
    plan: org.plan,
    hasCustomPlan: Boolean(org.custom_plan_id),
    catalog: catalog ?? [],
    inclusions: inclusions ?? [],
    orgRows: rows ?? [],
  })

  // Lo que se va a cobrar en el próximo débito: es el horizonte correcto porque
  // el cambio impacta desde el próximo ciclo, sin prorrateo.
  const total = computeSubscriptionTotalArs({
    org: org as MrrOrg,
    customPlan: (customPlan ?? null) as MrrCustomPlan | null,
    planPrices,
    entitlements,
    horizon: "next_cycle",
  })
  const targetAmountArs = total.totalArs
  const addonsArs = total.addonsSuppressedByOverride
    ? 0
    : computeAddonsMonthlyArs(entitlements, "next_cycle")

  const syncedAddons = Number(org.addons_mp_synced_amount_ars ?? 0)

  // Sin preapproval no hay nada que empujar. Es el caso de la MAYORÍA de las
  // orgs activas hoy: se les factura a mano. Se registra el monto igual para que
  // el sugerido de "registrar pago" en admin lo tome.
  if (!org.mp_preapproval_id) {
    await persistSync(admin, orgId, {
      addonsArs,
      state: "NOT_APPLICABLE",
      touchSyncedAt: true,
    })
    return {
      kind: "NO_MP",
      targetAmountArs,
      note: "La cuenta no cobra por Mercado Pago: el nuevo importe se factura manualmente.",
    }
  }

  if (addonsArs === syncedAddons) {
    return { kind: "NO_CHANGE", targetAmountArs }
  }

  // Monto vigente conocido = base + lo que ya está sincronizado.
  const currentAmountArs = total.baseArs + syncedAddons

  // Precomprobación con la MISMA regla pura que usa applyPriceChange, para no
  // tocar MP cuando sabemos que iba a exigir cancel+recreate.
  if (!opts.allowReauth && shouldRequireMpReauth(currentAmountArs, targetAmountArs)) {
    await persistSync(admin, orgId, {
      // No se movió el importe en MP: lo sincronizado sigue siendo lo viejo.
      addonsArs: syncedAddons,
      state: "PENDING_REAUTH",
      touchSyncedAt: false,
    })
    return {
      kind: "DEFERRED",
      reason: "EXCEEDS_THRESHOLD",
      targetAmountArs,
      currentAmountArs,
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibook.ai"
  const result = await applyPriceChange({
    preapprovalId: org.mp_preapproval_id,
    currentAmount: currentAmountArs,
    newAmount: targetAmountArs,
    recreateParams: {
      orgId,
      plan: "CUSTOM",
      payerEmail: org.billing_email ?? "",
      backUrl: `${appUrl}/settings/subscription/addons?reauth=1`,
      customAmount: targetAmountArs,
      customReason: "Vibook — plan y complementos",
      includeFreeTrial: false,
    } as any,
  })

  if (result.action === "UPDATED_IN_PLACE") {
    await persistSync(admin, orgId, { addonsArs, state: "SYNCED", touchSyncedAt: true })
    return { kind: "UPDATED_IN_PLACE", targetAmountArs }
  }

  if (result.action === "NO_PREAPPROVAL") {
    await persistSync(admin, orgId, {
      addonsArs,
      state: "NOT_APPLICABLE",
      touchSyncedAt: true,
    })
    return {
      kind: "NO_MP",
      targetAmountArs,
      note: "Mercado Pago no tiene una suscripción activa para esta cuenta.",
    }
  }

  // REAUTH_REQUIRED: applyPriceChange ya creó el preapproval nuevo y canceló el
  // viejo. Se guarda el id nuevo, pero el importe NO se da por sincronizado
  // hasta que el cliente autorice. Y no se toca subscription_status.
  await admin
    .from("organizations")
    .update({
      mp_preapproval_id: result.newPreapprovalId,
      addons_mp_sync_state: "PENDING_REAUTH",
    })
    .eq("id", orgId)

  return {
    kind: "REAUTH_PENDING",
    targetAmountArs,
    checkoutUrl: result.checkoutUrl ?? "",
    newPreapprovalId: result.newPreapprovalId ?? "",
  }
}

async function persistSync(
  admin: any,
  orgId: string,
  input: { addonsArs: number; state: string; touchSyncedAt: boolean }
): Promise<void> {
  const patch: Record<string, unknown> = {
    addons_mp_synced_amount_ars: input.addonsArs,
    addons_mp_sync_state: input.state,
  }
  if (input.touchSyncedAt) patch.addons_mp_synced_at = new Date().toISOString()
  await admin.from("organizations").update(patch).eq("id", orgId)
}
