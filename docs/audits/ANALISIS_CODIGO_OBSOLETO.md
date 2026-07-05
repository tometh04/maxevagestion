# Análisis de Código Obsoleto y Funcionalidades Faltantes

**Fecha:** 2025-01-16
**Estado:** Análisis completo

---

## RESUMEN EJECUTIVO

Este documento identifica código obsoleto, funcionalidades faltantes y recomendaciones de limpieza para el sistema MAXEVA GESTION.

---

## 1. CÓDIGO OBSOLETO IDENTIFICADO

### 1.1 Funciones Deprecadas

#### `lib/alerts/generate.ts`
- **Función:** `generatePaymentAlerts()`
- **Estado:** Marcada como `@deprecated`
- **Reemplazo:** Usar `generatePaymentReminders()` directamente
- **Acción:** Eliminar función deprecada o actualizar referencias

```typescript
/**
 * @deprecated Usar generatePaymentReminders() directamente
 */
export async function generatePaymentAlerts(): Promise<void> {
  await generatePaymentReminders()
}
```

**Recomendación:** Buscar todas las referencias a `generatePaymentAlerts()` y reemplazarlas por `generatePaymentReminders()`, luego eliminar la función deprecada.

---

### 1.2 Páginas/Componentes No Implementados

#### Sistema de Cotizaciones (`/quotations`)
- **Estado:** Migración existe (`014_create_quotations.sql`) pero no hay UI
- **Tablas creadas:**
  - `quotations`
  - `quotation_items`
- **Flujo esperado:** Lead → Cotización → Aprobación → Operación
- **Recomendación:** 
  - **Opción A:** Implementar UI completa para cotizaciones
  - **Opción B:** Eliminar migración y tablas si no se va a usar

#### Sistema de Tarifarios (`/tariffs`)
- **Estado:** Migración existe (`015_create_tariffs_and_quotas.sql`) pero no hay UI
- **Tablas creadas:**
  - `tariffs`
  - `tariff_items`
- **Recomendación:**
  - **Opción A:** Implementar UI para gestión de tarifarios
  - **Opción B:** Eliminar migración y tablas si no se va a usar

#### Sistema de Cupos (`/quotas`)
- **Estado:** Migración existe (`015_create_tariffs_and_quotas.sql`) pero no hay UI
- **Tablas creadas:**
  - `quotas`
  - `quota_reservations`
- **Recomendación:**
  - **Opción A:** Implementar UI para control de cupos
  - **Opción B:** Eliminar migración y tablas si no se va a usar

**Impacto:** Estas tablas ocupan espacio en la base de datos y pueden causar confusión. Si no se van a usar, es mejor eliminarlas.

---

### 1.3 Componentes Potencialmente No Usados

#### `components/sales/leads-kanban.tsx`
- **Estado:** Potencialmente no usado
- **Componentes similares:**
  - `components/sales/leads-kanban-trello.tsx` (usado)
  - `components/sales/leads-kanban-manychat.tsx` (usado)
- **Recomendación:** 
  1. Buscar referencias a `leads-kanban.tsx` en el código
  2. Si no se usa, eliminarlo
  3. Si se usa, documentar su propósito

**Acción:** Ejecutar búsqueda:
```bash
grep -r "leads-kanban" --exclude="*.tsx" --exclude="*.ts"
```

---

### 1.4 API Routes Potencialmente No Usadas

#### `/api/trello/test-connection/route.ts`
- **Estado:** Verificar uso
- **Recomendación:** 
  - Si se usa en Settings → Trello, mantener
  - Si no se usa, eliminar o documentar

#### `/api/trello/webhooks/route.ts`
- **Estado:** Verificar uso
- **Recomendación:**
  - Si es para recibir webhooks de Trello, mantener
  - Si hay otra ruta que hace lo mismo, consolidar

#### `/api/trello/webhooks/register/route.ts`
- **Estado:** Verificar uso
- **Recomendación:**
  - Si se usa para registrar webhooks, mantener
  - Si no se usa, eliminar

**Acción:** Revisar cada ruta y verificar:
1. Si se llama desde el frontend
2. Si se llama desde otras APIs
3. Si se usa en scripts
4. Si tiene documentación

---

### 1.5 TODOs en Código

#### `components/emilia/emilia-chat.tsx`
- **TODO 1:** Generación de PDF
  - **Línea:** ~676
  - **Descripción:** `// TODO: Implementar generación de PDF`
  - **Recomendación:** Implementar o eliminar funcionalidad relacionada

- **TODO 2:** Retry con escalas
  - **Línea:** ~875
  - **Descripción:** `// TODO: Implementar retry con escalas`
  - **Recomendación:** Implementar retry lógico para llamadas a API

**Acción:** 
1. Decidir si implementar estas funcionalidades
2. Si no se van a implementar, eliminar los TODOs y código relacionado
3. Si se van a implementar, crear issues/tareas

---

## 2. FUNCIONALIDADES FALTANTES

### 2.1 Sistema de Cotizaciones

**Estado:** Migración existe, UI no implementada

**Funcionalidades esperadas:**
- Crear cotización desde lead
- Editar cotización
- Enviar cotización al cliente
- Aprobar/rechazar cotización
- Convertir cotización a operación
- Historial de cotizaciones

**Impacto:** Si este flujo es importante para el negocio, debería implementarse. Si no, las tablas deberían eliminarse.

---

### 2.2 Sistema de Tarifarios

**Estado:** Migración existe, UI no implementada

**Funcionalidades esperadas:**
- Crear tarifario por operador
- Gestionar items de tarifario
- Aplicar tarifarios a cotizaciones/operaciones
- Historial de tarifarios

**Impacto:** Si los tarifarios son importantes para el negocio, debería implementarse. Si no, las tablas deberían eliminarse.

---

### 2.3 Sistema de Cupos

**Estado:** Migración existe, UI no implementada

**Funcionalidades esperadas:**
- Gestionar cupos disponibles
- Reservar cupos
- Liberar cupos
- Tracking de disponibilidad
- Alertas de cupos bajos

**Impacto:** Si el control de cupos es importante, debería implementarse. Si no, las tablas deberían eliminarse.

---

### 2.4 Funcionalidades del ROADMAP

#### Búsqueda Global (Cmd+K)
- **Estado:** No implementado
- **Prioridad:** Media
- **Descripción:** Búsqueda rápida en todo el sistema

#### Modo Oscuro Completo
- **Estado:** Parcialmente implementado (hay ThemeToggle)
- **Prioridad:** Baja
- **Descripción:** Asegurar que todos los componentes soporten modo oscuro

#### Exportación de Leads/Operaciones
- **Estado:** Parcialmente implementado (algunos reportes tienen exportación)
- **Prioridad:** Media
- **Descripción:** Exportar a Excel/PDF desde listas principales

#### Vista de Timeline de Operaciones
- **Estado:** No implementado
- **Prioridad:** Baja
- **Descripción:** Vista cronológica de eventos de una operación

#### Historial Persistente de Conversaciones con Emilia
- **Estado:** Parcialmente implementado (hay conversaciones pero verificar persistencia)
- **Prioridad:** Media
- **Descripción:** Guardar y recuperar historial de conversaciones

#### Reportes Avanzados (Balance Sheet, P&L)
- **Estado:** No implementado
- **Prioridad:** Media
- **Descripción:** Reportes contables avanzados

---

## 3. RECOMENDACIONES DE LIMPIEZA

### 3.1 Eliminar o Implementar

**Prioridad: Alta**

1. **Decidir sobre Quotations/Tariffs/Quotas:**
   - Si se van a usar: Implementar UI completa
   - Si no se van a usar: Eliminar migraciones y tablas

2. **Acción recomendada:**
   ```sql
   -- Si se decide eliminar:
   DROP TABLE IF EXISTS quota_reservations;
   DROP TABLE IF EXISTS quotas;
   DROP TABLE IF EXISTS quotation_items;
   DROP TABLE IF EXISTS quotations;
   DROP TABLE IF EXISTS tariff_items;
   DROP TABLE IF EXISTS tariffs;
   ```

3. **Crear migración de limpieza:**
   - `999_remove_unused_tables.sql` (si se decide eliminar)

---

### 3.2 Consolidar Componentes

**Prioridad: Media**

1. **Revisar `leads-kanban.tsx`:**
   - Buscar referencias
   - Si no se usa, eliminar
   - Si se usa, documentar propósito

2. **Consolidar lógica duplicada:**
   - Revisar componentes similares
   - Extraer lógica común a hooks/utilities
   - Reducir duplicación de código

---

### 3.3 Documentar APIs No Usadas

**Prioridad: Media**

1. **Para cada API route:**
   - Agregar comentario JSDoc con propósito
   - Documentar parámetros y respuestas
   - Si no se usa, marcar como `@deprecated` o eliminar

2. **Crear documentación de APIs:**
   - Lista de todas las rutas API
   - Propósito de cada una
   - Estado (activa/deprecada/obsoleta)

---

### 3.4 Completar TODOs

**Prioridad: Baja**

1. **Generación de PDF en Emilia:**
   - Evaluar necesidad
   - Implementar o eliminar TODO

2. **Retry con escalas en Emilia:**
   - Implementar lógica de retry
   - Mejorar robustez de llamadas a API

---

## 4. PLAN DE ACCIÓN

### Fase 1: Análisis y Decisión (1-2 días)
- [ ] Revisar con stakeholders sobre Quotations/Tariffs/Quotas
- [ ] Decidir si implementar o eliminar
- [ ] Documentar decisión

### Fase 2: Limpieza de Código Obsoleto (2-3 días)
- [ ] Eliminar función deprecada `generatePaymentAlerts()`
- [ ] Buscar y eliminar referencias
- [ ] Verificar uso de `leads-kanban.tsx`
- [ ] Verificar uso de rutas API de Trello
- [ ] Documentar o eliminar según corresponda

### Fase 3: Limpieza de Base de Datos (1 día)
- [ ] Si se decide eliminar tablas, crear migración
- [ ] Ejecutar migración en desarrollo
- [ ] Verificar que no hay dependencias
- [ ] Ejecutar en producción

### Fase 4: Documentación (1 día)
- [ ] Documentar todas las rutas API
- [ ] Crear guía de arquitectura
- [ ] Actualizar README con funcionalidades actuales

### Fase 5: Implementación de Funcionalidades Faltantes (Opcional)
- [ ] Priorizar funcionalidades del ROADMAP
- [ ] Implementar según prioridad
- [ ] O eliminar del ROADMAP si no son necesarias

---

## 5. MÉTRICAS DE IMPACTO

### Antes de Limpieza
- **Tablas no usadas:** 6 (quotations, quotation_items, tariffs, tariff_items, quotas, quota_reservations)
- **Funciones deprecadas:** 1
- **Componentes no verificados:** 1
- **Rutas API no documentadas:** 3
- **TODOs sin resolver:** 2

### Después de Limpieza (Estimado)
- **Tablas no usadas:** 0 (si se eliminan) o 6 (si se implementan)
- **Funciones deprecadas:** 0
- **Componentes no verificados:** 0
- **Rutas API no documentadas:** 0
- **TODOs sin resolver:** 0 o implementados

---

## 6. RIESGOS Y CONSIDERACIONES

### Riesgos de Eliminar Tablas
- **Riesgo:** Si en el futuro se necesitan, habrá que recrearlas
- **Mitigación:** Mantener migraciones en historial de Git
- **Recomendación:** Hacer backup antes de eliminar

### Riesgos de Eliminar Código
- **Riesgo:** Eliminar código que se usa indirectamente
- **Mitigación:** Búsqueda exhaustiva de referencias
- **Recomendación:** Hacer PRs pequeños y revisables

---

## 7. CONCLUSIÓN

Este análisis identifica áreas de mejora en el código y funcionalidades faltantes. La decisión más importante es sobre Quotations/Tariffs/Quotas: implementar o eliminar.

**Recomendación general:** 
1. Decidir sobre tablas no usadas (implementar o eliminar)
2. Limpiar código obsoleto identificado
3. Documentar APIs
4. Priorizar funcionalidades del ROADMAP según necesidad del negocio

---

## 8. CHECKLIST DE LIMPIEZA

- [ ] Decisión sobre Quotations/Tariffs/Quotas tomada
- [ ] Función deprecada eliminada
- [ ] Componente `leads-kanban.tsx` verificado/eliminado
- [ ] Rutas API de Trello verificadas/documentadas
- [ ] TODOs resueltos o eliminados
- [ ] Migración de limpieza creada (si aplica)
- [ ] Documentación actualizada
- [ ] Tests actualizados (si aplica)

