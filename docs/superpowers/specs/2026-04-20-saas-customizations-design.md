# SaaS Customizations — Design Spec

**Fecha**: 2026-04-20
**Estado**: propuesta — pendiente de ejecución
**Contexto**: Post pilares 1–9 (SaaS multi-tenant en prod). Ahora cada agencia que paga necesita poder customizar el sistema sin tocar código.

---

## 1. Problema

MAXEVA Gestión fue construido a medida para Lozada Viajes. Aunque la arquitectura ya es multi-tenant (RLS + org_id en todas las tablas operativas), **la experiencia sigue siendo la de Lozada**:

- Branding: logo "Lozada Viajes" hardcodeado en itinerarios, `<title>` HTML con "Lozada Rosario", sidebar muestra "Lozada Rosario" por default.
- Moneda: `z.enum(["ARS", "USD"])` hardcoded en validaciones — una agencia europea no puede facturar en EUR.
- Comisiones: fórmula única (% × margen). Agencias que pagan montos fijos, escalonados, o por destino no caben.
- Impuestos: retenciones argentinas (AFIP, IVA, IIBB, Ganancias, RG 5617/3819) hardcoded. Una agencia uruguaya/chilena no las necesita.
- Dashboard: KPIs fijos (Deudores, Ventas, Margen). Cada agencia mira números distintos.
- PDF templates: cotizaciones y recibos con layout Lozada — tipografía, colores, orden de secciones.
- Región / destinos: CRM listas tenían 7 default (Argentina, Caribe, Europa, etc.) hardcoded. Ya se mitigó (vacío por default), pero no hay preset.
- Roles: 5 fijos (SUPER_ADMIN / ADMIN / CONTABLE / SELLER / VIEWER). Agencias con estructuras distintas (operadores, supervisores, socios) no tienen forma de crear roles.

Un cliente que paga un SaaS espera poder configurar **su** marca, **su** moneda, **sus** reglas. Si no, el producto se siente como "alquilar el ERP de otra agencia".

## 2. Objetivo

Identificar todas las áreas donde el sistema asume un tenant específico (Lozada/Argentina), y definir **cuáles valen la pena customizar ahora vs. después**, con un plan de trabajo estimado (S/M/L) por área.

**No es objetivo** de este documento ejecutar la customización. Es el mapa para decidir qué atacar primero.

## 3. Metodología

Cada área se analiza con 5 campos:

- **Estado actual**: hardcoded / parametrizado parcial / ya parametrizado.
- **Objetivo**: qué debería poder configurar cada tenant.
- **Delta técnico**: archivos, tablas y endpoints que hay que tocar.
- **Esfuerzo**: S (≤1 día), M (2–4 días), L (1 semana+).
- **Prioridad**: MUST (no podemos facturar SaaS sin esto) / SHOULD (diferenciador competitivo) / NICE (long tail).

## 4. Áreas identificadas

### 4.1 Branding (logo, nombre, colores)

**Estado actual**: parcialmente parametrizado.

- `organization_settings` ya guarda `brand_color`, `logo_url`, `company_name` → leído en `components/settings/interface-settings.tsx:85` y `components/site-header.tsx`, `components/app-sidebar.tsx`.
- **Pero**: `app/layout.tsx:10` tiene `title: "Lozada Rosario - Gestión de Agencia de Viajes"` hardcoded (se ve en la pestaña del browser + SEO).
- `components/operations/itinerary-section.tsx:330` → `<img src="/lozada-logo.png" alt="Lozada Viajes" />` hardcoded en la vista de itinerario operativa.
- Los fallback strings `|| "Lozada Rosario"` en sidebar y site-header delatan que si `organization_settings` está vacía, el default sigue siendo Lozada.

**Objetivo**: cada tenant ve su logo, nombre y color primario en:

- `<title>` HTML dinámico (server component que lee de org).
- Sidebar, header, login, onboarding completado.
- Itinerarios, PDFs de cotización y recibo.
- Favicon (opcional NICE).

**Delta técnico**:

- `app/layout.tsx` → convertir `metadata` en `generateMetadata()` async que lea `organization_settings` del user actual (con fallback neutro, ej. "MAXEVA Gestión").
- Reemplazar `"/lozada-logo.png"` en `itinerary-section.tsx` por `logo_url` del org (con fallback al placeholder del sistema, no al de Lozada).
- Quitar fallbacks `|| "Lozada Rosario"`; si no hay nombre, mostrar `"Tu agencia"` o forzar onboarding.
- Storage bucket `organization_logos` público con RLS por org_id para uploads.
- `components/settings/interface-settings.tsx` ya permite editar → solo falta endpoint de upload de logo.

**Esfuerzo**: **S** (1 día — el 70% ya está, son limpiezas).

**Prioridad**: **MUST**. Es lo primero que ve un cliente al abrir la app; sin esto el onboarding "no parece propio".

---

### 4.2 Moneda base y monedas soportadas

**Estado actual**: hardcoded a ARS/USD.

- `lib/validation.ts:23` → `currency: z.enum(["ARS", "USD"])`.
- `lib/accounting/fx.ts` asume que la moneda base es ARS (todos los cálculos USD→ARS).
- `tax_withholdings` default `"ARS"`.
- `exchange_rates` solo maneja pares ARS↔X.

**Objetivo**: que una agencia en España pueda tener moneda base EUR, facturar en EUR/GBP, y seguir usando el sistema.

**Delta técnico**:

- Tabla nueva `organization_currencies` o campo `organization_settings.supported_currencies jsonb` + `base_currency`.
- Reemplazar todos los `z.enum(["ARS","USD"])` por `z.string()` + validación runtime contra la lista del org.
- `fx.ts`: refactor para usar `base_currency` del org en lugar de ARS hardcoded.
- `exchange_rates`: re-modelar como pares (from, to) en lugar de asumir ARS como pivote.
- UI: selector de monedas en Settings → Moneda.

**Esfuerzo**: **L** (1–2 semanas — atraviesa cálculos financieros críticos, riesgo alto de bugs en ledger).

**Prioridad**: **SHOULD** para 2026-Q3. **MUST** si captamos un cliente fuera de Argentina antes.

**Riesgo**: `ledger_movements` ya tiene `amount_ars` y `amount_original`. Romper la relación ARS-como-pivote puede re-abrir el bug de "plata desaparecida" que ya ocurrió.

---

### 4.3 Comisiones de vendedores

**Estado actual**: hardcoded en la lógica, pero ya se arregló el *valor*.

- `lib/commissions/calculate.ts` aplica `comision = margen × %` donde `%` viene de (1) `commission_rules` seller-specific, (2) `users.default_commission_percentage` (canónico, ya aplicado), (3) `commission_rules` generic.
- **La fórmula es única**: siempre porcentaje sobre margen. No soporta:
  - Monto fijo por operación vendida.
  - Escalas (0–10% según volumen mensual, ej. "si vende >USD 50k, sube al 12%").
  - % sobre venta total en lugar de margen.
  - % distinto según destino / tipo de producto (aéreo vs terrestre vs hotel).

**Objetivo**: cada tenant define su política de comisiones vía UI, sin tocar código.

**Delta técnico**:

- Extender `commission_rules` con `rule_type enum ('PERCENTAGE_ON_MARGIN', 'PERCENTAGE_ON_SALE', 'FIXED_PER_OPERATION', 'TIERED_BY_VOLUME')` + `tiers jsonb`.
- `lib/commissions/calculate.ts` → function router por `rule_type`.
- UI en `app/(dashboard)/settings/commissions` para construir reglas (ya hay base).
- Tests de regresión: agregar suite por tipo de regla (actual suite solo cubre PERCENTAGE_ON_MARGIN).

**Esfuerzo**: **M** (3–4 días — el módulo de commissions ya está aislado en `lib/commissions/`, la extensión es aditiva).

**Prioridad**: **SHOULD**. Cada agencia paga distinto — pero no bloquea venta del SaaS; el % canónico actual cubre 70% de los casos.

---

### 4.4 Impuestos y retenciones (AFIP / RG argentinas)

**Estado actual**: hardcoded a Argentina.

- `lib/accounting/withholding-rules.ts` tiene `DEFAULT_WITHHOLDING_RULES` con 7 reglas argentinas (IVA, IIBB, Ganancias, RG 5617, RG 3819).
- `financial_settings.withholding_rules jsonb` permite override por agencia, pero el enum `WithholdingType` (línea 16-24) es un set fijo argentino.
- AFIP SDK (`@afipsdk/afip.js`) solo sirve para Argentina.
- PDFs de facturas generan comprobantes tipo A/B/C argentinos.

**Objetivo**: permitir tenants no-argentinos (Uruguay DGI, Chile SII, España AEAT) o agencias argentinas que no usan AFIP (monotributistas).

**Delta técnico**:

- Tabla `tax_regimes` master (AR_GENERAL, UY_DGI, CL_SII, NONE).
- `organizations.tax_regime_id` → determina qué retenciones aparecen, qué provider de facturación se usa.
- `WithholdingType` convertirlo de enum a string libre + validar contra `tax_regimes.allowed_withholding_types`.
- Provider abstraction: interfaz `InvoiceProvider` con implementaciones `AfipProvider`, `DgiProvider`, `NoneProvider`.
- UI en Settings → Impuestos con regime picker.

**Esfuerzo**: **L** (2 semanas — AFIP está muy acoplado en `app/api/settings/afip/*` y en el flujo de cada pago).

**Prioridad**: **NICE** por ahora — los 200 tenants target son todos argentinos. **MUST** cuando se quiera vender fuera.

**Short-term workaround**: en Settings → Impuestos permitir "desactivar todas las retenciones" (para agencias AR monotributistas o de prueba). Eso es **S** (1 día).

---

### 4.5 Templates de PDF (cotización, recibo, factura)

**Estado actual**: hardcoded en código.

- `lib/pdf/quotation-pdf.ts` y `lib/pdf/receipt-pdf.ts` usan pdfmake con layouts fijos.
- Mig 073 creó tabla `pdf_templates` pero **no se usa** — es esqueleto sin UI editor.
- Textos legales, numeración, orden de secciones, pie de página: todo hardcoded.

**Objetivo**: cada tenant puede customizar:

- Colores y tipografía (brand alignment).
- Textos legales (T&Cs, cancelation policy, tax disclaimer).
- Logo (ya viene de branding 4.1).
- Campos visibles / ocultos (ej. "no mostrar margen al cliente").

**Delta técnico**:

- Aprovechar `pdf_templates` que ya existe. Esquema sugerido: `{ type: 'QUOTATION'|'RECEIPT'|'INVOICE', org_id, config jsonb }` con `config` estructurado (no HTML libre — demasiado riesgoso).
- Editor UI en Settings → Templates: presets + overrides (color primario, fuente, texto legal, toggles de secciones).
- Refactor `quotation-pdf.ts` para leer config del org en vez de constantes.

**Esfuerzo**: **M** (4–5 días — el refactor es aditivo pero hay que testear el rendering con varios configs).

**Prioridad**: **SHOULD**. Los PDFs son lo que el cliente ve post-venta; que diga "Lozada" en el footer de una cotización de LOLO es un deal-breaker.

**Quick win (S, 1 día)**: solo permitir override de (a) logo, (b) color primario, (c) texto de T&Cs. Cubre 80% del feedback cosmético sin re-arquitectar.

---

### 4.6 Dashboard KPIs customizables

**Estado actual**: hardcoded.

- `components/dashboard/dashboard-page-client.tsx` muestra KPIs fijos: Ventas, Margen, Deudores, Caja, Leads.
- Cada agencia mira números distintos (una enfocada en mayorista quiere "Comisión por operador", una minorista quiere "Conversión por canal", etc.).

**Objetivo**: cada user/org puede elegir qué KPIs ver, en qué orden, con qué rango de fechas default.

**Delta técnico**:

- Tabla nueva `dashboard_widgets` (widget_id, user_id | org_id, position, config).
- Catálogo de widgets disponibles (hardcoded, aumenta con el tiempo): 20–30 widgets pre-construidos.
- UI de "Editar dashboard" con drag-drop (usar `@dnd-kit/sortable` o similar).
- API `/api/dashboard/widgets` GET/PUT.

**Esfuerzo**: **L** (1 semana+ — el drag-drop + la abstracción de widgets es un mini-framework).

**Prioridad**: **NICE**. Lindo diferenciador pero no bloquea venta. Se puede diferir a Q4.

**Short-term (S, 1 día)**: permitir al user **ocultar** KPIs del dashboard (checkbox en Settings → Dashboard). No drag-drop, no layouts custom, solo show/hide. Cubre 50% del valor con 10% del esfuerzo.

---

### 4.7 Destinos y regiones

**Estado actual**: mitigado, pero sin preset.

- Se eliminó el fallback hardcoded de "Argentina / Caribe / Europa / USA / etc." en `components/sales/new-lead-dialog.tsx`. Ahora una agencia nueva ve dropdown vacío.
- Tabla `destinations_master` global, `destination_requirements` global (son catálogos puros, ok compartidos).
- **Pero**: las **listas de CRM** (columnas Kanban) son per-tenant y arrancan vacías — onboarding fricción alta.

**Objetivo**: onboarding con preset de regiones populares, pero editable.

**Delta técnico**:

- En el wizard de onboarding: checkbox "Crear listas CRM default (Argentina, Caribe, Europa, USA, Varios)" + botón "Empezar vacío".
- Lógica en `POST /api/onboarding` para crear las `manychat_list_order` rows según selección.

**Esfuerzo**: **S** (½ día).

**Prioridad**: **SHOULD**. Es UX puro de onboarding — reduce TTV (time to value) de un tenant nuevo.

---

### 4.8 Operadores / proveedores

**Estado actual**: correcto, por-tenant.

- Tabla `operators` ya tiene `org_id` + RLS.
- Cada agencia arranca con lista vacía y carga los suyos.

**No requiere cambios**. Solo documentar en manual de onboarding que "operadores" son los proveedores propios de cada agencia.

**Esfuerzo**: 0.

**Prioridad**: **-**.

---

### 4.9 Integraciones externas (Trello, WhatsApp, OpenAI, Emilia/Vibook, MercadoPago)

**Estado actual**: mixto.

- **Trello**: per-tenant (tabla `settings_trello` scoped, webhooks individuales). ✅
- **WhatsApp** (wa_* tables): per-user dentro del tenant tras migrations 147/148. ✅
- **OpenAI**: global (owner paga). AI Copilot scope-filtra en código por org. ✅
- **Emilia/Vibook**: global API key, no hay scope per-tenant (todas las agencias ven los mismos resultados de búsqueda). Aceptable — es un buscador genérico de hoteles.
- **MercadoPago**: (Pilar 9) global del dueño del SaaS para cobrar suscripciones. Cada agencia no tiene su propia integración MP para cobrar a **sus** clientes — si la quieren, hoy no se puede.

**Objetivo opcional**: permitir que cada agencia conecte su propia MP/Stripe para cobrar a sus clientes finales.

**Delta técnico**:

- Tabla `organization_payment_providers` (provider, credentials_encrypted, is_active).
- OAuth flow con MP para autorizar a la plataforma a crear preferencias en su cuenta.
- Refactor de payment flow para elegir provider según org.

**Esfuerzo**: **L** (1 semana+, incluye compliance — tokens de terceros).

**Prioridad**: **NICE**. Muy pedido por agencias grandes, pero las chicas usan link de pago manual. Diferir.

---

### 4.10 Roles y permisos customizables

**Estado actual**: 5 roles fijos en código.

- `lib/permissions.ts` define matriz `role × module × action` como constante.
- `users.role` es enum restringido (mig 144 agregó ORG_OWNER).
- Cada tenant hereda los mismos 5 roles.

**Objetivo**: agencias grandes quieren crear roles propios ("Supervisor regional", "Contador externo read-only", "Socio capitalista"). Agencias chicas están bien con los 5 defaults.

**Delta técnico**:

- Tabla `organization_roles` (org_id, name, permissions jsonb).
- Tabla `role_permissions` o embed en el jsonb.
- Migrar `users.role: string` a `users.role_id: uuid → organization_roles.id`.
- UI en Settings → Roles con matriz editable.
- Backfill: al migrar, crear 5 roles default (copy del constant actual) por org.

**Esfuerzo**: **L** (1+ semana — el refactor de `canPerformAction()` toca 100+ sitios + tests).

**Prioridad**: **NICE**. Los 5 roles cubren 90% de los casos. Diferir a que un cliente lo pida explícitamente.

---

### 4.11 Notificaciones (tipos, canales, cadencia)

**Estado actual**: hardcoded.

- `lib/alerts/generate.ts` tiene tipos de alerta fijos (payment_reminder, upcoming_trip, doc_missing, etc.).
- Canales: email (via SMTP org settings) + push web (push_subscriptions).
- Cadencia: 48–72h antes del viaje, hardcoded.

**Objetivo**: cada tenant activa/desactiva tipos de alerta y configura cadencia ("recordar 7 días antes, no 72h").

**Delta técnico**:

- Tabla `organization_alert_settings` (alert_type, is_enabled, lead_time_hours, channels).
- Refactor `generate.ts` para leer config del org.
- UI en Settings → Alertas con toggles + sliders.

**Esfuerzo**: **M** (3 días).

**Prioridad**: **SHOULD**. Preferencia común ("no me mandes 6 notificaciones por semana").

---

### 4.12 Políticas de negocio (términos de pago, cancelación, retención de depósito)

**Estado actual**: en `organization_settings.policies jsonb` (campo libre).

- Se renderiza en PDFs y emails pero no hay UI editor estructurado.

**Objetivo**: editor UI con secciones (términos de pago, política de cancelación, retención de depósito, etc.) en lugar de textarea libre.

**Delta técnico**:

- Esquema JSON estructurado (`{ payment_terms_days, cancellation_policy_text, deposit_retention_percentage, refund_window_days, ...}`).
- UI en Settings → Políticas con form por sección.
- Render en PDFs leyendo el esquema.

**Esfuerzo**: **S** (1–2 días).

**Prioridad**: **SHOULD** junto con 4.5 (templates).

---

### 4.13 Datos bancarios / instrucciones de pago

**Estado actual**: `financial_accounts` por-tenant. ✅

- Cada agencia carga sus cuentas (CBU, CVU, alias, MP).
- Los PDFs ya las leen dinámicamente.

**No requiere cambios**. Solo mejorar la UI de setup en onboarding (crear 1 cuenta ejemplo automáticamente).

**Esfuerzo**: 0 lógica, **S** onboarding UX.

**Prioridad**: **NICE** (mejora onboarding).

---

### 4.14 Idioma / locale

**Estado actual**: español hardcoded.

- Todos los textos de UI en español rioplatense.
- Formatos de fecha DD/MM/YYYY asumidos.
- No hay i18n setup.

**Objetivo**: soportar inglés / portugués para vender fuera.

**Delta técnico**: next-intl + strings extraction (30+ archivos).

**Esfuerzo**: **L** (2+ semanas).

**Prioridad**: **NICE**. Diferir hasta tener lead real fuera de LATAM hispanohablante.

---

## 5. Resumen priorizado

| Área | Prioridad | Esfuerzo | Quick win disponible |
|------|-----------|----------|----------------------|
| 4.1 Branding (logo, nombre, título, colores) | MUST | S | — |
| 4.5 PDF templates (logo + color + T&Cs) | SHOULD | S (quick) / M (completo) | ✅ quick win |
| 4.7 Destinos preset en onboarding | SHOULD | S | — |
| 4.12 Políticas estructuradas | SHOULD | S | — |
| 4.3 Comisiones (tipos de regla) | SHOULD | M | — |
| 4.11 Notificaciones configurables | SHOULD | M | — |
| 4.4 Impuestos — toggle desactivar todo | MUST-workaround | S | ✅ quick win |
| 4.4 Impuestos — multi-país | NICE | L | — |
| 4.2 Moneda multi-soporte | SHOULD (2026-Q3) | L | — |
| 4.6 Dashboard show/hide KPIs | SHOULD | S (quick) | ✅ quick win |
| 4.6 Dashboard drag-drop | NICE | L | — |
| 4.9 MP/Stripe per tenant | NICE | L | — |
| 4.10 Roles custom | NICE | L | — |
| 4.14 Idiomas | NICE | L | — |

**Plan sugerido de ejecución** (después de resolver pendientes operacionales AFIP/Landing/MP/UI):

- **Sprint 1 (MUST — 2–3 días)**: 4.1 Branding completo + 4.4 toggle de impuestos.
- **Sprint 2 (Quick wins — 3 días)**: 4.5 PDF (logo+color+T&Cs) + 4.7 destinos preset + 4.6 show/hide + 4.12 políticas.
- **Sprint 3 (SHOULD medianos — 1 semana)**: 4.3 comisiones + 4.11 notificaciones.
- **Sprint 4+ (L grandes)**: cuando aparezca el caso de uso real. No adelantar trabajo.

Total para "SaaS se siente propio de cada tenant" (sprints 1–3): **~2 semanas de trabajo**.

## 6. Notas de arquitectura

- **Patrón recurrente**: `organization_settings jsonb` (ya existe) sirve como bolsa de config. Resistir la tentación de crear una tabla por cada área — es over-engineering. Solo tablas dedicadas cuando hay relaciones (ej. `dashboard_widgets` es por-user, no por-org).
- **RLS**: todas las tablas nuevas arrancan con org_id + RLS + trigger auto-org-id (ya hay macro en mig 152). Nada de "lo hacemos rápido y agregamos seguridad después" — ese es el atajo que creó los leaks que estuvimos fixeando esta semana.
- **Fallbacks**: sistema-wide, los defaults NUNCA son "Lozada". Son neutros ("Tu agencia" / "MAXEVA Gestión") o forzados por onboarding.
- **Feature flags**: considerar `organization_features jsonb` con toggles (`commissions_enabled`, `afip_enabled`, `trello_enabled`) para diferenciar planes STARTER / PRO / ENTERPRISE sin forks de código.

## 7. Qué no está en scope

- **Multi-tenant billing avanzado** (usage-based pricing, metered overages). Pilar 9 ya resolvió preapproval MP; más sofisticación = otra iteración.
- **White-label** (custom domain per tenant, remove MAXEVA branding). Complejo (SSL per tenant, DNS) y solo 2–3 agencias grandes lo piden. Diferir.
- **Mobile apps customizadas per tenant**. Una app web + una PWA genérica alcanza.
- **Analytics platform** (Mixpanel-style tracking per tenant). Hoy no hay y no hay pedido.

---

**Next step**: antes de ejecutar este spec, resolver pendientes operacionales (AFIP end-to-end, landing vibook integration, MP live test, UI dialogs padding). Ver `docs/roadmap/ROADMAP-SAAS.md` sección "Pendientes post-launch".
