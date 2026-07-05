# Resumen de Cambios - Últimas 12 Horas

**Fecha de generación:** 2026-01-14  
**Período:** Últimas 12 horas desde 2026-01-13 23:00 hasta 2026-01-14 02:38

---

## 📊 Resumen General

**Total de commits:** 17  
**Archivos modificados:** ~25+ archivos  
**Líneas agregadas/eliminadas:** ~1500+ líneas

---

## 🔄 Cambios Principales por Categoría

### 1. Operaciones (Operations)
### 2. Clientes (Customers)
### 3. Contabilidad y Caja (Accounting & Cash)
### 4. UI/UX (Interface)
### 5. Backend y API

---

## 📝 Detalle de Cambios por Commit

### Commit 1: `48e856c` - Cambiar moneda predeterminada a USD
**Tipo:** Feature  
**Fecha:** 2026-01-13  
**Archivos:** Formularios de operaciones

**Cambios:**
- Cambiar moneda predeterminada de "ARS" a "USD" en todos los formularios de operaciones
- Afecta: `new-operation-dialog.tsx`, schemas de operaciones

---

### Commit 2: `1bc24ef` - Eliminar campos check-in/check-out
**Tipo:** Feature  
**Fecha:** 2026-01-13  
**Archivos:** 
- `components/operations/new-operation-dialog.tsx`
- `app/api/operations/route.ts`
- Schemas de validación

**Cambios:**
- Eliminar campos `checkin_date` y `checkout_date` del formulario de nueva operación
- Eliminar de schema de validación
- Eliminar del backend (API route)
- Eliminar de la lógica de creación de operaciones

---

### Commit 3: `efb1669` - Refresh automático de tabla de operaciones
**Tipo:** Fix  
**Fecha:** 2026-01-13  
**Archivos:** `components/operations/operations-table.tsx`

**Cambios:**
- Agregar listener de evento `refresh-operations` en `window`
- Actualizar tabla automáticamente después de crear una nueva operación
- Eliminar necesidad de recargar página manualmente

**Implementación:**
```typescript
useEffect(() => {
  const handleRefresh = () => {
    fetchOperations()
  }
  window.addEventListener('refresh-operations', handleRefresh)
  return () => window.removeEventListener('refresh-operations', handleRefresh)
}, [])
```

---

### Commit 4: `ed527d4` - Campo de cliente en formulario de operación
**Tipo:** Feature  
**Fecha:** 2026-01-14 00:08  
**Archivos:**
- `components/operations/new-operation-dialog.tsx`
- `app/api/operations/route.ts`

**Cambios:**
- Agregar campo "Cliente" al formulario de nueva operación
- Integrar `NewCustomerDialog` para crear clientes desde el formulario
- Eliminar campo "Tipo de Producto" del formulario
- Reorganizar campos: Cliente en columna 1, Vendedor Secundario en columna 2
- Agregar `customer_id` al schema y backend
- Disparar evento `refresh-operations` al crear operación

---

### Commit 5: `58812e8` - Corregir estructura de customer_id
**Tipo:** Fix  
**Fecha:** 2026-01-14 00:10  
**Archivos:** `app/api/operations/route.ts`

**Cambios:**
- Corregir manejo de `customer_id` en API de operaciones
- Eliminar código duplicado
- Mejorar lógica de asociación de cliente

---

### Commit 6: `ca5fc9c` - Corregir llaves de cierre
**Tipo:** Fix  
**Fecha:** 2026-01-14 00:12  
**Archivos:** `app/api/operations/route.ts`

**Cambios:**
- Corregir estructura de código con llaves de cierre incorrectas
- Ajustar bloques de código para asociación de cliente

---

### Commit 7: `57de51f` - Corregir uso de product_type
**Tipo:** Fix  
**Fecha:** 2026-01-14 00:14  
**Archivos:** `app/api/operations/route.ts`

**Cambios:**
- `product_type` ahora se infiere solo del campo `type`
- Eliminar dependencia de `product_type` desde el request body
- Lógica: `type === 'FLIGHT' ? 'AEREO' : type === 'HOTEL' ? 'HOTEL' : ...`

---

### Commit 8: `37e50c6` - Type assertion para leadData
**Tipo:** Fix  
**Fecha:** 2026-01-14 00:16  
**Archivos:** `app/api/operations/route.ts`

**Cambios:**
- Agregar type assertion para `leadData` para evitar error de TypeScript
- Type: `{ contact_name: string; contact_phone: string; contact_email: string; contact_instagram: string } | null`

---

### Commit 9: `86f9bba` - OCR con IA para clientes (DNI/Pasaporte)
**Tipo:** Feature (MAYOR)  
**Fecha:** 2026-01-14 00:33  
**Archivos:**
- `app/api/documents/ocr-only/route.ts` (NUEVO)
- `components/customers/new-customer-dialog.tsx`
- `components/operations/new-operation-dialog.tsx`

**Cambios:**
- **Nueva API:** `/api/documents/ocr-only` para procesar documentos con OpenAI GPT-4o
- Agregar botón de subida de documento (DNI/Pasaporte) en formulario de cliente
- Autocompletar campos: nombre, apellido, tipo de documento, número, fecha de nacimiento, nacionalidad
- Guardar documento subido en la sección de documentos del cliente
- Eliminar campos "Instagram" y "Email" del formulario (no requeridos)

**Funcionalidad OCR:**
1. Usuario sube imagen (DNI/Passport)
2. Se envía a `/api/documents/ocr-only`
3. OpenAI GPT-4o analiza la imagen y extrae datos
4. Se autocompletan campos del formulario
5. Al crear cliente, se guarda el documento

---

### Commit 10: `218da7d` - Email opcional en creación de cliente
**Tipo:** Fix  
**Fecha:** 2026-01-14 01:19  
**Archivos:**
- `app/api/customers/route.ts`
- `components/customers/new-customer-dialog.tsx`

**Cambios:**
- Hacer campo `email` completamente opcional en creación de cliente
- Eliminar validación de email requerido en backend
- Permitir creación de clientes sin email

---

### Commit 11: `348f7d2` - Eliminar validación de email requerido
**Tipo:** Fix  
**Fecha:** 2026-01-14 01:25  
**Archivos:** `app/api/customers/route.ts`

**Cambios:**
- Eliminar completamente validación de email requerido
- Email es opcional a menos que se configure explícitamente en settings

---

### Commit 12: `93c68a5` - Tipo de producto por operador
**Tipo:** Feature  
**Fecha:** 2026-01-14 01:32  
**Archivos:**
- `components/operations/new-operation-dialog.tsx`
- `app/api/operations/route.ts`
- `supabase/migrations/066_add_product_type_to_operation_operators.sql` (NUEVO)

**Cambios:**
- Agregar campo `product_type` a cada operador en operaciones múltiples
- Mejorar UI de múltiples operadores con cards organizadas
- Agregar select de tipo de producto (Vuelo, Hotel, Paquete, Crucero, Transfer, Mixed) por operador
- **Migración:** Agregar columna `product_type TEXT CHECK (...)` a tabla `operation_operators`
- Actualizar backend para guardar `product_type` por operador

---

### Commit 13: `609e38c` - Escapar comillas en UI
**Tipo:** Fix  
**Fecha:** 2026-01-14 01:34  
**Archivos:** `components/operations/new-operation-dialog.tsx`

**Cambios:**
- Escapar comillas dobles en mensaje de UI para cumplir con ESLint
- Cambiar `"Agregar Operador"` por `&quot;Agregar Operador&quot;`

---

### Commit 14: `0adad32` - Prevenir cierre accidental de diálogos + Terminología
**Tipo:** Feature  
**Fecha:** 2026-01-14 01:48  
**Archivos:**
- `components/operations/new-operation-dialog.tsx`
- `components/customers/new-customer-dialog.tsx`
- `components/operators/new-operator-dialog.tsx`

**Cambios:**
- **Item 7:** Prevenir cierre accidental de diálogos
  - Agregar `onEscapeKeyDown`, `onPointerDownOutside` para prevenir cierre
  - Mostrar `AlertDialog` de confirmación antes de cerrar
  - Mensaje: "¿Estás seguro que quieres cerrar? Perderás todos los cambios no guardados"
  - Implementado en: NewOperationDialog, NewCustomerDialog, NewOperatorDialog

- **Item 8:** Cambiar terminología
  - "Niños" → "Children"
  - "Bebés" → "Infantes"

---

### Commit 15: `c821e35` - Registrar pagos en cuentas de caja (CONTABILIDAD)
**Tipo:** Feature (MAYOR - Contabilidad)  
**Fecha:** 2026-01-14 02:18  
**Archivos:** `app/api/payments/mark-paid/route.ts`

**Cambios:**
- **CORRECCIÓN CONTABLE IMPORTANTE:**
- Los pagos ahora se registran en cuentas de caja reales según método de pago:
  - Efectivo → `CASH_ARS` / `CASH_USD`
  - Transferencia → `CHECKING_ARS` / `CHECKING_USD`
  - Mercado Pago → `CREDIT_CARD`
  - USD → `SAVINGS_USD`
- Mantener movimientos existentes: Cuentas por Cobrar/Pagar y RESULTADO
- El resumen de caja ahora muestra balances correctos (ingresos - egresos por cuenta)

**Flujo contable completo:**
1. Reducir Cuentas por Cobrar/Pagar (ACTIVO/PASIVO)
2. Registrar en cuenta de caja según método (ACTIVO)
3. Registrar en RESULTADO (INGRESOS/COSTOS)

---

### Commit 16: `e365ca8` - Mostrar texto completo en submenús del sidebar
**Tipo:** Fix (UI)  
**Fecha:** 2026-01-14 02:20  
**Archivos:** `components/ui/sidebar.tsx`

**Cambios:**
- Cambiar `truncate` por `break-words` en `SidebarMenuSubButton`
- Permite que todos los textos del submenú se lean completos cuando está expandido
- Soluciona: textos cortados como 'Cuentas Finan...', 'Pagos Recurr...', etc.

---

### Commit 17: `0e0ead2` - Corregir retiros de socios (CONTABILIDAD)
**Tipo:** Fix (Contabilidad)  
**Fecha:** 2026-01-14 02:38  
**Archivos:**
- `app/api/partner-accounts/withdrawals/route.ts`
- `components/accounting/partner-accounts-client.tsx`

**Cambios:**
- Hacer `account_id` obligatorio en retiros de socios
- Reemplazar inserción directa por `createLedgerMovement`
- Calcular `amount_ars_equivalent` y `exchange_rate` correctamente
- Agregar campo de selección de cuenta financiera en el formulario
- Eliminar código antiguo de `cash_movements` (todo va por ledger)
- Verificar que cuenta financiera existe antes de crear retiro
- Calcular exchange rate para USD si aplica

---

## 📋 Resumen por Módulo

### Módulo: Operaciones
- ✅ Cambio de moneda predeterminada a USD
- ✅ Eliminación de campos check-in/check-out
- ✅ Campo de cliente en formulario
- ✅ Tipo de producto por operador
- ✅ Refresh automático de tabla
- ✅ Prevención de cierre accidental de diálogos
- ✅ Cambio de terminología (Niños→Children, Bebés→Infantes)

### Módulo: Clientes
- ✅ OCR con IA para autocompletar desde DNI/Pasaporte
- ✅ Email completamente opcional
- ✅ Eliminación de campos Instagram y Email
- ✅ Prevención de cierre accidental de diálogos

### Módulo: Contabilidad
- ✅ **Registro de pagos en cuentas de caja reales**
- ✅ **Corrección de retiros de socios**
- ✅ Integridad contable mejorada

### Módulo: UI/UX
- ✅ Texto completo en submenús del sidebar
- ✅ Mejora de UI de múltiples operadores
- ✅ Prevención de cierre accidental de diálogos

---

## 🎯 Cambios Críticos (Requieren Atención Especial)

1. **Registro de pagos en cuentas de caja** - Cambio importante en lógica contable
2. **Retiros de socios** - Ahora requiere cuenta financiera obligatoria
3. **OCR con IA** - Nueva funcionalidad que requiere OpenAI API
4. **Migración de base de datos** - `066_add_product_type_to_operation_operators.sql`

---

## 🔧 Dependencias Nuevas

- OpenAI API (para OCR) - Ya estaba implementado, se usa en nueva ruta
- No hay nuevas dependencias de npm

---

## 📊 Estadísticas

- **Commits:** 17
- **Features:** 8
- **Fixes:** 9
- **Archivos nuevos:** 2 (API OCR, Migración)
- **Migraciones de DB:** 1

---

**Fin del resumen**
