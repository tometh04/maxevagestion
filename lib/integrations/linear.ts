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

// Cache en memoria (por instancia) de label name -> id ya resueltos, para no
// consultar/crear el label en cada ticket. Best-effort; si la instancia se
// recicla se vuelve a resolver.
const labelIdCache = new Map<string, string>()

/**
 * Resuelve el ID de un label por NOMBRE dentro del team: lo busca y, si no
 * existe, lo crea. Devuelve null si falla (no debe romper la creación del issue).
 * Se usa para el label "cliente" que identifica los tickets cargados desde el
 * producto, sin obligar a copiar IDs a mano.
 */
async function getOrCreateLabelIdByName(
  apiKey: string,
  teamId: string,
  name: string,
): Promise<string | null> {
  const cacheKey = `${teamId}:${name.toLowerCase()}`
  const cached = labelIdCache.get(cacheKey)
  if (cached) return cached

  // 1. Buscar un label existente con ese nombre (case-insensitive).
  const found = await linearRequest<{
    team: { labels: { nodes: { id: string; name: string }[] } } | null
  }>(
    apiKey,
    `query($teamId: String!) { team(id: $teamId) { labels(first: 250) { nodes { id name } } } }`,
    { teamId },
  )
  const existing = found?.team?.labels?.nodes?.find(
    (l) => l.name.toLowerCase() === name.toLowerCase(),
  )
  if (existing) {
    labelIdCache.set(cacheKey, existing.id)
    return existing.id
  }

  // 2. No existe -> crearlo scopeado al team.
  const created = await linearRequest<{
    issueLabelCreate: { success: boolean; issueLabel: { id: string } | null }
  }>(
    apiKey,
    `mutation($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { success issueLabel { id } } }`,
    { input: { teamId, name, color: "#4EA7FC" } },
  )
  const newId = created?.issueLabelCreate?.issueLabel?.id ?? null
  if (newId) labelIdCache.set(cacheKey, newId)
  else console.error(`[linear] no se pudo crear/resolver el label "${name}"`)
  return newId
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

  // Label "cliente" aplicado a TODOS los tickets de soporte, para distinguir en
  // Linear los que cargan los clientes desde el producto. Nombre configurable
  // por env (default "Cliente"); se auto-crea si no existe.
  const clientLabelName = process.env.LINEAR_CLIENT_LABEL || "Cliente"
  const clientLabelId = await getOrCreateLabelIdByName(config.apiKey, config.teamId, clientLabelName)

  const labelIds = [
    ...(clientLabelId ? [clientLabelId] : []),
    ...resolveLabelIds({ category: input.category, severity: input.severity }),
  ]

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

/**
 * Firma que vibook agrega a los comentarios que postea en Linear (respuestas del
 * ticket → comentario). El webhook de Comment ignora los comentarios que la
 * contienen, para no reimportarlos como respuesta (evita el loop/duplicado).
 */
export const APP_COMMENT_SIGNATURE = "↩ vía vibook"

const COMMENT_CREATE_MUTATION = `
  mutation CommentCreate($input: CommentCreateInput!) {
    commentCreate(input: $input) { success comment { id } }
  }
`

/**
 * Postea un comentario en un issue de Linear (respuesta del ticket → Linear).
 * Best-effort: devuelve false si no se pudo, sin lanzar. Antepone la firma
 * APP_COMMENT_SIGNATURE para que el webhook no lo reimporte.
 */
export async function createLinearComment(
  issueId: string,
  body: string,
): Promise<boolean> {
  const config = getConfig()
  if (!config) return false

  const signedBody = `${body}\n\n_${APP_COMMENT_SIGNATURE}_`
  const data = await linearRequest<{ commentCreate: { success: boolean } }>(
    config.apiKey,
    COMMENT_CREATE_MUTATION,
    { input: { issueId, body: signedBody } },
  )
  if (!data?.commentCreate?.success) {
    console.error("[linear] commentCreate no devolvió success")
    return false
  }
  return true
}

const ATTACHMENT_CREATE_MUTATION = `
  mutation AttachmentCreate($input: AttachmentCreateInput!) {
    attachmentCreate(input: $input) { success attachment { id } }
  }
`

/**
 * Adjunta una URL al issue de Linear (sección Attachments). Los archivos viven
 * en el bucket público de Supabase, así que la URL es accesible desde Linear.
 * Best-effort: devuelve false si falla, sin lanzar.
 */
export async function createLinearAttachment(
  issueId: string,
  url: string,
  title: string,
): Promise<boolean> {
  const config = getConfig()
  if (!config) return false

  const data = await linearRequest<{ attachmentCreate: { success: boolean } }>(
    config.apiKey,
    ATTACHMENT_CREATE_MUTATION,
    { input: { issueId, url, title } },
  )
  return !!data?.attachmentCreate?.success
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
