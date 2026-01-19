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
**Estado:** ✅ **COMPLETADO** (17/01/26)

**Descripción del problema:**

Necesidad de agregar un campo para código de reserva específico para productos Aéreos y Terrestres en las operaciones.

**Implementación completada:**

#### 1.1. Schema de Base de Datos ✅
- ✅ Migración `081_add_reservation_codes_to_operations.sql` creada
- ✅ Campos `reservation_code_air` y `reservation_code_hotel` agregados a tabla `operations`
- ✅ Campos son `TEXT` y `NULL` (opcionales)
- ✅ Índices creados para optimizar búsqueda

#### 1.2. Formulario de Operaciones ✅
- ✅ Campos agregados en `components/operations/new-operation-dialog.tsx`
- ✅ Campos agregados en `components/operations/edit-operation-dialog.tsx`
- ✅ Schema de validación (Zod) actualizado con campos opcionales
- ✅ Campos visibles para todos los tipos de operación

#### 1.3. API de Operaciones ✅
- ✅ `POST /api/operations` acepta `reservation_code_air` y `reservation_code_hotel`
- ✅ `PATCH /api/operations/[id]` permite edición de códigos
- ✅ Búsqueda global incluye códigos de reserva

#### 1.4. Tipos TypeScript ✅
- ✅ Tipos actualizados en `lib/supabase/types.ts`

#### 1.5. Tablas y Detalles ✅
- ✅ Columnas "Cod. Rva Aéreo" y "Cod. Rva Hotel" en tabla de operaciones
- ✅ Códigos visibles en página de detalle de operación
- ✅ Búsqueda global incluye códigos de reserva

**Archivos modificados:**
- ✅ `supabase/migrations/081_add_reservation_codes_to_operations.sql`
- ✅ `components/operations/new-operation-dialog.tsx`
- ✅ `components/operations/edit-operation-dialog.tsx`
- ✅ `components/operations/operations-table.tsx`
- ✅ `app/api/operations/route.ts`
- ✅ `app/api/operations/[id]/route.ts`
- ✅ `app/api/search/route.ts`
- ✅ `lib/supabase/types.ts`

**Nota:** La implementación usa dos campos separados (`reservation_code_air` y `reservation_code_hotel`) en lugar de un solo campo `reservation_code`, lo cual es más flexible y específico.

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
**Estado:** ✅ **COMPLETADO** (19/01/26)

**Descripción del problema:**

Mejorar los filtros disponibles en la página de "Pagos a Operadores" / "Pagos a Proveedores".

**Análisis:**
- Actualmente existe filtro por `operatorId` y `status` en `app/api/accounting/operator-payments/route.ts`
- Puede necesitar más filtros: fecha, monto, operación asociada, etc.

**Implementación completada:**

#### 4.1. Filtros Implementados ✅
- ✅ Filtro por Operador (selector dropdown)
- ✅ Filtro por Fecha de Vencimiento (rango de fechas con DateRangePicker)
- ✅ Filtro por Rango de Montos (monto mínimo y máximo)
- ✅ Búsqueda de Operación (por código o destino)
- ✅ Filtros existentes mejorados (Agencia, Estado)
- ✅ Debounce de 500ms para campos de texto/número (permite escribir sin interrupciones)
- ✅ Botón "Limpiar filtros" que aparece cuando hay filtros activos

#### 4.2. Archivos Modificados ✅
- ✅ `app/api/accounting/operator-payments/route.ts` - Soporte para todos los nuevos filtros
- ✅ `components/accounting/operator-payments-page-client.tsx` - UI completa con todos los filtros
- ✅ Grid responsive para mejor organización visual
- ✅ Filtros aplicados en tiempo real (selects y fechas inmediatos, texto/número con debounce)

**Detalles técnicos:**
- Los filtros se combinan con lógica AND (todos deben cumplirse)
- Filtrado de fechas en backend usando `.gte()` y `.lte()` en Supabase
- Filtrado de montos y búsqueda en JavaScript para mayor flexibilidad
- Debounce implementado con `useRef` y `setTimeout` para evitar recargas mientras se escribe

---

### 5. Descarga de Planillas a Excel
**Prioridad:** 🟡 MEDIA  
**Estado:** 🟡 **PARCIALMENTE COMPLETADO** (19/01/26)

**Descripción del problema:**

> "Nos sería de utilidad poder descargar a excel el detalle tanto de ds x ventas y cuentas por pagar a proveedores para controles internos."

**Análisis:**
- Necesitan exportar a Excel:
  1. **Detalle de Ventas por Operador (DS x Ventas)**: Informe de ventas desglosadas por operador
  2. **Cuentas por Pagar a Proveedores**: Listado de pagos pendientes/realizados a operadores

**Implementación completada:**

#### 5.1. Librería de Excel ✅
- ✅ Instalada librería `xlsx` (`npm install xlsx`)
- ✅ Implementada generación de archivos Excel en frontend

#### 5.2. Exportación - Cuentas por Pagar a Proveedores ✅
- ✅ Implementada función `handleExportExcel()` en `operator-payments-page-client.tsx`
- ✅ Genera archivo Excel con nombre: `cuentas-por-pagar-YYYY-MM-DD.xlsx`
- ✅ Dos hojas en el archivo:
  1. **"Resumen por Operador"**: Operador, Total a Pagar, Moneda, Pagado, Pendiente, Cantidad Pagos, Vencidos
  2. **"Detalle Pagos"**: Código Operación, Destino, Operador, Monto Total, Moneda, Monto Pagado, Pendiente, Fecha Vencimiento, Estado, Fecha Pago, Parcial
- ✅ Botón "Exportar Excel" en la página de pagos a operadores
- ✅ Botón deshabilitado cuando no hay pagos disponibles
- ✅ Los filtros aplicados se respetan en la exportación

**Archivos modificados:**
- ✅ `components/accounting/operator-payments-page-client.tsx` - Función de exportación completa

**Pendiente:**

#### 5.3. Endpoint de Exportación - DS x Ventas ❌
- [ ] Crear endpoint `GET /api/reports/sales-by-operator/export` o implementar en frontend
- [ ] Generar Excel con columnas:
  - Operación (file_code, destino, fecha)
  - Operador
  - Monto de venta
  - Moneda
  - Comisión
  - Fechas relevantes
- [ ] Agregar formato (headers, colores, ancho de columnas)
- [ ] Agregar botón "Exportar a Excel" en página de reportes de ventas

**Archivos a crear/modificar:**
- `app/api/reports/sales-by-operator/export/route.ts` (o implementar en frontend)
- `components/reports/*-report.tsx` - Agregar botón de exportación

---

### 6. Conversor de Moneda en Cobros y Pagos
**Prioridad:** 🔴 ALTA  
**Estado:** ✅ **COMPLETADO** (17/01/26)

**Descripción del problema:**

> "Es importante tanto para cobros y pagos tener un conversor de moneda ya que muchos clientes pagan en pesos y el ingreso al banco o caja tiene que ser en pesos pero la operación que cancela es en USD. Acá por ejemplo cargué una cobranza en pesos y me la tomó como en USD."

**Implementación completada:**

#### 1.1. Selector de Moneda en Formularios ✅
- ✅ Campo `currency` agregado en formularios de cobro y pago
- ✅ Campo requerido con validación
- ✅ Selector de moneda (ARS/USD) en `components/operations/operation-payments-section.tsx`
- ✅ Conversión automática mostrada en tiempo real

#### 1.2. Conversión de Moneda Automática ✅
- ✅ Campo `exchange_rate` obligatorio para pagos en ARS
- ✅ Cálculo automático de `amount_usd` para todos los pagos
- ✅ Función `calculateARSEquivalent` implementada en `lib/accounting/exchange-rates.ts`
- ✅ Guardado de `exchange_rate` y `amount_usd` en base de datos
- ✅ Visualización de equivalente USD en tiempo real en formularios

#### 1.3. Validación de Moneda ✅
- ✅ Validación que exige tipo de cambio para pagos en ARS
- ✅ Conversión correcta cuando se cancela operación en USD con pago en ARS
- ✅ Tipo de cambio guardado para auditoría
- ✅ Cálculo de FX_GAIN/FX_LOSS implementado

#### 1.4. Historial de Pagos ✅
- ✅ Tabla de pagos muestra moneda original
- ✅ Muestra equivalente USD cuando aplica
- ✅ Muestra tipo de cambio aplicado
- ✅ Cálculo de deudas en USD usando conversión correcta

#### 1.5. Migración de Base de Datos ✅
- ✅ Migración `083_add_exchange_rate_to_payments.sql` creada
- ✅ Columnas `exchange_rate` y `amount_usd` agregadas a tabla `payments`
- ✅ Índices creados para optimizar búsquedas

**Archivos modificados:**
- ✅ `components/operations/operation-payments-section.tsx` - Selector de moneda y campo exchange_rate
- ✅ `app/api/payments/route.ts` - Guardado de exchange_rate y amount_usd
- ✅ `app/api/payments/mark-paid/route.ts` - Conversión de moneda
- ✅ `lib/accounting/exchange-rates.ts` - Funciones de conversión
- ✅ `lib/accounting/fx.ts` - Cálculo de FX_GAIN/FX_LOSS
- ✅ `supabase/migrations/083_add_exchange_rate_to_payments.sql`

**Detalles técnicos:**
- Campo `exchange_rate` es obligatorio para pagos en ARS
- Cálculo en tiempo real: "Equivale a USD X.XX" en formularios
- Validación en frontend y backend
- Todos los KPIs se calculan en USD
- Creación de movimientos contables en CAJA y RESULTADO

---

### 7. Forma de Cargar Pagos con Tarjeta de Crédito (TC)
**Prioridad:** 🟡 MEDIA  
**Estado:** ✅ **COMPLETADO** (Básico implementado)

**Descripción del problema:**

Facilitar el registro de pagos realizados con Tarjeta de Crédito.

**Implementación completada:**

#### 7.1. Método de Pago Actual ✅
- ✅ "Tarjeta Crédito" está disponible en la lista de métodos de pago
- ✅ Método implementado en `components/operations/operation-payments-section.tsx`
- ✅ Campo `method` en formularios de pago/cobro

#### 7.2. Campos Básicos para TC ✅
- ✅ Campo "Método de Pago" con opción "Tarjeta Crédito"
- ✅ Método guardado en tabla `payments` con campo `method`
- ✅ Método visible en historial de pagos

**Archivos modificados:**
- ✅ `components/operations/operation-payments-section.tsx` - Lista de métodos incluye "Tarjeta Crédito"
- ✅ `app/api/payments/route.ts` - Guarda método de pago

**Nota:** La implementación básica está completa. Si se necesitan campos adicionales específicos para TC (últimos 4 dígitos, banco emisor, cuotas, fecha de acreditación), se pueden agregar en una mejora futura. Actualmente el sistema permite registrar pagos con tarjeta de crédito y guardar el método de pago.

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

| Item | Prioridad | Tiempo Estimado | Complejidad | Estado |
|------|-----------|-----------------|-------------|--------|
| 1. Cod. Rva Aéreo y Terrestre | 🔴 ALTA | 0.5 días | Media | ✅ Completado (17/01/26) |
| 2. Finanzas - Revisión Completa | 🔴 ALTA | 1 día | Media-Alta | ❌ Pendiente |
| 3. Registro de Pago en Finanzas | 🔴 ALTA | 0.5 días | Baja-Media | ❌ Pendiente |
| 4. Filtros de Pago a Proveedores | 🟡 MEDIA | 1 día | Baja | ✅ Completado (19/01/26) |
| 5. Descarga de Planillas a Excel | 🟡 MEDIA | 1-1.5 días | Media | 🟡 50% (Cuentas por Pagar ✅, DS x Ventas ❌) |
| 6. Conversor de Moneda | 🔴 ALTA | 2-3 días | Alta | ✅ Completado (17/01/26) |
| 7. Forma de Cargar Pagos con TC | 🟡 MEDIA | 0.5-1 día | Media | ✅ Completado (Básico) |

---

## ✅ CHECKLIST GENERAL DE IMPLEMENTACIÓN

### Item 1: Cod. Rva Aéreo y Terrestre ✅ COMPLETADO
- [x] Migración SQL para agregar `reservation_code_air` y `reservation_code_hotel`
- [x] Actualizar formularios de operaciones
- [x] Actualizar API de operaciones
- [x] Actualizar tipos TypeScript
- [x] Agregar columnas en tablas
- [x] Testing

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

### Item 4: Filtros de Pago a Proveedores ✅ COMPLETADO
- [x] Identificar filtros requeridos
- [x] Agregar filtros en backend
- [x] Agregar UI de filtros
- [x] Implementar debounce para campos de texto/número
- [x] Agregar botón limpiar filtros
- [x] Testing

### Item 5: Descarga de Planillas a Excel 🟡 PARCIAL
- [x] Instalar librería de Excel
- [ ] Crear endpoint exportación DS x Ventas
- [x] Crear función exportación Cuentas por Pagar (en frontend)
- [x] Agregar botón de exportación en UI de pagos a operadores
- [ ] Agregar botón de exportación en UI de reportes de ventas
- [x] Testing (Cuentas por Pagar)

### Item 6: Conversor de Moneda ✅ COMPLETADO
- [x] Migración SQL para campos de moneda (`exchange_rate`, `amount_usd`)
- [x] Actualizar API routes de cash y payments
- [x] Crear/actualizar funciones de conversión
- [x] Agregar selector de moneda en formularios
- [x] Implementar conversión en tiempo real
- [x] Actualizar tabla de historial
- [x] Validaciones y manejo de errores
- [x] Tests completos

### Item 7: Forma de Cargar Pagos con TC ✅ COMPLETADO (Básico)
- [x] Revisar métodos de pago actuales
- [x] Agregar método "Tarjeta Crédito" en formularios
- [x] Guardar método de pago en BD
- [x] Mostrar método en historial
- [x] Testing básico
- [ ] Campos adicionales (últimos 4 dígitos, banco, cuotas) - Pendiente si se requiere

---

**Última actualización:** 19/01/26  
**Próxima revisión:** Después de implementación de exportación DS x Ventas

---

## 📊 RESUMEN DE PROGRESO

### ✅ Completados (5 items)
1. **Agregar Código de Reserva (Cod. Rva) Aéreo y Terrestre** - ✅ 100% completado (17/01/26)
2. **Conversor de Moneda en Cobros y Pagos** - ✅ 100% completado (17/01/26)
3. **Filtros de Pago a Proveedores** - ✅ 100% completado (19/01/26)
4. **Exportación a Excel - Cuentas por Pagar** - ✅ 100% completado (19/01/26)
5. **Forma de Cargar Pagos con Tarjeta de Crédito (TC)** - ✅ 100% completado (Básico)

### 🟡 Parcialmente Completados (1 item)
1. **Descarga de Planillas a Excel** - 🟡 50% completado
   - ✅ Cuentas por Pagar a Proveedores
   - ❌ DS x Ventas (pendiente)

### ❌ Pendientes (2 items)
1. **Finanzas - Revisión Completa** - 🔴 ALTA prioridad
2. **Registro de Pago en Finanzas** - 🔴 ALTA prioridad
