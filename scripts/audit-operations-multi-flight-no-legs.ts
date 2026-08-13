/**
 * Lista operaciones que tienen pinta de multi-tramo pero no tienen tramos
 * cargados (operation_legs). Sirve para acotar la búsqueda después del bug que
 * borraba los tramos al editar desde el listado (fix 2026-07-21).
 *
 * Señales de multi-tramo:
 *  - reservation_code_air con más de un código (espacio, "/" o ",")
 *  - más de una pata de operador con product_type FLIGHT
 *
 * Read-only. Run: npx tsx scripts/audit-operations-multi-flight-no-legs.ts [orgId]
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const ORG_ID = process.argv[2] || null

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  let query = admin
    .from("operations")
    .select("id, file_code, org_id, destination, status, departure_date, return_date, reservation_code_air, updated_at")
    .in("status", ["RESERVED", "CONFIRMED"])
  if (ORG_ID) query = query.eq("org_id", ORG_ID)

  const { data: ops, error } = await query
  if (error) {
    console.error("Error leyendo operaciones:", error.message)
    process.exit(1)
  }

  const { data: legs } = await admin.from("operation_legs").select("operation_id")
  const opsWithLegs = new Set((legs || []).map((l: any) => l.operation_id))

  const { data: operatorRows } = await admin
    .from("operation_operators")
    .select("operation_id, product_type")
  const flightCountByOp = new Map<string, number>()
  for (const row of (operatorRows || []) as any[]) {
    if (String(row.product_type || "").toUpperCase().includes("FLIGHT")) {
      flightCountByOp.set(row.operation_id, (flightCountByOp.get(row.operation_id) || 0) + 1)
    }
  }

  const candidates = (ops || []).filter((op: any) => {
    if (opsWithLegs.has(op.id)) return false
    const code = String(op.reservation_code_air || "").trim()
    const multipleCodes = /[\s/,]+/.test(code) && code.length > 0
    const multipleFlightLegs = (flightCountByOp.get(op.id) || 0) > 1
    return multipleCodes || multipleFlightLegs
  })

  console.log(`Operaciones activas revisadas: ${ops?.length ?? 0}`)
  console.log(`Candidatas a haber perdido tramos: ${candidates.length}\n`)

  console.table(
    candidates
      .sort((a: any, b: any) => String(a.departure_date).localeCompare(String(b.departure_date)))
      .map((op: any) => ({
        file_code: op.file_code,
        destino: op.destination,
        salida: op.departure_date,
        codigos_aereos: op.reservation_code_air,
        patas_vuelo: flightCountByOp.get(op.id) || 0,
        ultima_edicion: String(op.updated_at).slice(0, 10),
      }))
  )
})()
