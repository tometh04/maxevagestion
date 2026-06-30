import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { ONBOARDING_SETTINGS_KEY, sanitizeOnboardingState } from "@/lib/onboarding/steps"

/**
 * PATCH /api/onboarding/state
 *
 * Persiste el progreso del onboarding de bienvenida A NIVEL ORGANIZACIÓN
 * (organization_settings, key=onboarding_state). Los pasos son hechos de la
 * agencia, así que el progreso se comparte entre todos sus admins: si uno
 * llegó al paso 3, otro admin no rehace los pasos previos.
 *
 * organization_settings es escribible por miembros del org vía RLS
 * (tenant_isolation FOR ALL). El body se sanitiza descartando keys desconocidas.
 */
export async function PATCH(request: Request) {
  const { user } = await getCurrentUser()
  if (!user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const state = sanitizeOnboardingState(body)

  const supabase = await createServerClient()
  const { error } = await supabase.from("organization_settings").upsert(
    {
      org_id: user.org_id, // Cross-tenant: la fila se escribe solo para el org del user.
      key: ONBOARDING_SETTINGS_KEY,
      value: JSON.stringify(state),
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "org_id,key" }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: state })
}
