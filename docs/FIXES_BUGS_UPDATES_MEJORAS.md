# Documento de Fixes, Bugs, Updates y Mejoras - MAXEVA GESTION

**Fecha:** 2025-01-16
**Basado en:** Análisis estático completo del código

---

## 🔴 BUGS CRÍTICOS

### BUG #1: Tipo de Cuenta "Cuentas por Pagar" Incorrecto
- **Archivo:** `app/api/operations/route.ts:384`
- **Problema:** Al crear la cuenta financiera "Cuentas por Pagar", se marca como `type: "ASSETS"` cuando debería ser `"LIABILITIES"`
- **Impacto:** Clasificación contable incorrecta. Los pasivos aparecen como activos en reportes.
- **Prioridad:** 🔴 CRÍTICA
- **Fix:**
```typescript
// Línea 384 - Cambiar:
type: "ASSETS", // Temporal, se puede ajustar después
// Por:
type: "LIABILITIES",
```

---

## 🟡 BUGS IMPORTANTES

### BUG #2: Tasa de Cambio Fallback Silencioso
- **Archivo:** `app/api/operations/route.ts:336, 403`
- **Problema:** Si no hay tasa de cambio disponible, usa `1000` como fallback sin alertar al usuario
- **Impacto:** Cálculos de ARS equivalent pueden ser incorrectos
- **Prioridad:** 🟡 ALTA
- **Fix:** 
  - Opción A: Requerir tasa de cambio manual si no existe
  - Opción B: Alertar al usuario y permitir continuar o cancelar
  - Opción C: Usar última tasa conocida pero mostrar advertencia

### BUG #3: Validación de Fechas Incompleta
- **Archivo:** `app/api/operations/route.ts:108-126`
- **Problema:** Valida que `departure_date > operation_date` pero no valida que `return_date > departure_date` si ambos están presentes
- **Impacto:** Puede crear operaciones con fechas inválidas (regreso antes de salida)
- **Prioridad:** 🟡 ALTA
- **Fix:** Agregar validación:
```typescript
if (return_date) {
  const returnDate = new Date(return_date)
  returnDate.setHours(0, 0, 0, 0)
  if (returnDate < departureDate) {
    return NextResponse.json({ error: "La fecha de regreso debe ser posterior a la fecha de salida" }, { status: 400 })
  }
}
```

---

## 🟢 BUGS MENORES / MEJORAS

### MEJORA #1: Manejo de Errores en Operaciones Secundarias
- **Archivo:** `app/api/operations/route.ts`
- **Problema:** Muchas operaciones secundarias (IVA, alertas, mensajes) están en try-catch que no lanzan errores. Si fallan, la operación se crea igual pero sin esos datos.
- **Impacto:** Datos incompletos sin notificación al usuario
- **Prioridad:** 🟢 MEDIA
- **Recomendación:** 
  - Considerar rollback si fallan operaciones críticas
  - O al menos registrar errores de forma más visible
  - Agregar notificaciones al usuario si algo falla

### MEJORA #2: Función Deprecada Sin Eliminar
- **Archivo:** `lib/alerts/generate.ts:15-18`
- **Problema:** `generatePaymentAlerts()` marcada como @deprecated pero aún existe
- **Impacto:** Confusión, código innecesario
- **Prioridad:** 🟢 BAJA
- **Fix:** 
  1. Buscar todas las referencias a `generatePaymentAlerts()`
  2. Reemplazar por `generatePaymentReminders()`
  3. Eliminar función deprecada

### MEJORA #3: Filtro de Clientes para SELLER (Workaround)
- **Archivo:** `lib/permissions-api.ts:152, 164, 171`
- **Problema:** Usa UUID falso (`00000000-0000-0000-0000-000000000000`) para retornar query vacía
- **Impacto:** Funciona pero es un workaround poco elegante
- **Prioridad:** 🟢 BAJA
- **Recomendación:** Considerar usar `.limit(0)` o método más elegante

### MEJORA #4: Inconsistencia en Validación de Roles
- **Archivo:** `lib/auth.ts:106-126` vs `lib/permissions.ts`
- **Problema:** Función `canAccess()` en `auth.ts` tiene lógica diferente a `permissions.ts`
- **Impacto:** Posible confusión, lógica duplicada
- **Prioridad:** 🟢 BAJA
- **Recomendación:** Consolidar toda la lógica de permisos en `lib/permissions.ts`

---

## 📋 CÓDIGO OBSOLETO

### Función Deprecada
1. **`lib/alerts/generate.ts:15-18`** - `generatePaymentAlerts()`
   - **Estado:** @deprecated
   - **Reemplazo:** `generatePaymentReminders()`
   - **Acción:** Buscar referencias, reemplazar, eliminar

### Componentes Verificados
- ✅ `components/sales/leads-kanban.tsx` - **SÍ se usa** (no eliminar)
  - Se usa como fallback en `leads-page-client.tsx` cuando no hay leads de Trello

### Rutas API a Verificar
- `/api/trello/test-connection/route.ts` - Verificar uso
- `/api/trello/webhooks/route.ts` - Verificar uso
- `/api/trello/webhooks/register/route.ts` - Verificar uso
- **Acción:** Buscar referencias, documentar o eliminar

---

## 🚧 FUNCIONALIDADES FALTANTES

### Críticas (Migraciones Existen, UI No)

#### 1. Sistema de Cotizaciones
- **Migración:** `014_create_quotations.sql`
- **Tablas:** `quotations`, `quotation_items`
- **Flujo esperado:** Lead → Cotización → Aprobación → Operación
- **Decisión requerida:** 
  - **Opción A:** Implementar UI completa
  - **Opción B:** Eliminar migración y tablas

#### 2. Sistema de Tarifarios
- **Migración:** `015_create_tariffs_and_quotas.sql`
- **Tablas:** `tariffs`, `tariff_items`
- **Funcionalidad esperada:** Gestión de tarifarios de operadores
- **Decisión requerida:**
  - **Opción A:** Implementar UI
  - **Opción B:** Eliminar migración y tablas

#### 3. Sistema de Cupos
- **Migración:** `015_create_tariffs_and_quotas.sql`
- **Tablas:** `quotas`, `quota_reservations`
- **Funcionalidad esperada:** Control de cupos disponibles
- **Decisión requerida:**
  - **Opción A:** Implementar UI
  - **Opción B:** Eliminar migración y tablas

### Del ROADMAP

1. **Búsqueda Global (Cmd+K)**
   - Prioridad: Media
   - Estado: No implementado

2. **Modo Oscuro Completo**
   - Prioridad: Baja
   - Estado: Parcialmente implementado (hay ThemeToggle)

3. **Exportación de Leads/Operaciones**
   - Prioridad: Media
   - Estado: Parcialmente implementado (algunos reportes tienen exportación)

4. **Vista de Timeline de Operaciones**
   - Prioridad: Baja
   - Estado: No implementado

5. **Historial Persistente de Conversaciones con Emilia**
   - Prioridad: Media
   - Estado: Parcialmente implementado (hay conversaciones pero verificar persistencia)

6. **Reportes Avanzados (Balance Sheet, P&L)**
   - Prioridad: Media
   - Estado: No implementado

---

## 🔧 UPDATES / MEJORAS RECOMENDADAS

### Alta Prioridad

1. **Corregir Tipo de Cuenta "Cuentas por Pagar"**
   - Cambiar `type: "ASSETS"` a `type: "LIABILITIES"` en línea 384 de `app/api/operations/route.ts`

2. **Mejorar Manejo de Tasa de Cambio**
   - No usar fallback silencioso de `1000`
   - Alertar usuario o requerir tasa manual

3. **Agregar Validación de Fechas**
   - Validar que `return_date > departure_date`

### Media Prioridad

1. **Mejorar Manejo de Errores en Creación de Operaciones**
   - Considerar rollback si fallan operaciones críticas
   - Notificar al usuario si algo falla
   - Agregar sistema de notificaciones de errores

2. **Eliminar Función Deprecada**
   - Buscar referencias a `generatePaymentAlerts()`
   - Reemplazar por `generatePaymentReminders()`
   - Eliminar función

3. **Documentar Rutas API**
   - Documentar todas las rutas API
   - Eliminar o marcar como deprecated las no usadas

4. **Consolidar Lógica de Permisos**
   - Eliminar `canAccess()` de `lib/auth.ts`
   - Usar solo `lib/permissions.ts`

### Baja Prioridad

1. **Completar TODOs en Emilia**
   - Generación de PDF
   - Retry con escalas

2. **Mejorar Filtro de Clientes para SELLER**
   - Evitar workaround de UUID falso
   - Usar método más elegante

3. **Validaciones Adicionales**
   - Validar formato de teléfonos
   - Validar formato de emails
   - Validar rangos de fechas más estrictos

---

## 📊 RESUMEN DE PRIORIDADES

### 🔴 Crítico (Hacer Inmediatamente)
1. Corregir tipo de cuenta "Cuentas por Pagar" (ASSETS → LIABILITIES)

### 🟡 Importante (Hacer Pronto)
1. Mejorar manejo de tasa de cambio
2. Agregar validación return_date > departure_date
3. Decidir sobre Quotations/Tariffs/Quotas (implementar o eliminar)

### 🟢 Mejoras (Hacer Cuando Sea Posible)
1. Mejorar manejo de errores
2. Eliminar función deprecada
3. Documentar rutas API
4. Consolidar lógica de permisos
5. Completar TODOs

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Bugs Críticos
- [ ] Corregir tipo de cuenta "Cuentas por Pagar"

### Bugs Importantes
- [ ] Mejorar manejo de tasa de cambio
- [ ] Agregar validación de fechas (return_date > departure_date)

### Código Obsoleto
- [ ] Eliminar función deprecada `generatePaymentAlerts()`
- [ ] Verificar y documentar rutas API de Trello

### Funcionalidades Faltantes
- [ ] Decidir sobre Quotations/Tariffs/Quotas
- [ ] Implementar o eliminar según decisión

### Mejoras
- [ ] Mejorar manejo de errores
- [ ] Consolidar lógica de permisos
- [ ] Completar TODOs en Emilia

---

**Fin del Documento**

