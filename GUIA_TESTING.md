# 🧪 GUÍA DE TESTING END-TO-END - MAXEVA GESTIÓN

**Objetivo:** Validar el sistema completo desde el inicio hasta el cierre de una operación  
**Duración estimada:** 30-45 minutos  
**Nivel:** Testing completo de producción

---

## 📋 PRE-REQUISITOS

Antes de comenzar, verifica que tengas:

- ✅ Acceso al sistema (login funcionando)
- ✅ Usuario con rol ADMIN o SUPER_ADMIN
- ✅ Agencia seleccionada en el sistema
- ✅ Configuración de Trello activa (para pruebas de sincronización)
- ✅ Al menos 1 operador cargado
- ✅ Al menos 1 cliente de prueba

---

## 🔄 FLUJO COMPLETO: LEAD → OPERACIÓN → PAGO → CIERRE

### PASO 1: Crear un Lead Nuevo

**📍 Acción:**
1. Ir a **Sales → Leads**
2. Click en botón **"+ Nuevo Lead"**
3. Completar formulario:
   - Nombre del contacto: "Juan Pérez Test"
   - Teléfono: "+5493412345678"
   - Email: "juan.perez@test.com" (opcional)
   - Destino: "Punta Cana"
   - Región: "CARIBE"
   - Estado: "NEW"
   - Agencia: Seleccionar tu agencia
4. Click en **"Guardar"**

**✅ Resultado Esperado:**
- Aparece notificación de éxito
- El lead aparece en la columna "NEW" del Kanban
- El lead aparece en la tabla de leads
- El lead tiene un ID único

**❌ Si falla:**
- Verificar permisos del usuario
- Verificar que la agencia esté seleccionada
- Revisar consola del navegador para errores

---

### PASO 2: Actualizar Estado del Lead

**📍 Acción:**
1. En el Kanban, arrastrar el lead de "NEW" a "IN_PROGRESS"
2. O desde la tabla, cambiar estado en el dropdown

**✅ Resultado Esperado:**
- El lead se mueve a la columna "IN_PROGRESS"
- El estado se actualiza inmediatamente
- No requiere refresh de página

**❌ Si falla:**
- Verificar conexión a base de datos
- Revisar logs del servidor

---

### PASO 3: Convertir Lead a Operación

**📍 Acción:**
1. Click en el lead creado (abrir detalle)
2. Click en botón **"Convertir a Operación"**
3. Completar formulario de operación:
   - Código: Se genera automáticamente (verificar que sea único)
   - Operador: Seleccionar un operador
   - Destino: "Punta Cana"
   - Fecha de viaje: Fecha futura
   - Moneda: "USD" o "ARS"
   - Precio total: 1000
4. Click en **"Crear Operación"**

**✅ Resultado Esperado:**
- Aparece notificación de éxito
- El lead cambia automáticamente a estado "WON"
- Se crea la operación con el código generado
- La operación tiene estado "PRE_RESERVATION"
- Se redirige a la página de detalle de la operación
- El cliente se crea automáticamente si no existía

**❌ Si falla:**
- Verificar que el operador existe
- Verificar permisos
- Revisar logs de la API

---

### PASO 4: Ver Detalle de Operación

**📍 Acción:**
1. En la página de detalle de operación, verificar:
   - Código de operación visible
   - Cliente asociado correctamente
   - Operador asociado correctamente
   - Estado actual
   - Precio total
   - Fecha de viaje

**✅ Resultado Esperado:**
- Todos los datos se muestran correctamente
- El cliente es clickeable (link a detalle)
- El operador es clickeable (link a detalle)
- Se puede cambiar el estado

**❌ Si falla:**
- Verificar que la operación se creó correctamente
- Revisar consola del navegador

---

### PASO 5: Agregar Pago de Cliente

**📍 Acción:**
1. En la página de operación, ir a la sección **"Pagos de Cliente"**
2. Click en **"+ Agregar Pago"**
3. Completar formulario:
   - Monto: 500
   - Moneda: Misma que la operación
   - Fecha de vencimiento: Fecha futura
   - Método de pago: "Transferencia"
   - Descripción: "Pago de prueba"
4. Click en **"Guardar"**
5. Marcar el pago como **"Pagado"** (toggle o botón)

**✅ Resultado Esperado:**
- El pago aparece en la lista con estado "PAID"
- Se crea un movimiento contable automáticamente
- Se crea un movimiento de caja automáticamente
- El balance de la operación se actualiza
- Aparece en el dashboard de caja

**❌ Si falla:**
- Verificar que la operación tiene moneda configurada
- Verificar permisos para crear pagos
- Revisar logs de creación de movimientos contables

---

### PASO 6: Verificar Movimientos Contables

**📍 Acción:**
1. Ir a **Contabilidad → Libro Mayor**
2. Buscar movimientos relacionados con la operación creada
3. Verificar que existan:
   - Movimiento de débito (cuenta de ingresos)
   - Movimiento de crédito (cuenta de caja/cuenta corriente)

**✅ Resultado Esperado:**
- Los movimientos aparecen correctamente
- Los montos coinciden con el pago
- Las fechas son correctas
- La operación está referenciada

**❌ Si falla:**
- Verificar que los movimientos se crearon en la BD
- Revisar logs de la creación de movimientos

---

### PASO 7: Verificar Movimientos de Caja

**📍 Acción:**
1. Ir a **Caja → Movimientos**
2. Filtrar por la fecha de hoy
3. Buscar el movimiento del pago creado

**✅ Resultado Esperado:**
- El movimiento aparece en la lista
- El tipo es "INCOME" o "CUSTOMER_PAYMENT"
- El monto coincide
- La operación está referenciada
- El balance de caja se actualizó

**❌ Si falla:**
- Verificar creación de movimientos de caja
- Revisar cálculo de balances

---

### PASO 8: Cambiar Estado de Operación

**📍 Acción:**
1. Volver a la operación
2. Cambiar estado de "PRE_RESERVATION" a "CONFIRMED"
3. Verificar que se puede cambiar a "TRAVELED"
4. Finalmente cambiar a "CLOSED"

**✅ Resultado Esperado:**
- Los cambios de estado se guardan inmediatamente
- No hay errores en consola
- El estado se refleja en la lista de operaciones

**❌ Si falla:**
- Verificar permisos
- Revisar validaciones de cambio de estado

---

### PASO 9: Cerrar Operación y Verificar Comisiones

**📍 Acción:**
1. Con la operación en estado "CLOSED"
2. Ir a **Operadores → [Nombre del Operador]**
3. Verificar que la comisión se calculó automáticamente
4. Ir a **Contabilidad → Comisiones**
5. Verificar que aparece la comisión registrada

**✅ Resultado Esperado:**
- La comisión se calculó correctamente
- Aparece en el módulo de comisiones
- El monto es correcto según la configuración

**❌ Si falla:**
- Verificar configuración de comisiones del operador
- Revisar cálculo automático de comisiones

---

## 🗑️ TESTING DE ELIMINACIONES

### PASO 10: Eliminar un Pago

**📍 Acción:**
1. Crear un nuevo pago de prueba (paso 5)
2. Marcar como pagado
3. Verificar movimientos contables y de caja creados
4. Eliminar el pago (botón eliminar con confirmación)

**✅ Resultado Esperado:**
- El pago se elimina
- Los movimientos contables se eliminan/revierten
- Los movimientos de caja se eliminan/revierten
- El balance de la operación se actualiza
- El balance de caja se actualiza
- El dashboard se refresca automáticamente

**❌ Si falla:**
- Verificar que los movimientos relacionados se eliminan
- Revisar integridad referencial

---

### PASO 11: Eliminar una Operación

**📍 Acción:**
1. Crear una operación de prueba completa con pagos
2. Intentar eliminar como usuario SELLER (sin permisos)
3. Cambiar a usuario ADMIN/SUPER_ADMIN
4. Eliminar la operación

**✅ Resultado Esperado:**
- Como SELLER: Error 403 - Sin permisos
- Como ADMIN: Operación eliminada
- Todos los movimientos contables eliminados
- Todos los movimientos de caja eliminados
- Alertas relacionadas eliminadas
- Documentos eliminados
- Comisiones eliminadas
- Si tenía lead asociado: Lead vuelve a "IN_PROGRESS"

**❌ Si falla:**
- Verificar permisos correctamente implementados
- Verificar eliminación en cascada

---

### PASO 12: Eliminar un Cliente

**📍 Acción:**
1. Crear un cliente de prueba sin operaciones
2. Eliminar el cliente
3. Crear otro cliente con operación activa
4. Intentar eliminar

**✅ Resultado Esperado:**
- Cliente sin operaciones: Se elimina correctamente
- Cliente con operaciones: Error claro indicando que tiene operaciones activas
- El mensaje de error es descriptivo

**❌ Si falla:**
- Verificar validación de operaciones activas
- Verificar mensajes de error claros

---

## 🔄 TESTING DE CAMBIOS DE MONEDA

### PASO 13: Cambiar Moneda en Operación

**📍 Acción:**
1. Crear operación en ARS
2. Agregar pagos en ARS
3. Cambiar moneda de la operación a USD
4. Verificar en logs del servidor

**✅ Resultado Esperado:**
- La operación cambia de moneda
- Advertencia registrada en logs del servidor
- **Nota:** Los movimientos contables NO se recalculan automáticamente (feature futura)

**❌ Si falla:**
- Verificar que el cambio se guarda
- Revisar logs para advertencias

---

## 📊 TESTING DE BÚSQUEDA Y FILTROS

### PASO 14: Búsqueda Global

**📍 Acción:**
1. Presionar **Cmd+K** (Mac) o **Ctrl+K** (Windows/Linux)
2. Buscar el nombre del cliente creado: "Juan Pérez Test"
3. Buscar código de operación
4. Buscar nombre de operador

**✅ Resultado Esperado:**
- Aparecen resultados de clientes
- Aparecen resultados de operaciones
- Aparecen resultados de operadores
- Se puede navegar haciendo click en los resultados

**❌ Si falla:**
- Verificar que la búsqueda funciona
- Revisar índices de base de datos

---

### PASO 15: Filtros en Tablas

**📍 Acción:**
1. Ir a **Operaciones**
2. Filtrar por estado: "CONFIRMED"
3. Filtrar por operador
4. Filtrar por rango de fechas
5. Verificar paginación

**✅ Resultado Esperado:**
- Los filtros funcionan correctamente
- La paginación muestra los resultados correctos
- Los contadores de totales son correctos

**❌ Si falla:**
- Verificar implementación de filtros en API
- Verificar paginación server-side

---

## 🔗 TESTING DE INTEGRACIÓN TRELLO

### PASO 16: Sincronización de Trello

**📍 Acción:**
1. Crear una nueva card en Trello (en el board configurado)
2. Esperar 10-30 segundos
3. Ir a **Sales → Leads** en el sistema
4. Verificar que la card aparece automáticamente

**✅ Resultado Esperado:**
- La card aparece sin necesidad de refresh
- El lead tiene todos los datos de Trello
- El lead está en la lista correcta según el Kanban
- El vendedor asignado coincide con el member de Trello

**❌ Si falla:**
- Verificar webhook activo
- Revisar logs del endpoint `/api/trello/webhook`
- Verificar configuración de Trello en Settings

---

### PASO 17: Mover Card en Trello

**📍 Acción:**
1. Mover una card de una lista a otra en Trello
2. Esperar 10-30 segundos
3. Verificar en el sistema que el lead cambió de lista

**✅ Resultado Esperado:**
- El lead se mueve automáticamente a la nueva lista
- El estado y región se actualizan según los mapeos
- No requiere refresh manual

**❌ Si falla:**
- Verificar mapeos de listas en Settings
- Revisar logs del webhook

---

## 🤖 TESTING DE AI COPILOT

### PASO 18: Preguntas al AI Copilot

**📍 Acción:**
1. Abrir AI Copilot (botón en navbar o Cmd+J)
2. Hacer preguntas como:
   - "¿Cuántas operaciones hay este mes?"
   - "¿Cuál es el total de pagos recibidos?"
   - "¿Qué clientes tienen pagos pendientes?"
   - "¿Cuántas leads de Trello hay activas?"
3. Verificar respuestas

**✅ Resultado Esperado:**
- El AI responde en < 5 segundos
- Las respuestas son precisas
- El AI tiene contexto del sistema completo
- Los números coinciden con los datos reales

**❌ Si falla:**
- Verificar configuración de OpenAI API key
- Revisar contexto del AI (DATABASE_SCHEMA)
- Verificar queries a la base de datos

---

## 📱 TESTING DE WHATSAPP

### PASO 19: Enviar Mensaje WhatsApp

**📍 Acción:**
1. Ir a un cliente con teléfono
2. Click en botón de WhatsApp
3. Verificar que se abre WhatsApp Web/App
4. Verificar que el mensaje está pre-rellenado

**✅ Resultado Esperado:**
- Se abre WhatsApp correctamente
- El número está en formato correcto
- El mensaje tiene contexto (nombre del cliente, operación, etc.)

**❌ Si falla:**
- Verificar formato de teléfono
- Revisar generación de mensajes

---

## 📈 TESTING DE DASHBOARD

### PASO 20: Verificar Dashboard

**📍 Acción:**
1. Ir a **Dashboard**
2. Verificar que carga en < 2 segundos
3. Verificar KPIs:
   - Total de operaciones
   - Operaciones activas
   - Pagos pendientes
   - Balance de caja
4. Verificar gráficos
5. Verificar alertas recientes

**✅ Resultado Esperado:**
- Dashboard carga rápidamente
- Todos los KPIs son correctos
- Los gráficos se renderizan
- Las alertas aparecen correctamente
- El caché funciona (segunda carga es más rápida)

**❌ Si falla:**
- Verificar caché del dashboard
- Revisar queries de KPIs
- Verificar índices de base de datos

---

## ✅ CHECKLIST FINAL

Después de completar todos los pasos, verifica:

- [ ] Todos los pasos ejecutados sin errores críticos
- [ ] No hay errores en consola del navegador
- [ ] No hay errores en logs del servidor
- [ ] La performance es aceptable (< 2s para carga de páginas)
- [ ] Las notificaciones funcionan
- [ ] Los permisos se respetan correctamente
- [ ] La sincronización de Trello funciona en tiempo real

---

## 🐛 REPORTE DE PROBLEMAS

Si encuentras algún problema:

1. **Anotar:**
   - Paso donde ocurrió
   - Acción exacta realizada
   - Mensaje de error (si hay)
   - Screenshot si es posible

2. **Verificar logs:**
   - Consola del navegador (F12)
   - Logs de Vercel (Function Logs)
   - Logs de Supabase

3. **Reportar:**
   - Crear issue en GitHub o documentar el problema
   - Incluir todos los detalles recopilados

---

## 📝 NOTAS IMPORTANTES

- **Testing con datos reales:** Algunas pruebas requieren datos reales para ser completamente válidas
- **Sincronización Trello:** Puede tardar 10-30 segundos en reflejarse
- **Caché:** Algunos cambios pueden tardar hasta 5 minutos en reflejarse en el dashboard (por diseño)
- **Permisos:** Asegúrate de probar con diferentes roles de usuario

---

**🎉 ¡Felicidades! Has completado el testing end-to-end del sistema.**

