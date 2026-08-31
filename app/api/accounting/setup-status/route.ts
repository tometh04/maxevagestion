import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction, getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"

/**
 * Las dos formas en que la contabilidad de una agencia puede estar rota sin que
 * se note.
 *
 * Las dos fallan **en silencio**: la agencia opera con normalidad y el sistema
 * simplemente no registra. AP Turismo estuvo seis días sin plan de cuentas y no
 * lo detectó nadie; VICO tiene nueve cuentas financieras sin vincular desde hace
 * meses y sus movimientos no generan un solo asiento. En los dos casos la
 * pantalla se veía bien, que es exactamente el problema.
 *
 * La fecha de inicio de la contabilidad NO se informa acá aunque el mismo aviso
 * la muestre: vive en `financial_settings`, que tiene una fila por agencia, y
 * resolver cuál corresponde ya lo hace `/api/finances/settings`. Duplicar esa
 * resolución con un `limit(1)` daría la configuración de otra agencia.
 *
 * Se informa la cantidad de cuentas sin mapear y no cuáles: el aviso solo tiene
 * que decir que hay un problema y dónde se arregla. El detalle está en Cuentas
 * Financieras, que es donde además se puede hacer algo al respecto.
 */
export async function GET() {
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

  const [plan, sinMapear] = await Promise.all([
    supabase
      .from("chart_of_accounts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", user.org_id),
    // Solo las activas: una cuenta dada de baja sin mapear no le importa a nadie.
    supabase
      .from("financial_accounts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", user.org_id)
      .eq("is_active", true)
      .is("chart_account_id", null),
  ])

  // Ante un error de lectura no se avisa nada. Un cartel que aparece porque una
  // consulta falló es peor que no avisar: manda a arreglar algo que funciona.
  return NextResponse.json({
    sinPlanDeCuentas: !plan.error && (plan.count ?? 0) === 0,
    cuentasSinMapear: sinMapear.error ? 0 : sinMapear.count ?? 0,
  })
}
