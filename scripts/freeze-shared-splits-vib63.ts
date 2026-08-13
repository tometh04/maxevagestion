/**
 * VIB-63 — Congela el reparto de las ventas compartidas ya cargadas.
 * ==================================================================
 *
 * La migración 20260729000001 dejó todas las operaciones en `AUTO`, que es el
 * default correcto para las ventas nuevas. Pero en `AUTO` el servidor recalcula
 * la comisión cada vez que se edita la operación, y eso alcanzaría para que una
 * venta vieja cambie de números porque alguien le corrigió una fecha.
 *
 * Mientras el cliente revisa el informe del recálculo, las ventas compartidas
 * que ya tienen un reparto cargado pasan a `MANUAL`: quedan exactamente como
 * están. El backfill (recalc-shared-commissions-vib63.ts) las vuelve a `AUTO`
 * cuando se apruebe.
 *
 * SOLO toca operaciones con AMBOS porcentajes cargados. Una operación legacy
 * —sin porcentajes, con `commission_split`— no puede congelarse: en `MANUAL` sus
 * porcentajes nulos se leerían como cero y la comisión daría 0.
 *
 * USO
 *   npx tsx scripts/freeze-shared-splits-vib63.ts --org-id=<uuid>
 *   npx tsx scripts/freeze-shared-splits-vib63.ts --org-id=<uuid> --apply
 *   npx tsx scripts/freeze-shared-splits-vib63.ts --org-id=<uuid> --undo --apply
 */

import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const undo = args.includes("--undo")
const orgId = args.find((a) => a.startsWith("--org-id="))?.split("=")[1] || null

async function main() {
  if (!orgId) {
    console.error("ERROR: --org-id=<uuid> es obligatorio.")
    process.exit(1)
  }

  const destino = undo ? "AUTO" : "MANUAL"
  const origen = undo ? "MANUAL" : "AUTO"

  console.log(`org_id=${orgId}`)
  console.log(`Pasando ventas compartidas de ${origen} a ${destino}`)
  console.log(apply ? "MODO: APLICAR" : "MODO: DRY-RUN (no escribe nada)")

  const { data, error } = await admin
    .from("operations")
    .select("id, file_code, commission_split_mode, commission_pct_primary, commission_pct_secondary")
    .eq("org_id", orgId)
    .not("seller_secondary_id", "is", null)
    .not("commission_pct_primary", "is", null)
    .not("commission_pct_secondary", "is", null)

  if (error) throw new Error(error.message)

  const objetivo = (data || []).filter((o: any) => o.commission_split_mode === origen)

  console.log(`\nVentas compartidas con reparto cargado: ${data?.length ?? 0}`)
  console.log(`De esas, en ${origen} (se van a cambiar): ${objetivo.length}`)

  for (const op of objetivo as any[]) {
    console.log(
      `   ${String(op.file_code || op.id.slice(0, 8)).padEnd(22)} ` +
        `${Number(op.commission_pct_primary).toFixed(2)}% / ${Number(op.commission_pct_secondary).toFixed(2)}%`
    )
  }

  if (!apply) {
    console.log("\nDRY-RUN: no se escribió nada. Agregá --apply para ejecutar.")
    return
  }

  if (objetivo.length === 0) {
    console.log("\nNada que cambiar.")
    return
  }

  const ids = objetivo.map((o: any) => o.id)
  let cambiadas = 0
  for (let i = 0; i < ids.length; i += 50) {
    const slice = ids.slice(i, i + 50)
    const { data: updated, error: updateError } = await admin
      .from("operations")
      .update({ commission_split_mode: destino } as any)
      .in("id", slice)
      // Scope redundante pero explícito: nunca escribir fuera del tenant.
      .eq("org_id", orgId)
      .select("id")
    if (updateError) throw new Error(updateError.message)
    cambiadas += (updated || []).length
  }

  console.log(`\nOperaciones actualizadas a ${destino}: ${cambiadas}`)
  console.log(`Para revertir: npx tsx scripts/freeze-shared-splits-vib63.ts --org-id=${orgId} ${undo ? "" : "--undo "}--apply`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
