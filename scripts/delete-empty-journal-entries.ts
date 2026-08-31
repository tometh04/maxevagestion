/**
 * Borra los encabezados de asiento que no tienen ninguna linea.
 *
 * Un asiento sin lineas no es un asiento: no tiene importe, ni contrapartida, ni
 * nada que registrar. Son residuo de pagos borrados —la misma familia que las
 * percepciones huerfanas de VIB-138— y el unico efecto que tienen es ocupar un
 * numero en el Libro Diario e imprimir un renglon en blanco, que es exactamente
 * lo que la exigencia de llevarlo "sin blancos" prohibe.
 *
 * Es inerte por construccion:
 *   - No tienen lineas, asi que no hay plata ni saldo que tocar.
 *   - La unica FK que apunta a journal_entries es ledger_movements.journal_entry_id,
 *     ON DELETE SET NULL, y no hay ninguna fila apuntando a estos.
 *
 * Guarda: no toca los creados en las ultimas 24 horas, por si alguno esta en
 * medio de su escritura (createJournalEntry inserta el encabezado y despues las
 * lineas, asi que existe una ventana de milisegundos donde un asiento sano se
 * ve vacio).
 *
 * USO:
 *   npx tsx scripts/delete-empty-journal-entries.ts            # simulacro
 *   npx tsx scripts/delete-empty-journal-entries.ts --apply    # borra
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
config({ path: "D:/Sequence/Proyectos/vibook/.env.local" })

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const APLICAR = process.argv.includes("--apply")

async function sql(t: string) {
  const { data, error } = await db.rpc("execute_readonly_query", { query_text: t.trim().replace(/\s+/g, " ") })
  if (error) throw new Error(error.message)
  return data as any[]
}

async function main() {
  const filas = await sql(`SELECT je.id, o.name AS org, je.entry_date::text AS fecha, je.description
    FROM journal_entries je JOIN organizations o ON o.id = je.org_id
    WHERE NOT EXISTS (SELECT 1 FROM ledger_movements l WHERE l.journal_entry_id = je.id)
      AND je.created_at < now() - interval '24 hours'
    ORDER BY o.name, je.entry_date`)

  const porOrg = new Map<string, number>()
  for (const f of filas) porOrg.set(f.org, (porOrg.get(f.org) ?? 0) + 1)
  console.log(`Encabezados vacios a borrar: ${filas.length}`)
  for (const [org, n] of porOrg) console.log(`  ${String(org).padEnd(28)} ${n}`)

  if (!APLICAR) { console.log("\nSIMULACRO (sin --apply): no se borro nada"); return }

  let borrados = 0
  const ids = filas.map((f: any) => f.id)
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50)
    // Se revalida en el borrado: si a alguno le aparecieron lineas entre la
    // lectura y ahora, no se toca.
    const { data: sigueVacio } = await (db.from("ledger_movements") as any)
      .select("journal_entry_id").in("journal_entry_id", lote)
    const conLineas = new Set(((sigueVacio ?? []) as any[]).map((x) => x.journal_entry_id))
    const seguros = lote.filter((id: string) => !conLineas.has(id))
    if (seguros.length === 0) continue
    const { error } = await (db.from("journal_entries") as any).delete().in("id", seguros)
    if (error) { console.log(`  ERROR: ${error.message}`); return }
    borrados += seguros.length
  }
  console.log(`\nBORRADOS: ${borrados}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
