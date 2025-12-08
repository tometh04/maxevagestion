# 🗺️ ROADMAP: MEJORAS DE OPERACIÓN DIARIA

## 📋 RESUMEN EJECUTIVO

Este roadmap aborda todos los puntos críticos de la operación diaria que actualmente no están cubiertos o necesitan mejoras. El objetivo es automatizar recordatorios, facilitar el seguimiento y mejorar la experiencia operativa.

---

## 🎯 FASE 1: PAGOS RECURRENTES Y VENCIMIENTOS

### **1.1 Pagos Recurrentes a Proveedores** ⭐ CRÍTICO

**Problema actual:**
- No existe sistema de pagos recurrentes (mensuales, quincenales, etc.)
- Los pagos a proveedores se crean manualmente cada vez
- No hay automatización para generar pagos futuros

**Solución:**
- Crear tabla `recurring_payments`:
  ```sql
  - id, operator_id, amount, currency
  - frequency: 'MONTHLY', 'WEEKLY', 'QUARTERLY', 'YEARLY'
  - start_date, end_date (opcional)
  - next_due_date (calculado automáticamente)
  - is_active
  - description/notes
  ```

- Crear job/cron que:
  - Ejecute diariamente
  - Genere `operator_payments` basados en `recurring_payments`
  - Actualice `next_due_date` automáticamente

**Archivos a crear/modificar:**
- `supabase/migrations/019_create_recurring_payments.sql`
- `lib/accounting/recurring-payments.ts` (lógica de generación)
- `app/api/recurring-payments/route.ts` (CRUD)
- `components/accounting/recurring-payments-table.tsx` (UI)
- `scripts/generate-recurring-payments.ts` (cron job)

**Prioridad:** 🔴 ALTA

---

### **1.2 Recordatorios Automáticos de Pagos Próximos a Vencer** ⭐ CRÍTICO

**Problema actual:**
- Existen alertas básicas pero no son proactivas
- No hay notificaciones automáticas X días antes del vencimiento

**Solución:**
- Extender sistema de alertas:
  - Alertas automáticas 7 días antes del vencimiento
  - Alertas automáticas 3 días antes del vencimiento
  - Alertas automáticas el día del vencimiento
  - Alertas de pagos vencidos (ya existe, mejorar)

- Crear función `generatePaymentReminderAlerts()`:
  - Se ejecuta diariamente
  - Revisa todos los pagos con `status = 'PENDING'`
  - Crea alertas según días restantes hasta `date_due`

**Archivos a crear/modificar:**
- `lib/alerts/payment-reminders.ts` (nueva función)
- `lib/alerts/generate.ts` (integrar en `generateAllAlerts()`)
- Actualizar tipos de alertas en migración

**Prioridad:** 🔴 ALTA

---

## 🎯 FASE 2: FECHAS Y RECORDATORIOS

### **2.1 Fecha de Check-in en Leads** ⭐ IMPORTANTE

**Problema actual:**
- Los leads no tienen campo `checkin_date` o `estimated_travel_date`
- No se pueden generar recordatorios de seguimiento basados en fechas de viaje

**Solución:**
- Agregar campos a tabla `leads`:
  ```sql
  - estimated_checkin_date DATE (fecha estimada de check-in)
  - estimated_departure_date DATE (fecha estimada de salida)
  - follow_up_date DATE (fecha para hacer seguimiento)
  ```

- Crear alertas automáticas:
  - Recordatorio 30 días antes de `estimated_checkin_date`
  - Recordatorio 15 días antes de `estimated_checkin_date`
  - Recordatorio de seguimiento en `follow_up_date`

**Archivos a crear/modificar:**
- `supabase/migrations/020_add_lead_dates.sql`
- `lib/alerts/lead-reminders.ts` (nueva función)
- `components/sales/edit-lead-dialog.tsx` (agregar campos)
- `components/sales/new-lead-dialog.tsx` (agregar campos)

**Prioridad:** 🟡 MEDIA

---

### **2.2 Fecha de Vencimiento de Cotizaciones** ⭐ IMPORTANTE

**Problema actual:**
- Existe campo `valid_until` en `quotations` pero no se usa para alertas
- No hay recordatorios automáticos de seguimiento

**Solución:**
- Crear alertas automáticas:
  - Recordatorio 3 días antes de `valid_until`
  - Alerta cuando `valid_until` expira (cambiar status a `EXPIRED`)
  - Recordatorio de seguimiento 7 días después de enviar cotización

- Actualizar lógica de expiración:
  - Job diario que cambie status a `EXPIRED` si `valid_until < today` y `status != 'APPROVED'`

**Archivos a crear/modificar:**
- `lib/alerts/quotation-reminders.ts` (nueva función)
- `lib/alerts/generate.ts` (integrar)
- `app/api/quotations/[id]/route.ts` (lógica de expiración)
- `components/quotations/quotations-table.tsx` (mostrar días restantes)

**Prioridad:** 🟡 MEDIA

---

### **2.3 Calendario de Eventos** ⭐ IMPORTANTE

**Problema actual:**
- No hay vista de calendario centralizada
- Difícil ver todos los eventos importantes en un solo lugar

**Solución:**
- Crear página `/calendar` con vista de calendario:
  - Check-ins de operaciones
  - Salidas (departure_date)
  - Vencimientos de pagos
  - Vencimientos de cotizaciones
  - Recordatorios de leads
  - Eventos personalizados

- Usar componente de calendario (shadcn `calendar-04` o similar)
- Filtrar por tipo de evento
- Click en evento → navegar a detalle

**Archivos a crear/modificar:**
- `app/(dashboard)/calendar/page.tsx` (nueva página)
- `components/calendar/events-calendar.tsx` (componente)
- `lib/calendar/get-events.ts` (función para obtener eventos)

**Prioridad:** 🟡 MEDIA

---

## 🎯 FASE 3: FACTURACIÓN Y DATOS DE CLIENTES

### **3.1 Facturación a Terceros** ⭐ CRÍTICO

**Problema actual:**
- No se puede facturar a nombre de otra persona/empresa
- Los datos de facturación están vinculados directamente al cliente

**Solución:**
- Crear tabla `billing_info`:
  ```sql
  - id, operation_id (o quotation_id)
  - billing_type: 'CUSTOMER', 'THIRD_PARTY', 'COMPANY'
  - company_name (si es empresa)
  - tax_id (CUIT/CUIL)
  - first_name, last_name
  - address, city, postal_code
  - phone, email
  - notes
  ```

- Modificar operaciones y cotizaciones:
  - Agregar campo `billing_info_id` (opcional)
  - Si no existe, usar datos del cliente principal
  - Si existe, usar datos de `billing_info`

**Archivos a crear/modificar:**
- `supabase/migrations/021_create_billing_info.sql`
- `app/api/billing-info/route.ts` (CRUD)
- `components/operations/operation-detail-dialog.tsx` (agregar sección facturación)
- `components/quotations/quotation-detail-dialog.tsx` (agregar sección facturación)
- `components/billing/billing-info-form.tsx` (formulario)

**Prioridad:** 🔴 ALTA

---

### **3.2 Múltiples Pasajeros con Datos Completos** ⭐ IMPORTANTE

**Problema actual:**
- Campo `passengers` en `operations` es JSONB genérico
- No hay estructura clara para datos de pasajeros
- Difícil gestionar documentación por pasajero

**Solución:**
- Crear tabla `operation_passengers`:
  ```sql
  - id, operation_id
  - passenger_number (1, 2, 3...)
  - first_name, last_name
  - document_type, document_number
  - date_of_birth
  - nationality
  - is_main_passenger (boolean)
  - billing_info_id (FK opcional, si factura a su nombre)
  ```

- Migrar datos existentes de `passengers` JSONB
- Actualizar UI para gestionar pasajeros individualmente

**Archivos a crear/modificar:**
- `supabase/migrations/022_create_operation_passengers.sql`
- `app/api/operations/[id]/passengers/route.ts` (CRUD)
- `components/operations/passengers-section.tsx` (nuevo componente)
- `components/operations/operation-detail-dialog.tsx` (integrar)

**Prioridad:** 🟡 MEDIA

---

### **3.3 Documentación por Pasajero** ⭐ IMPORTANTE

**Problema actual:**
- Documentos están vinculados a `operation_id` o `customer_id`
- No está claro qué documento pertenece a qué pasajero

**Solución:**
- Modificar tabla `documents`:
  - Agregar `passenger_id` (FK a `operation_passengers`)
  - Mantener `customer_id` y `operation_id` para compatibilidad

- Actualizar UI:
  - Mostrar documentos agrupados por pasajero
  - Permitir subir documento y asignar a pasajero específico

**Archivos a crear/modificar:**
- `supabase/migrations/023_add_passenger_to_documents.sql`
- `components/documents/documents-section.tsx` (agrupar por pasajero)
- `app/api/documents/route.ts` (agregar `passenger_id`)

**Prioridad:** 🟡 MEDIA

---

## 🎯 FASE 4: SEGUIMIENTO Y COMUNICACIÓN

### **4.1 Historial de Comunicaciones** ⭐ IMPORTANTE

**Problema actual:**
- No hay registro de llamadas, emails, WhatsApp
- Difícil hacer seguimiento de interacciones con clientes

**Solución:**
- Crear tabla `communications`:
  ```sql
  - id, customer_id (o lead_id, operation_id)
  - communication_type: 'CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'NOTE'
  - subject, content
  - date, duration (si es llamada)
  - user_id (quien hizo la comunicación)
  - follow_up_date (opcional)
  ```

- Crear UI:
  - Sección en detalle de cliente/lead/operación
  - Formulario para registrar comunicación
  - Lista de comunicaciones ordenadas por fecha

**Archivos a crear/modificar:**
- `supabase/migrations/024_create_communications.sql`
- `app/api/communications/route.ts` (CRUD)
- `components/communications/communications-section.tsx` (nuevo)
- `components/communications/new-communication-dialog.tsx` (nuevo)

**Prioridad:** 🟡 MEDIA

---

### **4.2 Recordatorios de Seguimiento Automáticos** ⭐ IMPORTANTE

**Problema actual:**
- No hay sistema para recordar cuándo hacer seguimiento
- Depende de memoria del vendedor

**Solución:**
- Usar campo `follow_up_date` en:
  - Leads
  - Cotizaciones
  - Comunicaciones

- Crear alertas automáticas:
  - Alerta el día de `follow_up_date`
  - Alerta si `follow_up_date` pasó y no hay comunicación reciente

**Archivos a crear/modificar:**
- `lib/alerts/follow-up-reminders.ts` (nueva función)
- `lib/alerts/generate.ts` (integrar)

**Prioridad:** 🟡 MEDIA

---

## 🎯 FASE 5: NOTIFICACIONES Y AUTOMATIZACIÓN

### **5.1 Sistema de Notificaciones en Tiempo Real** ⭐ IMPORTANTE

**Problema actual:**
- Las alertas existen pero no hay notificaciones push/email
- El usuario debe entrar al sistema para ver alertas

**Solución:**
- Integrar sistema de notificaciones:
  - Notificaciones en la UI (toast/banner)
  - Email opcional para alertas críticas
  - Badge en sidebar con contador de alertas pendientes

**Archivos a crear/modificar:**
- `components/notifications/notifications-bell.tsx` (nuevo)
- `app/api/notifications/route.ts` (API)
- `lib/notifications/send.ts` (lógica de envío)

**Prioridad:** 🟢 BAJA (mejora UX, no crítico)

---

### **5.2 Dashboard de Tareas Pendientes** ⭐ IMPORTANTE

**Problema actual:**
- Las alertas están dispersas
- No hay vista centralizada de "qué hacer hoy"

**Solución:**
- Crear página `/tasks` o sección en dashboard:
  - Lista de tareas pendientes del día
  - Agrupadas por tipo (pagos, seguimientos, documentación)
  - Marcar como completadas
  - Filtrar por usuario/agencia

**Archivos a crear/modificar:**
- `app/(dashboard)/tasks/page.tsx` (nueva página)
- `components/tasks/tasks-list.tsx` (componente)
- `lib/tasks/get-tasks.ts` (función)

**Prioridad:** 🟡 MEDIA

---

## 📊 RESUMEN DE PRIORIDADES

### 🔴 ALTA PRIORIDAD (Implementar primero)
1. **Pagos Recurrentes a Proveedores** (Fase 1.1)
2. **Recordatorios Automáticos de Pagos** (Fase 1.2)
3. **Facturación a Terceros** (Fase 3.1)

### 🟡 MEDIA PRIORIDAD (Implementar después)
4. **Fecha de Check-in en Leads** (Fase 2.1)
5. **Fecha de Vencimiento de Cotizaciones** (Fase 2.2)
6. **Calendario de Eventos** (Fase 2.3)
7. **Múltiples Pasajeros con Datos** (Fase 3.2)
8. **Documentación por Pasajero** (Fase 3.3)
9. **Historial de Comunicaciones** (Fase 4.1)
10. **Recordatorios de Seguimiento** (Fase 4.2)
11. **Dashboard de Tareas** (Fase 5.2)

### 🟢 BAJA PRIORIDAD (Mejoras UX)
12. **Sistema de Notificaciones en Tiempo Real** (Fase 5.1)

---

## 🚀 PLAN DE IMPLEMENTACIÓN SUGERIDO

### **Sprint 1 (Semana 1-2): Pagos y Vencimientos**
- ✅ Fase 1.1: Pagos Recurrentes
- ✅ Fase 1.2: Recordatorios de Pagos

### **Sprint 2 (Semana 3-4): Facturación**
- ✅ Fase 3.1: Facturación a Terceros

### **Sprint 3 (Semana 5-6): Fechas y Recordatorios**
- ✅ Fase 2.1: Check-in en Leads
- ✅ Fase 2.2: Vencimiento de Cotizaciones
- ✅ Fase 2.3: Calendario de Eventos

### **Sprint 4 (Semana 7-8): Pasajeros y Documentación**
- ✅ Fase 3.2: Múltiples Pasajeros
- ✅ Fase 3.3: Documentación por Pasajero

### **Sprint 5 (Semana 9-10): Comunicación y Seguimiento**
- ✅ Fase 4.1: Historial de Comunicaciones
- ✅ Fase 4.2: Recordatorios de Seguimiento
- ✅ Fase 5.2: Dashboard de Tareas

### **Sprint 6 (Semana 11+): Mejoras UX**
- ✅ Fase 5.1: Notificaciones en Tiempo Real

---

## 📝 NOTAS IMPORTANTES

1. **Compatibilidad hacia atrás:** Todas las migraciones deben mantener compatibilidad con datos existentes
2. **Permisos:** Revisar permisos en cada nueva funcionalidad
3. **Testing:** Probar cada fase antes de avanzar a la siguiente
4. **Documentación:** Actualizar manual de usuario después de cada fase
5. **UI/UX:** Usar siempre componentes de shadcn/ui y mantener consistencia visual

---

## ✅ CHECKLIST DE VALIDACIÓN

Antes de considerar una fase completa, verificar:
- [ ] Migraciones ejecutadas sin errores
- [ ] APIs funcionando correctamente
- [ ] UI responsive y accesible
- [ ] Permisos implementados
- [ ] Alertas/recordatorios funcionando
- [ ] Sin errores de TypeScript
- [ ] Sin errores de linter
- [ ] Documentación actualizada
- [ ] Probado en diferentes roles de usuario

