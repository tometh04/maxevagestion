import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { join } from "path"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  getOrCreateDefaultAccount,
} from "../lib/accounting/ledger"
import { createServerClient } from "../lib/supabase/server"

dotenv.config({ path: join(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testEndpoint() {
  // Obtener un pago pendiente
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("status", "PENDING")
    .limit(1)

  if (!payments || payments.length === 0) {
    console.log("❌ No hay pagos pendientes")
    return
  }

  const payment = payments[0] as any
  console.log("📋 Probando con pago:", payment.id)
  console.log("   Monto:", payment.amount, payment.currency)

  // Simular el endpoint
  try {
    const accountType = payment.currency === "USD" ? "USD" : "CASH"
    const accountId = await getOrCreateDefaultAccount(
      accountType,
      payment.currency as "ARS" | "USD",
      "dev-user-id", // userId placeholder para script de prueba
      supabase as any
    )
    console.log("✅ Account ID:", accountId)

    const exchangeRate = payment.currency === "USD" ? 1000 : null
    const amountARS = calculateARSEquivalent(
      parseFloat(payment.amount),
      payment.currency as "ARS" | "USD",
      exchangeRate
    )
    console.log("✅ ARS Equivalent:", amountARS)

    const ledgerType =
      payment.direction === "INCOME"
        ? "INCOME"
        : payment.payer_type === "OPERATOR"
        ? "OPERATOR_PAYMENT"
        : "EXPENSE"

    await createLedgerMovement(
      {
        operation_id: payment.operation_id || null,
        lead_id: null,
        type: ledgerType,
        concept: payment.direction === "INCOME" ? "Pago de cliente" : "Pago a operador",
        currency: payment.currency as "ARS" | "USD",
        amount_original: parseFloat(payment.amount),
        exchange_rate: payment.currency === "USD" ? exchangeRate : null,
        amount_ars_equivalent: amountARS,
        method: "CASH",
        account_id: accountId,
        seller_id: null,
        operator_id: null,
        receipt_number: null,
        notes: null,
        created_by: null,
      },
      supabase as any
    )

    console.log("✅ Ledger movement creado exitosamente!")
  } catch (error: any) {
    console.error("❌ Error:", error.message)
    console.error(error)
  }
}

testEndpoint().catch(console.error)

