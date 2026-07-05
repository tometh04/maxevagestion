# MAXEVA GESTION - Documentacion Tecnica Completa

## 1. Resumen Ejecutivo

**Producto**: MAXEVA GESTION - ERP para agencias de viajes
**Estado**: Produccion activa
**URL**: https://www.maxevagestion.com
**Repositorio**: github.com/tometh04/maxevagestion

### Stack Tecnologico
| Capa | Tecnologia |
|------|-----------|
| Framework | Next.js 15.2 (App Router) |
| Lenguaje | TypeScript 5 (strict) |
| Frontend | React 18.2, TailwindCSS, shadcn/ui (Radix UI) |
| Base de datos | Supabase (PostgreSQL) con RLS |
| Autenticacion | Supabase Auth (JWT) |
| Hosting | Vercel (serverless) |
| Storage | Supabase Storage (S3-compatible) |
| AI/OCR | OpenAI GPT-4o Vision |
| Graficos | Recharts 2.15 |
| Formularios | react-hook-form + Zod |
| Tablas | @tanstack/react-table 8.21 |

---

## 2. Arquitectura General

### Estructura del Proyecto
```
erplozada/
├── app/
│   ├── (auth)/                    # Login, reset password (publico)
│   ├── (dashboard)/               # Rutas protegidas con sidebar
│   │   ├── dashboard/             # KPIs principales
│   │   ├── sales/                 # CRM leads, Kanban
│   │   ├── operations/            # Operaciones de viaje (CORE)
│   │   ├── customers/             # Gestion de clientes
│   │   ├── operators/             # Proveedores/operadores
│   │   ├── cash/                  # Movimientos de caja
│   │   ├── accounting/            # Contabilidad, IVA, libro mayor
│   │   ├── commissions/           # Comisiones de vendedores
│   │   ├── reports/               # Reportes y analytics
│   │   ├── messages/              # WhatsApp y notificaciones
│   │   ├── tasks/                 # Tareas internas
│   │   ├── calendar/              # Calendario de viajes
│   │   ├── expenses/              # Gastos no turisticos
│   │   ├── emilia/                # Buscador de viajes AI
│   │   ├── settings/              # Configuracion (AFIP, Trello, usuarios)
│   │   └── tools/                 # Herramientas (Wha Control, Cerebro)
│   ├── api/                       # 200+ API routes
│   ├── cotizacion/                # Paginas publicas de cotizacion (token)
│   └── layout.tsx                 # Root layout
├── components/                    # 260+ componentes React
│   ├── ui/                        # shadcn/ui primitivos (NO modificar)
│   ├── operations/                # Operaciones
│   ├── accounting/                # Contabilidad
│   ├── sales/                     # CRM
│   ├── tools/                     # Wha Control, Cerebro
│   └── [modulo]/                  # Componentes por feature
├── lib/                           # Logica de negocio
│   ├── auth.ts                    # Autenticacion
│   ├── permissions.ts             # RBAC
│   ├── accounting/                # Ledger, IVA, FX
│   ├── afip/                      # Facturacion electronica
│   ├── trello/                    # Sync bidireccional
│   ├── whatsapp/                  # Mensajeria
│   ├── emilia/                    # Travel search AI
│   └── supabase/                  # Clientes DB
├── supabase/migrations/           # 130+ migraciones SQL
└── scripts/                       # Seeds, testing, utilidades
```

### Patron de Arquitectura
- **Server Components** para data fetching (async/await directo)
- **Client Components** (`"use client"`) para interactividad
- **API Routes** como backend serverless (Vercel Functions)
- **Supabase** como BaaS (auth + DB + storage + realtime)
- **RLS (Row Level Security)** para aislamiento de datos por agencia

---

## 3. Autenticacion y Autorizacion

### Autenticacion
- **Supabase Auth** con email/password
- **JWT** en cookies HTTP-only via `@supabase/ssr`
- **Middleware** (`middleware.ts`) verifica sesion en todas las rutas protegidas
- **Modo desarrollo**: `DISABLE_AUTH=true` bypasea auth (SOLO dev)

### RBAC - 5 Roles

| Rol | Descripcion | Acceso |
|-----|-------------|--------|
| `SUPER_ADMIN` | Administrador total | Todo el sistema |
| `ADMIN` | Operativo y financiero | Todo menos config del sistema |
| `CONTABLE` | Contador | Contabilidad, IVA, caja, reportes |
| `SELLER` | Vendedor | Solo sus leads/operaciones, comisiones |
| `VIEWER` | Solo lectura | Visualiza todo, no modifica |

### 13 Modulos con Permisos Granulares
Cada modulo tiene 4 permisos: `read`, `write`, `delete`, `export`

```typescript
// Ejemplo: SELLER
{
  leads: { read: true, write: true, delete: false, export: false, ownDataOnly: true },
  operations: { read: true, write: true, delete: false, export: false, ownDataOnly: true },
  accounting: { read: false, write: false, delete: false, export: false },
}
```

### Implementacion
```typescript
// Client-side
canAccessModule(role, 'operations')       // Boolean
hasPermission(role, 'leads', 'write')     // Boolean

// API-side
canPerformAction(user, 'operations', 'write')  // Auto-filtra por rol
```

---

## 4. Modulos del Sistema

### 4.1 OPERACIONES (Core del sistema)
**Proposito**: Ciclo completo de un paquete de viaje
**Tablas**: `operations`, `operation_customers`, `operation_operators`, `operation_services`

**Flujo de estados**: `RESERVED → CONFIRMED → TRAVELLING → TRAVELLED`

**Funcionalidades**:
- Multi-cliente (titular + acompaniantes) con asignacion de pagos por pasajero
- Multi-operador (aerolineas, hoteles) con costos individuales
- Multi-moneda (ARS/USD) con conversion automatica
- Itinerarios con generacion de PDF
- Documentos de pasajeros con OCR
- Comisiones auto-calculadas al confirmar
- Servicios vinculados con pagos individuales
- Facturas de compra (AFIP) vinculables

**Archivos clave**:
- `app/api/operations/route.ts` — CRUD
- `components/operations/operation-detail-client.tsx` — Vista detalle con tabs
- `components/operations/new-operation-dialog.tsx` — Formulario de creacion

### 4.2 CRM / LEADS
**Proposito**: Gestion de consultas de clientes con sincronizacion Trello
**Tablas**: `leads`, `lead_comments`

**Flujo**: `NEW → IN_PROGRESS → QUOTED → WON/LOST`

**Funcionalidades**:
- Tablero Kanban con drag & drop
- Sync bidireccional Trello (webhook real-time)
- Sync ManyChat (webhook con API key)
- Conversion lead → operacion
- Asignacion a vendedores
- Comentarios y seguimiento

**Integraciones**:
- **Trello**: Webhook en `/api/trello/webhook` (sin auth), sync de cards ↔ leads
- **ManyChat**: Webhook en `/api/webhooks/manychat`, auto-crea leads

### 4.3 CLIENTES
**Proposito**: Base de datos centralizada de clientes
**Tablas**: `customers`, `customer_interactions`

**Funcionalidades**:
- OCR de pasaportes y DNI (OpenAI Vision)
- Historial de operaciones y pagos
- Estado de cuenta
- Tracking de documentos con alertas de vencimiento
- Busqueda por CUIL/DNI

### 4.4 CONTABILIDAD (Partida Doble)
**Proposito**: Sistema contable completo con IVA y tipo de cambio
**Tablas**: `ledger_movements`, `financial_accounts`, `iva_sales`, `iva_purchases`, `exchange_rates`

**Sistema de Partida Doble**:
- Cada transaccion genera DOS movimientos (debito + credito)
- Tipos: `INCOME`, `EXPENSE`, `FX_GAIN`, `FX_LOSS`, `COMMISSION`, `OPERATOR_PAYMENT`
- Todo en equivalente ARS (conversion automatica USD)

**Flujo ejemplo**:
1. Cliente paga USD 500 → movimiento INCOME + tracking FX
2. Pago marcado PAID → asiento contable
3. Se paga al operador USD 300 → movimiento EXPENSE
4. Fin de mes → calculo automatico de diferencias de cambio

**IVA**:
- Calculo automatico sobre facturas (21%, 10.5%, 0%)
- Tablas separadas para ventas y compras
- Reportes mensuales
- Soporte para declaracion AFIP

**Cuentas Financieras**:
- Caja (ARS/USD)
- Cuentas bancarias
- Tarjetas de credito
- Cuentas de socios (profit sharing)

**Multi-moneda**:
- Operaciones en ARS y USD
- Conversion con cotizacion BCRA diaria
- Override manual de tipo de cambio
- Deteccion automatica de ganancia/perdida por TC

### 4.5 PAGOS Y CAJA
**Proposito**: Seguimiento de cobros a clientes y pagos a operadores
**Tablas**: `payments`, `cash_movements`, `cash_boxes`, `payment_passenger_allocations`

**Tipos de pago**:
- Ingreso cliente: EFECTIVO, TRANSFERENCIA, MP, USD
- Egreso operador: Pagos a proveedores
- Estados: `PENDING → PAID/OVERDUE`

**Cajas**:
- Multiples registradoras por agencia
- Cierre diario con conciliacion
- Transferencias entre cajas

**Asignacion por pasajero**:
- Para operaciones grupales (2+ clientes)
- Distribucion de pagos entre pasajeros
- Vista de saldo individual por pasajero
- Boton "Dividir partes iguales"

### 4.6 COMISIONES
**Proposito**: Calculo automatico y seguimiento de comisiones
**Tablas**: `commission_records`, `commission_rules`, `seller_objectives`

**Formula**:
```
Comision = (venta_total - costo_operador) × porcentaje_comision
Split: Si hay vendedor secundario, se divide segun commission_split
```

**Triggers**: Se calcula al pasar operacion a CONFIRMED o CLOSED
**Reglas**: Por vendedor, por region, con vigencia temporal

### 4.7 FACTURACION ELECTRONICA (AFIP)
**Proposito**: Emision de facturas electronicas segun normativa argentina
**Libreria**: `@afipsdk/afip.js`
**Tablas**: `invoices`, `invoice_items`

**Funcionalidades**:
- WSFE (Web Service Factura Electronica)
- Generacion y firma digital
- Tipos: Factura A, B, C, Nota de Credito/Debito
- Gestion de puntos de venta
- PDF de facturas
- Automatizacion "mis-comprobantes" (scraping portal AFIP)

**Facturas de Compra**:
- Consulta automatica al portal AFIP via `CreateAutomation('mis-comprobantes')`
- Parseo de campos en espaniol (AFIP devuelve "Fecha de Emision", "Imp. Total", etc.)
- Conversion de montos formato AFIP ("4.687,20") a numeros
- Vista detalle con todos los campos del comprobante
- Pendiente: persistencia en DB y vinculacion a operaciones

### 4.8 COTIZACIONES
**Proposito**: Generar y compartir presupuestos de viaje
**Tablas**: `quotations`, `quotation_items`

- Multi-item (vuelos, hoteles, servicios)
- URL publica via token: `/cotizacion/[token]`
- Vencimiento configurable
- Conversion a operacion

### 4.9 WHATSAPP
**Proposito**: Mensajeria automatica y manual con clientes
**Tablas**: `wa_devices`, `wa_chats`, `wa_messages`, `whatsapp_messages`, `message_templates`

**Dos sistemas**:

1. **Templates automaticos** (`whatsapp_messages`):
   - Templates configurables por trigger (pago recibido, cotizacion enviada, etc.)
   - Cola de mensajes con estado (PENDING, SENT, SKIPPED)
   - Cron job para envio automatico
   - Links wa.me con mensaje pre-armado

2. **Wha Control** (`wa_devices`, `wa_chats`, `wa_messages`):
   - Conector Baileys (servicio externo en Railway: `wha-connector`)
   - Conexion por QR code
   - Inbox con historial de conversaciones
   - Dashboard de metricas:
     - Mensajes enviados/recibidos (excluye grupos por defecto)
     - PDFs enviados (solo mime type application/pdf)
     - Tiempo de respuesta promedio (horario comercial L-V 9-17 ARG)
     - Conversaciones iniciadas, sin responder, nuevas
     - Toggle "Incluir grupos"
   - Filtros por agencia, dispositivo, rango de fechas

### 4.10 EMILIA (Travel Search AI)
**Proposito**: Asistente conversacional de busqueda de viajes
**API**: Vibook (api.vibook.ai)
**Tablas**: `conversations`, `messages`

- Busqueda de vuelos y hoteles via chat
- Contexto multi-turno
- Resultados en formato cards
- Historial de busquedas

### 4.11 ALERTAS
**Proposito**: Notificaciones automaticas de eventos criticos
**Tabla**: `alerts`

**Tipos**: `PAYMENT_DUE`, `OPERATOR_DUE`, `UPCOMING_TRIP`, `MISSING_DOC`, `IVA_DUE`, `LOW_BALANCE`, `TASK_REMINDER`, `PASSPORT_EXPIRY`

Generacion automatica via cron jobs y manual.

### 4.12 TAREAS
**Proposito**: Gestion de tareas internas del equipo
**Tabla**: `tasks`

- Asignacion a usuarios
- Fechas limite con recordatorios
- Prioridades y estados (TODO, IN_PROGRESS, DONE)
- Cron de recordatorios

### 4.13 REPORTES Y ANALYTICS
**Proposito**: Business intelligence

- Dashboard de KPIs (ventas, margen, top vendedores)
- Cash flow por cuenta
- Rentabilidad por operacion/vendedor
- Analisis de margenes
- Estacionalidad

### 4.14 DOCUMENTOS Y OCR
**Proposito**: Almacenamiento y procesamiento de documentos
**Tabla**: `documents`

- Upload a Supabase Storage
- OCR via OpenAI Vision (pasaportes, DNI)
- Extraccion automatica: nombre, numero, fecha nacimiento, vencimiento
- Alertas de documentos por vencer

---

## 5. Esquema de Base de Datos

### Tablas Principales (~70 tablas)

#### Usuarios y Organizacion
| Tabla | Proposito |
|-------|-----------|
| `users` | Usuarios con roles |
| `agencies` | Sucursales (Rosario, Madero, etc.) |
| `user_agencies` | Relacion usuario-agencia (M2M) |
| `organization_members` | Miembros de organizacion |

#### Negocio Core
| Tabla | Proposito |
|-------|-----------|
| `leads` | Consultas de clientes (CRM) |
| `operations` | Operaciones de viaje (tabla principal) |
| `operation_customers` | Clientes de la operacion (M2M) |
| `customers` | Base de clientes |
| `operators` | Proveedores de viaje |
| `operation_operators` | Operadores de la operacion (M2M) |
| `operation_services` | Servicios dentro de la operacion |
| `quotations` | Cotizaciones |
| `quotation_items` | Items de cotizacion |

#### Financiero
| Tabla | Proposito |
|-------|-----------|
| `payments` | Cobros y pagos |
| `payment_passenger_allocations` | Asignacion de pagos a pasajeros |
| `financial_accounts` | Plan de cuentas |
| `ledger_movements` | Libro mayor (partida doble) |
| `cash_movements` | Movimientos de caja |
| `cash_boxes` | Cajas registradoras |
| `iva_sales` | IVA ventas |
| `iva_purchases` | IVA compras |
| `exchange_rates` | Tipos de cambio diarios |
| `monthly_exchange_rates` | TC mensuales |
| `recurring_payments` | Pagos recurrentes |
| `invoices` | Facturas AFIP |

#### Comisiones
| Tabla | Proposito |
|-------|-----------|
| `commission_records` | Registros de comision |
| `commission_rules` | Reglas por vendedor/region |
| `seller_objectives` | Objetivos de venta |

#### Comunicaciones
| Tabla | Proposito |
|-------|-----------|
| `wa_devices` | Dispositivos WhatsApp conectados |
| `wa_chats` | Conversaciones WhatsApp |
| `wa_messages` | Mensajes individuales |
| `whatsapp_messages` | Cola de mensajes automaticos |
| `message_templates` | Templates de mensajes |

#### Documentos y Compliance
| Tabla | Proposito |
|-------|-----------|
| `documents` | Documentos (pasaportes, DNI, vouchers) |
| `alerts` | Alertas del sistema |
| `audit_logs` | Log de auditoria |

#### Otros
| Tabla | Proposito |
|-------|-----------|
| `tasks` | Tareas internas |
| `notes` | Notas con adjuntos |
| `destinations` | Destinos maestros |
| `destination_requirements` | Requisitos visa/pasaporte |
| `settings_trello` | Config Trello por agencia |
| `push_subscriptions` | Suscripciones push web |

---

## 6. API Routes (Catalogo Completo)

### Operaciones (~30 routes)
```
GET/POST  /api/operations                    — CRUD operaciones
GET/PUT   /api/operations/[id]               — Detalle/editar
GET/POST  /api/operations/[id]/customers     — Clientes de operacion
GET/POST  /api/operations/[id]/services      — Servicios
GET/POST  /api/operations/[id]/itinerary     — Itinerario
POST      /api/operations/[id]/itinerary/pdf — PDF itinerario
```

### Leads/CRM (~10 routes)
```
GET/POST  /api/leads                — CRUD leads
GET/PUT   /api/leads/[id]           — Detalle/editar
POST      /api/leads/claim          — Asignar a vendedor
PUT       /api/leads/update-status  — Cambiar estado
GET/POST  /api/leads/[id]/comments  — Comentarios
```

### Clientes (~12 routes)
```
GET/POST  /api/customers                — CRUD
GET/PUT   /api/customers/[id]           — Detalle
GET       /api/customers/[id]/operations — Operaciones del cliente
GET       /api/customers/[id]/payments   — Historial de pagos
GET       /api/customers/[id]/statement  — Estado de cuenta
GET       /api/customers/cuil-lookup     — Validacion CUIL
```

### Contabilidad (~25 routes)
```
GET       /api/accounting/ledger              — Libro mayor
GET       /api/accounting/ledger/stats        — Resumen
GET       /api/accounting/iva                 — IVA
GET       /api/accounting/financial-accounts  — Cuentas
POST      /api/accounting/financial-accounts/transfer — Transferencias
GET       /api/accounting/monthly-position    — Posicion mensual
GET       /api/accounting/debts-sales         — Deudas de clientes
GET       /api/accounting/ganancias           — Analisis de ganancias
GET       /api/accounting/iibb                — IIBB
GET       /api/accounting/libro-iva           — Libro IVA
POST      /api/accounting/facturas-compras    — Facturas compra AFIP
```

### Pagos (~12 routes)
```
GET/POST  /api/payments              — CRUD pagos
PUT       /api/payments/mark-paid    — Marcar como pagado
GET/POST  /api/payments/allocations  — Asignacion a pasajeros
DELETE    /api/payments/allocations  — Eliminar asignaciones
```

### Comisiones (~10 routes)
```
GET/POST  /api/commissions              — Registros
GET       /api/commissions/schemes      — Esquemas
POST      /api/commissions/pay          — Marcar pagada
POST      /api/commissions/recalculate  — Recalcular
```

### Caja (~12 routes)
```
GET/POST  /api/cash-boxes            — CRUD cajas
POST      /api/cash-boxes/transfer   — Transferencia entre cajas
GET       /api/cash/daily-balance    — Balance diario
GET/POST  /api/cash/movements        — Movimientos
```

### AFIP (~8 routes)
```
GET/POST  /api/settings/afip/setup      — Configuracion
GET       /api/settings/afip/status     — Estado conexion
POST      /api/settings/afip/test       — Test credenciales
GET/POST  /api/invoices                 — CRUD facturas
POST      /api/invoices/[id]/authorize  — Autorizar factura
```

### WhatsApp (~20 routes)
```
GET/POST  /api/whatsapp/messages          — Cola de mensajes
GET/PUT   /api/whatsapp/templates/[id]    — Templates
POST      /api/whatsapp/send-receipt      — Enviar recibo
GET/POST  /api/wha-control/devices        — Dispositivos
DELETE    /api/wha-control/devices        — Desactivar
GET       /api/wha-control/chats          — Conversaciones
GET       /api/wha-control/chats/[id]/messages — Mensajes
GET       /api/wha-control/metrics/summary     — Metricas resumen
GET       /api/wha-control/metrics/timeseries  — Serie temporal
```

### Integraciones
```
POST      /api/trello/webhook           — Webhook Trello (sin auth)
POST      /api/trello/sync              — Sync manual
POST      /api/webhooks/manychat        — Webhook ManyChat
```

### Cron Jobs (~8 routes)
```
POST      /api/cron/alerts              — Generar alertas
POST      /api/cron/exchange-rates      — Actualizar TC
POST      /api/cron/payment-reminders   — Recordatorios de pago
POST      /api/cron/recurring-payments  — Pagos recurrentes
POST      /api/cron/whatsapp            — Envio de mensajes
POST      /api/cron/task-reminders      — Recordatorios de tareas
```

### Analytics (~8 routes)
```
GET       /api/analytics/sales          — KPIs de ventas
GET       /api/analytics/profitability  — Rentabilidad
GET       /api/analytics/cashflow       — Flujo de caja
GET       /api/analytics/seasonality    — Estacionalidad
GET       /api/analytics/sellers        — Performance vendedores
```

### Otros
```
GET       /api/search                   — Busqueda global
POST      /api/documents/upload-with-ocr — Upload con OCR
POST      /api/emilia/chat              — Chat AI
GET/POST  /api/emilia/conversations     — Conversaciones AI
POST      /api/import/operations        — Importacion masiva
GET       /api/public/quotations/[token] — Cotizacion publica
```

**Total: 200+ API routes**

---

## 7. Multi-Agencia / Multi-Tenancy

### Arquitectura
- **Tabla `agencies`**: Cada sucursal (Rosario, Madero, etc.)
- **Tabla `user_agencies`**: Un usuario puede pertenecer a multiples agencias
- **Filtrado automatico**: Todas las queries filtran por `agency_id`

### Implementacion
```typescript
const { user } = await getCurrentUser()
const userAgencies = await getUserAgencies(user.id)
const agencyIds = userAgencies.map(ua => ua.agency_id)

// Todas las queries filtran por agencia
query.in("agency_id", agencyIds)
```

### SaaS (En desarrollo - Fase 1 completada)
- Migration 132: `saas_fase1_multi_tenant_foundation`
- Tabla `organizations` con plan, billing, limites
- Soporte para multiples organizaciones independientes

---

## 8. Integraciones Externas

### 8.1 AFIP (Facturacion Electronica Argentina)
- **Libreria**: `@afipsdk/afip.js`
- **Servicios**: WSFE (facturas), Automations (portal mis-comprobantes)
- **Credenciales**: CUIT + private key + certificado
- **Config**: `/settings/afip`

### 8.2 Trello (CRM Bidireccional)
- **Webhook**: `/api/trello/webhook` (sin auth, verificacion por token)
- **Sync**: Cards ↔ Leads, Labels → Region, List → Status
- **Config**: API key + token en settings por agencia

### 8.3 ManyChat (Lead Capture)
- **Webhook**: `/api/webhooks/manychat` (API key)
- **Flujo**: ManyChat flow → webhook → auto-crea lead

### 8.4 WhatsApp / Baileys (Wha Control)
- **Servicio externo**: `wha-connector` (Node.js en Railway)
- **Libreria**: Baileys (WhatsApp Web reverse-engineered)
- **Conexion**: QR code scan
- **Datos**: Mensajes, chats, metricas guardados en Supabase

### 8.5 OpenAI (OCR / AI)
- **Modelo**: GPT-4o Vision
- **Uso**: Extraccion de datos de pasaportes/DNI
- **Costo**: Por token (API key requerida)

### 8.6 Vibook / Emilia (Travel Search)
- **API**: api.vibook.ai
- **Uso**: Busqueda de vuelos y hoteles via chat
- **Config**: `EMILIA_API_KEY` env var

### 8.7 BCRA (Tipo de Cambio)
- **Fuente**: API publica BCRA
- **Cron**: Actualizacion diaria automatica
- **Tabla**: `exchange_rates`

---

## 9. Seguridad

### Implementado
- Row Level Security (RLS) en todas las tablas de Supabase
- RBAC con 5 roles y 13 modulos
- Rate limiting (200 req/min por IP)
- Audit logging (`audit_logs`)
- Service role key solo en backend
- Cookies HTTP-only para JWT
- Verificacion de webhooks por token/API key

### Variables de Entorno Sensibles
```
SUPABASE_SERVICE_ROLE_KEY    # Solo backend
OPENAI_API_KEY               # OCR
EMILIA_API_KEY               # Travel search
```

---

## 10. Deployment y CI/CD

### Pipeline
1. Push a `main` en GitHub
2. Vercel detecta cambio automaticamente
3. Build Next.js (`next build`)
4. Deploy serverless functions
5. CDN para assets estaticos

### Comandos
```bash
npm run dev          # Desarrollo (puerto 3067)
npm run build        # Build produccion
npm run start        # Server produccion
npm run db:generate  # Generar tipos TypeScript desde Supabase
```

### Migraciones de DB
- Archivos SQL secuenciales en `supabase/migrations/`
- Se ejecutan manualmente via Supabase Dashboard (SQL Editor)
- 130+ migraciones aplicadas

---

## 11. Patrones de Codigo

### API Route tipica
```typescript
export async function GET(request: Request) {
  const { user } = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!canPerformAction(user, 'operations', 'read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('operations')
    .select('*')
    .in('agency_id', user.agencyIds)

  return NextResponse.json({ data })
}
```

### Componente tipico
```typescript
"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

export function OperationForm() {
  const form = useForm<Schema>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: Schema) => {
    const res = await fetch('/api/operations', {
      method: 'POST',
      body: JSON.stringify(data)
    })
    if (res.ok) toast.success('Operacion creada')
  }

  return <Form {...form}>...</Form>
}
```

### Supabase
```typescript
// Server-side (API routes, Server Components)
import { createServerClient } from '@/lib/supabase/server'

// Client-side (Client Components)
import { createClient } from '@/lib/supabase/client'

// Admin (sin RLS, solo backend)
import { createAdminClient } from '@/lib/supabase/server'
```

---

## 12. Metricas del Proyecto

| Metrica | Valor |
|---------|-------|
| Componentes React | ~260 |
| Paginas | ~67 |
| API Routes | ~200+ |
| Migraciones DB | ~130 |
| Tablas | ~70 |
| Lineas de codigo | ~80,000+ |

---

*Documento generado: 3 de Abril 2026*
*Version: 1.0*
