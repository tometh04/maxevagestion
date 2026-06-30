import { cache } from "react"
import { createServerClient } from "@/lib/supabase/server"
import {
  ONBOARDING_SETTINGS_KEY,
  sanitizeOnboardingState,
  type PersistedOnboardingState,
} from "./steps"

// Lee el estado del onboarding a nivel organización desde organization_settings
// (KV por org, escribible por miembros vía RLS tenant_isolation).
//
// React.cache deduplica dentro del mismo request, así que layout + dashboard
// page comparten una sola query. Devuelve estado vacío (todo en false) si no
// hay fila todavía o si el JSON está corrupto.
export const getOrgOnboardingState = cache(
  async (orgId: string): Promise<PersistedOnboardingState> => {
    const supabase = await createServerClient()
    const { data } = await supabase
      .from("organization_settings")
      .select("value")
      // Cross-tenant: filtro explícito, no confiar en RLS.
      .eq("org_id", orgId)
      .eq("key", ONBOARDING_SETTINGS_KEY)
      .maybeSingle()

    const raw = (data as { value?: string } | null)?.value
    if (!raw) return sanitizeOnboardingState(null)
    try {
      return sanitizeOnboardingState(JSON.parse(raw))
    } catch {
      return sanitizeOnboardingState(null)
    }
  }
)
