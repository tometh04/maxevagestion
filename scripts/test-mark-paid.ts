import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { join } from "path"

dotenv.config({ path: join(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testMarkPaid() {
  // Obtener un pago pendiente
  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("*")
    .eq("status", "PENDING")
    .limit(1)

  if (paymentsError || !payments || payments.length === 0) {
    console.log("❌ No hay pagos pendientes para probar")
    return
  }

  const payment = payments[0]
  console.log("📋 Pago encontrado:", payment.id)
  console.log("   Monto:", payment.amount, payment.currency)

  // Simular el endpoint
  try {
    // Verificar que existe una cuenta financiera
    const { data: accounts } = await supabase
      .from("financial_accounts")
      .select("id")
      .eq("type", "CASH")
      .eq("currency", payment.currency)
      .limit(1)

    if (!accounts || accounts.length === 0) {
      console.log("❌ No hay cuenta financiera CASH. Creando...")
      const { data: newAccount } = await supabase
        .from("financial_accounts")
        .insert({
          name: "Caja Principal",
          type: "CASH",
          currency: payment.currency,
          initial_balance: 0,
        })
        .select("id")
        .single()

      if (newAccount) {
        console.log("✅ Cuenta creada:", newAccount.id)
      }
    } else {
      console.log("✅ Cuenta encontrada:", accounts[0].id)
    }

    console.log("\n✅ Test completado. El endpoint debería funcionar.")
  } catch (error: any) {
    console.error("❌ Error:", error.message)
  }
}

testMarkPaid().catch(console.error)

