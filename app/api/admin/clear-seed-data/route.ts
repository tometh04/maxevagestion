import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// POST - Eliminar seed data (NO elimina leads de Trello ni datos reales)
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Solo SUPER_ADMIN puede ejecutar esto
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Solo el administrador puede ejecutar esta acción" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const deletedCounts: Record<string, number> = {}


    // 1. Eliminar alertas (excepto las de leads de Trello)
    const { data: alertsDeleted, error: alertsError } = await (supabase
      .from("alerts") as any)
      .delete()
      .not("lead_id", "is", null)
      .select("id")
    
    // Eliminar alertas sin lead_id que tengan operation_id
    const { data: alertsDeleted2 } = await (supabase
      .from("alerts") as any)
      .delete()
      .is("lead_id", null)
      .select("id")
    
    deletedCounts.alerts = (alertsDeleted?.length || 0) + (alertsDeleted2?.length || 0)

    // 2. Eliminar commission_records
    const { data: commissionsDeleted } = await (supabase
      .from("commission_records") as any)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000") // Truco para eliminar todo
      .select("id")
    deletedCounts.commission_records = commissionsDeleted?.length || 0

    // 3. Eliminar pagos
    const { data: paymentsDeleted } = await (supabase
      .from("payments") as any)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id")
    deletedCounts.payments = paymentsDeleted?.length || 0

    // 4. Eliminar operation_customers (relación)
    const { data: opCustomersDeleted } = await (supabase
      .from("operation_customers") as any)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id")
    deletedCounts.operation_customers = opCustomersDeleted?.length || 0

    // 5. Eliminar documentos de operaciones (NO de leads)
    const { data: docsDeleted } = await (supabase
      .from("documents") as any)
      .delete()
      .not("operation_id", "is", null)
      .is("lead_id", null)
      .select("id")
    deletedCounts.documents = docsDeleted?.length || 0

    // 6. Eliminar operaciones
    const { data: opsDeleted } = await (supabase
      .from("operations") as any)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id")
    deletedCounts.operations = opsDeleted?.length || 0

    // 7. Eliminar clientes
    const { data: customersDeleted } = await (supabase
      .from("customers") as any)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id")
    deletedCounts.customers = customersDeleted?.length || 0

    // 8. Eliminar operadores
    const { data: operatorsDeleted } = await (supabase
      .from("operators") as any)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id")
    deletedCounts.operators = operatorsDeleted?.length || 0

    // 9. Eliminar movimientos de caja
    const { data: cashDeleted } = await (supabase
      .from("cash_movements") as any)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id")
    deletedCounts.cash_movements = cashDeleted?.length || 0

    // 10. Eliminar ledger_movements
    const { data: ledgerDeleted } = await (supabase
      .from("ledger_movements") as any)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id")
    deletedCounts.ledger_movements = ledgerDeleted?.length || 0

    // 11. Eliminar partner_withdrawals
    const { data: withdrawalsDeleted } = await (supabase
      .from("partner_withdrawals") as any)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id")
    deletedCounts.partner_withdrawals = withdrawalsDeleted?.length || 0

    // 12. Eliminar partner_accounts
    const { data: partnersDeleted } = await (supabase
      .from("partner_accounts") as any)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id")
    deletedCounts.partner_accounts = partnersDeleted?.length || 0

    // NO ELIMINAR:
    // - leads (vienen de Trello)
    // - users (usuarios reales)
    // - agencies (configuración)
    // - trello_configs (configuración)
    // - financial_accounts (configuración)
    // - destination_requirements (configuración)
    // - whatsapp_templates (configuración)
    // - documents de leads (datos de Trello)


    return NextResponse.json({
      success: true,
      message: "Seed data eliminada correctamente",
      deleted: deletedCounts,
      preserved: [
        "leads (Trello)",
        "users",
        "agencies", 
        "trello_configs",
        "financial_accounts",
        "destination_requirements",
        "whatsapp_templates",
        "documents de leads"
      ]
    })
  } catch (error: any) {
    console.error("Error clearing seed data:", error)
    return NextResponse.json({ error: "Error al eliminar datos: " + error.message }, { status: 500 })
  }
}

