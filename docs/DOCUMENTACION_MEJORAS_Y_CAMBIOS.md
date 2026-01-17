# Documentación de Mejoras y Cambios - ERP LOZADA

Este documento registra todas las mejoras, nuevas funcionalidades, correcciones y cambios realizados en la aplicación. Está diseñado para ser actualizado continuamente a medida que se implementan nuevas características o se solucionan problemas.

**Última actualización:** 2025-01-17

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
- [ ] Cambiar moneda predeterminada a USD
- [ ] Eliminar check-in/check-out de operaciones
- [ ] Corregir validación de fechas
- [ ] Revisar comportamiento del diálogo en algunas operaciones
- [ ] Verificar terminología en toda la aplicación

### Mejoras futuras sugeridas
- [ ] Carga integrada de cliente y operación
- [ ] OCR automático en carga de cliente (parcialmente implementado)
- [ ] Descarga de planillas a Excel (DS por ventas y cuentas por pagar)
- [ ] Conversor de moneda en cobros y pagos
- [ ] Forma de cargar pagos con tarjeta de crédito

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
