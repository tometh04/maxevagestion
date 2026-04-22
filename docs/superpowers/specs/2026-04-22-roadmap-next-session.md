# Roadmap Vibook — Próxima sesión

**Contexto:** Sesión anterior validó paywall MP E2E completo. Ver `/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/specs/2026-04-21-paywall-mercadopago-design.md` para el spec del paywall y `/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/plans/2026-04-21-paywall-e2e-testing.md` para los resultados del E2E.

**Instrucciones de arranque de sesión:**

> Activá **superpowers:brainstorming** y ponete en modo **CEO de SaaS B2B** (agencia de viajes, ticket $119k ARS/mes, mercado AR).
> Pensá cada feature nuevo desde la perspectiva de: retención, acquisition cost, churn, upsell, operaciones del equipo de ventas, y customer success.
> No me digas "qué lindo el botón" — decime "esto va a reducir churn porque X" o "esto te permite cerrar Enterprise 3× más rápido".

---

## 🔥 Prioridad 1 — Admin Panel (nuevo, pedido post-E2E)

**Contexto del pedido:** Hoy cuando un cliente elige Enterprise, el CTA es WhatsApp. Tomi habla por WhatsApp, acuerda precio custom, pero no hay forma de materializar ese acuerdo en el sistema. Tampoco puede extender trials manualmente.

**Necesidades concretas:**

1. **Crear planes custom desde admin** — Tomi conversa con un Enterprise, define precio (ej. $350.000/mes), límites custom, features custom. Debería poder:
   - Crear un plan `custom_enterprise_<org>` o similar, vinculado a 1 org
   - Setear precio, features, límites
   - Que el cliente lo vea en su `/settings/subscription` y pueda pagarlo vía MP (preapproval con el custom price)

2. **Extender período de prueba** — caso: un cliente pide 14 días en vez de 7. Admin debería poder:
   - Ingresar al admin, buscar la org, click "Extender trial" → input días adicionales
   - El backend updatea `trial_ends_at` y el preapproval MP (si ya existe) o permite que el próximo checkout use el nuevo periodo

3. **Ver métricas del tenant** — desde admin:
   - Estado de suscripción
   - Fecha de alta, último login
   - Historial de pagos
   - Operaciones creadas, clientes, MRR contributed
   - Health score (actividad última semana)

4. **Acciones sobre tenants**:
   - Suspender (SUSPENDED status) — bloquea acceso total, manual
   - Desuspender
   - Cancelar suscripción del lado del admin (emergencias)
   - Ver preapproval MP + último webhook recibido

**Brainstorm preguntas abiertas:**
- ¿Admin es una ruta separada `/admin/*` con auth custom, o un rol dentro del mismo sistema (ej. `PLATFORM_ADMIN`)?
- ¿Cómo se autoriza? (Tomi es el único admin hoy — en el futuro puede haber un equipo)
- ¿Cómo se materializa un plan custom en MP? (crear preapproval con precio diferente, pero `plans.ts` hoy es estático — ¿DB-driven?)
- ¿Los planes custom son visibles en `/onboarding/billing` para el user o solo aparecen en `/settings/subscription` cuando ya están asignados?
- ¿Pricing per-seat vs flat? (Lozada tiene 5 vendedores, un Enterprise podría tener 50 → mismo precio o escala?)

**Estimación bruta:** 1 sprint (5-7 días de trabajo dedicado). Tocar: schema (planes DB-driven), API endpoints admin, UI admin, integración MP (precio custom).

---

## 🔥 Prioridad 2 — Importación masiva de datos al sistema

**Contexto:** Task gigante prometida desde hace tiempo. Clientes que llegan a Vibook vienen de Excel, Trello, otros ERPs. Sin importación masiva, cada cliente tarda semanas en cargar datos → churn en los primeros 7 días.

**Alcance mínimo viable:**
- CSV/Excel upload con preview + mapping de columnas
- Entidades prioritarias: clientes, operaciones, pagos (histórico)
- Detección de duplicados por DNI/email
- Rollback si falla a mitad

**Por qué Prio 2 y no 1:** El admin panel desbloquea ventas Enterprise (revenue inmediato). La importación es retention play (evita churn temprano) pero menos urgente si el flujo de ventas nuevas aún es lento.

---

## ⚙️ Prioridad 3 — Operaciones y fixes varios

### 3a. Cron-exchange-rates fallando
Hace >24h que falla. El otro dev (Francisco/Gerardo) lo maneja, pero si no lo resuelven esta semana:
- Ver logs Railway del cron
- El endpoint usa un API de BCRA o similar — probablemente rate-limited o auth expirada

### 3b. Resend API key (emails transaccionales)
Pendiente de configurar. Afecta:
- Welcome email post-signup
- Payment failed notification
- Trial expiring reminder (spec sección 10 lo marca out-of-scope, pero habría que re-priorizar)

### 3c. Legal entity en docs legales
Docs de `/legal/terminos`, `/legal/privacidad`, `/legal/cookies` tienen placeholders `{{RAZON_SOCIAL}}`, `{{CUIT}}`, `{{DOMICILIO}}`. Necesito que Tomi me pase los datos fiscales finales.

### 3d. AFIP e2e validación real
Nunca se testeó end-to-end la facturación electrónica con AFIP. Probable que haya bugs en producción cuando el primer cliente intente facturar.

### 3e. Sprint 3 customizations (backlog)
- Comisiones multi-tipo (por producto, por destino, por vendedor)
- Notificaciones configurables por tenant

---

## 📊 Prioridad 4 — Métricas del negocio (para Tomi-CEO)

Vibook hoy no tiene dashboard para Tomi ver:
- MRR (monthly recurring revenue)
- Active subscribers
- Churn rate
- CAC vs LTV
- Trial → paid conversion rate
- Net MRR (upgrade - downgrade - churn)

Sin esto, Tomi está volando a ciegas. Este dashboard vive probablemente dentro del admin panel (Prio 1).

---

## 🐛 Known issues post-E2E

1. **MP "Internal server error 500" con emails de dominios throwaway** (mailinator, dominios custom sin MX reales). Documentado, requiere validación de email front-end o whitelist de dominios conocidos. O mejor: catch el error y devolver mensaje claro al user: "Usá un email válido como Gmail u Outlook".

2. **reCAPTCHA de MP bloquea bots** — no tocar, es deseado. Pero tener en mente para CI/CD automation que no va a poder completar el flow sin intervención humana.

3. **Sandbox MP requiere 2FA (TOTP)** — Tomi tiene que desbloquearlo para E2E testing futuro con tarjetas test sin ambigüedad. Si no se desbloquea, seguiremos testeando en prod con `APRO` + riesgo mínimo.

4. **Org test E2E** (`E2E Test Agency`, id `5f26d2a1-...`) quedó en estado CANCELLED expirado. Dejar como fixture o borrar según preferencia.

---

## 🎯 Decisiones pendientes para Tomi-CEO

1. **Dunning timeline**: cuando MP rechaza cobro día 8, ¿cuántos días esperamos antes de bloquear acceso total? MP reintenta 10 días por default. Opciones:
   - A) Confiar en MP (10 días gracia) → block al día 10 si sigue fallando
   - B) Block inmediato al primer rechazo → user actualiza tarjeta o se bloquea

2. **Pricing Enterprise**: ¿floor y ceiling? Hoy es "consultar" sin anchor — puede terminar cobrando $150k o $500k según el día. Recomiendo definir: Enterprise Starter ($250k), Enterprise Scale ($500k), Enterprise Custom (negociado).

3. **Plan anual con descuento** (%10-15%) para mejorar cashflow → más runway. Habría que sumarlo a `/onboarding/billing` como toggle "Mensual / Anual".

4. **Referrals / partners**: ¿abrimos programa de referidos 10% LTV para vendedores-socios? Low-effort, high potential en AR donde el boca-a-boca mueve mucho.

---

## Cómo arrancar la próxima sesión

```
Activá /superpowers:brainstorming modo CEO SaaS AR.
Lee /Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/specs/2026-04-22-roadmap-next-session.md
y arranquemos por Prioridad 1 (Admin Panel + planes custom + extender trial).
```

El brainstorm debería cerrar con un spec listo para `writing-plans`.
