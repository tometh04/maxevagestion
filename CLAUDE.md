# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**vibook** (codename interno: MAXEVA GESTION) is a comprehensive travel agency management SaaS (ERP) built with Next.js 15+, TypeScript, Supabase (PostgreSQL), and shadcn/ui. The system manages the complete business flow: leads from Manychat → operations → payments → accounting → commissions.

- **Dominio producción**: `app.vibook.ai`
- **Modelo de negocio**: Multi-tenant SaaS con planes PRO ($119.000 ARS/mes, 7 días trial) y Enterprise. Pagos vía MercadoPago preapproval.
- **Status**: Production-ready en Railway.

## Development Commands

```bash
# Development
npm run dev              # Start dev server on port 3067
npm start               # Start production server on port 3005

# Build
npm run build           # Build for production
npm run lint            # Run ESLint + check:admin-client

# Testing
npm run test            # Run Jest tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage report
npm run test:isolation  # Run isolation tests (--runInBand)

# Database
npm run db:generate     # Generate TypeScript types from Supabase schema
npm run db:seed         # Seed database with initial data
npm run db:seed:mock    # Seed database with mock data for testing
npm run db:check        # Verify tables exist in database

# Scripts de utilidad
npm run limpieza:masiva # Limpieza masiva pre-importación de datos
```

## Architecture Overview

### Tech Stack
- **Frontend**: Next.js 15+ (App Router), React 18, TypeScript
- **UI Components**: shadcn/ui (Radix UI primitives) - ONLY use these components
- **Styling**: TailwindCSS with custom configuration
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Authentication**: Supabase Auth with role-based access control
- **External Integrations**:
  - OpenAI GPT-4o (OCR for documents, AI Copilot)
  - Manychat (Instagram/WhatsApp lead capture via webhook)
  - MercadoPago (suscripciones SaaS vía preapproval)
  - Callbell (mensajería WhatsApp/Instagram)
  - AFIP (facturación electrónica argentina)
  - Emilia / vibook.ai search API (búsqueda de vuelos, hoteles)
  - Amadeus API (búsqueda IATA aeropuertos/ciudades)
  - Geoapify (fallback búsqueda de hoteles por destino)
  - Resend (emails transaccionales)

### Project Structure

```
vibook/
├── app/
│   ├── (auth)/              # Authentication pages (login, reset-password, etc.)
│   ├── (dashboard)/         # Protected dashboard pages
│   │   ├── dashboard/       # Main dashboard with KPIs
│   │   ├── sales/leads/     # Leads management (Kanban + Table)
│   │   ├── operations/      # Operations CRUD
│   │   ├── customers/       # Customer management
│   │   ├── operators/       # Operator/supplier management
│   │   ├── cash/            # Cash flow and payments
│   │   ├── accounting/      # Ledger, IVA, financial accounts, operator payments
│   │   ├── alerts/          # Automated alert system
│   │   ├── reports/         # Business reports and analytics
│   │   ├── commissions/     # Commission views
│   │   ├── payments/        # Payment management
│   │   ├── expenses/        # Expense tracking
│   │   ├── finances/        # Financial overview
│   │   ├── calendar/        # Calendar view
│   │   ├── emilia/          # Emilia AI travel search
│   │   ├── messages/        # Internal messaging
│   │   ├── notifications/   # Notification center
│   │   ├── resources/       # Resources section
│   │   ├── tools/           # Internal tools
│   │   ├── ayuda/           # Help / support
│   │   ├── my/              # Seller-specific views (commissions, balance)
│   │   └── settings/        # System configuration (including subscription)
│   ├── admin/               # Super-admin panel (orgs, billing, metrics, audit)
│   ├── cotizacion/          # Public quotation page
│   ├── onboarding/          # Onboarding flow for new orgs
│   ├── paywall/             # Paywall page (subscription required)
│   ├── api/                 # Next.js API routes
│   └── layout.tsx           # Root layout
├── components/
│   ├── ui/                  # shadcn/ui components (DO NOT modify, regenerate if needed)
│   ├── dashboard/           # Dashboard-specific components
│   ├── sales/               # Sales and leads components
│   ├── cash/                # Cash and payment components
│   ├── billing/             # Subscription / billing components
│   ├── settings/            # Settings components
│   └── [module]/            # One folder per dashboard module
├── lib/
│   ├── accounting/          # Accounting logic (ledger, IVA, FX)
│   ├── afip/                # AFIP facturación electrónica
│   ├── ai/                  # AI Copilot tools and context
│   ├── airports/            # Airport/IATA search (Amadeus)
│   ├── alerts/              # Alert generation logic
│   ├── billing/             # SaaS billing (plans, MP, guard, state machine)
│   ├── commissions/         # Commission calculation
│   ├── crm-presets/         # CRM preset configurations
│   ├── cron/                # Cron job utilities
│   ├── customers/           # Customer logic
│   ├── documents/           # Document handling / OCR
│   ├── email/               # Email sending (Resend)
│   ├── emilia/              # Emilia travel search API client
│   ├── hotels/              # Hotel search logic
│   ├── import/              # Data import utilities
│   ├── integrations/        # Third-party integrations (Callbell, webhooks)
│   ├── invoices/            # Invoice generation
│   ├── manychat/            # Manychat lead capture
│   ├── notifications/       # Push / in-app notifications
│   ├── operations/          # Operations business logic
│   ├── payments/            # Payment processing logic
│   ├── pdf/                 # PDF generation
│   ├── quotations/          # Quotation logic
│   ├── receipts/            # Receipt generation
│   ├── security/            # Security utilities
│   ├── supabase/            # Supabase clients (client.ts, server.ts, types.ts)
│   ├── support/             # Support / help logic
│   ├── tasks/               # Internal task management
│   ├── utils/               # General utilities
│   ├── wha-control/         # WhatsApp control panel logic
│   ├── whatsapp/            # WhatsApp messaging
│   ├── audit.ts             # Audit log helpers
│   ├── auth.ts              # Authentication utilities
│   ├── cache.ts             # Server-side cache helpers
│   ├── currency.ts          # Currency formatting
│   ├── destinations.ts      # Destination data
│   ├── organizations.ts     # Multi-tenant org/agency scoping
│   ├── permissions.ts       # Role-based permission system
│   ├── permissions-api.ts   # API-level permission helpers
│   ├── push.ts              # Web push notifications (VAPID)
│   ├── rate-limit.ts        # API rate limiting
│   └── validation.ts        # Input validation helpers
├── supabase/migrations/     # Database migration SQL files
└── scripts/                 # Utility scripts (seed, verify-tables, etc.)
```

## Key Architectural Patterns

### 1. Multi-Tenancy (Organizations)

El sistema es **multi-tenant**. Cada cliente es una `organization` que puede tener una o más `agencies`. Los usuarios pertenecen a una org vía `organization_members`.

- Queries de negocio se scopean por `org_id` → `agency_ids` (helper: `lib/organizations.ts`)
- Tablas con `agency_id` heredan el scope de la org automáticamente
- El admin super-panel (`app/admin/`) tiene acceso cross-org

#### 🔴 REGLA DE ORO MULTI-TENANT — Defense-in-depth, NO confiar en RLS

**Contexto histórico (2026-05-18)**: durante una sesión se descubrió que la
función `user_org_ids()` que sostiene las políticas RLS de Supabase estaba
rota o desactualizada (causa probable: mismatch de casing en `status`,
reescritura manual sin versionar). Resultado: múltiples endpoints user-facing
filtraban data solo "por RLS" y leakeaban data cross-tenant (un tenant veía
pagos/operaciones/reportes de otros). Se cerraron ~50 endpoints agregando
filtro explícito.

**Reglas obligatorias para CUALQUIER endpoint nuevo o modificado**:

1. **TODA query a tablas con datos por tenant DEBE tener `.eq("org_id", user.org_id)` explícito**. NO confiar en que RLS lo haga. Tablas afectadas (no exhaustivo): `payments`, `operations`, `customers`, `operators`, `operator_payments`, `cash_movements`, `ledger_movements`, `financial_accounts`, `alerts`, `commission_records`, `leads`, `invoices`, `purchase_invoices`, `recurring_payments`, `recurring_payment_categories`, `tax_withholdings`, `financial_settings`, `organization_settings`.

2. **Guard obligatorio al inicio de cada handler user-facing**:
   ```ts
   const { user } = await getCurrentUser()
   if (!user.org_id) {
     return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
   }
   ```

3. **PATCH/DELETE/GET por id**: agregar `.eq("org_id", user.org_id)` al SELECT inicial del recurso. Si no pertenece al org del user, devolver 404 enmascarado (NO 403 "no tenés acceso" — eso confirma que existe).

4. **Body de PATCH**: nunca aceptar `org_id` ni `agency_id` del body sin validar. Hacer `delete body.org_id` antes del UPDATE, o validar contra `user.org_id` y rechazar si no matchea.

5. **Tabla legacy con `agency_id` (no `org_id` directo)**: usar helper `getOrgAgencyIds(orgId)` de `lib/organizations.ts` para pre-fetchar las agency_ids del org del user y filtrar con `.in("agency_id", agencyIds)`.

6. **NUNCA usar `createAdminClient()` en endpoints user-facing**. El admin client usa SERVICE ROLE KEY que bypassea RLS. Reservado para:
   - `/api/cron/*` (procesos automáticos)
   - `/api/admin/*` (platform admin panel con guard `isPlatformAdmin`)
   - `/api/webhooks/*` (webhooks externos sin user logueado)
   - `/api/billing/mp-webhook` (webhook MP)
   - Helpers internos de libs (con comment justificando el bypass)

7. **Endpoints `/api/admin/*` cross-org**: validar siempre con `isPlatformAdmin(supabase, user.id)` ANTES de cualquier query.

8. **Comentarios "RLS scopea automáticamente" o similar**: tratarlos como bug. Reemplazar por filtro explícito + comentario "Cross-tenant fix: filtro explícito, no confiar en RLS".

**Patrón canónico**:
```ts
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"

export async function GET(req: Request) {
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
  }
  const supabase = await createServerClient()
  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("org_id", user.org_id)  // ← OBLIGATORIO
  return NextResponse.json({ data })
}
```

**En code review**: rechazar PRs que tocan endpoints user-facing sin este patrón.

### 2. Billing / SaaS (MercadoPago)

**Planes** (fuente de verdad: `lib/billing/plans.ts`):
- `PRO` — $119.000 ARS/mes, 7 días trial gratuito, cobro por MP preapproval
- `ENTERPRISE` — a consultar (contact sales)
- `STARTER` — legacy, solo backward compat, no se ofrece

**Flujo de suscripción**:
1. Checkout → `POST /api/billing/checkout` → crea preapproval en MP → redirect
2. MP webhook → `POST /api/billing/mp-webhook` → actualiza estado en `organizations`
3. Guard server-side → `lib/billing/guard.ts` → redirige a `/paywall` si no activo

**Estados de suscripción** (`BillingSubscriptionStatus`): `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELLED`, `SUSPENDED`, `PENDING_PAYMENT`

**Defense-in-depth**:
- Capa A: middleware (puede bypassearse, CVE-2025-29927)
- Capa B: `assertSubscriptionActive()` en layouts/API routes (capa que realmente protege)
- Capa C: RLS en Supabase

### 3. Role-Based Access Control (RBAC)

**Roles** (definidos en `lib/permissions.ts`):
- `SUPER_ADMIN` - Full access to everything
- `ADMIN` - Operational and financial access
- `CONTABLE` - Accounting-focused access
- `SELLER` - Limited to own leads/operations/commissions
- `VIEWER` - Read-only access

**Permission Checks**:
- Use `canPerformAction(role, module, permission)` for granular checks
- Use `shouldShowInSidebar(role, moduleId)` for UI visibility
- API routes MUST call `getCurrentUser()` to verify authentication

### 4. Supabase Client Usage

**Server Components & API Routes**:
```typescript
import { createServerClient } from '@/lib/supabase/server'
const supabase = await createServerClient()
```

**Client Components**:
```typescript
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()
```

**IMPORTANT**: NEVER use service role key on the client. Always use appropriate client based on context.

### 5. Accounting System

The system implements **double-entry bookkeeping** via `ledger_movements` table:

- Every financial transaction creates TWO ledger movements (debit + credit)
- Automatic ledger creation when:
  - Payment marked as PAID → creates ledger_movement
  - Cash movement created → creates ledger_movement
  - Lead deposit received → creates ledger_movement
  - Lead converted to operation → transfers ledger_movements
  - Commission paid → creates ledger_movement

**Multi-currency Support**:
- All amounts stored in original currency + ARS equivalent
- FX gains/losses automatically detected and recorded
- Service: `lib/accounting/fx.ts`

**Key Services**:
- `lib/accounting/ledger.ts` - Core ledger logic
- `lib/accounting/iva.ts` - VAT/IVA calculations
- `lib/accounting/fx.ts` - Foreign exchange handling
- `lib/commissions/calculate.ts` - Commission calculations

### 6. Manychat Integration

**Lead Capture**:
- Manychat (Instagram/WhatsApp flows) → Leads (via webhook `/api/webhooks/manychat`)
- Auth via static API key header
- Automatic field extraction: phone, email, destination, region
- Lead asignado a lista personal del vendedor via `manychat_list_order`

**Configuration**: vía environment variables. Ver `lib/manychat/`.

### 7. Callbell Integration

Mensajería bidireccional WhatsApp/Instagram vía Callbell API. Webhook de entrada en `/api/webhooks/callbell`. Reconciliación diaria vía cron `callbell-reconcile`. Ver `lib/integrations/`.

### 8. Alert System

Automatic generation of alerts for:
- Payment reminders (customer & operator)
- Upcoming trips (48-72h before departure)
- Missing documentation
- Low cash balance
- IVA payments due
- FX losses

Service: `lib/alerts/generate.ts`

## Development Guidelines

### UI Components

**CRITICAL**: ONLY use shadcn/ui components from `components/ui/`. Do NOT create custom UI primitives.

Common components:
- Forms: `Form`, `Input`, `Select`, `Textarea`, `Checkbox`, `RadioGroup`
- Data: `Table`, `Card`, `Badge`, `Separator`
- Overlays: `Dialog`, `Sheet`, `AlertDialog`, `Popover`, `DropdownMenu`
- Navigation: `Tabs`, `Accordion`, `Command` (for search)

To add new shadcn/ui components:
```bash
npx shadcn@latest add [component-name]
```

### TypeScript Types

**Database Types**: Auto-generated from Supabase schema at `lib/supabase/types.ts`

Regenerate types after schema changes:
```bash
npm run db:generate
```

**Type Safety**: Project uses strict TypeScript. NEVER use `any` without strong justification.

### API Route Pattern

Standard API route structure:
```typescript
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { canPerformAction } from '@/lib/permissions'

export async function GET(req: Request) {
  const { user } = await getCurrentUser()

  if (!canPerformAction(user.role, 'module-name', 'read')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createServerClient()

  let query = supabase.from('table_name').select('*')

  if (user.role === 'SELLER') {
    query = query.eq('seller_id', user.id)
  }

  const { data, error } = await query

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ data })
}
```

### Database Queries

**Filtering by Role**:
- `SELLER` role: ALWAYS filter by `seller_id` or `seller_primary_id`
- `ADMIN`/`SUPER_ADMIN`: Can see all data
- Apply filters BEFORE executing query

**Multi-tenant scoping**: usar `getOrgAgencyIds(orgId)` de `lib/organizations.ts` para filtrar por org.

**Pagination**: Use `.range(from, to)` for large datasets

**Joins**: Prefer single query with `.select()` joins over multiple queries

### Testing

Tests located in `__tests__/` directories next to source files.

Existing test coverage:
- `lib/accounting/__tests__/` - Ledger, IVA, FX logic
- `lib/alerts/__tests__/` - Alert generation
- `lib/commissions/__tests__/` - Commission calculation
- `lib/permissions/__tests__/` - Permission system
- `lib/billing/__tests__/` - Billing plans, guard, MP integration, state machine

Run tests before committing changes to accounting/billing/permission logic.

## Important Implementation Notes

### Authentication Bypass in Development

**CURRENT STATE**: Authentication is bypassed when `DISABLE_AUTH=true` in `.env.local`
- Located in: `middleware.ts` and `lib/auth.ts`
- Returns mock SUPER_ADMIN user in development
- **Production**: esta variable NO debe estar seteada en Railway

### File Upload & OCR

Documents uploaded to Supabase Storage bucket: `documents`

OCR Process:
1. Upload document → Supabase Storage
2. Create record in `documents` table
3. Call `/api/documents/parse` with document ID
4. OpenAI Vision extracts data (name, document number, DOB, etc.)
5. Auto-create/update customer record
6. Return parsed data for user confirmation

### Commission Calculation

Triggered when operation reaches `CONFIRMED` or `CLOSED` status:

```
Margin = sale_amount_total - operator_cost
Commission = Margin × commission_percentage
```

Split between `seller_primary` and `seller_secondary` if applicable.

Service: `lib/commissions/calculate.ts`

### AI Copilot

Uses OpenAI function calling with tools defined in `lib/ai/tools.ts`:
- Get sales summary
- Get due payments
- Get seller performance
- Get top destinations
- Get operator balances
- Search customers/operations

Context includes complete database schema for accurate queries.

## Environment Variables

Required in `.env.local`:
```env
# Supabase (REQUERIDO)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# App
NEXT_PUBLIC_APP_URL=https://app.vibook.ai    # Base URL — usada en MP checkout, WhatsApp receipts, invites
CRON_SECRET=your_cron_secret                 # Shared con Railway Cron Services para llamar /api/cron/*
DISABLE_AUTH=true                            # DEVELOPMENT ONLY - NUNCA en producción

# OpenAI (opcional, para OCR y AI Copilot)
OPENAI_API_KEY=your_openai_key

# Emilia / vibook search
EMILIA_API_KEY=your_emilia_api_key           # Required for Emilia travel search (wsk_xxx format)
EMILIA_API_URL=https://api.vibook.ai/search  # Optional, defaults to vibook.ai

# MercadoPago — suscripciones SaaS
MERCADOPAGO_ACCESS_TOKEN=                    # Token producción (cobro real)
MERCADOPAGO_WEBHOOK_SECRET=                  # Firma HMAC-SHA256 del webhook de MP
MERCADOPAGO_ACCESS_TOKEN_SANDBOX=            # Sandbox para E2E testing
MP_USE_SANDBOX=false                         # Si true, usa token sandbox

# Web Push Notifications (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=mailto:your-email@example.com

# Amadeus API — IATA airport/city search (opcional)
AMADEUS_CLIENT_ID=
AMADEUS_CLIENT_SECRET=

# Geoapify — fallback hotel search (opcional)
GEOAPIFY_API_KEY=

# Integraciones / Webhooks
WEBHOOK_SECRET_ENCRYPTION_KEY=              # AES-256-GCM key para integration_webhooks. Generar: openssl rand -hex 32
CALLBELL_API_BASE_URL=https://api.callbell.eu/v1.1
```

Ver `.env.example` para la lista completa (Resend, AFIP, Manychat, etc.).

## Hosting & Deployment

**Producción**: Railway. Dominio: `app.vibook.ai`. El dominio legacy `maxevagestion.com` hace redirect 301 al nuevo.

**Cron jobs**: Railway Cron Services independientes (uno por endpoint), cada uno corre `curl -X POST` contra `/api/cron/<name>` con header `Authorization: Bearer $CRON_SECRET`. Todos los endpoints `/api/cron/*` son **POST con Bearer auth**.

Endpoints cron existentes (ver `app/api/cron/`):
- `recurring-payments` — cobros recurrentes
- `alerts` — generación de alertas
- `payment-reminders` — recordatorios de pago
- `notifications` — notificaciones push
- `whatsapp` — mensajes WhatsApp automáticos
- `task-reminders` — recordatorios de tareas
- `exchange-rates` — actualización de tipos de cambio
- `billing-reconcile` — reconciliación de suscripciones MP
- `callbell-reconcile` — reconciliación Callbell
- `trial-reminders` — recordatorios de fin de trial
- `apply-pricing-changes` — aplicación de cambios de precios
- `classify-quotation-pdfs` — clasificación de PDFs de cotización

## Database Schema Notes

### Core Tables
- `organizations` - Tenants del SaaS (una por agencia cliente)
- `organization_members` - Usuarios por organización
- `users` - System users with roles
- `agencies` - Agencias dentro de una org (Rosario, Madero, etc.)
- `leads` - Sales leads from Manychat or manual entry
- `operations` - Confirmed travel operations
- `customers` - Client information
- `operators` - Travel operators/suppliers
- `payments` - Customer and operator payments
- `cash_movements` - Cash flow transactions
- `ledger_movements` - Double-entry accounting ledger
- `financial_accounts` - Chart of accounts
- `commission_records` - Commission tracking
- `commission_rules` - Commission calculation rules
- `documents` - Uploaded documents with OCR data
- `alerts` - Automated system alerts
- `iva_sales` / `iva_purchases` - VAT tracking
- `integration_webhooks` - Webhook configs de integraciones (Callbell, etc.)

### Key Relationships
- Organizations → Agencies (one-to-many)
- Agencies → Users (many-to-many via `organization_members`)
- Operations → Customers (many-to-many via `operation_customers`)
- Operations → Operators (many-to-one)
- Operations → Payments (one-to-many)
- Payments → Ledger Movements (one-to-many)
- Operations → Commission Records (one-to-many)

## Known Issues & TODOs

See `ROADMAP.md` for complete list. Key items:

**High Priority**:
- Add rate limiting to API routes
- Improve test coverage (currently ~20%, target 60%+)
- Add audit logs for sensitive operations

**Medium Priority**:
- Implement global search (Cmd+K)
- Add dark mode support
- Optimize database queries with additional indexes
- Add export functionality for leads/operations

**Low Priority**:
- Operation timeline view
- Persistent AI Copilot conversation history
- Advanced accounting reports (Balance Sheet, P&L)

## Debugging Tips

**Common Issues**:

1. **"Missing Supabase environment variables"**
   - Check `.env.local` exists and has correct variables
   - Restart dev server after changes

2. **Permission errors (403)**
   - Verify user role in database
   - Check permission matrix in `lib/permissions.ts`
   - Ensure API route calls `getCurrentUser()`

3. **Manychat lead capture not working**
   - Verify Manychat external request action points to `/api/webhooks/manychat`
   - Check Railway logs filtering `manychat`
   - Verify `MANYCHAT_API_KEY` env var is set correctly

4. **Ledger movements not creating**
   - Check if payment status is `PAID`
   - Verify `lib/accounting/ledger.ts` functions are called
   - Check for duplicate prevention logic

5. **Billing / paywall redirect loop**
   - Verificar estado de suscripción en tabla `organizations`
   - Revisar logs del webhook MP en `/api/billing/mp-webhook`
   - Usar `/api/billing/mp-webhook/diagnostics` para inspeccionar estado MP

**Logging**: Check console for errors. API routes log to server console, not browser.

## Additional Resources

- `README.md` - User-facing documentation
- `CONFIGURACION_SUPABASE.md` - Supabase setup guide
- `GUIA_TESTING.md` - End-to-end testing guide
- `docs/testing-railway-migration.md` - QA checklist post-migración Vercel → Railway
- `ROADMAP.md` - Development roadmap and pending tasks
- `.cursor/ESTADO-COMPLETO-PROYECTO.md` - Detailed project status analysis
