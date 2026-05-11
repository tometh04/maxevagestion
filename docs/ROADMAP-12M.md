# Vibook — Roadmap 12 meses (May 2026 → May 2027)

**Audiencia**: Product Manager, dev nuevo, stakeholders.
**Autor**: Tomi (founder/CEO).
**Última actualización**: 2026-05-10 (post-deploy cleanup multi-tenant P0 + Trello removal).
**Status**: vivo — se revisa quarter-end y se ajusta. **Lanzamiento público mañana 2026-05-11**.

> **Hito 2026-05-10**: Deploy de PR #25 a producción. Cerrados 7 de 9 P0 multi-tenant. Trello integration removida (5K líneas). Lozada productivo verificado intacto. Ver `docs/BUGS-TRIAGE.md` para detalle.

> Este doc es el plan estratégico de los próximos 12 meses. No es un Gantt detallado; es la dirección. Los detalles tácticos (sprint planning, tickets) viven en GitHub Issues / Linear.

---

## 0. TL;DR — el plan en 60 segundos

Vibook tiene 1 cliente piloto (Lozada Rosario + Madero), producto ~98% feature-complete y modelo SaaS multi-tenant funcionando. El próximo año tiene **4 temas**, uno por trimestre, en orden:

1. **Q3 2026 — Trust**: que el sistema sea "correcto" (data íntegra, sin bugs en KPIs, performance estable).
2. **Q4 2026 — Growth**: self-serve completo, primeros 10 tenants pagos sin onboarding manual.
3. **Q1 2027 — Depth**: features que competencia argentina no tiene (AI Copilot v2, reports formales, mobile, customer portal).
4. **Q2 2027 — Ecosystem**: API pública, integraciones, white-label, escala 50+ tenants.

**North Star**: **"Agencias pagas activas"** (tenants con subscription paga ≥ 1 mes, login semanal, ≥ 5 operaciones/mes).

| Métrica | Hoy | Q3 fin | Q4 fin | Q1 fin | Q2 fin |
|---|---|---|---|---|---|
| Agencias pagas activas | 1 | 3 | 10 | 25 | 50 |
| MRR (ARS) | ~$X | $X·3 | $X·10 | $X·25 | $X·50 |
| Trial→paid conversion | n/a | 30% | 40% | 50% | 50% |
| Churn mensual | n/a | <10% | <8% | <5% | <5% |
| Uptime SLO | ~98% | 99% | 99.5% | 99.9% | 99.9% |
| Bugs P0 abiertos | ~10 | 0 | 0 | 0 | 0 |

---

## 1. Contexto estratégico

### 1.1 Producto

Vibook es un **ERP SaaS multi-tenant para agencias de viajes en Argentina**. Stack moderno (Next.js 15 / Supabase / Railway), integraciones nativas (AFIP, MP, OpenAI, Manychat, WhatsApp), modelo SaaS con trial 14 días → MP Preapproval recurring.

### 1.2 Competencia

- **Ofistur, GIS, Travel Software**: incumbents argentinos. UI vieja, sin AI, sin AFIP automatizado en algunos, modelo de licencia perpetua o leasing.
- **Hojas de cálculo + WhatsApp**: el "competidor" real de muchas agencias chicas.

**Diferenciadores Vibook**:
1. AI nativo (Copilot conversacional sobre tu data, OCR de DNIs)
2. AFIP setup automatizado (no necesitás contador para arrancar)
3. Multi-agency en un mismo tenant (Rosario + Madero pagan 1 sola subscription)
4. UX moderna (shadcn/ui, dark mode, mobile-friendly)
5. Manychat integrado nativo (lead capture desde Instagram/WhatsApp con cero fricción para el vendedor)

### 1.3 Risk profile

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Concentración de cliente (Lozada = 100% revenue) | 🔴 Alta | Q3-Q4: priorizar growth/self-serve para diluir |
| Owner-as-bus-factor (Tomi único con todo el contexto) | 🟠 Media | Q3: handover doc + runbook + dev nuevo + AI agent |
| Argentina macro (devaluación, AFIP cambios, inflation) | 🟠 Media | Multi-currency built-in + tracking BCRA + arquitectura adaptable |
| Technical debt en multi-tenancy | 🟠 Media | Q3 dedica un mes solo a esto |
| Dependencia de afipsdk.com | 🟡 Baja | Tener fallback (AFIP SDK propio) en backlog Q1 si crece volumen |

---

## 2. North Star + Objetivos

### 2.1 North Star Metric (NSM)

**"Agencias Pagas Activas"** — tenants que cumplen TODAS:
- Subscription paga ≥ 1 mes (no trial, no cortesía)
- ≥ 1 login en últimos 7 días (de cualquier user)
- ≥ 5 operaciones creadas/cerradas en últimos 30 días

### 2.2 Objetivos del año (OKR style)

#### O1 — Llegar a 50 Agencias Pagas Activas
- KR1: 10 agencias pagas activas en Q4 fin
- KR2: 25 agencias pagas activas en Q1 fin
- KR3: 50 agencias pagas activas en Q2 fin
- KR4: ≥ 30% trial-to-paid conversion sostenido

#### O2 — Reducir el bus-factor del founder
- KR1: Onboarding de 1 dev senior (DONE en mayo 2026)
- KR2: ≥ 80% de incidents resueltos por el dev sin involucrar al founder
- KR3: Documentación completa: HANDOVER.md + runbook + INVARIANTS.md + arquitectura

#### O3 — Producto "correcto" (Trust)
- KR1: 0 bugs P0 abiertos al fin de cada mes
- KR2: Test coverage ≥ 60% (hoy ~20%)
- KR3: Smoke E2E del flujo crítico (lead → operación → mark-paid → AFIP) corre en CI
- KR4: Uptime SLO 99.9% sostenido a partir de Q1

#### O4 — Foothold en Argentina como AI-native ERP
- KR1: AI Copilot v2 con 10 herramientas, contexto persistente, voz
- KR2: ≥ 30% de tenants activos usan Copilot semanalmente
- KR3: 1 case study publicado con métricas duras (Lozada)

---

## 3. Roadmap por quarter

> Cada iniciativa tiene: **Why** (problema) → **What** (solución) → **Success metric**.
> Effort estimado en T-shirt sizes (S = días, M = semanas, L = mes+).

---

### Q3 2026 (May–Jul) — TEMA: TRUST

**Objetivo del quarter**: el sistema es "correcto". Ningún KPI miente, ningún payment queda huérfano, ningún tenant ve data ajena.

#### 3.Q3.1 Data integrity audit & cleanup [L]
- **Why**: hoy hay 331 payments + 1209 alerts con `org_id NULL`. Hay rows con `paid_amount > amount` por bug de TC mixto. Hay payments huérfanos sin ledger. Los KPIs muestran menos de lo real.
- **What**:
  - Backfill scripts para todos los `*_id NULL` en tablas core (org_id, agency_id)
  - CHECK constraints adicionales (paid ≤ amount, status transitions, etc.)
  - Endpoint `/api/admin/integrity-check` (manual, no cron) que lista todas las inconsistencias actuales
  - Doc `INVARIANTS.md` listando exhaustivamente las reglas de negocio que el sistema garantiza
- **Success metric**: 0 rows con NULL crítico, 0 violaciones de invariantes en query manual.

#### 3.Q3.2 CI gating con Pilar 5 + smoke E2E [M]
- **Why**: tests existen pero no bloquean merge. Bugs llegan a prod y los detecta Yami/Santi por WhatsApp.
- **What**:
  - GitHub Actions workflow que corre `__tests__/isolation/tenant-segregation.test.ts` y bloquea PR si falla
  - Smoke E2E con Playwright: signup → AFIP setup → operación → cobro → factura
  - Coverage tracking (codecov o similar)
- **Success metric**: ≥ 90% de bugs detectados en CI antes de merge. Coverage ≥ 60%.

#### 3.Q3.3 Performance baseline [M]
- **Why**: dashboard tarda 5–10s en algunos tenants. La gente abandona si no carga rápido.
- **What**:
  - Audit de queries lentas (Supabase Reports → slow queries)
  - Indexes faltantes
  - RPCs para charts/dashboard (se hicieron unos en abril, completar)
  - Loading states + skeletons en todas las vistas
  - Lighthouse score ≥ 85 en mobile
- **Success metric**: dashboard P95 < 2s, login → primer KPI visible < 1.5s.

#### 3.Q3.4 Onboarding del dev nuevo [S]
- **Why**: ya empezó en mayo. Hay que cerrar bien el handover.
- **What**:
  - HANDOVER.md (DONE)
  - 1 semana de pair programming + Q&A
  - Dev cierra solo su primer ticket P1 sin involucrar al founder
- **Success metric**: dev resuelve incident solo en semana 4.

#### 3.Q3.5 Cleanup de tech debt multi-tenant [M]
- **Why**: hay código con `agency_id` hardcodeado que asume Lozada. Si entra un tenant nuevo, va a romper sutilmente.
- **What**:
  - Grep + audit del codebase por strings tipo `'lozada'`, `'66563aeb-'`, `agency_id =`
  - Reemplazar por queries dinámicas o flags
  - Tests que validan que un tenant NO ve data de otro (extender Pilar 5)
- **Success metric**: 0 referencias hardcodeadas a Lozada en código (excepto migrations / scripts puntuales).

#### 3.Q3.6 Documentación overhaul [S]
- **Why**: hay >50 archivos en /docs muchos legacy/desactualizados. Confunde al dev.
- **What**:
  - Curar /docs (mover obsoletos a /docs/archive)
  - HANDOVER.md (DONE)
  - INVARIANTS.md (lista de reglas)
  - ARCHITECTURE.md (1 doc canónico)
  - Cada feature crítica con su README al lado del código
- **Success metric**: dev nuevo encuentra info en < 5 min.

---

### Q4 2026 (Aug–Oct) — TEMA: GROWTH

**Objetivo del quarter**: arrancar el motor de growth. De 1 tenant a 10 sin que cada uno requiera onboarding manual de 2 horas.

#### 3.Q4.1 Onboarding self-serve completo [L]
- **Why**: hoy un tenant nuevo necesita Tomi al teléfono para configurar AFIP, dar el alta, importar data inicial. Eso no escala.
- **What**:
  - Welcome wizard de 5 pasos (DONE base, completar)
  - AFIP setup automatizado con afipsdk.com (DONE base, polish)
  - Import V2 wizard pulido (CSV → preview → confirm)
  - Demo data sembrable (1 click "cargar datos de ejemplo")
  - Email transaccional series (Resend): día 0, día 3, día 7, día 12 antes de fin de trial
  - Video tutorial de 5 min embebido
- **Success metric**: tenant signup → primera operación creada < 30 min sin contacto humano.

#### 3.Q4.2 Pricing & billing UI [M]
- **Why**: hoy los planes están en DB, custom plans funcionan, pero la UI de "elegí plan / cambiá plan / facturación" es básica.
- **What**:
  - Página `/billing` per-tenant con plan actual, próxima factura, historial
  - Self-serve plan upgrade/downgrade
  - Invoices descargables (PDF generated)
  - MP Preapproval renewal handling (cuando MP devuelve "hay que renovar")
  - Dunning emails (atrasos de pago)
- **Success metric**: 0 tickets de soporte sobre "cómo cambio mi plan / pago mi factura".

#### 3.Q4.3 Tenant lifecycle (admin) [M]
- **Why**: hoy si un tenant pide cancelar, refund, suspensión, hay que tocar SQL.
- **What**:
  - `/admin/orgs/[id]` con acciones: suspend, reactivate, refund, force-trial-extension
  - Audit log de todas las acciones admin
  - Soft-delete con retención (90 días) y export final
  - Procedimiento de offboarding documentado
- **Success metric**: refund completo en < 5 min, sin SQL.

#### 3.Q4.4 Landing page + sales materials [M]
- **Why**: hoy no hay landing pública, signup es por link directo.
- **What**:
  - Landing en `vibook.ai` (con el otro repo de marketing): hero, features, pricing, FAQ, CTA trial
  - Case study Lozada con métricas concretas (ahorro de horas, error reduction, etc.)
  - Social proof / testimonios
  - SEO básico (sitemap, og tags, schema.org)
- **Success metric**: ≥ 100 visitas/mes orgánicas a fin de Q4, ≥ 10 trials/mes generados.

#### 3.Q4.5 Observability + alerting [M]
- **Why**: cuando algo se rompe en prod, nos enteramos por WhatsApp del cliente.
- **What**:
  - Sentry (o equivalente) integrado en frontend + backend
  - Alertas en Slack/Discord para errores 500, crons fallidos, AFIP errors
  - Dashboard `/admin/health` con uptime, error rate, response time
  - Status page público (`status.vibook.ai`)
- **Success metric**: ≥ 80% de incidents detectados por nosotros antes que por el cliente.

#### 3.Q4.6 Sales operations + analytics interna [M]
- **Why**: no sabemos qué tenants están en riesgo de churn ni cuáles son power users.
- **What**:
  - Dashboard interno `/admin/metrics` con MRR/ARR/churn (DONE base, extender)
  - Activity score per-tenant (login frequency, ops created, copilot usage)
  - Cohort retention chart
  - Email automatizado para tenants en risk (sin login 14 días)
- **Success metric**: identificamos 100% de churns 14 días antes de que pasen.

---

### Q1 2027 (Nov–Jan) — TEMA: DEPTH

**Objetivo del quarter**: tener features que la competencia argentina NO tiene. Diferenciación clara.

#### 3.Q1.1 AI Copilot v2 [L]
- **Why**: el Copilot actual es funcional pero limitado. Es el diferenciador #1 vs Ofistur/GIS.
- **What**:
  - Conversation history persistente per-user
  - 20+ tools (vs 8 actuales): crear operación, marcar pagado, generar reporte, comparar períodos, etc.
  - Voice input (Whisper en cliente)
  - Multi-modal (subí una foto, te crea cliente con OCR)
  - Citations en respuestas (cita la query exacta o el row)
  - Personalidad consistente (Vibuk como brand)
- **Success metric**: ≥ 30% de tenants usan Copilot semanalmente. NPS específico de Copilot ≥ 8.

#### 3.Q1.2 Reports v2 — formales [L]
- **Why**: hoy hay reportes pero no los "formales" que el contador del cliente pide.
- **What**:
  - Balance Sheet
  - Estado de Resultados (P&L)
  - Cash Flow projection
  - Aging de cuentas por cobrar/pagar
  - Comparativos period-over-period
  - Export PDF con branding del tenant
  - Custom report builder (drag & drop básico)
- **Success metric**: ≥ 50% de tenants tienen al menos 1 report custom guardado.

#### 3.Q1.3 Mobile-optimized PWA [L]
- **Why**: vendedores están afuera, no en el escritorio. Necesitan ver leads y operaciones del celu.
- **What**:
  - PWA installable
  - Vistas optimizadas mobile para: leads, operaciones, mis comisiones, mensajes
  - Notificaciones push (signup → push subscription → cron-notifications)
  - Modo offline básico (cache de últimas 50 operaciones)
- **Success metric**: ≥ 40% de logins desde mobile a fin de Q1.

#### 3.Q1.4 Customer Portal (cliente final) [L]
- **Why**: hoy el cliente final del tenant solo recibe WhatsApps. Que pueda ver su viaje en un portal mejora retención del tenant ("mira qué onda este sistema que me dieron").
- **What**:
  - URL pública con token: `/cliente/[token]`
  - Ver itinerario, vouchers, estado de pago, próximos pagos
  - Pagar online (MP Pix / transferencia)
  - Subir documentación (DNI, etc.) con OCR
- **Success metric**: ≥ 20% de operaciones tienen al menos 1 visita del cliente final al portal.

#### 3.Q1.5 Operations timeline + bulk actions [M]
- **Why**: ver una operación es un wall of fields. Y para acciones masivas (mark-paid 50 ops) hoy hay que ir una por una.
- **What**:
  - Timeline view de cada operación (creación → pagos → cambios → factura → cierre)
  - Bulk actions: select N ops → mark paid, send reminder, export
  - Saved filters
- **Success metric**: tiempo promedio para "cobrar 30 cuotas vencidas" baja de 10min a 1min.

#### 3.Q1.6 Quotation builder advanced [M]
- **Why**: las cotizaciones son la "puerta de entrada" del cliente. Si la cotización es fea o limitada, perdés la venta.
- **What**:
  - Templates de cotización (Caribe Family, Europa Luna de Miel, etc.)
  - Galería de fotos por destino (auto-fetch)
  - Multi-version dentro de una cotización (Opción A / B / C — DONE base, polish)
  - Tracking: "el cliente abrió la cotización X veces"
  - PDF/HTML export
- **Success metric**: tiempo promedio de armar cotización < 5min (hoy ~15min).

---

### Q2 2027 (Feb–Apr) — TEMA: ECOSYSTEM

**Objetivo del quarter**: Vibook es plataforma. Otros pueden construir sobre nosotros, vender plugins, automatizar.

#### 3.Q2.1 API pública + OpenAPI docs [L]
- **Why**: agencias grandes quieren integrar Vibook a su CRM custom, ERP corporativo, etc.
- **What**:
  - API REST documentada (OpenAPI 3.1)
  - API keys per-tenant (rotables, scopable)
  - Rate limiting
  - Sandbox environment para testear
  - SDK TypeScript publicado en npm
- **Success metric**: ≥ 5 tenants usan la API pública para algo, ≥ 1 partner publica integración.

#### 3.Q2.2 Webhooks customizables [M]
- **Why**: tenants quieren reaccionar a eventos (operación creada, pago recibido) en sus propios sistemas.
- **What**:
  - Eventos: `operation.created`, `payment.received`, `lead.converted`, etc.
  - Subscription per-tenant a webhooks
  - Retry logic, signing, replay protection
- **Success metric**: ≥ 10 tenants con al menos 1 webhook configurado.

#### 3.Q2.3 Marketplace de templates [M]
- **Why**: cotizaciones, reportes, alertas — cada tenant arma de cero. Si compartimos lo que funciona, todos ganan.
- **What**:
  - Tenant publica un template (cotización, report, alerta) → otros lo pueden clonar
  - Curaduría inicial por nosotros (top 50 templates)
  - Browse por categoría / destino / tipo de operación
- **Success metric**: ≥ 20% de tenants instalan al menos 1 template del marketplace.

#### 3.Q2.4 White-label / partner program [L]
- **Why**: agencias grandes tipo Lozada quieren su marca, no la nuestra. Y agencias chicas quieren un "Vibook by [contador local]" que les vende su contador de confianza.
- **What**:
  - Subdominio per-tenant: `lozada.vibook.ai` o domain custom: `gestion.lozada.com.ar`
  - Branding: logo, colores, favicon en login + dashboard
  - Email FROM customizable (con DKIM via Resend)
  - Programa de partners: 20% revenue share por tenants traídos
- **Success metric**: ≥ 3 tenants con white-label, ≥ 5 partners en el programa.

#### 3.Q2.5 Multi-region + scale prep [L]
- **Why**: hoy es 1 Supabase + 1 Railway. A los 50 tenants empieza a doler latencia desde Mendoza/Salta.
- **What**:
  - Read replicas Supabase para queries pesadas
  - Edge functions para endpoints críticos
  - CDN para assets (Cloudflare)
  - Plan de migración a multi-tenant separado por DB si crecemos a 200+ tenants
- **Success metric**: P95 latency < 500ms desde cualquier provincia argentina.

#### 3.Q2.6 Internacionalización (preparación) [M]
- **Why**: el modelo es replicable a Uruguay, Chile, Paraguay. AFIP-AR es lo único hardcoded.
- **What**:
  - Abstraer "Tax Authority" interface (AFIP-AR → DGI-UY → SII-CL)
  - i18n strings (ES-AR base, prepara LATAM-ES)
  - Currency support extendido (UYU, CLP, PYG)
  - Research: regulaciones de cada país
- **Success metric**: roadmap de LatAm aprobado, primer tenant pre-piloto Uruguay.

---

## 4. Cross-cutting (todo el año)

Things que no son features pero corren en background:

| Iniciativa | Frecuencia | Owner |
|---|---|---|
| Security audit + RLS hardening | Trimestral | Dev senior |
| Bug bash con Yami/Santi | Mensual | Tomi + dev |
| Performance regression check | Mensual | Dev |
| Dependency updates (npm audit) | Quincenal | Dev (automatizable con Renovate) |
| Backup verification (restore drill) | Trimestral | Dev |
| Customer interviews (3 tenants/mes) | Mensual | Tomi |
| Roadmap review & adjust | Trimestral | Tomi + dev |

---

## 5. Riesgos y dependencias

### 5.1 Top 5 riesgos del año

| # | Riesgo | Prob | Impacto | Mitigación |
|---|---|---|---|---|
| 1 | Concentración Lozada (100% revenue) | Alta | Crítico | Q3-Q4: agresivo en growth, target 10 tenants Q4 |
| 2 | AFIP cambia API/regulación | Media | Alto | Tenemos abstracción via afipsdk.com, fallback plan listo |
| 3 | Devaluación ARS impacta pricing | Alta | Medio | Pricing dinámico (% del USD, tiers en USD-equivalent) |
| 4 | Bug crítico en producción rompe trust | Media | Alto | Q3 invierte fuerte en CI/observability/data-integrity |
| 5 | Founder burnout / bus factor | Media | Crítico | Onboarding dev senior + handover doc + AI agent + automatización |

### 5.2 Dependencias externas

- **afipsdk.com**: si quiebra o sube precios prohibitivos → plan B = SDK propio (3 meses de trabajo)
- **Mercado Pago**: si cambian Preapproval → buscar PayU / dLocal / Stripe LatAm
- **Supabase**: outage = downtime nuestro. Mitigación: PITR + backup offsite + considerar self-hosted llegando a 100+ tenants
- **Railway**: outage similar. Plan B: Render / Fly.io. Migración estimada: 1 semana

### 5.3 Hiring plan

- **Q3 2026**: 1 dev senior full-stack (DONE en mayo)
- **Q4 2026**: 1 customer success / soporte part-time (cuando lleguemos a 10 tenants)
- **Q1 2027**: 1 dev junior + 1 designer freelance puntual
- **Q2 2027**: evaluar growth/marketing role según tracción

---

## 6. Métricas y reporting

### 6.1 Dashboard semanal (lunes 9am)

- Agencias pagas activas (NSM)
- MRR / ARR
- Trials nuevos
- Trial→paid conversion último mes
- Churn último mes
- Bugs P0 abiertos
- Uptime últimos 7 días
- Top 3 user complaints (de soporte)

### 6.2 Reporting mensual

- OKR progress vs target del quarter
- Cohort retention
- Feature adoption (qué features se usan, cuáles no)
- Revenue per tenant
- CAC y payback period (cuando tengamos data)
- NPS (encuesta trimestral)

### 6.3 Reporting trimestral

- OKR review + ajuste de target del próximo quarter
- Customer interviews (3+) → insights
- Roadmap re-priorización

---

## 7. ¿Qué NO hacemos este año?

Para tener foco, lo que QUEDA AFUERA explícitamente:

- ❌ App nativa iOS/Android (PWA cubre 90% del uso mobile)
- ❌ Crypto / Web3 / blockchain
- ❌ Integración con sistemas de booking globales (GDS Amadeus, Sabre) — hay PR pero no lo lanzamos a tenants
- ❌ B2B2C marketplace (Vibook como booking platform para clientes finales)
- ❌ Replanteo de la arquitectura (estamos cómodos con Next + Supabase + Railway hasta 100+ tenants)
- ❌ Ventas en mercados fuera de LatAm (foco ARG primero, después Uruguay/Chile/Paraguay)

Si algo de la lista se vuelve crítico antes de fin de año, **pausamos un Q y reasignamos**. No "metemos a presión".

---

## 8. Apéndice — feature backlog parked

Cosas que están en el aire pero no comprometidas en este roadmap. Se evalúan trimestre a trimestre:

- Operación timeline view (Q1 candidato)
- AI Copilot conversation history (Q1 confirmed)
- Dark mode polish
- Document signing electrónico (DocuSign API)
- Integración con WhatsApp Business API oficial (vs Manychat)
- Reporting financiero AFIP avanzado (RG 4597 ya está)
- Multi-language UI (después de internacionalización)
- Audit log per-tenant (visible al ADMIN del tenant, no solo a SUPER_ADMIN nuestro)
- Marketplace de plugins (vs solo templates)

### Deuda técnica conocida (programar)
- **Mig 5 alerts tighten** (post-lanzamiento, semana 1): script ya en `supabase/migrations/20260510000005_p0_alerts_tighten_rls.sql`. Backfillea 1209 alerts NULL + tightenea policy. Mientras tanto, 1209 alerts visibles cross-tenant — leak conocido de info no-sensible
- **Backfill 331 payments org_id NULL** (post-lanzamiento): script en `scripts/p0-backfill-orphan-payments-org-id.sql`. Policy híbrida de payments los mantiene visibles vía `user_agencies` legacy
- **Simplificar policy híbrida de `payments`**: cuando todos los users vivan en `organization_members`, quitar la rama legacy `user_agencies` del RLS de payments
- **Cleanup Vercel** (1-2 días post-lanzamiento, requiere coordinación DNS):
  - 3 proyectos legacy a borrar: `maxevagestion-v5`, `vibookservicessaas`, `vibook-landing`
  - 2 dominios productivos usan nameservers Vercel: `vibook.ai`, `maxevagestion.com` → migrar a Cloudflare DNS
  - Migrar redirect `maxevagestion.com → app.vibook.ai` (hoy hosteado en Vercel) a Cloudflare Page Rule
  - Downgrade plan o delete team — corta el cobro mensual de Vercel
- **Re-activar user `naza@agencialozada.com`** (a demanda): re-crear en Supabase Auth → relinkear `users.auth_id` → INSERT en `organization_members`. Ver runbook en `docs/HANDOVER.md` Bug I
- **`admin@vibook.ai`** sin `user_agencies`: asignar a alguna org si lo van a usar como admin operativo (hoy Tomi usa `tomas.sanchez04@gmail.com`)

---

## 9. Aprobaciones / cambios

| Fecha | Autor | Cambio |
|---|---|---|
| 2026-05-08 | Tomi | Versión inicial |

---

> **¿Cómo proponer cambios?** Abrí un PR a este archivo con tu propuesta + razón. Lo discutimos en el siguiente quarter review (último viernes del Q).
