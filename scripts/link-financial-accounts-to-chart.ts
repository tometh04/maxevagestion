/**
 * Vincula cuentas financieras al plan de cuentas — VIB-142 / VIB-145.
 *
 * POR QUÉ HACE FALTA
 * ------------------
 * Si una cuenta financiera no está vinculada al plan, el motor no puede asentar
 * sus movimientos: no sabe contra qué cuenta contable imputarlos. En Milla Cero
 * eso dejó 128 asientos incompletos, y sus tres cuentas de plata (dos cajas de
 * ahorro y una cuenta corriente) siguen sin vincular.
 *
 * Las cuentas que se crean desde la app ya se vinculan solas por tipo. Esto es
 * para las que quedaron de antes.
 *
 * LA REGLA DE SEGURIDAD
 * ---------------------
 * Vincular una cuenta NO es inocuo: `financial_accounts.chart_account_id`
 * determina la CATEGORÍA de la cuenta, y la categoría define si su saldo es
 * deudor o acreedor (`isDebitNaturalAccount`). Mapear a una cuenta de Pasivo o
 * Patrimonio Neto **invierte el signo del saldo**: donde el usuario ve 100
 * pasaría a ver −100.
 *
 * Por eso este script SOLO vincula cuando la cuenta destino es de categoría
 * ACTIVO, que es exactamente cómo el sistema trata hoy a una cuenta sin
 * vincular (`getAccountBalancesBatch` usa "ACTIVO" como default). Con eso el
 * saldo no puede cambiar: ni el signo ni el valor.
 *
 * Cualquier otro caso —cuentas de socio, cuentas corrientes de proveedores— se
 * reporta y NO se toca: son decisiones contables, no mecánicas.
 *
 *   Dry-run (default):  npx tsx scripts/link-financial-accounts-to-chart.ts --org "Milla Cero"
 *   Aplicar:            ... --org "Milla Cero" --apply
 *
 * `--org` es obligatorio a propósito: esto se hace agencia por agencia, con
 * verificación en el medio.
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
const ORG_FILTER = (() => {
  const i = args.indexOf("--org")
  return i >= 0 && args[i + 1] ? args[i + 1] : null
})()

/**
 * Nombres a excluir, repetible: --skip-name "EFECTIVO" --skip-name "Mercado Pago"
 *
 * Para cuentas cuyo NOMBRE no se condice con su tipo cargado. Ejemplos reales:
 * una cuenta llamada "EFECTIVO" cargada como caja de ahorro iría a Bancos
 * cuando debería ir a Caja, y una llamada "Mercado Pago" cargada igual iría a
 * Bancos en vez de a su propia cuenta. El mapeo por tipo sería seguro pero
 * quedaría mal, y arreglar el tipo es una corrección de dato, no de código.
 */
const SKIP_NAMES: string[] = args.reduce<string[]>((acc, a, i) => {
  if (a === "--skip-name" && args[i + 1]) acc.push(args[i + 1].toLowerCase())
  return acc
}, [])

/**
 * Acota a ciertos tipos: --only-types CASH_USD,CASH_ARS
 *
 * Sirve cuando dos cuentas comparten nombre pero solo una tiene el tipo bien
 * cargado. Caso real: en Gualeguaychú hay dos cuentas llamadas "EFECTIVO", una
 * como CASH_USD (correcta, va a Caja) y otra como caja de ahorro (mal cargada,
 * iría a Bancos). Filtrar por nombre las sacaba a las dos.
 */
const ONLY_TYPES: string[] | null = (() => {
  const i = args.indexOf("--only-types")
  return i >= 0 && args[i + 1] ? args[i + 1].split(",").map((t) => t.trim()) : null
})()

/**
 * Mismo mapeo que usa el alta de cuentas (`app/api/accounting/financial-accounts`),
 * para que una cuenta vieja quede igual que una que se creara hoy.
 */
const TIPO_A_CODIGO: Record<string, string> = {
  CASH_ARS: "1.1.01",
  CASH_USD: "1.1.01",
  CHECKING_ARS: "1.1.02",
  CHECKING_USD: "1.1.02",
  SAVINGS_ARS: "1.1.02",
  SAVINGS_USD: "1.1.02",
  // CREDIT_CARD queda FUERA a propósito, aunque el alta de cuentas lo mapee a
  // 1.1.04. Dos motivos:
  //
  //   1. En el plan sembrado, 1.1.04 se llama "Mercado Pago". Meter ahí una
  //      "VISA GALICIA" queda visiblemente mal en el Mayor.
  //   2. Contablemente una tarjeta de crédito suele ser un PASIVO (lo que se le
  //      debe a la tarjeta), no un activo. Cambiarla de categoría invertiría el
  //      signo de su saldo, así que es una decisión del contador.
  ASSETS: "1.1.05",
  // PARTNER va a 3.1.01 (Patrimonio Neto) en el alta. Acá NO se toca: cambiar
  // una cuenta de socio de Activo a PN le invierte el signo al saldo.
}

async function main() {
  console.log("=".repeat(78))
  console.log(`VINCULAR cuentas financieras al plan — ${APPLY ? "APLICANDO" : "DRY-RUN"}`)
  console.log("=".repeat(78))

  if (!ORG_FILTER) {
    console.error("\nFalta --org. Esto se hace agencia por agencia, a propósito.")
    process.exit(1)
  }

  const { data: orgs } = await admin.from("organizations").select("id, name")
  const org = (orgs ?? []).find((o: any) =>
    String(o.name).toLowerCase().includes(ORG_FILTER.toLowerCase())
  ) as any
  if (!org) {
    console.error(`No hay ninguna organización que coincida con "${ORG_FILTER}".`)
    process.exit(1)
  }
  console.log(`\nAgencia: ${org.name}`)

  const { data: plan } = await admin
    .from("chart_of_accounts")
    .select("id, account_code, account_name, category")
    .eq("org_id", org.id)

  const porCodigo = new Map<string, any>(
    (plan ?? []).map((c: any) => [c.account_code, c])
  )

  const { data: cuentas } = await admin
    .from("financial_accounts")
    .select("id, name, type, currency, chart_account_id")
    .eq("org_id", org.id)
    .eq("is_active", true)
    .is("chart_account_id", null)

  const sinVincular = (cuentas ?? []) as any[]
  console.log(`Cuentas activas sin vincular: ${sinVincular.length}`)

  const aVincular: Array<{ cuenta: any; destino: any }> = []
  const salteadas: Array<{ cuenta: any; motivo: string }> = []

  for (const cuenta of sinVincular) {
    if (ONLY_TYPES && !ONLY_TYPES.includes(cuenta.type)) {
      salteadas.push({ cuenta, motivo: "fuera de --only-types" })
      continue
    }
    if (SKIP_NAMES.some((n) => String(cuenta.name).toLowerCase().includes(n))) {
      salteadas.push({ cuenta, motivo: "excluida por nombre (--skip-name)" })
      continue
    }
    const codigo = TIPO_A_CODIGO[cuenta.type]
    if (!codigo) {
      salteadas.push({
        cuenta,
        motivo: `tipo ${cuenta.type} sin mapeo seguro (decisión contable)`,
      })
      continue
    }
    const destino = porCodigo.get(codigo)
    if (!destino) {
      salteadas.push({ cuenta, motivo: `la cuenta ${codigo} no está en el plan de la agencia` })
      continue
    }
    // LA regla: solo ACTIVO, que es como el sistema ya trata a una cuenta sin
    // vincular. Cualquier otra categoría cambiaría el signo del saldo.
    if (destino.category !== "ACTIVO") {
      salteadas.push({
        cuenta,
        motivo: `${codigo} es ${destino.category} y hoy la cuenta se trata como ACTIVO: vincularla invertiría el signo del saldo`,
      })
      continue
    }
    aVincular.push({ cuenta, destino })
  }

  console.log(`\nA vincular: ${aVincular.length}`)
  for (const { cuenta, destino } of aVincular) {
    console.log(
      `   ${String(cuenta.type).padEnd(13)} ${String(cuenta.currency).padEnd(4)} ${cuenta.name}  →  ${destino.account_code} ${destino.account_name} (${destino.category})`
    )
  }

  if (salteadas.length > 0) {
    console.log(`\nSe saltean: ${salteadas.length}`)
    for (const { cuenta, motivo } of salteadas) {
      console.log(`   ${String(cuenta.type).padEnd(13)} ${cuenta.name}: ${motivo}`)
    }
  }

  if (aVincular.length === 0) {
    console.log("\nNada para vincular.")
    return
  }

  if (!APPLY) {
    console.log("\n" + "-".repeat(78))
    console.log("DRY-RUN: no se escribió nada. Volvé a correr con --apply para aplicar.")
    console.log("Todas las vinculaciones de arriba son a cuentas ACTIVO, así que el")
    console.log("saldo de esas cuentas no puede cambiar ni de signo ni de valor.")
    console.log("-".repeat(78))
    return
  }

  let ok = 0
  const errores: string[] = []
  for (const { cuenta, destino } of aVincular) {
    const { error } = await admin
      .from("financial_accounts")
      .update({ chart_account_id: destino.id } as any)
      .eq("id", cuenta.id)
      .eq("org_id", org.id)
    if (error) errores.push(`${cuenta.name}: ${error.message}`)
    else ok++
  }

  console.log("\n" + "-".repeat(78))
  console.log(`Vinculadas: ${ok}`)
  if (errores.length) {
    console.log(`Errores: ${errores.length}`)
    for (const e of errores) console.log(`   ${e}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
