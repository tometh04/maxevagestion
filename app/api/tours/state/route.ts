import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { sanitizeTourState } from "@/lib/tours/state"

/**
 * PATCH /api/tours/state
 *
 * Persiste el progreso de las guías in-app A NIVEL USUARIO, en
 * users.onboarding_state. A diferencia del setup inicial de la agencia
 * (organization_settings, ver app/api/onboarding/state/route.ts), "ya vi la
 * guía de operaciones" es un hecho de la persona, no de la empresa.
 *
 * La fila que se escribe ES la del usuario autenticado: el .eq("id", user.id)
 * explícito es la primera capa, la policy tenant_isolation de users
 * (WITH CHECK auth_id = auth.uid()) es la segunda. El body se sanitiza
 * descartando tourIds desconocidos y tipos inválidos.
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

  const state = sanitizeTourState(body)

  const supabase = await createServerClient()
  const { error } = await supabase
    .from("users")
    .update({ onboarding_state: state } as never)
    .eq("id", user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: state })
}
