# Pendientes del Proyecto — Consolidado

> Generado: 2026-04-17 | Última actualización tras commits hasta `c5570ea`.
>
> Este documento consolida TODO lo identificado durante la auditoría
> del sistema y que queda sin atacar, más los bugs operativos del equipo
> que todavía requieren datos del usuario para resolver.
>
> **Prioridad**: 🔴 crítico · 🟠 alto · 🟡 medio · 🟢 bajo / cosmético.

---

## 👥 Bugs operativos del equipo (requieren datos del usuario)

Estos llegaron en la reunión del equipo y esperan input:

- 🟠 **Agregar vendedora Victoria Bogado**
  - Acción: insertar en `users` con `role=SELLER`.
  - **Faltan datos**: email, agencia asignada, % comisión.
- 🟡 **Eliminar "CAJA USD" en mayúsculas**
  - Acción: `DELETE FROM financial_accounts WHERE name='CAJA USD' AND id=X`.
  - **Faltan datos**: id exacto del record duplicado. Se puede listar
    con `SELECT id, name FROM financial_accounts WHERE name ILIKE '%caja%usd%'`.

---

## 🔒 Seguridad y SaaS multi-tenant (hardening)

- 🟠 **Rotar token GitHub expuesto** (`ghp_SKo...`)
  - Está en el remote del clone `maxeva-saas` en texto plano.
  - Acción: https://github.com/settings/tokens → Revoke → generar nuevo.
- ✅ **25 API routes con `createAdminClient` auditadas** (commit a215d06) - 16 ya tenían pre-check, 9 agregadas
  - Bypasean RLS con `service_role`. Si hay un bug de lógica,
    exponen datos cross-agency.
  - Acción: auditar cada route y agregar `canPerformAction(...)` o
    ownership check antes del admin client.
- ✅ **Rate limiting por usuario** (commit bf07b3b) en POST/DELETE payments, mark-paid, POST/DELETE operations. Resto pendiente.
  - Hoy hay un rate-limit global por IP en `middleware.ts` (200/min).
  - Falta rate-limit diferenciado por user y por tipo de endpoint
    (write vs read vs AI).
- ✅ **Trello webhook signature obligatorio** (commit 626f4b0)
  - `app/api/trello/webhook/route.ts:14` — si `secret` no está
    configurado, acepta cualquier webhook (impersonation posible).
  - Fix: `throw new Error("Webhook secret required")` si falta.
- ✅ **Manychat API key: timing-safe comparison** (commit 626f4b0)
  - Hoy usa `!==` directo (vulnerable a timing attacks teóricos).
  - Fix: `crypto.timingSafeEqual`.
- 🟢 **Cookie session: SameSite=Strict + Secure explícito**
  - El middleware no fuerza estos flags; Supabase SSR los maneja pero
    vale documentarlo/verificarlo.

---

## 🧮 Integridad de datos contables

- 🟢 **FX atomicity con RPC** — re-priorizado a BAJO tras análisis
  - `autoCalculateFXForPayment` hoy genera alerta SYSTEM si falla
    (Sprint anterior), pero no hay rollback real del payment.
  - Fix: crear RPC `create_payment_with_fx_atomic()` con BEGIN/COMMIT.
- 🟡 **Dual-path legacy vs partida doble — documentación**
  - `ledger_movements` tiene ambos paths sin marker claro.
  - Fix: comentario en el schema o migración que planifique migración
    completa al path nuevo.
- 🟡 **Redondeo de dinero inconsistente**
  - Algunos lugares usan `Math.round(x*100)/100`, otros `parseFloat`
    directo, otros `roundMoney` (lib/currency.ts).
  - Fix: forzar `roundMoney` en todo cálculo monetario.
- ✅ **`debts-sales/route.ts` filtro de fecha** (commit 626f4b0)
  - Usa `opDate > dateToFilter + "T23:59:59"` (comparación string).
  - No se tocó en los batches de timezone porque la semántica es distinta.
  - Fix: migrarlo a usar helper `endOfDayAR` + comparación Date real.

---

## 🧪 Tests y QA

- 🟠 **Sin tests de RBAC bypass**
  - No hay test que intente acceder a datos de otra agencia como SELLER.
- 🟠 **Sin tests de RLS policies en BD**
  - Las policies reales (post-migración 151) no se validan
    automáticamente — un cambio de policy podría abrir un hueco
    sin que nadie se entere.
- 🟠 **Sin tests de race conditions**
  - mark-paid doble-click, lead→op duplicado — el CAS lock se
    implementó pero no tiene test.
- 🟡 **Sin tests de idempotencia de percepciones / counterparts**
  - Los guards están pero no hay test que los ejercite.
- 🟡 **Sin tests de webhook signature (Trello / Manychat)**
- 🟡 **Sin tests E2E de flujos completos**
  - Lead → quotation → operation → payment → commission.
- 🟡 **Sin tests de multi-currency con FX rates históricos**

---

## 🎨 Frontend / UX

- ✅ **D4 lazy load de 3 dialogs gigantes** (commit 3ac0190) - admin-commissions-view queda pendiente
  - `quotation-builder-dialog.tsx` (1937 líneas)
  - `operation-payments-section.tsx` (1691)
  - `new-operation-dialog.tsx` (1658)
  - `operation-services-section.tsx` (1652)
  - `edit-operation-dialog.tsx` (1215)
  - `admin-commissions-view.tsx` (1136)
  - Beneficio: reducir bundle inicial (~500KB+ a hoy).
- 🟢 **aria-label en botones icon-only**
  - notification-bell, otros toolbars.
- 🟢 **Focus management en Dialogs**
  - `autoFocus` en primer input + trap focus garantizado.
- 🟢 **Búsqueda en `alerts-filters` sin debounce**
  - Otros filtros ya lo tienen.
- 🟢 **Context sin `useMemo`**
  - `BrandProvider` en dashboard layout — causa re-render de hijos.
- 🟢 **14 warnings de `<img>` vs `<Image />`**
  - Next.js sugiere `<Image />` para optimización automática.
- 🟢 **Algunos `useEffect` con deps incompletas**
  - `calendar-page-client`, `commissions-table`, `edit-operation-dialog`,
    `new-operation-dialog`, `quotation-builder-dialog` — warnings ESLint.

---

## 📂 Deuda técnica estructural

- 🟠 **`lib/organizations.ts` WIP sin commitear**
  - Trabajo del SaaS multi-tenant a medias. Importa tipos de
    `organizations` que no están en `types.ts` regenerado.
  - **Decisión pendiente**: completar (Fase 2 SaaS) o borrar.
- 🟡 **Dos sistemas de numeración de migraciones conviven**
  - `006_create_financial_accounts.sql` (viejo) y
    `20260331000005_create_financial_accounts.sql` (nuevo) para
    la misma tabla.
  - Riesgo: orden de ejecución indeterminista si se corre `db push`
    contra un branch nuevo.
  - Fix: purgar sistema viejo después de verificar que el nuevo
    cubre todo.
- 🟡 **`as any` masivo (40+ usos en lib/accounting/)**
  - Oculta errores de schema en compile-time.
  - Fix: regenerar `types.ts` desde Supabase (`npm run db:generate`)
    y tipar queries progresivamente.
- 🟡 **Audit log duplicado (`lib/audit-log.ts` deprecado)**
  - Marcado como `@deprecated`. Hay que borrarlo cuando se confirme
    que ningún archivo lo importa.
- 🟢 **Limpiar 87 migraciones duplicadas** — ✅ ya hecho.

---

## 💰 Features que podrían agregarse

- 🟢 **Global search (⌘K)**
  - Existe parcial, falta cubrir más entidades.
- 🟢 **Dark mode**
- 🟢 **Exportar leads/operations a Excel**
- 🟢 **Operation timeline view**
- 🟢 **AI Copilot con memoria persistente**
- 🟢 **Balance Sheet / P&L contable**
- 🟢 **Notificaciones push reales** (hoy están parciales).

---

## 📊 Resumen de estado

**Hecho durante esta sesión** (~35 bugs + mejoras):

- Bloque A multi-operador, lead race, MAIN duplicado, cambio moneda
- Bloque B1 CHECK amount >= 0
- Bloque C audit logs en BD (DELETE payments / customers / leads)
- Bloque D1 error boundaries root
- Bloque D2 25 alert() → toast
- Bloque D3 disabled={isSaving} en 3 forms
- Timezone fix en 11 endpoints críticos (cash, ledger, stats, monthly
  position, IIBB, libro IVA, ganancias, audit logs, payments,
  expenses variable/monthly)
- Filtro cliente en vista Movements
- Tests: 376/376 verdes, TS errors bajaron de 31 a 7
- Seguridad: RLS reales en iva_sales/iva_purchases/commission_records,
  re-habilitadas RLS en conversations/messages/wa_*, DELETE payments
  con permisos, DISABLE_AUTH prod-safe

**Migraciones SQL entregadas al usuario**: 151, 152, 153, 154, 155.

**Commits pusheados**: 16 (desde `2ed2845` hasta `c5570ea`).

---

## 🚦 Priorización recomendada para próximas sesiones

**Si el SaaS va pronto**:
1. Rotar token GitHub.
2. Auditar 25 routes con `createAdminClient`.
3. Decidir `lib/organizations.ts` (completar Fase 2 SaaS o borrar).
4. Tests de RLS y RBAC bypass.

**Si prioridad es estabilidad operativa**:
1. Bugs operativos pendientes (Victoria, CAJA USD).
2. FX atomicity con RPC.
3. `debts-sales` filtro de fecha.
4. Tests de race conditions (mark-paid, lead convert).

**Si prioridad es performance y UX**:
1. D4 lazy load de los 6 componentes gigantes.
2. `img` → `<Image />` (14 casos).
3. Debounce en `alerts-filters`.
4. Focus management y aria-labels.
