import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { getLinearDiagnostics } from "@/lib/integrations/linear"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/integrations/linear/diagnostics
 *
 * Solo platform admin. Diagnostica por qué los tickets bug/mejora no llegan a
 * Linear: reporta env vars presentes (sin valores), valida la API key, y lista
 * los teams con su UUID real para verificar LINEAR_TEAM_ID.
 */
export async function GET() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const diagnostics = await getLinearDiagnostics()
  return NextResponse.json(diagnostics)
}
