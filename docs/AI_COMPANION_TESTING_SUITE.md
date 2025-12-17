# 🧪 SUITE DE TESTS - AI COMPANION

Esta suite de tests valida que el AI Companion puede responder correctamente preguntas de todas las categorías.

---

## 📋 INSTRUCCIONES DE TESTING

1. **Ejecutar cada pregunta** en el AI Companion
2. **Validar la respuesta**:
   - ✅ ¿La respuesta es correcta?
   - ✅ ¿El formato es claro y útil?
   - ✅ ¿Incluye datos específicos (números, fechas, montos)?
   - ✅ ¿Maneja errores gracefully si no hay datos?
3. **Registrar resultados** en la tabla de abajo

---

## 🧪 TESTS POR CATEGORÍA

### 1. TEST: Preguntas sobre Cotizaciones

| # | Pregunta | Resultado | Notas |
|---|----------|-----------|-------|
| 1 | ¿Cuántas cotizaciones se enviaron este mes? | ⬜ | |
| 2 | ¿Cuántas cotizaciones se convirtieron en operaciones? | ⬜ | |
| 3 | ¿Cuál es la tasa de conversión de cotizaciones este mes? | ⬜ | |
| 4 | ¿Qué cotizaciones están próximas a vencer? | ⬜ | |
| 5 | ¿Cuánto monto total hay en cotizaciones pendientes de aprobación? | ⬜ | |

**Criterios de éxito:**
- ✅ Todas las respuestas deben incluir números específicos
- ✅ La tasa de conversión debe ser un porcentaje calculado correctamente
- ✅ Las cotizaciones próximas a vencer deben incluir fechas

---

### 2. TEST: Preguntas sobre Tarifarios y Cupos

| # | Pregunta | Resultado | Notas |
|---|----------|-----------|-------|
| 1 | ¿Qué tarifarios están activos para el Caribe? | ⬜ | |
| 2 | ¿Cuántos cupos disponibles hay para Brasil en febrero? | ⬜ | |
| 3 | ¿Qué operador tiene más cupos reservados? | ⬜ | |
| 4 | ¿Cuál es el operador con más cupos disponibles? | ⬜ | |

**Criterios de éxito:**
- ✅ Debe listar tarifarios activos con fechas de vigencia
- ✅ Debe calcular cupos disponibles correctamente
- ✅ Debe hacer JOINs entre quotas, quota_reservations y operators

---

### 3. TEST: Preguntas sobre Transferencias y Cajas

| # | Pregunta | Resultado | Notas |
|---|----------|-----------|-------|
| 1 | ¿Qué transferencias entre cajas hubo la semana pasada? | ⬜ | |
| 2 | ¿Cuál es el balance actual de todas las cajas? | ⬜ | |
| 3 | ¿Cuánto se transfirió de ARS a USD este mes? | ⬜ | |
| 4 | ¿Cuánto hay en caja? | ⬜ | |

**Criterios de éxito:**
- ✅ Debe mostrar transferencias con fechas y montos
- ✅ Debe mostrar balances por caja y moneda
- ✅ Debe sumar correctamente transferencias por moneda

---

### 4. TEST: Preguntas sobre Cupones y Transacciones

| # | Pregunta | Resultado | Notas |
|---|----------|-----------|-------|
| 1 | ¿Cuántos cupones de pago están vencidos? | ⬜ | |
| 2 | ¿Cuánto monto total hay en cupones pendientes? | ⬜ | |
| 3 | ¿Cuántas transacciones con tarjeta se liquidaron este mes? | ⬜ | |
| 4 | ¿Cuál es el monto neto total de transacciones con tarjeta este mes? | ⬜ | |

**Criterios de éxito:**
- ✅ Debe contar cupones vencidos correctamente
- ✅ Debe sumar montos de cupones pendientes
- ✅ Debe calcular monto neto (después de comisiones) de transacciones

---

### 5. TEST: Preguntas sobre Pasajeros y Documentos

| # | Pregunta | Resultado | Notas |
|---|----------|-----------|-------|
| 1 | ¿Qué pasajeros tienen documentos vencidos para viajes próximos? | ⬜ | |
| 2 | ¿Cuántos pasajeros tiene la operación OP-2025-001? | ⬜ | |
| 3 | ¿Cuántos pasajeros viajan esta semana? | ⬜ | |

**Criterios de éxito:**
- ✅ Debe hacer JOINs complejos entre operation_passengers, documents y operations
- ✅ Debe comparar fechas de expiración con fechas de viaje
- ✅ Debe contar pasajeros correctamente

---

### 6. TEST: Preguntas sobre Múltiples Operadores

| # | Pregunta | Resultado | Notas |
|---|----------|-----------|-------|
| 1 | ¿Qué operación tiene más operadores asociados? | ⬜ | |
| 2 | ¿Cuál es el costo total de una operación incluyendo todos sus operadores? | ⬜ | |

**Criterios de éxito:**
- ✅ Debe hacer JOINs entre operations y operation_operators
- ✅ Debe sumar costos de operación principal + operadores adicionales

---

### 7. TEST: Preguntas sobre Plan de Cuentas

| # | Pregunta | Resultado | Notas |
|---|----------|-----------|-------|
| 1 | ¿Cómo se relaciona la cuenta financiera 'Caja Principal' con el plan de cuentas? | ⬜ | |
| 2 | ¿Qué cuentas del plan de cuentas son de tipo ACTIVO CORRIENTE? | ⬜ | |

**Criterios de éxito:**
- ✅ Debe hacer JOINs entre financial_accounts y chart_of_accounts
- ✅ Debe filtrar por categorías y subcategorías

---

### 8. TEST: Preguntas sobre Comentarios

| # | Pregunta | Resultado | Notas |
|---|----------|-----------|-------|
| 1 | ¿Qué comentarios hay en el lead de Juan Pérez? | ⬜ | |

**Criterios de éxito:**
- ✅ Debe hacer JOINs entre lead_comments, leads y users
- ✅ Debe buscar por nombre de contacto

---

### 9. TEST: Preguntas de CÁLCULOS COMPLEJOS (Rentabilidad)

| # | Pregunta | Resultado | Notas |
|---|----------|-----------|-------|
| 1 | ¿Cuál es el destino más rentable para la agencia Rosario? | ⬜ | |
| 2 | ¿Cuál es el paquete más rentable? | ⬜ | |
| 3 | ¿Cuál es el operador más económico? | ⬜ | |
| 4 | ¿Cuál es el operador más rentable? | ⬜ | |
| 5 | ¿Cuál es el mejor vendedor este mes? | ⬜ | |
| 6 | ¿Cuál es el mejor mes de facturación este año? | ⬜ | |
| 7 | ¿Cuánto vendimos esta semana? | ⬜ | |
| 8 | ¿Cuánto voy a pagar de IVA el próximo mes? | ⬜ | |
| 9 | ¿Cuál es el destino con más operaciones este año? | ⬜ | |
| 10 | ¿Cuál es el margen promedio por agencia? | ⬜ | |
| 11 | ¿Cuál es la tasa de conversión de leads a operaciones este mes? | ⬜ | |
| 12 | ¿Cuánto facturamos por destino este trimestre? | ⬜ | |
| 13 | ¿Cuál es el cliente que más compró este año? | ⬜ | |
| 14 | ¿Cuál es el promedio de días entre cotización y operación? | ⬜ | |

**Criterios de éxito:**
- ✅ Debe hacer cálculos complejos (SUM, AVG, COUNT, GROUP BY)
- ✅ Debe hacer JOINs entre múltiples tablas
- ✅ Debe filtrar por agencia, destino, operador, vendedor
- ✅ Debe ordenar resultados correctamente
- ✅ Debe calcular porcentajes y promedios
- ✅ Debe hacer comparaciones temporales

---

### 10. TEST: Preguntas Complejas (múltiples tablas)

| # | Pregunta | Resultado | Notas |
|---|----------|-----------|-------|
| 1 | ¿Cuál es el margen promedio por destino este trimestre? | ⬜ | |
| 2 | ¿Qué operador tiene más operaciones pendientes de pago? | ⬜ | |
| 3 | ¿Cuántas cotizaciones se convirtieron en operaciones y cuál fue el monto total? | ⬜ | |

**Criterios de éxito:**
- ✅ Debe hacer JOINs entre múltiples tablas
- ✅ Debe hacer agregaciones complejas
- ✅ Debe filtrar por múltiples condiciones

---

## ✅ CRITERIOS DE VALIDACIÓN GENERALES

### Formato de Respuesta
- ✅ Respuestas en español argentino
- ✅ Formato de moneda: $1.234.567,89
- ✅ Formato de fecha: DD/MM/YYYY
- ✅ Uso de emojis apropiados
- ✅ Respuestas concisas pero completas

### Precisión de Datos
- ✅ Números específicos (no aproximaciones)
- ✅ Fechas correctas
- ✅ Montos en moneda correcta (ARS/USD)
- ✅ Cálculos matemáticos correctos

### Manejo de Errores
- Manejo graceful de errores
- Mensajes claros cuando no hay datos
- Sugerencias cuando la pregunta es ambigua

### Performance
- ✅ Respuestas en menos de 5 segundos
- ✅ Queries optimizadas (con LIMIT cuando sea apropiado)
- ✅ No timeouts en queries complejas

---

## 📊 RESUMEN DE RESULTADOS

**Total de tests:** 50+
**Tests pasados:** ___
**Tests fallidos:** ___
**Tasa de éxito:** ___%

---

## 🎯 OBJETIVO FINAL

El AI Companion debe poder responder **TODAS** estas preguntas correctamente, usando:
- Contexto pre-cargado cuando sea posible
- Queries dinámicas cuando necesite datos específicos
- Cálculos complejos con JOINs, GROUP BY, y agregaciones
- Comparaciones temporales y análisis de rentabilidad

---

**Fecha de testing:** _____________
**Tester:** _____________
**Versión del sistema:** _____________

