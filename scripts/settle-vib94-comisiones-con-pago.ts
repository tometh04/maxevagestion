/**
 * Cierre de las 5 comisiones que `settle-commissions-cutover.ts` salteó (VIB-94).
 * ==============================================================================
 *
 * CONTEXTO: el cutover saltea las comisiones con `amount_paid > 0` porque hay
 * plata movida. Quedaron 5, todas de Lozada, todas USD, ventas de mayo/2026.
 * El cliente respondió "dejalas todas saldadas y listo".
 *
 * QUÉ SON EN REALIDAD: en las 5, el pago existe y tiene su `ledger_movements`
 * tipo COMMISSION atrás. Lo que pasó es que la comisión se RECALCULÓ DESPUÉS de
 * pagarse (en todas, `date_calculated` es posterior a la fecha del pago): el
 * recálculo reescribió el monto y devolvió el registro a PENDING conservando
 * `amount_paid`. No hubo un pago de más por error operativo. Hoy no se puede
 * repetir: `isLocked()` en `lib/commissions/calculate.ts` ya bloquea cualquier
 * registro con `amount_paid > 0`.
 *
 * POR ESO EL CIERRE NO ES UNIFORME:
 *
 *   A) Pagadas al 100% del monto actual → `status = PAID`.
 *      La plata salió y cubre el total. Marcarlas "saldadas sin pago" diría lo
 *      contrario de lo que muestra el ledger.
 *
 *   B) Con remanente impago → `settled_at`.
 *      El pago parcial queda como está y el remanente se da por no debido, que
 *      es lo que confirmó el cliente. No se inventa un pago que no ocurrió.
 *
 *   C) Con pagado por encima del monto actual → `settled_at`.
 *      No se debe nada. El excedente NO se revierte: sale de un cálculo viejo
 *      que era el vigente cuando se pagó. Queda asentado en `settled_reason` y
 *      en el audit log para que se pueda rastrear.
 *
 * SEGURIDAD:
 *   - Alcance fijo: los 5 file_code de abajo, dentro de una sola org.
 *   - Dry-run por defecto; escribe solo con `--apply`.
 *   - Guard CAS por registro: id + org + status + settled_at + amount_paid tal
 *     como se leyó. Si alguien lo tocó en el medio, ese registro se saltea.
 *   - Audit log por cada cambio.
 *
 * USO:
 *   npx tsx scripts/settle-vib94-comisiones-con-pago.ts
 *   npx tsx scripts/settle-vib94-comisiones-con-pago.ts --apply
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const apply = process.argv.slice(2).includes("--apply")

/** Lozada. El cierre es de UNA organización, igual que el cutover. */
const ORG_ID = "1b326d20-d133-4112-a798-f54b5af7e7cb"

const FILE_CODES = [
  "OP-20260507-321E7059",
  "OP-20260509-789DFB3E",
  "OP-20260513-8006F465",
  "OP-20260515-F5B08BDC",
  "OP-20260520-C00DE4FF",
]

const REASON_BASE = "VIB-94: cierre confirmado por el cliente (comisiones viejas con pago)"

/** Tolerancia de centavos: los montos vienen de porcentajes sobre márgenes. */
const EPSILON = 0.01

type Accion = "PAID" | "SETTLED"

interface Plan {
  fileCode: string
  recordId: string
  seller: string
  amount: number
  amountPaid: number
  accion: Accion
  motivo: string
  /** amount_paid tal como se leyó, para el guard CAS. */
  guardPaid: number | null
}

function n(v: unknown): number {
  return Number(v ?? 0)
}

function usd(amount: number): string {
  return `USD ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
}

async function main() {
  const { data: ops, error: opsError } = await admin
    .from("operations")
    .select("id, file_code, org_id")
    .eq("org_id", ORG_ID)
    .in("file_code", FILE_CODES)

  if (opsError) throw new Error(`operations: ${opsError.message}`)
  if (!ops || ops.length !== FILE_CODES.length) {
    throw new Error(
      `Se esperaban ${FILE_CODES.length} operaciones en la org y llegaron ${ops?.length ?? 0}. No se sigue.`
    )
  }

  const fileCodeByOpId = new Map((ops as any[]).map((o) => [o.id, o.file_code as string]))

  const { data: recs, error: recsError } = await admin
    .from("commission_records")
    .select("id, org_id, operation_id, seller_id, amount, amount_paid, status, settled_at")
    .eq("org_id", ORG_ID)
    .in(
      "operation_id",
      (ops as any[]).map((o) => o.id)
    )

  if (recsError) throw new Error(`commission_records: ${recsError.message}`)

  const sellerIds = Array.from(new Set((recs || []).map((r: any) => r.seller_id).filter(Boolean)))
  const { data: sellers } = await admin.from("users").select("id, name").in("id", sellerIds)
  const sellerName = new Map((sellers || []).map((u: any) => [u.id, u.name as string]))

  const planes: Plan[] = []
  const salteados: string[] = []

  for (const r of (recs || []) as any[]) {
    const fileCode = fileCodeByOpId.get(r.operation_id) || r.operation_id
    const amount = n(r.amount)
    const paid = n(r.amount_paid)

    if (r.status !== "PENDING" || r.settled_at) {
      salteados.push(`${fileCode}: ya está ${r.settled_at ? "saldada" : r.status}, no se toca`)
      continue
    }
    if (paid <= 0) {
      salteados.push(`${fileCode}: sin pago, corresponde al cutover normal, no a este script`)
      continue
    }

    const diff = paid - amount
    const accion: Accion = Math.abs(diff) < EPSILON ? "PAID" : "SETTLED"
    const motivo =
      accion === "PAID"
        ? `${REASON_BASE}. Pagada al 100% (${usd(paid)}) con asiento en el ledger; había quedado en PENDING por un recálculo posterior al pago.`
        : diff > 0
          ? `${REASON_BASE}. Pagado ${usd(paid)} sobre un monto recalculado de ${usd(amount)}: ${usd(diff)} por encima. El excedente no se revierte, sale del cálculo vigente al momento del pago.`
          : `${REASON_BASE}. Pagado ${usd(paid)} de ${usd(amount)}; el remanente de ${usd(-diff)} se da por no debido.`

    planes.push({
      fileCode,
      recordId: r.id,
      seller: sellerName.get(r.seller_id) || r.seller_id,
      amount,
      amountPaid: paid,
      accion,
      motivo,
      guardPaid: r.amount_paid == null ? null : paid,
    })
  }

  console.log(`\n${apply ? "APLICANDO" : "DRY-RUN"} — cierre de comisiones con pago (VIB-94)`)
  console.log(`Organización: ${ORG_ID}\n`)

  for (const p of planes) {
    console.log(`${p.fileCode} · ${p.seller}`)
    console.log(`  monto ${usd(p.amount)} · pagado ${usd(p.amountPaid)}`)
    console.log(`  → ${p.accion === "PAID" ? "marcar PAID" : "marcar saldada (settled_at)"}`)
    console.log(`  ${p.motivo}\n`)
  }

  const aPaid = planes.filter((p) => p.accion === "PAID")
  const aSettled = planes.filter((p) => p.accion === "SETTLED")
  console.log(`Total: ${planes.length} — ${aPaid.length} a PAID, ${aSettled.length} a saldada`)
  if (salteados.length > 0) {
    console.log(`\nSalteados:`)
    for (const s of salteados) console.log(`  ${s}`)
  }

  if (!apply) {
    console.log(`\nDry-run: no se escribió nada. Reejecutar con --apply.`)
    return
  }

  const now = new Date().toISOString()
  let ok = 0
  const errors: string[] = []

  for (const p of planes) {
    const update: Record<string, any> =
      p.accion === "PAID"
        ? { status: "PAID", updated_at: now }
        : { settled_at: now, settled_reason: p.motivo, updated_at: now }

    // Mismo criterio de guard que el cutover: se repiten las condiciones del
    // SELECT para que un pago hecho desde la app en el medio gane, no se pise.
    const base = admin
      .from("commission_records")
      .update(update as any)
      .eq("id", p.recordId)
      .eq("org_id", ORG_ID)
      .eq("status", "PENDING")
      .is("settled_at", null)

    const guarded = p.guardPaid == null ? base.is("amount_paid", null) : base.eq("amount_paid", p.guardPaid)

    const { data, error } = await guarded.select("id")

    if (error) {
      errors.push(`${p.fileCode}: ${error.message}`)
      continue
    }
    if (!data || data.length === 0) {
      errors.push(`${p.fileCode}: cambió de estado durante la corrida, no se tocó`)
      continue
    }
    ok += 1

    await admin.from("audit_log").insert({
      user_id: null,
      user_email: null,
      action: "UPDATE",
      entity_type: "commission",
      entity_id: p.recordId,
      details: {
        reason: p.accion === "PAID" ? "settled_cutover_paid" : "settled_cutover_partial",
        org_id: ORG_ID,
        note: p.motivo,
        file_code: p.fileCode,
        amount: p.amount,
        amount_paid: p.amountPaid,
      },
    } as any)
  }

  console.log(`\nActualizadas: ${ok}`)
  if (errors.length > 0) {
    console.log(`Con problemas: ${errors.length}`)
    for (const e of errors) console.log(`  ${e}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
