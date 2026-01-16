# 📋 PLAN DE ACCIÓN - MEJORAS DEL SISTEMA
**Periodo:** RESUMEN (16/01/26) hasta RESUMEN (13/01/26)

---

## 🎯 RESUMEN EJECUTIVO

Este documento detalla el plan de acción basado en el feedback del cliente recopilado entre el 16/01/26 y el 13/01/26. Se identificaron mejoras críticas relacionadas con conversión de moneda, validación de formularios, y experiencia de usuario en operaciones.

---

## ✅ ITEMS COMPLETADOS (RESUMEN 13/01/26)

### 1. Doble Petición de Tipo de Producto
**Estado:** ✅ (OK)  
**Descripción:** Se resolvió el problema de solicitud duplicada del campo "Tipo de Producto" en el formulario de operaciones.

**Acciones tomadas:**
- Revisión de la lógica en `components/operations/new-operation-dialog.tsx`
- Unificación de campos de tipo de producto
- Validación mejorada en `app/api/operations/route.ts`

---

### 2. Fechas de Check-in y Check-out / Moneda Predeterminada ARS
**Estado:** ✅ (OK)  
**Descripción:** Se corrigió la persistencia de campos `checkin_date` y `checkout_date` que seguían apareciendo en formularios, y se estableció ARS como moneda predeterminada.

**Acciones tomadas:**
- Eliminación de campos `checkin_date` y `checkout_date` de formularios
- Configuración de ARS como moneda por defecto
- Actualización de valores predeterminados en componentes

---

### 3. Nueva Revisión de Fecha
**Estado:** ✅ (OK)  
**Descripción:** Implementación de mejoras en el manejo y validación de fechas en operaciones.

**Acciones tomadas:**
- Mejora de validación de fechas
- Actualización de componentes de selección de fecha
- Consistencia en formatos de fecha en toda la aplicación

---

### 4. Carga del Cliente y Operación
**Estado:** ✅ (OK)  
**Descripción:** Resolución de problemas pendientes relacionados con la creación de clientes y operaciones del día anterior.

**Acciones tomadas:**
- Revisión y corrección de flujo de creación de clientes
- Validación mejorada en creación de operaciones
- Testing de escenarios de carga

---

### 5. Click Fuera de Ventana de Operación
**Estado:** ✅ (OK) - (revisar)  
**Descripción:** Se mejoró el comportamiento del diálogo de operación para evitar que se cierre accidentalmente al hacer click fuera.

**Acciones tomadas:**
- Implementación de confirmación antes de cerrar
- Manejo de eventos `onEscapeKeyDown` y `onPointerDownOutside`
- Validación de cambios no guardados antes de cerrar

---

## 🔴 PENDIENTE DE IMPLEMENTACIÓN

### 1. Agregar Código de Reserva (Cod. Rva) Aéreo y Terrestre
**Prioridad:** 🔴 ALTA  
**Descripción del problema:**

Necesidad de agregar un campo para código de reserva específico para productos Aéreos y Terrestres en las operaciones.

**Análisis:**
- Actualmente existe `file_code` que se genera automáticamente (formato: OP-YYYYMMDD-ID)
- Necesitan un campo adicional `reservation_code` o `rva_code` específico para códigos de reserva de operadores (líneas aéreas, transportes, etc.)
- Este código debe ser diferente según el `product_type` (Aéreo vs Terrestre)

**Plan de Acción:**

#### 1.1. Actualizar Schema de Base de Datos
- [ ] Crear migración para agregar campo `reservation_code` a tabla `operations`
- [ ] Campo debe ser `TEXT` y `NULL` (no todos los productos requieren código de reserva)
- [ ] Agregar validación o comentario indicando cuándo es requerido

**Archivos a crear:**
- `supabase/migrations/XXX_add_reservation_code_to_operations.sql`

#### 1.2. Actualizar Formulario de Operaciones
- [ ] Agregar campo "Código de Reserva" en `components/operations/new-operation-dialog.tsx`
- [ ] Mostrar campo condicionalmente basado en `product_type` (solo para Aéreo y Terrestre)
- [ ] Agregar validación: requerido si `product_type` es 'AEREO' o si es terrestre (necesitar definir qué es "terrestre")
- [ ] Actualizar schema de validación (Zod)

**Archivos a modificar:**
- `components/operations/new-operation-dialog.tsx`
- `components/operations/edit-operation-dialog.tsx`

#### 1.3. Actualizar API de Operaciones
- [ ] Actualizar `POST /api/operations` para aceptar `reservation_code`
- [ ] Actualizar `PATCH /api/operations/[id]` para permitir edición
- [ ] Validar que `reservation_code` sea requerido según `product_type`

**Archivos a modificar:**
- `app/api/operations/route.ts`
- `app/api/operations/[id]/route.ts`

#### 1.4. Actualizar Tipos TypeScript
- [ ] Agregar `reservation_code` a tipos de `operations` en `lib/supabase/types.ts`

**Archivos a modificar:**
- `lib/supabase/types.ts`

#### 1.5. Mostrar en Tablas y Detalles
- [ ] Agregar columna "Cod. Rva" en tabla de operaciones
- [ ] Mostrar código en página de detalle de operación
- [ ] Agregar filtro opcional por código de reserva

**Archivos a modificar:**
- `components/operations/operations-table.tsx`
- `app/(dashboard)/operations/[id]/page.tsx`

---

### 2. Finanzas - Revisión Completa
**Prioridad:** 🔴 ALTA  
**Descripción del problema:**

Revisión general del módulo de Finanzas para identificar y corregir problemas, inconsistencias y mejoras necesarias.

**Plan de Acción:**
- [ ] **Auditoría completa del módulo de Finanzas**
  - Revisar flujos de ingreso/egreso
  - Verificar cálculos de conversión de moneda
  - Validar asociación con operaciones
  - Revisar estado de pagos (PENDIENTE, PAGADO, VENCIDO)
  - Verificar integración con ledger/contabilidad

- [ ] **Documentar problemas encontrados**
  - Listar inconsistencias
  - Priorizar por impacto
  - Crear tickets de corrección

**Archivos a revisar:**
- `components/cash/*.tsx`
- `app/api/cash/**/*.ts`
- `app/(dashboard)/cash/**/*.tsx`
- `lib/accounting/*.ts`

**Nota:** Este item requiere investigación detallada y feedback específico del cliente sobre qué aspectos específicos revisar.

---

### 3. Registro de Pago en Finanzas
**Prioridad:** 🔴 ALTA  
**Descripción del problema:**

Mejorar o corregir el formulario y flujo de registro de pagos en el módulo de Finanzas.

**Plan de Acción:**

#### 3.1. Revisar Formulario Actual
- [ ] Analizar `components/cash/income-form.tsx` o componente equivalente
- [ ] Identificar campos faltantes o problemas de UX
- [ ] Verificar validaciones

#### 3.2. Mejoras Identificadas (a confirmar con cliente)
- [ ] [Detalle específico pendiente de feedback del cliente]
- [ ] [Detalle específico pendiente de feedback del cliente]

**Archivos a revisar:**
- `components/cash/*payment*.tsx`
- `app/api/cash/**/route.ts`

---

### 4. Filtros de Pago a Proveedores
**Prioridad:** 🟡 MEDIA  
**Descripción del problema:**

Mejorar los filtros disponibles en la página de "Pagos a Operadores" / "Pagos a Proveedores".

**Análisis:**
- Actualmente existe filtro por `operatorId` y `status` en `app/api/accounting/operator-payments/route.ts`
- Puede necesitar más filtros: fecha, monto, operación asociada, etc.

**Plan de Acción:**

#### 4.1. Identificar Filtros Requeridos
- [ ] Consultar con cliente qué filtros específicos necesita
- [ ] Posibles filtros: operador, estado, rango de fechas, monto mínimo/máximo, operación asociada

#### 4.2. Implementar Filtros Adicionales
- [ ] Agregar filtros en backend (`GET /api/accounting/operator-payments`)
- [ ] Actualizar componente `components/accounting/operator-payments-page-client.tsx`
- [ ] Agregar UI para filtros (similar a `OperationsFilters`)

**Archivos a modificar:**
- `app/api/accounting/operator-payments/route.ts`
- `components/accounting/operator-payments-page-client.tsx`
- Crear componente: `components/accounting/operator-payments-filters.tsx` (si no existe)

---

### 5. Descarga de Planillas a Excel
**Prioridad:** 🟡 MEDIA  
**Descripción del problema:**

> "Nos sería de utilidad poder descargar a excel el detalle tanto de ds x ventas y cuentas por pagar a proveedores para controles internos."

**Análisis:**
- Necesitan exportar a Excel:
  1. **Detalle de Ventas por Operador (DS x Ventas)**: Informe de ventas desglosadas por operador
  2. **Cuentas por Pagar a Proveedores**: Listado de pagos pendientes/realizados a operadores

**Plan de Acción:**

#### 5.1. Investigar Librería de Excel
- [ ] Decidir librería (posibles: `xlsx`, `exceljs`, `xlsx-populate`)
- [ ] Instalar dependencia: `npm install xlsx` o similar

#### 5.2. Endpoint de Exportación - DS x Ventas
- [ ] Crear endpoint `GET /api/reports/sales-by-operator/export`
- [ ] Generar Excel con columnas:
  - Operación (file_code, destino, fecha)
  - Operador
  - Monto de venta
  - Moneda
  - Comisión
  - Fechas relevantes
- [ ] Agregar formato (headers, colores, ancho de columnas)

**Archivos a crear:**
- `app/api/reports/sales-by-operator/export/route.ts`
- `lib/reports/excel-export.ts` (utilidades compartidas)

#### 5.3. Endpoint de Exportación - Cuentas por Pagar
- [ ] Crear endpoint `GET /api/accounting/operator-payments/export`
- [ ] Generar Excel con columnas:
  - Operador
  - Operación asociada
  - Monto
  - Fecha de vencimiento
  - Estado (PENDIENTE, PAGADO, VENCIDO)
  - Fecha de pago (si aplica)
  - Método de pago

**Archivos a crear:**
- `app/api/accounting/operator-payments/export/route.ts`

#### 5.4. UI para Exportar
- [ ] Agregar botón "Exportar a Excel" en página de reportes
- [ ] Agregar botón "Exportar a Excel" en página de pagos a operadores
- [ ] Mostrar loading durante exportación
- [ ] Descargar archivo automáticamente

**Archivos a modificar:**
- `components/reports/*-report.tsx`
- `components/accounting/operator-payments-page-client.tsx`

---

### 6. Conversor de Moneda en Cobros y Pagos
**Prioridad:** 🔴 ALTA  
**Fecha identificada:** 16/01/26  
**Descripción del problema:**

> "Es importante tanto para cobros y pagos tener un conversor de moneda ya que muchos clientes pagan en pesos y el ingreso al banco o caja tiene que ser en pesos pero la operación que cancela es en USD. Acá por ejemplo cargué una cobranza en pesos y me la tomó como en USD."

**Análisis:**
- El sistema no está diferenciando correctamente la moneda del pago/cobro vs la moneda de la operación
- Falta un campo o selector explícito para la moneda en formularios de pago/cobro
- La conversión automática no está funcionando o no está implementada
- El sistema está asumiendo incorrectamente la moneda basándose en la operación

**Plan de Acción:**

#### 1.1. Agregar Selector de Moneda en Formularios de Pago/Cobro
- [ ] Agregar campo `currency` en formulario de cobro (cash/income)
- [ ] Agregar campo `currency` en formulario de pago (cash/expenses)
- [ ] Hacer el campo requerido con validación
- [ ] Mostrar conversión automática basada en tipo de cambio actual

**Archivos a modificar:**
- `components/cash/income-form.tsx` (o componente similar)
- `components/cash/expense-form.tsx` (o componente similar)
- `app/api/cash/[income|expenses]/route.ts`

#### 1.2. Implementar Conversión de Moneda Automática
- [ ] Crear función de conversión basada en `exchange_rates` o tipo de cambio actual
- [ ] Calcular monto equivalente en moneda de la operación
- [ ] Mostrar ambos montos (monto original y monto equivalente) en la UI
- [ ] Guardar ambas monedas en la base de datos

**Archivos a crear/modificar:**
- `lib/currency.ts` (crear si no existe, o usar el existente)
- Lógica de conversión en API routes de cash

#### 1.3. Validar Moneda en Asociación con Operación
- [ ] Verificar que cuando se cancela una operación en USD con un pago en ARS, se convierta correctamente
- [ ] Mostrar alerta o confirmación si la moneda difiere de la operación
- [ ] Guardar el tipo de cambio usado para auditoría

**Archivos a modificar:**
- `app/api/cash/movements/route.ts` (o endpoint relevante)
- Componentes de registro de pago/cobro

#### 1.4. Actualizar Historial de Pagos
- [ ] Mostrar ambas monedas en tabla de historial
- [ ] Indicar claramente moneda original vs moneda convertida
- [ ] Mostrar tipo de cambio aplicado

**Archivos a modificar:**
- `components/cash/payments-table.tsx` (o componente de historial)

#### 6.5. Testing del Conversor de Moneda
- [ ] Test: Cobro en ARS para operación en USD
- [ ] Test: Pago en ARS para operación en USD
- [ ] Test: Cobro en USD para operación en USD (caso normal)
- [ ] Test: Verificar conversión correcta según tipo de cambio
- [ ] Test: Validar guardado de ambas monedas en BD

---

### 7. Forma de Cargar Pagos con Tarjeta de Crédito (TC)
**Prioridad:** 🟡 MEDIA  
**Descripción del problema:**

Facilitar el registro de pagos realizados con Tarjeta de Crédito.

**Análisis:**
- Actualmente el sistema tiene métodos de pago en formularios de cash/payments
- Puede no estar bien integrado o puede faltar información específica de TC (últimos 4 dígitos, banco emisor, cuotas, etc.)
- Necesitan un flujo simplificado para cargar pagos con TC

**Plan de Acción:**

#### 7.1. Revisar Método de Pago Actual
- [ ] Revisar qué métodos de pago están disponibles en formularios
- [ ] Verificar si existe "Tarjeta de Crédito" o "TC" como opción
- [ ] Identificar campos faltantes relacionados con TC

**Archivos a revisar:**
- `components/cash/*payment*.tsx`
- `components/payments/*.tsx`
- `app/api/payments/route.ts`

#### 7.2. Agregar/Mejorar Campos para TC
- [ ] Agregar campo "Método de Pago" si no existe con opción "Tarjeta de Crédito"
- [ ] Agregar campos adicionales si son necesarios:
  - Últimos 4 dígitos de la tarjeta
  - Banco emisor (opcional)
  - Cuotas (opcional)
  - Fecha de acreditación
- [ ] Actualizar schema de validación

**Archivos a modificar:**
- `components/cash/*payment-form*.tsx`
- `app/api/payments/route.ts`
- Verificar schema de BD: tabla `payments` o `cash_movements`

#### 7.3. Migración de Base de Datos (si es necesario)
- [ ] Verificar si tabla `payments` tiene campo `payment_method`
- [ ] Si no existe, crear migración para agregar campo
- [ ] Opcional: Crear tabla `payment_methods` con valores predefinidos

**Archivos a crear:**
- `supabase/migrations/XXX_add_payment_method_to_payments.sql` (si es necesario)

#### 7.4. UI Mejorada para TC
- [ ] Agregar sección específica para pagos con TC
- [ ] Mostrar campos adicionales solo cuando se selecciona "Tarjeta de Crédito"
- [ ] Validaciones específicas para TC

**Archivos a modificar:**
- Formularios de pago/cobro en `components/cash/`

#### 7.5. Testing
- [ ] Test: Registrar pago con TC
- [ ] Test: Verificar guardado correcto de datos
- [ ] Test: Validar que se muestra correctamente en historial

**Nota:** Este item requiere confirmación del cliente sobre qué información específica necesita capturar para pagos con TC.

---

## 📝 NOTAS ADICIONALES

### Consideraciones Técnicas

1. **Tipo de Cambio:**
   - Verificar si existe tabla `exchange_rates` en la BD
   - Si no existe, considerar usar API externa o permitir configuración manual
   - Guardar histórico de tipos de cambio para auditoría

2. **Base de Datos:**
   - Verificar si las tablas de cash tienen campo `currency`
   - Si no existe, crear migración para agregar el campo
   - Considerar agregar campos `original_amount`, `original_currency`, `converted_amount`, `converted_currency`, `exchange_rate`

3. **Validaciones:**
   - Validar que el tipo de cambio esté disponible antes de permitir conversión
   - Mostrar error claro si no hay tipo de cambio disponible
   - Permitir ingreso manual de tipo de cambio si es necesario

4. **UX/UI:**
   - Mostrar claramente la conversión en tiempo real mientras el usuario escribe
   - Usar badges o indicadores visuales para diferenciar monedas
   - Tooltips explicativos sobre la conversión

---

## 🎯 PRIORIZACIÓN GENERAL

### Fase 1 - Alta Prioridad (Crítico) - 3-4 días
1. **Agregar Código de Reserva (Cod. Rva) Aéreo y Terrestre** - 0.5 días
2. **Conversor de Moneda en Cobros y Pagos** - 2-3 días
3. **Registro de Pago en Finanzas** - 0.5 días (requiere revisión previa)
4. **Finanzas - Revisión Completa** - 1 día (requiere investigación)

### Fase 2 - Media Prioridad (Importante) - 2-3 días
5. **Filtros de Pago a Proveedores** - 1 día
6. **Descarga de Planillas a Excel** - 1-1.5 días
7. **Forma de Cargar Pagos con Tarjeta de Crédito (TC)** - 0.5-1 día

---

## 📊 ESTIMACIÓN DE TIEMPO TOTAL

- **Tiempo total estimado:** 5-7 días de desarrollo
- **Prioridad general:** ALTA
- **Impacto:** ALTO - Afecta directamente operaciones, contabilidad y gestión financiera

### Desglose por Item:

| Item | Prioridad | Tiempo Estimado | Complejidad |
|------|-----------|-----------------|-------------|
| 1. Cod. Rva Aéreo y Terrestre | 🔴 ALTA | 0.5 días | Media |
| 2. Finanzas - Revisión Completa | 🔴 ALTA | 1 día | Media-Alta |
| 3. Registro de Pago en Finanzas | 🔴 ALTA | 0.5 días | Baja-Media |
| 4. Filtros de Pago a Proveedores | 🟡 MEDIA | 1 día | Baja |
| 5. Descarga de Planillas a Excel | 🟡 MEDIA | 1-1.5 días | Media |
| 6. Conversor de Moneda | 🔴 ALTA | 2-3 días | Alta |
| 7. Forma de Cargar Pagos con TC | 🟡 MEDIA | 0.5-1 día | Media |

---

## ✅ CHECKLIST GENERAL DE IMPLEMENTACIÓN

### Item 1: Cod. Rva Aéreo y Terrestre
- [ ] Migración SQL para agregar `reservation_code`
- [ ] Actualizar formularios de operaciones
- [ ] Actualizar API de operaciones
- [ ] Actualizar tipos TypeScript
- [ ] Agregar columna en tablas
- [ ] Testing

### Item 2: Finanzas - Revisión Completa
- [ ] Auditoría completa del módulo
- [ ] Documentar problemas encontrados
- [ ] Priorizar correcciones
- [ ] Implementar correcciones críticas
- [ ] Testing

### Item 3: Registro de Pago en Finanzas
- [ ] Revisar formularios actuales
- [ ] Identificar mejoras necesarias
- [ ] Implementar mejoras
- [ ] Testing

### Item 4: Filtros de Pago a Proveedores
- [ ] Identificar filtros requeridos
- [ ] Agregar filtros en backend
- [ ] Agregar UI de filtros
- [ ] Testing

### Item 5: Descarga de Planillas a Excel
- [ ] Instalar librería de Excel
- [ ] Crear endpoint exportación DS x Ventas
- [ ] Crear endpoint exportación Cuentas por Pagar
- [ ] Agregar botones de exportación en UI
- [ ] Testing

### Item 6: Conversor de Moneda
- [ ] Migración SQL para campos de moneda
- [ ] Actualizar API routes de cash
- [ ] Crear/actualizar funciones de conversión
- [ ] Agregar selector de moneda en formularios
- [ ] Implementar conversión en tiempo real
- [ ] Actualizar tabla de historial
- [ ] Validaciones y manejo de errores
- [ ] Tests completos

### Item 7: Forma de Cargar Pagos con TC
- [ ] Revisar métodos de pago actuales
- [ ] Agregar/mejorar campos para TC
- [ ] Migración de BD (si es necesario)
- [ ] Mejorar UI para TC
- [ ] Testing

---

**Última actualización:** 16/01/26  
**Próxima revisión:** Después de implementación de Fase 1
