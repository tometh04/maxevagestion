# MAXEVA SaaS — Roadmap Vivo

> **Propósito**: Documento vivo que refleja el estado actual del roadmap SaaS. Se actualiza a medida que se completan tareas. Si pasás a una conversación nueva, **leé este archivo primero** para retomar contexto sin perder nada.

**Specs de referencia**:
- [2026-04-19 Multi-tenant architecture](docs/superpowers/specs/2026-04-19-saas-multitenant-architecture.md) — arquitectura base
- [2026-04-20 SaaS customizations](docs/superpowers/specs/2026-04-20-saas-customizations-design.md) — plan de customizaciones per-tenant

**Fecha última actualización**: 2026-04-20 (post mig 153 + customization spec escrito)
**Status global**: 🟢 SaaS refactor FULL PASS — pilares 1–9 cerrados. 23 migrations aplicadas (132–153). Guards activos (smoke-isolation, audit-rls, jest isolation suite + CI, admin-client lint). Admin console + onboarding + billing enforcement + MercadoPago preapproval funcionando. **Lo que queda es operacional + customización, no arquitectura.**

---

## Cómo usar este documento

- **Para retomar en conversación nueva**: leé secciones "Status actual" + "Pendientes post-launch" + "Decisiones tomadas" para tener todo el contexto.
- **Para el agente**: al completar una task, mové el ítem de `[ ]` a `[x]` + agregá nota con commit hash si aplica. Actualizá "Fecha última actualización".
- **Para reportar**: la sección "Status actual" es el resumen de 3 líneas.

---

## Status actual (TL;DR)

### Pilares (arquitectura SaaS core) — ✅ CERRADOS

- ✅ **Pilar 1** (2026-04-19) — 42 tablas tenant-scoped con org_id + RLS.
- ✅ **Pilar 2 + 2c** (2026-04-20) — 26 routes DB-facing cerrados; libs accounting refactoreadas; RPC SECURITY INVOKER.
- ✅ **Pilar 3** (2026-04-20) — `getScopedContext()` + middleware onboarding redirect.
- ✅ **Pilar 4** (2026-04-20) — `platform_admins` + ORG_OWNER role (mig 142, 144).
- ✅ **Pilar 5** (2026-04-20) — Jest isolation suite (41 tests) + GitHub Actions CI.
- ✅ **Pilar 6** (2026-04-20) — `/admin/*` console (orgs list, detail, metrics, audit log).
- ✅ **Pilar 7** (2026-04-20) — `/onboarding` wizard + billing limits enforcement + Lozada ENTERPRISE.
- ✅ **Pilar 8** (2026-04-20) — `security_audit_log` + `logSecurityEvent()` + `MULTI_TENANT_STRICT` kill switch.
- ✅ **Pilar 9** (2026-04-20) — MercadoPago preapproval + paywall + checkout UI.

### Post-launch hotfixes — ✅ CERRADOS (2026-04-20)

Descubiertos cuando LOLO (tenant nuevo) reportó leaks y errores. Todos fixeados:

- ✅ Currency mix en stats de ledger (JOIN con financial_accounts + filter lm.currency = fa.currency).
- ✅ wa_* tables tenant isolation (migs 147, 148).
- ✅ Legacy permissive RLS policies drop (financial_settings, integrations, manychat_list_order — mig 151).
- ✅ RLS 42501 universal en INSERTs: auto-org_id trigger en tasks/ledger_movements/cash_movements (mig 150 v3) + trigger universal en todas las tablas tenant-scoped (mig 152).
- ✅ AFIP multi-tenant: setup route (env fallback removido), system route (reads `integrations` by agency_id), automation route (body params only). Detection de WSFE points of sale post-setup.
- ✅ CRM listas: removed hardcoded fallback de 7 regiones Lozada. Dropdown muestra "Aún no creaste ninguna lista" si el tenant no tiene.
- ✅ Quotations cross-org unique constraint fix: `UNIQUE (org_id, quotation_number)` + `generate_quotation_number(p_org_id)` → LANGUAGE sql (SQL Editor compat) (mig 153).
- ✅ tax_withholdings tenant isolation: org_id + agency_id + RLS + trigger (mig 153).
- ✅ Commissions canónicas: `users.default_commission_percentage` es la fuente. `getSellerPercentage()` prioriza commission_rules específica → users → commission_rules genérica → 0.
- ✅ Reverted: NO seedear commission_rules default 10% en onboarding (arbitrario, mezcla contabilidad).
- ✅ Dashboard KPI Deudores: fix agency_id filter para SUPER_ADMIN/ORG_OWNER + removed unstable_cache (daba $0 por 5min).

---

## Pendientes post-launch (orden de ataque)

**Antes de customizaciones, resolver estos issues operacionales**:

### 0. Documentos legales (prioridad crítica, pre-landing)
- [ ] Términos y Condiciones de Uso.
- [ ] Política de Privacidad (énfasis en aislamiento de datos y no-explotación comercial — target son dueños de agencia vendiendo a otros dueños, alta suspicacia de robo de datos).
- [ ] Política de Cookies.
- [ ] Integración en signup (`/register`) con checkbox bloqueante + versión de aceptación guardada en DB.
- [ ] Links en landing (repo `vibook-landing`).
- [ ] Spec: pendiente de escribir en `docs/superpowers/specs/YYYY-MM-DD-legal-docs-design.md`.

### 1. AFIP end-to-end validation (prioridad alta)
- [ ] Desde LOLO, completar el flujo completo de AFIP: setup → ver points of sale detectados → activar automation → emitir 1 factura de prueba.
- [ ] Verificar que Lozada (Maxi) siga facturando sin regresión.
- [ ] Si la agencia no tiene WSFE habilitado en su AFIP real, mostrar instrucciones claras (ya implementado UI side, validar copy).

### 2. Landing / marketing (prioridad alta)
- [x] Landing actualizada con 2 planes (PRO ARS $119.000 con trial 7d / Enterprise "Consultar" con bot ads→CRM). Commit `cbb3855` en `vibook-landing`.
- [ ] **DNS/Domains**: apuntar `vibook.ai` → Vercel landing, `app.vibook.ai` → ERP. `maxevagestion.com` → redirect 301 a `app.vibook.ai` (o mantener ambos dominios activos).
- [ ] **ERP: handle `?plan=pro`** en `/register`. Al terminar signup, si el query param está presente, saltear onboarding wizard y redirigir directo a `/api/billing/checkout` para preapproval MP. Status queda `TRIAL` con preapproval pre-aprobado. Si no viene, flow actual (onboarding wizard).
- [ ] **Email `hola@vibook.ai`** debe estar funcionando — el CTA de Enterprise en el landing apunta ahí (`mailto:hola@vibook.ai?subject=Vibook Enterprise`).

### 3. MercadoPago real-world test (prioridad alta)
- [ ] Crear cuenta MP sandbox test y cuenta MP productiva del owner.
- [ ] End-to-end: agencia crea cuenta → elige PRO → redirect MP → aprueba suscripción → webhook recibe → status pasa a ACTIVE.
- [ ] Validar paywall: simular `PAST_DUE` y ver redirect a /paywall.
- [ ] Documentar en CONFIGURACION_SUPABASE.md las env vars MP requeridas.

### 4. UI dialogs audit (prioridad media)
- [ ] Revisar padding de todos los dialogs en dashboard — user reportó inconsistencias visuales.
- [ ] Lista de dialogs a revisar: new-lead-dialog, payment-mark-paid, commission-assign, quotation-builder, operation-status-change.
- [ ] Checklist: padding uniforme, `max-width`, scroll behavior en mobile.

### 5. Customizaciones per-tenant (prioridad media-baja, plan escrito)

Ver `docs/superpowers/specs/2026-04-20-saas-customizations-design.md` para análisis completo. Orden de ejecución sugerido:

**Sprint 1 — MUST (2–3 días)**:
- [ ] 4.1 Branding completo (title dinámico, logo org en itinerary, quitar fallbacks "Lozada Rosario").
- [ ] 4.4 Toggle para desactivar todas las retenciones (para monotributistas / test agencies).

**Sprint 2 — Quick wins (3 días)**:
- [ ] 4.5 PDF templates: logo + color + T&Cs override (sin refactor completo).
- [ ] 4.7 Destinos preset en onboarding wizard (checkbox "crear listas default").
- [ ] 4.6 Dashboard show/hide KPIs (sin drag-drop).
- [ ] 4.12 Políticas estructuradas (JSON schema + UI editor).

**Sprint 3 — SHOULD medianos (1 semana)**:
- [ ] 4.3 Comisiones multi-tipo (porcentaje margen / porcentaje venta / fijo / escalonado).
- [ ] 4.11 Notificaciones configurables (toggles + cadencia).

**Sprint 4+ (L grandes, diferir hasta tener caso de uso real)**:
- [ ] 4.2 Moneda multi-soporte (base currency ≠ ARS).
- [ ] 4.4 Impuestos multi-país (Uruguay DGI, Chile SII, etc.).
- [ ] 4.6 Dashboard drag-drop widgets.
- [ ] 4.9 MP/Stripe per-tenant (que cada agencia conecte **su** MP para cobrar clientes).
- [ ] 4.10 Roles custom por org.
- [ ] 4.14 i18n (inglés / portugués).

### 6. Feature deferida
- [ ] `/admin/impersonate` (Pilar 6.5) — requiere JWT signing con Supabase secret. Diferido hasta que esté disponible la infra.

### 7. Branding: fallback secundario para tab title
- [ ] En `generateMetadata()` de `app/layout.tsx`, si `organization_settings.company_name` está vacío, caer a `agencies.name` del primer agency del org antes del neutro "MAXEVA Gestión". Para tenants que no completaron Mi Empresa pero ya tienen agencias cargadas. 5 min de código.

---

## Decisiones tomadas (no reabrir sin razón)

1. **Modelo de isolation**: per-tenant todo lo operativo. Compartido: catálogos puros (destinations_master, destination_requirements, exchange_rates).
2. **Roles**: `PLATFORM_ADMIN` separado (tabla dedicada), `ORG_OWNER/ADMIN/CONTABLE/SELLER/VIEWER` dentro de cada tenant. Maxi opera como `SUPER_ADMIN` efectivo-ORG_OWNER por RLS.
3. **User membership**: single-org. PLATFORM_ADMIN puede impersonar (único que cruza orgs).
4. **AFIP**: 1 config por org (tabla `integrations` scoped por agency_id).
5. **WhatsApp**: por-user dentro del tenant (wa_* tables scoped).
6. **OpenAI**: 1 API key global (owner paga), pero AI Copilot scope-filtra data por org.
7. **Emilia/Vibook**: API key global. Búsqueda de hoteles genérica, aceptable compartida.
8. **MercadoPago (suscripciones SaaS)**: MP global del dueño para cobrar a agencias. Cada agencia NO tiene MP propia para cobrar a **sus** clientes (diferido a customización 4.9).
9. **Commission seed**: NO seedear regla default al crear org. El % lo setea el owner al crear usuario vendedor en `users.default_commission_percentage`. Esto sobreescribe la tentación previa de seedear 10% genérico (era arbitrario, mezclaba contabilidad para agencias con reglas distintas).
10. **Defense in depth**: 3 capas — RLS (DB) + scoped-client (código) + tests isolation (CI).
11. **Migraciones**: se pasan al user para correr en Supabase SQL Editor (NO `supabase db push` — el remote tracking está desincronizado). Si una migration falla por parseo del editor con DECLARE/SELECT INTO, reescribir con `LANGUAGE sql` inline.

---

## Migraciones aplicadas en prod

| Mig | Qué hace | Status |
|-----|----------|--------|
| 132 | Crea organizations, organization_members, agregar org_id a agencies/users/customers/operators/alerts | ✅ prod |
| 133 | org_id en financial_accounts, pdf_templates, message_templates | ✅ prod |
| 134 | org_id en 34 tablas core (leads, operations, payments, etc) + indexes | ✅ prod |
| 135 | org_id en organization_settings + unique (org_id, key) | ✅ prod |
| 136 | RLS tenant_isolation en 38 tablas | ✅ prod (tuvo recursion bug) |
| 137 | Fix recursion con función `user_org_ids()` SECURITY DEFINER | ✅ prod |
| 138 | Drop policies viejas permisivas (`qual = true`) | ✅ prod |
| 139 | Force RLS + re-create policy en iva_sales/iva_purchases/commission_records/customers/operators | ✅ prod |
| 140 | RLS en agencies + user_agencies + users + organization_invitations | ✅ prod |
| 141 | `execute_readonly_query` → SECURITY INVOKER | ✅ prod (2026-04-20) |
| 142 | Tabla `platform_admins` + RLS + seed Tomi | ✅ prod (2026-04-20) |
| 143 | `itinerary_items` org_id + RLS tenant_isolation | ✅ prod (2026-04-20) |
| 144 | Agregar `ORG_OWNER` a `users.role` CHECK | ✅ prod (2026-04-20) |
| 145 | Tabla `security_audit_log` + RLS platform-admin-only | ✅ prod (2026-04-20) |
| 146 | Seed Lozada plan=ENTERPRISE, status=ACTIVE, max_*=999 | ✅ prod (2026-04-20) |
| 147 | wa_* tables tenant isolation (5 tablas) | ✅ prod (2026-04-20) |
| 148 | wa_auth_credentials tenant isolation (faltante de 147) | ✅ prod (2026-04-20) |
| 149 | billing_events infra (Pilar 9) | ✅ prod (2026-04-20) |
| 150 | Auto-org_id triggers ledger_movements/cash_movements/tasks (v3, SQL Editor compat) | ✅ prod (2026-04-20) |
| 151 | Drop legacy permissive policies financial_settings/integrations/manychat_list_order | ✅ prod (2026-04-20) |
| 152 | DO block: install auto_set_org_id_from_auth trigger en todas las tablas tenant-scoped | ✅ prod (2026-04-20) |
| 153 | quotations UNIQUE (org_id, quotation_number) + generate_quotation_number(p_org_id) + tax_withholdings org_id/agency_id + RLS + trigger | ✅ prod (2026-04-20) |

---

## Riesgos conocidos

| Riesgo | Mitigación | Status |
|--------|------------|--------|
| Maxi pierde acceso durante refactor | Roles y policies instant-rollback; RLS testeado | 🟢 resuelto |
| Tests rompen CI y atrasa deploy | Tests corren en PR no en main; fallback `MULTI_TENANT_STRICT=false` | 🟢 bajo |
| AFIP break en alguna agencia | Config scoped por agency_id en `integrations`; env fallback removido | 🟢 resuelto |
| Query slowness con 200 tenants | Índices en org_id creados; pendiente load test con 500 tenants sintéticos | 🟡 medio |
| MP webhook race (suscripción no se activa) | HMAC verification + idempotency por preapproval_id | 🟢 bajo |
| Customizaciones atrasan roadmap | Priorizado por MUST/SHOULD/NICE; quick wins primero | 🟢 bajo |

---

## Scripts útiles

- `scripts/smoke-isolation.ts` — valida segregación por `org_id` en 12 tablas críticas.
- `scripts/audit-rls.ts` — verifica ownership real (no solo count).
- `scripts/check-admin-client.sh` + `scripts/admin-client-allowlist.txt` — lint guard contra uso de `createAdminClient` fuera de allowlist.
- `npm test -- __tests__/isolation` — 41 tests de tenant segregation.

---

## Emails y URLs de referencia

- **Maxi (Lozada Viajes, OWNER)**: `maxi@erplozada.com`
- **LOLO user (agency de prueba)**: `agency@agency.com`
- **Tomi (platform admin)**: `tomas.sanchez04@gmail.com`
- **URL prod**: `https://www.maxevagestion.com`
- **Supabase project**: `pmqvplyyxiobkllapgjp`
- **Landing repo**: `https://github.com/tometh04/vibook-landing`

---

## Notas para retomar en otra conversación

Si llegaste acá desde una sesión nueva:

1. **Lee los specs**:
   - `docs/superpowers/specs/2026-04-19-saas-multitenant-architecture.md` — arquitectura base.
   - `docs/superpowers/specs/2026-04-20-saas-customizations-design.md` — plan de customizaciones.
2. **Mirá "Status actual" + "Pendientes post-launch"** arriba.
3. **NO** rehagas ninguna decisión de "Decisiones tomadas" sin consultar.
4. Si el status dice algo está "✅ prod" significa que ya está aplicado en producción y NO hay que re-ejecutar.
5. Si hace falta una nueva migración SQL, escribila, dejala en `supabase/migrations/` y **pásasela al user en el chat** para que la corra en SQL Editor — no usamos `supabase db push` (remote tracking desincronizado).
6. Si una migration falla en SQL Editor por parseo DECLARE/SELECT INTO, reescribila con `LANGUAGE sql` inline (ver mig 150 v3 y mig 153 como referencia).
