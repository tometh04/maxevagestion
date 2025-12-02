# 🧪 Guía de Testing Completa - ERP Lozada

## 📋 Pre-requisitos

### 1. Verificar Migraciones SQL
Asegurate de haber ejecutado todas las migraciones en Supabase SQL Editor:

```sql
-- Verificar tablas existentes
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**Tablas críticas que deben existir:**
- `users`
- `customers`
- `leads`
- `quotations`
- `operations`
- `payments`
- `ledger_movements`
- `alerts`
- `message_templates`
- `whatsapp_messages`
- `recurring_payments`
- `recurring_payment_providers`
- `operators`

### 2. Variables de Entorno
Verificar en Vercel que estén configuradas:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY` (para emails)

---

## 🎯 FASE 1: Datos Maestros

### 1.1 Crear Operadores (Proveedores de Viajes)
**Ruta:** `/settings` → Tab "Operadores"

1. Click "Nuevo Operador"
2. Crear al menos 3 operadores:
   - **Aéreos:** "Aerolíneas Argentinas", "LATAM"
   - **Hoteles:** "Booking", "Despegar"
   - **Receptivos:** "Receptivo Buenos Aires"

**Verificar:** Aparecen en la lista ✅

### 1.2 Crear Cupos (Opcional)
**Ruta:** `/quotas`

1. Click "Nuevo Cupo"
2. Crear un cupo de ejemplo:
   - Operador: Aerolíneas Argentinas
   - Fecha salida: próximos 30 días
   - Cantidad: 10
   - Costo unitario: 500 USD

**Verificar:** Aparece en la grilla de cupos ✅

---

## 🎯 FASE 2: Flujo de Ventas Completo

### 2.1 Crear Cliente
**Ruta:** `/customers`

1. Click "Nuevo Cliente"
2. Completar:
   - **Nombre:** Juan Pérez
   - **Email:** juan@test.com
   - **Teléfono:** +5491112345678 (con código de país!)
   - **Fecha de nacimiento:** (para probar cumpleaños)
   - **Documento:** 12345678

**Verificar en Supabase:**
```sql
SELECT * FROM customers ORDER BY created_at DESC LIMIT 1;
```

### 2.2 Crear Lead
**Ruta:** `/sales/leads` → Vista Kanban o Lista

1. Click "Nuevo Lead"
2. Completar:
   - **Cliente:** Juan Pérez (buscar)
   - **Destino:** Buenos Aires
   - **Fecha viaje:** próximos 60 días
   - **Pasajeros:** 2
   - **Origen:** Referido
   - **Vendedor:** (tu usuario)

**Verificar:**
- Aparece en columna "Nuevo" del Kanban ✅
- Aparece en lista de leads ✅

### 2.3 Mover Lead por el Pipeline
1. Arrastrar lead de "Nuevo" → "Contactado"
2. Arrastrar de "Contactado" → "En Negociación"

**Verificar en Supabase:**
```sql
SELECT id, status FROM leads WHERE customer_id = '[ID_CLIENTE]';
```

### 2.4 Crear Cotización
**Ruta:** Click en el lead → "Nueva Cotización" o `/quotations`

1. Click "Nueva Cotización"
2. Completar:
   - **Lead:** Seleccionar el lead creado
   - **Ítems:**
     - Vuelo: $800 USD (costo: $600)
     - Hotel: $500 USD (costo: $350)
     - Seguro: $100 USD (costo: $80)
   - **Validez:** 7 días

**Verificar:**
- PDF se genera correctamente ✅
- Cotización aparece en lista ✅
- Total: $1,400 USD ✅

### 2.5 Aprobar y Convertir Cotización
1. Abrir la cotización
2. Click "Aprobar Cotización"
3. Click "Convertir a Operación"
4. Completar pagos iniciales (opcional):
   - Seña: $500 USD

**Verificar:**
- Lead pasa a estado "WON" ✅
- Se crea Operación con código OPxxxxx ✅
- Si agregaste seña, aparece en pagos ✅

**Verificar en Supabase:**
```sql
-- Operación creada
SELECT * FROM operations ORDER BY created_at DESC LIMIT 1;

-- Lead actualizado
SELECT id, status, converted_operation_id FROM leads 
WHERE id = '[ID_LEAD]';

-- Movimiento en libro mayor
SELECT * FROM ledger_movements 
WHERE operation_id = '[ID_OPERACION]' 
ORDER BY created_at DESC;
```

---

## 🎯 FASE 3: Sistema de Pagos

### 3.1 Ver Operación y Pagos Pendientes
**Ruta:** `/operations` → Click en la operación

1. Ver resumen de pagos
2. Ver saldo pendiente

### 3.2 Crear Pago de Cliente
**Ruta:** En la operación → "Nuevo Pago"

1. Click "Nuevo Pago"
2. Completar:
   - **Tipo:** Pago de Cliente
   - **Monto:** $500 USD
   - **Método:** Transferencia
   - **Estado:** Pendiente

### 3.3 Marcar Pago como Recibido
1. En la lista de pagos, click "Marcar como Pagado"
2. Confirmar

**Verificar:**
- Pago cambia a "Pagado" ✅
- Se crea movimiento en libro mayor ✅
- Se genera mensaje WhatsApp automático ✅

**Verificar en Supabase:**
```sql
-- Pago actualizado
SELECT * FROM payments WHERE operation_id = '[ID_OP]';

-- Movimiento contable
SELECT * FROM ledger_movements 
WHERE operation_id = '[ID_OP]' 
ORDER BY created_at DESC;

-- Mensaje WhatsApp generado
SELECT * FROM whatsapp_messages 
WHERE customer_id = '[ID_CLIENTE]' 
ORDER BY created_at DESC;
```

### 3.4 Crear Pago a Proveedor
1. En la operación → "Nuevo Pago"
2. Completar:
   - **Tipo:** Pago a Proveedor
   - **Proveedor:** Aerolíneas Argentinas
   - **Monto:** $600 USD
   - **Vencimiento:** próximos 7 días

---

## 🎯 FASE 4: Sistema de Alertas

### 4.1 Generar Alertas Automáticas
**Opción A - Manual:**
1. Ir a `/api/cron/notifications` en el navegador (GET request)

**Opción B - Desde código:**
```bash
curl -X GET https://tu-dominio.vercel.app/api/cron/notifications
```

**Verificar:**
- Alertas aparecen en `/notifications` ✅
- Alertas aparecen en Dashboard ✅

### 4.2 Tipos de Alertas que se Generan
| Trigger | Tipo | Cuándo |
|---------|------|--------|
| Pago vencido | PAYMENT_DUE | Pagos con due_date pasada |
| Viaje próximo | UPCOMING_TRIP | 7 días antes del viaje |
| Docs faltantes | MISSING_DOCS | Operaciones sin documentos |
| Pago recurrente | RECURRING_PAYMENT | next_due_date <= hoy |

### 4.3 Gestionar Alertas
**Ruta:** `/notifications`

1. Ver alertas pendientes
2. Click en una alerta
3. Marcar como resuelta

---

## 🎯 FASE 5: WhatsApp Messages

### 5.1 Cargar Templates por Defecto
**Ruta:** `/messages`

1. Click "Templates"
2. Click "Cargar Templates por Defecto"

**Si da error, ejecutar en Supabase:**
```sql
-- Verificar que existe la tabla
SELECT * FROM message_templates LIMIT 1;

-- Si no existe, ejecutar migración 040
```

### 5.2 Verificar Templates Cargados
Deberían aparecer:
- ✅ Bienvenida
- ✅ Pago Recibido
- ✅ Recordatorio de Pago
- ✅ Feliz Cumpleaños
- ✅ Cotización Lista
- ✅ Viaje Próximo

### 5.3 Enviar Mensaje Rápido
**Ruta:** `/customers`

1. En cualquier cliente, click botón WhatsApp (verde)
2. Seleccionar template o escribir mensaje personalizado
3. Click "Abrir WhatsApp"

**Verificar:**
- Se abre WhatsApp Web con el mensaje pre-llenado ✅
- El teléfono es correcto ✅

### 5.4 Mensajes Automáticos
Los mensajes se generan automáticamente cuando:
- Se recibe un pago → Mensaje "Pago Recibido"
- Se crea cotización → Mensaje "Cotización Lista"
- Cumpleaños del cliente → Mensaje "Feliz Cumpleaños"

**Ver cola de mensajes pendientes:**
**Ruta:** `/messages`

---

## 🎯 FASE 6: Pagos Recurrentes

### 6.1 Crear Pago Recurrente
**Ruta:** `/accounting/recurring`

1. Click "Nuevo Pago"
2. Completar:
   - **Proveedor:** Netflix (escribir y crear nuevo)
   - **Descripción:** Suscripción mensual
   - **Monto:** 15 USD
   - **Frecuencia:** Mensual
   - **Próximo vencimiento:** Hoy o fecha pasada (para testing)

### 6.2 Generar Alertas de Pagos Recurrentes
1. Click "Generar Pagos Hoy"

**Verificar:**
- Aparece toast con cantidad generada ✅
- Se crean alertas tipo "Recurrente" ✅
- `next_due_date` se actualiza al próximo período ✅

**Verificar en Supabase:**
```sql
-- Alerta creada
SELECT * FROM alerts 
WHERE type = 'RECURRING_PAYMENT' 
ORDER BY created_at DESC;

-- Pago recurrente actualizado
SELECT id, provider_name, next_due_date 
FROM recurring_payments 
ORDER BY updated_at DESC;
```

### 6.3 Filtrar por Proveedor
1. En el dropdown "Todos los proveedores"
2. Seleccionar "Netflix"
3. Ver solo pagos de ese proveedor

---

## 🎯 FASE 7: Dashboard y Reportes

### 7.1 Verificar Dashboard
**Ruta:** `/dashboard`

**Elementos a verificar:**
- [ ] KPIs con números correctos
- [ ] Porcentajes no se salen de las cajas
- [ ] Gráfico de tendencia carga
- [ ] Card "Próximos Viajes" muestra operaciones
- [ ] Card "Alertas Pendientes" muestra alertas
- [ ] Card "Cumpleaños Hoy" (si hay)
- [ ] Top Vendedores con colores amber

### 7.2 Probar Reportes
**Ruta:** `/reports`

1. Seleccionar tipo de reporte
2. Seleccionar rango de fechas
3. Click "Exportar"

**Formatos a probar:**
- [ ] CSV
- [ ] Excel
- [ ] PDF

### 7.3 Analíticas
**Ruta:** `/analytics`

- [ ] Rentabilidad por operación
- [ ] Estacionalidad
- [ ] Top clientes

---

## 🎯 FASE 8: AI Copilot

### 8.1 Probar Búsqueda
1. Usar el copilot para buscar:
   - "Mostrar operaciones del mes"
   - "Clientes con pagos pendientes"
   - "Cuánto facturamos este mes"

### 8.2 Probar Acciones
1. "Crear un lead para Juan Pérez, destino Miami"
2. "Marcar la alerta X como resuelta"
3. "Enviar recordatorio de pago a cliente Y"

---

## 🔍 VERIFICACIÓN FINAL

### Checklist por Módulo

**Ventas:**
- [ ] Crear cliente ✅
- [ ] Crear lead ✅
- [ ] Mover lead en kanban ✅
- [ ] Crear cotización ✅
- [ ] Generar PDF cotización ✅
- [ ] Aprobar cotización ✅
- [ ] Convertir a operación ✅

**Operaciones:**
- [ ] Ver lista de operaciones ✅
- [ ] Ver detalle de operación ✅
- [ ] Agregar pasajeros ✅
- [ ] Subir documentos ✅

**Pagos:**
- [ ] Crear pago cliente ✅
- [ ] Crear pago proveedor ✅
- [ ] Marcar pago como recibido ✅
- [ ] Ver libro mayor ✅

**Notificaciones:**
- [ ] Generar alertas automáticas ✅
- [ ] Ver alertas en dashboard ✅
- [ ] Resolver alertas ✅

**WhatsApp:**
- [ ] Cargar templates ✅
- [ ] Enviar mensaje rápido ✅
- [ ] Ver cola de mensajes ✅

**Pagos Recurrentes:**
- [ ] Crear pago recurrente ✅
- [ ] Filtrar por proveedor ✅
- [ ] Generar pagos del día ✅
- [ ] Ver alertas generadas ✅

**Reportes:**
- [ ] Exportar CSV ✅
- [ ] Exportar Excel ✅
- [ ] Exportar PDF ✅

---

## 🐛 Debugging Tips

### Errores Comunes

**1. "Table does not exist"**
```sql
-- Verificar tabla
SELECT * FROM information_schema.tables 
WHERE table_name = 'nombre_tabla';

-- Ejecutar migración correspondiente
```

**2. "User not found"**
- Verificar que el usuario está logueado
- Verificar token en localStorage

**3. "Permission denied"**
- Verificar rol del usuario
- Verificar RLS policies en Supabase

**4. WhatsApp no abre**
- Verificar formato teléfono: debe ser `+549XXXXXXXXXX`
- Sin espacios ni guiones

### Logs Útiles

**Ver logs de Vercel:**
1. Ir a Vercel Dashboard
2. Proyecto → Logs
3. Filtrar por endpoint específico

**Ver logs de Supabase:**
1. Ir a Supabase Dashboard
2. Database → Logs

### Queries de Debugging

```sql
-- Últimos movimientos del libro mayor
SELECT * FROM ledger_movements ORDER BY created_at DESC LIMIT 10;

-- Alertas activas
SELECT * FROM alerts WHERE resolved_at IS NULL ORDER BY created_at DESC;

-- Mensajes WhatsApp pendientes
SELECT * FROM whatsapp_messages WHERE status = 'PENDING';

-- Pagos recurrentes próximos a vencer
SELECT * FROM recurring_payments 
WHERE is_active = true 
AND next_due_date <= CURRENT_DATE + INTERVAL '7 days'
ORDER BY next_due_date;
```

---

## 📞 Soporte

Si encontrás un bug, documentá:
1. **Paso exacto** donde falló
2. **Mensaje de error** (consola del navegador)
3. **Screenshot** si aplica
4. **Query SQL** que verificaste

¡Happy Testing! 🚀

