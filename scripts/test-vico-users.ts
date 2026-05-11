/**
 * scripts/test-vico-users.ts
 *
 * E2E API-level smoke test para los 10 users de VICO.
 *
 * Por cada user: login vía Supabase Auth → obtiene session → arma cookie SSR
 * → hace GET a una serie de endpoints clave → reporta matriz status code.
 *
 * Uso:
 *   npx tsx scripts/test-vico-users.ts
 *
 * Output: tabla user × endpoint con HTTP status codes. Cualquier 5xx o 401/403
 * inesperado se flagea con ⚠️.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const APP_URL = "https://app.vibook.ai"
const PASSWORD = "VicoTravel2026"

const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? ""
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`

type UserSpec = { email: string; role: string }

const USERS: UserSpec[] = [
  { email: "e.maineri@vicotravelgroup.com", role: "SUPER_ADMIN" },
  { email: "a.lagos@vicotravelgroup.com", role: "ADMIN" },
  { email: "m.cassano@vicotravelgroup.com", role: "CONTABLE" },
  { email: "f.gudino@vicotravelgroup.com", role: "SELLER (postventa)" },
  { email: "ae.ibarra@vicotravelgroup.com", role: "SELLER" },
  { email: "d.araujo@vicotravelgroup.com", role: "SELLER" },
  { email: "e.laporte@vicotravelgroup.com", role: "SELLER" },
  { email: "l.marchiori.vtg@gmail.com", role: "SELLER" },
  { email: "J.ahumada.vtg@gmail.com", role: "SELLER" },
  { email: "a.sanchez.vtg@gmail.com", role: "SELLER" },
]

// Endpoints to probe. Each entry: label (short) + URL path + expected behavior.
// expectStatus: list of acceptable statuses for ANY role (e.g., 200, 403 OK depending on permissions).
type Endpoint = { label: string; path: string; method?: "GET" | "POST" }
const ENDPOINTS: Endpoint[] = [
  { label: "dashboard", path: "/api/dashboard/kpis" },
  { label: "leads", path: "/api/leads?limit=10" },
  { label: "operations", path: "/api/operations?limit=10" },
  { label: "customers", path: "/api/customers?limit=10" },
  { label: "cash-summary", path: "/api/cash/summary" },
  { label: "cash-movements", path: "/api/cash/movements?limit=10" },
  { label: "ledger-stats", path: "/api/accounting/ledger/stats" },
  { label: "alerts", path: "/api/alerts?status=PENDING&limit=10" },
  { label: "reports-sales", path: "/api/reports/sales" },
  { label: "commissions", path: "/api/commissions?limit=10" },
  { label: "settings-users", path: "/api/settings/users" },
  { label: "calendar", path: "/api/calendar/events" },
  { label: "tasks", path: "/api/tasks?limit=10" },
  { label: "cust-stats", path: "/api/customers/statistics" },
  { label: "pend-balances", path: "/api/analytics/pending-balances" },
]

async function loginAndGetCookie(email: string): Promise<string | null> {
  const supabase = createClient(SUPABASE_URL, ANON_KEY)
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: PASSWORD,
  })
  if (error || !data.session) {
    console.error(`  ✗ login failed for ${email}: ${error?.message}`)
    return null
  }
  // Supabase SSR cookie format: base64-encoded JSON of the session
  // Try the modern format first
  const sessionPayload = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at,
    token_type: data.session.token_type,
    user: data.session.user,
  }
  // Base64 the JSON
  const encoded = `base64-${Buffer.from(JSON.stringify(sessionPayload)).toString("base64")}`
  return `${COOKIE_NAME}=${encoded}`
}

async function probeEndpoint(cookie: string, path: string): Promise<number> {
  try {
    const res = await fetch(`${APP_URL}${path}`, {
      method: "GET",
      headers: { Cookie: cookie, Accept: "application/json" },
      redirect: "manual",
    })
    return res.status
  } catch (e) {
    return 0 // network error
  }
}

function statusFlag(status: number, role: string, label: string): string {
  if (status === 0) return "🔌" // network err
  if (status >= 200 && status < 300) return `${status}`
  if (status >= 300 && status < 400) return `${status}↻`
  if (status === 401 || status === 403) {
    // Permission denied — depends on role
    if (role === "SELLER" || role === "SELLER (postventa)") {
      const expectDenied = ["settings-users", "cust-stats", "pend-balances"]
      return expectDenied.includes(label) ? `${status}✓` : `${status}⚠`
    }
    if (role === "CONTABLE") {
      const expectDenied = ["leads", "customers", "settings-users"]
      return expectDenied.includes(label) ? `${status}✓` : `${status}⚠`
    }
    if (role === "ADMIN") return `${status}⚠` // admin debería tener todo
    if (role === "SUPER_ADMIN") return `${status}🚨` // súper raro
    return `${status}?`
  }
  if (status >= 500) return `${status}🚨` // server error siempre malo
  return `${status}`
}

async function main() {
  console.log("E2E API smoke test — VICO users")
  console.log("=".repeat(80))
  console.log(`App: ${APP_URL}`)
  console.log(`Project ref: ${PROJECT_REF}`)
  console.log(`Users: ${USERS.length}, Endpoints: ${ENDPOINTS.length}`)
  console.log("")

  // Results matrix
  const matrix: Record<string, Record<string, string>> = {}

  for (const user of USERS) {
    console.log(`▸ ${user.email} (${user.role})`)
    const cookie = await loginAndGetCookie(user.email)
    if (!cookie) {
      matrix[user.email] = {}
      for (const ep of ENDPOINTS) matrix[user.email][ep.label] = "AUTH_FAIL"
      continue
    }
    matrix[user.email] = {}
    for (const ep of ENDPOINTS) {
      const status = await probeEndpoint(cookie, ep.path)
      matrix[user.email][ep.label] = statusFlag(status, user.role, ep.label)
    }
    console.log(`  done`)
  }

  // Print matrix table
  console.log("")
  console.log("=".repeat(80))
  console.log("MATRIX")
  console.log("=".repeat(80))
  console.log("Legend: 200 OK | 401/403✓ esperado | 401/403⚠ inesperado | 5xx🚨 error servidor")
  console.log("")
  // Header
  const colWidth = 14
  const labelCol = 30
  const header = "user/role".padEnd(labelCol) + ENDPOINTS.map(e => e.label.slice(0, colWidth - 1).padEnd(colWidth)).join("")
  console.log(header)
  console.log("-".repeat(header.length))
  for (const user of USERS) {
    const row =
      `${user.email.slice(0, 22)} ${user.role.slice(0, 6)}`.padEnd(labelCol) +
      ENDPOINTS.map(e => (matrix[user.email][e.label] ?? "—").padEnd(colWidth)).join("")
    console.log(row)
  }

  // Summary of red flags
  console.log("")
  console.log("=".repeat(80))
  console.log("ALERTAS")
  console.log("=".repeat(80))
  const alerts: string[] = []
  for (const user of USERS) {
    for (const ep of ENDPOINTS) {
      const v = matrix[user.email][ep.label] ?? ""
      if (v.includes("⚠") || v.includes("🚨")) {
        alerts.push(`  ${user.email} (${user.role}) → ${ep.label}: ${v}`)
      }
    }
  }
  if (alerts.length === 0) {
    console.log("✅ Sin alertas — todo coincide con lo esperado.")
  } else {
    console.log(`⚠️  ${alerts.length} casos a revisar:`)
    for (const a of alerts) console.log(a)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
