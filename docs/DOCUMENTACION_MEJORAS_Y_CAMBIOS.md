# Documentación de Mejoras y Cambios - ERP LOZADA

Este documento registra todas las mejoras, nuevas funcionalidades, correcciones y cambios realizados en la aplicación. Está diseñado para ser actualizado continuamente a medida que se implementan nuevas características o se solucionan problemas.

**Última actualización:** 2025-01-22 (Fixes post-auditoría finanzas y contabilidad)

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

**Fecha:** 2025-01-17 (Mejorado 2025-01-19)

**Descripción:**
Se implementó un sistema completo de pago masivo a operadores que permite registrar múltiples pagos en una sola transacción, con soporte para pagos parciales, conversión de moneda y desglose detallado por operación.

**Flujo de Uso (4 Pasos):**

#### Paso 1: Seleccionar Operador
- Selector dropdown con lista de todos los operadores disponibles
- Muestra confirmación visual cuando se selecciona un operador
- Mensaje: "✓ Operador seleccionado: [Nombre]"

#### Paso 2: Seleccionar Moneda
- Opciones: USD o ARS
- El sistema filtrará las deudas por la moneda seleccionada
- Muestra confirmación visual de la moneda elegida

#### Paso 3: Seleccionar Deudas a Pagar
- **Tabla de deudas pendientes** que muestra:
  - Operación (código y destino)
  - Monto Total
  - Monto Pagado (si hay pagos parciales previos)
  - Monto Pendiente
  - Fecha de Vencimiento
  - Monto a Pagar (editable)
- **Selección múltiple** con checkboxes individuales y "Seleccionar todos"
- **Montos editables** para pagos parciales (no puede superar el pendiente)
- **Badges visuales:**
  - 🟡 "Parcial" - si ya tiene pagos anteriores
  - 🔴 "Vencido" - si la fecha de vencimiento pasó
- **Mensaje cuando no hay deudas** con instrucciones de verificación

#### Paso 4: Información del Pago
- **Cuenta Financiera de Origen** - de dónde sale el dinero
- **Moneda del Pago** - puede diferir de la moneda de la deuda
- **Tipo de Cambio** - obligatorio si las monedas difieren
- **Número de Comprobante** - referencia de transferencia/recibo
- **Fecha de Pago**
- **Notas** (opcional)
- **Resumen del pago:**
  - Total de deudas seleccionadas
  - **Desglose por operación** (código, destino, monto a pagar, % si es parcial)
  - Total a pagar en moneda destino (si hay conversión)
  - Cantidad de deudas seleccionadas

**Funcionalidades Técnicas:**
- **Sin filtro de agencia:** El pago masivo muestra TODAS las deudas del operador sin importar la agencia, permitiendo pagar deudas de múltiples agencias en una sola transacción
- **Pagos parciales:** Permite pagar una parte de la deuda, actualizando `paid_amount`
- **Conversión de moneda:** Soporta pagar en ARS una deuda en USD y viceversa
- **Validaciones completas:**
  - Operador requerido
  - Moneda requerida
  - Al menos una deuda seleccionada
  - Cuenta financiera requerida
  - Tipo de cambio requerido si las monedas difieren
  - Número de comprobante requerido

**API de Pago Masivo (`POST /api/accounting/operator-payments/bulk`):**
- Recibe array de pagos con `payment_id` y `amount`
- Actualiza `paid_amount` en `operator_payments`
- Cambia status a `PAID` si `paid_amount >= amount`
- Crea `ledger_movements` en cuenta origen (EXPENSE) y RESULTADO/COSTOS
- Soporta conversión de moneda en pagos
- Retorna cantidad de pagos procesados exitosamente

**Archivos creados:**
- `components/accounting/bulk-payment-dialog.tsx` - Dialog completo de pago masivo con flujo de 4 pasos
- `app/api/accounting/operator-payments/bulk/route.ts` - API de pago masivo

**Archivos modificados:**
- `app/(dashboard)/accounting/operator-payments/page.tsx` - Carga de operadores y cuentas
- `components/accounting/operator-payments-page-client.tsx` - Botón "Cargar Pago Masivo" y badges
- `app/api/accounting/operator-payments/route.ts` - Logging mejorado para debug
- `lib/supabase/types.ts` - Tipos TypeScript actualizados con `paid_amount`

**Migraciones de base de datos:**
- `supabase/migrations/084_add_paid_amount_to_operator_payments.sql` - Campo `paid_amount` para pagos parciales

**Detalles técnicos:**
- Pagos parciales: `paid_amount` se actualiza y `status` cambia a PAID solo si `paid_amount >= amount`
- Conversión de moneda: Se calcula `amount_usd` y `amount_ars_equivalent` según el TC proporcionado
- Ledger movements: Se crean en la cuenta de origen (origen del pago) y en RESULTADO/COSTOS
- **Logging de debug:** Logs detallados en consola del navegador (`[BulkPayment]`) y servidor (`[OperatorPayments API]`) para troubleshooting

**UI/UX:**
- Flujo guiado paso a paso con confirmaciones visuales
- Badges de estado (Parcial, Vencido) para fácil identificación
- Desglose por operación en el resumen antes de confirmar
- Porcentaje de pago parcial mostrado cuando aplica
- Montos formateados con separadores de miles
- Estados de carga y validaciones en tiempo real

**Troubleshooting:**
Si no aparecen deudas para un operador:
1. Verificar que el operador tenga pagos con status `PENDING` o `OVERDUE`
2. Verificar que los pagos estén en la moneda seleccionada
3. Verificar que los pagos tengan deuda pendiente (`amount - paid_amount > 0`)
4. Revisar logs en consola: `[BulkPayment]` (frontend) y `[OperatorPayments API]` (backend)

### 11. Posición Contable Mensual - REHECHA DESDE CERO (Balance General Profesional)

**Fecha:** 2025-01-19

**Descripción:**
Se eliminó completamente la funcionalidad anterior de Posición Contable Mensual y se rehizo desde cero con una estructura contable profesional que incluye Balance General completo y Estado de Resultados del mes. La nueva implementación está completamente integrada con el resto del sistema (deudores por ventas, pagos a operadores, caja, etc.).

*Nota: Esta sección está documentada en detalle más abajo. Ver sección completa después de la sección 17.*

---

### 12. Filtros Avanzados para Cuentas por Pagar a Proveedores

**Fecha:** 2025-01-19

**Descripción:**
Se implementaron filtros avanzados en la página de "Cuentas por Pagar a Proveedores" (Pagos a Operadores) para permitir búsquedas y filtrado más específico de los pagos pendientes y realizados.

**Funcionalidades Implementadas:**

#### Filtros Disponibles:
1. **Filtro por Operador:**
   - Selector dropdown con lista de todos los operadores
   - Opción "Todos" para mostrar todos los operadores
   - Filtrado en tiempo real

2. **Filtro por Fecha de Vencimiento:**
   - Selector de rango de fechas usando `DateRangePicker`
   - Permite filtrar pagos por fecha de vencimiento (`due_date`)
   - Incluye presets rápidos (Hoy, Ayer, Esta semana, Este mes, etc.)
   - Filtrado desde/hasta con validación de fechas

3. **Filtro por Rango de Montos:**
   - Campo "Monto mínimo" para filtrar pagos con monto mayor o igual
   - Campo "Monto máximo" para filtrar pagos con monto menor o igual
   - Validación numérica en frontend
   - Filtrado en backend con conversión a número

4. **Búsqueda de Operación:**
   - Campo de texto para buscar por código de operación (`file_code`) o destino
   - Búsqueda case-insensitive
   - Búsqueda parcial (incluye texto en cualquier parte del código o destino)
   - Filtrado en tiempo real mientras se escribe

5. **Filtros Existentes (Mejorados):**
   - **Agencia:** Selector dropdown (ya existía)
   - **Estado:** Selector dropdown con opciones: Todos, Pendientes, Vencidos, Pagados (ya existía)

#### UI/UX:
- Grid responsive con 4 columnas en pantallas grandes
- Botón "Limpiar filtros" que aparece cuando hay filtros activos
- Los filtros se aplican automáticamente en tiempo real (no requiere botón "Aplicar")
- Layout organizado y fácil de usar

**Archivos Modificados:**
- `components/accounting/operator-payments-page-client.tsx`
  - Agregados estados para nuevos filtros: `operatorFilter`, `dueDateFrom`, `dueDateTo`, `amountMin`, `amountMax`, `operationSearch`
  - Agregado `DateRangePicker` para filtro de fechas
  - Agregados `Input` para monto mínimo, monto máximo y búsqueda de operación
  - Agregado selector de operador
  - Actualizado `useEffect` para incluir todos los filtros en la petición
  - Agregado botón "Limpiar filtros" con lógica para resetear todos los filtros
  - Grid responsive para mejor organización visual

- `app/api/accounting/operator-payments/route.ts`
  - Agregado soporte para parámetros: `operatorId`, `dueDateFrom`, `dueDateTo`, `amountMin`, `amountMax`, `operationSearch`
  - Filtrado por fecha de vencimiento usando `.gte()` y `.lte()` en Supabase
  - Filtrado por rango de montos en JavaScript (después de obtener datos)
  - Búsqueda de operación con filtrado case-insensitive en código y destino
  - Validación de valores numéricos para montos

**Detalles Técnicos:**
- Los filtros se combinan con lógica AND (todos deben cumplirse)
- Filtrado de fechas: `dueDateFrom` usa `.gte()` y `dueDateTo` usa `.lte()` con hora 23:59:59 para incluir todo el día
- Filtrado de montos: Se realiza en JavaScript después de obtener los datos para mayor flexibilidad
- Búsqueda de operación: Se filtra en JavaScript usando `.includes()` en código y destino
- El filtro de agencia se mantiene como estaba (filtrado en JavaScript después de obtener datos)

**Mejoras de Rendimiento:**
- Los filtros se aplican en tiempo real con `useEffect` que se ejecuta cuando cambia cualquier filtro
- Debounce implícito por el ciclo de renderizado de React
- Filtrado eficiente en backend para fechas y operador (índices de base de datos)
- Filtrado en frontend para montos y búsqueda (más flexible)

**Casos de Uso:**
- Buscar todos los pagos vencidos de un operador específico en un rango de fechas
- Encontrar pagos de alto monto pendientes
- Buscar pagos relacionados con una operación específica por código o destino
- Filtrar pagos por múltiples criterios simultáneamente

**Nota:** Esta funcionalidad complementa la exportación a Excel implementada anteriormente, permitiendo filtrar los datos antes de exportarlos.

### 12.1. Exportación a Excel para Cuentas por Pagar a Proveedores

**Fecha:** 2025-01-19

**Descripción:**
Se implementó la funcionalidad de exportación a Excel para la página de "Cuentas por Pagar a Proveedores" (Pagos a Operadores), permitiendo descargar un archivo Excel con dos hojas: un resumen por operador y el detalle completo de todos los pagos.

**Funcionalidades:**
- Botón "Exportar Excel" en la página principal
- Genera archivo Excel con nombre: `cuentas-por-pagar-YYYY-MM-DD.xlsx`
- Dos hojas en el archivo:
  1. **"Resumen por Operador":**
     - Operador
     - Total a Pagar
     - Moneda
     - Pagado
     - Pendiente
     - Cantidad Pagos
     - Vencidos
  2. **"Detalle Pagos":**
     - Código Operación
     - Destino
     - Operador
     - Monto Total
     - Moneda
     - Monto Pagado
     - Pendiente
     - Fecha Vencimiento
     - Estado
     - Fecha Pago
     - Parcial (Sí/No)

**Archivos Modificados:**
- `components/accounting/operator-payments-page-client.tsx`
  - Agregado import de `XLSX` (biblioteca xlsx)
  - Agregado import de icono `Download`
  - Implementada función `handleExportExcel()` que:
    - Agrupa pagos por operador para el resumen
    - Calcula totales, pagados, pendientes y vencidos
    - Genera dos hojas de Excel
    - Descarga el archivo con nombre con fecha
  - Agregado botón "Exportar Excel" en el header de la tabla
  - Botón deshabilitado cuando no hay pagos disponibles

**Detalles Técnicos:**
- Usa la biblioteca `xlsx` para generar archivos Excel
- El resumen agrupa pagos por `operator_id`
- Calcula automáticamente montos pagados, pendientes y cantidad de vencidos
- El detalle incluye toda la información relevante de cada pago
- El nombre del archivo incluye la fecha actual en formato `YYYY-MM-DD`
- Los filtros aplicados se respetan en la exportación (solo se exportan los pagos filtrados)

**Nota:** Esta funcionalidad se implementó antes de los filtros avanzados, pero funciona perfectamente con ellos, exportando solo los pagos que cumplen con los filtros aplicados.

### 13. Eliminación de Operaciones

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

### 14. Limpieza de Configuración de Operaciones

**Fecha:** 2025-01-19

**Descripción:**
Se eliminaron completamente los tabs de configuración innecesarios en "Configuración de Operaciones" para simplificar el sistema y eliminar funcionalidades que no se utilizaban o no funcionaban correctamente.

**Funcionalidades Eliminadas:**
1. **Tab "Estados" (statuses):**
   - Eliminada funcionalidad de estados personalizados
   - Eliminadas funciones: `addCustomStatus`, `removeCustomStatus`, `updateCustomStatus`
   - Eliminadas interfaces y constantes relacionadas (`CustomStatus`, `standardStatuses`, `statusColors`)
   - Los estados estándar del sistema (RESERVED, CONFIRMED, CANCELLED, TRAVELLING, TRAVELLED) se mantienen pero no son configurables

2. **Tab "Flujos de Trabajo" (workflows):**
   - Eliminado tab completo
   - La funcionalidad estaba marcada como "próximamente" y no se estaba utilizando

3. **Tab "Integraciones":**
   - Eliminado tab completo
   - **IMPORTANTE:** Los valores de integración contable (`auto_create_ledger_entry`, `auto_create_iva_entry`, `auto_create_operator_payment`) ahora están **siempre activos** (no configurables)
   - Estos valores se fuerzan a `true` tanto en frontend como en backend

4. **Card duplicado de Alertas:**
   - Eliminado el card "Configuración de Días" (el de abajo)
   - Dejado solo el card "Alertas Automáticas" con switches funcionales

**Tabs Restantes:**
- **Alertas:** Configuración de alertas automáticas con switches para activar/desactivar cada tipo
- **Validaciones:** Configuración de campos obligatorios al crear/editar operaciones

**Archivos Modificados:**
- `components/operations/operations-settings-page-client.tsx`
  - Eliminados tabs "Estados", "Flujos de Trabajo" e "Integraciones"
  - Eliminado card duplicado de alertas
  - Eliminadas funciones y código relacionado con estados personalizados
  - Actualizado `defaultTab` de `"statuses"` a `"alerts"`
  - Actualizada descripción de la página
  - Limpiados imports no utilizados
  - Función `saveSettings` ahora fuerza valores de integración contable a `true`

- `app/api/operations/settings/route.ts`
  - Actualizado para forzar `auto_create_ledger_entry`, `auto_create_iva_entry` y `auto_create_operator_payment` a `true` al guardar

**Detalles Técnicos:**
- Los valores de integración contable se fuerzan a `true` en:
  - Frontend: al guardar configuración (`saveSettings`)
  - Backend: al actualizar configuración (`PUT /api/operations/settings`)
- La configuración por defecto en la base de datos ya incluye estos valores en `true`
- El sistema ahora es más simple y directo: solo alertas y validaciones son configurables

**Nota:** La tabla `operation_settings` y sus campos se mantienen en la base de datos para compatibilidad, pero la UI ya no permite configurarlos.

---

### 15. Eliminación de Configuración de Clientes

**Fecha:** 2025-01-19

**Descripción:**
Se eliminó completamente la página de "Configuración de Clientes" del sidebar y del sistema, dejando todos los valores con sus configuraciones predeterminadas. La funcionalidad de configuración no tenía sentido y no se estaba utilizando.

**Funcionalidades Eliminadas:**
- Página `/customers/settings` eliminada
- Link "Configuración" eliminado del sidebar de "Base de Datos Clientes"
- Componente `CustomersSettingsPageClient` eliminado

**Valores Predeterminados Mantenidos:**
El sistema seguirá usando los valores predeterminados para:
- Validaciones: email y teléfono requeridos
- Notificaciones: vacío (sin notificaciones automáticas)
- Integraciones: auto_link con operaciones activado, auto_convert con leads desactivado
- Auto asignación de leads: desactivado
- Requerir documento: desactivado
- Verificación de duplicados: activado (por email y teléfono)

**Archivos Eliminados:**
- `app/(dashboard)/customers/settings/page.tsx` - Página de configuración eliminada
- `components/customers/customers-settings-page-client.tsx` - Componente eliminado

**Archivos Modificados:**
- `components/app-sidebar.tsx` - Eliminado link "Configuración" del submenú de clientes

**Nota:**
- La tabla `customer_settings` y la API `/api/customers/settings` se mantienen en la base de datos para compatibilidad
- El hook `use-customer-settings.ts` seguirá funcionando con valores por defecto si no hay configuración guardada
- Los valores predeterminados están hardcodeados en el código y no son configurables desde la UI

---

### 16. Reorganización del Sidebar y Eliminación de Notas

**Fecha:** 2025-01-19

**Descripción:**
Se reorganizó completamente la sección "Recursos" del sidebar, moviendo funcionalidades desde "Documentos" y eliminando completamente la funcionalidad de "Notas" del sistema.

**Cambios Realizados:**

1. **Eliminación de sección "Documentos":**
   - Sección "Documentos" eliminada completamente del sidebar
   - Sus items fueron movidos a "Recursos"

2. **Reorganización de "Recursos":**
   - Nueva estructura con el siguiente orden:
     1. Reportes
     2. Alertas
     3. Calendario
     4. Mensajes
     5. Templates
   - URL principal cambiada de `/resources/notes` a `/reports`

3. **Eliminación completa de "Notas":**
   - Página `/resources/notes` eliminada
   - Componente `NotesPageClient` eliminado
   - APIs eliminadas:
     - `GET/POST /api/notes`
     - `GET/PUT/DELETE /api/notes/[id]`
     - `GET/POST /api/notes/[id]/comments`
   - Link "Notas" eliminado del sidebar

**Archivos Eliminados:**
- `app/(dashboard)/resources/notes/page.tsx` - Página de notas
- `components/notes/notes-page-client.tsx` - Componente de notas
- `app/api/notes/route.ts` - API principal de notas
- `app/api/notes/[id]/route.ts` - API de nota individual
- `app/api/notes/[id]/comments/route.ts` - API de comentarios

**Archivos Modificados:**
- `components/app-sidebar.tsx`
  - Eliminada sección "Documentos"
  - Reorganizada sección "Recursos" con nuevo orden
  - Cambiada URL principal de Recursos a `/reports`
  - Eliminado link "Notas"

**Nota:**
- La tabla `notes` y sus tablas relacionadas (`note_comments`, `note_attachments`) se mantienen en la base de datos para compatibilidad
- La migración `068_create_notes.sql` NO se eliminó (las migraciones son históricas)
- No se cambió ninguna funcionalidad, solo se reorganizó la estructura del sidebar

---

### 17. Corrección de KPIs de Deudores y Deuda en Dashboard

**Fecha:** 2025-01-19

**Descripción:**
Se corrigieron los textos y el cálculo de los KPIs de "Deudores por Ventas" y "Deuda a Operadores" en el dashboard principal. Los KPIs ahora muestran los valores correctos usando la misma lógica que las páginas dedicadas.

**Problema Identificado:**
- Los cards mostraban "$0K" en ambos KPIs
- El endpoint `/api/analytics/pending-balances` calculaba desde las cuentas financieras del plan de cuentas, no desde las fuentes de datos reales
- Los textos no eran claros ("Pendientes Clientes" y "Por cobrar de clientes" eran confusos)

**Solución Implementada:**

1. **Corrección de Textos:**
   - **Card de Deudores:**
     - Título: "Pendientes Clientes" → "Deudores por Ventas"
     - Descripción: "Por cobrar de clientes" → "Pendientes de clientes"
   - **Card de Deuda:**
     - Título: "Pendientes Operadores" → "Deuda a Operadores"
     - Descripción: "Por pagar a operadores" → "Pendientes de operadores"

2. **Reescritura Completa del Endpoint `/api/analytics/pending-balances`:**
   - **Deudores por Ventas (accountsReceivable):**
     - Usa la misma lógica que `/api/accounting/debts-sales`
     - Obtiene todas las operaciones con sus clientes
     - Obtiene pagos de clientes (INCOME, CUSTOMER, PAID)
     - Calcula deuda = `sale_amount_total - sum(pagos_recibidos)`
     - Convierte ARS a USD usando tasas de cambio históricas de la fecha de la operación
     - Suma todas las deudas en USD
   - **Deuda a Operadores (accountsPayable):**
     - Usa la misma lógica que `/api/accounting/operator-payments`
     - Obtiene `operator_payments` con status `PENDING` o `OVERDUE`
     - Calcula pendiente = `amount - paid_amount`
     - Convierte ARS a USD usando tasa de cambio más reciente
     - Suma todos los pendientes en USD
   - Soporta filtro de agencia (si se especifica `agencyId` en query params)

3. **Actualización del Dashboard:**
   - Pasa el filtro de agencia al endpoint de pending-balances cuando está seleccionado
   - Los KPIs ahora respetan el filtro de agencia del dashboard

**Archivos Modificados:**
- `components/dashboard/dashboard-page-client.tsx`
  - Corregidos textos de los cards (títulos y descripciones)
  - Agregado paso de `agencyId` al endpoint de pending-balances
- `app/api/analytics/pending-balances/route.ts`
  - **REESCRITO COMPLETAMENTE**
  - Nueva lógica para calcular deudores por ventas desde operaciones y pagos
  - Nueva lógica para calcular deuda a operadores desde `operator_payments`
  - Conversión correcta de ARS a USD usando tasas de cambio históricas
  - Soporte para filtro de agencia

**Detalles Técnicos:**
- **Cálculo de Deudores por Ventas:**
  - Obtiene operaciones con `agency_id` en las agencias del usuario
  - Filtra por agencia si se especifica en query params
  - Obtiene pagos de clientes para esas operaciones
  - Convierte `sale_amount_total` a USD usando TC histórico de `departure_date` o `created_at`
  - Calcula deuda: `saleAmountUsd - paidUsd`
  - Suma todas las deudas en USD
- **Cálculo de Deuda a Operadores:**
  - Obtiene `operator_payments` con status `PENDING` o `OVERDUE`
  - Filtra por agencia si se especifica (a través de `operations.agency_id`)
  - Calcula pendiente: `amount - paid_amount`
  - Convierte ARS a USD usando TC más reciente
  - Suma todos los pendientes en USD
- Ambos cálculos retornan valores en USD para consistencia

**Resultado:**
- Los KPIs ahora muestran los valores correctos en USD
- Los valores coinciden con los mostrados en las páginas de "Deudores por Ventas" y "Pagos a Operadores"
- Los textos son más claros y descriptivos

**Mejora Adicional - Formato de Números Completos:**
- Se eliminó el formato abreviado (K/M/B) de todos los KPIs
- Ahora todos los valores se muestran en formato completo con separadores de miles
- Ejemplo: `$9K` → `$9,000`
- Función `formatNumber()` agregada para formatear números con `Intl.NumberFormat`
- Aplicado a: Ventas Totales, Margen Total, Deudores por Ventas, Deuda a Operadores

**Archivos Modificados Adicionales:**
- `components/dashboard/dashboard-page-client.tsx`
  - Agregada función `formatNumber()` para formatear números completos
  - Actualizado formato de todos los KPIs monetarios

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

#### Error: Pago Masivo no mostraba deudas pendientes del operador
**Fecha:** 2025-01-19

**Problema:**
- Al seleccionar un operador (ej: "Delfos Tour Op") y moneda en el dialog de Pago Masivo, el sistema mostraba "No se encontraron deudas pendientes"
- Los logs mostraban: `[BulkPayment] Total pagos recibidos: 0`
- El operador SÍ tenía deudas pendientes visibles en la tabla principal

**Causa raíz:**
- El componente `bulk-payment-dialog.tsx` estaba filtrando por la primera agencia del usuario (`agencies[0].id`)
- Si las deudas del operador estaban en una agencia diferente, no aparecían
- No había suficiente logging para diagnosticar el problema

**Solución:**
1. **Eliminado filtro de agencia** en el fetch de deudas del pago masivo
   - Ahora muestra TODAS las deudas del operador sin importar la agencia
   - Permite pagar deudas de múltiples agencias en una sola transacción

2. **Agregado logging detallado:**
   - Frontend (`[BulkPayment]`): logs de operador seleccionado, pagos recibidos, filtros aplicados
   - Backend (`[OperatorPayments API]`): logs de parámetros recibidos, pagos encontrados en DB

3. **Mejoras en UI:**
   - Mensaje de error más detallado con lista de verificación
   - Desglose por operación en el resumen del pago
   - Badges de "Parcial" y "Vencido" para identificar deudas fácilmente

**Archivos modificados:**
- `components/accounting/bulk-payment-dialog.tsx` - Removido filtro de agencia, mejorado UI y logging
- `app/api/accounting/operator-payments/route.ts` - Agregado logging detallado para debug

**Lecciones aprendidas:**
- Los filtros de agencia deben ser opcionales en operaciones de pago masivo
- El logging es crucial para diagnosticar problemas de datos
- Los mensajes de error deben incluir instrucciones de verificación

---

### 18. Mejora de Alineación de Filtros en Todo el Sistema

**Fecha:** 2025-01-19

**Descripción:**
Se realizó una refactorización completa de todos los componentes de filtros en el sistema para lograr una alineación consistente, diseño compacto y uniformidad visual. Todos los filtros ahora están en 1-2 líneas máximo y perfectamente alineados.

**Problema Identificado:**
- Los filtros tenían estructuras inconsistentes (algunos con divs flex internos para fechas, otros sin ellos)
- Los campos no estaban alineados verticalmente
- Los labels tenían tamaños diferentes
- Los separadores innecesarios causaban problemas visuales
- Los campos de fecha ocupaban demasiado espacio vertical

**Solución Implementada:**

1. **Separación de Campos de Fecha:**
   - Los campos "Desde" y "Hasta" ahora están en columnas individuales del grid
   - Se eliminaron todos los divs flex internos que causaban desalineación
   - Cada campo de fecha es una columna independiente

2. **Alineación Consistente:**
   - Todos los grids ahora usan `items-end` para alinear campos por la parte inferior
   - Esto asegura que todos los inputs estén al mismo nivel visual
   - Los labels están alineados, no solo los inputs

3. **Labels Unificados:**
   - Todos los labels usan `text-xs` para diseño compacto
   - Espaciado consistente con `space-y-1.5` en lugar de `space-y-2`
   - Labels más cortos donde sea posible (ej: "Venc. Desde" en lugar de "Rango de fechas (vencimiento)")

4. **Grids Optimizados:**
   - Grids configurados para 1-2 líneas máximo según tamaño de pantalla
   - Uso de breakpoints responsive: `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8`
   - Campos largos usan `col-span-2` cuando es necesario

**Archivos Modificados:**
- `components/dashboard/dashboard-filters.tsx` - Dashboard filters
- `components/accounting/debts-sales-page-client.tsx` - Deudores por Ventas filters
- `components/accounting/operator-payments-page-client.tsx` - Pagos a Operadores filters
- `components/operations/operations-filters.tsx` - Filtros de Operaciones
- `components/accounting/ledger-filters.tsx` - Libro Mayor filters
- `components/cash/cash-filters.tsx` - Caja filters
- `components/alerts/alerts-filters.tsx` - Alertas filters
- `components/reports/reports-filters.tsx` - Reportes filters

**Resultado:**
- ✅ Todos los filtros están perfectamente alineados
- ✅ Diseño compacto y uniforme en todo el sistema
- ✅ Campos de fecha no ocupan más espacio vertical que otros campos
- ✅ Mejor aprovechamiento del espacio horizontal
- ✅ UX consistente en todas las páginas

---

### 19. Reemplazo Completo de Inputs type="date" por DateInputWithCalendar

**Fecha:** 2025-01-19

**Descripción:**
Se reemplazaron todos los inputs nativos `type="date"` por el componente personalizado `DateInputWithCalendar` en todo el sistema para consistencia visual y mejor UX.

**Problema Identificado:**
- Algunos componentes aún usaban `Input type="date"` que causaba inconsistencias visuales
- Los inputs nativos tienen diferentes estilos según el navegador
- El componente `DateInputWithCalendar` ya estaba implementado pero no se usaba en todos lados
- Errores de TypeScript: `Date | undefined` no compatible con `string` en inputs nativos

**Solución Implementada:**

1. **Reemplazo en Debts Sales:**
   - Eliminados `Input type="date"` para filtros de fecha
   - Reemplazados por `DateInputWithCalendar` con validación de rango
   - Estado actualizado de `string` a `Date | undefined`

2. **Corrección de Estructura HTML:**
   - Eliminados divs anidados incorrectos
   - Botón "Limpiar filtros" correctamente posicionado
   - Actualizado onClick para usar `undefined` en lugar de `""`

**Archivos Modificados:**
- `components/accounting/debts-sales-page-client.tsx` - Reemplazados inputs de fecha

**Detalles Técnicos:**
- Estado de fechas cambiado de `string` a `Date | undefined`
- Validación de rango: "Hasta" no puede ser menor que "Desde"
- Placeholder unificado: "dd/MM/yyyy"
- Botón de limpiar actualizado para resetear a `undefined`

**Resultado:**
- ✅ Consistencia visual en todo el sistema
- ✅ Mejor UX con calendario integrado
- ✅ Validación de rangos de fechas
- ✅ Sin errores de TypeScript

---

### 20. Reordenamiento de Items en Contabilidad

**Fecha:** 2025-01-19

**Descripción:**
Se reordenaron los items del submenú "Contabilidad" en el sidebar según el feedback del cliente, colocando los elementos más importantes primero.

**Cambios Realizados:**
1. **Posición Mensual** - Movido al primer lugar (era el cuarto)
2. **Deudores por Ventas** - Movido al segundo lugar (era el primero)
3. **Pagos a Operadores** - Movido al tercer lugar (era el segundo)
4. **Gastos Recurrentes** - Movido al cuarto lugar (era el tercero)
5. Los demás items (Libro Mayor, IVA, Cuentas Financieras, Cuentas de Socios) mantienen su posición

**Archivos Modificados:**
- `components/app-sidebar.tsx` - Reordenados items del submenú "Contabilidad"

**Resultado:**
- Los elementos más críticos para la gestión contable ahora están al inicio del menú
- Mejor flujo de trabajo según importancia del cliente

---

### 21. Mejora de Deudores por Ventas (Vendedor y Cobranza)

**Fecha:** 2025-01-19

**Descripción:**
Se agregó la funcionalidad de filtrar y mostrar el vendedor en "Deudores por Ventas", y se corrigió un bug crítico donde las cobranzas con transferencia bancaria no pedían la cuenta receptiva.

**Funcionalidades Implementadas:**

#### 1. Filtro de Vendedor:
- Selector dropdown para filtrar por vendedor en la página de Deudores por Ventas
- Incluye todos los usuarios con rol `SELLER`, `ADMIN` o `SUPER_ADMIN` que estén activos
- Opción "Todos" para mostrar todos los vendedores
- El filtro se aplica automáticamente al cambiar la selección

#### 2. Columna Vendedor en Tabla:
- Agregada columna "Vendedor" en la tabla expandida de operaciones
- Muestra el nombre del vendedor o "Sin vendedor" si no tiene asignado
- La columna aparece después de "Destino" y antes de "Fecha Salida"

#### 3. Exportación a Excel con Vendedor:
- Agregada columna "Vendedor" en la hoja de detalle del Excel exportado
- Incluye el nombre del vendedor para cada operación con deuda

#### 4. Corrección de Bug: Cuenta Receptiva en Transferencias:
- **Problema:** Al marcar una cobranza como pagada con método "Transferencia bancaria", el sistema no pedía la cuenta receptiva donde entró el dinero, causando que la cobranza no impactara en el balance bancario.
- **Solución:** 
  - Agregado selector de "Cuenta Receptiva" en el dialog de marcar como pagado
  - El selector solo aparece cuando el método de pago es "Transferencia" y la dirección es "INCOME" (cobranza)
  - El selector muestra solo cuentas bancarias (CHECKING o SAVINGS) de la misma moneda que el pago
  - La cuenta seleccionada se guarda en `financial_account_id` del payment
  - El movimiento contable se registra en la cuenta seleccionada, impactando correctamente en el balance bancario

**Archivos Modificados:**
- `app/api/accounting/debts-sales/route.ts`
  - Agregado parámetro `sellerIdFilter` en query params
  - Modificado query para incluir `seller_id` en operaciones
  - Agregada lógica para obtener nombres de vendedores desde tabla `users`
  - Agregado filtro de vendedor en el procesamiento de operaciones
  - Agregado `seller_id` y `seller_name` a los datos retornados
- `app/(dashboard)/accounting/debts-sales/page.tsx`
  - Agregada obtención de vendedores desde la base de datos
  - Pasado prop `sellers` al componente cliente
- `components/accounting/debts-sales-page-client.tsx`
  - Agregado estado `sellerFilter` y `setSellerFilter`
  - Agregado `Select` component para filtrar por vendedor
  - Agregada columna "Vendedor" en la tabla expandida
  - Actualizado `fetchDebtors` para incluir `sellerFilter` en la API call
  - Actualizada exportación a Excel para incluir columna "Vendedor"
  - Removido `useEffect` que obtenía vendedores (ahora viene como prop)
- `components/payments/mark-paid-dialog.tsx`
  - Agregado estado `financialAccounts` y `financialAccountId`
  - Agregado `useEffect` para obtener cuentas financieras cuando el método es "Transferencia" y dirección es "INCOME"
  - Agregado `FormField` con `Select` para elegir cuenta receptiva
  - Agregada validación para requerir cuenta cuando método es "Transferencia"
  - Actualizado schema `markPaidSchema` para incluir `financial_account_id`
  - Actualizado `handleSubmit` para enviar `financialAccountId` al backend
  - Actualizado interface `Payment` para incluir `method` y `direction`
- `app/api/payments/mark-paid/route.ts`
  - Agregado `financialAccountId` al body del request
  - Modificado para usar la cuenta seleccionada cuando está disponible
  - Agregado `financial_account_id` al update del payment
  - Lógica para determinar qué cuenta usar: si es transferencia de ingreso y se proporcionó cuenta, usar esa; sino, usar cuenta por defecto
- `components/cash/payments-table.tsx`
  - Actualizado para pasar `selectedPayment`, `dialogOpen`, `setDialogOpen` y `onRefresh` al `MarkPaidDialog`
  - Removido código duplicado del dialog de confirmar pago

**Detalles Técnicos:**
- Los vendedores se obtienen desde la tabla `users` filtrando por roles `SELLER`, `ADMIN`, `SUPER_ADMIN` y `is_active = true`
- El filtro de vendedor se aplica en el backend antes de calcular las deudas
- La cuenta receptiva se valida que sea bancaria (CHECKING o SAVINGS) y de la misma moneda
- Si no se selecciona cuenta para transferencias, se muestra error de validación
- El movimiento contable se registra en la cuenta seleccionada, no en una cuenta por defecto

**Resultado:**
- ✅ Los usuarios pueden filtrar deudores por vendedor
- ✅ La tabla muestra claramente quién vendió cada operación
- ✅ El Excel exportado incluye información del vendedor
- ✅ Las cobranzas con transferencia bancaria ahora impactan correctamente en el balance bancario
- ✅ Mejor trazabilidad de las ventas por vendedor

---

### 22. Corrección de Conversión de Moneda en Pago a Operadores

**Fecha:** 2025-01-19

**Descripción:**
Se corrigió la funcionalidad de conversión de moneda en el dialog de "Cargar Pago Masivo" para operadores. Ahora el sistema detecta automáticamente cuando la cuenta seleccionada tiene una moneda diferente a la de las deudas y muestra el campo de tipo de cambio.

**Problema Identificado:**
- Al pagar un file en USD desde una cuenta en ARS, el sistema no pedía el tipo de cambio
- El campo de tipo de cambio solo aparecía cuando se cambiaba manualmente la "Moneda del Pago"
- Si se seleccionaba una cuenta bancaria en ARS para pagar deudas en USD, no se detectaba la necesidad de conversión

**Solución Implementada:**

1. **Detección Automática de Moneda de Cuenta:**
   - Cuando se selecciona una cuenta financiera, el sistema detecta automáticamente su moneda
   - Si la moneda de la cuenta es diferente a la moneda de las deudas (`selectedCurrency`), actualiza automáticamente `paymentCurrency` a la moneda de la cuenta
   - Esto asegura que el pago se registre en la moneda correcta

2. **Mejora de la Función `needsExchangeRate()`:**
   - Ahora verifica primero si la cuenta seleccionada tiene moneda diferente a las deudas
   - Si la cuenta tiene moneda diferente, retorna `true` automáticamente
   - También verifica si `paymentCurrency` es diferente a `selectedCurrency` como fallback

3. **Validación Mejorada:**
   - El campo de tipo de cambio se muestra automáticamente cuando hay conversión de moneda
   - La validación exige el tipo de cambio cuando `needsExchangeRate()` retorna `true`
   - Mensaje de error claro cuando falta el tipo de cambio

**Archivos Modificados:**
- `components/accounting/bulk-payment-dialog.tsx`
  - Agregado `useEffect` para actualizar `paymentCurrency` cuando se selecciona una cuenta con moneda diferente
  - Mejorada función `needsExchangeRate()` para verificar moneda de cuenta seleccionada
  - Validación mejorada que asegura tipo de cambio cuando es necesario

**Detalles Técnicos:**
- El `useEffect` se ejecuta cuando cambia `paymentAccountId`, `financialAccounts` o `selectedCurrency`
- Si la cuenta seleccionada tiene moneda diferente a `selectedCurrency`, actualiza `paymentCurrency` a la moneda de la cuenta
- `needsExchangeRate()` primero verifica la cuenta, luego compara `paymentCurrency` con `selectedCurrency`
- La validación en `handleSubmit` verifica `needsExchangeRate()` y exige `exchangeRate` si es necesario

**Resultado:**
- ✅ El sistema detecta automáticamente cuando se necesita conversión de moneda
- ✅ El campo de tipo de cambio aparece automáticamente cuando corresponde
- ✅ La validación asegura que se ingrese el tipo de cambio cuando es necesario
- ✅ Mejor UX: el usuario no necesita cambiar manualmente la moneda del pago

---

### 25. Correcciones de Errores de Build

**Fecha:** 2025-01-19

#### Error: Variable `cashAccountType` no definida en mark-paid route

**Problema:**
- Error de TypeScript: `Cannot find name 'cashAccountType'`
- La variable estaba declarada dentro del bloque `else`, pero se usaba fuera del bloque en `console.log`
- El build fallaba en Vercel

**Solución:**
- Declarada `cashAccountType` antes del bloque `if/else` con valor por defecto `"CASH"`
- Asignado `"BANK"` cuando se usa cuenta específica para transferencias (ya que se valida que sea bancaria)
- La variable ahora está disponible en ambos casos

**Archivos Modificados:**
- `app/api/payments/mark-paid/route.ts`

#### Error: Propiedad duplicada "Vendedor" en Excel export

**Problema:**
- Error de TypeScript: `An object literal cannot have multiple properties with the same name`
- La propiedad "Vendedor" estaba duplicada en el objeto literal del detalle de Excel
- El build fallaba en Vercel

**Solución:**
- Eliminada la propiedad duplicada "Vendedor" del objeto literal
- Se mantuvo solo una instancia de la propiedad

**Archivos Modificados:**
- `components/accounting/debts-sales-page-client.tsx`

**Resultado:**
- ✅ Build exitoso en Vercel
- ✅ Sin errores de TypeScript
- ✅ Funcionalidad preservada

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

### 2025-01-22

#### Fixes post-auditoría (finanzas y contabilidad)
**Contexto:** Tras la auditoría (`docs/AUDITORIA_SISTEMA_FINANZAS_CONTABILIDAD.md`) se aplicaron las correcciones prioritarias.

**Cambios:**
- **Pago masivo a operadores:** Validación de saldo (`validateSufficientBalance`) antes del batch; rechazo si la cuenta es CpC/CpP; total en moneda de la cuenta y redondeo con `roundMoney`.
- **DELETE movimiento de caja:** Uso de `ledger_movement_id` cuando existe; fallback por `operation_id` con `is("operation_id", null)`; invalidación de caché de balances tras borrar.
- **Migración 090:** Columna `ledger_movement_id` en `cash_movements`; el POST de movimientos la guarda y actualiza.
- **Helper `roundMoney`** en `lib/currency`; uso en movimientos y bulk.
- **Código muerto eliminado:** `calendar-01`, `calendar-04`, `data-table`, scripts `* 2.ts`.
- **`.gitignore`:** Añadido `/backups/`.
- **Sidebar Caja:** Enlaces a Movimientos y Pagos.
- **Deprecación:** Comentarios `@deprecated` en APIs `payment-coupons` y `card-transactions`.

**Testing:** `docs/WORKAROUND_TESTING_AUDITORIA.md` y `npm run test:audit-fixes`.

---

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

### 26. Implementación de Flujo de Pago para Gastos Recurrentes

**Fecha:** 2025-01-19

**Descripción:**
Se implementó un flujo completo para procesar pagos de gastos recurrentes directamente desde la página de "Gastos Recurrentes", permitiendo seleccionar la cuenta financiera de origen, manejar conversión de monedas, y actualizar automáticamente la próxima fecha de vencimiento.

**Funcionalidades Implementadas:**
- Botón "Pagar" en cada gasto recurrente de la tabla
- Dialog `PayRecurringExpenseDialog` para procesar pagos:
  - Selector de cuenta financiera con balance visible
  - Detección automática de necesidad de tipo de cambio
  - Campo de tipo de cambio cuando moneda del gasto difiere de la cuenta
  - Cálculo automático de monto equivalente en moneda de la cuenta
  - Selector de fecha de pago
  - Campo opcional de referencia/comprobante
- Crea movimiento en ledger tipo EXPENSE en la cuenta seleccionada
- Actualiza `next_due_date` y `last_generated_date` del gasto recurrente
- Impacta directamente en el balance de la cuenta financiera

**Archivos Creados:**
- `components/accounting/pay-recurring-expense-dialog.tsx` - Dialog completo de pago
- `app/api/recurring-payments/pay/route.ts` - API para procesar pagos de gastos recurrentes

**Archivos Modificados:**
- `components/accounting/recurring-payments-page-client.tsx` - Agregado botón "Pagar" y estado del dialog

**Detalles Técnicos:**
- La moneda del pago se determina automáticamente por la cuenta seleccionada
- Si el gasto está en ARS y se paga desde cuenta USD (o viceversa), se requiere tipo de cambio
- El movimiento se registra en la moneda de la cuenta seleccionada
- La próxima fecha de vencimiento se calcula usando `calculateNextDueDate` según la frecuencia del gasto

**Resultado:**
- ✅ Los usuarios pueden pagar gastos recurrentes directamente desde la tabla
- ✅ Conversión de moneda automática con validación de tipo de cambio
- ✅ Los pagos impactan correctamente en las cuentas financieras
- ✅ Mejor trazabilidad de pagos de gastos recurrentes

---

### 27. Conversor de Cambio para Retiros en Cuenta Socios

**Fecha:** 2025-01-19

**Descripción:**
Se agregó funcionalidad de conversión de moneda para retiros de socios cuando la moneda del retiro difiere de la moneda de la cuenta financiera seleccionada, similar al flujo de pago de gastos recurrentes.

**Funcionalidades Implementadas:**
- Campo de tipo de cambio que aparece automáticamente cuando:
  - La moneda del retiro es diferente a la moneda de la cuenta financiera
- Validación de tipo de cambio requerido cuando hay conversión
- Cálculo automático de monto equivalente en moneda de la cuenta
- Visualización de balance de cuenta en el selector
- El ledger movement se registra en la moneda de la cuenta (no en la del retiro)

**Archivos Modificados:**
- `components/accounting/partner-accounts-client.tsx`
  - Agregado estado `withdrawalExchangeRate`
  - Agregada lógica para detectar necesidad de conversión
  - Agregado campo de tipo de cambio condicional
  - Agregado cálculo y visualización de monto equivalente
  - Agregado balance de cuenta en selector
- `app/api/partner-accounts/withdrawals/route.ts`
  - Agregado `exchange_rate` al body del request
  - Validación de tipo de cambio cuando hay conversión
  - Cálculo de monto en moneda de la cuenta cuando hay conversión
  - Actualizado ledger movement para usar moneda de cuenta y monto convertido

**Detalles Técnicos:**
- Si retiro en ARS desde cuenta USD: monto en cuenta = monto retiro / TC
- Si retiro en USD desde cuenta ARS: monto en cuenta = monto retiro * TC
- El ledger movement siempre usa la moneda de la cuenta para consistencia contable
- El `amount_ars_equivalent` se calcula desde el monto en moneda de cuenta

**Resultado:**
- ✅ Los usuarios pueden retirar en una moneda diferente a la de la cuenta
- ✅ Conversión automática con validación de tipo de cambio
- ✅ Mejor UX con visualización de balance y monto equivalente
- ✅ Consistencia contable: ledger movements siempre en moneda de cuenta

---

### 28. División de Caja en 3 Secciones (Resumen, Caja USD, Caja ARS)

**Fecha:** 2025-01-19

**Fecha:** 2025-01-19

**Descripción:**
Se reestructuró completamente la página de Caja para dividirla en 3 secciones usando tabs: Resumen (todas las cuentas), Caja USD (cuentas individuales USD), y Caja ARS (cuentas individuales ARS). Cada cuenta individual muestra ingresos, egresos, balance y movimientos centralizados para reconciliación.

**Funcionalidades Implementadas:**

#### Tab 1: Resumen
- KPIs totales: Total ARS, Total USD, Efectivo ARS, Efectivo USD
- Desglose de totales: Efectivo y Bancos por moneda
- Gráfico de evolución de la caja (mantiene funcionalidad anterior)
- Lista de todas las cuentas financieras agrupadas por moneda

#### Tab 2: Caja USD
- Lista de todas las cuentas USD activas
- Para cada cuenta individual:
  - **Balance actual** (badge destacado)
  - **Ingresos** (suma de movimientos INCOME) - badge verde
  - **Egresos** (suma de movimientos EXPENSE) - badge rojo
  - **Balance** - badge azul
  - Botón "Ver Movimientos" para cargar movimientos del período
  - Tabla de movimientos centralizados con:
    - Fecha
    - Tipo (Ingreso/Egreso)
    - Concepto
    - Monto (con color según tipo)
    - Código de operación (si aplica)

#### Tab 3: Caja ARS
- Misma estructura que "Caja USD" pero para cuentas ARS

**Archivos Modificados:**
- `components/cash/cash-summary-client.tsx` - **REHECHO COMPLETAMENTE**
  - Agregado componente `Tabs` para las 3 secciones
  - Agregada función `fetchAccountMovements` para cargar movimientos por cuenta
  - Agregada función `calculateAccountStats` para calcular ingresos y egresos
  - Agregado estado `accountMovements` para almacenar movimientos por cuenta
  - Agregado estado `loadingMovements` para estados de carga individuales
  - Separadas cuentas USD y ARS usando `useMemo`
  - Carga lazy de movimientos: solo se cargan cuando el usuario hace click en "Ver Movimientos"
  - Filtrado de movimientos por cuenta y rango de fechas

**Detalles Técnicos:**
- Los movimientos se obtienen desde `/api/accounting/ledger?accountId=...&dateFrom=...&dateTo=...`
- Los ingresos se calculan sumando todos los movimientos tipo `INCOME`
- Los egresos se calculan sumando todos los movimientos tipo `EXPENSE`
- El balance actual viene de `financial_accounts.current_balance`
- Los movimientos se cargan bajo demanda para optimizar rendimiento
- Se limpian los movimientos cuando cambia el rango de fechas

**UI/UX:**
- Cards individuales para cada cuenta con información visual clara
- Badges de color para ingresos (verde), egresos (rojo), balance (azul)
- Tabla de movimientos con formato claro y colores según tipo
- Skeleton loaders durante carga
- Mensajes informativos cuando no hay cuentas o movimientos

**Resultado:**
- ✅ Caja dividida en 3 secciones claras y organizadas
- ✅ Cada cuenta individual muestra ingresos, egresos y balance
- ✅ Movimientos centralizados para reconciliación
- ✅ Mejor organización y visualización de información financiera
- ✅ Carga optimizada: movimientos bajo demanda

---

### 29. Corrección de Errores de TypeScript y Warnings de React Hooks

**Fecha:** 2025-01-19

**Descripción:**
Se corrigieron errores de TypeScript y warnings de React hooks que estaban causando fallos en los deploys de Vercel.

**Errores Corregidos:**

1. **Error de TypeScript en `cash-summary-client.tsx`:**
   - Error: `Argument of type 'string' is not assignable to parameter of type 'Currency'`
   - Problema: La interfaz `LedgerMovement` tenía `currency: string` pero `formatCurrency` espera `"ARS" | "USD"`
   - Solución: Actualizado tipo de `currency` en `LedgerMovement` interface a `"ARS" | "USD"`

2. **Warnings de React Hooks:**
   - `financial-accounts-page-client.tsx`: Missing dependency `fetchData`
   - `pay-recurring-expense-dialog.tsx`: Missing dependency `needsExchangeRate` y expresión compleja
   - `recurring-payments-page-client.tsx`: Missing dependencies `monthFilter` y `yearFilter`
   - `teams-page-client.tsx`: Missing dependency `loadTeams`
   - Solución: Agregados `eslint-disable-next-line` para useEffects de inicialización que deben ejecutarse solo una vez

**Archivos Modificados:**
- `components/cash/cash-summary-client.tsx` - Corregido tipo de `currency` en `LedgerMovement`
- `components/accounting/pay-recurring-expense-dialog.tsx` - Extraída lógica de `needsExchangeRate` del dependency array
- `components/accounting/financial-accounts-page-client.tsx` - Agregado eslint-disable
- `components/accounting/recurring-payments-page-client.tsx` - Agregado eslint-disable
- `components/teams/teams-page-client.tsx` - Agregado eslint-disable

**Resultado:**
- ✅ Build exitoso en Vercel
- ✅ Sin errores de TypeScript
- ✅ Warnings de React hooks suprimidos donde es apropiado

---

### 30. Corrección de Nombres de Vendedores en KPIs y Reportes

**Fecha:** 2025-01-19

**Descripción:**
Se corrigió un bug crítico donde los nombres de vendedores no aparecían en ningún KPI del sistema debido al uso incorrecto del campo `full_name` (que no existe) en lugar de `name` en varios endpoints de analytics.

**Problema Identificado:**
- Los KPIs y reportes mostraban "Vendedor" o "Sin asignar" en lugar de los nombres reales
- Los endpoints de estadísticas usaban `full_name` que no existe en la tabla `users`
- La tabla `users` tiene el campo `name`, no `full_name`
- Inconsistencia en los componentes: algunos esperaban `sellerName`, otros `name`

**Solución Implementada:**

1. **Corrección en `/api/operations/statistics/route.ts`:**
   - Cambiado `.select("id, full_name")` → `.select("id, name")`
   - Actualizado mapeo: `s.full_name` → `s.name`

2. **Corrección en `/api/sales/statistics/route.ts`:**
   - Cambiado `.select("id, full_name")` → `.select("id, name")`
   - Actualizado mapeo: `s.full_name` → `s.name`

3. **Mejora en `components/dashboard/sales-by-seller-chart.tsx`:**
   - Actualizada interfaz `SellerData` para aceptar tanto `name` como `sellerName` (compatibilidad)
   - Agregado fallback: `seller.name || seller.sellerName || "Sin nombre"`
   - Soporta ambos campos para mayor robustez

4. **Logging de Debug:**
   - Agregado logging temporal en `/api/analytics/sellers/route.ts` para diagnosticar problemas
   - Logs muestran cantidad de vendedores encontrados y sus nombres

**Archivos Modificados:**
- `app/api/operations/statistics/route.ts` - Corregido campo `full_name` → `name`
- `app/api/sales/statistics/route.ts` - Corregido campo `full_name` → `name`
- `components/dashboard/sales-by-seller-chart.tsx` - Soporte para múltiples formatos de nombre
- `app/api/analytics/sellers/route.ts` - Agregado logging de debug

**Detalles Técnicos:**
- La tabla `users` tiene el campo `name` (TEXT NOT NULL)
- Los endpoints de reportes (`/api/reports/sales`, `/api/reports/margins`) ya usaban correctamente `sellers:seller_id(id, name)`
- El problema estaba específicamente en los endpoints de estadísticas (`/api/operations/statistics`, `/api/sales/statistics`)
- El endpoint `/api/analytics/sellers` ya estaba correcto, pero se agregó logging para facilitar debugging

**Resultado:**
- ✅ Los nombres de vendedores ahora aparecen correctamente en todos los KPIs
- ✅ Dashboard muestra nombres reales en gráficos de ventas por vendedor
- ✅ Top Vendedores muestra nombres correctos
- ✅ Estadísticas de operaciones y ventas muestran vendedores con nombres
- ✅ Reportes muestran nombres correctamente (ya funcionaban)
- ✅ Mayor robustez en componentes con soporte para múltiples formatos

---

### 31. Conversor de Moneda en Deudores por Ventas

**Fecha:** 2025-01-19

**Descripción:**
Se implementó un conversor de moneda en el dialog de "Marcar como Pagado" para cobranzas de clientes, que detecta automáticamente cuando la moneda del pago difiere de la moneda de la operación y solicita el tipo de cambio obligatorio.

**Problema Identificado:**
- Si se cargaba una cobranza en pesos para una operación en dólares, el sistema no pedía tipo de cambio
- No había conversión de moneda al marcar pagos como pagados desde "Deudores por Ventas"
- Los movimientos contables no reflejaban correctamente la conversión cuando las monedas diferían

**Solución Implementada:**

1. **Detección Automática de Conversión:**
   - El dialog obtiene automáticamente la moneda de la operación al abrirse
   - Compara la moneda del pago (`payment.currency`) con la moneda de la operación
   - Para cobranzas (INCOME): usa `operation.sale_currency`
   - Para pagos a operadores (EXPENSE): usa `operation.operator_cost_currency`
   - Si las monedas difieren, muestra el campo de tipo de cambio obligatorio

2. **Campo de Tipo de Cambio:**
   - Aparece automáticamente cuando `payment.currency !== operation_currency`
   - Muestra conversión en tiempo real: "Equivale a [MONEDA_OPERACION] X.XX"
   - Validación: tipo de cambio requerido cuando hay conversión
   - Mensaje claro explicando por qué se necesita el TC

3. **Actualización del Payment:**
   - Guarda `exchange_rate` en el payment cuando se proporciona
   - Calcula `amount_usd` automáticamente: `amount / exchange_rate` para ARS, `amount` para USD
   - El API usa el `exchange_rate` proporcionado en todos los movimientos contables

**Archivos Modificados:**
- `components/payments/mark-paid-dialog.tsx`
  - Agregado estado `operationCurrency` y `loadingOperation`
  - Agregado `useEffect` para obtener moneda de la operación desde `/api/operations/[id]`
  - Agregado `useMemo` para calcular `needsExchangeRate`
  - Agregado campo de tipo de cambio condicional con validación
  - Actualizado schema para incluir `exchange_rate` opcional
  - Actualizado `handleSubmit` para validar y enviar `exchange_rate`
- `app/api/payments/mark-paid/route.ts`
  - Agregado `exchange_rate` al body del request
  - Actualizada lógica para priorizar `exchange_rate` del frontend sobre cálculo automático
  - Cálculo de `amount_usd` cuando se proporciona `exchange_rate`
  - Actualizado `update` del payment para guardar `exchange_rate` y `amount_usd`
  - Actualizados todos los `createLedgerMovement` para usar `exchange_rate` proporcionado

**Detalles Técnicos:**
- Si el pago es en ARS y la operación en USD: `amount_usd = amount / exchange_rate`
- Si el pago es en USD y la operación en ARS: `exchange_rate` se usa para calcular `amount_ars_equivalent`
- El `exchange_rate` proporcionado tiene prioridad sobre el cálculo automático del sistema
- Si no se proporciona `exchange_rate` y el pago es en USD, el sistema calcula automáticamente desde la tabla de exchange rates

**Resultado:**
- ✅ El sistema detecta automáticamente cuando se necesita conversión de moneda
- ✅ Campo de tipo de cambio aparece solo cuando es necesario
- ✅ Validación asegura que se ingrese TC cuando corresponde
- ✅ Conversión en tiempo real muestra el equivalente en moneda de operación
- ✅ Los movimientos contables reflejan correctamente la conversión

---

### 32. Ajuste de Resumen de Caja - Solo Saldos de Cuentas

**Fecha:** 2025-01-19

**Descripción:**
Se simplificó el tab "Resumen" de Caja para mostrar únicamente los saldos de todas las cuentas financieras, eliminando KPIs agregados y gráficos generales que no permitían control ni conciliación bancaria.

**Problema Identificado:**
- El resumen mostraba KPIs agregados (Total ARS, Total USD, Efectivo ARS, Efectivo USD)
- Incluía un gráfico de evolución general que no permitía control específico
- Mostraba ingresos y egresos por separado de forma agregada
- No permitía conciliación bancaria porque no estaba asociado a cuentas específicas

**Solución Implementada:**

1. **Eliminación de KPIs Agregados:**
   - Removidos los 4 cards de KPIs (Total ARS, Total USD, Efectivo ARS, Efectivo USD)
   - Eliminados los desgloses agregados de efectivo y bancos

2. **Eliminación del Gráfico General:**
   - Removido el gráfico de "Evolución de la Caja" del resumen
   - Los gráficos de evolución están disponibles en los tabs "Caja USD" y "Caja ARS" para análisis detallado

3. **Resumen Simplificado:**
   - Ahora muestra SOLO la lista de todas las cuentas financieras con sus saldos
   - Agrupadas por moneda: Cuentas USD y Cuentas ARS
   - Cada cuenta muestra: Nombre, Tipo, Saldo actual
   - Formato claro y conciso para rápida visualización

**Archivos Modificados:**
- `components/cash/cash-summary-client.tsx`
  - Eliminada sección de KPIs agregados (4 cards)
  - Eliminado gráfico de evolución general
  - Mantenida solo la lista de cuentas financieras con saldos
  - Simplificado el tab "Resumen" para mostrar únicamente información de saldos

**Detalles Técnicos:**
- El tab "Resumen" ahora es equivalente a "Cuentas Financieras" - solo muestra saldos
- Los tabs "Caja USD" y "Caja ARS" mantienen funcionalidad completa con:
  - Ingresos y egresos por cuenta individual
  - Movimientos centralizados para reconciliación
  - Gráficos de evolución (si se requieren en el futuro)

**Resultado:**
- ✅ Resumen muestra solo información esencial: saldos de cuentas
- ✅ Permite control y conciliación bancaria (cada cuenta está identificada)
- ✅ Información asociada a cuentas específicas, no agregados generales
- ✅ Interfaz más limpia y enfocada en lo esencial
- ✅ Mejor UX para reconciliación: fácil identificar cada cuenta y su saldo

---

### 33. Verificación de Conversor de Moneda en Pagos a Operadores y Mejora de Claridad en Gastos Recurrentes

**Fecha:** 2025-01-19

**Descripción:**
Se verificó que el conversor de moneda funciona correctamente en todos los puntos de pago a operadores, y se mejoró la claridad del flujo en Gastos Recurrentes agregando explicaciones visuales.

#### **Verificación de Conversor en Pagos a Operadores:**

**Estado Verificado:**
- ✅ **Bulk Payment Dialog** (`bulk-payment-dialog.tsx`): Ya tiene conversor de moneda cuando cuenta difiere de deuda
- ✅ **Mark Paid Dialog** (`mark-paid-dialog.tsx`): Conversor agregado recientemente funciona tanto para cobranzas (INCOME) como para pagos a operadores (EXPENSE)
  - Para INCOME: compara con `operation.sale_currency`
  - Para EXPENSE: compara con `operation.operator_cost_currency`
- ✅ **API mark-paid** (`/api/payments/mark-paid`): Acepta y procesa `exchange_rate` correctamente

**Resultado:**
- ✅ Todos los puntos de entrada para pagos a operadores tienen conversor de moneda
- ✅ Validación consistente en frontend y backend
- ✅ Conversión correcta en todos los movimientos contables

#### **Mejora de Claridad en Gastos Recurrentes:**

**Problema Identificado:**
- El cliente reportó: "no entiendo bien la funcionalidad, por un lado se carga el gasto, por otro el pago del gasto"
- No estaba claro el flujo entre crear un gasto recurrente y pagarlo

**Solución Implementada:**

1. **Tooltip de Ayuda en Header:**
   - Agregado icono de ayuda (`HelpCircle`) junto al título "Gastos Recurrentes"
   - Tooltip explicativo que aclara:
     - **Crear Gasto:** Define un gasto que se repetirá automáticamente (ej: alquiler mensual, servicios)
     - **Pagar Gasto:** Procesa el pago cuando el gasto está vencido, impactando en tu caja

2. **Descripción Mejorada:**
   - Cambiado de "Gestión de pagos automáticos a proveedores" a "Define gastos recurrentes y procesa sus pagos cuando correspondan"
   - Descripción más clara y específica

3. **Botón Más Descriptivo:**
   - Cambiado de "Nuevo Pago" a "Nuevo Gasto Recurrente"
   - Deja claro que se está creando un gasto futuro, no procesando un pago inmediato

4. **Dialog de Pago Más Explicativo:**
   - Actualizada descripción en `PayRecurringExpenseDialog`:
     - Ahora menciona que el pago impactará en la caja
     - Explica que actualizará automáticamente la próxima fecha de vencimiento

**Archivos Modificados:**
- `components/accounting/recurring-payments-page-client.tsx`
  - Agregado import de `HelpCircle`, `Info`, y componentes `Tooltip`
  - Agregado tooltip explicativo en el header
  - Mejorada descripción de la página
  - Cambiado texto del botón "Nuevo Pago" → "Nuevo Gasto Recurrente"
- `components/accounting/pay-recurring-expense-dialog.tsx`
  - Mejorada `DialogDescription` con explicación más detallada del proceso

**Resultado:**
- ✅ Flujo más claro: crear gasto vs pagar gasto está bien diferenciado
- ✅ Usuarios entienden mejor cómo funciona el sistema
- ✅ Mejor UX con tooltips informativos
- ✅ Textos más descriptivos en toda la sección

---

### 34. Sistema de Distribución de Ganancias a Socios y Tracking de Deudas

**Fecha:** 2025-01-19

**Descripción:**
Se implementó un sistema completo para distribuir ganancias mensuales entre socios según porcentajes asignados y rastrear las deudas de socios que gastaron más de lo asignado.

**Funcionalidades Implementadas:**

#### 1. Distribución de Ganancias desde Posición Mensual:
- **Campo de porcentaje en socios:** Agregado campo `profit_percentage` (0-100%) en tabla `partner_accounts`
- **Botón "Distribuir a Socios"** en el card de "Resultado del Mes" cuando hay ganancias positivas
- **Dialog de distribución** (`DistributeProfitsDialog`) que muestra:
  - Vista previa de distribución según porcentajes asignados
  - Validación que la suma de porcentajes sea 100%
  - Tabla con socio, porcentaje y monto asignado
  - Confirmación antes de distribuir
- **API de distribución** (`/api/partner-accounts/distribute-profits`) que:
  - Valida que la suma de porcentajes sea 100%
  - Verifica que no se haya distribuido ya para el mes/año
  - Crea asignaciones en tabla `partner_profit_allocations` para cada socio
  - Guarda monto, moneda (USD), tipo de cambio y período

#### 2. Tracking de Deuda de Socios:
- **Cálculo automático de deuda:** Si un socio retira más de lo asignado, aparece como deudor
- **Integración en Posición Mensual:** La deuda de socios se incluye en "Cuentas por Cobrar - Socios"
- **Detalle por socio:** Muestra asignado, retirado y deuda pendiente
- **Cálculo hasta fecha de corte:** Considera todas las asignaciones y retiros hasta el último día del mes

**Archivos Creados:**
- `supabase/migrations/088_partner_profit_allocations.sql` - Migración para tabla de asignaciones y campo de porcentaje
- `app/api/partner-accounts/distribute-profits/route.ts` - API para distribuir ganancias (GET/POST)
- `components/accounting/distribute-profits-dialog.tsx` - Dialog de distribución de ganancias

**Archivos Modificados:**
- `components/accounting/monthly-position-page-client.tsx`
  - Agregado botón "Distribuir a Socios" en card de Resultado del Mes
  - Integrado `DistributeProfitsDialog`
  - Solo visible para SUPER_ADMIN, ADMIN y CONTABLE
  - Solo aparece si hay ganancias positivas
- `app/api/accounting/monthly-position/route.ts`
  - Agregado cálculo de deuda de socios (withdrawn > allocated)
  - Integrado en "Cuentas por Cobrar" como subsección "socios"
  - Incluye detalle de deuda por socio con asignado, retirado y deuda
- `components/accounting/partner-accounts-client.tsx`
  - Agregado campo "Porcentaje de Ganancias (%)" en formulario de crear socio
  - Mostrado porcentaje en tarjetas de socios (badge)
  - Validación de porcentaje (0-100)
- `app/api/partner-accounts/route.ts`
  - Agregado `profit_percentage` al crear socio
  - Validación de rango (0-100)

**Detalles Técnicos:**

#### Tabla `partner_profit_allocations`:
- Campos principales: `partner_id`, `year`, `month`, `profit_amount`, `currency`, `exchange_rate`, `status`
- Status: `ALLOCATED` (asignado pero no retirado) o `WITHDRAWN` (retirado completamente)
- Constraint `UNIQUE(partner_id, year, month)` para evitar duplicados
- Referencia opcional a `monthly_position_id` para trazabilidad futura

#### Cálculo de Deuda:
1. Obtiene todas las asignaciones de ganancias hasta la fecha de corte
2. Obtiene todos los retiros hasta la fecha de corte
3. Agrupa por socio y convierte todo a USD (usando exchange_rate si aplica)
4. Calcula: `deuda = total_retirado - total_asignado`
5. Si `deuda > 0`, aparece en "Cuentas por Cobrar - Socios"

#### Validaciones:
- Porcentajes de socios deben sumar 100% para poder distribuir
- No se puede distribuir dos veces para el mismo mes/año
- El monto de ganancia debe ser positivo
- El tipo de cambio es obligatorio

**UI/UX:**
- Dialog informativo con vista previa clara
- Validación en tiempo real de suma de porcentajes
- Badge de porcentaje visible en tarjetas de socios
- Mensajes de error descriptivos
- Solo aparece botón cuando corresponde (ganancias positivas + permisos)

**Resultado:**
- ✅ Los usuarios pueden distribuir ganancias mensuales entre socios desde Posición Mensual
- ✅ Los socios pueden tener porcentajes de ganancias configurados
- ✅ El sistema rastrea automáticamente si un socio gastó más de lo asignado
- ✅ Las deudas de socios aparecen correctamente en Posición Mensual como activo
- ✅ Mejor control y trazabilidad de distribución de ganancias

**Correcciones de Build:**
- ✅ Corregido error TypeScript: agregado `is_active?: boolean` a interfaz `Partner` en `distribute-profits-dialog.tsx`
- ✅ Corregido warning React Hook: convertido `loadPartners` a `useCallback` con dependencias correctas
- ✅ Escapadas comillas dobles en mensajes de error usando `&quot;`
- ✅ Build exitoso en Vercel sin errores

---

### 35. Conversión de Moneda USD a ARS en Facturación AFIP

**Fecha:** 2025-01-19

**Descripción:**
Se implementó la funcionalidad completa para facturar en pesos argentinos operaciones que están en dólares, cumpliendo con la normativa AFIP/ARCA para conversión de moneda en facturación electrónica.

**Funcionalidades Implementadas:**

#### 1. Detección Automática de Moneda de Operación:
- Al seleccionar una operación en el formulario de factura, el sistema detecta automáticamente su moneda
- Si la operación está en USD, se muestra un panel especial con opciones de conversión
- El sistema carga automáticamente el tipo de cambio del día hábil anterior (según normativa AFIP/ARCA)

#### 2. Selector de Moneda de Facturación:
- **Pesos Argentinos (ARS)**: Convierte automáticamente desde USD usando tipo de cambio
- **Dólares (USD)**: Factura directamente en dólares sin conversión
- El selector solo aparece cuando la operación está en USD

#### 3. Gestión de Tipo de Cambio:
- Carga automática del TC del día hábil anterior desde `/api/exchange-rates?date=[fecha]`
- Fallback al TC más reciente si no hay TC del día anterior
- Campo editable para permitir usar un TC diferente si es necesario
- Validación que el TC sea mayor a 1 cuando se factura en ARS

#### 4. Conversión Automática de Precios:
- Los precios de los items se convierten automáticamente al cambiar la moneda de facturación
- Si se edita el tipo de cambio, los precios se recalculan automáticamente
- Muestra el monto original en USD y el equivalente en ARS para referencia

#### 5. Cumplimiento Normativo:
- La factura se envía a AFIP con `MonId: 'PES'` y `MonCotiz: [tipo_cambio]`
- Cumple con la normativa AFIP/ARCA (Resolución General 5616/2024)
- Usa el tipo de cambio vendedor del Banco Nación al cierre del día hábil anterior

**Archivos Creados:**
- `app/api/exchange-rates/route.ts` - API para obtener TC por fecha específica
- `app/api/exchange-rates/latest/route.ts` - API para obtener TC más reciente

**Archivos Modificados:**
- `app/(dashboard)/operations/billing/new/page.tsx`
  - Agregada detección de moneda de operación
  - Agregado panel de conversión de moneda con selector y campo de TC
  - Implementada conversión automática de precios
  - Agregada validación de TC al guardar factura
- `app/api/invoices/[id]/authorize/route.ts`
  - Ya estaba correcto: usa `MonId` y `MonCotiz` de la factura al enviar a AFIP
- `docs/GUIA_AFIP_SDK.md`
  - Agregada sección explicando la conversión de moneda y normativa AFIP

**Detalles Técnicos:**
- Si operación en USD → factura en ARS: `monto_ARS = monto_USD * TC`
- Si operación en ARS → factura en ARS: Sin conversión (`TC = 1`)
- El TC se obtiene del día hábil anterior a la fecha de emisión
- Todos los montos de items se convierten automáticamente
- El `exchangeRate` se guarda en la factura como `cotizacion`

**Resultado:**
- ✅ Los usuarios pueden facturar en pesos argentinos operaciones en dólares
- ✅ Cumplimiento con normativa AFIP/ARCA
- ✅ Conversión automática de montos con validación de TC
- ✅ Mejor UX con panel informativo y campos editables
- ✅ Trazabilidad del tipo de cambio usado en cada factura

---

### 36. Filtrado de Operaciones por Cliente y Auto-completado de Montos en Facturación

**Fecha:** 2025-01-19

**Descripción:**
Se mejoró el formulario de facturación para filtrar operaciones por cliente seleccionado y auto-completar automáticamente los montos de venta y costo del operador al seleccionar una operación.

**Funcionalidades Implementadas:**

#### 1. Filtrado de Operaciones por Cliente:
- **Antes:** El selector mostraba todas las operaciones sin filtrar
- **Ahora:** Al seleccionar un cliente, el selector muestra solo las operaciones de ese cliente
- El selector de operaciones se deshabilita hasta que se seleccione un cliente
- Muestra mensaje indicando cuántas operaciones tiene el cliente
- Si el cliente no tiene operaciones, muestra mensaje informativo

#### 2. Auto-completado de Items al Seleccionar Operación:
- **Item de Venta:** Se crea automáticamente con:
  - Descripción: "Servicios turísticos - [Destino] ([Código])"
  - Precio: Monto de venta (`sale_amount_total`)
  - Cantidad: 1
  - IVA: 21%
- **Item de Costo del Operador:** Se crea automáticamente si existe (opcional):
  - Descripción: "Costo de operador - [Código]"
  - Precio: Suma de todos los operadores (de `operation_operators` o `operator_cost`)
  - Cantidad: 1
  - IVA: 21%

#### 3. Soporte para Múltiples Operadores:
- **Formato Nuevo:** Suma todos los costos de `operation_operators`
- **Formato Antiguo:** Usa `operator_cost` si no hay `operation_operators`
- Calcula correctamente la moneda del costo del operador
- Convierte automáticamente según la moneda de facturación

#### 4. Conversión Automática de Montos:
- Los montos de venta y costo se convierten automáticamente al cambiar la moneda de facturación
- Respetan el tipo de cambio configurado
- Ambos items son editables (el usuario puede modificar montos, eliminar items, etc.)

**Archivos Modificados:**
- `app/(dashboard)/operations/billing/new/page.tsx`
  - Agregado estado `filteredOperations` para operaciones filtradas por cliente
  - Modificado `handleCustomerChange` para cargar operaciones del cliente usando `/api/customers/[id]/operations`
  - Mejorado `handleOperationChange` para auto-completar items con venta y costo
  - Agregada lógica para calcular costo total desde `operation_operators` o `operator_cost`
  - Mejorado selector de operaciones con mensajes informativos
  - Implementada conversión automática de montos de venta y costo
- `app/api/operations/[id]/route.ts`
  - Agregado `operation_operators` al select para incluir costos de operadores

**Flujo de Uso:**
1. **Seleccionar Cliente:**
   - El usuario selecciona un cliente del dropdown
   - El sistema carga automáticamente las operaciones de ese cliente
   - El selector de operaciones se habilita mostrando solo las operaciones del cliente

2. **Seleccionar Operación:**
   - El usuario selecciona una operación del cliente
   - El sistema auto-completa automáticamente:
     - Item de venta con monto de venta de la operación
     - Item de costo con suma de costos de operadores (si existe)
   - Si la operación está en USD, muestra panel de conversión de moneda

3. **Editar Items:**
   - El usuario puede modificar los montos, descripciones, cantidades
   - Puede eliminar items si no los necesita
   - Puede agregar items adicionales manualmente

**Detalles Técnicos:**
- Las operaciones se cargan usando `/api/customers/[id]/operations`
- Se obtienen detalles completos de cada operación para calcular montos
- Se soporta formato nuevo (`operation_operators` array) y antiguo (`operator_cost` único)
- La conversión de moneda funciona para ambos items (venta y costo)
- Los items auto-completados son editables desde el inicio

**Resultado:**
- ✅ Mejor UX: solo muestra operaciones relevantes del cliente seleccionado
- ✅ Auto-completado inteligente: trae montos de venta y costo automáticamente
- ✅ Ahorro de tiempo: no hay que buscar y tipear montos manualmente
- ✅ Flexibilidad: todos los items son editables
- ✅ Soporte completo para múltiples operadores por operación

---

### 37. Selector de Punto de Venta por Agencia en Facturación

**Fecha:** 2025-01-19

**Descripción:**
Se implementó un sistema completo para seleccionar puntos de venta por agencia en el formulario de facturación, permitiendo crear facturas sin operación asociada y agregar clientes nuevos desde el formulario.

**Funcionalidades Implementadas:**

#### 1. Nuevo Endpoint: `/api/invoices/points-of-sale`
- Obtiene puntos de venta habilitados por agencia desde AFIP
- Filtra solo puntos de venta no bloqueados
- Retorna agencias con sus puntos de venta configurados
- Se obtienen automáticamente desde AFIP usando el CUIT configurado

#### 2. Selector de Punto de Venta por Agencia:
- Selector agrupa puntos de venta por agencia
- Al seleccionar un punto de venta, se determina automáticamente la agencia
- Muestra todos los puntos de venta habilitados (número y tipo)
- Texto descriptivo mostrando la agencia seleccionada

#### 3. Botón para Crear Nuevo Cliente:
- Botón "Nuevo" junto al selector de cliente
- Abre el diálogo de creación de cliente (`NewCustomerDialog`)
- Al crear, selecciona automáticamente el nuevo cliente en el formulario
- Agrega el cliente a la lista sin recargar la página

#### 4. Operación Opcional:
- El campo de operación ahora está claramente marcado como "Opcional"
- Permite crear facturas sin operación asociada (facturas externas)
- Mejora la flexibilidad del sistema de facturación

#### 5. API Actualizado:
- El schema ahora requiere `agency_id` y `pto_vta` en el body
- La agencia se determina del punto de venta seleccionado
- Valida que la agencia pertenezca al usuario
- Soporta `operation_id` y `customer_id` como opcionales (null)

**Archivos Creados:**
- `app/api/invoices/points-of-sale/route.ts` - Endpoint para obtener puntos de venta por agencia

**Archivos Modificados:**
- `app/api/invoices/route.ts` - Schema y lógica actualizados para usar `agency_id` y `pto_vta` del body
- `app/(dashboard)/operations/billing/new/page.tsx` - UI con selector de punto de venta, botón para crear cliente, y operación opcional

**Detalles Técnicos:**
- Los puntos de venta se obtienen dinámicamente desde AFIP usando `getPointsOfSale()`
- El sistema obtiene automáticamente TODOS los puntos de venta habilitados para el CUIT configurado
- No hay límite en la cantidad de puntos de venta que se pueden usar
- El selector muestra los puntos de venta agrupados por agencia para mejor organización

**Resultado:**
- ✅ Los usuarios pueden seleccionar cualquier punto de venta habilitado en AFIP
- ✅ La agencia se determina automáticamente del punto de venta seleccionado
- ✅ Permite crear facturas sin operación asociada (facturas externas)
- ✅ Mejor UX: botón para crear cliente directamente desde el formulario de facturación
- ✅ Flexibilidad: soporta múltiples puntos de venta por agencia sin configuración manual

---

### 38. Ordenamiento de Cuentas por Saldo en Caja USD y ARS

**Fecha:** 2025-01-19

**Descripción:**
Se implementó un ordenamiento automático de cuentas financieras por saldo descendente en los tabs "Caja USD" y "Caja ARS", para que las cuentas con mayor saldo aparezcan primero y las cuentas con saldo 0 o negativo queden al final.

**Funcionalidades Implementadas:**
- Ordenamiento automático por saldo descendente (`current_balance`)
- Cuentas con mayor saldo aparecen primero
- Cuentas con saldo 0 o negativo aparecen al final
- Aplica tanto para "Caja USD" como "Caja ARS"

**Archivos Modificados:**
- `components/cash/cash-summary-client.tsx`
  - Agregado `.sort((a, b) => (b.current_balance || 0) - (a.current_balance || 0))` a `usdAccounts`
  - Agregado `.sort((a, b) => (b.current_balance || 0) - (a.current_balance || 0))` a `arsAccounts`

**Detalles Técnicos:**
- El ordenamiento se aplica usando `useMemo` para optimizar rendimiento
- Se ordena por `current_balance` en orden descendente (mayor a menor)
- Maneja casos donde `current_balance` puede ser `null` o `undefined` (usa 0 por defecto)
- El ordenamiento se actualiza automáticamente cuando cambian las cuentas

**Resultado:**
- ✅ Mejor visualización: cuentas con más fondos aparecen primero
- ✅ Identificación rápida de cuentas activas con saldo
- ✅ Cuentas inactivas o sin saldo quedan al final
- ✅ Mejora la experiencia de usuario al revisar el estado de las cuentas

**Mantenido por:** AI Assistant
**Para:** Migración a Vibook Services

---

### 39. Actualización Completa de Cerebro - Esquema de Base de Datos

**Fecha:** 2025-01-19

**Descripción:**
Se realizó una actualización completa y exhaustiva del esquema de base de datos en "Cerebro" (el asistente de AI), incluyendo TODAS las tablas, relaciones, campos y métricas del sistema para que pueda responder absolutamente cualquier pregunta sobre los datos.

**Problema Identificado:**
- El esquema de base de datos estaba desactualizado y solo incluía tablas básicas
- Faltaban tablas críticas como `financial_accounts`, `ledger_movements`, `operator_payments`, `invoices`, `partner_accounts`, etc.
- No había ejemplos de queries para métricas complejas
- El sistema no podía responder preguntas sobre contabilidad, facturación, socios, gastos recurrentes, etc.

**Solución Implementada:**

#### 1. Esquema Completo de Base de Datos:
- **Agregadas TODAS las tablas principales** (30+ tablas):
  - Tablas de operaciones: `operations`, `operation_customers`, `operation_operators`
  - Tablas de pagos: `payments`, `operator_payments`, `recurring_payments`
  - Tablas contables: `financial_accounts`, `ledger_movements`, `chart_of_accounts`
  - Tablas de facturación: `invoices`, `invoice_items`, `iva_sales`, `iva_purchases`
  - Tablas de socios: `partner_accounts`, `partner_withdrawals`, `partner_profit_allocations`
  - Tablas de tasas: `exchange_rates`, `monthly_exchange_rates`
  - Y todas las demás tablas del sistema

#### 2. Documentación de Relaciones:
- Documentadas todas las relaciones entre tablas (FKs)
- Explicadas las relaciones many-to-many (operations-operators, operations-customers)
- Clarificadas las relaciones contables (financial_accounts -> ledger_movements)

#### 3. Cálculos y Métricas Clave:
- **Balance de Cuentas Financieras:** Query completa con ingresos, egresos y balance actual
- **Deudores por Ventas:** Query con conversión de moneda y cálculo de deuda pendiente
- **Deuda a Operadores:** Query con pagos parciales y estado
- **Ventas del Mes:** Query con conversión automática a USD
- **Posición Contable Mensual:** Queries para Activo, Pasivo y Resultado del Mes
- Y muchas más métricas importantes

#### 4. Ejemplos de Queries Completos:
- Viajes próximos (próximas 30 días)
- Pagos pendientes de clientes
- Deudores por ventas (TOP 10)
- Deuda a operadores (TOP 10)
- Balance de todas las cuentas financieras
- Ventas del mes actual (en USD)
- Gastos recurrentes pendientes
- Operaciones por vendedor
- Top destinos
- Facturas emitidas
- Retiros de socios
- Asignaciones de ganancias a socios

#### 5. Notas Críticas Documentadas:
- Conversión de monedas (ARS a USD usando exchange_rates)
- Manejo de fechas (CURRENT_DATE, date_trunc, etc.)
- Nombres de columnas correctos (date_due NO due_date)
- Cálculo de balances (initial_balance + SUM(ledger_movements))
- Cálculo de márgenes y porcentajes
- Múltiples operadores por operación
- Pagos parciales (amount - paid_amount)

#### 6. Mejoras en el Sistema Prompt:
- Aumentado `max_iterations` de 3 a 5 para permitir más queries en secuencia
- Aumentado `max_tokens` de 1500 a 2000 para respuestas más completas
- Mejorado feedback de errores con mensajes más específicos
- Agregado contexto del usuario (nombre, rol) en cada consulta
- Mejorada descripción de la función `execute_query` para guiar mejor al AI

**Archivos Modificados:**
- `app/api/ai/route.ts` - **REESCRITO COMPLETAMENTE**
  - Esquema de base de datos expandido de ~50 líneas a ~400+ líneas
  - Agregadas todas las tablas con sus campos completos
  - Agregados ejemplos de queries para todas las métricas
  - Mejorado SYSTEM_PROMPT con más contexto y ejemplos
  - Aumentada capacidad de iteraciones y tokens

**Detalles Técnicos:**
- El esquema ahora incluye TODAS las tablas del sistema
- Cada tabla tiene documentados TODOS sus campos importantes
- Las relaciones entre tablas están claramente documentadas
- Los ejemplos de queries cubren todos los casos de uso principales
- El sistema puede responder preguntas sobre:
  - Operaciones y ventas
  - Pagos y cobranzas
  - Contabilidad y balances
  - Facturación AFIP
  - Cuentas de socios
  - Gastos recurrentes
  - Métricas y reportes
  - Y cualquier otra pregunta sobre los datos del sistema

**Resultado:**
- ✅ Cerebro ahora tiene contexto completo de TODO el sistema
- ✅ Puede responder preguntas sobre cualquier tabla o métrica
- ✅ Las queries son más precisas gracias al esquema completo
- ✅ Mejor manejo de errores con feedback específico
- ✅ Respuestas más completas y útiles para los usuarios
- ✅ Soporte para consultas complejas con múltiples queries en secuencia

**Ejemplos de Preguntas que Ahora Puede Responder:**
- "¿Cuánto debo a los operadores?"
- "¿Cuál es el balance de todas mis cuentas?"
- "¿Quiénes son mis mayores deudores?"
- "¿Cuánto facturé este mes?"
- "¿Cuánto retiraron los socios este mes?"
- "¿Cuáles son los gastos recurrentes pendientes?"
- "¿Cuál es la posición contable del mes?"
- "¿Cuántas operaciones tengo por destino?"
- Y cualquier otra pregunta sobre los datos del sistema

---

### 40. Pagos Manuales en Deudores por Ventas y Pagos a Operadores

**Fecha:** 2025-01-19

**Descripción:**
Se implementó la funcionalidad para crear deudas manuales tanto en "Deudores por Ventas" como en "Pago a Operadores", permitiendo agregar cuentas por cobrar y cuentas por pagar sin necesidad de estar vinculadas a una operación específica. **Importante:** Estas funcionalidades crean DEUDAS/CUENTAS PENDIENTES (status: PENDING), no pagos ya realizados. Los pagos se marcan como realizados posteriormente usando los flujos existentes (marcar como pagado/cobrado).

**Funcionalidades Implementadas:**

#### 1. Cuentas por Cobrar Manuales en Deudores por Ventas:
- **Botón "Nueva Cuenta por Cobrar"** en la página de Deudores por Ventas
- **Dialog `ManualPaymentDialog`** para crear cuentas por cobrar manuales:
  - Nombre del cliente (texto libre)
  - Monto y moneda (ARS/USD)
  - Tipo de cambio (si es ARS, se obtiene automáticamente el TC más reciente)
  - Método de pago (Transferencia, Efectivo, Tarjeta, etc.)
  - Fecha de vencimiento
  - Referencia y notas opcionales
- **Sin operación asociada:** Las cuentas por cobrar manuales se crean con `operation_id = null`
- **Estado inicial:** Se crean como `status: "PENDING"` (pendiente de cobro)
- **Conversión de moneda:** Si el pago es en ARS, se muestra el equivalente en USD usando el TC ingresado
- **Marcar como cobrado:** Una vez creada, la cuenta por cobrar puede ser marcada como cobrada usando el flujo existente de "Marcar como Pagado"

#### 2. Deudas Manuales en Pago a Operadores:
- **Botón "Nueva Deuda Manual"** en la página de Pago a Operadores
- **Dialog `ManualOperatorPaymentDialog`** para crear deudas manuales a operadores:
  - Selector de operador (dropdown con todos los operadores)
  - Monto y moneda (ARS/USD)
  - Fecha de vencimiento
  - Notas opcionales
- **Sin operación asociada:** Las deudas manuales se crean con `operation_id = null`
- **Estado inicial:** Se crean como `status: "PENDING"`, `paid_amount = 0` (pendiente de pago)
- **API POST `/api/accounting/operator-payments`:** Nuevo endpoint para crear operator_payments manuales
- **Marcar como pagado:** Una vez creada, la deuda puede ser marcada como pagada usando "Cargar Pago Masivo" o el flujo existente de pagos

#### 3. Cambios en Endpoints:
- **`/api/payments` (POST):**
  - `operation_id` ahora es opcional (puede ser `null` para pagos manuales)
  - Validación ajustada para permitir pagos sin operación
  - Movimientos contables se crean solo si el pago está marcado como PAID y existe operation_id (o se maneja manualmente)

- **`/api/accounting/operator-payments` (POST):**
  - Nuevo método POST para crear operator_payments manuales
  - Valida que el operador exista
  - Crea operator_payment con `operation_id = null`
  - Estado inicial: `PENDING`, `paid_amount = 0`

#### 4. Cambios en Librería:
- **`createOperatorPayment` función actualizada:**
  - `operationId` ahora es el último parámetro y es opcional
  - Nueva firma: `createOperatorPayment(supabase, operatorId, amount, currency, dueDate, operationId?, notes?)`
  - Mantiene compatibilidad con código existente

**Archivos Creados:**
- `components/accounting/manual-payment-dialog.tsx` - Dialog para cuentas por cobrar manuales
- `components/accounting/manual-operator-payment-dialog.tsx` - Dialog para deudas manuales a operadores

**Archivos Modificados:**
- `components/accounting/debts-sales-page-client.tsx` - Agregado botón "Nueva Cuenta por Cobrar" y dialog
- `components/accounting/operator-payments-page-client.tsx` - Agregado botón "Nueva Deuda Manual" y dialog
- `app/api/payments/route.ts` - `operation_id` ahora es opcional
- `app/api/accounting/operator-payments/route.ts` - Agregado método POST
- `lib/accounting/operator-payments.ts` - Actualizada firma de `createOperatorPayment`
- `app/api/operations/route.ts` - Actualizada llamada a `createOperatorPayment`
- `app/api/admin/migrate-historical-accounting/route.ts` - Actualizada llamada a `createOperatorPayment`
- Scripts de migración y testing actualizados

**Detalles Técnicos:**
- Las cuentas por cobrar manuales en "Deudores por Ventas" se crean como `payments` con:
  - `payer_type = "CUSTOMER"`, `direction = "INCOME"`
  - `operation_id = null` (sin operación asociada)
  - `status = "PENDING"` (pendiente de cobro)
- Las deudas manuales en "Pago a Operadores" se crean como `operator_payments` con:
  - `operation_id = null` (sin operación asociada)
  - `status = "PENDING"`, `paid_amount = 0` (pendiente de pago)
- Ambos tipos aparecen en sus respectivas listas junto con los items automáticos vinculados a operaciones
- Pueden ser marcados como pagados/cobrados usando los flujos existentes:
  - Cuentas por cobrar: usar "Marcar como Pagado" desde la lista de deudores
  - Deudas a operadores: usar "Cargar Pago Masivo" o marcar individualmente
- Los movimientos contables se crean cuando se marca el item como PAID (no al crearlo)

**UI/UX:**
- Botones claramente identificados con icono "+" (Plus)
- **Textos claros:** "Nueva Cuenta por Cobrar" y "Nueva Deuda Manual" para evitar confusión
- Dialogs informativos que explican que se crean como pendientes y pueden marcarse como pagados/cobrados después
- Validaciones completas en frontend y backend
- Mensajes de éxito claros: "Cuenta por cobrar creada exitosamente" / "Deuda a operador creada exitosamente"
- Recarga automática de listas después de crear items

**Aclaración Importante:**
- ⚠️ Estos diálogos **NO crean pagos realizados**, crean **DEUDAS/CUENTAS PENDIENTES**
- Los items se crean con `status: "PENDING"` y aparecen en las listas de pendientes
- Para registrar el pago/cobro real, se debe usar el flujo de "Marcar como Pagado/Cobrado"
- Los movimientos contables se crean cuando se marca como PAID, no al crear la deuda/cuenta

**Resultado:**
- ✅ Los usuarios pueden crear cuentas por cobrar manuales en "Deudores por Ventas" sin necesidad de una operación
- ✅ Los usuarios pueden crear deudas manuales a operadores sin necesidad de una operación
- ✅ Mayor flexibilidad para gestionar deudas/cuentas que no están vinculadas a operaciones específicas
- ✅ Mejor trazabilidad de todos los items del sistema (automáticos y manuales)
- ✅ Textos claros que evitan confusión: se crean como pendientes, no como pagos realizados
- ✅ Compatibilidad completa con código existente (no rompe funcionalidad anterior)

---

### 41. Agregar Clientes con OCR a Operaciones y Mejora de Gráficos de Gastos Recurrentes

**Fecha:** 2025-01-19

**Descripción:**
Se implementaron tres mejoras importantes: funcionalidad para agregar clientes a operaciones usando el dialog de OCR existente (para viajes grupales), mejora completa de los gráficos de Gastos Recurrentes usando la UI moderna, y se inició la implementación de tooltips explicativos en todas las secciones del sistema.

**Funcionalidades Implementadas:**

#### 1. Agregar Clientes a Operaciones con OCR (Tarea 1):
- **Reemplazo de tabla simple:** La tabla simple de clientes en el detalle de operación fue reemplazada por el componente `PassengersSection` completo
- **Funcionalidad de agregar pasajeros:** Los usuarios pueden buscar clientes existentes y agregarlos como pasajeros (principal o acompañante)
- **Crear cliente nuevo con OCR:** Botón "Crear Cliente Nuevo (OCR)" en el dialog de agregar pasajero que abre `NewCustomerDialog` con funcionalidad completa de OCR
- **Flujo completo:**
  - El usuario hace click en "Agregar" en la sección de Pasajeros
  - Busca un cliente existente o hace click en "Crear Cliente Nuevo (OCR)"
  - Si crea un cliente nuevo, puede subir DNI/Pasaporte y el OCR extrae automáticamente los datos
  - El cliente creado se agrega automáticamente a la operación como pasajero
- **Perfecto para viajes grupales:** Permite agregar múltiples clientes a una misma operación (ej: viaje grupal de 5 personas)

**Archivos Modificados:**
- `components/operations/operation-detail-client.tsx` - Reemplazada tabla simple por `PassengersSection`
- `components/operations/passengers-section.tsx` - Agregado botón y funcionalidad para crear cliente nuevo con OCR, integración con `NewCustomerDialog`

**Detalles Técnicos:**
- `PassengersSection` ahora incluye import de `NewCustomerDialog`
- El dialog de agregar pasajero tiene botón "Crear Cliente Nuevo (OCR)" que abre `NewCustomerDialog`
- Al crear un cliente exitosamente, se agrega automáticamente a la operación usando el endpoint `/api/operations/${operationId}/customers`
- El cliente se agrega con el rol seleccionado (MAIN o COMPANION)
- La lista de pasajeros se actualiza automáticamente después de agregar el cliente

#### 2. Mejora de Gráficos de Gastos Recurrentes (Tarea 3):
- **Estilo moderno unificado:** Los gráficos ahora usan el mismo estilo moderno que se usa en páginas de estadísticas (operations, customers, sales)
- **Diseño compacto:**
  - Altura reducida: `h-[200px]` en lugar de `h-[300px]`
  - Padding reducido: `py-3 px-4` en headers, `px-4 pb-4` en content
  - Labels más pequeños: `text-sm font-medium` en títulos, `fontSize: 10` en ejes
- **Mejoras en gráficos:**
  - **Gráfico de barras (Gastos por Categoría):** Ejes más limpios, tooltips mejorados, colores consistentes
  - **Gráfico de torta (Distribución por Categoría):** Radio reducido, leyenda mejorada, tooltips con formato de moneda
  - **Gráfico de líneas (Evolución por Categoría):** Ejes mejorados, leyenda más compacta, puntos más pequeños
- **Estadísticas adicionales agregadas:**
  - **Gastos Activos:** Cantidad de gastos recurrentes activos
  - **Vencen Esta Semana:** Gastos que vencen en los próximos 7 días
  - **Vencidos:** Gastos que ya pasaron su fecha de vencimiento
  - **En USD:** Cantidad de gastos en dólares estadounidenses
- **Grid responsive mejorado:**
  - Gráfico de barras: `md:col-span-2` (ocupa 2 columnas en pantallas medianas)
  - Gráfico de torta: columna individual con leyenda de colores debajo
  - Gráfico de líneas: `md:col-span-3` (ocupa 3 columnas - ancho completo)
  - Card de estadísticas: `md:col-span-3` con grid interno de 4 columnas

**Archivos Modificados:**
- `components/accounting/recurring-payments-page-client.tsx` - Gráficos completamente rediseñados, estadísticas adicionales agregadas

**Detalles Técnicos:**
- Todos los gráficos usan `margin={{ top: 5, right: 5, left: 0, bottom: 5 }}` para mejor aprovechamiento del espacio
- Ejes con `stroke="#e5e7eb"` para consistencia visual
- Tooltips con `contentStyle={{ fontSize: 11 }}` para texto más compacto
- Formateo de valores en USD usando `formatCurrency(value, "USD")`
- Cálculo correcto de estadísticas adicionales desde `filteredPayments`

#### 3. Tooltips Explicativos en Sistema (Tarea 2 - ✅ COMPLETADO):
- **Implementación completa:** Se agregaron tooltips explicativos con icono `HelpCircle` en todas las secciones principales del sistema
- **Secciones con tooltips implementados:**
  - ✅ **Clientes** (`customers-page-client.tsx`): Explica gestión de clientes y base de datos
  - ✅ **Operaciones** (`operations-page-client.tsx`): Explica gestión de operaciones turísticas
  - ✅ **Leads/Ventas** (`leads-page-client.tsx`): Explica gestión de leads y proceso de conversión
  - ✅ **Reportes** (`reports-page-client.tsx`): Explica reportes financieros y análisis
  - ✅ **Estadísticas de Clientes** (`customers-statistics-page-client.tsx`): Explica métricas de clientes
  - ✅ **Estadísticas de Operaciones** (`operations-statistics-page-client.tsx`): Explica métricas de operaciones
  - ✅ **Estadísticas de Ventas** (`sales-statistics-page-client.tsx`): Explica métricas de ventas
  - ✅ **Operadores** (`operators-page-client.tsx`): Explica gestión de operadores
  - ✅ **Libro Mayor** (`ledger-page-client.tsx`): Explica registros contables y movimientos
  - ✅ **Cuentas Financieras** (`financial-accounts-page-client.tsx`): Explica gestión de cuentas bancarias y efectivo
  - ✅ **Gastos Recurrentes** (`recurring-payments-page-client.tsx`): Ya tenía tooltip implementado previamente
  - ✅ **Pagos a Operadores** (`operator-payments-page-client.tsx`): Ya tenía tooltip implementado previamente

**Patrón de Tooltip Implementado:**
```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
    </TooltipTrigger>
    <TooltipContent className="max-w-xs">
      <p className="font-medium mb-1">¿Cómo funciona?</p>
      <p className="text-xs">Explicación corta y clara de la funcionalidad</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

**Archivos Modificados:**
- `components/customers/customers-page-client.tsx` - Agregado tooltip en header
- `components/operations/operations-page-client.tsx` - Agregado tooltip en header
- `components/sales/leads-page-client.tsx` - Agregado tooltip en header
- `components/reports/reports-page-client.tsx` - Agregado tooltip en header
- `components/customers/customers-statistics-page-client.tsx` - Agregado tooltip en header
- `components/operations/operations-statistics-page-client.tsx` - Agregado tooltip en header
- `components/sales/sales-statistics-page-client.tsx` - Agregado tooltip en header
- `components/operators/operators-page-client.tsx` - Agregado tooltip en header
- `components/accounting/ledger-page-client.tsx` - Agregado tooltip en header
- `components/accounting/financial-accounts-page-client.tsx` - Agregado tooltip en header

**Detalles Técnicos:**
- Todos los tooltips usan el mismo patrón visual consistente
- Icono `HelpCircle` de lucide-react para identificación visual
- Tooltips aparecen al hacer hover sobre el icono
- Contenido explicativo breve y claro en cada sección
- Implementación unificada en todos los headers de página

**Resultado:**
- ✅ Los usuarios pueden agregar múltiples clientes a una operación fácilmente (perfecto para viajes grupales)
- ✅ Crear clientes nuevos directamente desde la operación usando OCR (sin salir del contexto)
- ✅ Gráficos de Gastos Recurrentes con diseño moderno, compacto y profesional
- ✅ Estadísticas adicionales útiles para gestión de gastos recurrentes
- ✅ **Tooltips explicativos en todas las secciones principales** para mejorar la comprensión del sistema
- ✅ Mejor UX con visualización clara de información financiera y explicaciones contextuales

---
