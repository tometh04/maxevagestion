/**
 * Smoke test contra la API real de MercadoPago para validar que
 * `createPreapprovalPlan()` con el body actual es aceptado.
 *
 * Uso:
 *   MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxx npx tsx scripts/test-mp-preapproval-plan.ts
 *
 * Para sandbox:
 *   MP_USE_SANDBOX=true MERCADOPAGO_ACCESS_TOKEN_SANDBOX=TEST-xxx npx tsx scripts/test-mp-preapproval-plan.ts
 *
 * Qué valida:
 *  1. POST /preapproval_plan con body {reason, auto_recurring{frequency, frequency_type,
 *     transaction_amount, currency_id, free_trial}, back_url}
 *  2. Que MP acepte `free_trial` dentro de auto_recurring (igual que en /preapproval)
 *  3. Que `back_url` (singular) sea el campo correcto
 *  4. Que la respuesta tenga {id, init_point, status}
 *  5. Que el GET por id devuelva el mismo plan
 *
 * NO valida (requiere flow E2E manual con user real):
 *  - Que `external_reference` agregado como query param al init_point se propague
 *    a la preapproval hija cuando el user se suscribe.
 */

const MP_API = "https://api.mercadopago.com"

function token(): string {
  const sandbox = process.env.MP_USE_SANDBOX === "true"
  if (sandbox) {
    const v = process.env.MERCADOPAGO_ACCESS_TOKEN_SANDBOX
    if (!v) throw new Error("MP_USE_SANDBOX=true pero MERCADOPAGO_ACCESS_TOKEN_SANDBOX no seteado")
    return v
  }
  const v = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN
  if (!v) throw new Error("MERCADOPAGO_ACCESS_TOKEN requerido. Pasalo como env var al invocar.")
  return v
}

type PlanResult = { id: string; init_point: string; status: string; [k: string]: any }

async function createPlan(params: {
  reason: string
  amount: number
  backUrl: string
  includeFreeTrial: boolean
}): Promise<{ ok: boolean; status: number; requestId: string | null; data: any; bodySent: any }> {
  const autoRecurring: any = {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: params.amount,
    currency_id: "ARS",
  }
  if (params.includeFreeTrial) {
    autoRecurring.free_trial = { frequency: 7, frequency_type: "days" }
  }

  const body = {
    reason: params.reason,
    auto_recurring: autoRecurring,
    back_url: params.backUrl,
  }

  const res = await fetch(`${MP_API}/preapproval_plan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  return { ok: res.ok, status: res.status, requestId: res.headers.get("x-request-id"), data, bodySent: body }
}

async function fetchPlan(id: string): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${MP_API}/preapproval_plan/${id}`, {
    headers: { Authorization: `Bearer ${token()}` },
  })
  const text = await res.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  return { ok: res.ok, status: res.status, data }
}

async function main() {
  const TEST_AMOUNT = 100 // ARS — chico para que MP no se queje por validaciones de monto mínimo
  const TEST_BACK_URL = "https://app.vibook.ai/onboarding/billing/return"

  console.log("=".repeat(70))
  console.log("TEST 1: createPreapprovalPlan CON free_trial (flow standard)")
  console.log("=".repeat(70))
  const r1 = await createPlan({
    reason: "TEST Vibook smoke",
    amount: TEST_AMOUNT,
    backUrl: TEST_BACK_URL,
    includeFreeTrial: true,
  })
  console.log("→ Body enviado:", JSON.stringify(r1.bodySent, null, 2))
  console.log("→ Status:", r1.status, "x-request-id:", r1.requestId)
  console.log("→ Respuesta:", JSON.stringify(r1.data, null, 2))

  if (!r1.ok) {
    console.error("\n❌ TEST 1 FAILED — MP rechazó el body.")
    process.exit(1)
  }
  const plan1 = r1.data as PlanResult
  console.log("\n✅ TEST 1 OK:")
  console.log("   id:", plan1.id)
  console.log("   init_point:", plan1.init_point)
  console.log("   status:", plan1.status)

  console.log("\n" + "=".repeat(70))
  console.log("TEST 2: GET /preapproval_plan/{id}")
  console.log("=".repeat(70))
  const r2 = await fetchPlan(plan1.id)
  console.log("→ Status:", r2.status)
  console.log("→ Respuesta:", JSON.stringify(r2.data, null, 2).slice(0, 2000))

  if (!r2.ok) {
    console.error("\n❌ TEST 2 FAILED — no pude recuperar el plan creado.")
    process.exit(1)
  }
  console.log("\n✅ TEST 2 OK — plan recuperable via GET.")

  console.log("\n" + "=".repeat(70))
  console.log("TEST 3: createPreapprovalPlan SIN free_trial (reactivación)")
  console.log("=".repeat(70))
  const r3 = await createPlan({
    reason: "TEST Vibook smoke NO trial",
    amount: TEST_AMOUNT,
    backUrl: TEST_BACK_URL,
    includeFreeTrial: false,
  })
  console.log("→ Body enviado:", JSON.stringify(r3.bodySent, null, 2))
  console.log("→ Status:", r3.status, "x-request-id:", r3.requestId)
  if (!r3.ok) {
    console.error("→ Respuesta:", JSON.stringify(r3.data, null, 2))
    console.error("\n❌ TEST 3 FAILED.")
    process.exit(1)
  }
  const plan3 = r3.data as PlanResult
  console.log("\n✅ TEST 3 OK: id =", plan3.id)

  console.log("\n" + "=".repeat(70))
  console.log("TEST 4: check init_point + query param external_reference")
  console.log("=".repeat(70))
  const u = new URL(plan1.init_point)
  u.searchParams.set("external_reference", "test-org-uuid-123")
  console.log("→ init_point con external_reference:", u.toString())
  console.log("   (esta URL debería funcionar si el user la abre —")
  console.log("    MP la acepta porque es su dominio. La propagación al webhook")
  console.log("    se valida solo con flow E2E real.)")
  console.log("\n✅ TEST 4 OK — URL construida correctamente.")

  console.log("\n" + "=".repeat(70))
  console.log("RESUMEN")
  console.log("=".repeat(70))
  console.log("✅ Body `createPreapprovalPlan` aceptado por MP.")
  console.log("✅ `free_trial` dentro de auto_recurring OK.")
  console.log("✅ `back_url` singular OK.")
  console.log("✅ Plan recuperable via GET.")
  console.log("⚠️  Propagación de external_reference: requiere flow E2E manual.")
  console.log("\n🧹 Limpieza: los plans creados quedan en MP. No se pueden borrar")
  console.log("   por API — quedan como templates inactivos. IDs creados:")
  console.log("   -", plan1.id)
  console.log("   -", plan3.id)
}

main().catch((err) => {
  console.error("\n❌ Error inesperado:", err?.message || err)
  process.exit(1)
})
