# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MAXEVA GESTION** is a comprehensive travel agency management system (ERP) built with Next.js 14+ App Router, TypeScript, Supabase (PostgreSQL), and shadcn/ui. The system manages the complete business flow: leads from Trello → operations → payments → accounting → commissions.

**Status**: ~98% complete, production-ready with some improvements pending.

## Development Commands

```bash
# Development
npm run dev              # Start dev server on port 3044
npm start               # Start production server on port 3005

# Build
npm run build           # Build for production
npm run lint            # Run ESLint

# Testing
npm run test            # Run Jest tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage report

# Database
npm run db:generate     # Generate TypeScript types from Supabase schema
npm run db:seed         # Seed database with initial data
npm run db:seed:mock    # Seed database with mock data for testing
npm run db:check        # Verify tables exist in database
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
  - Trello API (bidirectional sync for sales pipeline)

### Project Structure

```
maxevagestion/
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
│   │   ├── my/              # Seller-specific views (commissions, balance)
│   │   └── settings/        # System configuration
│   ├── api/                 # Next.js API routes
│   └── layout.tsx           # Root layout
├── components/
│   ├── ui/                  # shadcn/ui components (DO NOT modify, regenerate if needed)
│   ├── dashboard/           # Dashboard-specific components
│   ├── sales/               # Sales and leads components
│   ├── cash/                # Cash and payment components
│   └── settings/            # Settings components
├── lib/
│   ├── accounting/          # Accounting logic (ledger, IVA, FX, commissions)
│   ├── ai/                  # AI Copilot tools and context
│   ├── alerts/              # Alert generation logic
│   ├── commissions/         # Commission calculation
│   ├── permissions.ts       # Role-based permission system
│   ├── auth.ts              # Authentication utilities
│   ├── supabase/            # Supabase clients (client.ts, server.ts, types.ts)
│   └── trello/              # Trello integration
├── supabase/migrations/     # Database migration SQL files
└── scripts/                 # Utility scripts (seed, verify-tables, etc.)
```

## Key Architectural Patterns

### 1. Role-Based Access Control (RBAC)

**Roles** (defined in `lib/permissions.ts`):
- `SUPER_ADMIN` - Full access to everything
- `ADMIN` - Operational and financial access
- `CONTABLE` - Accounting-focused access
- `SELLER` - Limited to own leads/operations/commissions
- `VIEWER` - Read-only access

**Permission Checks**:
- Use `canPerformAction(role, module, permission)` for granular checks
- Use `shouldShowInSidebar(role, moduleId)` for UI visibility
- API routes MUST call `getCurrentUser()` to verify authentication

### 2. Supabase Client Usage

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

### 3. Accounting System

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

### 4. Trello Integration

**Bidirectional Sync**:
- Trello cards → Leads (via webhooks in real-time)
- Leads → Trello cards (when creating/updating leads)
- Automatic field extraction: phone, email, destination, seller assignment
- Webhooks handled at `/api/trello/webhook` (NO authentication required)

**Configuration**: Settings → Trello tab

### 5. Alert System

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

  // Query logic with role-based filtering
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

**Pagination**: Use `.range(from, to)` for large datasets

**Joins**: Prefer single query with `.select()` joins over multiple queries

### Testing

Tests located in `__tests__/` directories next to source files.

Existing test coverage:
- `lib/accounting/__tests__/` - Ledger, IVA, FX logic
- `lib/alerts/__tests__/` - Alert generation
- `lib/commissions/__tests__/` - Commission calculation
- `lib/permissions/__tests__/` - Permission system

Run tests before committing changes to accounting/permission logic.

## Important Implementation Notes

### Authentication Bypass in Development

**CURRENT STATE**: Authentication is bypassed when `DISABLE_AUTH=true` in `.env.local`
- Located in: `middleware.ts` and `lib/auth.ts`
- Returns mock SUPER_ADMIN user in development
- **TODO**: REMOVE before production deployment

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
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key  # Optional, for OCR and AI Copilot
EMILIA_API_KEY=your_emilia_api_key           # Required for Emilia/Vibook travel search (wsk_xxx format)
EMILIA_API_URL=https://api.vibook.ai/search  # Optional, defaults to vibook.ai
DISABLE_AUTH=true                # DEVELOPMENT ONLY - Remove for production
```

## Database Schema Notes

### Core Tables
- `users` - System users with roles
- `agencies` - Multiple agencies (Rosario, Madero, etc.)
- `leads` - Sales leads from Trello or manual entry
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
- `settings_trello` - Trello integration configuration

### Key Relationships
- Operations → Customers (many-to-many via `operation_customers`)
- Operations → Operators (many-to-one)
- Operations → Payments (one-to-many)
- Payments → Ledger Movements (one-to-many)
- Operations → Commission Records (one-to-many)

## Known Issues & TODOs

See `ROADMAP.md` for complete list. Key items:

**High Priority**:
- Remove authentication bypass before production
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

3. **Trello sync not working**
   - Verify webhook is active in Trello
   - Check `/api/trello/webhook` logs
   - Verify Trello settings in Settings → Trello

4. **Ledger movements not creating**
   - Check if payment status is `PAID`
   - Verify `lib/accounting/ledger.ts` functions are called
   - Check for duplicate prevention logic

**Logging**: Check console for errors. API routes log to server console, not browser.

## Additional Resources

- `README.md` - User-facing documentation
- `CONFIGURACION_SUPABASE.md` - Supabase setup guide
- `GUIA_TESTING.md` - End-to-end testing guide
- `ROADMAP.md` - Development roadmap and pending tasks
- `.cursor/ESTADO-COMPLETO-PROYECTO.md` - Detailed project status analysis
