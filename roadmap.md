# 🗺️ Roadmap - Travel Agency Management Platform

Este roadmap organiza la implementación del sistema en fases lógicas y secuenciales, asegurando que cada módulo se construya sobre bases sólidas.

---

## ✅ FASE 0: FUNDACIÓN (COMPLETADA)

### 0.1 Setup del Proyecto
- [x] Next.js 14+ con App Router
- [x] TypeScript configurado
- [x] TailwindCSS configurado
- [x] shadcn/ui instalado y configurado
- [x] Estructura de carpetas base

### 0.2 Configuración de Supabase
- [x] Conexión a Supabase
- [x] Variables de entorno configuradas
- [x] Cliente de Supabase (cliente y servidor)
- [x] Middleware para manejo de sesiones

### 0.3 Base de Datos
- [x] Schema SQL creado
- [x] Tablas creadas en Supabase
- [x] Tipos TypeScript generados
- [x] Seed inicial ejecutado

### 0.4 Autenticación Básica
- [x] Login page con shadcn/ui
- [x] Autenticación con Supabase Auth
- [x] Protección de rutas
- [x] Manejo de sesiones cliente/servidor

---

## 🏗️ FASE 1: LAYOUT Y NAVEGACIÓN

### 1.1 Layout Principal
- [ ] Crear layout del dashboard (`app/(dashboard)/layout.tsx`)
- [ ] Implementar Sidebar con shadcn/ui
  - [ ] Componente `Sidebar` con `ScrollArea`
  - [ ] Navegación con `Button` y `Link`
  - [ ] Secciones: Dashboard, Sales, Customers, Operators, Cash, Reports, Settings
- [ ] Implementar Navbar con shadcn/ui
  - [ ] Selector de agencia (`Select`)
  - [ ] Menú de usuario (`DropdownMenu`, `Avatar`)
  - [ ] Botón AI Copilot (placeholder por ahora)

### 1.2 Componentes Base
- [ ] Generar componentes shadcn/ui necesarios:
  - [ ] `Card`, `Button`, `Form`, `Input`, `Select`, `Table`, `Tabs`
  - [ ] `Dialog`, `Sheet`, `Badge`, `Alert`, `ScrollArea`
  - [ ] `Avatar`, `DropdownMenu`, `Separator`

### 1.3 Utilidades de Autenticación
- [ ] Mejorar `lib/auth.ts`:
  - [ ] Función `getCurrentUser()` optimizada
  - [ ] Función `getUserAgencies()` optimizada
  - [ ] Helpers para verificación de roles
- [ ] Middleware de protección de rutas mejorado

---

## 👥 FASE 2: GESTIÓN DE USUARIOS Y AGENCIAS

### 2.1 Módulo de Settings Base
- [ ] Crear página `/settings` con `Tabs` de shadcn/ui
- [ ] Tab "Users" (`/settings/users`)
  - [ ] Tabla de usuarios con `Table`
  - [ ] Formulario de invitación (`Dialog` + `Form`)
  - [ ] Acciones: editar rol, activar/desactivar
- [ ] Tab "Agencies" (`/settings/agencies`)
  - [ ] Lista de agencias
  - [ ] Formulario CRUD de agencias

### 2.2 API Routes de Settings
- [ ] `POST /api/settings/users` - Crear/actualizar usuario
- [ ] `POST /api/settings/users/invite` - Invitar usuario
- [ ] `GET /api/settings/users` - Listar usuarios
- [ ] `POST /api/settings/agencies` - CRUD de agencias

---

## 📦 FASE 3: INTEGRACIÓN CON TRELLO

### 3.1 Configuración de Trello
- [ ] Tab "Trello" en Settings (`/settings/trello`)
  - [ ] Sub-tab "Credentials" - Formulario para API key/token/board_id
  - [ ] Sub-tab "Status Mapping" - Mapeo de listas a estados
  - [ ] Sub-tab "Region Mapping" - Mapeo de listas a regiones
  - [ ] Sub-tab "Sync" - Botón de sincronización manual

### 3.2 API Routes de Trello
- [ ] `POST /api/trello/test-connection` - Probar conexión
- [ ] `GET /api/trello/lists` - Obtener listas del board
- [ ] `POST /api/trello/sync` - Sincronizar cards a leads

### 3.3 Lógica de Sincronización
- [ ] Servicio `lib/trello/sync.ts`:
  - [ ] Obtener cards de Trello
  - [ ] Mapear cards a estructura de `leads`
  - [ ] Upsert en base de datos por `external_id`
  - [ ] Manejo de errores y logging

---

## ✅ FASE 4: MÓDULO DE VENTAS (LEADS) (COMPLETADA)

### 4.1 Página de Leads
- [x] Crear `/sales/leads` con `Tabs` (Kanban / Table)
- [x] Vista Kanban:
  - [x] Columnas: NEW, IN_PROGRESS, QUOTED, WON, LOST
  - [x] Componente `LeadsKanban` con `ScrollArea` y `Card`
  - [x] Drag & drop básico (arrastrar y soltar para cambiar status)
- [x] Vista Table:
  - [x] Tabla con `Table` de shadcn/ui
  - [x] Componente `LeadsFilters` para filtros (seller, region, status, fecha) - preparado para implementación client-side
  - [x] Acción "Convertir a Operación" con Dialog

### 4.2 API Routes de Leads
- [x] `POST /api/leads/update-status` - Cambiar status (ya existía)
- [x] `POST /api/operations` - Crear operación desde lead (nueva)

### 4.3 Componentes de Leads
- [x] `components/sales/leads-kanban.tsx` - Implementado con drag & drop
- [x] `components/sales/leads-table.tsx` - Implementado con botón "Convertir"
- [x] `components/sales/convert-lead-dialog.tsx` - Dialog completo para convertir lead a operación
- [x] `components/sales/leads-filters.tsx` - Componente de filtros (preparado para uso futuro)

### 4.4 Funcionalidades Implementadas
- [x] **Convertir Lead a Operación**: 
  - Dialog completo con formulario validado (react-hook-form + zod)
  - Campos: agencia, vendedor, tipo, origen, destino, fechas, pax, montos, moneda
  - Al crear operación:
    - Crea registro en `operations`
    - Genera pagos automáticos (customer INCOME 15 días antes, operator EXPENSE 7 días antes)
    - Genera alertas (payment due, upcoming trip 48-72h antes)
    - Actualiza lead status a WON

---

## ✅ FASE 5: OPERACIONES (COMPLETADA)

### 5.1 Página de Operaciones
- [x] Crear `/operations`
- [x] Tabla de operaciones con `Table`
- [x] Filtros: status, seller, agency, rango de fechas
- [x] Vista detalle de operación:
  - [x] Información básica
  - [x] Tabla de clientes
  - [x] Lista de documentos
  - [x] Lista de pagos
  - [x] Timeline de alertas

### 5.2 Convertir Lead a Operación
- [x] Dialog `ConvertLeadDialog` con `Form`
- [x] Campos: agency, seller, type, origin, destination, dates, pax, amounts
- [x] Al crear operación:
  - [x] Crear registro en `operations`
  - [x] Generar pagos automáticos (customer INCOME, operator EXPENSE)
  - [x] Generar alertas (payment due, upcoming trip)

### 5.3 API Routes de Operaciones
- [x] `GET /api/operations` - Listar operaciones
- [x] `POST /api/operations` - Crear operación
- [x] `GET /api/operations/[id]` - Detalle de operación
- [x] `PATCH /api/operations/[id]` - Actualizar operación

---

## ✅ FASE 6: MÓDULO DE CLIENTES (COMPLETADA)

### 6.1 Página de Clientes
- [x] Crear `/customers`
- [x] Tabla de clientes con `Table`
- [x] Columnas: nombre, teléfono, email, número de viajes, total gastado
- [x] Filtros y búsqueda

### 6.2 Vista Detalle de Cliente
- [x] Página `/customers/[id]`
- [x] Información personal
- [x] Lista de operaciones
- [x] Historial de pagos
- [x] Documentos asociados

### 6.3 API Routes de Clientes
- [x] `GET /api/customers` - Listar clientes
- [x] `GET /api/customers/[id]` - Detalle de cliente
- [x] `POST /api/customers` - Crear cliente
- [x] `PATCH /api/customers/[id]` - Actualizar cliente

---

## ✅ FASE 7: DOCUMENTOS Y OCR (COMPLETADA)

### 7.1 Upload de Documentos
- [x] Componente `DocumentUploadDialog` con `Dialog` y `Form`
- [x] Input de archivo
- [x] Select de tipo de documento
- [x] Upload a Supabase Storage
- [x] Crear registro en tabla `documents`

### 7.2 OCR con OpenAI Vision
- [x] API Route `/api/documents/parse`
- [x] Lógica de OCR:
  - [x] Obtener imagen de Supabase Storage
  - [x] Llamar a OpenAI Vision API
  - [x] Extraer campos (nombre, documento, fecha nacimiento, etc.)
  - [x] Actualizar o crear `customer`
  - [x] Generar alertas si documento expirado

### 7.3 UI de Resultados OCR
- [x] Mostrar resultados en `Dialog` con formulario editable
- [x] Permitir confirmar o editar datos extraídos

---

## 💰 FASE 8: CAJA Y FINANZAS

### 8.1 Página Principal de Caja
- [ ] Crear `/cash`
- [ ] KPIs con `Card`:
  - [ ] Total ingresos
  - [ ] Total egresos
  - [ ] Caja neta
  - [ ] Pagos pendientes (clientes)
  - [ ] Pagos pendientes (operadores)
- [ ] Filtros: rango de fechas, agency, currency

### 8.2 Gestión de Pagos
- [ ] Tabla de pagos (`/cash/payments`)
- [ ] Acción "Mark as paid":
  - [ ] Dialog de confirmación
  - [ ] Actualizar `payments` (date_paid, status)
  - [ ] Crear `cash_movements`

### 8.3 Movimientos de Caja
- [ ] Tabla de movimientos (`/cash/movements`)
- [ ] Exportar CSV

### 8.4 API Routes de Pagos
- [ ] `GET /api/payments` - Listar pagos
- [ ] `POST /api/payments/mark-paid` - Marcar como pagado
- [ ] `GET /api/cash/movements` - Listar movimientos
- [ ] `GET /api/cash/export` - Exportar CSV

---

## 🤝 FASE 9: OPERADORES Y COMISIONES

### 9.1 Módulo de Operadores
- [ ] Página `/operators`
- [ ] Tabla de operadores con métricas:
  - [ ] Nombre
  - [ ] Número de operaciones
  - [ ] Total operator_cost
  - [ ] Total pagado
  - [ ] Balance pendiente
  - [ ] Próxima fecha de pago
- [ ] Vista detalle de operador

### 9.2 Sistema de Comisiones
- [ ] Servicio `lib/commissions/calculate.ts`:
  - [ ] Calcular margen (sale_amount_total - operator_cost)
  - [ ] Aplicar reglas de comisión
  - [ ] Crear `commission_records` para operaciones CONFIRMED y pagadas
- [ ] Página `/my/commissions` para vendedores
- [ ] Tabla de comisiones con resúmenes mensuales

### 9.3 API Routes
- [ ] `GET /api/operators` - Listar operadores
- [ ] `GET /api/operators/[id]` - Detalle de operador
- [ ] `GET /api/commissions` - Listar comisiones (filtrado por rol)

---

## ⚠️ FASE 10: SISTEMA DE ALERTAS

### 10.1 Generación Automática de Alertas
- [ ] Servicio `lib/alerts/generate.ts`:
  - [ ] Alertas de pagos vencidos (customer y operator)
  - [ ] Alertas de pagos próximos a vencer
  - [ ] Alertas de viajes próximos (48-72h antes)
  - [ ] Alertas de documentos faltantes

### 10.2 Página de Alertas
- [ ] Crear `/alerts`
- [ ] Lista de alertas con `Table`
- [ ] Filtros: type, status, date, agency
- [ ] Acciones: marcar como DONE o IGNORED

### 10.3 API Routes
- [ ] `GET /api/alerts` - Listar alertas
- [ ] `POST /api/alerts/mark-done` - Marcar como completada
- [ ] `POST /api/alerts/ignore` - Ignorar alerta

---

## 📊 FASE 11: DASHBOARD DEL OWNER

### 11.1 Dashboard Principal
- [ ] Mejorar `/dashboard` para SUPER_ADMIN
- [ ] KPIs con `Card`:
  - [ ] Total ventas
  - [ ] Total operaciones
  - [ ] Margen total
  - [ ] Margen promedio %
  - [ ] Pagos pendientes (clientes)
  - [ ] Pagos pendientes (operadores)
- [ ] Filtros: rango de fechas, agency, seller

### 11.2 Gráficos
- [ ] Instalar librería de gráficos (recharts o similar)
- [ ] Gráfico de ventas por vendedor (bar)
- [ ] Gráfico de ventas por destino (bar/pie)
- [ ] Gráfico de flujo de caja (line)
- [ ] Top 5 destinos

### 11.3 API Routes de Analytics
- [ ] `GET /api/analytics/sales` - Resumen de ventas
- [ ] `GET /api/analytics/sellers` - Performance por vendedor
- [ ] `GET /api/analytics/destinations` - Ventas por destino
- [ ] `GET /api/analytics/cashflow` - Flujo de caja

---

## 🤖 FASE 12: AI COPILOT

### 12.1 UI del Copilot
- [ ] Botón en Navbar que abre `Sheet` lateral
- [ ] Componente `AICopilotSheet`:
  - [ ] Historial de chat con `ScrollArea`
  - [ ] Input/Textarea para prompts
  - [ ] Botón "Send"

### 12.2 Backend del Copilot
- [ ] API Route `/api/ai`:
  - [ ] Recibir prompt del usuario
  - [ ] LLM decide qué herramientas llamar
  - [ ] Ejecutar funciones de datos:
    - [ ] `getSalesSummary()`
    - [ ] `getDuePayments()`
    - [ ] `getSellerPerformance()`
    - [ ] `getTopDestinations()`
    - [ ] `getOperatorBalances()`
  - [ ] LLM formatea respuesta natural
  - [ ] Incluir links de navegación opcionales

### 12.3 Servicios de Datos para AI
- [ ] `lib/ai/tools.ts`:
  - [ ] Implementar todas las funciones de consulta
  - [ ] Aplicar filtros de permisos (SELLER solo ve sus datos)

---

## ⚙️ FASE 13: SETTINGS COMPLETO

### 13.1 Tab de Comisiones
- [ ] Gestión de `commission_rules`
- [ ] Formulario para crear/editar reglas
- [ ] Para v1: regla por defecto (vendedor X% del margen)

### 13.2 Tab de AI
- [ ] Toggle para activar/desactivar AI Copilot
- [ ] Selector de roles que pueden usar AI

---

## 🌱 FASE 14: SEED Y DATOS DE PRUEBA

### 14.1 Mejorar Script de Seed
- [ ] Expandir seed con más datos:
  - [ ] 4 vendedores adicionales
  - [ ] ~20 leads con diferentes estados/regiones
  - [ ] ~10 operaciones con estados mixtos
  - [ ] Pagos variados (PENDING, PAID, OVERDUE)
  - [ ] Algunos documentos
  - [ ] Regla de comisión base

---

## 🧪 FASE 15: TESTING Y PULIDO

### 15.1 Testing
- [ ] Probar todos los flujos de usuario
- [ ] Verificar permisos por rol
- [ ] Probar integración con Trello
- [ ] Probar OCR con diferentes documentos
- [ ] Validar cálculos de comisiones

### 15.2 Optimizaciones
- [ ] Optimizar queries de Supabase
- [ ] Agregar índices necesarios
- [ ] Mejorar manejo de errores
- [ ] Agregar loading states
- [ ] Mejorar UX con feedback visual

### 15.3 Documentación
- [ ] Documentar APIs
- [ ] Documentar estructura de carpetas
- [ ] Guía de deployment
- [ ] README actualizado

---

## 📝 NOTAS DE IMPLEMENTACIÓN

### Prioridades
1. **Fase 1-2**: Base crítica (layout, usuarios, agencias)
2. **Fase 3-4**: Flujo principal de negocio (Trello, Leads)
3. **Fase 5-6**: Operaciones y clientes
4. **Fase 7-8**: Documentos y finanzas
5. **Fase 9-10**: Operadores, comisiones y alertas
6. **Fase 11-12**: Analytics y AI
7. **Fase 13-15**: Settings completo, seed, testing

### Principios
- ✅ **Siempre usar shadcn/ui** - No crear componentes custom si existe en shadcn
- ✅ **TypeScript estricto** - No usar `any`
- ✅ **Separación de concerns** - UI, lógica de dominio, acceso a datos
- ✅ **Tipos de Supabase** - Usar tipos generados
- ✅ **Modularidad** - Cada módulo independiente y testeable

### Orden de Desarrollo Sugerido
1. Completar Fase 1 (Layout) para tener navegación funcional
2. Completar Fase 2 (Settings básico) para gestionar usuarios
3. Implementar Fase 3 (Trello) para tener datos de entrada
4. Construir Fase 4 (Leads) para visualizar datos
5. Continuar con el resto en orden lógico

---

**Estado Actual**: ✅ Fase 0, 1, 3, 4, 5, 6 y 7 completadas

**Próximo Paso**: 💰 Fase 8 - Caja y Finanzas (mejoras y funcionalidades adicionales)

---

## 🔧 NOTAS DE DESARROLLO

### Login Temporalmente Deshabilitado
- **Estado**: Login deshabilitado en modo desarrollo para facilitar testing
- **Razón**: Evitar tener que loguearse cada vez que se prueban nuevas funcionalidades
- **TODO**: Re-habilitar login antes de producción
- **Ubicación**: `middleware.ts` y `lib/auth.ts` tienen bypass para desarrollo

