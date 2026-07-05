# 🧪 TESTING - AI COMPANION

**Objetivo:** Validar que el AI Companion puede responder cualquier pregunta sobre el negocio.

**Fecha:** Enero 2025  
**Estado:** ✅ Listo para testing

---

## 📋 CHECKLIST DE TESTING

### ✅ Fase 1: Esquema de Base de Datos
- [x] Todas las tablas están documentadas en DATABASE_SCHEMA
- [x] Relaciones entre tablas están documentadas
- [x] Métricas de negocio están documentadas

### ✅ Fase 2: Sistema de Queries Dinámicas
- [x] Función RPC `execute_readonly_query` creada
- [x] Validación de seguridad implementada
- [x] Function calling de OpenAI implementado
- [x] Manejo de errores implementado

### ✅ Fase 3: Contexto Pre-cargado
- [x] Datos de cotizaciones cargados
- [x] Datos de transferencias cargados
- [x] Datos de cupones cargados
- [x] Datos de transacciones con tarjeta cargados

### 🔄 Fase 4: Testing Manual

---

## 🧪 CASOS DE PRUEBA

### Test 1: Preguntas Básicas (Contexto Pre-cargado)

**Pregunta:** "¿Cuánto vendimos esta semana?"
- **Resultado esperado:** Muestra total de ventas de la semana actual
- **Estado:** ⏳ Pendiente

**Pregunta:** "¿Qué pagos vencen hoy?"
- **Resultado esperado:** Lista de pagos con fecha_due = hoy
- **Estado:** ⏳ Pendiente

**Pregunta:** "¿Qué viajes salen esta semana?"
- **Resultado esperado:** Lista de operaciones con departure_date en los próximos 7 días
- **Estado:** ⏳ Pendiente

---

### Test 2: Preguntas sobre Cotizaciones

**Pregunta:** "¿Cuántas cotizaciones se enviaron este mes?"
- **Resultado esperado:** Número de cotizaciones con status = 'SENT' del mes actual
- **Estado:** ⏳ Pendiente
- **Nota:** Debe usar execute_query si no está en contexto pre-cargado

**Pregunta:** "¿Cuántas cotizaciones se convirtieron en operaciones?"
- **Resultado esperado:** Número de cotizaciones con status = 'CONVERTED'
- **Estado:** ⏳ Pendiente

**Pregunta:** "¿Cuál es la tasa de conversión de cotizaciones este mes?"
- **Resultado esperado:** (cotizaciones convertidas / cotizaciones enviadas) * 100
- **Estado:** ⏳ Pendiente

---

### Test 3: Preguntas sobre Cupones

**Pregunta:** "¿Cuántos cupones de pago están vencidos?"
- **Resultado esperado:** Número de cupones con status = 'OVERDUE'
- **Estado:** ⏳ Pendiente

**Pregunta:** "¿Cuánto monto total hay en cupones pendientes?"
- **Resultado esperado:** SUM(amount) de cupones con status = 'PENDING'
- **Estado:** ⏳ Pendiente

---

### Test 4: Preguntas sobre Transferencias

**Pregunta:** "¿Qué transferencias entre cajas hubo la semana pasada?"
- **Resultado esperado:** Lista de transferencias de los últimos 7 días
- **Estado:** ⏳ Pendiente

**Pregunta:** "¿Cuánto se transfirió de ARS a USD este mes?"
- **Resultado esperado:** SUM(amount) de transferencias con currency = 'USD' del mes
- **Estado:** ⏳ Pendiente

---

### Test 5: Preguntas sobre Transacciones con Tarjeta

**Pregunta:** "¿Cuántas transacciones con tarjeta se liquidaron este mes?"
- **Resultado esperado:** COUNT de transacciones con status = 'SETTLED' del mes
- **Estado:** ⏳ Pendiente

**Pregunta:** "¿Cuál es el monto neto total de transacciones con tarjeta este mes?"
- **Resultado esperado:** SUM(net_amount) de transacciones del mes
- **Estado:** ⏳ Pendiente

---

### Test 6: Preguntas Complejas (Múltiples Tablas)

**Pregunta:** "¿Cuál es el margen promedio por destino este trimestre?"
- **Resultado esperado:** AVG(margin_amount) agrupado por destination del trimestre
- **Estado:** ⏳ Pendiente
- **Nota:** Requiere JOIN o GROUP BY

**Pregunta:** "¿Qué operador tiene más operaciones pendientes de pago?"
- **Resultado esperado:** Operador con más operator_payments con status = 'PENDING'
- **Estado:** ⏳ Pendiente
- **Nota:** Requiere JOIN entre operators y operator_payments

---

### Test 7: Preguntas con Comparaciones Temporales

**Pregunta:** "¿Cómo estamos vs el mes pasado?"
- **Resultado esperado:** Comparación de ventas, operaciones, etc. mes actual vs mes pasado
- **Estado:** ⏳ Pendiente
- **Nota:** Requiere queries para ambos períodos

**Pregunta:** "¿Cuál fue el crecimiento de ventas este trimestre vs el trimestre anterior?"
- **Resultado esperado:** Porcentaje de crecimiento calculado
- **Estado:** ⏳ Pendiente

---

### Test 8: Preguntas sobre Relaciones

**Pregunta:** "¿Qué pasajeros tiene la operación OP-2025-001?"
- **Resultado esperado:** Lista de pasajeros de operation_passengers para esa operación
- **Estado:** ⏳ Pendiente

**Pregunta:** "¿Qué operadores están asociados a la operación OP-2025-001?"
- **Resultado esperado:** Lista de operadores de operation_operators para esa operación
- **Estado:** ⏳ Pendiente

---

## 🔍 VALIDACIONES

### Seguridad
- [ ] Verificar que solo se permiten queries SELECT
- [ ] Verificar que no se pueden ejecutar comandos peligrosos (DROP, DELETE, etc.)
- [ ] Verificar que no se expone información sensible
- [ ] Verificar rate limiting funciona

### Performance
- [ ] Verificar que queries simples responden en < 2 segundos
- [ ] Verificar que queries complejas responden en < 5 segundos
- [ ] Verificar que no hay timeouts en queries normales

### Precisión
- [ ] Verificar que las respuestas son correctas
- [ ] Verificar que los cálculos son precisos
- [ ] Verificar que el formato es consistente

### UX
- [ ] Verificar que las respuestas son claras y útiles
- [ ] Verificar que maneja errores gracefully
- [ ] Verificar que explica qué datos usó para responder

---

## 📝 NOTAS DE TESTING

### Cómo Probar

1. **Abrir el AI Companion** en la aplicación
2. **Hacer una pregunta** de la lista de casos de prueba
3. **Verificar la respuesta:**
   - ¿Es correcta?
   - ¿Es clara?
   - ¿Usó datos correctos?
   - ¿Ejecutó queries si era necesario?

4. **Registrar resultados** en este documento

### Errores Comunes a Verificar

- ❌ AI dice "no tengo datos" cuando debería usar execute_query
- ❌ AI genera queries inválidas
- ❌ AI no formatea bien los números (monedas, fechas)
- ❌ AI no explica qué datos usó
- ❌ Queries muy lentas o que fallan

---

## ✅ RESULTADOS

### Tests Exitosos: 0/20
### Tests Fallidos: 0/20
### Tests Pendientes: 20/20

**Última actualización:** Enero 2025

---

## 🚀 PRÓXIMOS PASOS DESPUÉS DE TESTING

1. Corregir errores encontrados
2. Optimizar queries lentas
3. Mejorar formato de respuestas
4. Agregar más ejemplos al prompt si es necesario
5. Documentar casos edge encontrados

