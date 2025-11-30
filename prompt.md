You are a senior full-stack engineer, senior architect, and senior product designer.

Your task is to build an ENTIRE travel-agency management platform from scratch, fully production-grade, using the following stack:

- **Next.js 14+ (App Router) + React + TypeScript**  ✅ MANDATORY

- **shadcn/ui** as the ONLY design system (MANDATORY)

- TailwindCSS

- Supabase (Postgres DB + Auth + Storage)

- OpenAI (GPT-4.1 / GPT-4o) for OCR and AI Copilot

EVERY UI component MUST use **shadcn/ui** from https://ui.shadcn.com — no exceptions.  

If a pattern doesn't exist, compose it from shadcn primitives (Card, Button, Form, Dialog, Sheet, Table, Tabs, Select, Badge, ScrollArea, etc.).

=====================================================================
🧩 STEP 0 — PROJECT SETUP (NEXT.JS + TAILWIND + SHADCN)
=====================================================================

Assume we are starting from scratch.

### 0.1 Create the Next.js project (App Router, TS, Tailwind)

Use (conceptually):

- `npx create-next-app@latest`  

  - Typescript: Yes  

  - ESLint: Yes  

  - Tailwind: Yes  

  - App Router: Yes  

  - src directory: Optional  

  - Import alias: `@/*`

If you can't actually run the CLI, then:
- Generate the equivalent project structure manually.
- Ensure the `app/` directory is used (App Router).
- Ensure `tsconfig.json` is configured with `"jsx": "preserve"` and `"paths": { "@/*": ["./*"] }` (or similar).
- Ensure Tailwind is configured with:

  - `postcss.config.js`

  - `tailwind.config.js`

  - `globals.css` imported in `app/layout.tsx`.

### 0.2 Install and configure shadcn/ui

Conceptually run:

- `pnpm dlx shadcn-ui@latest init`  

  OR  

- `npx shadcn-ui@latest init`  

Configuration for shadcn:

- Use Tailwind.

- Use `app` directory.

- Components path: `@/components/ui`.

If you cannot run CLI, you must:

- Create `components.json` for shadcn with:

  - `"rsc": true`

  - `"tailwind": { "config": "tailwind.config.js", "css": "app/globals.css", "baseColor": "slate", ... }`

- Ensure `tailwind.config.js` has shadcn presets and content paths:

  - `content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"]`

  - `plugins: [require("tailwindcss-animate")]`

- Import base styles from shadcn (font-smoothing, etc.) in `globals.css`.

All UI components MUST be imported from `@/components/ui/...` according to shadcn/ui conventions.

=====================================================================
🏗️ SYSTEM OVERVIEW (HIGH LEVEL)
=====================================================================

You are building a full back-office system for a travel agency with two branches. The platform must include:

1. Authentication + roles (SUPER_ADMIN, ADMIN, SELLER, VIEWER) via Supabase Auth.

2. Trello Sync (mirrors their current CRM board/lists/cards).

3. Sales Pipeline (Kanban + Table) for leads.

4. Operations (trips/reservations).

5. Customers module.

6. Documents upload (Supabase Storage).

7. OCR with AI (DNI/passport / payment proof recognition).

8. Caja & Finanzas (payments, cash movements).

9. Operators module (wholesalers).

10. Commissions (auto-calculated).

11. Alerts (payments due, missing docs, upcoming trips, operator balances).

12. Owner Dashboard (BI metrics).

13. AI Copilot (chat about business metrics, sales, payments).

14. Settings module (Users, Agencies, Trello, Commissions, AI).

Everything must be:

- TypeScript-only (no any).

- Strongly typed with types inferred from Supabase.

- Modular and clean (separate UI, domain logic, data access).

- Production-quality.

=====================================================================
🔐 AUTHENTICATION & ROLES (SUPABASE)
=====================================================================

Use Supabase Auth with email/password.

Roles (store in `users.role`):
- SUPER_ADMIN
- ADMIN
- SELLER
- VIEWER

Features:

- Login page `/login` (use shadcn `Card`, `Form`, `Input`, `Button`, `Alert`).

- Authentication via Supabase (credentials).

- Protected routes:

  - Use a layout or middleware to check the session.

- Role-based access:

  - SUPER_ADMIN: full access.

  - ADMIN: all operational and financial.

  - SELLER: only own leads/operations/commissions.

  - VIEWER: read-only for most data.

SUPER_ADMIN can invite new users:

- Page in `/settings/users`.

- Form:

  - Name, email, role, agencies.

- Generate invite link (stub logic or token) → later used to set password.

=====================================================================
🧱 DATABASE SCHEMA (SUPABASE)
=====================================================================

Create these tables in Supabase (Postgres):

### users

- id (uuid, pk)
- auth_id (uuid, Supabase auth user id)
- name (text)
- email (text, unique)
- role (text enum: SUPER_ADMIN, ADMIN, SELLER, VIEWER)
- is_active (boolean)
- created_at (timestamp)
- updated_at (timestamp)

### agencies

- id (uuid, pk)
- name (text)
- city (text)
- timezone (text)
- created_at
- updated_at

### user_agencies

- id (uuid, pk)
- user_id (uuid fk -> users.id)
- agency_id (uuid fk -> agencies.id)

### leads

- id (uuid, pk)
- agency_id (uuid fk -> agencies.id)
- source (text: "Instagram", "WhatsApp", "Meta Ads", "Other")
- external_id (text, nullable)  // Trello card id
- trello_url (text, nullable)
- status (text enum: NEW, IN_PROGRESS, QUOTED, WON, LOST)
- region (text enum: ARGENTINA, CARIBE, BRASIL, EUROPA, EEUU, OTROS, CRUCEROS)
- destination (text)
- contact_name (text)
- contact_phone (text)
- contact_email (text, nullable)
- contact_instagram (text, nullable)
- assigned_seller_id (uuid fk -> users.id, nullable)
- notes (text, nullable)
- created_at
- updated_at

### customers

- id (uuid, pk)
- first_name (text)
- last_name (text)
- phone (text)
- email (text)
- instagram_handle (text, nullable)
- document_type (text, nullable)
- document_number (text, nullable)
- date_of_birth (date, nullable)
- nationality (text, nullable)
- created_at
- updated_at

### operations

- id (uuid, pk)
- agency_id (uuid fk -> agencies.id)
- lead_id (uuid fk -> leads.id, nullable)
- seller_id (uuid fk -> users.id)
- operator_id (uuid fk -> operators.id, nullable)
- type (text enum: FLIGHT, HOTEL, PACKAGE, CRUISE, TRANSFER, MIXED)
- origin (text, nullable)
- destination (text)
- departure_date (date)
- return_date (date, nullable)
- adults (int)
- children (int)
- infants (int)
- status (text enum: PRE_RESERVATION, RESERVED, CONFIRMED, CANCELLED, TRAVELLED, CLOSED)
- sale_amount_total (numeric)
- operator_cost (numeric)
- currency (text, e.g. ARS, USD)
- margin_amount (numeric)
- margin_percentage (numeric)
- created_at
- updated_at

### operation_customers

- id (uuid, pk)
- operation_id (uuid fk -> operations.id)
- customer_id (uuid fk -> customers.id)
- role (text enum: MAIN, COMPANION)

### payments

- id (uuid, pk)
- operation_id (uuid fk -> operations.id)
- payer_type (text enum: CUSTOMER, OPERATOR)
- direction (text enum: INCOME, EXPENSE)
- method (text: CASH, CREDIT_CARD, BANK_TRANSFER, MERCADOPAGO, OTHER)
- amount (numeric)
- currency (text)
- date_due (date)
- date_paid (date, nullable)
- status (text enum: PENDING, PAID, OVERDUE)
- reference (text, nullable)
- created_at
- updated_at

### cash_movements

- id (uuid, pk)
- operation_id (uuid fk -> operations.id, nullable)
- user_id (uuid fk -> users.id)
- type (text enum: INCOME, EXPENSE)
- category (text: SALE, COMMISSION, REFUND, OPERATOR_PAYMENT, MISC)
- amount (numeric)
- currency (text)
- movement_date (timestamp)
- notes (text, nullable)
- created_at

### operators

- id (uuid, pk)
- name (text)
- contact_name (text, nullable)
- contact_email (text, nullable)
- contact_phone (text, nullable)
- credit_limit (numeric, nullable)
- created_at
- updated_at

### commission_rules

- id (uuid, pk)
- type (text enum: SELLER, AGENCY)
- basis (text enum: FIXED_PERCENTAGE, FIXED_AMOUNT)
- value (numeric)
- destination_region (text enum or text, nullable)
- agency_id (uuid fk -> agencies.id, nullable)
- valid_from (date)
- valid_to (date, nullable)
- created_at
- updated_at

### commission_records

- id (uuid, pk)
- operation_id (uuid fk -> operations.id)
- seller_id (uuid fk -> users.id)
- agency_id (uuid fk -> agencies.id, nullable)
- amount (numeric)
- status (text enum: PENDING, PAID)
- date_calculated (date)
- date_paid (date, nullable)
- created_at
- updated_at

### documents

- id (uuid, pk)
- operation_id (uuid fk -> operations.id, nullable)
- customer_id (uuid fk -> customers.id, nullable)
- type (text enum: PASSPORT, DNI, VOUCHER, INVOICE, PAYMENT_PROOF, OTHER)
- file_url (text)
- uploaded_by_user_id (uuid fk -> users.id)
- uploaded_at (timestamp)

### alerts

- id (uuid, pk)
- operation_id (uuid fk -> operations.id, nullable)
- customer_id (uuid fk -> customers.id, nullable)
- user_id (uuid fk -> users.id, nullable)
- type (text enum: PAYMENT_DUE, OPERATOR_DUE, UPCOMING_TRIP, MISSING_DOC, GENERIC)
- description (text)
- date_due (timestamp)
- status (text enum: PENDING, DONE, IGNORED)
- created_at
- updated_at

### settings_trello

- id (uuid, pk)
- agency_id (uuid fk -> agencies.id)
- trello_api_key (text)
- trello_token (text)
- board_id (text)
- list_status_mapping (jsonb)
- list_region_mapping (jsonb)
- created_at
- updated_at

=====================================================================
🎨 GLOBAL LAYOUT & shadcn/ui USAGE
=====================================================================

- Use App Router (`app/` directory).

- Implement a **main layout** with:

  - Left sidebar (navigation).

  - Top navbar (agency selector, user menu, AI Copilot button).

- All UI built with shadcn/ui:

  - Sidebar: use `Sheet`, `ScrollArea`, `Button`, `Link`.

  - Navbar: `Button`, `Avatar`, `DropdownMenu`.

  - Content pages: `Card`, `Tabs`, `Table`, `Form`, `Input`, `Select`, `Badge`, `Alert`.

Sidebar sections:

- Dashboard
- Sales
  - Leads
  - Operations
- Customers
- Operators
- Cash / Payments
- Reports
- Settings

=====================================================================
📦 TRELLO SYNC MODULE
=====================================================================

API routes:

- POST `/api/trello/test-connection`
- POST `/api/trello/sync`
- GET `/api/trello/lists`

Logic:

- Load `settings_trello` by `agency_id`.

- If no credentials → use mockTrello cards.

- If credentials → call Trello API:

  - Get lists

  - Get cards of board: `name, desc, idList, idMembers, url, labels, dateLastActivity`

Map each card to a `lead`:

- `external_id = card.id`
- `trello_url = card.url`
- `status = list_status_mapping[card.idList]`
- `region = list_region_mapping[card.idList]`
- `contact_name` from card.name (first part).
- `destination` from card.name or label.
- `notes = card.desc`
- `assigned_seller_id` if idMembers is mapped.
- `updated_at = card.dateLastActivity`.

Upsert leads by `external_id`.

UI `/settings/trello`:

- Tab "Credentials": shadcn Form for API key/token/board id.

- Tab "Status Mapping": use `/api/trello/lists` and a table with Select for NEW/IN_PROGRESS/QUOTED/WON/LOST.

- Tab "Region Mapping": same but enum regions.

- Tab "Sync": button "Run sync now", show last sync summary.

All UI built ONLY with shadcn/ui components.

=====================================================================
📊 SALES MODULE (LEADS + OPERATIONS)
=====================================================================

### Leads Kanban `/sales/leads`

- Use shadcn `Tabs` to switch between Kanban and Table view.

- Kanban:

  - Columns: NEW, IN_PROGRESS, QUOTED, WON, LOST.

  - Each column uses `ScrollArea` and `Card` for each lead.

  - Card shows: contact, destination, region badge, seller avatar, Trello icon.

- Drag-and-drop status changes (optional but recommended).

- On drop, update `leads.status`.

### Leads Table

- shadcn `Table`.

- Filters: seller, region, status, date created.

- Actions:

  - "Convert to operation" → opens shadcn `Dialog`.

### Convert Lead → Operation

Dialog fields:

- Agency
- Seller
- Type (FLIGHT/HOTEL/PACKAGE/etc.)
- Origin/destination
- Dates
- Pax counts
- sale_amount_total
- operator_cost
- currency

On submit:

- Create `operations` row.

- Link `lead_id`.

- Auto-generate `payments`:

  - At least one customer INCOME PENDING.

  - One operator EXPENSE PENDING.

- Auto-generate `alerts` for payment due and upcoming trip.

### Operations `/operations`

- Table with:

  - Operation id, destination, dates, seller, status, sale amount, margin, operator.

- Filters: status, seller, agency, date range.

Operation detail:

- Basic info (destination, dates, status).

- Customers (table).

- Documents (list + upload).

- Payments (list with statuses).

- Alerts timeline.

=====================================================================
🧍 CUSTOMERS MODULE
=====================================================================

`/customers`:

- Table:

  - Name
  - Phone
  - Email
  - Number of trips
  - Total spent

- Filters and search.

Customer detail:

- Personal info.

- Operations list.

- Payments history.

- Documents (from `documents` table).

=====================================================================
📄 DOCUMENTS + OCR (AI VISION)
=====================================================================

Goal: User can take/upload a photo of a DNI/passport/payment proof and the system reads it and fills data automatically.

### Upload UI

On operation or customer detail page:

- Button "Upload document".

- Use shadcn `Dialog` with:

  - File input (`<input type="file">` wrapped in shadcn `Form`).

  - Document type select (PASSPORT, DNI, VOUCHER, etc.).

  - Submit button.

On submit:

- Upload file to Supabase Storage.

- Create `documents` row with file_url.

### OCR Logic (OpenAI Vision)

Backend API route: `/api/documents/parse`

- Input: document id.

- Retrieve `file_url` from Supabase Storage.

- Call OpenAI Vision with the image.

- Extract fields:

  - first_name
  - last_name
  - document_type
  - document_number
  - date_of_birth
  - expiration_date
  - nationality

- Update `customers` record accordingly.

- If document is DNI/PASSPORT:

  - If customer doesn't exist → create.

  - If exists → update.

- Generate alerts if:

  - expiration_date < today → MISSING_DOC or expired doc type.

UI:

- After parsing, show result in a shadcn `Alert` or table:

  - "We detected: Name X, Document Y, etc."

- Allow the user to confirm or override (future improvement).

=====================================================================
💰 CAJA & FINANZAS
=====================================================================

`/cash` main page:

- KPIs: total income, total expenses, net cash, pending customer payments, pending operator payments.

- Filters: date range, agency, currency.

### Payments list `/cash/payments`

- Table of `payments`.

- Columns: due date, paid date, type, direction, amount, status, method, operation id, customer/operator.

- Action:

  - "Mark as paid" → shadcn Dialog to confirm date & reference.

  - On confirm:

    - Set date_paid.

    - Set status = PAID.

    - Insert `cash_movements` row (type INCOME/EXPENSE).

### Cash movements `/cash/movements`

- Table:

  - movement_date, type, category, amount, currency, operation, user, notes.

- Export CSV endpoint.

### Automatic payment plan

On new operation create:

- Auto-generate at least:

  - 1 PENDING INCOME payment for customer.

  - 1 PENDING EXPENSE payment for operator.

- Basic rule: due dates around departure_date (e.g., customer payment 15 days before, operator payment 7 days before).

=====================================================================
🤝 OPERATORS & COMMISSIONS
=====================================================================

`/operators`:

- Table:

  - Operator name
  - Number of operations
  - Total operator_cost
  - Total paid (sum of EXPENSE payments PAID)
  - Balance (operator_cost - paid)
  - Next due date (closest PENDING operator payment)

Detail:

- Operations list.

- Payment breakdown.

- Alerts related to operator.

### Commissions

Commission logic:

- Margin = sale_amount_total - operator_cost.

- Seller commission = commission_rules of type SELLER with basis FIXED_PERCENTAGE applied to margin.

- Agency margin = margin (or extended later).

Implement a service:

- For each CONFIRMED + fully PAID operation:

  - Create `commission_records` for seller.

`/my/commissions` for sellers:

- Table of operations and commission amount.

- Summaries by month.

- Status PENDING/PAID.

=====================================================================
⚠️ ALERTS
=====================================================================

Generate alerts for:

- Payment due (customer and operator).

- Overdue payments.

- Upcoming trips (48–72h before departure_date).

- Missing required documents (like passport for international trips).

`/alerts`:

- List all alerts (role-based filtering).

- Filter: type, status, date, agency.

- Action: mark as DONE or IGNORED.

=====================================================================
📊 OWNER DASHBOARD (SUPER_ADMIN)
=====================================================================

`/dashboard` for SUPER_ADMIN:

- Filters: date range, agency, seller.

- KPIs:

  - Total sales.

  - Total operations.

  - Total margin.

  - Average margin %.

  - Pending customer payments.

  - Pending operator payments.

- Charts:

  - Sales by seller (bar).

  - Sales by destination (bar/pie).

  - Cash flow over time (line).

  - Top 5 destinations.

Use simple charting library or minimal custom charts inside shadcn `Card`.

=====================================================================
🤖 AI COPILOT (CHAT WITH BUSINESS)
=====================================================================

Add an **AI Copilot** button in navbar:

- Clicking opens a shadcn `Sheet` right-side panel.

- Inside:

  - Scrollable chat history.

  - shadcn `Textarea` or `Input` for new prompt.

  - "Send" Button.

Backend route: `/api/ai`.

AI must answer questions like:

- "How much did we sell this week?"

- "Which payments are due today?"

- "How much did seller X sell this month?"

- "Which operators have overdue balances?"

- "What destination is growing vs last month?"

Implementation:

- Step 1: LLM chooses tool(s) to call, from:

  - getSalesSummary({ from, to, agencyId? })

  - getDuePayments({ date, type? })

  - getSellerPerformance({ sellerId, from, to })

  - getTopDestinations({ from, to, limit? })

  - getOperatorBalances({ onlyOverdue? })

- Step 2: Backend executes those functions with Supabase queries.

- Step 3: Call LLM again to format a natural-language answer with the numeric results.

Permissions:

- SELLER → only data for their own operations.

- ADMIN and SUPER_ADMIN → global data.

Include in the response:

- Optional links or buttons ("View in payments table") that navigate to filtered pages.

=====================================================================
⚙️ SETTINGS MODULE
=====================================================================

`/settings` using shadcn `Tabs`:

- Users:

  - List users, roles, status.

  - Invite user.

  - Change roles (no downgrading SUPER_ADMIN).

  - Activate/deactivate users.

- Agencies:

  - Manage `agencies` (Rosario, Madero).

  - Name, city, timezone.

- Trello:

  - Credentials form.

  - Status mapping.

  - Region mapping.

  - "Test connection".

  - "Run sync".

  - Show last sync info.

- Commissions:

  - Manage `commission_rules`.

  - For v1: single default rule (seller gets X% of margin).

- AI:

  - Toggle AI Copilot on/off.

  - Choose which roles can use AI.

=====================================================================
🌱 SEED DATA
=====================================================================

Create a seed script or migration with initial data:

- 1 SUPER_ADMIN user (Maxi).

- 2 agencies: Rosario, Madero.

- 4 sellers.

- 3 operators.

- ~20 leads across statuses/regions.

- ~10 operations with mixed statuses.

- Some payments (PENDING, PAID, OVERDUE).

- A few documents.

- Basic commission rule (e.g., seller gets 20% of margin).

=====================================================================
🧪 QUALITY / ARCHITECTURE
=====================================================================

- Use a clean folder structure:

  - `/app/(auth)/login`

  - `/app/(dashboard)/dashboard`

  - `/app/sales`, `/app/operations`, `/app/customers`, `/app/operators`, `/app/cash`, `/app/reports`, `/app/settings`

  - `/components/ui` for shadcn components

  - `/components` for higher-level components

  - `/lib` for domain logic (trello sync, AI tools, commission calc, queries).

- No `any`.

- Use Supabase generated types for DB.

- No mixing UI with data access: pages call services, services call Supabase.

- Always use shadcn/ui components (NO other design system).

=====================================================================
🎯 FINAL GOAL
=====================================================================

Deliver a **full, production-grade travel-agency management platform**, built with:

- Next.js (App Router) + TypeScript

- shadcn/ui for ALL UI

- Supabase for DB/Auth/Storage

- Trello Sync

- OCR + AI

- Caja + Operadores + Comisiones

- Owner Dashboard

- AI Copilot

All code must be clean, modular, and ready to be extended.

