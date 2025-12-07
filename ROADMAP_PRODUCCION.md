# 🚀 ROADMAP PRODUCCIÓN - MAXEVA GESTION

**Objetivo:** Llevar el sistema a producción con performance óptima, funcionalidades completas y estabilidad.

**Última actualización:** Diciembre 2025

---

## 📋 RESUMEN EJECUTIVO

Este roadmap consolida todos los roadmaps anteriores y se enfoca en los gaps críticos identificados para producción.

**Estado Actual:** ~85% completo  
**Tiempo estimado hasta producción:** 5-7 días de trabajo enfocado

---

## 🔴 FASE 1: CRÍTICO PRE-PRODUCCIÓN (2-3 días)

### 1.1 Actualizar AI Copilot - Contexto Completo ✅ COMPLETADO

**Objetivo:** El AI debe tener acceso a TODAS las tablas y entender el sistema completo.

**Tareas:**
- [x] Actualizar `DATABASE_SCHEMA` en `/app/api/ai/route.ts`:
  - Agregar `destination_requirements` ✅
  - Agregar `partner_accounts` y `partner_withdrawals` ✅
  - Corregir `commissions` → `commission_records` ✅
  - Agregar `cash_boxes` completa ✅
  - Agregar `recurring_payments` ✅
  - Agregar `whatsapp_messages` y `whatsapp_templates` ✅
  - Agregar `communications` ✅
  - Agregar `operation_customers` ✅
  - Agregar `scanned_data` en documents ✅
  - Agregar `settings_trello` ✅
  - Agregar `audit_logs` ✅
  - Completar campos de `financial_accounts` (incluir nuevos tipos) ✅
- [x] Actualizar contexto de datos en tiempo real del AI:
  - Agregar datos de destination_requirements ✅
  - Agregar datos de partner_accounts ✅
  - Agregar datos de recurring_payments ✅
  - Agregar datos de whatsapp_messages ✅
- [x] Optimizar queries del AI:
  - Usar `Promise.all()` para paralelizar queries ✅
  - Reducir cantidad de datos innecesarios ✅

**Archivos a modificar:**
- `app/api/ai/route.ts`

**Estimación:** 4-6 horas

---

### 1.2 Optimización de Performance - Base de Datos ✅ COMPLETADO

**Objetivo:** El sistema debe ser rápido incluso con miles de registros.

**Tareas:**
- [x] Crear migración `050_performance_indexes_final.sql`:
  ```sql
  -- Índices compuestos para operations (queries más comunes)
  CREATE INDEX IF NOT EXISTS idx_operations_agency_status_date 
    ON operations(agency_id, status, operation_date DESC);
  
  CREATE INDEX IF NOT EXISTS idx_operations_seller_date 
    ON operations(seller_id, operation_date DESC);
  
  CREATE INDEX IF NOT EXISTS idx_operations_status_date 
    ON operations(status, operation_date DESC);
  
  -- Índices para ledger_movements
  CREATE INDEX IF NOT EXISTS idx_ledger_created_at 
    ON ledger_movements(created_at DESC);
  
  CREATE INDEX IF NOT EXISTS idx_ledger_type_created 
    ON ledger_movements(type, created_at DESC);
  
  -- Índices para cash_movements
  CREATE INDEX IF NOT EXISTS idx_cash_movement_date 
    ON cash_movements(movement_date DESC);
  
  CREATE INDEX IF NOT EXISTS idx_cash_agency_date 
    ON cash_movements(agency_id, movement_date DESC) 
    WHERE agency_id IS NOT NULL;
  
  -- Índices para alerts
  CREATE INDEX IF NOT EXISTS idx_alerts_date_status 
    ON alerts(date_due, status);
  
  CREATE INDEX IF NOT EXISTS idx_alerts_user_status 
    ON alerts(user_id, status) 
    WHERE user_id IS NOT NULL;
  ```
- [x] Agregar índices a `operations.operation_date` si no existe ✅
- [x] Verificar que todos los índices de `029_performance_indexes.sql` están aplicados ✅

**Archivos a crear:**
- `supabase/migrations/050_performance_indexes_final.sql`

**Estimación:** 2 horas

---

### 1.3 Paginación en Tablas Grandes ✅ COMPLETADO (APIs)

**Objetivo:** Evitar cargar miles de registros a la vez.

**Tareas:**
- [x] Implementar paginación en `/api/operations/route.ts`:
  - Agregar parámetros `page` y `limit` (default: 50) ✅
  - Retornar `total`, `page`, `limit`, `totalPages` ✅
  - Usar `.range()` de Supabase ✅
- [x] Implementar paginación en `/api/leads/route.ts` ✅
- [x] Implementar paginación en `/api/payments/route.ts` ✅
- [x] Implementar paginación en `/api/cash/movements/route.ts` ✅
- [ ] Actualizar componentes client-side para usar paginación (PENDIENTE - hacer después de probar):
  - `operations-table.tsx`
  - `leads-table.tsx`
  - `payments-table.tsx`
  - `cash-movements-table.tsx`
- [ ] Agregar controles de paginación (shadcn `Pagination`)

**Archivos a modificar:**
- `app/api/operations/route.ts`
- `app/api/leads/route.ts`
- `app/api/payments/route.ts`
- `app/api/cash/movements/route.ts`
- `components/operations/operations-table.tsx`
- `components/sales/leads-table.tsx`
- `components/cash/payments-table.tsx`
- `components/cash/movements-page-client.tsx`

**Estimación:** 6-8 horas

---

### 1.4 Optimizar Queries N+1 ✅ COMPLETADO

**Objetivo:** Reducir cantidad de queries a la base de datos.

**Tareas:**
- [x] Optimizar `/api/operations/route.ts`:
  - Usar `.select()` con joins explícitos ✅
  - Evitar queries individuales por operación ✅
  - Especificar campos exactos en lugar de `*` ✅
- [x] Optimizar `/api/ai/route.ts`:
  - Usar `Promise.all()` para paralelizar todas las queries ✅
  - Agrupar queries relacionadas ✅
- [x] Optimizar `/api/leads/route.ts`:
  - Cargar relaciones en una sola query ✅
  - Ya usa queries en batch (no N+1) ✅
- [x] Optimizar `/api/operations/[id]/route.ts`:
  - Paralelizar queries de customers, documents, payments, alerts ✅
- [x] Optimizar dashboard queries:
  - Ya usa `Promise.all()` en el cliente ✅
  - Combinar queries cuando sea posible ✅

**Archivos a modificar:**
- `app/api/operations/route.ts`
- `app/api/ai/route.ts`
- `app/api/leads/route.ts`
- `components/dashboard/dashboard-page-client.tsx`

**Estimación:** 4-6 horas

---

### 1.5 Mejorar Trello Integration ✅ COMPLETADO

**Objetivo:** Trello debe funcionar perfectamente y ser resiliente a errores.

**Tareas:**
- [x] Agregar validación de credenciales antes de guardar:
  - Endpoint `/api/trello/validate` que prueba API key + token ✅
  - Llamar desde `trello-settings.tsx` antes de guardar ✅
- [x] Agregar retry logic con exponential backoff:
  - En `lib/trello/sync.ts` (helper `fetchWithRetry`) ✅
  - Para webhooks y sincronización ✅
  - Manejo de rate limits mejorado (hasta 30s de espera) ✅
- [x] Mejorar error handling:
  - Capturar todos los errores de Trello API ✅
  - Logging detallado ✅
  - Mostrar errores claros al usuario (mensajes específicos por tipo de error) ✅
- [ ] Agregar indicador de progreso en tiempo real:
  - Requiere Server-Sent Events o WebSockets (complejidad alta)
  - Por ahora se muestra resumen al finalizar ✅

**Archivos a modificar:**
- `lib/trello/sync.ts`
- `app/api/trello/webhook/route.ts`
- `app/api/trello/sync/route.ts`
- `app/api/trello/validate/route.ts` (NUEVO)
- `components/settings/trello-settings.tsx`

**Estimación:** 4-6 horas

---

## 🟡 FASE 2: IMPORTANTE (3-4 días)

### 2.1 Implementar Caché ✅

**Objetivo:** Reducir carga en base de datos y mejorar velocidad.

**Tareas:**
- [x] Instalar y configurar caché (usando `unstable_cache` de Next.js) ✅
- [x] Implementar caché para:
  - Lista de agencies (TTL: 1 hora) ✅
  - Lista de operators (TTL: 1 hora) ✅
  - KPIs del dashboard (TTL: 5 minutos) ✅
  - Configuración de Trello (TTL: 10 minutos) ✅
- [x] Invalidar caché cuando sea necesario:
  - Al crear operador (invalidar caché de operators) ✅
  - Al crear/editar/eliminar operación (invalidar KPIs del dashboard) ✅
  - Al actualizar configuración de Trello ✅

**Archivos a crear:**
- `lib/cache.ts`

**Archivos a modificar:**
- `app/api/agencies/route.ts`
- `app/api/operators/route.ts`
- `components/dashboard/dashboard-page-client.tsx`

**Estimación:** 4-6 horas

---

### 2.2 Lazy Loading de Imágenes ✅

**Objetivo:** Cargar imágenes solo cuando sean visibles.

**Tareas:**
- [x] Implementar lazy loading en:
  - Lista de documentos (no aplica - se abren con window.open) ✅
  - Avatares de usuarios ✅
  - Imágenes de clientes (no hay imágenes directas, solo avatares) ✅
- [x] Usar `loading="lazy"` en componentes Avatar ✅
- [x] Skeleton ya está implementado en componentes (AvatarFallback) ✅

**Archivos modificados:**
- `components/ui/avatar.tsx` ✅

**Notas:**
- Los documentos se abren en nueva ventana, no se renderizan como imágenes en la página
- Los avatares ahora usan lazy loading por defecto
- No hay imágenes directas de clientes que requieran lazy loading

**Estimación:** 2-3 horas

---

### 2.3 Validaciones Robustas

**Objetivo:** Prevenir errores y datos inválidos.

**Tareas:**
- [ ] Validar en creación de operación:
  - `operation_date` no puede ser futuro
  - `departure_date` debe ser después de `operation_date`
  - Montos no pueden ser negativos
- [ ] Validar en creación de pago:
  - `date_paid` no puede ser futuro
  - `date_due` debe ser después de `date_paid` (si ambos están)
- [ ] Validar permisos en todos los endpoints:
  - Revisar cada endpoint y agregar `canPerformAction()`
- [ ] Validar en cambios de moneda:
  - Si se cambia moneda de operación, recalcular todos los movimientos contables

**Archivos a modificar:**
- `app/api/operations/route.ts`
- `app/api/payments/route.ts`
- `app/api/operations/[id]/route.ts` (PATCH)

**Estimación:** 4-6 horas

---

### 2.4 Manejo de Edge Cases

**Objetivo:** El sistema debe manejar casos extremos sin romperse.

**Tareas:**
- [ ] Al eliminar operación:
  - Verificar que se eliminen todos los movimientos contables
  - Verificar que se eliminen todas las alertas
  - Verificar que se eliminen todos los documentos (opcional)
- [ ] Al eliminar cliente:
  - Verificar que no tenga operaciones activas
  - Si tiene operaciones, mostrar error claro
- [ ] Al cambiar moneda de operación:
  - Recalcular todos los movimientos contables
  - Actualizar exchange rates
  - Recalcular balances
- [ ] Al eliminar pago:
  - Revertir movimientos contables correctamente
  - Actualizar balances de caja

**Archivos a modificar:**
- `app/api/operations/[id]/route.ts` (DELETE)
- `app/api/customers/[id]/route.ts` (DELETE)
- `app/api/payments/[id]/route.ts` (DELETE)
- `app/api/operations/[id]/route.ts` (PATCH - cambio de moneda)

**Estimación:** 4-6 horas

---

## 🟢 FASE 3: NICE TO HAVE (1-2 días)

### 3.1 Completar Búsqueda Global

**Objetivo:** Búsqueda rápida en todo el sistema.

**Tareas:**
- [ ] Verificar estado actual de `command-menu.tsx`
- [ ] Implementar búsqueda en:
  - Operations (por código, destino, cliente)
  - Leads (por nombre, destino)
  - Customers (por nombre, email, teléfono)
  - Operators (por nombre)
- [ ] Agregar atajos de teclado (Cmd+K / Ctrl+K)
- [ ] Mostrar resultados con preview

**Archivos a modificar:**
- `components/command-menu.tsx`
- `app/api/search/route.ts`

**Estimación:** 3-4 horas

---

### 3.2 Mejoras UX

**Objetivo:** Experiencia de usuario pulida.

**Tareas:**
- [ ] Unificar loading states (usar skeletons consistentes)
- [ ] Agregar tooltips faltantes
- [ ] Mejorar empty states (más informativos y con CTAs)
- [ ] Agregar confirmaciones para acciones destructivas (ya está, verificar)
- [ ] Mejorar mensajes de error (más claros y accionables)

**Archivos a modificar:**
- Varios componentes

**Estimación:** 4-6 horas

---

### 3.3 Documentación

**Objetivo:** Documentación completa para usuarios y desarrolladores.

**Tareas:**
- [ ] Actualizar `MANUAL_DE_USUARIO.md`:
  - Agregar screenshots
  - Documentar todos los flujos
  - Agregar troubleshooting
- [ ] Crear `GUIA_MIGRACION_DATOS.md`:
  - Proceso de importación
  - Validación de datos
  - Errores comunes
- [ ] Crear `GUIA_TRELLO.md`:
  - Configuración paso a paso
  - Troubleshooting de webhooks
  - Estructura recomendada de boards
- [ ] Actualizar `README.md`:
  - Estado actual del proyecto
  - Stack tecnológico actualizado
  - Instrucciones de setup

**Archivos a crear/modificar:**
- `MANUAL_DE_USUARIO.md`
- `GUIA_MIGRACION_DATOS.md` (NUEVO)
- `GUIA_TRELLO.md` (NUEVO)
- `README.md`

**Estimación:** 4-6 horas

---

## 📊 CHECKLIST FINAL PRE-PRODUCCIÓN

### Datos
- [ ] Seed data limpiada (preservar Trello leads)
- [ ] Operaciones abiertas cargadas
- [ ] Saldos iniciales de caja configurados
- [ ] Clientes importados
- [ ] Operadores cargados

### Usuarios
- [ ] Usuario Maxi creado (SUPER_ADMIN) ✅
- [ ] Usuario Yamil creado (CONTABLE)
- [ ] Usuarios vendedoras creados (SELLER)
- [ ] Todos asignados a sus agencias

### Configuración
- [ ] Trello configurado para ambas agencias
- [ ] Webhooks de Trello registrados en producción
- [ ] Variables de entorno configuradas en Vercel
- [ ] OpenAI API key configurada
- [ ] Resend API key configurada (si se usa)

### Performance
- [ ] Índices agregados y verificados
- [ ] Paginación implementada en todas las tablas grandes
- [ ] Queries N+1 optimizadas
- [ ] Caché implementado
- [ ] Lazy loading de imágenes

### Funcionalidades
- [ ] AI Copilot con contexto completo
- [ ] Trello con retry logic y validación
- [ ] Validaciones implementadas
- [ ] Edge cases manejados
- [ ] Búsqueda global funcional

### Testing
- [ ] Flujo completo probado: Lead → Operación → Pago → Cierre
- [ ] Eliminaciones probadas
- [ ] Cambios de moneda probados
- [ ] Sincronización Trello probada (con muchos cards)
- [ ] AI Copilot probado con preguntas complejas
- [ ] Performance probada con datos reales

### Documentación
- [ ] Manual de usuario actualizado
- [ ] Guías de migración creadas
- [ ] Guía de Trello creada
- [ ] README actualizado

---

## 🎯 MÉTRICAS DE ÉXITO

El sistema está listo para producción cuando:

- ✅ Dashboard carga en < 2 segundos
- ✅ Listado de operaciones carga en < 1 segundo (con paginación)
- ✅ AI Copilot responde en < 5 segundos
- ✅ Sincronización Trello completa en < 30 segundos (100 cards)
- ✅ 0 errores en consola del navegador
- ✅ Todas las validaciones funcionando
- ✅ Todos los módulos conectados correctamente
- ✅ Performance aceptable con >1000 operaciones

---

## 📅 TIMELINE

**Semana 1 (Días 1-3):** Fase 1 - Crítico
- Día 1: AI Copilot + Índices
- Día 2: Paginación
- Día 3: Optimización Queries + Trello

**Semana 2 (Días 4-7):** Fase 2 - Importante
- Día 4: Caché + Lazy Loading
- Día 5: Validaciones
- Día 6: Edge Cases
- Día 7: Testing completo

**Semana 3 (Días 8-9):** Fase 3 - Nice to Have
- Día 8: Búsqueda Global + UX
- Día 9: Documentación

**Total:** 9 días de trabajo enfocado

---

## 🔄 MANTENIMIENTO POST-LANZAMIENTO

### Monitoreo
- [ ] Configurar logging detallado (Vercel Logs)
- [ ] Monitorear errores (Sentry o similar)
- [ ] Monitorear performance (Vercel Analytics)

### Mejoras Continuas
- [ ] Recopilar feedback de usuarios
- [ ] Priorizar mejoras basadas en uso real
- [ ] Iterar sobre funcionalidades existentes

---

**Última actualización:** Diciembre 2025

