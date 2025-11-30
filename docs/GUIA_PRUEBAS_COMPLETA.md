# Guía de Pruebas Completa del Sistema ERP Lozada

## Estado Actual del Sistema

### ✅ Funcionalidades Implementadas

**FASE 1: Pagos Recurrentes y Vencimientos**
- ✅ Sistema de pagos recurrentes a proveedores
- ✅ Recordatorios automáticos de pagos (7 días, 3 días, hoy, vencidos)

**FASE 2: Fechas y Recordatorios**
- ✅ Fecha de check-in en leads con recordatorios automáticos
- ✅ Alertas de vencimiento de cotizaciones y expiración automática
- ✅ Vista de calendario de eventos

**FASE 3: Facturación y Datos de Clientes**
- ✅ Facturación a terceros (tabla `billing_info`, APIs)
- ✅ Sistema de múltiples pasajeros (tabla `operation_passengers`)
- ✅ Documentación por pasajero

**FASE 4: Seguimiento y Comunicación**
- ✅ Sistema de historial de comunicaciones
- ✅ Recordatorios automáticos de seguimiento

---

## Guía de Pruebas Paso a Paso

### PREPARACIÓN

1. **Iniciar el servidor:**
   ```bash
   cd erplozada
   npm run dev
   ```
   - Deberías ver: `✓ Ready on http://localhost:3044`

2. **Acceder al sistema:**
   - URL: `http://localhost:3044`
   - Deberías ver la página de login

3. **Login:**
   - Ingresa tus credenciales
   - Deberías ver el dashboard principal

---

## PRUEBA 1: Gestión de Leads con Fechas y Depósitos

### 1.1 Crear un Lead Nuevo

**Acción:**
1. Ir a **Sales → Leads**
2. Click en **"Nuevo Lead"**
3. Completar:
   - Agencia: Seleccionar una
   - Origen: Instagram
   - Estado: NEW
   - Región: CARIBE
   - Destino: Cancún
   - Nombre: Juan Pérez
   - Teléfono: +5491112345678
   - Email: juan@example.com
   - **Fecha Estimada de Check-in:** 15/01/2025 (30 días desde hoy)
   - **Fecha Estimada de Salida:** 22/01/2025
   - **Fecha de Seguimiento:** 10/01/2025 (15 días antes del check-in)
   - Activar **"Tiene depósito recibido?"**
   - Monto del depósito: 50000
   - Moneda: ARS
   - Método: Transferencia
   - Fecha del depósito: Hoy

**Resultado Esperado:**
- ✅ Lead creado exitosamente
- ✅ Aparece en el Kanban en la columna "NEW"
- ✅ La tarjeta muestra un badge con el depósito: "$50,000 ARS"
- ✅ En **Dashboard → Caja** debería aparecer un movimiento de ingreso de $50,000 ARS
- ✅ En **Accounting → Libro Mayor** debería aparecer un movimiento de INCOME por $50,000 ARS
- ✅ En **Alerts** deberían aparecer alertas:
  - "⏰ Vence en 7 días - Pago pendiente..." (si hay pagos próximos)
  - "Lead 'Juan Pérez' - Check-in en 30 días"

### 1.2 Editar Lead y Agregar Depósito

**Acción:**
1. Click en el lead creado
2. Click en **"Editar"**
3. Modificar:
   - Cambiar estado a "IN_PROGRESS"
   - Actualizar fecha de seguimiento a mañana
4. Guardar

**Resultado Esperado:**
- ✅ Lead actualizado
- ✅ Cambia de columna en el Kanban
- ✅ Si agregaste un depósito, debería reflejarse en:
  - Dashboard de Caja
  - Libro Mayor
  - Badge en la tarjeta del lead

### 1.3 Verificar Recordatorios Automáticos

**Acción:**
1. Ir a **Alerts**
2. Revisar las alertas generadas

**Resultado Esperado:**
- ✅ Deberías ver alertas para:
  - Leads con check-in en 30 días
  - Leads con check-in en 15 días
  - Leads con seguimiento pendiente hoy
  - Pagos que vencen en 7 días
  - Pagos que vencen en 3 días
  - Pagos que vencen hoy
  - Pagos vencidos

---

## PRUEBA 2: Sistema de Pagos Recurrentes

### 2.1 Crear un Pago Recurrente

**Acción:**
1. Ir a **Accounting → Pagos Recurrentes**
2. Click en **"Nuevo Pago Recurrente"**
3. Completar:
   - Operador: Seleccionar uno
   - Agencia: Seleccionar una
   - Monto: 100000
   - Moneda: ARS
   - Frecuencia: Mensual
   - Fecha de Inicio: Hoy
   - Notas: "Alquiler de oficina"

**Resultado Esperado:**
- ✅ Pago recurrente creado
- ✅ Aparece en la tabla con estado "Activo"
- ✅ Muestra "Próxima Generación" calculada automáticamente (1 mes desde hoy)

### 2.2 Generar Pagos Recurrentes

**Acción:**
1. En **Pagos Recurrentes**, click en **"Generar Pagos Hoy"**
2. O esperar a que se ejecute el cron job diario

**Resultado Esperado:**
- ✅ Si hay pagos recurrentes con `next_generation_date <= hoy`, se generan pagos en **Accounting → Pagos a Operadores**
- ✅ Los pagos generados aparecen con estado "PENDING"
- ✅ El pago recurrente actualiza `last_generated_date` y `next_generation_date`

### 2.3 Verificar Recordatorios de Pagos

**Acción:**
1. Crear un pago a operador con fecha de vencimiento en 7 días
2. Esperar o ejecutar manualmente: `POST /api/alerts/generate-payment-reminders`

**Resultado Esperado:**
- ✅ En **Alerts** debería aparecer: "⏰ Vence en 7 días - Pago pendiente a operador..."
- ✅ Cuando falten 3 días: "⚠️ Vence en 3 días..."
- ✅ El día del vencimiento: "🔴 Vence hoy..."
- ✅ Si está vencido: "❌ Vencido..."

---

## PRUEBA 3: Calendario de Eventos

### 3.1 Ver Calendario

**Acción:**
1. Ir a **Alerts → Calendario**
2. Seleccionar diferentes fechas

**Resultado Esperado:**
- ✅ Deberías ver un calendario interactivo
- ✅ Al seleccionar una fecha, se muestran los eventos de ese día:
  - Check-ins de operaciones
  - Salidas de operaciones
  - Vencimientos de pagos
  - Vencimientos de cotizaciones
  - Seguimientos de leads
  - Alertas pendientes

### 3.2 Verificar Eventos en el Calendario

**Acción:**
1. Crear una operación con fecha de check-in en 10 días
2. Crear una cotización con `valid_until` en 5 días
3. Ir al **Calendario** y seleccionar esas fechas

**Resultado Esperado:**
- ✅ En la fecha del check-in: aparece "Check-in: [Destino]"
- ✅ En la fecha de vencimiento: aparece "Vencimiento: [Número de cotización]"
- ✅ Cada evento tiene un color distintivo

---

## PRUEBA 4: Cotizaciones con Vencimiento

### 4.1 Crear Cotización con Fecha de Vencimiento

**Acción:**
1. Ir a **Sales → Cotizaciones**
2. Crear una nueva cotización
3. Establecer **"Válida hasta"** en 3 días desde hoy
4. Enviar la cotización (estado: SENT)

**Resultado Esperado:**
- ✅ Cotización creada
- ✅ En **Alerts** debería aparecer: "⚠️ Cotización [número] vence en 3 días"
- ✅ El día del vencimiento: "🔴 Cotización [número] vence hoy"
- ✅ Después del vencimiento, la cotización cambia automáticamente a estado "EXPIRED"

### 4.2 Verificar Expiración Automática

**Acción:**
1. Crear una cotización con `valid_until` en el pasado
2. Ejecutar la función `expire_quotations()` (o esperar al cron job)

**Resultado Esperado:**
- ✅ La cotización cambia automáticamente a estado "EXPIRED"
- ✅ Ya no aparece en búsquedas de cotizaciones activas

---

## PRUEBA 5: Facturación a Terceros

### 5.1 Crear Información de Facturación

**Acción:**
1. Ir a **Operations → [Seleccionar una operación]**
2. En la sección de facturación, click en **"Facturar a tercero"**
3. Completar:
   - Tipo: COMPANY
   - Nombre de empresa: "Empresa XYZ S.A."
   - CUIT: 20-12345678-9
   - Dirección: "Av. Corrientes 1234"
   - Email: facturacion@empresa.com

**Resultado Esperado:**
- ✅ Información de facturación guardada
- ✅ Aparece en el detalle de la operación
- ✅ Se puede usar para generar facturas a nombre de la empresa

---

## PRUEBA 6: Múltiples Pasajeros

### 6.1 Agregar Pasajeros a una Operación

**Acción:**
1. Ir a **Operations → [Seleccionar una operación]**
2. En la sección "Pasajeros", click en **"Agregar Pasajero"**
3. Completar:
   - Nombre: María García
   - Apellido: López
   - Fecha de nacimiento: 15/05/1990
   - Nacionalidad: Argentina
   - Tipo de documento: DNI
   - Número: 12345678
   - Marcar como "Pasajero principal"

**Resultado Esperado:**
- ✅ Pasajero agregado
- ✅ Aparece en la lista de pasajeros
- ✅ Solo puede haber un pasajero principal

### 6.2 Vincular Documentos a Pasajeros

**Acción:**
1. En la misma operación, ir a **"Documentos"**
2. Subir un documento (ej: pasaporte)
3. Seleccionar el pasajero al que pertenece

**Resultado Esperado:**
- ✅ Documento subido
- ✅ Aparece vinculado al pasajero
- ✅ Los documentos se agrupan por pasajero en la vista

---

## PRUEBA 7: Historial de Comunicaciones

### 7.1 Registrar una Comunicación

**Acción:**
1. Ir a **Sales → Leads → [Seleccionar un lead]**
2. En la sección "Comunicaciones", click en **"Nueva Comunicación"**
3. Completar:
   - Tipo: CALL
   - Asunto: "Seguimiento de cotización"
   - Contenido: "Cliente interesado, requiere más información"
   - Fecha: Hoy
   - Duración: 15 minutos
   - Fecha de seguimiento: Mañana

**Resultado Esperado:**
- ✅ Comunicación registrada
- ✅ Aparece en el historial del lead
- ✅ Se puede filtrar por tipo (CALL, EMAIL, WHATSAPP, etc.)
- ✅ Si tiene `follow_up_date`, genera una alerta automática

---

## PRUEBA 8: Flujo Completo de Operación

### 8.1 Lead → Cotización → Operación

**Acción:**
1. Crear un lead (ver PRUEBA 1.1)
2. Desde el lead, crear una cotización
3. Aprobar la cotización
4. Convertir la cotización en operación

**Resultado Esperado:**
- ✅ Lead creado
- ✅ Cotización creada y vinculada al lead
- ✅ Al convertir, se crea la operación
- ✅ Si el lead tenía depósito, se transfiere a la operación
- ✅ El depósito aparece en:
  - Dashboard de Caja
  - Libro Mayor
  - Detalle de la operación

### 8.2 Registrar Pagos en la Operación

**Acción:**
1. En la operación creada, ir a **"Pagos"**
2. Agregar un pago de cliente:
   - Monto: 200000
   - Moneda: ARS
   - Fecha de vencimiento: 7 días desde hoy
   - Método: Transferencia

**Resultado Esperado:**
- ✅ Pago creado
- ✅ Aparece en la lista de pagos de la operación
- ✅ En **Alerts** debería aparecer: "⏰ Vence en 7 días - Pago pendiente de cliente..."
- ✅ En **Dashboard → Caja** aparece como ingreso pendiente
- ✅ En **Accounting → Libro Mayor** aparece como movimiento pendiente

### 8.3 Marcar Pago como Pagado

**Acción:**
1. En el pago creado, click en **"Marcar como Pagado"**
2. Seleccionar:
   - Fecha de pago: Hoy
   - Método: Transferencia
   - Caja: Seleccionar una

**Resultado Esperado:**
- ✅ Pago marcado como "PAID"
- ✅ Se crea un movimiento en **Dashboard → Caja**
- ✅ Se actualiza el **Libro Mayor**
- ✅ La alerta del pago desaparece o se marca como resuelta
- ✅ El saldo de la caja se actualiza

---

## PRUEBA 9: Dashboard y Reportes

### 9.1 Verificar Dashboard Principal

**Acción:**
1. Ir a **Dashboard**
2. Revisar todos los KPIs y gráficos

**Resultado Esperado:**
- ✅ KPIs muestran datos correctos:
  - Ventas del mes
  - Ingresos pendientes
  - Egresos pendientes
  - Saldo de caja
- ✅ Gráficos muestran datos:
  - Ventas por destino
  - Ventas por vendedor
  - Flujo de caja
  - Regiones (radar)
  - Destinos (pie)
- ✅ Todos los gráficos usan la paleta de colores **amber**
- ✅ Funciona correctamente en modo oscuro

### 9.2 Verificar Reportes

**Acción:**
1. Ir a **Reports**
2. Generar diferentes reportes:
   - Ventas por período
   - Comisiones
   - Flujo de caja

**Resultado Esperado:**
- ✅ Reportes se generan correctamente
- ✅ Datos son precisos
- ✅ Se pueden exportar (si está implementado)
- ✅ Colores usan la paleta **amber** (no verde)

---

## PRUEBA 10: Integración Trello Multi-Agencia

### 10.1 Verificar Leads de Trello

**Acción:**
1. Ir a **Sales → Leads**
2. Seleccionar agencia "Rosario" o "Madero"
3. Verificar que aparecen los leads de Trello

**Resultado Esperado:**
- ✅ Leads de Trello aparecen en tiempo real
- ✅ Están agrupados por lista de Trello (columnas del Kanban)
- ✅ Mantienen el orden de Trello
- ✅ Se pueden editar (con restricciones si son de Trello)
- ✅ Al hacer click, se abre el detalle con acciones disponibles

### 10.2 Sincronización en Tiempo Real

**Acción:**
1. En Trello, crear una nueva tarjeta
2. Esperar unos segundos
3. Refrescar la página de Leads

**Resultado Esperado:**
- ✅ La nueva tarjeta aparece automáticamente (si el webhook está configurado)
- ✅ O aparece después de la sincronización manual

---

## CHECKLIST FINAL

Antes de considerar las pruebas completas, verifica:

- [ ] Todos los formularios se guardan correctamente
- [ ] Los depósitos de leads se reflejan en Caja y Libro Mayor
- [ ] Las alertas se generan automáticamente
- [ ] El calendario muestra todos los eventos
- [ ] Los pagos recurrentes se generan correctamente
- [ ] Las cotizaciones expiran automáticamente
- [ ] Los pasajeros se pueden agregar y vincular documentos
- [ ] Las comunicaciones se registran correctamente
- [ ] El dashboard muestra datos correctos
- [ ] Los reportes funcionan
- [ ] El modo oscuro funciona en todas las páginas
- [ ] Todo es responsive (probar en móvil)
- [ ] Los colores usan la paleta amber (no verde)
- [ ] No hay errores en la consola del navegador

---

## Comandos Útiles para Pruebas

### Ejecutar Migraciones
```bash
# Conectar a Supabase y ejecutar las migraciones manualmente
# O usar el CLI de Supabase
```

### Generar Recordatorios Manualmente
```bash
# Desde el código o usando curl:
curl -X POST http://localhost:3044/api/alerts/generate-payment-reminders
```

### Generar Pagos Recurrentes
```bash
curl -X POST http://localhost:3044/api/recurring-payments/generate
```

### Expirar Cotizaciones
```sql
-- En Supabase SQL Editor:
SELECT expire_quotations();
```

---

## Notas Importantes

1. **Cron Jobs:** Los recordatorios y pagos recurrentes se generan automáticamente si hay un cron job configurado. Para pruebas, puedes ejecutarlos manualmente usando los endpoints API.

2. **Fechas:** Asegúrate de que las fechas de prueba sean realistas (no en el pasado muy lejano) para que las alertas funcionen correctamente.

3. **Permisos:** Algunas funcionalidades requieren permisos específicos. Asegúrate de estar logueado como ADMIN o SUPER_ADMIN para probar todo.

4. **Datos de Prueba:** Si no hay datos, algunas vistas pueden estar vacías. Crea datos de prueba usando los formularios del sistema.

---

## Soporte

Si encuentras algún problema durante las pruebas:
1. Revisa la consola del navegador (F12)
2. Revisa los logs del servidor
3. Verifica que las migraciones estén ejecutadas
4. Verifica que las APIs estén funcionando correctamente

