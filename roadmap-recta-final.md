# 🚀 ROADMAP RECTA FINAL - MAXEVA GESTIÓN

> **Objetivo**: Completar el sistema ERP de turismo con todas las funcionalidades críticas, conexiones entre módulos y mejoras de UX.
> 
> **Metodología**: Cada fase construye sobre la anterior. No avanzar a la siguiente fase sin completar la actual.

---

## 📋 ÍNDICE DE FASES

| Fase | Nombre | Duración Est. | Dependencias |
|------|--------|---------------|--------------|
| 1 | CRUD Completo de Entidades | 3-4 días | Base |
| 2 | Flujos de Negocio Conectados | 3-4 días | Fase 1 |
| 3 | Sistema de Pagos Completo | 2-3 días | Fase 2 |
| 4 | Notificaciones y Alertas | 2 días | Fase 3 |
| 5 | Dashboard y Reportes Avanzados | 2-3 días | Fase 4 |
| 6 | UX/UI Polish | 2-3 días | Fase 5 |
| 7 | Generación de Documentos | 2-3 días | Fase 6 |
| 8 | Integraciones Externas | 3-4 días | Fase 7 |

**Total estimado**: 3-4 semanas

---

## 🔴 FASE 1: CRUD COMPLETO DE ENTIDADES ✅ COMPLETADA

> **Meta**: Que todas las entidades principales tengan operaciones Crear, Leer, Actualizar y Eliminar completas.

### 1.1 Edición de Clientes ✅
- [x] **1.1.1** Crear componente `EditCustomerDialog`
  - Campos: nombre, apellido, teléfono, email, documento, fecha nacimiento, nacionalidad, instagram
  - Validación con Zod
  - API: `PATCH /api/customers/[id]`
- [x] **1.1.2** Agregar botón "Editar" en `/customers/[id]/page.tsx`
- [x] **1.1.3** Crear componente `NewCustomerDialog`
  - Campos iguales a edición
  - API: `POST /api/customers`
- [x] **1.1.4** Agregar botón "Nuevo Cliente" en `/customers/page.tsx`
- [x] **1.1.5** Agregar acción "Eliminar" con confirmación (soft delete o verificar que no tenga operaciones)

**Archivos a crear/modificar**:
```
components/customers/edit-customer-dialog.tsx (NUEVO)
components/customers/new-customer-dialog.tsx (NUEVO)
components/customers/customers-page-client.tsx (MODIFICAR)
app/(dashboard)/customers/[id]/page.tsx (MODIFICAR)
app/api/customers/[id]/route.ts (MODIFICAR - agregar PATCH, DELETE)
```

### 1.2 Edición de Operadores ✅
- [x] **1.2.1** Crear componente `EditOperatorDialog`
  - Campos: nombre, contacto, email, teléfono, límite crédito
  - API: `PATCH /api/operators/[id]`
- [x] **1.2.2** Agregar botón "Editar" en `/operators/[id]/page.tsx`
- [x] **1.2.3** Crear componente `NewOperatorDialog`
  - API: `POST /api/operators`
- [x] **1.2.4** Agregar botón "Nuevo Operador" en `/operators/page.tsx`
- [x] **1.2.5** Agregar acción "Eliminar" con confirmación

**Archivos a crear/modificar**:
```
components/operators/edit-operator-dialog.tsx (NUEVO)
components/operators/new-operator-dialog.tsx (NUEVO)
components/operators/operators-page-client.tsx (MODIFICAR)
app/(dashboard)/operators/[id]/page.tsx (MODIFICAR)
app/api/operators/[id]/route.ts (MODIFICAR - agregar PATCH, DELETE)
```

### 1.3 Edición de Operaciones ⭐ CRÍTICO ✅
- [x] **1.3.1** Crear componente `EditOperationDialog`
  - Campos: tipo, origen, destino, fechas, pasajeros, montos, vendedor, operador, estado
  - Recalcular margen automáticamente al cambiar montos
  - API: `PATCH /api/operations/[id]`
- [x] **1.3.2** Agregar botón "Editar" en `/operations/[id]/page.tsx`
- [ ] **1.3.3** Agregar botón "Editar" en la tabla de operaciones (acción rápida)
- [x] **1.3.4** Implementar cambio de estado con validaciones
  - PRE_RESERVATION → RESERVED → CONFIRMED → TRAVELLED → CLOSED
  - No permitir saltar estados
  - Al pasar a CLOSED, disparar cálculo de comisiones

**Archivos a crear/modificar**:
```
components/operations/edit-operation-dialog.tsx (NUEVO)
components/operations/operations-page-client.tsx (MODIFICAR)
components/operations/operations-table.tsx (MODIFICAR)
app/(dashboard)/operations/[id]/page.tsx (MODIFICAR)
app/api/operations/[id]/route.ts (MODIFICAR - mejorar PATCH)
```

### 1.4 Gestión de Pasajeros en Operaciones ✅
- [x] **1.4.1** En el detalle de operación, agregar sección para gestionar pasajeros
  - Botón "Agregar Pasajero" → buscar cliente existente o crear nuevo
  - Asignar rol: MAIN o COMPANION
  - Quitar pasajero de la operación
- [x] **1.4.2** API: `POST/DELETE /api/operations/[id]/customers`

**Archivos a crear/modificar**:
```
components/operations/passengers-section.tsx (NUEVO)
app/(dashboard)/operations/[id]/page.tsx (MODIFICAR)
app/api/operations/[id]/passengers/route.ts (MODIFICAR)
```

---

## 🟠 FASE 2: FLUJOS DE NEGOCIO CONECTADOS (PARCIAL)

> **Meta**: Que los módulos se comuniquen entre sí automáticamente.
> **Requiere**: Fase 1 completada

### 2.1 Flujo Lead → Cliente → Operación ✅
- [x] **2.1.1** Al convertir un lead, crear automáticamente el cliente si no existe
  - Buscar por email/teléfono si ya existe
  - Si no, crear nuevo customer con datos del lead
- [x] **2.1.2** Asociar el cliente creado a la operación como MAIN
- [x] **2.1.3** Actualizar estado del lead a "WON" automáticamente
- [ ] **2.1.4** Mostrar link al cliente y operación desde el lead convertido

**Archivos a modificar**:
```
components/sales/convert-lead-dialog.tsx (MODIFICAR)
app/api/operations/route.ts (MODIFICAR)
```

### 2.2 Conexión Tarifarios → Cotizaciones
- [ ] **2.2.1** En `NewQuotationDialog`, agregar selector de tarifario
  - Filtrar tarifarios por destino/operador/fechas
  - Al seleccionar, pre-llenar precios base
- [ ] **2.2.2** Mostrar comparativa: precio tarifario vs precio cotizado
- [ ] **2.2.3** En el detalle de cotización, mostrar tarifario usado

**Archivos a modificar**:
```
components/quotations/new-quotation-dialog.tsx (MODIFICAR)
components/quotations/quotation-detail-dialog.tsx (MODIFICAR)
app/api/quotations/route.ts (MODIFICAR)
```

### 2.3 Conexión Cupos → Operaciones
- [ ] **2.3.1** Al confirmar operación, verificar disponibilidad de cupo
  - Si hay cupo con el operador/destino/fechas, mostrar warning si no hay disponibilidad
- [ ] **2.3.2** Al confirmar operación, descontar del cupo automáticamente
- [ ] **2.3.3** Al cancelar operación, liberar cupo automáticamente
- [ ] **2.3.4** Mostrar cupos disponibles en `NewOperationDialog`

**Archivos a modificar**:
```
components/operations/new-operation-dialog.tsx (MODIFICAR)
components/operations/edit-operation-dialog.tsx (MODIFICAR)
app/api/operations/[id]/route.ts (MODIFICAR)
lib/quotas/quota-manager.ts (NUEVO)
```

### 2.4 Conexión Cotización → Operación
- [ ] **2.4.1** Mejorar conversión de cotización a operación
  - Transferir TODOS los datos: pasajeros, servicios, precios
  - Crear cliente si no existe
  - Asociar documentos de la cotización
- [ ] **2.4.2** Marcar cotización como "CONVERTED" y linkear a operación

**Archivos a modificar**:
```
app/api/quotations/[id]/convert/route.ts (MODIFICAR)
```

### 2.5 Comisiones Automáticas ✅
- [x] **2.5.1** Al pasar operación a estado CLOSED:
  - Calcular comisión del vendedor según reglas
  - Crear registro en `commission_records`
  - Notificar al vendedor
- [ ] **2.5.2** Dashboard del vendedor muestra comisiones pendientes de pago

**Archivos a modificar**:
```
app/api/operations/[id]/route.ts (MODIFICAR)
lib/commissions/commission-calculator.ts (MODIFICAR)
```

---

## 🟡 FASE 3: SISTEMA DE PAGOS COMPLETO (PARCIAL)

> **Meta**: Gestión completa del flujo de dinero.
> **Requiere**: Fase 2 completada

### 3.1 Crear Pagos desde Operación ✅
- [x] **3.1.1** Agregar botón "Nuevo Pago" en tab Pagos del detalle de operación
- [x] **3.1.2** Crear `NewPaymentDialog`
  - Tipo: Cliente o Operador
  - Dirección: Ingreso o Egreso
  - Monto, moneda, fecha vencimiento, método
- [ ] **3.1.3** Generar plan de pagos automático
  - Botón "Generar Plan de Pagos"
  - Input: cantidad de cuotas, fecha primera cuota
  - Genera N pagos con fechas escalonadas

**Archivos a crear/modificar**:
```
components/operations/new-payment-dialog.tsx (NUEVO)
components/operations/payment-plan-generator.tsx (NUEVO)
app/(dashboard)/operations/[id]/page.tsx (MODIFICAR)
```

### 3.2 Marcar Pagos como Pagados
- [ ] **3.2.1** En la tabla de pagos, botón "Marcar como Pagado"
  - Pedir fecha de pago real
  - Pedir referencia/comprobante
  - Actualizar estado a PAID
- [ ] **3.2.2** Al marcar pago de cliente como pagado:
  - Crear movimiento de caja automático (INCOME)
  - Crear asiento en libro mayor
- [ ] **3.2.3** Al marcar pago a operador como pagado:
  - Crear movimiento de caja automático (EXPENSE)
  - Crear asiento en libro mayor

**Archivos a modificar**:
```
components/cash/payments-table.tsx (MODIFICAR)
app/api/payments/mark-paid/route.ts (MODIFICAR)
```

### 3.3 Vista de Cuenta Corriente por Cliente
- [ ] **3.3.1** En detalle de cliente, agregar tab "Cuenta Corriente"
  - Mostrar saldo total: pagado vs adeudado
  - Historial de movimientos
  - Próximos vencimientos
- [ ] **3.3.2** Botón "Enviar Estado de Cuenta" (prepara para Fase 7)

**Archivos a crear/modificar**:
```
components/customers/customer-account-section.tsx (NUEVO)
app/(dashboard)/customers/[id]/page.tsx (MODIFICAR)
```

### 3.4 Vista de Cuenta Corriente por Operador
- [ ] **3.4.1** En detalle de operador, mejorar sección financiera
  - Saldo total adeudado
  - Pagos próximos a vencer
  - Historial de pagos
- [ ] **3.4.2** Alerta visual si se excede límite de crédito

**Archivos a modificar**:
```
app/(dashboard)/operators/[id]/page.tsx (MODIFICAR)
```

---

## 🟢 FASE 4: NOTIFICACIONES Y ALERTAS (PARCIAL)

> **Meta**: Sistema proactivo que avisa sobre eventos importantes.
> **Requiere**: Fase 3 completada

### 4.1 Centro de Notificaciones In-App ✅
- [x] **4.1.1** Crear componente `NotificationCenter`
  - Ícono de campana en header con badge de no leídas
  - Dropdown con últimas notificaciones
  - Link a "Ver todas"
- [ ] **4.1.2** Página `/notifications` con historial completo
- [x] **4.1.3** API: `GET/PATCH /api/notifications` (usando alertas existentes)

**Archivos a crear**:
```
components/notifications/notification-center.tsx (NUEVO)
components/notifications/notification-item.tsx (NUEVO)
app/(dashboard)/notifications/page.tsx (NUEVO)
app/api/notifications/route.ts (NUEVO)
supabase/migrations/034_create_notifications.sql (NUEVO)
```

### 4.2 Generación Automática de Notificaciones
- [ ] **4.2.1** Triggers para crear notificaciones:
  - Pago próximo a vencer (3 días antes)
  - Pago vencido
  - Viaje próximo (7 días antes)
  - Documento faltante
  - Nueva operación asignada (para vendedor)
  - Comisión generada
- [ ] **4.2.2** CRON job para generar notificaciones diarias

**Archivos a crear/modificar**:
```
lib/notifications/notification-generator.ts (NUEVO)
app/api/cron/notifications/route.ts (NUEVO)
```

### 4.3 Preferencias de Notificaciones
- [ ] **4.3.1** En perfil de usuario, configurar:
  - Qué notificaciones recibir
  - Email para alertas críticas (futuro)
- [ ] **4.3.2** Tabla `user_notification_preferences`

**Archivos a crear**:
```
components/settings/notification-preferences.tsx (NUEVO)
supabase/migrations/035_notification_preferences.sql (NUEVO)
```

### 4.4 Mejorar Página de Alertas Existente
- [ ] **4.4.1** Conectar alertas existentes con el nuevo sistema
- [ ] **4.4.2** Agregar filtros por tipo de alerta
- [ ] **4.4.3** Acciones rápidas desde la alerta (ir a operación, marcar pagado, etc.)

**Archivos a modificar**:
```
components/alerts/alerts-page-client.tsx (MODIFICAR)
components/alerts/alerts-table.tsx (MODIFICAR)
```

---

## 🔵 FASE 5: DASHBOARD Y REPORTES AVANZADOS (PARCIAL)

> **Meta**: Información ejecutiva para toma de decisiones.
> **Requiere**: Fase 4 completada

### 5.1 Dashboard Mejorado ✅
- [ ] **5.1.1** Comparativa vs período anterior
  - "Ventas +15% vs mes pasado"
  - Flechas arriba/abajo con color
- [x] **5.1.2** Widget "Próximos Viajes" (esta semana) - `UpcomingTripsCard`
- [x] **5.1.3** Widget "Alertas Pendientes" - `PendingAlertsCard`
- [ ] **5.1.4** Widget "Top 5 Vendedores del Mes"
- [ ] **5.1.5** Gráfico de tendencia últimos 6 meses

**Archivos a modificar**:
```
components/dashboard/dashboard-page-client.tsx (MODIFICAR)
components/dashboard/upcoming-trips-widget.tsx (NUEVO)
components/dashboard/overdue-payments-widget.tsx (NUEVO)
components/dashboard/top-sellers-widget.tsx (NUEVO)
components/dashboard/trend-chart.tsx (NUEVO)
```

### 5.2 Reportes Avanzados
- [ ] **5.2.1** Reporte de Rentabilidad por Destino
  - Destinos más rentables (margen promedio)
  - Volumen de ventas por destino
- [ ] **5.2.2** Reporte de Estacionalidad
  - Ventas por mes (histórico)
  - Predicción próximos meses
- [ ] **5.2.3** Reporte de Clientes
  - Clientes más frecuentes
  - Ticket promedio por cliente
  - Clientes sin actividad en X meses

**Archivos a crear**:
```
components/reports/profitability-report.tsx (NUEVO)
components/reports/seasonality-report.tsx (NUEVO)
components/reports/customers-report.tsx (NUEVO)
app/api/analytics/profitability/route.ts (NUEVO)
app/api/analytics/seasonality/route.ts (NUEVO)
```

### 5.3 Exportación de Reportes
- [ ] **5.3.1** Mejorar exportación existente
  - CSV con formato correcto
  - Excel con estilos
  - PDF básico
- [ ] **5.3.2** Programar envío de reportes por email (preparar para Fase 8)

**Archivos a modificar**:
```
app/api/reports/export/route.ts (MODIFICAR)
lib/reports/pdf-generator.ts (NUEVO)
lib/reports/excel-generator.ts (NUEVO)
```

---

## 🟣 FASE 6: UX/UI POLISH (PARCIAL)

> **Meta**: Experiencia de usuario pulida y profesional.
> **Requiere**: Fase 5 completada

### 6.1 Búsqueda Global (Command Palette) ✅
- [x] **6.1.1** Implementar ⌘K / Ctrl+K para búsqueda global
  - Buscar clientes, operaciones, leads, operadores
  - Acciones rápidas: "Nueva operación", "Ir a dashboard"
- [x] **6.1.2** Usar componente `command` de shadcn

**Archivos a crear**:
```
components/command-menu.tsx (NUEVO)
app/(dashboard)/layout.tsx (MODIFICAR)
```

### 6.2 Mejoras en Tablas
- [ ] **6.2.1** Paginación server-side en todas las tablas grandes
- [ ] **6.2.2** Persistir preferencias de columnas visibles
- [ ] **6.2.3** Vista cards en móvil para tablas principales
- [ ] **6.2.4** Bulk actions (seleccionar varios, acciones masivas)

**Archivos a modificar**:
```
components/customers/customers-table.tsx (MODIFICAR)
components/operations/operations-table.tsx (MODIFICAR)
components/sales/leads-table.tsx (MODIFICAR)
```

### 6.3 Empty States Mejorados ✅
- [x] **6.3.1** Diseñar empty states con ilustraciones
- [x] **6.3.2** CTAs claros: "Crear tu primer cliente", etc.
- [x] **6.3.3** Componente reutilizable `EmptyState`

**Archivos a crear**:
```
components/ui/empty-state.tsx (NUEVO)
```

### 6.4 Loading States y Skeletons
- [ ] **6.4.1** Skeletons para todas las páginas principales
- [ ] **6.4.2** Loading states en botones de acción
- [ ] **6.4.3** Optimistic updates donde sea posible

### 6.5 Tooltips y Ayuda Contextual
- [ ] **6.5.1** Tooltips en íconos y acciones
- [ ] **6.5.2** Hover cards para preview de datos
  - Hover en cliente → ver resumen
  - Hover en operación → ver estado y monto

**Archivos a crear/modificar**:
```
components/customers/customer-hover-card.tsx (NUEVO)
components/operations/operation-hover-card.tsx (NUEVO)
```

---

## 🟤 FASE 7: GENERACIÓN DE DOCUMENTOS

> **Meta**: Documentos profesionales para clientes y gestión interna.
> **Requiere**: Fase 6 completada

### 7.1 PDF de Cotización
- [ ] **7.1.1** Diseñar template de cotización
  - Logo, datos de la agencia
  - Datos del cliente
  - Detalle del viaje
  - Precios y condiciones
  - Fecha de validez
- [ ] **7.1.2** Botón "Descargar PDF" en detalle de cotización
- [ ] **7.1.3** Botón "Enviar por Email" (prepara para Fase 8)

**Archivos a crear**:
```
lib/pdf/quotation-template.tsx (NUEVO)
app/api/quotations/[id]/pdf/route.ts (NUEVO)
```

### 7.2 Voucher de Viaje
- [ ] **7.2.1** Diseñar template de voucher
  - Datos del pasajero
  - Itinerario
  - Servicios incluidos
  - Números de emergencia
- [ ] **7.2.2** Generar desde detalle de operación

**Archivos a crear**:
```
lib/pdf/voucher-template.tsx (NUEVO)
app/api/operations/[id]/voucher/route.ts (NUEVO)
```

### 7.3 Recibo de Pago
- [ ] **7.3.1** Diseñar template de recibo
  - Datos del pagador
  - Concepto
  - Monto y método
  - Número de recibo
- [ ] **7.3.2** Generar al marcar pago como pagado

**Archivos a crear**:
```
lib/pdf/receipt-template.tsx (NUEVO)
app/api/payments/[id]/receipt/route.ts (NUEVO)
```

### 7.4 Estado de Cuenta
- [ ] **7.4.1** PDF con resumen de cuenta del cliente
  - Pagos realizados
  - Saldo pendiente
  - Próximos vencimientos

**Archivos a crear**:
```
lib/pdf/account-statement-template.tsx (NUEVO)
app/api/customers/[id]/statement/route.ts (NUEVO)
```

---

## ⚫ FASE 8: INTEGRACIONES EXTERNAS

> **Meta**: Conectar con servicios externos para automatizar procesos.
> **Requiere**: Fase 7 completada

### 8.1 Integración Email (Resend/SendGrid)
- [ ] **8.1.1** Configurar servicio de email
- [ ] **8.1.2** Templates de email editables
  - Cotización
  - Confirmación de pago
  - Recordatorio de pago
  - Voucher de viaje
- [ ] **8.1.3** Envío desde la UI

**Archivos a crear**:
```
lib/email/email-service.ts (NUEVO)
lib/email/templates/quotation.tsx (NUEVO)
lib/email/templates/payment-confirmation.tsx (NUEVO)
lib/email/templates/payment-reminder.tsx (NUEVO)
app/api/email/send/route.ts (NUEVO)
```

### 8.2 Integración MercadoPago (Opcional)
- [ ] **8.2.1** Configurar MercadoPago
- [ ] **8.2.2** Generar link de pago para cliente
- [ ] **8.2.3** Webhook para actualizar pago automáticamente
- [ ] **8.2.4** Mostrar estado de pago en tiempo real

**Archivos a crear**:
```
lib/mercadopago/mp-service.ts (NUEVO)
app/api/payments/create-link/route.ts (NUEVO)
app/api/webhooks/mercadopago/route.ts (NUEVO)
```

### 8.3 Calendario Externo (Google Calendar)
- [ ] **8.3.1** OAuth con Google
- [ ] **8.3.2** Sincronizar viajes al calendario del vendedor
- [ ] **8.3.3** Sincronizar vencimientos de pagos

### 8.4 WhatsApp Business API (Opcional)
- [ ] **8.4.1** Envío de mensajes automáticos
  - Confirmación de cotización
  - Recordatorio de pago
  - Voucher de viaje

---

## ✅ CHECKLIST DE VERIFICACIÓN POR FASE

### Al completar cada fase, verificar:

- [ ] Todos los items marcados como completados
- [ ] Sin errores de TypeScript
- [ ] Sin errores de linter
- [ ] Probado en desarrollo local
- [ ] Responsive (probado en móvil)
- [ ] Dark mode funcionando
- [ ] Commit y push a git
- [ ] Deploy a producción
- [ ] Prueba en producción

---

## 🎯 MÉTRICAS DE ÉXITO

Al finalizar el roadmap, el sistema debe permitir:

1. ✅ CRUD completo de todas las entidades sin ir a la base de datos
2. ✅ Un lead puede convertirse en cliente + operación en menos de 2 minutos
3. ✅ El flujo de pagos está 100% conectado con movimientos de caja
4. ✅ Las alertas proactivas reducen pagos vencidos
5. ✅ El dashboard da visibilidad ejecutiva en tiempo real
6. ✅ Se pueden generar documentos profesionales para clientes
7. ✅ La UX es fluida y no requiere capacitación extensa

---

## 📝 NOTAS DE IMPLEMENTACIÓN

### Convenciones a seguir:
- Todos los diálogos usan shadcn `Dialog`
- Formularios con `react-hook-form` + `zod`
- APIs retornan `{ success: boolean, data?, error? }`
- Toast para feedback de acciones
- Español en toda la UI

### Orden de archivos en cada feature:
1. Migración SQL (si aplica)
2. API route
3. Tipos/interfaces
4. Componentes
5. Integración en página

---

**¡VAMOS A EJECUTARLO! 🚀**

*Última actualización: Diciembre 2024*

