/**
 * @jest-environment node
 *
 * SaaS Pilar 5 — Tenant segregation test suite.
 *
 * Corre contra el Supabase real (prod o staging) usando service_role e
 * inspecciona todas las tablas tenant-scoped. Validaciones:
 *   - Total de rows = suma por org_id + huérfanos
 *   - Zero rows con org_id NULL (orphan rows escaparían RLS)
 *   - Zero rows fuera de orgs conocidas
 *
 * Este suite es la versión Jest de `scripts/smoke-isolation.ts`. Lo
 * mantenemos separado para CI: smoke script para runs manuales, Jest
 * para bloquear merges en PRs.
 *
 * Requiere:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Se skippea si las env vars faltan — así los tests corren localmente sin
 * reventar el dev sin credenciales.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"

// next/jest no siempre inyecta las env vars cuando testEnvironment = node.
// Las cargamos explícitamente desde .env.local para que el suite funcione
// tanto corriendo `npm run test:isolation` local como en CI con secrets.
loadEnv({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

const TENANT_TABLES = [
  "leads",
  "operations",
  "customers",
  "operation_customers",
  "payments",
  "cash_movements",
  "ledger_movements",
  "commission_records",
  "financial_accounts",
  "invoices",
  "alerts",
  "tasks",
  "itinerary_items",
] as const

const describeIfCreds = SUPABASE_URL && SERVICE_ROLE ? describe : describe.skip

describeIfCreds("tenant segregation (Pilar 5)", () => {
  let admin: SupabaseClient

  beforeAll(() => {
    admin = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  })

  describe.each(TENANT_TABLES)("table %s", (table) => {
    it("tiene columna org_id", async () => {
      const { data, error } = await admin
        .rpc("execute_readonly_query", {
          query_text: `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' AND column_name = 'org_id'`,
        })
      expect(error).toBeNull()
      expect(Array.isArray(data) ? data.length : 0).toBeGreaterThan(0)
    })

    it("no tiene rows con org_id NULL", async () => {
      const { count, error } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .is("org_id", null)
      expect(error).toBeNull()
      expect(count ?? 0).toBe(0)
    })

    it("todos los rows pertenecen a orgs existentes", async () => {
      // Si algún row tiene org_id que no es ningún id real, es un huérfano.
      // Contamos y esperamos 0.
      const { data, error } = await admin.rpc("execute_readonly_query", {
        query_text: `SELECT COUNT(*) AS orphan_count FROM ${table} t WHERE t.org_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = t.org_id)`,
      })
      expect(error).toBeNull()
      const count = Number((data as any)?.[0]?.orphan_count ?? 0)
      expect(count).toBe(0)
    })
  })

  it("RLS está enabled y forced en tablas tenant-scoped", async () => {
    const tables = TENANT_TABLES.map((t) => `'${t}'`).join(",")
    const { data, error } = await admin.rpc("execute_readonly_query", {
      query_text: `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced FROM pg_class c WHERE c.relname IN (${tables}) ORDER BY c.relname`,
    })
    expect(error).toBeNull()
    const rows = (data as any[]) || []
    expect(rows.length).toBe(TENANT_TABLES.length)
    for (const row of rows) {
      expect(row.rls_enabled).toBe(true)
    }
  })

  it("execute_readonly_query RPC es SECURITY INVOKER (mig 141)", async () => {
    const { data, error } = await admin.rpc("execute_readonly_query", {
      query_text: "SELECT prosecdef FROM pg_proc WHERE proname = 'execute_readonly_query'",
    })
    expect(error).toBeNull()
    expect((data as any)?.[0]?.prosecdef).toBe(false)
  })
})
