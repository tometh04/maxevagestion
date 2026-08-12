/**
 * Verificación post-migración de liquidaciones al referidor (VIB-86).
 * Run: npx tsx scripts/diag-vib86-migration-state.ts
 *
 * Chequea que quedaron: la tabla, la columna de vínculo, los índices, el
 * trigger, RLS + policy, los grants y los constraints de integridad.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

let fallos = 0

async function q(label: string, sql: string, esperado?: (rows: any[]) => boolean) {
  const { data, error } = await (admin as any).rpc("execute_readonly_query", { query_text: sql })
  const rows = Array.isArray(data) ? data : data ? [data] : []
  const ok = error ? false : esperado ? esperado(rows) : true
  if (!ok) fallos++
  console.log(`\n${ok ? "OK  " : "FALLA"} ${label}`)
  if (error) console.log("   ERROR:", error.message)
  for (const r of rows) console.log("   ", JSON.stringify(r))
  return rows
}

;(async () => {
  await q(
    "tabla referral_settlements",
    `SELECT to_regclass('public.referral_settlements')::text AS tabla`,
    (r) => r[0]?.tabla === "referral_settlements"
  )

  await q(
    "columnas de referral_settlements",
    `SELECT count(*)::int AS n,
            bool_or(column_name='account_name') AS tiene_account_name,
            bool_or(column_name='is_regularization') AS tiene_is_regularization
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='referral_settlements'`,
    (r) => r[0]?.tiene_account_name === true && r[0]?.tiene_is_regularization === true
  )

  await q(
    "referral_commissions.settlement_id",
    `SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='referral_commissions'
        AND column_name='settlement_id'`,
    (r) => r.length === 1 && r[0]?.is_nullable === "YES"
  )

  await q(
    "índices",
    `SELECT indexname FROM pg_indexes
      WHERE schemaname='public'
        AND indexname IN ('idx_referral_settlements_org','idx_referral_settlements_partner',
                          'idx_referral_settlements_paid_at','idx_referral_commissions_settlement')
      ORDER BY indexname`,
    (r) => r.length === 4
  )

  await q(
    "RLS habilitada + forzada",
    `SELECT relrowsecurity AS rls, relforcerowsecurity AS forzada
       FROM pg_class WHERE oid='public.referral_settlements'::regclass`,
    (r) => r[0]?.rls === true && r[0]?.forzada === true
  )

  await q(
    "policy de aislamiento por tenant",
    `SELECT policyname, cmd FROM pg_policies
      WHERE schemaname='public' AND tablename='referral_settlements'`,
    (r) => r.some((x) => x.policyname === "referral_settlements_tenant_isolation")
  )

  await q(
    "trigger updated_at",
    `SELECT tgname FROM pg_trigger
      WHERE tgrelid='public.referral_settlements'::regclass AND NOT tgisinternal`,
    (r) => r.some((x) => x.tgname === "referral_settlements_updated_at")
  )

  await q(
    "constraints CHECK",
    `SELECT conname FROM pg_constraint
      WHERE conrelid='public.referral_settlements'::regclass AND contype='c'
      ORDER BY conname`,
    (r) => r.length >= 6
  )

  await q(
    "foreign keys y su ON DELETE",
    `SELECT conname,
            CASE confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
                             WHEN 'c' THEN 'CASCADE'   WHEN 'n' THEN 'SET NULL'
                             ELSE confdeltype::text END AS on_delete,
            confrelid::regclass::text AS referencia
       FROM pg_constraint
      WHERE conrelid='public.referral_settlements'::regclass AND contype='f'
      ORDER BY conname`,
    (r) => r.some((x) => x.referencia === "financial_accounts" && x.on_delete === "SET NULL")
  )

  // Contra pg_class.relacl y NO contra information_schema.role_table_grants:
  // esa vista sólo muestra los grants visibles para el rol que consulta, así que
  // desde service_role los de `authenticated` no aparecen y da un falso negativo.
  await q(
    "grants a authenticated",
    `SELECT string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS permisos
       FROM pg_class c, aclexplode(c.relacl) a
      WHERE c.oid = 'public.referral_settlements'::regclass
        AND a.grantee::regrole::text = 'authenticated'`,
    (r) => {
      const p = String(r[0]?.permisos ?? "")
      return ["SELECT", "INSERT", "UPDATE", "DELETE"].every((x) => p.includes(x))
    }
  )

  await q(
    "estado de las comisiones (nada se tocó)",
    `SELECT status, count(*)::int AS n, count(settlement_id)::int AS con_liquidacion,
            round(sum(amount)::numeric, 2) AS total
       FROM public.referral_commissions GROUP BY status ORDER BY status`
  )

  console.log(
    fallos === 0
      ? "\n\nTODO OK: la migración quedó aplicada completa.\n"
      : `\n\n${fallos} CHEQUEO(S) FALLARON — revisar arriba.\n`
  )
  process.exit(fallos === 0 ? 0 : 1)
})()
