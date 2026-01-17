# Documentación de Mejoras y Cambios - ERP LOZADA

Este documento registra todas las mejoras, nuevas funcionalidades, correcciones y cambios realizados en la aplicación. Está diseñado para ser actualizado continuamente a medida que se implementan nuevas características o se solucionan problemas.

**Última actualización:** 2025-01-17 (Actualizado con todas las mejoras recientes)

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

**Fecha:** 2025-01-17

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

**Archivos modificados:**
- `components/command-menu.tsx` - Componente principal de búsqueda
- `components/site-header.tsx` - Agregado botón de búsqueda
- `app/api/search/route.ts` - Endpoint de búsqueda
- `components/ui/command.tsx` - Componente base (deshabilitado filtrado interno)

**Detalles técnicos:**
- Uso de `cmdk` para el Command Palette
- Búsqueda con debounce para optimizar rendimiento
- Filtrado deshabilitado en `cmdk` (`shouldFilter={false}`) para permitir búsqueda personalizada
- Reset de estado cuando el dialog se cierra para mantener estado limpio
- Manejo de estado controlado/no controlado para flexibilidad

**Errores corregidos:**
- ✅ Reset de estado al abrir dialog interfería con la escritura
- ✅ Filtrado interno de `cmdk` ocultaba resultados de API
- ✅ Instancia duplicada de CommandMenu causaba conflictos
- ✅ Timing de búsqueda no funcionaba en primera apertura

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
