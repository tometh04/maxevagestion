#!/usr/bin/env node
/**
 * Orquestador del agente autónomo de vibook.
 *
 * Flujo (una corrida = un lote):
 *   1. Query a Linear por issues con el label `agent-ready` que todavía no fueron
 *      tomados (sin `agent-in-progress` / `agent-done` / `agent-blocked`).
 *   2. Por cada issue (hasta MAX_ISSUES): marca `agent-in-progress`, corre el
 *      Claude Agent SDK sobre un árbol limpio pasándole `prompt.md` + el issue.
 *   3. Guardrails de máquina (la red real; el label es solo curaduría). Todo se
 *      evalúa SOBRE EL DIFF DEL AGENTE, no repo-wide, para no bloquearlo por deuda
 *      preexistente en main:
 *        - el diff no toca paths de `blocklist.json`
 *        - el diff no agrega contenido prohibido (createAdminClient, service_role, `as any`, …)
 *        - tope de archivos/líneas cambiadas
 *        - `next lint` sobre los archivos cambiados + tests relacionados (jest --findRelatedTests)
 *   4. Salida:
 *        - MODE=dry-run  -> comenta el plan + diff en el issue, marca `agent-done`.
 *        - MODE=pr       -> branch + commit + push + draft PR (gh), comenta el link, `agent-done`.
 *        - bloqueado     -> comenta el motivo, marca `agent-blocked`, descarta el diff.
 *
 * NUNCA mergea. Corre en un runner efímero de CI SIN service-role ni env financieras.
 *
 * Env requeridas: LINEAR_API_KEY, LINEAR_TEAM_ID, ANTHROPIC_API_KEY,
 *                 GITHUB_TOKEN (para gh en MODE=pr), GITHUB_REPOSITORY (owner/repo).
 * Env opcionales: MODE (dry-run|pr, default dry-run), MAX_ISSUES (default 3),
 *                 AGENT_MODEL (default lo que use el SDK).
 */

import { readFileSync, appendFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, "..", "..")
const LINEAR_API_URL = "https://api.linear.app/graphql"

const MODE = (process.env.MODE || "dry-run").toLowerCase() // "dry-run" | "pr"
const MAX_ISSUES = Number(process.env.MAX_ISSUES || "3")
const READY_LABEL = "agent-ready"
const IN_PROGRESS_LABEL = "agent-in-progress"
const DONE_LABEL = "agent-done"
const BLOCKED_LABEL = "agent-blocked"

const blocklist = JSON.parse(readFileSync(join(__dirname, "blocklist.json"), "utf8"))
const agentPrompt = readFileSync(join(__dirname, "prompt.md"), "utf8")

// Uso de tokens acumulado por corrida (una entrada por tarea con datos de uso).
const sessionUsage = []

// ── helpers de shell ────────────────────────────────────────────────────────
function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  })
}
function shTry(cmd, args, opts = {}) {
  try {
    return { ok: true, out: sh(cmd, args, opts) }
  } catch (err) {
    return { ok: false, out: (err.stdout || "") + (err.stderr || "") + String(err.message || "") }
  }
}
function log(...a) {
  console.log("[agent]", ...a)
}

// ── Linear GraphQL (mismo patrón que lib/integrations/linear.ts) ─────────────
async function linear(query, variables = {}) {
  const apiKey = requireEnv("LINEAR_API_KEY")
  const res = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error("Linear GraphQL: " + JSON.stringify(json.errors))
  return json.data
}

const labelIdCache = new Map()
async function getOrCreateLabelId(name) {
  const teamId = requireEnv("LINEAR_TEAM_ID")
  const key = `${teamId}:${name.toLowerCase()}`
  if (labelIdCache.has(key)) return labelIdCache.get(key)
  const found = await linear(
    `query($teamId:String!){ team(id:$teamId){ labels(first:250){ nodes{ id name } } } }`,
    { teamId },
  )
  const existing = found?.team?.labels?.nodes?.find(
    (l) => l.name.toLowerCase() === name.toLowerCase(),
  )
  if (existing) {
    labelIdCache.set(key, existing.id)
    return existing.id
  }
  const created = await linear(
    `mutation($input:IssueLabelCreateInput!){ issueLabelCreate(input:$input){ success issueLabel{ id } } }`,
    { input: { teamId, name, color: "#8b5cf6" } },
  )
  const id = created?.issueLabelCreate?.issueLabel?.id
  if (!id) throw new Error(`No se pudo crear/resolver el label "${name}"`)
  labelIdCache.set(key, id)
  return id
}

async function fetchEligibleIssues() {
  const teamId = requireEnv("LINEAR_TEAM_ID")
  const data = await linear(
    `query($teamId:String!,$label:String!){
       team(id:$teamId){
         issues(first:50, filter:{ labels:{ name:{ eq:$label } } }){
           nodes{ id identifier title description url labels{ nodes{ id name } } }
         }
       }
     }`,
    { teamId, label: READY_LABEL },
  )
  const nodes = data?.team?.issues?.nodes ?? []
  // Excluir los que ya fueron tomados en corridas previas.
  return nodes.filter((iss) => {
    const names = (iss.labels?.nodes ?? []).map((l) => l.name.toLowerCase())
    return ![IN_PROGRESS_LABEL, DONE_LABEL, BLOCKED_LABEL].some((l) => names.includes(l))
  })
}

async function addLabel(issueId, name) {
  const labelId = await getOrCreateLabelId(name)
  await linear(
    `mutation($id:String!,$labelId:String!){ issueAddLabel(id:$id,labelId:$labelId){ success } }`,
    { id: issueId, labelId },
  )
}
async function removeLabel(issueId, name) {
  const labelId = await getOrCreateLabelId(name)
  await linear(
    `mutation($id:String!,$labelId:String!){ issueRemoveLabel(id:$id,labelId:$labelId){ success } }`,
    { id: issueId, labelId },
  )
}
async function comment(issueId, body) {
  await linear(
    `mutation($input:CommentCreateInput!){ commentCreate(input:$input){ success } }`,
    { input: { issueId, body: `${body}\n\n_🤖 agente autónomo de vibook_` } },
  )
}

// ── matching de globs del blocklist ──────────────────────────────────────────
function globToRegExp(glob) {
  let re = "^"
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // ** => cualquier cosa incluyendo separadores
        re += ".*"
        i++
        if (glob[i + 1] === "/") i++ // consumir el '/' de '**/'
      } else {
        re += "[^/]*" // * => cualquier cosa menos separador
      }
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c
    } else if (c === "?") {
      re += "[^/]"
    } else {
      re += c
    }
  }
  return new RegExp(re + "$")
}
const protectedRes = blocklist.protectedGlobs.map(globToRegExp)
function touchesProtected(files) {
  return files.filter((f) => protectedRes.some((re) => re.test(f)))
}

// ── guardrails sobre el árbol de trabajo ─────────────────────────────────────
function changedFiles() {
  const out = sh("git", ["diff", "--name-only", "HEAD"]).trim()
  return out ? out.split("\n").map((s) => s.trim()).filter(Boolean) : []
}
function addedLines() {
  const diff = sh("git", ["diff", "--unified=0", "HEAD"])
  return diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1))
}
function changedLineCount() {
  const stat = sh("git", ["diff", "--numstat", "HEAD"]).trim()
  if (!stat) return 0
  return stat.split("\n").reduce((acc, line) => {
    const [add, del] = line.split("\t")
    return acc + (Number(add) || 0) + (Number(del) || 0)
  }, 0)
}

/** Devuelve { ok, reason }. Corre TODOS los checks y junta el primer fallo. */
function runGuardrails(files) {
  if (files.length === 0) return { ok: false, reason: "El agente no dejó cambios en el árbol." }

  const hits = touchesProtected(files)
  if (hits.length > 0)
    return { ok: false, reason: `El diff toca superficies protegidas (blocklist): ${hits.join(", ")}` }

  if (files.length > blocklist.maxChangedFiles)
    return { ok: false, reason: `Demasiados archivos cambiados (${files.length} > ${blocklist.maxChangedFiles}).` }

  const lines = changedLineCount()
  if (lines > blocklist.maxChangedLines)
    return { ok: false, reason: `Diff demasiado grande (${lines} líneas > ${blocklist.maxChangedLines}).` }

  // createAdminClient / service-role / `as any` introducidos por el agente: se
  // detectan sobre las LÍNEAS AGREGADAS del diff. Esto reemplaza al
  // `check:admin-client` repo-wide (que además falla por deuda preexistente en
  // main que no es culpa del agente).
  const added = addedLines().join("\n")
  for (const pat of blocklist.forbiddenAddedContent) {
    if (new RegExp(pat).test(added))
      return { ok: false, reason: `El diff introduce contenido prohibido: /${pat}/` }
  }

  // Lint SOLO sobre los archivos que tocó el agente. NO repo-wide: main puede
  // tener deuda de lint/admin-client preexistente, y no queremos bloquear al
  // agente por errores que ya estaban ahí antes de su cambio.
  const lintable = files.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f))
  if (lintable.length > 0) {
    const lint = shTry("npx", ["next", "lint", ...lintable.flatMap((f) => ["--file", f])])
    if (!lint.ok)
      return { ok: false, reason: "Lint falló en los archivos cambiados.\n\n```\n" + tail(lint.out) + "\n```" }
  }

  // Tests RELACIONADOS a los archivos cambiados, no toda la suite (evita
  // flakiness/lentitud y fallos preexistentes ajenos al cambio).
  const test = shTry("npx", ["jest", "--passWithNoTests", "--findRelatedTests", ...files])
  if (!test.ok)
    return { ok: false, reason: "Tests relacionados a los cambios fallaron.\n\n```\n" + tail(test.out) + "\n```" }

  return { ok: true, reason: "" }
}

function tail(s, n = 2000) {
  return s.length > n ? s.slice(-n) : s
}

// ── invocación del Claude Agent SDK ──────────────────────────────────────────
async function runAgentOnIssue(issue) {
  let query
  try {
    ;({ query } = await import("@anthropic-ai/claude-agent-sdk"))
  } catch {
    throw new Error(
      "No se pudo importar @anthropic-ai/claude-agent-sdk. Instalalo en el workflow: `npm i -g @anthropic-ai/claude-agent-sdk` o como devDependency.",
    )
  }

  const task = [
    agentPrompt,
    "\n\n---\n\n# Issue de Linear a resolver\n",
    `**${issue.identifier} — ${issue.title}**\n`,
    issue.description || "(sin descripción)",
  ].join("\n")

  let finalText = ""
  const response = query({
    prompt: task,
    options: {
      cwd: REPO_ROOT,
      permissionMode: "bypassPermissions", // sandbox efímero de CI; el gate real es el post-check
      // NO cargamos CLAUDE.md/AGENTS.md automáticamente: AGENTS.md es enorme y se
      // re-mandaría en cada turno (fuga de tokens). El prompt.md ya destila las
      // reglas críticas y la seguridad real son los guardrails de máquina. El
      // agente lee AGENTS.md / .claude/rules ON-DEMAND solo si la tarea lo amerita.
      maxTurns: Number(process.env.AGENT_MAX_TURNS || "20"), // tope de turnos: una tarea simple no necesita más
      ...(process.env.AGENT_MODEL ? { model: process.env.AGENT_MODEL } : {}),
    },
  })
  let usage = null
  let finishedOk = false
  for await (const msg of response) {
    if (msg.type === "assistant") {
      const text = (msg.message?.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
      if (text) finalText = text
    } else if (msg.type === "result") {
      if (typeof msg.result === "string") finalText = msg.result
      // El mensaje `result` trae el uso agregado de toda la sesión del agente.
      finishedOk = msg.subtype === "success" && !msg.is_error
      usage = {
        input: msg.usage?.input_tokens ?? 0,
        output: msg.usage?.output_tokens ?? 0,
        cacheRead: msg.usage?.cache_read_input_tokens ?? 0,
        cacheWrite: msg.usage?.cache_creation_input_tokens ?? 0,
        costUsd: typeof msg.total_cost_usd === "number" ? msg.total_cost_usd : null,
        turns: msg.num_turns ?? null,
      }
    }
  }
  return { summary: finalText.trim(), usage, finishedOk }
}

// ── ciclo por issue ──────────────────────────────────────────────────────────
async function resetTree(baseSha) {
  sh("git", ["reset", "--hard", baseSha])
  sh("git", ["clean", "-fd"]) // sin -x: preserva node_modules ignorado
}

async function processIssue(issue, baseSha, baseBranch) {
  log(`→ ${issue.identifier}: ${issue.title}`)
  await addLabel(issue.id, IN_PROGRESS_LABEL)

  let summary, usage, finishedOk
  try {
    ;({ summary, usage, finishedOk } = await runAgentOnIssue(issue))
  } catch (err) {
    await block(issue, `El agente falló al ejecutar: ${String(err.message || err)}`)
    await resetTree(baseSha)
    return
  }

  if (usage) {
    sessionUsage.push({ identifier: issue.identifier, ...usage })
    log(
      `  tokens ${issue.identifier}: in=${usage.input} cacheR=${usage.cacheRead} ` +
        `cacheW=${usage.cacheWrite} out=${usage.output} turns=${usage.turns}` +
        (usage.costUsd != null ? ` ~$${usage.costUsd.toFixed(4)}` : ""),
    )
  }

  // Si el agente no terminó limpio (se cortó por maxTurns o error del SDK), no
  // confiamos en un diff parcial: va a humano.
  if (!finishedOk) {
    await block(
      issue,
      "El agente no terminó limpio (se cortó por límite de turnos o error interno). Un cambio que necesita tantos pasos no es 'simple' — queda para humano.",
    )
    await resetTree(baseSha)
    return
  }

  const blockedByAgent = /^RESULTADO:\s*BLOQUEADO/im.test(summary)
  const files = changedFiles()

  if (blockedByAgent) {
    await block(issue, `El agente se auto-bloqueó.\n\n${summary}`)
    await resetTree(baseSha)
    return
  }

  const guard = runGuardrails(files)
  if (!guard.ok) {
    await block(issue, `Guardrail: ${guard.reason}`)
    await resetTree(baseSha)
    return
  }

  const diffStat = sh("git", ["diff", "--stat", "HEAD"]).trim()

  if (MODE === "dry-run") {
    const diff = tail(sh("git", ["diff", "HEAD"]), 8000)
    await comment(
      issue.id,
      `**Propuesta (dry-run — no se abrió PR).**\n\n${summary}\n\n**Archivos:**\n\`\`\`\n${diffStat}\n\`\`\`\n\n<details><summary>Diff propuesto</summary>\n\n\`\`\`diff\n${diff}\n\`\`\`\n</details>`,
    )
    await removeLabel(issue.id, IN_PROGRESS_LABEL)
    await addLabel(issue.id, DONE_LABEL)
    await resetTree(baseSha)
    log(`  dry-run: propuesta comentada en ${issue.identifier}`)
    return
  }

  // MODE === "pr"
  const slug = issue.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)
  const branch = `agent/${issue.identifier.toLowerCase()}-${slug}`
  sh("git", ["checkout", "-b", branch])
  sh("git", ["add", "-A"])
  sh("git", ["commit", "-m", `${issue.identifier}: ${issue.title}\n\nFixes ${issue.identifier}\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`])
  sh("git", ["push", "-u", "origin", branch])

  const prBody = `Resuelve **${issue.identifier}**: ${issue.title}\n\n${summary}\n\n---\nGenerado por el agente autónomo de vibook. Draft: revisar antes de mergear. Fixes ${issue.identifier}`
  const pr = shTry("gh", [
    "pr", "create", "--draft",
    "--base", baseBranch,
    "--head", branch,
    "--title", `${issue.identifier}: ${issue.title}`,
    "--body", prBody,
  ])
  if (!pr.ok) {
    await block(issue, `No se pudo abrir el draft PR:\n\n\`\`\`\n${tail(pr.out)}\n\`\`\``)
  } else {
    const url = pr.out.trim().split("\n").pop()
    await comment(issue.id, `Draft PR abierto: ${url}\n\n${summary}`)
    await removeLabel(issue.id, IN_PROGRESS_LABEL)
    await addLabel(issue.id, DONE_LABEL)
    log(`  PR: ${url}`)
  }

  sh("git", ["checkout", baseBranch])
  await resetTree(baseSha)
}

async function block(issue, reason) {
  log(`  BLOQUEADO ${issue.identifier}: ${reason.split("\n")[0]}`)
  await comment(issue.id, `⛔ **No apto para el agente autónomo.**\n\n${reason}\n\nQueda para revisión humana.`)
  await removeLabel(issue.id, IN_PROGRESS_LABEL)
  await addLabel(issue.id, BLOCKED_LABEL)
}

// ── util ─────────────────────────────────────────────────────────────────────
function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Falta la env var ${name}`)
  return v
}

/**
 * Escribe el resumen de consumo de tokens de la corrida al log y, si corre en
 * GitHub Actions, al Job Summary (panel que se ve al abrir el run en Actions).
 */
function emitUsageReport() {
  const sum = (k) => sessionUsage.reduce((a, s) => a + (s[k] || 0), 0)
  const totIn = sum("input")
  const totCacheR = sum("cacheRead")
  const totCacheW = sum("cacheWrite")
  const totOut = sum("output")
  const totTurns = sum("turns")
  const totCost = sessionUsage.reduce((a, s) => a + (s.costUsd || 0), 0)
  const hasCost = sessionUsage.some((s) => s.costUsd != null)

  let md = `## 🤖 Consumo de tokens del agente\n\n`
  md += `MODE=\`${MODE}\` · modelo=\`${process.env.AGENT_MODEL || "default"}\` · tareas con uso: ${sessionUsage.length}\n\n`
  md += `| Issue | input | cache read | cache write | output | turnos |${hasCost ? " costo aprox |" : ""}\n`
  md += `|---|--:|--:|--:|--:|--:|${hasCost ? "--:|" : ""}\n`
  for (const s of sessionUsage) {
    md += `| ${s.identifier} | ${s.input} | ${s.cacheRead} | ${s.cacheWrite} | ${s.output} | ${s.turns ?? "—"} |`
    md += hasCost ? ` ${s.costUsd != null ? "$" + s.costUsd.toFixed(4) : "—"} |\n` : "\n"
  }
  md += `| **Total** | ${totIn} | ${totCacheR} | ${totCacheW} | ${totOut} | ${totTurns} |`
  md += hasCost ? ` **$${totCost.toFixed(4)}** |\n` : "\n"
  md += `\n**Input total procesado** (fresh + cache): ${totIn + totCacheR + totCacheW} · **Output**: ${totOut}\n`

  console.log("\n" + md)
  const f = process.env.GITHUB_STEP_SUMMARY
  if (f) {
    try {
      appendFileSync(f, md + "\n")
    } catch (e) {
      console.error("[agent] no se pudo escribir GITHUB_STEP_SUMMARY:", String(e))
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  requireEnv("LINEAR_API_KEY")
  requireEnv("LINEAR_TEAM_ID")
  requireEnv("ANTHROPIC_API_KEY")

  const baseBranch = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim()
  const baseSha = sh("git", ["rev-parse", "HEAD"]).trim()
  log(`MODE=${MODE} base=${baseBranch}@${baseSha.slice(0, 8)} maxIssues=${MAX_ISSUES}`)

  const eligible = await fetchEligibleIssues()
  log(`${eligible.length} issue(s) con "${READY_LABEL}" sin tomar`)
  const batch = eligible.slice(0, MAX_ISSUES)

  for (const issue of batch) {
    try {
      await processIssue(issue, baseSha, baseBranch)
    } catch (err) {
      log(`  ERROR procesando ${issue.identifier}: ${String(err.message || err)}`)
      try {
        await block(issue, `Error interno del orquestador: ${String(err.message || err)}`)
      } catch {}
      await resetTree(baseSha)
    }
  }
  emitUsageReport()
  log("listo.")
}

main().catch((err) => {
  console.error("[agent] fatal:", err)
  process.exit(1)
})
