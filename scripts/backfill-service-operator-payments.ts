/**
 * Backfill de operator_payments faltantes en servicios.
 *
 * Causa raíz: el endpoint de conversión de cotización → operación
 * (app/api/quotations/[id]/convert/route.ts) creaba operation_services con
 * cost_amount y operator_id pero NO generaba el operator_payment ni seteaba
 * operator_payment_id. Resultado: servicios con costo pero sin deuda registrada.
 * La deuda al proveedor queda invisible en reportes y el pago al proveedor
 * fallaba con "No hay deuda pendiente para el proveedor vinculado a este servicio".
 *
 * Este script detecta operation_services con:
 *   - cost_amount > 0
 *   - operator_id != null
 *   - operator_payment_id == null
 * y crea el operator_payment correspondiente, linkeándolo al servicio.
 *
 * SOLO crea la deuda (amount, paid_amount=0, PENDING). No registra pagos.
 *
 * Read-only por defecto. Para aplicar: pasar --apply
 *   Auditar (dry-run):  npx tsx scripts/backfill-service-operator-payments.ts [orgId]
 *   Aplicar:            npx tsx scripts/backfill-service-operator-payments.ts [orgId] --apply
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const ORG_ID = args.find((a) => !a.startsWith("--")) || null

;(async () => {
  console.log(`\n=== Backfill operator_payments de servicios ${APPLY ? "(APPLY)" : "(DRY-RUN)"} ===`)
  console.log(ORG_ID ? `Org: ${ORG_ID}\n` : `Org: TODAS\n`)

  // 1) Servicios con costo y operador pero sin deuda vinculada
  let svcQuery = admin
    .from("operation_services")
    .select("id, operation_id, org_id, operator_id, cost_amount, cost_currency, description, service_type")
    .gt("cost_amount", 0)
    .not("operator_id", "is", null)
    .is("operator_payment_id", null)

  if (ORG_ID) svcQuery = svcQuery.eq("org_id", ORG_ID)

  const { data: services, error: svcErr } = await svcQuery

  if (svcErr) {
    console.error("ERROR leyendo operation_services:", svcErr)
    process.exit(1)
  }

  if (!services || services.length === 0) {
    console.log("✅ No hay servicios sin operator_payment. Nada para hacer.")
    return
  }

  // 2) Traer due_date base de las operaciones involucradas (departure_date)
  const opIds = Array.from(new Set(services.map((s: any) => s.operation_id).filter(Boolean)))
  const { data: ops } = await admin
    .from("operations")
    .select("id, departure_date, status")
    .in("id", opIds)
  const opById = new Map((ops || []).map((o: any) => [o.id, o]))

  console.log(`Servicios candidatos: ${services.length}\n`)

  let created = 0
  let skipped = 0

  for (const svc of services as any[]) {
    const op = opById.get(svc.operation_id)
    if (op?.status === "CANCELLED") {
      skipped++
      continue
    }

    const dueDate = op?.departure_date || new Date().toISOString().split("T")[0]
    const currency = svc.cost_currency || "USD"
    const label = `${svc.service_type} ${svc.description ? `- ${svc.description}` : ""}`.trim()

    console.log(
      `${APPLY ? "→" : "·"} svc ${svc.id} | op ${svc.operation_id} | ${currency} ${svc.cost_amount} | ${label}`
    )

    if (!APPLY) {
      created++
      continue
    }

    const { data: opPay, error: insErr } = await admin
      .from("operator_payments")
      .insert({
        operation_id: svc.operation_id,
        operator_id: svc.operator_id,
        amount: svc.cost_amount,
        currency,
        paid_amount: 0,
        status: "PENDING",
        due_date: dueDate,
        notes: `Backfill servicio: ${label}`,
        org_id: svc.org_id,
      })
      .select("id")
      .single()

    if (insErr || !opPay) {
      console.error(`  ✗ error creando operator_payment para svc ${svc.id}:`, insErr)
      skipped++
      continue
    }

    const { error: updErr } = await admin
      .from("operation_services")
      .update({ operator_payment_id: opPay.id })
      .eq("id", svc.id)

    if (updErr) {
      console.error(`  ✗ error linkeando operator_payment ${opPay.id} a svc ${svc.id}:`, updErr)
      skipped++
      continue
    }

    created++
  }

  console.log(
    `\n${APPLY ? "Creados" : "Se crearían"}: ${created} | Omitidos (cancelados/errores): ${skipped}`
  )
  if (!APPLY) console.log("\nDry-run. Re-ejecutá con --apply para escribir.")
})()
