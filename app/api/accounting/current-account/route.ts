import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getUserAgencyIds, canPerformAction } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"
import { armarCuentasPorMoneda } from "@/lib/accounting/current-account"
import {
  movimientosDeCliente,
  movimientosDeOperador,
} from "@/lib/accounting/current-account-data"
import { generateCurrentAccountPdf } from "@/lib/pdf/current-account-pdf"
import { loadReportCompany } from "@/lib/reports/report-company"

/**
 * GET /api/accounting/current-account?customerId=... | ?operatorId=...
 *
 * El extracto de una contraparte: sus movimientos con el saldo corrido, un
 * extracto por moneda.
 *
 * Es lo que un contador manda cuando alguien discute una deuda. Hasta ahora
 * vibook sabía el saldo pero no podía explicarlo.
 */
export async function GET(request: Request) {
  const { user } = await getCurrentUser()
  if (!user?.org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
  }

  const supabase = await createServerClient()
  const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
  const perms = await resolveUserPermissions(
    supabase as any,
    user.id,
    user.org_id,
    (user as any).roles ?? [user.role],
    agencyIds
  )
  if (!canPerformAction(user, "accounting", "read", perms)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const customerId = searchParams.get("customerId")
  const operatorId = searchParams.get("operatorId")
  const formato = searchParams.get("formato")
  const desde = searchParams.get("desde")
  const hasta = searchParams.get("hasta")

  if (!customerId && !operatorId) {
    return NextResponse.json({ error: "Falta customerId u operatorId" }, { status: 400 })
  }
  if (customerId && operatorId) {
    return NextResponse.json(
      { error: "Pedí el extracto de un cliente o de un operador, no de los dos" },
      { status: 400 }
    )
  }

  try {
    const ctx = { orgId: user.org_id, desde, hasta }

    if (customerId) {
      // Se valida que la contraparte sea de la organización antes de leer sus
      // movimientos: sin esto, un id de otro tenant devolvería un extracto
      // vacío en vez de un 404, que es información igual.
      const { data: cliente } = await (supabase.from("customers") as any)
        .select("id, first_name, last_name")
        .eq("id", customerId)
        .eq("org_id", user.org_id)
        .maybeSingle()
      if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })

      const movimientos = await movimientosDeCliente(supabase as any, customerId, ctx)
      return await responder(
        supabase,
        user.org_id,
        formato,
        "CLIENTE",
        `${cliente.first_name ?? ""} ${cliente.last_name ?? ""}`.trim(),
        armarCuentasPorMoneda(movimientos, "CLIENTE")
      )
    }

    const { data: operador } = await (supabase.from("operators") as any)
      .select("id, name")
      .eq("id", operatorId)
      .eq("org_id", user.org_id)
      .maybeSingle()
    if (!operador) return NextResponse.json({ error: "Operador no encontrado" }, { status: 404 })

    const movimientos = await movimientosDeOperador(supabase as any, operatorId!, ctx)
    return await responder(
      supabase,
      user.org_id,
      formato,
      "OPERADOR",
      operador.name,
      armarCuentasPorMoneda(movimientos, "OPERADOR")
    )
  } catch (e: any) {
    console.error("[accounting/current-account] error:", e?.message)
    return NextResponse.json({ error: "No se pudo armar el extracto" }, { status: 500 })
  }
}

/** JSON para la pantalla, PDF para mandar. El dato es el mismo. */
async function responder(
  supabase: any,
  orgId: string,
  formato: string | null,
  tipo: "CLIENTE" | "OPERADOR",
  contraparte: string,
  cuentas: ReturnType<typeof armarCuentasPorMoneda>
) {
  if (formato !== "pdf") {
    return NextResponse.json({ tipo, contraparte, cuentas })
  }

  const company = await loadReportCompany({ supabase, orgId })
  const pdf = generateCurrentAccountPdf({ contraparte, tipo, cuentas, company })
  const nombre = contraparte.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase() || "extracto"

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cuenta-corriente-${nombre}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
