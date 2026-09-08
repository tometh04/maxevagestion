/**
 * Prueba de concurrencia del cupo de un paquete cerrado (VIB-183).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE es el único test del invariante central de la feature.
 *
 * Los tests de Jest de `app/api/operations/__tests__/route-travel-package.test.ts`
 * fijan el CONTRATO de la ruta (que se llame a la RPC, que el rollback borre la
 * operación, que el error se mapee a 409). No prueban la carrera: ahí la RPC
 * está mockeada, así que se estaría probando el mock.
 *
 * Que dos vendedores no puedan quedarse los dos con la última plaza depende del
 * `SELECT ... FOR UPDATE` + conteo derivado dentro de `book_travel_package_seats`,
 * y eso solo se puede ejercer contra un Postgres real, con llamadas en paralelo.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Qué hace:
 *   1. Crea un paquete de prueba con cupo 5 y 20 operaciones descartables.
 *   2. Dispara las 20 tomas de 1 plaza EN PARALELO.
 *   3. Verifica que entren exactamente 5 y que las otras 15 rebote con P4301.
 *   4. Cancela 2 operaciones y verifica que el disponible pase a 2 sin escribir
 *      nada: el cupo se deriva, no se decrementa.
 *   5. Borra una operación y verifica que su reserva se va por cascada de FK.
 *   6. Limpia todo lo que creó.
 *
 * Corre contra la base configurada en .env.local. Crea y borra sus propios
 * datos; no toca nada preexistente.
 *
 * Run: npx tsx scripts/qa-travel-package-race.ts [orgId]
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CUPO = 5
const INTENTOS = 20
const MARCA = "[QA-VIB-183] paquete de prueba"

let fallos = 0
function check(ok: boolean, mensaje: string) {
  if (ok) {
    console.log(`  OK   ${mensaje}`)
  } else {
    fallos++
    console.error(`  FALLA ${mensaje}`)
  }
}

async function main() {
  const orgId = process.argv[2] || (await resolverOrgConAgencia())
  console.log(`\nOrg de prueba: ${orgId}\n`)

  const { data: agencia } = await admin
    .from("agencies")
    .select("id")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle()

  const { data: vendedor } = await admin
    .from("users")
    .select("id")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle()

  if (!agencia || !vendedor) {
    throw new Error("La org necesita al menos una agencia y un usuario para la prueba")
  }

  // ── 1. Paquete + operaciones descartables ────────────────────────────────
  const { data: paquete, error: errPaquete } = await admin
    .from("travel_packages")
    .insert({ org_id: orgId, name: MARCA, total_quota: CUPO, notes: MARCA })
    .select("id")
    .single()
  if (errPaquete || !paquete) throw new Error(`No se pudo crear el paquete: ${errPaquete?.message}`)

  const filas = Array.from({ length: INTENTOS }, (_, i) => ({
    org_id: orgId,
    agency_id: agencia.id,
    seller_id: vendedor.id,
    type: "PACKAGE",
    destination: `${MARCA} ${i}`,
    operation_date: "2026-01-01",
    departure_date: "2027-01-01",
    status: "RESERVED",
    sale_amount_total: 0,
    operator_cost: 0,
    currency: "USD",
    sale_currency: "USD",
  }))
  const { data: operaciones, error: errOps } = await admin
    .from("operations")
    .insert(filas)
    .select("id")
  if (errOps || !operaciones) throw new Error(`No se pudieron crear las operaciones: ${errOps?.message}`)

  const limpiar = async () => {
    await admin.from("operations").delete().in("id", operaciones.map((o: any) => o.id))
    await admin.from("travel_packages").delete().eq("id", paquete.id)
  }

  try {
    // ── 2. Las 20 tomas, en paralelo ──────────────────────────────────────
    console.log(`Disparando ${INTENTOS} tomas simultáneas sobre un cupo de ${CUPO}...\n`)
    const resultados = await Promise.allSettled(
      operaciones.map((op: any) =>
        admin.rpc("book_travel_package_seats", {
          p_package_id: paquete.id,
          p_operation_id: op.id,
          p_org_id: orgId,
          p_seats: 1,
        })
      )
    )

    const exitosas = resultados.filter(
      (r) => r.status === "fulfilled" && !(r.value as any).error
    ).length
    const agotadas = resultados.filter(
      (r) => r.status === "fulfilled" && (r.value as any).error?.code === "P4301"
    ).length
    const otrosErrores = resultados.filter(
      (r) =>
        r.status === "rejected" ||
        ((r.value as any).error && (r.value as any).error.code !== "P4301")
    )

    check(exitosas === CUPO, `entraron exactamente ${CUPO} (entraron ${exitosas})`)
    check(
      agotadas === INTENTOS - CUPO,
      `las otras ${INTENTOS - CUPO} rebotaron con cupo agotado (rebotaron ${agotadas})`
    )
    check(otrosErrores.length === 0, `sin errores inesperados (hubo ${otrosErrores.length})`)
    if (otrosErrores.length > 0) {
      console.error("   ", JSON.stringify(otrosErrores.slice(0, 2), null, 2))
    }

    const disponibilidad = async () => {
      const { data } = await admin.rpc("get_travel_package_availability", {
        p_org_id: orgId,
        p_package_ids: [paquete.id],
      })
      return (data as any[])?.[0]
    }

    const trasTomas = await disponibilidad()
    check(trasTomas?.consumed === CUPO, `consumido = ${CUPO} (es ${trasTomas?.consumed})`)
    check(trasTomas?.remaining === 0, `disponible = 0 (es ${trasTomas?.remaining})`)

    // ── 3. Cancelar libera, sin escribir nada del lado del cupo ────────────
    const reservadas = await admin
      .from("travel_package_bookings")
      .select("operation_id")
      .eq("package_id", paquete.id)
    const aCancelar = (reservadas.data as any[]).slice(0, 2).map((b) => b.operation_id)

    await admin.from("operations").update({ status: "CANCELLED" }).in("id", aCancelar)

    const trasCancelar = await disponibilidad()
    check(
      trasCancelar?.remaining === 2,
      `cancelar 2 ventas libera 2 plazas sin tocar el cupo (disponible = ${trasCancelar?.remaining})`
    )
    check(
      trasCancelar?.cancelled_bookings === 2,
      `las 2 reservas canceladas siguen visibles en el historial (${trasCancelar?.cancelled_bookings})`
    )

    // ── 4. Borrar la operación se lleva su reserva por cascada de FK ───────
    const activas = (reservadas.data as any[])
      .map((b) => b.operation_id)
      .filter((id) => !aCancelar.includes(id))

    await admin.from("operations").delete().eq("id", activas[0])

    const { count } = await admin
      .from("travel_package_bookings")
      .select("id", { count: "exact", head: true })
      .eq("package_id", paquete.id)

    check(count === CUPO - 1, `borrar una operación borra su reserva (quedan ${count})`)
  } finally {
    await limpiar()
    const { count } = await admin
      .from("travel_package_bookings")
      .select("id", { count: "exact", head: true })
      .eq("package_id", paquete.id)
    check(count === 0, "los datos de prueba quedaron limpios")
  }

  console.log(
    fallos === 0
      ? "\nTodo OK: el cupo aguanta la concurrencia y se libera solo.\n"
      : `\n${fallos} chequeo(s) fallaron.\n`
  )
  process.exit(fallos === 0 ? 0 : 1)
}

async function resolverOrgConAgencia(): Promise<string> {
  const { data } = await admin.from("agencies").select("org_id").limit(1).maybeSingle()
  if (!data?.org_id) throw new Error("No se encontró ninguna org con agencia")
  return data.org_id as string
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
