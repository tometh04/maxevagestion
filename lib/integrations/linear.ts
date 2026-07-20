/**
 * Cliente mínimo de Linear (GraphQL) para rutear tickets de soporte al backlog
 * de desarrollo. Solo se usa para bugs/mejoras — las consultas no llegan acá.
 *
 * TODO el módulo es best-effort: si faltan LINEAR_API_KEY / LINEAR_TEAM_ID, o si
 * la API falla, devuelve null sin lanzar. El ticket igual se guarda en la DB; el
 * issue de Linear es un "extra" que no debe romper el submit del usuario.
 *
 * Auth: header Authorization con la API key personal/workspace (SIN "Bearer").
 * Docs: https://developers.linear.app/docs/graphql/working-with-the-graphql-api
 */

const LINEAR_API_URL = "https://api.linear.app/graphql"

export type LinearPriority = 0 | 1 | 2 | 3 | 4 // 0 none, 1 urgent, 2 high, 3 medium, 4 low

export type CreatedLinearIssue = {
  id: string
  identifier: string // ej. "VIB-42"
  url: string
}

/** Mapea la prioridad del ticket (support_tickets.priority) a la de Linear. */
export function mapToLinearPriority(
  priority: "low" | "normal" | "high" | "urgent",
): LinearPriority {
  switch (priority) {
    case "urgent":
      return 1
    case "high":
      return 2
    case "normal":
      return 3
    case "low":
      return 4
    default:
      return 0
  }
}

function getConfig(): { apiKey: string; teamId: string } | null {
  const apiKey = process.env.LINEAR_API_KEY
  const teamId = process.env.LINEAR_TEAM_ID
  if (!apiKey || !teamId) {
    console.warn("[linear] LINEAR_API_KEY o LINEAR_TEAM_ID no configurados; se omite el sync a Linear.")
    return null
  }
  return { apiKey, teamId }
}

async function linearRequest<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T | null> {
  try {
    const res = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ query, variables }),
    })
    const json = await res.json()
    if (json.errors) {
      console.error("[linear] GraphQL errors:", JSON.stringify(json.errors))
      return null
    }
    return json.data as T
  } catch (err) {
    console.error("[linear] request falló:", err)
    return null
  }
}

/**
 * Resuelve IDs de labels por env vars opcionales. Si un label no está
 * configurado, se omite (Linear crea el issue igual sin él).
 * Convención de env: LINEAR_LABEL_BUG, LINEAR_LABEL_IMPROVEMENT,
 * LINEAR_LABEL_SEV_LOW/MEDIUM/HIGH/CRITICAL.
 */
function resolveLabelIds(input: {
  category: "bug" | "improvement" | "question"
  severity: "low" | "medium" | "high" | "critical"
}): string[] {
  const ids: (string | undefined)[] = []
  if (input.category === "bug") ids.push(process.env.LINEAR_LABEL_BUG)
  if (input.category === "improvement") ids.push(process.env.LINEAR_LABEL_IMPROVEMENT)
  ids.push(process.env[`LINEAR_LABEL_SEV_${input.severity.toUpperCase()}`])
  return ids.filter((x): x is string => typeof x === "string" && x.length > 0)
}

const ISSUE_CREATE_MUTATION = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { id identifier url }
    }
  }
`

/**
 * Crea un issue en Linear. Devuelve el issue creado o null si no se pudo
 * (config faltante / API caída / mutation sin success).
 */
export async function createLinearIssue(input: {
  title: string
  description: string
  priority: LinearPriority
  category: "bug" | "improvement" | "question"
  severity: "low" | "medium" | "high" | "critical"
}): Promise<CreatedLinearIssue | null> {
  const config = getConfig()
  if (!config) return null

  const labelIds = resolveLabelIds({ category: input.category, severity: input.severity })

  const data = await linearRequest<{
    issueCreate: { success: boolean; issue: CreatedLinearIssue | null }
  }>(config.apiKey, ISSUE_CREATE_MUTATION, {
    input: {
      teamId: config.teamId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      ...(labelIds.length > 0 ? { labelIds } : {}),
    },
  })

  if (!data?.issueCreate?.success || !data.issueCreate.issue) {
    console.error("[linear] issueCreate no devolvió success/issue")
    return null
  }
  return data.issueCreate.issue
}

export type LinearDiagnostics = {
  env: { LINEAR_API_KEY: boolean; LINEAR_TEAM_ID: boolean; LINEAR_WEBHOOK_SECRET: boolean }
  configuredTeamId: string | null
  auth: { id: string; name: string; email: string } | null
  teams: { id: string; key: string; name: string }[] | null
  teamIdMatches: boolean | null
  error: string | null
}

/**
 * Diagnóstico de la integración con Linear (para /api/admin/integrations/linear/
 * diagnostics). Reporta qué env vars están presentes (sin exponer valores),
 * valida la API key llamando a `viewer`, y lista los teams con su UUID real para
 * verificar que LINEAR_TEAM_ID es correcto (gotcha típico: usar la key en vez del id).
 */
export async function getLinearDiagnostics(): Promise<LinearDiagnostics> {
  const apiKey = process.env.LINEAR_API_KEY
  const teamId = process.env.LINEAR_TEAM_ID
  const result: LinearDiagnostics = {
    env: {
      LINEAR_API_KEY: !!apiKey,
      LINEAR_TEAM_ID: !!teamId,
      LINEAR_WEBHOOK_SECRET: !!process.env.LINEAR_WEBHOOK_SECRET,
    },
    configuredTeamId: teamId ?? null,
    auth: null,
    teams: null,
    teamIdMatches: null,
    error: null,
  }

  if (!apiKey) {
    result.error = "LINEAR_API_KEY ausente en el entorno."
    return result
  }

  try {
    const res = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify({
        query: `query { viewer { id name email } teams { nodes { id key name } } }`,
      }),
    })
    const json = await res.json()
    if (json.errors) {
      result.error = `Linear rechazó la consulta: ${JSON.stringify(json.errors)}`
      return result
    }
    result.auth = json.data?.viewer ?? null
    result.teams = json.data?.teams?.nodes ?? null
    result.teamIdMatches = teamId
      ? (result.teams ?? []).some((t) => t.id === teamId)
      : false
  } catch (err) {
    result.error = `Fallo de red llamando a Linear: ${String(err)}`
  }
  return result
}

/**
 * Mapea el tipo de estado de un issue de Linear al status del support_ticket.
 * Linear state.type ∈ backlog|unstarted|started|completed|canceled|triage.
 */
export function mapLinearStateToTicketStatus(
  stateType: string,
): "open" | "in_progress" | "resolved" | "closed" {
  switch (stateType) {
    case "started":
      return "in_progress"
    case "completed":
      return "resolved"
    case "canceled":
      return "closed"
    case "backlog":
    case "unstarted":
    case "triage":
    default:
      return "open"
  }
}
