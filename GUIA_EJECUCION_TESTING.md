# 🚀 Guía de Ejecución de Testing

Esta guía te ayudará a ejecutar todas las pruebas necesarias antes del deploy a producción.

## 📋 Pre-requisitos

1. **Servidor de desarrollo corriendo:**
   ```bash
   cd erplozada
   npm run dev
   ```

2. **Base de datos configurada:**
   - Migraciones ejecutadas
   - Datos de prueba cargados (opcional)

3. **Credenciales de Trello** (para pruebas de sincronización):
   - API Key
   - Token
   - Board ID

4. **Acceso a Supabase SQL Editor** (para verificar datos)

---

## 🧪 PASO 1: Preparar Ambiente de Testing

### 1.1 Limpiar datos de prueba anteriores (opcional)
```sql
-- Solo ejecutar si quieres empezar desde cero
DELETE FROM commission_records WHERE operation_id IN (
  SELECT id FROM operations WHERE destination LIKE '%Prueba%'
);
DELETE FROM payments WHERE operation_id IN (
  SELECT id FROM operations WHERE destination LIKE '%Prueba%'
);
DELETE FROM operations WHERE destination LIKE '%Prueba%';
DELETE FROM leads WHERE contact_name LIKE '%Prueba%';
DELETE FROM customers WHERE first_name LIKE '%Prueba%';
```

### 1.2 Verificar que el servidor está corriendo
- Abre http://localhost:3000 (o el puerto configurado)
- Debe mostrar la página de login
- Inicia sesión con un usuario de prueba

---

## 🧪 PASO 2: Testing de Flujo Completo

### 2.1 Crear Lead de Prueba
1. Ir a `/sales/leads`
2. Click en "Nuevo Lead"
3. Completar:
   - **Agencia:** Seleccionar una
   - **Origen:** Otro
   - **Destino:** "Cancún - Prueba Testing"
   - **Contacto:** "Cliente Prueba Testing"
   - **Teléfono:** "+5491112345678"
   - **Email:** "prueba@testing.com"
4. Guardar

**✅ Verificar:**
- Lead aparece en Kanban
- Lead aparece en tabla (vista Tabla)
- Paginación funciona si hay muchos leads

### 2.2 Convertir Lead a Operación
1. Abrir el lead creado
2. Click en "Convertir a Operación"
3. Completar datos de operación:
   - **Operador:** Seleccionar uno
   - **Fecha de operación:** Hoy
   - **Fecha de salida:** 30 días desde hoy
   - **Monto total:** 2500
   - **Moneda:** USD
4. Guardar

**✅ Verificar en Supabase:**
```sql
-- Verificar operación creada
SELECT id, file_code, destination, status 
FROM operations 
WHERE destination LIKE '%Prueba Testing%'
ORDER BY created_at DESC LIMIT 1;

-- Verificar lead actualizado
SELECT id, status, converted_operation_id 
FROM leads 
WHERE contact_name LIKE '%Prueba Testing%';
```

### 2.3 Crear Pago en Operación
1. Abrir la operación creada
2. Ir a sección "Pagos"
3. Click en "Registrar Pago"
4. Completar:
   - **Tipo:** Pago de Cliente
   - **Monto:** 1250
   - **Moneda:** USD
   - **Fecha de vencimiento:** 7 días desde hoy
   - **Método:** Transferencia
5. Guardar

**✅ Verificar:**
- Pago aparece en la lista
- Validaciones funcionan (intentar monto negativo, fecha futura)
- Alerta de pago pendiente aparece

### 2.4 Marcar Pago como Pagado
1. En la lista de pagos, click en "Marcar como Pagado"
2. Completar fecha de pago
3. Confirmar

**✅ Verificar en Supabase:**
```sql
-- Verificar pago actualizado
SELECT id, status, date_paid 
FROM payments 
WHERE operation_id = '[ID_OPERACION]';

-- Verificar movimientos contables creados
SELECT * FROM ledger_movements 
WHERE operation_id = '[ID_OPERACION]'
ORDER BY created_at DESC;

-- Verificar movimientos de caja
SELECT * FROM cash_movements 
WHERE operation_id = '[ID_OPERACION]'
ORDER BY created_at DESC;
```

### 2.5 Cerrar Operación
1. En la operación, cambiar estado a "CLOSED"
2. Guardar

**✅ Verificar:**
- Comisiones calculadas (si hay reglas configuradas)
- Alertas eliminadas o actualizadas

---

## 🧪 PASO 3: Testing de Eliminaciones

### 3.1 Eliminar Pago
1. Crear un pago de prueba (como en 2.3)
2. Marcar como pagado
3. Eliminar el pago (desde la operación o API)

**✅ Verificar en Supabase:**
```sql
-- Verificar que movimientos se revirtieron
SELECT * FROM ledger_movements 
WHERE id NOT IN (
  SELECT ledger_movement_id FROM payments WHERE ledger_movement_id IS NOT NULL
);
```

### 3.2 Eliminar Operación
1. Crear operación de prueba con pagos
2. Intentar eliminar como SELLER → Debe dar error 403
3. Cambiar a ADMIN/SUPER_ADMIN
4. Eliminar operación

**✅ Verificar en Supabase:**
```sql
-- Verificar que todo se eliminó
SELECT COUNT(*) FROM payments WHERE operation_id = '[ID_ELIMINADO]';
SELECT COUNT(*) FROM ledger_movements WHERE operation_id = '[ID_ELIMINADO]';
SELECT COUNT(*) FROM alerts WHERE operation_id = '[ID_ELIMINADO]';
SELECT COUNT(*) FROM commission_records WHERE operation_id = '[ID_ELIMINADO]';
-- Todos deben ser 0
```

---

## 🧪 PASO 4: Testing de Validaciones

### 4.1 Validaciones en Operaciones
1. Intentar crear operación con fecha futura → Error esperado
2. Intentar crear operación con departure_date < operation_date → Error esperado
3. Intentar crear operación con monto negativo → Error esperado

### 4.2 Validaciones en Pagos
1. Intentar crear pago con fecha futura → Error esperado
2. Intentar crear pago con date_due < date_paid → Error esperado
3. Intentar crear pago con monto negativo → Error esperado

---

## 🧪 PASO 5: Testing de Performance

### 5.1 Dashboard
1. Abrir DevTools > Network tab
2. Acceder a dashboard
3. **Medir tiempo:** Debe ser < 2 segundos
4. Recargar página
5. **Verificar:** Segunda carga más rápida (caché)

### 5.2 Listado de Operaciones
1. Acceder a `/operations`
2. **Verificar:** Muestra 50 por defecto (paginación)
3. **Medir tiempo:** Debe ser < 1 segundo
4. Cambiar a página 2
5. **Verificar:** Navegación funciona

### 5.3 Verificar Índices
En Supabase SQL Editor:
```sql
EXPLAIN ANALYZE
SELECT * FROM operations 
WHERE agency_id = '[TU_AGENCY_ID]' 
AND status = 'CONFIRMED'
ORDER BY operation_date DESC
LIMIT 50;
```

**✅ Verificar:** Debe usar "Index Scan" o "Bitmap Index Scan"

---

## 🧪 PASO 6: Testing de AI Copilot

### 6.1 Preguntas sobre Tablas
1. Abrir AI Copilot
2. Preguntar: "¿Qué tablas existen en el sistema?"
3. **Verificar:** Menciona commission_records, destination_requirements, etc.
4. Preguntar: "¿Cómo funcionan los pagos recurrentes?"
5. **Verificar:** Explica recurring_payments correctamente

### 6.2 Preguntas con Datos Reales
1. Preguntar: "¿Cuántos pagos vencidos hay?"
2. **Verificar:** Número correcto
3. Preguntar: "¿Qué operaciones están próximas a viajar?"
4. **Verificar:** Lista operaciones correctas

### 6.3 Performance
1. Hacer pregunta compleja
2. **Medir tiempo:** < 5 segundos
3. Abrir Network tab
4. **Verificar:** Queries en paralelo

---

## 🧪 PASO 7: Testing de Búsqueda Global

1. Presionar **Cmd+K** (Mac) o **Ctrl+K** (Windows)
2. **Verificar:** Command menu se abre
3. Buscar nombre de cliente
4. **Verificar:** Aparece en resultados
5. Seleccionar resultado
6. **Verificar:** Navega correctamente

---

## 🧪 PASO 8: Testing de Trello

### 8.1 Validar Credenciales
1. Ir a Configuración → Trello
2. Ingresar credenciales incorrectas
3. Click "Validar"
4. **Verificar:** Error claro
5. Ingresar credenciales correctas
6. **Verificar:** Validación exitosa

### 8.2 Sincronización
1. Click "Sincronizar Ahora"
2. **Verificar:** Proceso inicia
3. **Verificar:** Resumen al finalizar
4. **Verificar:** Leads aparecen en sistema

---

## 📝 Documentar Resultados

Después de cada prueba, actualiza `TESTING_COMPLETO_PRODUCCION.md`:

1. Marca como completado: `- [x]`
2. Agrega resultado: `✅ PASÓ` o `❌ FALLÓ`
3. Si falló, documenta:
   - Qué estaba probando
   - Qué error apareció
   - Pasos para reproducir
   - Screenshot si aplica

---

## ✅ Criterios de Aprobación

El sistema está listo para producción si:

- ✅ Todas las pruebas críticas pasan
- ✅ Performance dentro de métricas (< 2s dashboard, < 1s listados)
- ✅ No hay errores críticos en consola
- ✅ Validaciones funcionan correctamente
- ✅ Eliminaciones funcionan sin dejar datos huérfanos
- ✅ Caché funciona y se invalida correctamente

---

**¡Buena suerte con el testing! 🚀**

