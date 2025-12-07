# 🧪 TESTING COMPLETO - PRE PRODUCCIÓN

**Fecha:** Diciembre 2025  
**Objetivo:** Validar todas las funcionalidades antes del deploy a producción  
**Estado:** En progreso

---

## ✅ CHECKLIST DE TESTING

### 1. Flujo Completo: Lead → Operación → Pago → Cierre

#### 1.1 Crear Lead
- [ ] Acceder a `/sales/leads`
- [ ] Crear nuevo lead con datos válidos
- [ ] **Verificar:** Lead aparece en Kanban
- [ ] **Verificar:** Lead aparece en tabla con paginación

**Resultado:** ⏳ Pendiente

#### 1.2 Convertir Lead a Operación
- [ ] Desde el lead, convertir a operación
- [ ] **Verificar:** Operación creada con código único
- [ ] **Verificar:** Lead cambia a estado "WON"
- [ ] **Verificar:** Cliente asociado correctamente

**Resultado:** ⏳ Pendiente

#### 1.3 Crear Pago en Operación
- [ ] Acceder a la operación creada
- [ ] Crear pago de cliente
- [ ] **Verificar:** Pago aparece en lista
- [ ] **Verificar:** Validaciones funcionan (monto no negativo, fecha no futura)
- [ ] Marcar pago como pagado
- [ ] **Verificar:** Se crea movimiento contable
- [ ] **Verificar:** Se crea movimiento de caja

**Resultado:** ⏳ Pendiente

#### 1.4 Cerrar Operación
- [ ] Cambiar estado de operación a "CLOSED"
- [ ] **Verificar:** Comisiones se calculan automáticamente
- [ ] **Verificar:** Alertas se eliminan correctamente

**Resultado:** ⏳ Pendiente

---

### 2. Eliminaciones

#### 2.1 Eliminar Pago
- [ ] Crear un pago de prueba
- [ ] Eliminar el pago
- [ ] **Verificar:** Movimientos contables se revierten
- [ ] **Verificar:** Operator payment se revierte a PENDING si estaba pagado
- [ ] **Verificar:** Caché del dashboard se invalida

**Resultado:** ⏳ Pendiente

#### 2.2 Eliminar Operación
- [ ] Crear operación de prueba con pagos
- [ ] Intentar eliminar como usuario sin permisos (SELLER)
- [ ] **Verificar:** Error 403 - Solo administradores
- [ ] Eliminar como ADMIN/SUPER_ADMIN
- [ ] **Verificar:** Todos los movimientos contables eliminados
- [ ] **Verificar:** Alertas eliminadas
- [ ] **Verificar:** Documents eliminados
- [ ] **Verificar:** Commission_records eliminados
- [ ] **Verificar:** Lead revertido a IN_PROGRESS si existía

**Resultado:** ⏳ Pendiente

#### 2.3 Eliminar Cliente
- [ ] Crear cliente de prueba sin operaciones
- [ ] Eliminar cliente
- [ ] **Verificar:** Cliente eliminado correctamente
- [ ] Crear cliente con operación activa
- [ ] Intentar eliminar
- [ ] **Verificar:** Error claro indicando operaciones activas
- [ ] Cancelar operación
- [ ] Intentar eliminar nuevamente
- [ ] **Verificar:** Error indicando que tiene operaciones (aunque canceladas)

**Resultado:** ⏳ Pendiente

---

### 3. Cambios de Moneda

#### 3.1 Cambiar Moneda en Operación
- [ ] Crear operación en ARS
- [ ] Agregar pagos en ARS
- [ ] Cambiar moneda a USD
- [ ] **Verificar:** Advertencia registrada en logs
- [ ] **Verificar:** Operación actualizada
- [ ] **Nota:** Recalcular movimientos contables automáticamente es TODO futuro

**Resultado:** ⏳ Pendiente

---

### 4. Sincronización Trello

#### 4.1 Validar Credenciales
- [ ] Ir a Configuración → Trello
- [ ] Ingresar credenciales incorrectas
- [ ] Click en "Validar Credenciales"
- [ ] **Verificar:** Error claro mostrado
- [ ] Ingresar credenciales correctas
- [ ] **Verificar:** Validación exitosa

**Resultado:** ⏳ Pendiente

#### 4.2 Sincronización Manual
- [ ] Con Trello configurado, click en "Sincronizar Ahora"
- [ ] **Verificar:** Proceso inicia correctamente
- [ ] **Verificar:** Resumen al finalizar (cards procesados, leads creados/actualizados)
- [ ] **Verificar:** Leads aparecen en el sistema

**Resultado:** ⏳ Pendiente

#### 4.3 Sincronización con Muchos Cards
- [ ] Crear 50+ cards en Trello
- [ ] Sincronizar
- [ ] **Verificar:** Todos los cards se procesan
- [ ] **Verificar:** Tiempo < 30 segundos
- [ ] **Verificar:** No hay duplicados

**Resultado:** ⏳ Pendiente

---

### 5. AI Copilot

#### 5.1 Preguntas sobre Tablas
- [ ] Abrir AI Copilot
- [ ] Preguntar: "¿Qué tablas existen en el sistema?"
- [ ] **Verificar:** Menciona todas las tablas incluyendo commission_records, destination_requirements, etc.
- [ ] Preguntar: "¿Cómo funcionan los pagos recurrentes?"
- [ ] **Verificar:** Explica recurring_payments correctamente

**Resultado:** ⏳ Pendiente

#### 5.2 Preguntas con Datos en Tiempo Real
- [ ] Preguntar: "¿Cuántos pagos vencidos hay?"
- [ ] **Verificar:** Número correcto basado en datos reales
- [ ] Preguntar: "¿Qué operaciones están próximas a viajar?"
- [ ] **Verificar:** Lista operaciones con departure_date próximas
- [ ] Preguntar: "¿Cuántas comisiones pendientes hay?"
- [ ] **Verificar:** Consulta commission_records correctamente

**Resultado:** ⏳ Pendiente

#### 5.3 Performance del AI
- [ ] Hacer pregunta compleja
- [ ] Medir tiempo de respuesta
- [ ] **Verificar:** < 5 segundos
- [ ] Abrir Network tab en DevTools
- [ ] **Verificar:** Queries se ejecutan en paralelo (Promise.all)

**Resultado:** ⏳ Pendiente

---

### 6. Performance

#### 6.1 Dashboard
- [ ] Acceder a dashboard con datos reales
- [ ] Medir tiempo de carga
- [ ] **Verificar:** < 2 segundos
- [ ] Recargar página
- [ ] **Verificar:** Caché funciona (segunda carga más rápida)

**Resultado:** ⏳ Pendiente

#### 6.2 Listado de Operaciones
- [ ] Acceder a `/operations`
- [ ] Verificar que usa paginación (mostrando 50 por defecto)
- [ ] **Verificar:** Carga < 1 segundo
- [ ] Cambiar límite a 100
- [ ] **Verificar:** Sigue siendo rápido
- [ ] Navegar a página 2
- [ ] **Verificar:** Controles de paginación funcionan

**Resultado:** ⏳ Pendiente

#### 6.3 Listado de Leads
- [ ] Acceder a `/sales/leads`
- [ ] Cambiar a vista Tabla
- [ ] **Verificar:** Paginación funciona
- [ ] **Verificar:** Filtros por agencia funcionan con paginación

**Resultado:** ⏳ Pendiente

#### 6.4 Índices de Base de Datos
- [ ] Ejecutar migración `050_performance_indexes_final.sql`
- [ ] **Verificar:** Sin errores
- [ ] Ejecutar EXPLAIN ANALYZE en queries críticas
- [ ] **Verificar:** Usan índices (Index Scan o Bitmap Index Scan)
- [ ] **Verificar:** Tiempo < 100ms

**Resultado:** ⏳ Pendiente

---

### 7. Validaciones

#### 7.1 Validaciones en Operaciones
- [ ] Crear operación con fecha futura
- [ ] **Verificar:** Error "operation_date no puede ser futuro"
- [ ] Crear operación con departure_date antes de operation_date
- [ ] **Verificar:** Error "departure_date debe ser después de operation_date"
- [ ] Crear operación con monto negativo
- [ ] **Verificar:** Error "El monto no puede ser negativo"

**Resultado:** ⏳ Pendiente

#### 7.2 Validaciones en Pagos
- [ ] Crear pago con fecha futura
- [ ] **Verificar:** Error "La fecha de pago no puede ser futura"
- [ ] Crear pago con date_due antes de date_paid
- [ ] **Verificar:** Error "date_due debe ser después de date_paid"
- [ ] Crear pago con monto negativo
- [ ] **Verificar:** Error "El monto no puede ser negativo"

**Resultado:** ⏳ Pendiente

---

### 8. Búsqueda Global

#### 8.1 Búsqueda Básica
- [ ] Presionar Cmd+K (Mac) o Ctrl+K (Windows)
- [ ] **Verificar:** Command menu se abre
- [ ] Buscar nombre de cliente
- [ ] **Verificar:** Aparece en resultados
- [ ] Buscar código de operación
- [ ] **Verificar:** Aparece en resultados
- [ ] Seleccionar resultado
- [ ] **Verificar:** Navega correctamente

**Resultado:** ⏳ Pendiente

#### 8.2 Filtros de Permisos en Búsqueda
- [ ] Hacer login como SELLER
- [ ] Buscar operación de otra agencia
- [ ] **Verificar:** No aparece en resultados
- [ ] Hacer login como ADMIN
- [ ] Buscar misma operación
- [ ] **Verificar:** Aparece en resultados

**Resultado:** ⏳ Pendiente

---

### 9. Edge Cases

#### 9.1 Operación sin Clientes
- [ ] Crear operación sin asignar clientes
- [ ] **Verificar:** Operación se crea correctamente
- [ ] Agregar cliente después
- [ ] **Verificar:** Cliente se asocia correctamente

**Resultado:** ⏳ Pendiente

#### 9.2 Pago sin Operación Asociada
- [ ] Intentar crear pago sin operation_id (desde API directamente)
- [ ] **Verificar:** Error de validación

**Resultado:** ⏳ Pendiente

#### 9.3 Eliminar Operación con Pagos Pagados
- [ ] Crear operación con pagos marcados como pagados
- [ ] Eliminar operación
- [ ] **Verificar:** Todos los movimientos se eliminan correctamente
- [ ] Verificar balances en caja
- [ ] **Verificar:** Balances se actualizan correctamente

**Resultado:** ⏳ Pendiente

---

## 📊 RESULTADOS FINALES

### Funcionalidades Probadas
- [ ] Flujo completo: Lead → Operación → Pago → Cierre
- [ ] Eliminaciones
- [ ] Cambios de moneda
- [ ] Sincronización Trello
- [ ] AI Copilot
- [ ] Performance
- [ ] Validaciones
- [ ] Búsqueda global
- [ ] Edge cases

### Problemas Encontrados
- [ ] Lista vacía - No se encontraron problemas

### Recomendaciones
- [ ] Ninguna - Sistema listo para producción

---

## ✅ CONCLUSIÓN

**Estado Final:** ⏳ En progreso  
**Fecha de finalización:** Pendiente  
**Aprobado para producción:** Pendiente

---

**Nota:** Este documento debe completarse antes del deploy a producción. Cada sección debe probarse y marcarse como completada con fecha y hora.

