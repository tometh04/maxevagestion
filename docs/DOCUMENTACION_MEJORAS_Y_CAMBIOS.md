# Documentación de Mejoras y Cambios - ERP LOZADA

Este documento registra todas las mejoras, nuevas funcionalidades, correcciones y cambios realizados en la aplicación. Está diseñado para ser actualizado continuamente a medida que se implementan nuevas características o se solucionan problemas.

**Última actualización:** 2025-01-19 (Mejora de búsqueda global con badges de tipo y redirección correcta de leads)

---

## Índice

1. [Mejoras Implementadas](#mejoras-implementadas)
2. [Nuevas Funcionalidades](#nuevas-funcionalidades)
3. [Correcciones de Errores](#correcciones-de-errores)
4. [Cambios Técnicos](#cambios-técnicos)
5. [Migraciones de Base de Datos](#migraciones-de-base-de-datos)
6. [Pendientes / Roadmap](#pendientes--roadmap)

---

## Mejoras Implementadas

### 1. Búsqueda Global (Command Menu / Lupa)

**Fecha:** 2025-01-17 (Mejorado 2025-01-19)

**Descripción:**
Se implementó una funcionalidad de búsqueda global accesible desde cualquier página de la aplicación mediante:
- Botón de búsqueda (lupa) en el header
- Atajo de teclado: `⌘K` (Mac) o `Ctrl+K` (Windows/Linux)

**Funcionalidades:**
- Búsqueda en tiempo real con debounce de 300ms
- Búsqueda simultánea en:
  - Clientes (por nombre, email, teléfono)
  - Operaciones (por código, destino, códigos de reserva)
  - Operadores (por nombre, email)
  - Leads (por nombre, destino)
- Navegación rápida a resultados
- Navegación rápida a secciones principales
- Acciones rápidas (Nueva Operación, Nuevo Cliente, Nuevo Lead)
- **Badges de tipo** en cada resultado (Cliente, Operación, Operador, Lead)
- **Redirección automática** de `/sales?lead=` a `/sales/leads?leadId=`

**Mejoras implementadas (2025-01-19):**
- Agregados badges visuales que indican el tipo de cada resultado
- Corrección de ruta para leads: ahora navega a `/sales/leads?leadId=` en lugar de `/sales?lead=`
- Creación de página `/sales/page.tsx` que redirige automáticamente rutas antiguas
- El dialog de lead se abre automáticamente cuando se navega con `leadId` en query params
- Limpieza automática de query params después de abrir el dialog

**Archivos modificados:**
- `components/command-menu.tsx` - Componente principal de búsqueda (agregados badges de tipo)
- `components/site-header.tsx` - Agregado botón de búsqueda
- `app/api/search/route.ts` - Endpoint de búsqueda
- `components/ui/command.tsx` - Componente base (deshabilitado filtrado interno)
- `app/(dashboard)/sales/page.tsx` - **NUEVA** - Página de redirección
- `components/sales/leads-page-client.tsx` - Manejo de `leadId` en query params
- `components/sales/leads-kanban.tsx` - Apertura automática de dialog con `initialLeadId`
- `components/sales/leads-kanban-trello.tsx` - Apertura automática de dialog con `initialLeadId`
- `components/sales/leads-table.tsx` - Link corregido a usar query params

**Detalles técnicos:**
- Uso de `cmdk` para el Command Palette
- Búsqueda con debounce para optimizar rendimiento
- Filtrado deshabilitado en `cmdk` (`shouldFilter={false}`) para permitir búsqueda personalizada
- Reset de estado cuando el dialog se cierra para mantener estado limpio
- Manejo de estado controlado/no controlado para flexibilidad
- Badges de tipo con colores distintivos para mejor UX
- Redirección server-side desde `/sales?lead=` para compatibilidad con URLs antiguas
- `useSearchParams` y `useRouter` para manejo de query params en client components

**Errores corregidos:**
- ✅ Reset de estado al abrir dialog interfería con la escritura
- ✅ Filtrado interno de `cmdk` ocultaba resultados de API
- ✅ Instancia duplicada de CommandMenu causaba conflictos
- ✅ Timing de búsqueda no funcionaba en primera apertura
- ✅ **404 al hacer click en leads** - Redirección corregida
- ✅ **Falta de identificación de tipo** - Badges agregados

---

### 2. Códigos de Reserva en Operaciones

**Fecha:** 2025-01-17

**Descripción:**
Se agregaron dos campos opcionales a las operaciones para registrar códigos de reserva:
- Código de Reserva Aéreo (`reservation_code_air`)
- Código de Reserva Hotel (`reservation_code_hotel`)

**Funcionalidades:**
- Campos disponibles en formularios de creación y edición de operaciones
- Visualización en tabla de operaciones
- Búsqueda por códigos de reserva en búsqueda global
- Campos opcionales (no requeridos)

**Archivos modificados:**
- `components/operations/new-operation-dialog.tsx` - Formulario de creación
- `components/operations/edit-operation-dialog.tsx` - Formulario de edición
- `components/operations/operations-table.tsx` - Tabla de operaciones
- `app/api/operations/route.ts` - API de creación/lista
- `app/api/operations/[id]/route.ts` - API de actualización
- `app/api/search/route.ts` - Búsqueda por códigos
- `components/command-menu.tsx` - Muestra códigos en resultados

**Migración de base de datos:**
- `supabase/migrations/081_add_reservation_codes_to_operations.sql`
- Columnas: `reservation_code_air`, `reservation_code_hotel`
- Índices para optimizar búsqueda

---

### 3. Número de Trámite en Clientes

**Fecha:** 2025-01-16

**Descripción:**
Se agregó el campo "Número de Trámite" (`procedure_number`) a los clientes, permitiendo registrar el número de trámite del documento de identidad (DNI o Pasaporte).

**Funcionalidades:**
- Extracción automática mediante OCR
- Campo disponible en formulario de creación/edición
- Reordenamiento de campos en formulario (Número de Trámite después de Número de Documento)

**Archivos modificados:**
- `components/customers/new-customer-dialog.tsx` - Formulario con campo procedure_number
- `app/api/documents/ocr-only/route.ts` - Extracción de procedure_number en OCR
- `app/api/customers/route.ts` - API de creación
- `app/api/customers/[id]/route.ts` - API de actualización

**Migración de base de datos:**
- `supabase/migrations/080_add_procedure_number_to_customers.sql`

---

### 4. Soporte para PDF en OCR

**Fecha:** 2025-01-16

**Descripción:**
Se extendió la funcionalidad OCR para soportar archivos PDF además de imágenes.

**Funcionalidades:**
- Subida de archivos PDF (máximo 15MB)
- Extracción de imágenes desde PDF usando `pdf-lib`
- Fallback para búsqueda directa de imágenes en bytes del PDF
- Extracción de datos de documentos (DNI, Pasaporte) desde PDF

**Archivos modificados:**
- `app/api/documents/ocr-only/route.ts` - Procesamiento de PDF
- `components/customers/new-customer-dialog.tsx` - Input acepta PDF
- `package.json` - Dependencia `pdf-lib` agregada

**Mejoras técnicas:**
- Extracción robusta de imágenes desde PDF
- Múltiples métodos de extracción (biblioteca y raw bytes)
- Validación de tipo de archivo y tamaño

### 5. Sistema de Pagos con Tipo de Cambio Obligatorio

**Fecha:** 2025-01-17

**Descripción:**
Se mejoró completamente el sistema de pagos para garantizar que todos los cálculos se realicen correctamente en USD, incluyendo conversión obligatoria de ARS a USD mediante tipo de cambio.

**Funcionalidades:**
- Campo `exchange_rate` obligatorio para pagos en ARS
- Cálculo automático de `amount_usd` para todos los pagos
- Visualización de equivalente USD en tiempo real en el formulario
- Validación que exige tipo de cambio para pagos en ARS
- Creación de movimiento en CAJA además del movimiento en RESULTADO
- Todos los KPIs ahora se calculan en USD

**Mejoras implementadas:**
- Agregado campo `exchange_rate` al schema de pagos
- Formulario muestra campo de tipo de cambio cuando moneda es ARS
- Cálculo en tiempo real: "Equivale a USD X.XX"
- Validación en frontend y backend
- API guarda `exchange_rate` y `amount_usd` al crear pago
- KPI de deudas calcula totales EN USD (convierte ARS usando exchange_rate)

**Archivos modificados:**
- `components/operations/operation-payments-section.tsx` - Campo exchange_rate en formularios
- `app/api/payments/route.ts` - Guardado de exchange_rate y amount_usd, creación de movimiento en CAJA
- `components/cash/cash-summary-client.tsx` - Cálculo de KPIs en USD

**Migración de base de datos:**
- `supabase/migrations/083_add_exchange_rate_to_payments.sql` - Columnas `exchange_rate` y `amount_usd`

---

### 6. Reubicación de "Deudores por Ventas" a Contabilidad

**Fecha:** 2025-01-17

**Descripción:**
Se movió la funcionalidad "Deudores por Ventas" del módulo de Clientes al módulo de Contabilidad (dentro de Finanzas), ya que es información financiera sobre cuentas por cobrar.

**Funcionalidades:**
- Ruta actualizada: `/customers/debtors` → `/accounting/debts-sales`
- Componente renombrado: `CustomersDebtorsPageClient` → `DebtsSalesPageClient`
- API route movido: `/api/customers/debtors` → `/api/accounting/debts-sales`
- Permisos actualizados: de `customers` a `accounting`
- Breadcrumbs y links actualizados para apuntar a Contabilidad

**Archivos modificados/movidos:**
- `app/(dashboard)/customers/debtors/page.tsx` → `app/(dashboard)/accounting/debts-sales/page.tsx`
- `components/customers/customers-debtors-page-client.tsx` → `components/accounting/debts-sales-page-client.tsx`
- `app/api/customers/debtors/route.ts` → `app/api/accounting/debts-sales/route.ts`
- `components/app-sidebar.tsx` - Actualizado sidebar para mostrar en Contabilidad

---

### 7. Mejora de Interfaz del Sidebar

**Fecha:** 2025-01-17

**Descripción:**
Se mejoró la legibilidad del sidebar aumentando el ancho y reduciendo el espaciado de los submenús para que los textos largos quepan mejor en una sola línea.

**Funcionalidades:**
- Ancho del sidebar aumentado de 16rem (256px) a 20rem (320px)
- Espaciado reducido en submenús (margin y padding reducidos)
- Mejor visualización de textos largos como "Cuentas Financieras" y "Deudores por Ventas"

**Archivos modificados:**
- `components/ui/sidebar.tsx` - Ancho aumentado, espaciado reducido
- `components/nav-main.tsx` - Padding reducido en nivel 3

**Detalles técnicos:**
- `SIDEBAR_WIDTH`: `16rem` → `20rem`
- `SidebarMenuSub`: `mx-3.5` → `mx-1`, `px-2.5` → `px-1.5`
- `SidebarMenuSubButton` nivel 3: `pl-4` → `pl-1`

---

### 8. Eliminación de Funcionalidad de Segmentos

**Fecha:** 2025-01-17

**Descripción:**
Se eliminó completamente la funcionalidad de "Segmentos" de clientes ya que no se estaba utilizando y no era necesaria.

**Archivos eliminados:**
- `app/(dashboard)/customers/segments/page.tsx`
- `components/customers/customer-segments-page-client.tsx`
- `app/api/customers/segments/route.ts`
- `app/api/customers/segments/[id]/route.ts`
- `app/api/customers/segments/[id]/members/route.ts`

**Archivos modificados:**
- `components/app-sidebar.tsx` - Removida ruta "Segmentos"

**Nota:**
- La migración SQL `071_create_customer_segments.sql` NO se eliminó (las migraciones son históricas)

---

### 9. Renombrado "Pagos Recurrentes" → "Gastos Recurrentes" y Sistema de Categorías

**Fecha:** 2025-01-17

**Descripción:**
Se renombró la funcionalidad "Pagos Recurrentes" a "Gastos Recurrentes" y se implementó un sistema de categorías para clasificar los gastos recurrentes.

**Funcionalidades:**
- Renombrado en sidebar, títulos de página y mensajes
- Sistema de categorías predefinidas:
  - Servicios (luz, agua, gas, internet, telefonía)
  - Alquiler (oficina o espacio físico)
  - Marketing (publicidad, redes sociales, promociones)
  - Salarios (salarios y honorarios de empleados)
  - Impuestos (impuestos y contribuciones)
  - Otros (gastos varios)
- Cada categoría tiene un color asignado para gráficos futuros
- API para gestionar categorías (crear nuevas categorías - solo SUPER_ADMIN)

**Mejoras implementadas:**
- Tabla `recurring_payment_categories` creada con categorías predefinidas
- Campo `category_id` agregado a `recurring_payments` (nullable para compatibilidad)
- Gastos existentes asignados automáticamente a categoría "Otros"
- API `/api/accounting/recurring-payments/categories` para obtener y crear categorías

**Archivos modificados:**
- `components/app-sidebar.tsx` - Renombrado "Pagos Recurrentes" → "Gastos Recurrentes"
- `components/accounting/recurring-payments-page-client.tsx` - Títulos y mensajes actualizados

**Archivos creados:**
- `app/api/accounting/recurring-payments/categories/route.ts` - API de categorías

**Migraciones de base de datos:**
- `supabase/migrations/085_create_recurring_payment_categories.sql` - Tabla de categorías
- `supabase/migrations/086_add_category_id_to_recurring_payments.sql` - Relación con categorías

**Funcionalidades completadas:**
- ✅ Selector de categoría en dialogs de nuevo/editar
- ✅ Filtros de fecha (mes/año) con inicialización automática
- ✅ Gráficos de análisis por categoría (barras, líneas, torta)

**Detalles adicionales:**
- Selector de categoría muestra colores de cada categoría (indicador circular)
- Filtros de fecha permiten seleccionar mes y año para filtrar por `next_due_date` o `start_date`
- Filtros combinables: proveedor + agencia + estado + mes/año
- **Gráficos implementados:**
  - **Gráfico de barras:** Gastos por categoría (mensual) - muestra totales en USD por categoría
  - **Gráfico de líneas:** Evolución de gastos por categoría - últimos 6 meses con múltiples líneas por categoría
  - **Gráfico de torta:** Distribución porcentual - porcentaje del total de gastos por categoría
- Gráficos usan colores de categorías desde la base de datos
- Datos calculados desde `filteredPayments` (respeta todos los filtros activos)

**Archivos modificados adicionales:**
- `components/accounting/new-recurring-payment-dialog.tsx` - Campo `category_id` agregado
- `components/accounting/edit-recurring-payment-dialog.tsx` - Campo `category_id` agregado
- `components/accounting/recurring-payments-page-client.tsx` - Filtros de fecha, gráficos y lógica de datos

**Estado:** ✅ **COMPLETADO** - Todas las funcionalidades del Paso 4 implementadas

---

### 10. Sistema de Pago Masivo a Operadores

**Fecha:** 2025-01-17

**Descripción:**
Se implementó un sistema completo de pago masivo a operadores que permite registrar múltiples pagos en una sola transacción, con soporte para pagos parciales y conversión de moneda.

**Funcionalidades:**
- Dialog de pago masivo con filtros:
  - Filtro por operador
  - Filtro por moneda (ARS/USD/Todas)
  - Filtro por fecha de viaje (preparado)
  - Selección múltiple con checkboxes
  - Monto editable por operación (pagos parciales)
- Conversor de moneda:
  - Campo TC manual cuando hay mezcla de monedas
  - Conversión automática ARS/USD y USD/ARS
  - Validación de TC requerido
- API de pago masivo:
  - Actualiza `paid_amount` en `operator_payments`
  - Cambia status a PAID si `paid_amount >= amount`
  - Crea `ledger_movements` en cuenta origen y RESULTADO
  - Soporta conversión de moneda en pagos
- UI mejorada:
  - Botón "Cargar Pago Masivo" en página principal
  - Badge "Parcial" para pagos parciales
  - Muestra monto pagado en tabla

**Archivos creados:**
- `components/accounting/bulk-payment-dialog.tsx` - Dialog completo de pago masivo
- `app/api/accounting/operator-payments/bulk/route.ts` - API de pago masivo

**Archivos modificados:**
- `app/(dashboard)/accounting/operator-payments/page.tsx` - Carga de operadores y cuentas
- `components/accounting/operator-payments-page-client.tsx` - Botón y badges
- `lib/supabase/types.ts` - Tipos TypeScript actualizados con `paid_amount`

**Migraciones de base de datos:**
- `supabase/migrations/084_add_paid_amount_to_operator_payments.sql` - Campo `paid_amount` para pagos parciales

**Detalles técnicos:**
- Pagos parciales: `paid_amount` se actualiza y `status` cambia a PAID solo si `paid_amount >= amount`
- Conversión de moneda: Se calcula `amount_usd` y `amount_ars_equivalent` según el TC proporcionado
- Ledger movements: Se crean en la cuenta de origen (origen del pago) y en RESULTADO/COSTOS

### 12. Eliminación de Operaciones

**Fecha:** 2025-01-19

**Descripción:**
Se implementó la funcionalidad completa para eliminar operaciones desde la tabla de operaciones, con confirmación y eliminación en cascada de todos los datos relacionados, excepto el cliente asociado.

**Funcionalidades:**
- Botón "Eliminar" en el dropdown de acciones de cada operación
- Solo visible para usuarios con rol `ADMIN` o `SUPER_ADMIN`
- Diálogo de confirmación que muestra claramente qué se eliminará:
  - ✅ Todos los pagos y cobranzas
  - ✅ Movimientos contables (libro mayor, caja)
  - ✅ Pagos a operadores pendientes
  - ✅ Alertas y documentos
  - ✅ Comisiones calculadas
  - ⚠️ **El cliente asociado NO se elimina** (se mantiene en la base de datos)
- Eliminación en cascada de todos los datos relacionados
- Toast de confirmación al eliminar exitosamente
- Refresco automático de la tabla después de eliminar

**Archivos Modificados:**
- `components/operations/operations-table.tsx`
  - Agregado import de `Trash2` icon y `AlertDialog` components
  - Agregado estado para `deletingOperation`, `deleteDialogOpen`, `deleting`
  - Agregado `handleDeleteClick` para abrir diálogo
  - Agregado `handleDeleteConfirm` para ejecutar eliminación
  - Agregado `DropdownMenuItem` con botón "Eliminar" (solo para ADMIN/SUPER_ADMIN)
  - Agregado `AlertDialog` con confirmación detallada

**API Utilizada:**
- `DELETE /api/operations/[id]` - Ya existía y estaba correctamente implementada
  - Elimina IVA (venta y compra)
  - Elimina pagos y sus movimientos contables
  - Elimina ledger_movements de la operación
  - Elimina cash_movements de la operación
  - Elimina operator_payments
  - Elimina alertas
  - Elimina comisiones (commission_records)
  - Elimina documentos
  - Revierte lead a IN_PROGRESS si existe
  - Finalmente elimina la operación (cascadea operation_customers)
  - **NO elimina el cliente** (solo elimina la relación en operation_customers)

**Detalles Técnicos:**
- La eliminación es **irreversible**
- Se requiere confirmación explícita del usuario
- El diálogo muestra lista detallada de qué se eliminará
- El cliente asociado se mantiene intacto en la tabla `customers`
- Solo se elimina la relación en `operation_customers` (cascade delete)

**UI/UX:**
- Botón "Eliminar" aparece en rojo en el dropdown
- Icono de basura (Trash2) para identificación visual
- Diálogo modal con título, descripción detallada y lista de items
- Botones: "Cancelar" (gris) y "Eliminar operación" (rojo)
- Estado de carga durante eliminación ("Eliminando...")
- Toast de éxito o error después de la operación

---

### 11. Posición Contable Mensual - REHECHA DESDE CERO (Balance General Profesional)

**Fecha:** 2025-01-19

**Descripción:**
Se eliminó completamente la funcionalidad anterior de Posición Contable Mensual y se rehizo desde cero con una estructura contable profesional que incluye Balance General completo y Estado de Resultados del mes. La nueva implementación está completamente integrada con el resto del sistema (deudores por ventas, pagos a operadores, caja, etc.).

**Motivación:**
La versión anterior tenía múltiples problemas:
- No traía correctamente las cuentas por cobrar (deudores)
- No traía correctamente las cuentas por pagar (operadores)
- El TC mensual no era independiente por mes
- Los cálculos mostraban NaN y valores incorrectos
- No estaba conectada con las fuentes de datos reales del sistema

**Estructura Contable Implementada:**

```
ACTIVO (Lo que la empresa TIENE)
├── Activo Corriente (< 1 año)
│   ├── Caja y Bancos
│   │   ├── Efectivo USD
│   │   ├── Efectivo ARS
│   │   ├── Bancos USD
│   │   └── Bancos ARS
│   └── Cuentas por Cobrar (deuda de clientes)
└── Activo No Corriente (> 1 año)
    ├── Bienes de Uso (0 - preparado para futuro)
    └── Inversiones LP (0 - preparado para futuro)

PASIVO (Lo que la empresa DEBE)
├── Pasivo Corriente (< 1 año)
│   ├── Cuentas por Pagar (deuda a operadores)
│   └── Gastos a Pagar (recurrentes pendientes)
└── Pasivo No Corriente (> 1 año)
    └── Deudas LP (0 - preparado para futuro)

PATRIMONIO NETO = ACTIVO - PASIVO
└── Resultado del Ejercicio

ESTADO DE RESULTADOS DEL MES
├── Ingresos (cobros de clientes)
├── (-) Costos (pagos a operadores)
├── = Margen Bruto (%)
├── (-) Gastos Operativos
└── = RESULTADO DEL MES
```

**Funcionalidades Implementadas:**

#### 1. Tipos de Cambio Mensuales (Independientes por Mes):
- **Cada mes tiene su propio TC guardado** en tabla `monthly_exchange_rates`
- Input editable en la interfaz para ingresar/actualizar el TC del mes seleccionado
- Botón "Guardar" (💾) para persistir el TC del mes
- Si no hay TC guardado para el mes, usa el TC más reciente del sistema como referencia
- El TC se usa para convertir todos los valores ARS a USD en el balance
- **IMPORTANTE:** El TC es independiente mes a mes (enero puede tener TC 1500, febrero 1600, etc.)

#### 2. Balance General Completo:
- **Caja y Bancos:**
  - Calculado desde `financial_accounts` + `ledger_movements`
  - Separa efectivo USD, efectivo ARS, bancos USD, bancos ARS
  - Convierte ARS a USD usando el TC del mes
- **Cuentas por Cobrar:**
  - **CONECTADO con `/api/accounting/debts-sales`** (misma lógica)
  - Obtiene operaciones con `operation_customers`
  - Calcula deuda = `sale_amount_total` - `sum(payments)`
  - Convierte ARS a USD usando TC histórico de la fecha de la operación
  - Muestra cantidad de deudores y detalle (top 10)
- **Cuentas por Pagar:**
  - **CONECTADO con tabla `operator_payments`** (misma fuente que "Pagos a Operadores")
  - Solo cuenta pagos con status `PENDING` o `OVERDUE`
  - Calcula deuda = `amount` - `paid_amount`
  - Convierte ARS a USD usando TC del mes
  - Muestra cantidad de acreedores y detalle (top 10)
- **Gastos a Pagar:**
  - Gastos recurrentes con `next_due_date` <= fecha de corte
  - Separa USD y ARS, convierte a USD

#### 3. Estado de Resultados del Mes:
- **Ingresos:** Suma de pagos de clientes (`payments` con `direction=INCOME`, `payer_type=CUSTOMER`, `status=PAID`) en el mes
- **Costos:** Suma de pagos a operadores (`operator_payments` con `status=PAID` y `paid_at` en el mes)
- **Gastos Operativos:** Suma de `ledger_movements` tipo `EXPENSE` sin `operation_id` en el mes
- **Resultado del Mes:** `Ingresos - Costos - Gastos`
- **Margen Bruto:** `(Ingresos - Costos) / Ingresos * 100`

#### 4. Verificación Contable:
- Muestra badge "Cuadrado" o "Descuadrado"
- Verifica que `ACTIVO = PASIVO + PATRIMONIO NETO`
- Tolerancia de 0.01 para diferencias por redondeo

#### 5. Conversión de Moneda (USD ↔ ARS):
- Por defecto muestra todo en USD
- Selector de moneda permite cambiar a ARS
- Al cambiar a ARS, muestra popup para ingresar TC personalizado
- Convierte todos los valores usando el TC ingresado
- El TC de referencia se muestra en los filtros

#### 6. Filtros y Navegación:
- Selector de período (mes/año) con calendario
- Selector de agencia (filtra por `agency_id`)
- Selector de moneda (USD/ARS)
- Botón "Actualizar" para refrescar datos
- Tabs: Balance General, Estado de Resultados, Detalle

**Conexión Integral con el Sistema:**
- ✅ **Cuentas por Cobrar** usa la misma lógica que "Deudores por Ventas" (`/api/accounting/debts-sales`)
- ✅ **Cuentas por Pagar** usa la misma tabla que "Pagos a Operadores" (`operator_payments`)
- ✅ **Caja y Bancos** usa `financial_accounts` + `ledger_movements` (misma fuente que resumen de caja)
- ✅ **Estado de Resultados** usa `payments` y `operator_payments` (mismas fuentes que reportes)

**Archivos Creados:**
- `app/api/accounting/monthly-exchange-rates/route.ts` - API para GET/POST de TC mensuales
- `supabase/migrations/087_create_monthly_exchange_rates.sql` - Tabla de TC mensuales

**Archivos Modificados:**
- `app/api/accounting/monthly-position/route.ts` - **REHECHO COMPLETAMENTE**
  - Nueva lógica de cálculo de Balance General
  - Conexión con `debts-sales` para cuentas por cobrar
  - Conexión con `operator_payments` para cuentas por pagar
  - Cálculo de Estado de Resultados del mes
  - Manejo robusto de NaN y valores nulos
  - Logs detallados para debugging
- `components/accounting/monthly-position-page-client.tsx` - **REHECHO COMPLETAMENTE**
  - Nueva UI con tabs (Balance General, Estado de Resultados, Detalle)
  - Selector de TC mensual editable con botón guardar
  - Conversión de moneda con popup
  - KPIs visuales (Total Activo, Total Pasivo, Patrimonio Neto, Resultado del Mes)
  - Tablas detalladas de deudores y acreedores
  - Manejo de NaN en formateo de moneda

**Migraciones de Base de Datos:**
- `supabase/migrations/087_create_monthly_exchange_rates.sql`
  ```sql
  CREATE TABLE IF NOT EXISTS monthly_exchange_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    usd_to_ars_rate NUMERIC(18,4) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(year, month)
  );
  ```

**Detalles Técnicos Importantes:**

1. **Cálculo de Cuentas por Cobrar:**
   - Obtiene `operations` con `operation_customers`
   - Obtiene `payments` de clientes (`direction=INCOME`, `payer_type=CUSTOMER`, `status=PAID`)
   - Agrupa pagos por `operation_id`
   - Convierte `sale_amount_total` a USD usando TC histórico de `departure_date` o `created_at`
   - Calcula deuda: `ventaUSD - cobradoUSD`
   - **Misma lógica que `/api/accounting/debts-sales`**

2. **Cálculo de Cuentas por Pagar:**
   - Obtiene `operator_payments` con status `PENDING` o `OVERDUE`
   - Calcula pendiente: `amount - paid_amount`
   - Convierte ARS a USD usando TC del mes
   - **Misma fuente que "Pagos a Operadores"**

3. **Manejo de NaN y Valores Nulos:**
   - Validación de `amount_usd`, `exchange_rate`, `amount` antes de calcular
   - Función `formatMoney` maneja `null`, `undefined` y `NaN`
   - Redondeo a 2 decimales para evitar problemas de precisión
   - Logs detallados en consola del servidor para debugging

4. **TC Mensual:**
   - Si existe TC para el mes seleccionado, se usa ese
   - Si no existe, se usa el TC más reciente del sistema
   - El TC se guarda con `upsert` (crea o actualiza)
   - Cada mes puede tener un TC diferente

**UI/UX:**
- Header con título, fecha de corte y badge de verificación contable
- Filtros en card superior: Período, Agencia, TC del Mes (editable), Moneda, Actualizar
- 4 KPIs visuales: Total Activo (verde), Total Pasivo (rojo), Patrimonio Neto (azul), Resultado del Mes (púrpura)
- Tabs para navegar: Balance General, Estado de Resultados, Detalle
- Balance General muestra Activo y Pasivo+PN lado a lado
- Estado de Resultados muestra ingresos, costos, gastos y resultado final
- Detalle muestra tablas de deudores y acreedores con información completa

**Errores Corregidos:**
- ✅ Cuentas por Cobrar ahora muestra correctamente los deudores (conectado con debts-sales)
- ✅ Cuentas por Pagar ahora muestra correctamente los acreedores (conectado con operator_payments)
- ✅ NaN en cálculos eliminado (validaciones y manejo de null/undefined)
- ✅ TC mensual ahora es independiente por mes (cada mes tiene su propio TC)
- ✅ Conversión de moneda funciona correctamente con popup de TC

---

#### Error: SelectItem sin value en Gastos Recurrentes
**Fecha:** 2025-01-17

**Problema:**
- Los filtros de mes y año en Gastos Recurrentes usaban `value=""` (string vacío)
- React Select no permite `value=""` en `SelectItem`, causando error: "A <Select.Item /> must have a value prop that is not an empty string"
- La aplicación no cargaba correctamente

**Solución:**
- Cambiado `value=""` a `value="ALL"` en filtros de mes y año
- Actualizada lógica de filtrado para manejar `"ALL"` correctamente
- Filtrado solo aplica cuando mes/año NO son `"ALL"`

**Archivos modificados:**
- `components/accounting/recurring-payments-page-client.tsx`

---

#### Error: Foreign key constraint en monthly_exchange_rates
**Fecha:** 2025-01-17

**Problema:**
- Error 500 al guardar tipo de cambio mensual
- `insert or update on table "monthly_exchange_rates" violates foreign key constraint "monthly_exchange_rates_created_by_fkey"`
- La migración 087 usaba `auth.users(id)` pero debería ser `users(id)`

**Solución:**
- Actualizada migración 087 para usar `users(id)` en lugar de `auth.users(id)`
- Mantiene consistencia con todas las demás migraciones del proyecto

**Archivos modificados:**
- `supabase/migrations/087_create_monthly_exchange_rates.sql`

**Nota:** La migración debe ejecutarse manualmente en Supabase SQL Editor si ya estaba en producción con la referencia incorrecta.

---

#### Error: SelectItem sin value en diálogos de Gastos Recurrentes
**Fecha:** 2025-01-18

**Problema:**
- Error de React Select: "A <Select.Item /> must have a value prop that is not an empty string"
- Los diálogos de crear/editar gasto recurrente usaban `<SelectItem value="">Sin categoría</SelectItem>`
- React Select no permite valores vacíos, causando que la aplicación no cargara correctamente
- Error aparecía al abrir cualquier página de Gastos Recurrentes

**Solución:**
- Cambiado `value=""` a `value="none"` en el SelectItem de categoría
- Actualizada lógica para convertir `"none"` a `null` antes de enviar al backend
- Actualizado schema de Zod para aceptar `"none"` como valor válido
- Actualizado valor por defecto del formulario para usar `"none"` en lugar de `null`

**Archivos modificados:**
- `components/accounting/new-recurring-payment-dialog.tsx`
- `components/accounting/edit-recurring-payment-dialog.tsx`

**Detalles técnicos:**
- En `onSubmit`: `category_id: values.category_id === "none" ? null : values.category_id`
- Schema actualizado: `category_id: z.string().optional().nullable()` (removida validación `.uuid()`)
- Valor por defecto: `category_id: "none"` en lugar de `null`

---

#### Mejora: Filtro por mes/año en Gastos Recurrentes con cálculo de vencimientos futuros
**Fecha:** 2025-01-18

**Problema:**
- El filtro por mes/año solo mostraba gastos cuyo `next_due_date` estaba exactamente en el mes seleccionado
- Un gasto mensual creado en enero no aparecía al filtrar por febrero, marzo, etc.
- Los usuarios esperaban ver todos los gastos que tendrían vencimientos en el mes seleccionado, no solo el próximo vencimiento

**Solución:**
- Implementada función `hasVencimientoInMonth` que calcula vencimientos futuros según la frecuencia:
  - **WEEKLY**: Suma 7 días
  - **BIWEEKLY**: Suma 14 días
  - **MONTHLY**: Suma 1 mes
  - **QUARTERLY**: Suma 3 meses
  - **YEARLY**: Suma 1 año
- La función calcula iterativamente todos los vencimientos futuros hasta encontrar uno en el mes seleccionado
- Límite de 120 iteraciones (máximo 10 años) para evitar loops infinitos
- Verifica tanto `next_due_date` como `start_date` para gastos nuevos

**Archivos modificados:**
- `components/accounting/recurring-payments-page-client.tsx`

**Ejemplo práctico:**
- Gasto mensual creado el 18/01/2026 con `start_date = 18/01/2026`
- Al filtrar por "Febrero 2026": Aparece (calcula que el 18/02/2026 es un vencimiento válido)
- Al filtrar por "Marzo 2026": Aparece (calcula que el 18/03/2026 es un vencimiento válido)

---

#### Corrección: Respeto de fecha fin (end_date) en filtro de Gastos Recurrentes
**Fecha:** 2025-01-18

**Problema:**
- Los gastos recurrentes con `end_date` (fecha de fin) seguían apareciendo en filtros de meses posteriores a la fecha de fin
- Ejemplo: Gasto con `end_date = 12/03/2026` aparecía al filtrar por "Mayo 2026" (incorrecto)
- El filtro no validaba si el mes seleccionado estaba después de la fecha de fin

**Solución:**
- Agregada validación temprana en `hasVencimientoInMonth`:
  - Si `end_date` existe y el primer día del mes seleccionado es después de `end_date`, retorna `false`
- Validación en cálculo de vencimientos:
  - Cada vencimiento calculado se verifica contra `end_date`
  - Si un vencimiento está después de `end_date`, no se considera válido
- Validación en `next_due_date`:
  - Si `next_due_date` existe pero está después de `end_date`, no se muestra

**Archivos modificados:**
- `components/accounting/recurring-payments-page-client.tsx`

**Ejemplo práctico:**
- Gasto mensual con `start_date = 18/01/2026` y `end_date = 12/03/2026`
- Al filtrar por "Enero 2026": Aparece ✅
- Al filtrar por "Febrero 2026": Aparece ✅
- Al filtrar por "Marzo 2026": Aparece ✅ (si hay un vencimiento antes del 12/03)
- Al filtrar por "Abril 2026": NO aparece ❌ (pasó la fecha de fin)
- Al filtrar por "Mayo 2026": NO aparece ❌ (pasó la fecha de fin)

---

### 2025-01-19

#### Error: Posición Contable Mensual no mostraba Cuentas por Cobrar (Deudores)
**Fecha:** 2025-01-19

**Problema:**
- La Posición Contable Mensual mostraba "0 deudores" cuando sí había deudores por ventas
- El cálculo de cuentas por cobrar no estaba conectado con la funcionalidad "Deudores por Ventas"
- Los valores mostraban `NaN` en la interfaz

**Solución:**
- Rehecho completamente el cálculo de cuentas por cobrar para usar la misma lógica que `/api/accounting/debts-sales`
- Obtiene operaciones con `operation_customers` y `customers`
- Obtiene pagos de clientes (`payments` con `direction=INCOME`, `payer_type=CUSTOMER`, `status=PAID`)
- Agrupa pagos por `operation_id` y calcula deuda correctamente
- Convierte ARS a USD usando TC histórico de la fecha de la operación
- Agregadas validaciones para evitar NaN (verifica `amount_usd`, `exchange_rate`, `amount` antes de calcular)
- Función `formatMoney` ahora maneja `null`, `undefined` y `NaN` correctamente

**Archivos modificados:**
- `app/api/accounting/monthly-position/route.ts` - Rehecho cálculo de cuentas por cobrar
- `components/accounting/monthly-position-page-client.tsx` - Agregado manejo de NaN en `formatMoney`

**Detalles técnicos:**
- Separadas las consultas: primero operaciones, luego pagos, luego clientes
- Validación de `operation_id` antes de procesar pagos
- Validación de `amount_usd`, `exchange_rate` y `amount` antes de calcular
- Redondeo a 2 decimales para evitar problemas de precisión
- Logs detallados en consola del servidor para debugging

---

#### Error: Posición Contable Mensual no mostraba Cuentas por Pagar (Acreedores)
**Fecha:** 2025-01-19

**Problema:**
- La Posición Contable Mensual mostraba "0 acreedores" cuando sí había pagos pendientes a operadores
- El cálculo de cuentas por pagar no estaba conectado con la funcionalidad "Pagos a Operadores"
- Usaba la tabla `payments` en lugar de `operator_payments`

**Solución:**
- Rehecho completamente el cálculo de cuentas por pagar para usar la tabla `operator_payments`
- Obtiene pagos con status `PENDING` o `OVERDUE`
- Calcula deuda pendiente: `amount - paid_amount`
- Convierte ARS a USD usando TC del mes
- Filtra por agencia si está seleccionada
- Agregadas validaciones para evitar NaN y valores inválidos

**Archivos modificados:**
- `app/api/accounting/monthly-position/route.ts` - Rehecho cálculo de cuentas por pagar

**Detalles técnicos:**
- Usa la misma fuente de datos que "Pagos a Operadores" (`operator_payments`)
- Solo cuenta pagos pendientes (status `PENDING` o `OVERDUE`)
- Respeta pagos parciales (`paid_amount`)
- Filtra por `agency_id` si está seleccionada
- Logs detallados para debugging

---

#### Error: TC Mensual no era independiente por mes
**Fecha:** 2025-01-19

**Problema:**
- El TC mensual no se guardaba correctamente
- No había forma de editar el TC de un mes específico
- El TC se usaba globalmente en lugar de ser independiente por mes

**Solución:**
- Implementada tabla `monthly_exchange_rates` con constraint `UNIQUE(year, month)`
- API `/api/accounting/monthly-exchange-rates` con GET (obtener TC del mes) y POST (guardar/actualizar TC)
- Input editable en la interfaz con botón "Guardar" (💾)
- El TC se guarda con `upsert` (crea si no existe, actualiza si existe)
- Cada mes puede tener su propio TC independiente
- Si no hay TC para el mes, usa el TC más reciente del sistema como referencia

**Archivos creados:**
- `app/api/accounting/monthly-exchange-rates/route.ts` - API completa de TC mensuales
- `supabase/migrations/087_create_monthly_exchange_rates.sql` - Tabla de TC mensuales

**Archivos modificados:**
- `components/accounting/monthly-position-page-client.tsx` - Input editable con botón guardar
- `app/api/accounting/monthly-position/route.ts` - Obtiene TC del mes o usa el más reciente

**Detalles técnicos:**
- El TC se guarda con `upsert` usando `onConflict: "year,month"`
- El TC se obtiene con `maybeSingle()` para manejar casos donde no existe
- El TC se muestra en el input si existe, o el TC más reciente como referencia
- Badge verde indica si el TC está guardado para el mes seleccionado

---

#### Error: TypeScript - Block-scoped variable used before declaration
**Fecha:** 2025-01-19

**Problema:**
- Error de compilación: `Block-scoped variable 'fetchOperations' used before its declaration`
- `handleDeleteConfirm` usaba `fetchOperations` antes de que estuviera declarado
- El deploy fallaba en Vercel

**Solución:**
- Reorganizado el orden de declaración de funciones
- `fetchOperations` ahora se declara antes de `handleDeleteConfirm`
- `handleDeleteClick` y `handleDeleteConfirm` se movieron después de `fetchOperations`

**Archivos modificados:**
- `components/operations/operations-table.tsx` - Reorganizado orden de funciones

---

#### Error: 404 al hacer click en leads desde búsqueda global
**Fecha:** 2025-01-19

**Problema:**
- Al buscar un lead y hacer click, la aplicación navegaba a `/sales?lead=...` que retornaba 404
- Los resultados de búsqueda no mostraban claramente el tipo (Cliente, Operación, Lead, etc.)
- El usuario no sabía qué tipo de resultado estaba abriendo

**Solución:**
1. **Corrección de ruta:**
   - Cambiada ruta de `/sales?lead=${id}` a `/sales/leads?leadId=${id}`
   - Creada página `/app/(dashboard)/sales/page.tsx` que redirige automáticamente rutas antiguas
   - Corregido link en `leads-table.tsx` de `/sales/leads/${id}` a `/sales/leads?leadId=${id}`

2. **Badges de tipo:**
   - Agregados badges visuales en cada resultado de búsqueda
   - Cada badge muestra: "Cliente", "Operación", "Operador", "Lead"
   - Badges con estilo `bg-muted text-muted-foreground` para distinguir visualmente

3. **Apertura automática de dialog:**
   - `LeadsPageClient` lee `leadId` de query params
   - Pasa `initialLeadId` a ambos kanbans (normal y Trello)
   - Los kanbans abren automáticamente el `LeadDetailDialog` cuando encuentran el lead
   - La URL se limpia automáticamente (se quita `leadId` de query params)

**Archivos creados:**
- `app/(dashboard)/sales/page.tsx` - Página de redirección para rutas antiguas

**Archivos modificados:**
- `components/command-menu.tsx` - Agregados badges de tipo, corregida ruta
- `components/sales/leads-page-client.tsx` - Manejo de `leadId` en query params
- `components/sales/leads-kanban.tsx` - Soporte para `initialLeadId` prop
- `components/sales/leads-kanban-trello.tsx` - Soporte para `initialLeadId` prop
- `components/sales/leads-table.tsx` - Link corregido a usar query params

**Detalles técnicos:**
- La página `/sales` es un server component que usa `redirect()` de Next.js
- Lee `searchParams.lead` y redirige a `/sales/leads?leadId=...`
- Si no hay `lead`, redirige a `/sales/leads`
- Los kanbans usan `useEffect` para abrir el dialog cuando `initialLeadId` está disponible y los leads están cargados
- El `router.replace()` limpia la URL sin recargar la página

---

#### Corrección: Warnings de Accesibilidad en DialogContent
**Fecha:** 2025-01-19

**Problema:**
- Los warnings sobre `DialogContent` faltando `DialogTitle` o `DialogDescription` son warnings de **accesibilidad de Radix UI**
- Estos warnings aparecían en desarrollo local (no en producción de Vercel)
- Afectaban la accesibilidad para usuarios con screen readers

**Solución Implementada:**
Se corrigieron todos los diálogos que faltaban `DialogTitle` o `DialogDescription`:

1. **`quick-whatsapp-button.tsx`:**
   - Agregado `DialogDescription` al diálogo de mensaje personalizado

2. **`partner-accounts-client.tsx`:**
   - Agregado `DialogDescription` al diálogo "Agregar Socio"
   - Agregado `DialogDescription` al diálogo "Registrar Retiro de Socio"

3. **`command.tsx`:**
   - Agregado `DialogHeader`, `DialogTitle` y `DialogDescription` ocultos con clase `sr-only` (screen reader only)
   - Esto mejora la accesibilidad sin afectar el diseño visual del Command Palette

**Archivos modificados:**
- `components/whatsapp/quick-whatsapp-button.tsx` - Agregado DialogDescription
- `components/accounting/partner-accounts-client.tsx` - Agregado DialogDescription a ambos diálogos
- `components/ui/command.tsx` - Agregado DialogHeader/DialogTitle/DialogDescription ocultos

**Detalles técnicos:**
- La clase `sr-only` oculta visualmente los elementos pero los mantiene accesibles para screen readers
- Todos los diálogos ahora cumplen con los estándares de accesibilidad de Radix UI
- Los warnings de desarrollo deberían desaparecer al ejecutar la aplicación localmente

---

## Correcciones Recientes

### 2025-01-17

#### Mejora: Cuentas Socios - Creación y Retiros
**Fecha:** 2025-01-17

**Descripción:**
Se mejoró completamente el módulo de Cuentas Socios para permitir creación de socios, registro de retiros, y que estos impacten correctamente en la caja y reportes financieros.

**Funcionalidades:**
- Crear socio (nombre, notas opcionales)
- Registrar retiro (socio, cuenta financiera, monto, moneda, fecha, descripción)
- El retiro impacta automáticamente en la caja:
  - Se crea un `ledger_movement` tipo `EXPENSE` en la cuenta financiera seleccionada
  - El balance de la cuenta se recalcula automáticamente (disminuye con EXPENSE)
  - Si hay $10,000 USD en efectivo y se retira $2,000 USD, quedan $8,000 USD
- Método de pago automático según tipo de cuenta financiera (CASH, BANK, MP, USD)

**Mejoras implementadas:**
- Mejorado manejo de errores en `handleCreatePartner` (frontend)
- Mejorado manejo de errores en `handleCreateWithdrawal` (frontend)
- Agregados logs detallados en API para depuración
- Mensajes de error más descriptivos
- Validación mejorada de campos (trim en nombre, validación de cuenta financiera)
- Método de pago automático según tipo de cuenta financiera seleccionada
- Tipo de cambio automático para retiros en USD

**Archivos modificados:**
- `components/accounting/partner-accounts-client.tsx` - Mejoras en UI y manejo de errores
- `app/api/partner-accounts/route.ts` - Logs mejorados y validación de nombre
- `app/api/partner-accounts/withdrawals/route.ts` - Método de pago según cuenta, logs mejorados

**Notas:**
- El botón "Nuevo Socio" solo aparece para usuarios con rol SUPER_ADMIN
- El retiro requiere cuenta financiera obligatoria (validado en frontend y backend)
- El retiro impacta inmediatamente en el balance de la cuenta financiera seleccionada
- El balance se calcula como: `initial_balance + SUM(ledger_movements)` donde EXPENSE resta
- Los retiros aparecen en reportes financieros y posición contable mensual

---

## Correcciones de Errores

### 2025-01-17

#### Error: Búsqueda Global no funcionaba correctamente
**Problema:** 
- La búsqueda no funcionaba la primera vez que se abría el dialog
- Los resultados no se mostraban aunque la API devolvía datos correctamente
- El filtrado interno de `cmdk` ocultaba resultados

**Solución:**
1. Eliminada instancia duplicada de `CommandMenu` en `layout.tsx`
2. Cambiado reset de estado de "al abrir" a "al cerrar" el dialog
3. Deshabilitado filtrado interno de `cmdk` con `shouldFilter={false}`
4. Mejorado timing de búsqueda para evitar condiciones de carrera

**Archivos modificados:**
- `components/command-menu.tsx`
- `components/ui/command.tsx`
- `app/(dashboard)/layout.tsx` (eliminada instancia duplicada)

---

#### Error: TypeScript compilation error en CommandMenu
**Problema:**
```
Type error: Argument of type '(open: any) => boolean' is not assignable to parameter of type 'boolean'
```

**Solución:**
- Refactorizado manejo de estado controlado/no controlado
- Agregado `internalOpen` y `setInternalOpen` para estado interno
- Creadas funciones `toggleOpen` y `closeOpen` con `useCallback`
- Corregidas dependencias de `useEffect` y `useCallback`

**Archivos modificados:**
- `components/command-menu.tsx`

---

### 2025-01-17

#### Error: Pagos no impactaban en la caja
**Problema:**
- Los pagos se registraban en RESULTADO (Ventas) pero NO en CAJA
- El balance de efectivo no se actualizaba al registrar pagos
- El código intentaba crear `cash_movements` obsoleto con campo `payment_id` que no existía

**Solución:**
1. Eliminado código obsoleto de creación de `cash_movements` en `payments/route.ts`
2. Agregada creación de `ledger_movement` en cuenta de CAJA además del de RESULTADO
3. El movimiento en CAJA se crea automáticamente al crear un pago con `status: "PAID"`

**Archivos modificados:**
- `app/api/payments/route.ts` - Eliminado cash_movements obsoleto, agregado movimiento en CAJA

---

#### Error: KPI de pagos sumaba incorrectamente monedas diferentes
**Problema:**
- El KPI mostraba USD 150,100 cuando se había pagado 150,000 ARS
- Estaba sumando `amount` directamente sin convertir ARS a USD
- Ejemplo: 150,000 ARS se sumaba como 150,000 USD (incorrecto)

**Solución:**
- KPI ahora calcula totales EN USD usando `amount_usd` si está disponible
- Si no hay `amount_usd`, calcula: USD = amount, ARS = amount / exchange_rate
- Todos los totales se muestran en USD con etiqueta "(USD)"
- Tabla de pagos muestra: Monto Original, Tipo de Cambio (T/C), Equiv. USD

**Archivos modificados:**
- `components/operations/operation-payments-section.tsx` - Cálculo correcto en USD
- `app/api/payments/route.ts` - Guardado de `amount_usd` en todos los pagos

---

#### Error: Cálculo de deudas mezclaba monedas incorrectamente
**Problema:**
- La lista de "Deudores por Ventas" mostraba USD 100 cuando la deuda era USD 1,200
- `sale_amount_total` en ARS se usaba directamente como USD
- Ejemplo: 200,000 ARS se mostraba como 200,000 USD (incorrecto)

**Solución:**
- API ahora busca `exchange_rate` histórico para fecha de la operación
- Convierte ARS a USD: `saleAmountUsd = saleAmount / exchangeRate`
- Todos los cálculos ahora se hacen correctamente en USD
- Ejemplo: 200,000 ARS / 1500 TC = 133.33 USD (correcto)

**Archivos modificados:**
- `app/api/accounting/debts-sales/route.ts` - Conversión correcta ARS a USD con exchange_rate histórico

---

### 2025-01-16

#### Error: PDF OCR retornaba "No se encontraron imágenes en el PDF"
**Problema:**
- La extracción de imágenes desde PDF fallaba en algunos casos

**Solución:**
- Mejorada función `extractImageFromPdf` con mejor manejo de recursos
- Mejorado fallback `extractImageFromRawPdf` para búsqueda directa en bytes
- Reducido umbral mínimo de tamaño de imagen a 5KB
- Agregado soporte para múltiples marcadores JPEG y PNG

**Archivos modificados:**
- `app/api/documents/ocr-only/route.ts`

---

## Cambios Técnicos

### Dependencias Agregadas

**2025-01-16:**
- `pdf-lib` - Para procesamiento y extracción de imágenes desde PDF

### Estructura de Archivos

**Nuevos componentes:**
- `components/command-menu.tsx` - Búsqueda global (Command Palette)

**Componentes modificados:**
- `components/site-header.tsx` - Agregado botón de búsqueda
- `components/ui/command.tsx` - Agregado prop `shouldFilter` a `CommandDialog`

---

## Migraciones de Base de Datos

### Migración 083: Tipo de Cambio y Monto USD en Pagos
**Archivo:** `supabase/migrations/083_add_exchange_rate_to_payments.sql`
**Fecha:** 2025-01-17

```sql
-- Agregar columna exchange_rate (tipo de cambio usado)
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,4);

-- Agregar columna amount_usd (monto equivalente en USD)
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS amount_usd NUMERIC(18,2);

-- Comentarios
COMMENT ON COLUMN payments.exchange_rate IS 'Tipo de cambio ARS/USD usado al momento del pago';
COMMENT ON COLUMN payments.amount_usd IS 'Monto equivalente en USD (para pagos en ARS: amount / exchange_rate, para USD: amount)';

-- Índice para búsquedas por monto USD
CREATE INDEX IF NOT EXISTS idx_payments_amount_usd ON payments(amount_usd) WHERE amount_usd IS NOT NULL;
```

### Migración 081: Códigos de Reserva en Operaciones
**Archivo:** `supabase/migrations/081_add_reservation_codes_to_operations.sql`
**Fecha:** 2025-01-17

```sql
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS reservation_code_air TEXT,
ADD COLUMN IF NOT EXISTS reservation_code_hotel TEXT;

CREATE INDEX IF NOT EXISTS idx_operations_reservation_code_air 
  ON operations(reservation_code_air) WHERE reservation_code_air IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operations_reservation_code_hotel 
  ON operations(reservation_code_hotel) WHERE reservation_code_hotel IS NOT NULL;
```

### Migración 087: Tipos de Cambio Mensuales
**Archivo:** `supabase/migrations/087_create_monthly_exchange_rates.sql`
**Fecha:** 2025-01-19

```sql
-- Tabla para almacenar tipos de cambio mensuales
-- Permite guardar un TC específico para cada mes/año
CREATE TABLE IF NOT EXISTS monthly_exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  usd_to_ars_rate NUMERIC(18,4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(year, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_exchange_rates_year_month 
ON monthly_exchange_rates(year, month);

COMMENT ON TABLE monthly_exchange_rates IS 'Tipos de cambio mensuales para la posición contable';
```

**Propósito:** 
- Permite configurar un tipo de cambio USD/ARS específico para cada mes/año
- Cada mes puede tener su propio TC independiente (ej: enero 1500, febrero 1600)
- Usado para dolarizar balances y cálculos en la Posición Contable Mensual
- Si no hay TC para un mes, se usa el TC más reciente del sistema como referencia

**Notas importantes:**
- **NO incluye campo `created_by`** - Se eliminó para evitar problemas de foreign key
- Constraint `UNIQUE(year, month)` asegura un solo TC por mes/año
- El TC se guarda con `upsert` (crea si no existe, actualiza si existe)
- El TC es independiente mes a mes (no hay herencia entre meses)

### Migración 086: Categorías en Gastos Recurrentes
**Archivo:** `supabase/migrations/086_add_category_id_to_recurring_payments.sql`
**Fecha:** 2025-01-17

```sql
-- Agregar columna category_id (nullable para mantener compatibilidad)
ALTER TABLE recurring_payments
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES recurring_payment_categories(id) ON DELETE SET NULL;

-- Índice para mejorar búsquedas por categoría
CREATE INDEX IF NOT EXISTS idx_recurring_payments_category ON recurring_payments(category_id) WHERE category_id IS NOT NULL;

-- Asignar categoría "Otros" a gastos existentes sin categoría
UPDATE recurring_payments
SET category_id = (SELECT id FROM recurring_payment_categories WHERE name = 'Otros' LIMIT 1)
WHERE category_id IS NULL;
```

### Migración 085: Tabla de Categorías de Gastos Recurrentes
**Archivo:** `supabase/migrations/085_create_recurring_payment_categories.sql`
**Fecha:** 2025-01-17

```sql
-- Crear tabla de categorías
CREATE TABLE IF NOT EXISTS recurring_payment_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar categorías predefinidas
INSERT INTO recurring_payment_categories (name, description, color) VALUES
  ('Servicios', 'Servicios básicos (luz, agua, gas, internet, telefonía)', '#3b82f6'),
  ('Alquiler', 'Alquiler de oficina o espacio físico', '#ef4444'),
  ('Marketing', 'Publicidad, redes sociales, promociones', '#10b981'),
  ('Salarios', 'Salarios y honorarios de empleados', '#f59e0b'),
  ('Impuestos', 'Impuestos y contribuciones', '#8b5cf6'),
  ('Otros', 'Gastos varios que no encajan en otras categorías', '#6b7280')
ON CONFLICT (name) DO NOTHING;
```

### Migración 084: Pagos Parciales en Operator Payments
**Archivo:** `supabase/migrations/084_add_paid_amount_to_operator_payments.sql`
**Fecha:** 2025-01-17

```sql
-- Agregar columna paid_amount (monto parcialmente pagado)
ALTER TABLE operator_payments
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(18,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN operator_payments.paid_amount IS 
  'Monto parcialmente pagado. Permite pagos parciales: si paid_amount < amount, el pago sigue siendo PENDING; si paid_amount >= amount, el pago puede marcarse como PAID.';

-- Índice para búsquedas de pagos parciales
CREATE INDEX IF NOT EXISTS idx_operator_payments_paid_amount 
  ON operator_payments(paid_amount) WHERE paid_amount > 0 AND paid_amount < amount;
```

### Migración 083: Tipo de Cambio y Monto USD en Pagos
**Archivo:** `supabase/migrations/083_add_exchange_rate_to_payments.sql`
**Fecha:** 2025-01-17

```sql
-- Agregar columna exchange_rate (tipo de cambio usado)
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,4);

-- Agregar columna amount_usd (monto equivalente en USD)
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS amount_usd NUMERIC(18,2);

-- Comentarios
COMMENT ON COLUMN payments.exchange_rate IS 'Tipo de cambio ARS/USD usado al momento del pago';
COMMENT ON COLUMN payments.amount_usd IS 'Monto equivalente en USD (para pagos en ARS: amount / exchange_rate, para USD: amount)';

-- Índice para búsquedas por monto USD
CREATE INDEX IF NOT EXISTS idx_payments_amount_usd ON payments(amount_usd) WHERE amount_usd IS NOT NULL;
```

### Migración 081: Códigos de Reserva en Operaciones
**Archivo:** `supabase/migrations/081_add_reservation_codes_to_operations.sql`
**Fecha:** 2025-01-17

```sql
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS reservation_code_air TEXT,
ADD COLUMN IF NOT EXISTS reservation_code_hotel TEXT;

CREATE INDEX IF NOT EXISTS idx_operations_reservation_code_air 
  ON operations(reservation_code_air) WHERE reservation_code_air IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operations_reservation_code_hotel 
  ON operations(reservation_code_hotel) WHERE reservation_code_hotel IS NOT NULL;
```

### Migración 080: Número de Trámite en Clientes
**Archivo:** `supabase/migrations/080_add_procedure_number_to_customers.sql`
**Fecha:** 2025-01-16

```sql
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS procedure_number TEXT;

COMMENT ON COLUMN customers.procedure_number IS 
  'Número de trámite del documento de identidad (DNI o Pasaporte)';
```

---

## Pendientes / Roadmap

### En desarrollo / Pendientes de cliente
- [ ] Eliminar check-in/check-out de operaciones
- [ ] Corregir validación de fechas
- [ ] Revisar comportamiento del diálogo en algunas operaciones
- [ ] Verificar terminología en toda la aplicación

### Mejoras futuras sugeridas
- [ ] Carga integrada de cliente y operación
- [ ] Descarga de planillas a Excel (DS por ventas y cuentas por pagar)
- [ ] Forma de cargar pagos con tarjeta de crédito
- [ ] Búsqueda exhaustiva en todo el sistema para conversión correcta ARS/USD (dashboard, reportes, tablas)

### Mejoras Completadas ✅
- [x] Cambiar moneda predeterminada a USD - **COMPLETADO** (2025-01-17)
- [x] Conversor de moneda en cobros y pagos - **COMPLETADO** (2025-01-17)
  - Campo exchange_rate obligatorio para ARS
  - Cálculo automático de amount_usd
  - Visualización de equivalente USD en tiempo real
- [x] Posición Contable Mensual profesional - **COMPLETADO** (2025-01-19)
  - Balance General completo (Activo, Pasivo, Patrimonio Neto)
  - Estado de Resultados del mes
  - TC mensual independiente por mes
  - Conexión integral con deudores por ventas y pagos a operadores
  - Conversión de moneda USD ↔ ARS
  - Verificación contable (Activo = Pasivo + PN)
- [x] Eliminación de operaciones - **COMPLETADO** (2025-01-19)
  - Botón de eliminar en tabla de operaciones
  - Confirmación con diálogo detallado
  - Eliminación en cascada de todos los datos relacionados
  - Cliente asociado se mantiene intacto

---

## Notas para Desarrollo

### Convenciones de Commits
- Usar prefijos descriptivos: `feat:`, `fix:`, `docs:`, `refactor:`, etc.
- Incluir detalles en el cuerpo del commit cuando sea necesario

### Testing
- Probar búsqueda global en diferentes escenarios (primera vez, búsquedas consecutivas)
- Verificar que los códigos de reserva se guardan y buscan correctamente
- Validar OCR con diferentes tipos de PDF e imágenes

### Documentación
- Actualizar este documento cada vez que se implemente una mejora o se corrija un error
- Mantener la estructura clara y organizada
- Incluir referencias a archivos y migraciones cuando sea relevante

---

**Mantenido por:** AI Assistant
**Para:** Migración a Vibook Services
