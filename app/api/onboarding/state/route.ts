import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { sanitizeOnboardingState } from "@/lib/onboarding/steps"

/**
 * PATCH /api/onboarding/state
 *
 * Persiste el progreso del onboarding de bienvenida del usuario autenticado.
 * Cada usuario solo puede tocar su propia fila (`.eq("id", user.id)`), así que
 * no hay riesgo cross-tenant ni de escalación. El body se sanitiza descartando
 * keys desconocidas antes de guardar.
 */
export async function PATCH(request: Request) {
  const { user } = await getCurrentUser()
  if (!user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const state = sanitizeOnboardingState(body)

  const supabase = await createServerClient()
  const { error } = await supabase
    .from("users")
    .update({ onboarding_state: state } as never)
    .eq("id", user.id) // Solo la propia fila del usuario.

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: state })
}
