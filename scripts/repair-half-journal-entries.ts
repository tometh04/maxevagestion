/**
 * Repara medios asientos: crea la linea de contrapartida que falta.
 *
 * La linea nace con la forma exacta que produce createJournalEntry desde el fix
 * del 20/08: account_id null y affects_balance false. Por construccion no puede
 * mover el saldo de ninguna cuenta financiera.
 *
 * La valuacion (moneda, TC, equivalente en pesos) se COPIA de la linea original
 * en vez de recalcularse: garantiza que las dos patas del asiento valen lo mismo
 * y no depende de que hoy haya cotizacion cargada.
 *
 * Reversible: cada linea creada lleva la marca de abajo.
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
config({ path: "D:/Sequence/Proyectos/vibook/.env.local" })

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const MARCA = "[REPARACION-MEDIO-ASIENTO-VIB134]"
const APLICAR = process.argv.includes("--apply")
const SLUGS = (process.env.ORGS ?? "").split(",").filter(Boolean)

async function sql(text: string) {
  const { data, error } = await db.rpc("execute_readonly_query", { query_text: text.trim().replace(/\s+/g, " ") })
  if (error) throw new Error(error.message)
  return data as any[]
}

async function main() {
  const orgs = await sql(`SELECT id, name, slug FROM organizations WHERE slug IN ('${SLUGS.join("','")}')`)
  console.log(`Organizaciones: ${orgs.map((o: any) => o.name).join(", ")}\n`)

  const ids = orgs.map((o: any) => `'${o.id}'`).join(",")
  const filas = await sql(`SELECT lm.id, lm.org_id, lm.journal_entry_id, lm.operation_id, lm.concept,
      lm.currency, lm.amount_original, lm.exchange_rate, lm.amount_ars_equivalent,
      lm.debit_amount, lm.credit_amount, lm.movement_date, lm.type,
      lm.chart_account_id, lm.account_id,
      p.payer_type, o.name AS org_name
    FROM journal_entries je
    JOIN ledger_movements lm ON lm.journal_entry_id = je.id
    JOIN organizations o ON o.id = je.org_id
    JOIN payments p ON p.ledger_movement_id = lm.id
    WHERE je.org_id IN (${ids})
      AND (SELECT count(*) FROM ledger_movements l WHERE l.journal_entry_id = je.id) = 1`)

  console.log(`Medios asientos a reparar: ${filas.length}\n`)

  // Cuenta contable de contrapartida por org y codigo.
  const cuentas = await sql(`SELECT org_id, id, account_code FROM chart_of_accounts
    WHERE org_id IN (${ids}) AND account_code IN ('1.1.03','2.1.01') AND is_active`)
  const buscar = (orgId: string, code: string) =>
    cuentas.find((c: any) => c.org_id === orgId && c.account_code === code)?.id

  // El mapeo que cada cuenta financiera ya declara hacia el plan de cuentas.
  const mapeoCuentas = await sql(`SELECT fa.id, fa.chart_account_id, c.account_code
    FROM financial_accounts fa LEFT JOIN chart_of_accounts c ON c.id = fa.chart_account_id
    WHERE fa.org_id IN (${ids})`)

  let creadas = 0, saltadas = 0, imputadas = 0
  for (const f of filas) {
    const esOperador = f.payer_type === "OPERATOR" || f.type === "OPERATOR_PAYMENT"
    const code = esOperador ? "2.1.01" : "1.1.03"
    const chartId = buscar(f.org_id, code)
    if (!chartId) { console.log(`  SALTEADA (sin cuenta ${code} en el plan): ${f.id}`); saltadas++; continue }

    const originalEsDebe = Number(f.debit_amount ?? 0) > 0
    const monto = originalEsDebe ? Number(f.debit_amount) : Number(f.credit_amount)
    // La contrapartida va del lado opuesto.
    const nueva = {
      org_id: f.org_id,
      operation_id: f.operation_id,
      journal_entry_id: f.journal_entry_id,
      type: originalEsDebe ? "INCOME" : "EXPENSE",
      concept: f.concept,
      currency: f.currency,
      amount_original: monto,
      exchange_rate: f.exchange_rate,
      amount_ars_equivalent: f.amount_ars_equivalent,
      method: "OTHER",
      account_id: null,
      affects_balance: false,
      chart_account_id: chartId,
      debit_amount: originalEsDebe ? null : monto,
      credit_amount: originalEsDebe ? monto : null,
      movement_date: f.movement_date,
      notes: `${MARCA} contrapartida ${code} del movimiento ${f.id}`,
    }

    // La linea original tampoco imputa: tiene cuenta financiera pero no cuenta
    // del plan, asi que hoy no aparece en el Mayor. Si solo agregaramos la
    // contrapartida, el Mayor recibiria una pata y no la otra, o sea que
    // quedaria peor que ahora. Se corrige con el mapeo que la propia cuenta
    // financiera ya declara, que es el mismo dato que usa el motor.
    let arreglaOriginal: string | null = null
    if (!f.chart_account_id && f.account_id) {
      const fa = mapeoCuentas.find((m: any) => m.id === f.account_id)
      if (fa?.chart_account_id) arreglaOriginal = fa.chart_account_id
    }

    const detalleOriginal = arreglaOriginal
      ? ` + imputa la original a ${mapeoCuentas.find((m: any) => m.id === f.account_id)?.account_code}`
      : ""
    console.log(`  ${f.org_name.slice(0,20).padEnd(22)} ${f.currency} ${String(monto).padStart(12)}  ${originalEsDebe ? "Debe" : "Haber"} original -> ${originalEsDebe ? "Haber" : "Debe"} ${code}${detalleOriginal}`)

    if (APLICAR) {
      // Relectura justo antes de escribir.
      //
      // En la corrida de VICO el proceso recibio SIGTERM por timeout, siguio
      // insertando un rato mas y se solapo con la corrida siguiente: 53 asientos
      // recibieron la contrapartida dos veces y quedaron con el haber al doble
      // del debe. El candidato se elige con una SELECT del principio, asi que
      // para cuando le toca el turno puede haber dejado de serlo.
      const { count } = await (db.from("ledger_movements") as any)
        .select("id", { count: "exact", head: true })
        .eq("journal_entry_id", f.journal_entry_id)
      if ((count ?? 0) !== 1) {
        console.log(`    SALTEADA: el asiento ya tiene ${count} lineas (otra corrida lo tomo)`)
        saltadas++
        continue
      }

      const { error } = await (db.from("ledger_movements") as any).insert(nueva)
      if (error) { console.log(`    ERROR: ${error.message}`); continue }
      creadas++
      if (arreglaOriginal) {
        const { error: e2 } = await (db.from("ledger_movements") as any)
          .update({ chart_account_id: arreglaOriginal })
          .eq("id", f.id)
          .is("chart_account_id", null) // guarda: no pisa nada ya imputado
        if (e2) console.log(`    ERROR imputando la original: ${e2.message}`)
        else imputadas++
      }
    }
  }

  console.log(`\n${APLICAR ? `APLICADO: ${creadas} lineas creadas, ${imputadas} originales imputadas` : "SIMULACRO (sin --apply): no se escribio nada"}${saltadas ? `, ${saltadas} salteadas` : ""}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

/*
 * USO
 * ---
 *   ORGS=lozada-viajes,agencia-v7 npx tsx scripts/repair-half-journal-entries.ts           # simulacro
 *   ORGS=lozada-viajes,agencia-v7 npx tsx scripts/repair-half-journal-entries.ts --apply   # aplica
 *
 * Sin --apply no escribe nada. Sin ORGS no hace nada.
 *
 * PARA REVERTIR una corrida:
 *   DELETE FROM ledger_movements WHERE notes LIKE '%REPARACION-MEDIO-ASIENTO-VIB134%';
 *   -- y volver a NULL el chart_account_id de las originales que haya imputado,
 *   -- que son las que quedan sin contrapartida despues del delete.
 *
 * CORRIDA DEL 2026-08-31 (Lozada Rosario + Compañia de Viajes):
 *   12 lineas creadas, 10 originales imputadas.
 *   Saldos de cuentas financieras: identicos antes y despues.
 *   Descuadre Compañia USD 6828 -> 0, Lozada ARS -31000 -> 0.
 *   Quedaron 3 medios asientos sin pago asociado, para revisar a mano.
 */

/*
 * CORRIDA DEL 2026-08-31, resto de las agencias:
 *   Milla Cero      128 lineas, 128 originales imputadas. Descuadre a 0 en ARS y USD.
 *   Gualeguaychu    195 lineas, 195 originales imputadas. Descuadre a 0 en ARS y USD.
 *   VICO            587 lineas, 587 originales imputadas. Descuadre a 0 en ARS, 500 en USD
 *                   (el unico medio asiento que queda ahi).
 *
 * En VICO el proceso corto por timeout, siguio corriendo en segundo plano y se
 * solapo con el relanzamiento: 53 asientos recibieron la contrapartida dos veces.
 * Se detecto verificando (haber = 2x debe), se borraron las 53 sobrantes y se
 * agrego la relectura previa a la escritura para que no pueda repetirse.
 *
 * Estado del sistema despues: 926 medios asientos -> 4. Los 4 que quedan no
 * tienen pago asociado y hay que resolverlos a mano.
 *
 * Saldos de cuentas financieras: identicos antes y despues en las 5 agencias.
 */
