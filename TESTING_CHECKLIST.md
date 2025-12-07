# 🧪 CHECKLIST DE PRUEBAS - FUNCIONALIDADES NUEVAS

**Fecha:** Diciembre 2025  
**Objetivo:** Validar todas las funcionalidades implementadas en Fase 1 y Fase 2.1

---

## ✅ FASE 1.1: AI Copilot - Contexto Completo

### Pruebas del AI Copilot

#### 1. Verificar que el AI conoce TODAS las tablas
**Preguntas para hacer al AI:**

- [ ] "¿Qué tablas existen en el sistema?"
  - **Esperado:** Debe mencionar TODAS las tablas incluyendo: `destination_requirements`, `partner_accounts`, `partner_withdrawals`, `commission_records`, `cash_boxes`, `recurring_payments`, `whatsapp_messages`, `whatsapp_templates`, `communications`, `operation_customers`, `settings_trello`, `audit_logs`, etc.

- [ ] "¿Cómo funcionan los pagos recurrentes (recurring_payments)?"
  - **Esperado:** Debe explicar la tabla `recurring_payments` y su relación con operadores/proveedores.

- [ ] "¿Qué es destination_requirements y para qué se usa?"
  - **Esperado:** Debe explicar los requisitos de destino y su relación con operaciones.

- [ ] "¿Cómo se registran las comisiones en el sistema?"
  - **Esperado:** Debe mencionar `commission_records` (no `commissions`).

- [ ] "¿Cómo funciona la integración con Trello?"
  - **Esperado:** Debe mencionar `settings_trello` y explicar la configuración.

#### 2. Verificar contexto en tiempo real
**Preguntas para hacer al AI:**

- [ ] "¿Cuántos pagos vencidos hay?"
  - **Esperado:** Debe consultar datos reales y dar un número.

- [ ] "¿Qué operaciones están próximas a viajar?"
  - **Esperado:** Debe listar operaciones con `departure_date` próximas.

- [ ] "¿Hay mensajes de WhatsApp pendientes?"
  - **Esperado:** Debe consultar `whatsapp_messages` y dar un resumen.

- [ ] "¿Cuántas comisiones pendientes hay?"
  - **Esperado:** Debe consultar `commission_records` con status PENDING.

#### 3. Verificar velocidad de respuesta
- [ ] Hacer una pregunta compleja al AI
- [ ] **Tiempo esperado:** < 5 segundos
- [ ] Verificar en Network tab que las queries se hacen en paralelo (Promise.all)

---

## ✅ FASE 1.2: Optimización de Performance - Base de Datos

### Pruebas de Índices

#### 1. Verificar migración SQL
- [ ] Ejecutar migración `050_performance_indexes_final.sql` en Supabase
- [ ] **Verificar:** No debe haber errores
- [ ] **Verificar:** Todos los índices deben crearse correctamente

#### 2. Verificar performance de queries
**En Supabase SQL Editor, ejecutar:**

```sql
-- Query 1: Operaciones por agencia y estado (debe ser rápida)
EXPLAIN ANALYZE
SELECT * FROM operations 
WHERE agency_id = 'TU_AGENCY_ID' 
AND status = 'CONFIRMED'
ORDER BY operation_date DESC
LIMIT 50;

-- Query 2: Movimientos contables ordenados por fecha
EXPLAIN ANALYZE
SELECT * FROM ledger_movements
ORDER BY created_at DESC
LIMIT 50;

-- Query 3: Movimientos de caja por fecha
EXPLAIN ANALYZE
SELECT * FROM cash_movements
ORDER BY movement_date DESC
LIMIT 50;

-- Query 4: Alertas pendientes
EXPLAIN ANALYZE
SELECT * FROM alerts
WHERE status = 'PENDING'
ORDER BY date_due
LIMIT 50;
```

**Verificar:**
- [ ] Todas las queries usan índices (debe aparecer "Index Scan" o "Bitmap Index Scan")
- [ ] Tiempo de ejecución < 100ms para cada query

---

## ✅ FASE 1.3: Paginación en Tablas Grandes

### Pruebas de API de Paginación

#### 1. Probar endpoint de Operations
**En el navegador o Postman:**

```bash
# Página 1 (default)
GET /api/operations?page=1&limit=50

# Página 2
GET /api/operations?page=2&limit=50

# Con filtros
GET /api/operations?page=1&limit=50&status=CONFIRMED&agencyId=xxx
```

**Verificar respuesta:**
- [ ] Respuesta incluye: `operations`, `total`, `page`, `limit`, `totalPages`, `hasMore`
- [ ] `total` es el número total de operaciones (no solo las de la página)
- [ ] `hasMore` es `true` si hay más páginas
- [ ] Solo se retornan 50 operaciones por página

#### 2. Probar endpoint de Leads
```bash
GET /api/leads?page=1&limit=50
```

**Verificar:**
- [ ] Misma estructura de respuesta que operations
- [ ] Paginación funciona correctamente

#### 3. Probar endpoint de Payments
```bash
GET /api/payments?page=1&limit=50
```

**Verificar:**
- [ ] Paginación funciona correctamente

#### 4. Probar endpoint de Cash Movements
```bash
GET /api/cash/movements?page=1&limit=50
```

**Verificar:**
- [ ] Paginación funciona correctamente

#### 5. Probar límites
```bash
# Límite máximo
GET /api/operations?limit=200  # Debe aceptar hasta 200

# Límite excesivo
GET /api/operations?limit=1000  # Debe limitar a 200
```

**Verificar:**
- [ ] Límite máximo respetado (200 para operations, 10000 para leads)

---

## ✅ FASE 1.4: Optimizar Queries N+1

### Pruebas de Performance

#### 1. Verificar Network Tab en Operations
**En el navegador:**

- [ ] Ir a `/operations`
- [ ] Abrir DevTools > Network
- [ ] Cargar la página
- [ ] **Verificar:** Solo debe haber 1 request a `/api/operations`
- [ ] **Verificar:** No debe haber múltiples requests para cargar relaciones

#### 2. Verificar detalle de operación
- [ ] Abrir una operación individual
- [ ] Verificar Network tab
- [ ] **Verificar:** Queries de customers, documents, payments, alerts deben hacerse en paralelo (Promise.all)
- [ ] Tiempo total de carga < 1 segundo

#### 3. Verificar AI Copilot queries
- [ ] Abrir AI Copilot
- [ ] Hacer una pregunta
- [ ] Verificar en Network tab o logs
- [ ] **Verificar:** Múltiples queries deben ejecutarse en paralelo (Promise.all)

---

## ✅ FASE 1.5: Mejorar Trello Integration

### Pruebas de Integración Trello

#### 1. Validación de credenciales
**En Settings > Trello:**

- [ ] Intentar guardar configuración con credenciales inválidas
- [ ] **Esperado:** Debe mostrar error claro antes de guardar
- [ ] Intentar guardar con credenciales válidas
- [ ] **Esperado:** Debe validar y guardar correctamente

#### 2. Sincronización con retry logic
- [ ] Ir a Settings > Trello
- [ ] Hacer clic en "Sincronizar Ahora"
- [ ] Simular un error temporal (desconectar internet momentáneamente)
- [ ] **Esperado:** Debe reintentar automáticamente
- [ ] **Esperado:** Debe mostrar progreso o resumen al finalizar

#### 3. Webhooks
- [ ] Crear un card nuevo en Trello
- [ ] **Esperado:** Debe aparecer como lead automáticamente (puede tardar unos segundos)
- [ ] Editar un card en Trello
- [ ] **Esperado:** Debe actualizar el lead correspondiente

#### 4. Manejo de errores
- [ ] Desactivar webhook en Trello
- [ ] Hacer cambios en cards
- [ ] **Esperado:** Debe mostrar error claro en logs/consola
- [ ] **Esperado:** No debe romper la aplicación

---

## ✅ FASE 2.1: Implementar Caché

### Pruebas de Caché

#### 1. Verificar caché de Agencies
**En DevTools > Network:**

- [ ] Cargar página que use agencies (por ejemplo, crear operación)
- [ ] Hacer clic nuevamente para cargar agencies otra vez
- [ ] **Verificar:** La segunda carga debe ser mucho más rápida (caché funcionando)
- [ ] **Verificar:** Response headers pueden mostrar `Cache-Control`

#### 2. Verificar caché de Operators
- [ ] Cargar página de operators
- [ ] Recargar la página inmediatamente
- [ ] **Verificar:** Segunda carga más rápida

#### 3. Verificar caché de Dashboard KPIs
- [ ] Ir al Dashboard
- [ ] Cambiar filtros (fecha, agencia)
- [ ] Volver a filtros anteriores
- [ ] **Verificar:** Los datos deben cargar más rápido (caché de 5 minutos)

#### 4. Verificar caché de Trello Config
- [ ] Ir a Settings > Trello
- [ ] Ver configuración
- [ ] Salir y volver a entrar
- [ ] **Verificar:** Carga más rápida (caché de 10 minutos)

#### 5. Verificar invalidación de caché
- [ ] Crear una nueva operación
- [ ] Ir al Dashboard inmediatamente
- [ ] **Verificar:** Los KPIs deben actualizarse (caché invalidado)
- [ ] Crear un nuevo operador
- [ ] Ir a la lista de operadores
- [ ] **Verificar:** El nuevo operador debe aparecer (caché invalidado)
- [ ] Actualizar configuración de Trello
- [ ] Recargar página de Trello settings
- [ ] **Verificar:** Cambios deben verse inmediatamente

#### 6. Verificar tiempo de caché
- [ ] Cargar Dashboard
- [ ] Esperar 5 minutos
- [ ] Recargar Dashboard
- [ ] **Verificar:** Debe refrescar datos (TTL de 5 minutos expirado)

---

## 🔍 PRUEBAS GENERALES DE INTEGRACIÓN

### 1. Flujo Completo: Lead → Operación → Pago → Cierre
- [ ] Crear lead desde Trello o manualmente
- [ ] Convertir lead a operación
- [ ] Crear pago de cliente
- [ ] Crear pago a operador
- [ ] Marcar operación como CONFIRMED
- [ ] Cerrar operación
- [ ] **Verificar:** Todos los movimientos contables se generaron correctamente
- [ ] **Verificar:** Las alertas se crearon/actualizaron
- [ ] **Verificar:** Las comisiones se calcularon

### 2. Performance con muchos datos
- [ ] Si tienes >100 operaciones, verificar:
  - [ ] Dashboard carga en < 2 segundos
  - [ ] Listado de operaciones carga en < 1 segundo
  - [ ] Paginación funciona correctamente
  - [ ] No hay lag al navegar entre páginas

### 3. Verificar errores en consola
- [ ] Abrir DevTools > Console
- [ ] Navegar por toda la aplicación
- [ ] **Verificar:** No debe haber errores en consola
- [ ] **Verificar:** Solo warnings menores aceptables

---

## 📝 NOTAS DE PRUEBA

**Después de cada prueba, documenta:**

- ✅ **PASÓ:** Si funciona correctamente
- ❌ **FALLÓ:** Si hay algún problema
- ⚠️ **PARCIAL:** Si funciona pero con issues menores

**Si algo falla, documenta:**
- Qué estaba probando
- Qué error apareció
- Pasos para reproducir
- Screenshots si es necesario

---

## 🎯 CRITERIOS DE ÉXITO

El sistema pasa las pruebas si:

- ✅ Todas las funcionalidades del AI Copilot funcionan
- ✅ Todas las migraciones SQL se ejecutan sin errores
- ✅ La paginación funciona en todos los endpoints
- ✅ No hay queries N+1 (verificado en Network tab)
- ✅ Trello funciona con retry logic y validación
- ✅ El caché funciona y se invalida correctamente
- ✅ Dashboard carga en < 2 segundos
- ✅ Listado de operaciones carga en < 1 segundo
- ✅ 0 errores críticos en consola

---

**¡Buena suerte con las pruebas! 🚀**

