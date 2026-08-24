/**
 * Foto de los insumos del cálculo de saldos — verificación de VIB-142.
 *
 * POR QUÉ NO REPLICA LA FÓRMULA
 * -----------------------------
 * Lo tentador sería recalcular el saldo de cada cuenta y comparar. Pero
 * `getAccountBalancesBatch` (`lib/accounting/ledger.ts`) vive detrás de
 * `@/lib/supabase/server`, que no se puede importar desde un script, y
 * reescribir la fórmula acá crearía una segunda versión que puede divergir de
 * la real justo cuando más se la necesita.
 *
 * Así que este script fotografía los INSUMOS: exactamente la misma agregación
 * que hace esa función (`ledger.ts:385-388`), por cuenta y por tipo. Si los
 * insumos no cambian, el saldo tampoco puede cambiar, sea cual sea la fórmula.
 * Es una garantía más fuerte que comparar un número recalculado a mano.
 *
 * Uso:
 *   npx tsx scripts/snapshot-account-balances.ts > antes.json
 *   ... correr el backfill ...
 *   npx tsx scripts/snapshot-account-balances.ts > despues.json
 *   npx tsx scripts/snapshot-account-balances.ts --diff antes.json despues.json
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import { readFileSync } from "fs"
// quiet: dotenv escribe su banner en stdout y rompería el JSON de la foto.
loadEnv({ path: ".env.local", quiet: true })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)

/**
 * Misma agregación que getAccountBalancesBatch, sobre TODAS las cuentas.
 * El `WHERE affects_balance = true` es el que hace que las líneas de asiento
 * (que van en false) no puedan entrar acá.
 */
/**
 * Corte temporal.
 *
 * Sin esto la comparación no sirve: mientras corre el backfill los usuarios
 * siguen cargando cobros y pagos, que SÍ escriben debit/credit sobre
 * movimientos que afectan saldo (es el mecanismo viejo, annotatePayment...).
 * Esas diferencias son actividad real y no tienen nada que ver con el backfill,
 * pero aparecen como si algo se hubiera movido.
 *
 * Con el mismo corte en las dos fotos, la comparación queda manzana con manzana.
 */
const BEFORE = (() => {
  const i = args.indexOf("--before")
  return i >= 0 && args[i + 1] ? args[i + 1] : null
})()

const SQL = `select account_id, type, sum(case when debit_amount is null and credit_amount is null then amount_original::numeric else 0 end) as legacy_original, sum(case when debit_amount is null and credit_amount is null then amount_ars_equivalent::numeric else 0 end) as legacy_ars, sum(coalesce(debit_amount, 0)::numeric) as total_debit, sum(coalesce(credit_amount, 0)::numeric) as total_credit from ledger_movements where affects_balance = true and account_id is not null${BEFORE ? ` and created_at < '${BEFORE}'` : ""} group by account_id, type order by account_id, type`

type Fila = Record<string, any>

async function tomarFoto(): Promise<Fila[]> {
  const r = await admin.rpc("execute_readonly_query" as any, { query_text: SQL } as any)
  if (r.error) {
    console.error("Error tomando la foto:", r.error.message)
    process.exit(1)
  }
  return (r.data as Fila[]) ?? []
}

function clave(f: Fila) {
  return `${f.account_id}|${f.type}`
}

async function main() {
  const diffIdx = args.indexOf("--diff")

  if (diffIdx >= 0) {
    const antes: Fila[] = JSON.parse(readFileSync(args[diffIdx + 1], "utf8"))
    const despues: Fila[] = JSON.parse(readFileSync(args[diffIdx + 2], "utf8"))

    const mapaAntes = new Map(antes.map((f) => [clave(f), f]))
    const mapaDespues = new Map(despues.map((f) => [clave(f), f]))
    const claves = new Set([...mapaAntes.keys(), ...mapaDespues.keys()])

    const campos = ["legacy_original", "legacy_ars", "total_debit", "total_credit"]
    const diferencias: string[] = []

    for (const k of claves) {
      const a = mapaAntes.get(k)
      const d = mapaDespues.get(k)
      if (!a) {
        diferencias.push(`${k}: APARECIÓ`)
        continue
      }
      if (!d) {
        diferencias.push(`${k}: DESAPARECIÓ`)
        continue
      }
      for (const c of campos) {
        const va = Number(a[c] ?? 0)
        const vd = Number(d[c] ?? 0)
        if (Math.abs(va - vd) >= 0.01) {
          diferencias.push(`${k} · ${c}: ${va} → ${vd} (dif ${(vd - va).toFixed(2)})`)
        }
      }
    }

    console.log("=".repeat(78))
    console.log(`Filas comparadas: ${claves.size}`)
    if (diferencias.length === 0) {
      console.log("SIN DIFERENCIAS: los insumos del cálculo de saldos quedaron idénticos.")
      console.log("Ningún saldo de ninguna cuenta se movió.")
    } else {
      console.log(`⚠️  ${diferencias.length} DIFERENCIAS — revisar antes de seguir:`)
      for (const d of diferencias.slice(0, 40)) console.log(`  ${d}`)
      if (diferencias.length > 40) console.log(`  ... y ${diferencias.length - 40} más`)
      process.exitCode = 1
    }
    console.log("=".repeat(78))
    return
  }

  const foto = await tomarFoto()
  console.log(JSON.stringify(foto, null, 1))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
