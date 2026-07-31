# Agente autónomo de vibook (Linear → draft PR)

Toma issues de Linear etiquetados `agent-ready`, corre el Claude Agent SDK sobre el
repo respetando `AGENTS.md`, y propone un cambio chico y seguro que un humano revisa
y mergea. **Nunca mergea.** Corre en GitHub Actions (runner efímero) — sin servidor
propio, sin service-role, sin tocar la base ni datos de tenant.

## Piezas

| Archivo | Rol |
|---|---|
| `.github/workflows/linear-agent.yml` | Dispara el orquestador (schedule cada 15 min + manual). |
| `scripts/agent/run.mjs` | Orquestador: query Linear → agente → guardrails → dry-run/PR. |
| `scripts/agent/blocklist.json` | Paths protegidos + topes de diff + contenido prohibido. |
| `scripts/agent/prompt.md` | Instrucciones de tarea del agente. |

## Dos capas de seguridad

1. **Selección humana** (`agent-ready`): un admin decide *qué se intenta*.
2. **Guardrails de máquina** (la red real, aunque el label esté mal puesto): el diff
   no toca `blocklist.json`, no agrega `createAdminClient`/`service_role`/`as any`,
   no excede los topes, y pasa `check:admin-client` + `lint` + tests. Si algo falla →
   el issue queda `agent-blocked` con un comentario del motivo. **Nunca mergea.**

## Setup (Fase 0, una vez)

### 1. Labels en Linear
Crear en el team: `agent-ready`, `agent-in-progress`, `agent-done`, `agent-blocked`.
(Si no existen, `run.mjs` los auto-crea por nombre la primera vez.)

### 2. Secrets del repo en GitHub (`Settings → Secrets and variables → Actions`)
- `ANTHROPIC_API_KEY` — key de Anthropic para el Agent SDK.
- `AGENT_LINEAR_API_KEY` — API key de Linear con permiso de leer issues y editar
  labels/comentarios. Se nombra distinto de la `LINEAR_API_KEY` del app a propósito.
- `AGENT_LINEAR_TEAM_ID` — UUID del team (el mismo que usás en el app).
- (opcional) variable `AGENT_MODEL` — id de modelo a usar; si se omite, usa el default del SDK.

> **No** cargar acá `SUPABASE_SERVICE_ROLE_KEY` ni env financieras. El agente no las
> necesita y no debe tenerlas.

### 3. Permitir que Actions abra PRs
`Settings → Actions → General → Workflow permissions`: activar **Read and write
permissions** y **Allow GitHub Actions to create and approve pull requests**.

## Cómo usarlo

- **Empezar SIEMPRE en dry-run.** El schedule corre en `dry-run` por default: el
  agente comenta el plan + diff en el issue, sin abrir PR. Sirve para calibrar
  confianza sin riesgo.
- **Correr a mano:** pestaña Actions → `linear-agent` → *Run workflow* → elegir
  `mode` (`dry-run` o `pr`) y `max_issues`.
- **Pasar a draft PR:** cuando las propuestas en dry-run sean consistentemente
  buenas, correr con `mode=pr` (a mano) o cambiar el default del schedule. El PR
  sale como **draft** con `Fixes VIB-xxx` para que Linear lo auto-linkee.

## Flujo de labels

```
agent-ready ──(agente toma)──► agent-in-progress
   ├─ éxito (dry-run) ─► comenta diff        + agent-done
   ├─ éxito (pr)      ─► abre draft PR        + agent-done
   └─ bloqueado       ─► comenta motivo       + agent-blocked  (vuelve a humano)
```

Un issue con cualquier `agent-*` de proceso ya no se reprocesa. Para reintentar,
quitar `agent-done`/`agent-blocked` y dejar solo `agent-ready`.

## Verificación (ver el plan)

1. **Guardrail primero:** un issue `agent-ready` que pida tocar algo del blocklist
   (ej. `lib/accounting/`) debe terminar en `agent-blocked` sin PR.
2. **Camino feliz dry-run:** un issue de baja superficie (copy, estado vacío) debe
   comentar un diff razonable con lint+tests en verde.
3. **Draft PR:** con `mode=pr`, confirmar draft PR linkeado, CI verde, sin merge.
4. **Loop de estado:** al mergear a mano y marcar Done en Linear, el webhook
   existente (`app/api/webhooks/linear/route.ts`) resuelve el ticket original.
