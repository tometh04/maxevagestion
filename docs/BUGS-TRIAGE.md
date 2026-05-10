# Vibook — Triage de Bugs y Friction Arquitectural

**Generado**: 2026-05-08 (sweep automatizado con metodología `diagnose` + `improve-codebase-architecture` + security audit)
**Audiencia**: founder + dev nuevo
**Stats**: 9 P0 críticos · 21 P1 importantes · 12 P2 defense-in-depth · 10 deepening opportunities

> **Nota 2026-05-08**: Trello ya no se usa como integración activa. Manychat es el canal real. Findings relacionados a Trello fueron movidos a "Cleanup obsoleto"; findings de Manychat fueron escalados a P1.

> **Cómo usar este doc**: cada finding tiene severidad, archivo:línea exacto, problema concreto y fix propuesto. Los P0 son **blockers para el dev nuevo** — fix antes de release. Los P1 son backlog Q3. Los P2 son backlog Q4. Los refactors arquitecturales son el norte para Q3-Q4.

---

## 🔴 P0 — BLOCKERS (fix antes de entregar al dev nuevo)

### Multi-tenant data leaks

| # | Bug | Archivo | Fix |
|---|---|---|---|
| 1 | `seller_objectives` sin RLS + endpoint sin filtro org/agency. ADMIN de un tenant lista TODOS los objectives | `supabase/migrations/127_create_seller_objectives.sql` + `app/api/commissions/objectives/route.ts:19-38` | Agregar `org_id` col + policy `tenant_isolation` + `getUserAgencyIds().in("agency_id", ...)` en endpoint |
| 2 | `destinations` con RLS `USING (true)` + API global. Agencias polluten el catálogo de otras | `supabase/migrations/114_destinations_master.sql:23-30` + `app/api/destinations/route.ts:17-87` | Agregar `org_id`, RLS por org, scope GET/POST por user.org_id (memory: "catálogos per-tenant siempre") |
| 3 | `itinerary_items` con RLS `USING (true)`. Cualquier user autenticado SELECT/UPDATE/DELETE itinerarios ajenos por UUID-guess | `supabase/migrations/115_itinerary_items.sql:51-56` + `app/api/operations/[id]/itinerary/[itemId]/route.ts` | Policy joining `operations.org_id` + verificar `operation_id ∈ user.org` en API |
| 4 | `audit_logs` GET sin filtro org. ADMIN ve who-did-what de TODOS los tenants | `app/api/audit-logs/route.ts:30-100` | `.eq("org_id", user.org_id)` o join via users |
| 5 | RLS de `alerts` permite ver rows con `org_id IS NULL` desde cualquier tenant. Las 1209 NULL-org alerts son visibles a TODOS | `supabase/migrations/20260331000136_saas_rls_tenant_isolation.sql:93-99` | Backfill NULLs primero, después tightener policy quitando `org_id IS NULL OR ...` |

### Payments / accounting (plata real)

| # | Bug | Archivo | Fix |
|---|---|---|---|
| 6 | Bulk operator-payment **double-pay possible** — flippea `status='PAID'` sin CAS guard, sin idempotency. Dos bulk runs simultáneos = paga 2 veces | `app/api/accounting/operator-payments/bulk/route.ts:360-396` | CAS update `.eq("status","PENDING")` + INSERT con `ON CONFLICT (operator_payment_id, reference)` |
| 7 | `mark-paid` deja payment PAID + ledger creado, pero counterpart silencioso por catch console.error. Cuentas por Cobrar/Pagar **NO se reduce** → deuda nunca cierra. Invisible al endpoint orphans actual | `app/api/payments/mark-paid/route.ts:422+` | Extender `/api/payments/orphans` para detectar missing counterpart; mover counterpart a la transacción del ledger |

### Catalogación pendiente (verify)

| # | Bug | Archivo | Fix |
|---|---|---|---|
| 8 | `app/api/operations/[id]/itinerary/upload-image/route.ts` usa `createAdminClient` — verificar que tenga `getCurrentUser()` + `operation.org_id === user.orgId` antes del upload, sino cualquier user sobrescribe imágenes ajenas | `app/api/operations/[id]/itinerary/upload-image/route.ts` | Verificar y agregar checks si faltan |
| 9 | `expense_receipts` migration `113_gastos_module.sql:30` tiene `DISABLE ROW LEVEL SECURITY`. Verificar que ningún endpoint user-auth lo consulte directo | `supabase/migrations/113_gastos_module.sql:30` | Verificar usage; si hay endpoint user-facing, ENABLE RLS |

> ~~**P0 #8 Trello webhook signature**~~ — descartado 2026-05-08. Trello ya no se usa como integración (Manychat es el canal real). El código completo de Trello pasa a "Cleanup obsoleto" (P1). Ver sección al final.

---

## 🟠 P1 — Backlog Q3 (importantes, no urgentes)

### Cross-agency leak dentro del mismo tenant (multi-agency)

> Lozada Rosario + Lozada Madero comparten tenant. Hoy ADMIN de Rosario ve data de Madero en la API directa. UI filtra después, pero la API expone todo.

| # | Endpoint | Fix |
|---|---|---|
| 11 | `app/api/payments/route.ts:1238-1242` | Pre-resolver `operation_ids` por agency, no filtrar post-fetch |
| 12 | `app/api/commissions/route.ts:25-71` | `.in("agency_id", agencyIds)` para non-SELLER |
| 13 | `app/api/cash/movements/route.ts:395-398` | Usar `cash_movements.agency_id` (ya existe) en query |
| 14 | `app/api/quotations/route.ts:42-68` | `.in("agency_id", agencyIds)` como en operations endpoint |
| 15 | `cash-boxes`, `card-transactions`, `payment-coupons` — `if (user.role !== "SUPER_ADMIN")` bypassea filtro. En SaaS cada tenant tiene su SUPER_ADMIN, leak entre agencies | Aplicar siempre `.in("agency_id", agencyIds)` regardless del role |
| 16 | `app/api/tasks/route.ts:28-29` `// SUPER_ADMIN ve todo` — mismo bug | Idem |

### Multi-currency mal sumado en reports

| # | Bug | Archivo | Fix |
|---|---|---|---|
| 17 | `monthly-position` Resultado del mes suma `p.amount` por currency, divide bucket ARS por `tcParaCalculos` (rate de hoy). Ignora `payment.amount_usd` real. Pagos TC mixto se distorsionan | `app/api/accounting/monthly-position/route.ts:461-466, 477-484, 496-504, 514-521` | Usar `payment.amount_usd` en vez de re-convertir |
| 18 | Costos del mes filtra por `paid_at` y suma `paid_amount` sin convertir USD↔ARS con `exchange_rate` real | `app/api/accounting/monthly-position/route.ts:471-484` | Idem |
| 19 | `/api/operators/[id]` `totalCost` y `paidAmount` mezclan currencies sin segregar. Operador con costos ARS+USD muestra balance basura | `app/api/operators/[id]/route.ts:51-57` | Replicar el patrón de `/api/operators/route.ts:81-105` (que sí lo hace bien) |
| 20 | `customer/[id]/statement` `totalOwed`/`totalPaid` suman amounts sin separar moneda, usa `payments[0]?.currency` como display | `app/api/customers/[id]/statement/route.ts:93-101` | Separar buckets ARS/USD, mostrar ambos |

### FX / TZ / multi-currency

| # | Bug | Archivo | Fix |
|---|---|---|---|
| 21 | FX calc en `mark-paid` deja payment PAID + ledger, falla FX, solo log + alert. Margins per operation mal | `app/api/payments/mark-paid/route.ts:466-505` | FX dentro de la misma RPC transaction, o agregar al endpoint orphans |
| 22 | Recurring payments cron usa `today.toISOString().split("T")[0]` (UTC). 21:01 ART = pagos del día siguiente. No incluye `org_id` en INSERT (RLS puede fallar silencioso) | `lib/accounting/recurring-payments.ts:179-180` + `app/api/cron/recurring-payments/route.ts` | `date-fns-tz` + `America/Argentina/Buenos_Aires`; validar `org_id` del operador antes |
| 23 | DELETE de payment busca cash/ledger huérfanos por `(operation_id, type, amount, currency)`. Si hay 2 cuotas iguales, borra la equivocada | `app/api/payments/route.ts:1378-1413` | Match estricto por `payment_id`, no por (op,type,amount,currency) |
| 24 | Duplicate-detection compara floats. 2 cuotas mismo valor mismo día → 409 conflict | `app/api/payments/route.ts:621-635` | Incluir `payment_id` o ventana `created_at` en check |

### AFIP / billing

| # | Bug | Archivo | Fix |
|---|---|---|---|
| 25 | Si `afipService.issueVoucher` lanza excepción, invoice queda `status='pending'` indefinida | `app/api/invoices/[id]/authorize/route.ts:170-213` | try/finally que revierta a `draft` si no llegó a `authorized` |

### Prevention infra

| # | Bug | Archivo | Fix |
|---|---|---|---|
| 26 | `mark-commission-paid` marca TODAS las comisiones de seller con matching como PAID si existe CUALQUIER ledger COMMISSION. No verifica monto | `lib/accounting/mark-commission-paid.ts:32-41` | Match por `commission_record_id` exacto |
| 27 | `cash/sync-movements` recrea cash_movements faltantes sin verificar ledger. Empeora orphans (genera cash sin ledger) | `app/api/cash/sync-movements/route.ts:142-158` | Validar `ledger_movement_id IS NOT NULL` antes |

### AI / prompt injection

| # | Bug | Archivo | Fix |
|---|---|---|---|
| 28 | AI Copilot expone `execute_query` (SQL libre via LLM). Prompt injection en lead notes / customer name vía Manychat/Trello = LLM dumpea data del scope del user | `app/api/ai/route.ts:768-786, 790` | Restringir a tools curados de `lib/ai/tools.ts`, sanitizar user content antes del LLM, allowlist de tablas en RPC |

### Auth gaps

| # | Bug | Archivo | Fix |
|---|---|---|---|
| 29 | Endpoints `/api/auth/register`, `/login`, `/forgot-password` SIN rate limit (cero `withRateLimit`) | `app/api/auth/**` | Agregar rate limit (con Upstash Redis idealmente, no in-memory) |
| 29B | **Manychat webhook static API key, sin replay protection** — es el canal activo de comunicación con cliente (reemplaza al obsoleto Trello). Si la key leakea (logs, browser DevTools), attacker puede crear leads spam, modificar leads, replay forever | `app/api/webhooks/manychat/route.ts:42` | Implementar HMAC signature + timestamp (Manychat soporta custom headers); rotar API key + log a `security_audit` |

### Cleanup obsoleto (Trello)

| # | Item | Archivo | Acción |
|---|---|---|---|
| 29C | **Borrar integración Trello entera** — ya no se usa, se reemplazó por Manychat. Mantenerla = surface attack innecesaria + confusión para dev nuevo (HANDOVER y CLAUDE.md la mencionan como activa) | `app/api/trello/**` (13 routes), `lib/trello/`, `app/api/settings/trello/route.ts`, sidebar Settings → Trello tab, refs en `lib/manychat/sync.ts`, `lib/ai/tools-extended.ts`, `app/api/leads/*`, `app/api/operations/route.ts`, `app/api/integrations/*`, `app/api/admin/clear-seed-data/route.ts`, `app/(dashboard)/sales/crm-manychat/page.tsx` | DELETE de routes + lib + UI tab. Tabla `settings_trello` deprecate (no DROP, por compatibilidad). Update CLAUDE.md, HANDOVER.md, ROADMAP-12M.md, vibook-strategy.html |

---

## 🟡 P2 — Defense in depth (Q4 backlog)

| # | Item | Severidad | Fix corto |
|---|---|---|---|
| 30 | `iva_sales`/`iva_purchases` en `/api/reports/closing/route.ts` sin agency filter | P2 | `.in("agency_id", agencyIds)` |
| 31 | `communications` GET sin filtro org explícito (solo RLS) | P2 | `.eq("org_id", ...)` |
| 32 | Pilar 5 test cubre solo subset. Faltan: quotations, operation_services, operator_payments, journal_entries, recurring_payments, documents, lead_comments, chart_of_accounts, audit_logs, seller_objectives, itinerary_items, destinations + 20 más | P2 | Ampliar TENANT_TABLES en `__tests__/isolation/tenant-segregation.test.ts:35-50` |
| 33 | Reports defaults `year`/`month`/`quarter` con `new Date()` UTC. Día 1° del mes 00:00-03:00 ART cae al mes anterior | P2 | `date-fns-tz` consistente |
| 34 | `payment-coupons/[id]/mark-paid` flippea PAID + crea cash_movement, NO crea ledger, NO incluye org/agency. Marcado deprecated pero expuesto | P2 | Agregar guard de feature flag o eliminar |
| 35 | FX calc tiene guard de 5 min — suprime FX legítimos en backfill manual de 2 cuotas seguidas | P2 | Incluir `payment_id` en dedup |
| 36 | `commission_split=80%` aplicado sin tope. Secondary puede cobrar más que primary | P2 | Validar `split * primary_pct <= primary_pct`  |
| 37 | Rate limiter in-memory en Railway multi-instance | P2 | Redis-backed |
| 38 | Cron auth con `===` no constant-time | P2 | `crypto.timingSafeEqual` |
| 39 | Sin headers de seguridad (CSP, X-Frame-Options, HSTS) → clickjacking en /admin | P2 | Agregar en `next.config.js:51-67` |
| 40 | `.or()` filter en operations toma raw user input. Special chars rompen filtro y exponen siblings dentro del mismo agency | P2 | Validar regex `[A-Za-z0-9 áéíóúñ-]+` o usar `.ilike` con una columna |
| 41 | MP webhook trusted body fields (signature solo cubre manifest, no body) | P2 | Sourcear `status` del fetch fresco a MP API |
| ~~42~~ | ~~Manychat webhook~~ → escalado a P1 #29B (es el integration activo, no Trello) | — | Ver P1 #29B |

---

## 🔵 Deepening Opportunities (Q3-Q4 refactors arquitecturales)

10 propuestas de mejoras estructurales. Implementarlas elimina **cientos de líneas duplicadas** y previene futuros bugs P0/P1.

| # | Refactor | Impacto |
|---|---|---|
| R1 | **Sello "scoped query"** — `withScope(supabase, user).from("payments")` que aplica `.in("agency_id", user.agencyIds)` + seller_id si SELLER. Manifest de tablas con `{table: {agencyCol, sellerCol}}`. Borra 200+ líneas repetitivas en 60 endpoints. **Hace imposible olvidarse el filtro** | Resuelve la mayoría de P1 multi-tenant + previene futuros |
| R2 | **`settlePayment` orchestrator** — `lib/accounting/settle-payment.ts` que ejecuta ledger + counterpart + commission + FX + withholdings + journal + audit en una cadena con `result.warnings[]`. Hoy son 5+ routes con catch console.error que silencian failures | Resuelve P0 #7 + simplifica mark-paid (753 líneas → ~80) |
| R3 | **`createOperation` extraído** — `lib/operations/create-operation.ts`. Hoy `app/api/operations/route.ts` POST tiene 800+ líneas con 24 try-blocks. Onboarding del dev = 1 día solo en ese archivo | Testeable; reusable desde quotations convert |
| R4 | **`toUsd` / `toArs` único en `lib/accounting/exchange-rates.ts`** — la fórmula `amount / exchange_rate` aparece 30+ veces inline. Cada caller maneja edge cases (rate=0) distinto | Resuelve P1 multi-currency #17-20 |
| R5 | **`getOperationOperatorIds` movido a `lib/operations/operator-graph.ts`** — hoy enterrado en `app/api/payments/route.ts:45-105` y reimplementado en 3+ lugares parciales | Single source of truth |
| R6 | **`lib/payments/status.ts` puro** — `computePaymentStatus(payment, asOf)` y `computePending(total, paid)`. Hoy lógica OVERDUE/PENDING duplicada server + client en 8 lugares | Si Lozada cambia regla (grace period), un cambio |
| R7 | **`withApiHandler`** — 268 de 298 routes empiezan idéntico. `defineHandler({ module, action, handler })` extrae auth + permisos + parse + scope (ata con R1) + format errores. Cada route baja de ~30 líneas a 1 | Cuando agregás rate-limit / org-suspended check, lo agregás una vez |
| R8 | **`resolveFinancialAccount`** — la regla "cuenta debe pertenecer al agency" repetida en 5+ endpoints, gap conocido | Previene aislamiento estricto leak |
| R9 | **`app/api/ai/route.ts` → split** — 882 líneas, 380 son DATABASE_SCHEMA hardcoded (3 meses stale), 326 son SYSTEM_PROMPT, solo 150 son handler real. Mover a `lib/ai/schema.ts` (autogen desde types.ts) y `lib/ai/prompts.ts` | Fixea AI bug de schema stale + reduce surface attack |
| R10 | **Hooks + math libs para god components** — `quotation-builder-dialog.tsx` (2112 líneas), `new-operation-dialog` (1812), `operation-payments-section` (1727), etc. Extraer state a custom hooks y cálculos a `lib/quotations/builder-math.ts` | Testabilidad cero hoy → cobertura completa de cálculos críticos |

---

## 📋 Action Plan — qué hacer primero

### Esta semana (antes del onboarding del dev)
1. **Items #1-5 (multi-tenant P0)** — backfill org_id + agregar policies. ~4 horas dev. Incluye correr backfill del NULL alert (1209 rows).
2. **Item #6 (bulk double-pay)** — ~30 min, agregar CAS guard en bulk endpoint.
3. **Item #7 (mark-paid counterpart silencioso)** — ~1h, mover counterpart adentro del ledger transaction o extender orphans endpoint.
4. **Items #8-9 (verify)** — ~30 min de auditoría manual.

**Total**: ~5-6 horas para cerrar TODOS los P0.

### Mes 1 dev nuevo (Q3 ola 1)
- Items #11-16 (cross-agency P1) — patrón consistente de fix
- Items #17-20 (multi-currency reports) — ataque a reports junk
- **Item #29B (Manychat HMAC)** — securizar el integration que SÍ se usa
- **Item #29C (cleanup Trello)** — borrar ~15 archivos legacy + actualizar 4 docs
- **Refactors R1 + R2** — sienta las bases para no repetir bugs

### Mes 2-3 dev nuevo (Q3 ola 2)
- Items #21-29 (P1 restantes)
- **Refactors R3-R7** — aplanan el codebase

### Q4 (fondo)
- P2 (#30-42) en background  
- **Refactors R8-R10**

---

## 📎 Referencias

- Skills usadas: `diagnose`, `triage`, `improve-codebase-architecture` ([Matt Pocock skills](https://github.com/mattpocock/skills))
- Sweep automatizado por agentes paralelos en /docs/agents/sweep-2026-05-08.log (no generado, sería futuro)
- HANDOVER doc: [`docs/HANDOVER.md`](./HANDOVER.md)
- Roadmap 12m: [`docs/ROADMAP-12M.md`](./ROADMAP-12M.md)

> Ningún cambio fue aplicado durante este sweep. Todos los findings requieren validación manual + decisión de fix.
