@AGENTS.md

# CLAUDE.md

This file is the Claude Code adapter for this repository.

`AGENTS.md` is the source of truth for project architecture, system design,
commands, tenancy, permissions, API patterns, frontend rules, testing,
documentation structure, and "done" criteria. Do not duplicate those rules here.

## Precedence

1. Follow `AGENTS.md` first.
2. Follow `.claude/rules/` for path-specific or Claude-specific detail.
3. Follow this file for Claude Code behavior.
4. If any rule conflicts with `AGENTS.md`, `AGENTS.md` wins unless the rule is
   explicitly Claude tooling behavior and does not weaken project invariants.

Project invariants that cannot be weakened: tenant isolation, permissions,
service-role usage, financial consistency, secret handling, and validation of
external inputs.

## Claude Code Workflow

- Start by grounding in the repo: read `AGENTS.md`, the touched files, nearby
  tests, relevant migrations/types, and the applicable `.claude/rules/` file.
- Keep changes scoped to the bounded context named in `AGENTS.md`.
- For large or risky changes, present a short implementation plan before editing.
- Do not use archived docs as current guidance unless the user explicitly asks
  for history. The previous long Claude guide is archived at
  `docs/archive/CLAUDE-legacy-2026-07-02.md`.
- For documentation placement, follow `docs/README.md`.

## Claude Rules

Claude Code loads project rules from `.claude/rules/`.

- `finance-accounting.md`: payments, cash, ledger, AFIP, invoices, commissions,
  operator payments, and financial state changes.
- `integrations-webhooks.md`: webhooks, crons, `org_integrations`, external
  tokens, HMAC, idempotency, and service-to-service routes.
- `frontend-ui.md`: dashboard UI, app shell, client components, forms, tables,
  UX states, and visual polish.
- `ai-cerebro.md`: AI Copilot, Cerebro, OCR, OpenAI calls, readonly SQL, prompt
  injection, and model/tool boundaries.

These rules add context. They do not replace the architecture contract in
`AGENTS.md`.

## Skills

- Use `impeccable` for UI/frontend/design work: dashboards, app shell,
  components, forms, responsive behavior, visual hierarchy, accessibility, UX
  writing, polish, hardening, and live design iteration.
- `impeccable` is installed for both Claude and Codex:
  - `.claude/skills/impeccable`
  - `.agents/skills/impeccable`
  - `skills-lock.json`
- Treat `docs/superpowers/` and `.superpowers/` as historical planning artifacts
  unless the user explicitly asks to continue a Superpowers workflow.

## Tooling

- Respect `.claude/settings.json`.
- If a hook reports that `graphify-out/graph.json` exists, read
  `graphify-out/GRAPH_REPORT.md` before broad raw-file searches.
- Use `npm run lint` when changes touch code paths where
  `createAdminClient()` usage or framework linting could be affected.
- Use the smallest focused test command that covers the changed bounded context.
