import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import {
  agencyPermissionMode,
  resolveAgencyPermissionScope,
} from "@/lib/permissions/agency-scope-server"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const querySchema = z.object({ agency_id: z.string().uuid() })

/** Defaults mínimos necesarios para calcular el costo de una cotización. */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) {
      return NextResponse.json({ error: "agency_id inválido" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const scope = await resolveAgencyPermissionScope(supabase, user, "leads", "write")
    if (!agencyPermissionMode(scope, parsed.data.agency_id)) {
      return NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 })
    }

    // El catálogo financiero completo sigue protegido por cash.read. Este
    // endpoint sólo proyecta los dos defaults necesarios para cotizar, después
    // de validar leads.write sobre la agencia concreta.
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("financial_settings")
      .select("default_cost_calculation_mode, default_commission_percentage")
      .eq("agency_id", parsed.data.agency_id)
      .maybeSingle()
    if (error) {
      console.error("[quotation-cost-settings] read failed", error)
      return NextResponse.json({ error: "No se pudieron cargar los defaults de costo" }, { status: 500 })
    }

    const percentage = Number(data?.default_commission_percentage)
    return NextResponse.json({
      default_cost_calculation_mode:
        data?.default_cost_calculation_mode === "COMMISSIONABLE" ? "COMMISSIONABLE" : "SIMPLE",
      default_commission_percentage:
        Number.isFinite(percentage) && percentage >= 0 && percentage <= 100 ? percentage : 0,
    })
  } catch (error) {
    if ((error as { digest?: string })?.digest === "NEXT_REDIRECT") throw error
    console.error("[quotation-cost-settings] unexpected error", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
