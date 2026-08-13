/**
 * Unificación de listados del CRM de Lozada (Rosario + Madero).
 *
 * Contexto y aprobación del cliente: docs/plans/lozada-unificacion-listados-crm.md
 *
 * Qué hace:
 *   1. Renombra `leads.list_name` de los listados duplicados al nombre unificado.
 *      SIN el filtro `source = 'Manychat'` que usa PUT /api/manychat/lists — ese
 *      filtro dejaría atrás los leads de Trello / Agente Blanco / Instagram /
 *      WhatsApp y regeneraría la columna que se quiere eliminar.
 *   2. Asigna `list_name` explícito a los leads que hoy NO tienen list_name y
 *      cuya columna se deriva de `region` (las columnas "fantasma" en mayúsculas
 *      heredadas de Trello: OTROS, CARIBE, CRUCEROS).
 *   3. Deduplica y renumera `manychat_list_order`, respetando
 *      UNIQUE(agency_id, list_name).
 *
 * Qué NO hace (decisión explícita, ver el doc):
 *   - No archiva ningún lead.
 *   - No toca las listas personales de vendedores.
 *   - No toca "Destino BestSeller" (Madero): el cliente todavía no respondió.
 *   - Los 1.588 leads de Trello de Madero NO se fusionan dentro de "Otros": se
 *     los etiqueta "Otros - Histórico" para que no caigan ahí por el fold
 *     case-insensitive del kanban ("OTROS" y "Otros" normalizan igual).
 *     No se registra en manychat_list_order a propósito: así mantiene la misma
 *     visibilidad que hoy (columna adicional, visible solo para admins).
 *
 * Uso:
 *   npx tsx scripts/unify-lozada-crm-lists.ts              # dry-run (default)
 *   npx tsx scripts/unify-lozada-crm-lists.ts --apply      # escribe
 *   npx tsx scripts/unify-lozada-crm-lists.ts --apply --backup ruta.json
 *
 * Idempotente: correrlo dos veces no cambia nada la segunda vez.
 */
import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { writeFileSync } from "fs"

config({ path: ".env.local" })

const ORG_ID = "1b326d20-d133-4112-a798-f54b5af7e7cb"
const ROSARIO = "66563aeb-4e8b-40ee-a622-b39defb380dd"
const MADERO = "fabbc2e7-81d8-4ca1-85b2-7809c5f88e75"

const EXPECTED_NAMES: Record<string, string> = {
  [ROSARIO]: "Rosario",
  [MADERO]: "Madero",
}

/** Renombres de list_name, por agencia. old → new */
const RENAMES: Record<string, Record<string, string>> = {
  [ROSARIO]: {
    "Campaña - Brasil": "Brasil",
    "Leads - Brasil": "Brasil",
    "Campaña - Pre Venta Brasil Verano": "Brasil",
    "Campaña - EE UU": "Estados Unidos",
    "Leads - EEUU": "Estados Unidos",
    "Campaña - Caribe": "Caribe",
    "Leads - Caribe": "Caribe",
    "Campaña - Caribe Marzo/Junio": "Caribe",
    "Caribe en Cuotas": "Caribe",
    "Leads - Instagram": "Instagram",
    "Leads - Otros": "Otros",
    "Campaña - Cruceros": "Cruceros",
    "Leads - Argentina": "Argentina",
    "Campaña - Argentina": "Argentina",
    "Leads - Europa": "Europa",
    "Campaña - EUROPA -SEPTIEMBRE OCTUBRE": "Europa",
    "Leads - Exoticos": "Exoticos",
    "Campaña - EXOTICOS - MACHU PICHU - AGOSTO": "Exoticos",
  },
  [MADERO]: {
    "Campaña - EE UU": "Estados Unidos",
    "Leads - EEUU": "Estados Unidos",
    "Campaña - Caribe": "Caribe",
    "Leads - Caribe": "Caribe",
    "Leads - Otros": "Otros",
    "Leads - Instagram": "Instagram",
    "Leads - Brasil": "Brasil",
    "Campaña - Brasil": "Brasil",
    "Leads - Argentina": "Argentina",
    "Campaña - Argentina": "Argentina",
    "Campaña - Cruceros": "Cruceros",
    // Único lead con list_name literal "OTROS": va al bloque histórico.
    OTROS: "Otros - Histórico",
  },
}

/**
 * Leads sin `list_name`, cuya columna hoy sale de `region`.
 * agencia → region → list_name a asignar.
 */
const REGION_BACKFILL: Record<string, Record<string, string>> = {
  [ROSARIO]: {
    OTROS: "Otros",
    CRUCEROS: "Cruceros",
    CARIBE: "Caribe",
  },
  [MADERO]: {
    OTROS: "Otros - Histórico",
  },
}

/** Listas que se registran en manychat_list_order al final, en este orden. */
const FINAL_ORDER: Record<string, string[]> = {
  [ROSARIO]: [
    "Estados Unidos",
    "Brasil",
    "Caribe",
    "Instagram",
    "Otros",
    "Cruceros",
    "Argentina",
    "Europa",
    "Exoticos",
  ],
  [MADERO]: [
    "Estados Unidos",
    "Caribe",
    "Otros",
    "Instagram",
    "Brasil",
    "Argentina",
    "Cruceros",
    "Destino BestSeller",
  ],
}

const APPLY = process.argv.includes("--apply")
const backupFlagIndex = process.argv.indexOf("--backup")
const BACKUP_PATH =
  backupFlagIndex !== -1 && process.argv[backupFlagIndex + 1]
    ? process.argv[backupFlagIndex + 1]
    : `unify-lozada-backup-${Date.now()}.json`

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

type Lead = {
  id: string
  agency_id: string | null
  list_name: string | null
  region: string | null
  archived_at: string | null
}
type ListOrderRow = {
  id: string
  agency_id: string
  list_name: string
  position: number
  seller_id: string | null
  prompt: string | null
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Misma derivación de columna que la RPC crm_lead_column_key. */
function columnKey(lead: Lead): string {
  return (
    (lead.list_name && lead.list_name.trim()) ||
    (lead.region && lead.region.trim()) ||
    "Sin lista"
  )
}

async function fetchAllLeads(): Promise<Lead[]> {
  const all: Lead[] = []
  let from = 0
  for (;;) {
    const { data, error } = await db
      .from("leads")
      .select("id, agency_id, list_name, region, archived_at")
      .eq("org_id", ORG_ID)
      .range(from, from + 999)
    if (error) throw new Error(`Error leyendo leads: ${error.message}`)
    all.push(...((data || []) as Lead[]))
    if (!data || data.length < 1000) break
    from += 1000
  }
  return all
}

async function fetchListOrder(): Promise<ListOrderRow[]> {
  const { data, error } = await db
    .from("manychat_list_order")
    .select("id, agency_id, list_name, position, seller_id, prompt")
    .eq("org_id", ORG_ID)
    .order("position", { ascending: true })
  if (error) throw new Error(`Error leyendo manychat_list_order: ${error.message}`)
  return (data || []) as ListOrderRow[]
}

function printColumns(label: string, leads: Lead[], listOrder: ListOrderRow[]) {
  console.log(`\n===== ${label} =====`)
  for (const agencyId of [ROSARIO, MADERO]) {
    const agencyLeads = leads.filter((l) => l.agency_id === agencyId)
    const registered = new Set(
      listOrder.filter((r) => r.agency_id === agencyId).map((r) => r.list_name)
    )
    const counts = new Map<string, { activos: number; archivados: number }>()
    for (const lead of agencyLeads) {
      const key = columnKey(lead)
      if (!counts.has(key)) counts.set(key, { activos: 0, archivados: 0 })
      const entry = counts.get(key)!
      lead.archived_at ? entry.archivados++ : entry.activos++
    }
    const allColumns = new Set([...registered, ...counts.keys()])
    console.log(`\n  ${EXPECTED_NAMES[agencyId]} — ${allColumns.size} columnas`)
    const rows = [...allColumns].map((name) => ({
      columna: name,
      activos: counts.get(name)?.activos ?? 0,
      archivados: counts.get(name)?.archivados ?? 0,
      registrada: registered.has(name) ? "si" : "NO",
    }))
    rows.sort((a, b) => b.activos - a.activos || a.columna.localeCompare(b.columna))
    console.table(rows)
  }
}

async function main() {
  console.log(APPLY ? ">>> MODO APPLY (escribe en la base)" : ">>> DRY-RUN (no escribe nada)")

  // --- Guardas previas -----------------------------------------------------
  const { data: agencies, error: agErr } = await db
    .from("agencies")
    .select("id, name, org_id")
    .eq("org_id", ORG_ID)
  if (agErr) throw new Error(`Error leyendo agencies: ${agErr.message}`)
  for (const [id, expected] of Object.entries(EXPECTED_NAMES)) {
    const found = (agencies || []).find((a: any) => a.id === id)
    if (!found) throw new Error(`No existe la agencia ${expected} (${id}) en la org ${ORG_ID}`)
    if (found.name !== expected) {
      throw new Error(`La agencia ${id} se llama "${found.name}", se esperaba "${expected}"`)
    }
  }

  const leadsBefore = await fetchAllLeads()
  const listOrderBefore = await fetchListOrder()
  printColumns("ANTES", leadsBefore, listOrderBefore)

  // Guarda: ninguna lista que se fusiona puede tener seller_id o prompt, porque
  // al deduplicar se perdería esa configuración sin aviso.
  for (const [agencyId, map] of Object.entries(RENAMES)) {
    for (const oldName of Object.keys(map)) {
      const row = listOrderBefore.find(
        (r) => r.agency_id === agencyId && r.list_name === oldName
      )
      if (row && (row.seller_id || row.prompt)) {
        throw new Error(
          `La lista "${oldName}" (${EXPECTED_NAMES[agencyId]}) tiene ` +
            `${row.seller_id ? "seller_id" : "prompt"} configurado. Abortado: ` +
            `revisar a mano antes de fusionarla.`
        )
      }
    }
  }

  // --- Plan: leads a renombrar --------------------------------------------
  type Change = { agencyId: string; newName: string; reason: string; ids: string[] }
  const changes: Change[] = []

  for (const [agencyId, map] of Object.entries(RENAMES)) {
    for (const [oldName, newName] of Object.entries(map)) {
      const ids = leadsBefore
        .filter(
          (l) =>
            l.agency_id === agencyId &&
            (l.list_name || "").trim() === oldName &&
            (l.list_name || "").trim() !== newName
        )
        .map((l) => l.id)
      if (ids.length) {
        changes.push({ agencyId, newName, reason: `list_name "${oldName}"`, ids })
      }
    }
  }

  for (const [agencyId, map] of Object.entries(REGION_BACKFILL)) {
    for (const [region, newName] of Object.entries(map)) {
      const ids = leadsBefore
        .filter(
          (l) =>
            l.agency_id === agencyId &&
            !(l.list_name || "").trim() &&
            (l.region || "").trim() === region
        )
        .map((l) => l.id)
      if (ids.length) {
        changes.push({ agencyId, newName, reason: `sin list_name, region "${region}"`, ids })
      }
    }
  }

  console.log("\n===== LEADS A MOVER =====")
  if (changes.length === 0) {
    console.log("  (nada que mover — ya está unificado)")
  } else {
    console.table(
      changes.map((c) => ({
        agencia: EXPECTED_NAMES[c.agencyId],
        origen: c.reason,
        destino: c.newName,
        leads: c.ids.length,
      }))
    )
    console.log(`  TOTAL leads a mover: ${changes.reduce((s, c) => s + c.ids.length, 0)}`)
  }

  // --- Plan: manychat_list_order ------------------------------------------
  type PlannedList = { agencyId: string; name: string; position: number; keepId: string | null }
  const planned: PlannedList[] = []
  const toDelete: string[] = []

  for (const agencyId of [ROSARIO, MADERO]) {
    const rows = listOrderBefore.filter((r) => r.agency_id === agencyId)
    const renameMap = RENAMES[agencyId] || {}
    // Agrupar por nombre final; se conserva la fila de menor position.
    const groups = new Map<string, ListOrderRow[]>()
    for (const row of rows) {
      const finalName = renameMap[row.list_name] ?? row.list_name
      if (!groups.has(finalName)) groups.set(finalName, [])
      groups.get(finalName)!.push(row)
    }

    const desired = FINAL_ORDER[agencyId]
    const ordered: string[] = []
    // Primero los destinos unificados, en el orden definido arriba.
    for (const name of desired) if (groups.has(name)) ordered.push(name)
    // Después el resto (listas personales), preservando su orden actual.
    const rest = [...groups.entries()]
      .filter(([name]) => !desired.includes(name))
      .sort((a, b) => Math.min(...a[1].map((r) => r.position)) - Math.min(...b[1].map((r) => r.position)))
      .map(([name]) => name)
    ordered.push(...rest)

    ordered.forEach((name, index) => {
      const group = groups.get(name)!
      const keeper = group.reduce((a, b) => (a.position <= b.position ? a : b))
      planned.push({ agencyId, name, position: index, keepId: keeper.id })
      for (const row of group) if (row.id !== keeper.id) toDelete.push(row.id)
    })
  }

  // Guarda: el nombre final no puede chocar con otra fila que se conserva.
  for (const agencyId of [ROSARIO, MADERO]) {
    const names = planned.filter((p) => p.agencyId === agencyId).map((p) => p.name)
    const dupes = names.filter((n, i) => names.indexOf(n) !== i)
    if (dupes.length) {
      throw new Error(
        `Colisión de nombres en ${EXPECTED_NAMES[agencyId]}: ${[...new Set(dupes)].join(", ")}`
      )
    }
  }

  console.log("\n===== manychat_list_order RESULTANTE =====")
  for (const agencyId of [ROSARIO, MADERO]) {
    const rows = planned.filter((p) => p.agencyId === agencyId)
    console.log(`\n  ${EXPECTED_NAMES[agencyId]} — ${rows.length} listas registradas`)
    console.table(rows.map((r) => ({ pos: r.position, lista: r.name })))
  }
  console.log(`\n  Filas duplicadas a borrar: ${toDelete.length}`)

  if (!APPLY) {
    console.log("\n>>> DRY-RUN terminado. Nada se escribió. Correr con --apply para ejecutar.")
    return
  }

  // --- Backup --------------------------------------------------------------
  const backup = {
    generated_at: new Date().toISOString(),
    org_id: ORG_ID,
    leads: leadsBefore
      .filter((l) => changes.some((c) => c.ids.includes(l.id)))
      .map((l) => ({ id: l.id, agency_id: l.agency_id, list_name: l.list_name, region: l.region })),
    manychat_list_order: listOrderBefore,
  }
  writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2), "utf8")
  console.log(`\nBackup del estado previo escrito en: ${BACKUP_PATH}`)

  // --- Aplicar: leads ------------------------------------------------------
  console.log("\nAplicando cambios en leads...")
  for (const change of changes) {
    let updated = 0
    for (const ids of chunk(change.ids, 200)) {
      const { error } = await db
        .from("leads")
        .update({ list_name: change.newName })
        .eq("org_id", ORG_ID)
        .eq("agency_id", change.agencyId)
        .in("id", ids)
      if (error) {
        throw new Error(
          `Error moviendo leads a "${change.newName}" (${change.reason}): ${error.message}`
        )
      }
      updated += ids.length
    }
    console.log(
      `  ${EXPECTED_NAMES[change.agencyId]}: ${updated} leads — ${change.reason} → "${change.newName}"`
    )
  }

  // --- Aplicar: manychat_list_order ---------------------------------------
  console.log("\nAplicando cambios en manychat_list_order...")
  if (toDelete.length) {
    for (const ids of chunk(toDelete, 100)) {
      const { error } = await db.from("manychat_list_order").delete().in("id", ids)
      if (error) throw new Error(`Error borrando filas duplicadas: ${error.message}`)
    }
    console.log(`  ${toDelete.length} filas duplicadas borradas`)
  }
  for (const row of planned) {
    if (!row.keepId) continue
    const { error } = await db
      .from("manychat_list_order")
      .update({ list_name: row.name, position: row.position })
      .eq("id", row.keepId)
    if (error) {
      throw new Error(`Error actualizando lista "${row.name}": ${error.message}`)
    }
  }
  console.log(`  ${planned.length} listas actualizadas (nombre + posición)`)

  // --- Verificación --------------------------------------------------------
  const leadsAfter = await fetchAllLeads()
  const listOrderAfter = await fetchListOrder()
  printColumns("DESPUES", leadsAfter, listOrderAfter)

  const leftovers = leadsAfter.filter((l) => {
    const map = RENAMES[l.agency_id || ""] || {}
    return Object.keys(map).includes((l.list_name || "").trim())
  })
  if (leftovers.length) {
    console.error(`\n!! Quedaron ${leftovers.length} leads con nombres viejos. Revisar.`)
    process.exitCode = 1
  } else {
    console.log("\nOK: no quedan leads con los nombres viejos.")
  }
}

main().catch((err) => {
  console.error("\nFALLO:", err.message)
  process.exit(1)
})
