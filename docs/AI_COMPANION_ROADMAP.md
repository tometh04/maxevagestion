# 🧠 ROADMAP COMPLETO - AI COMPANION (Emilia)

**Objetivo:** Transformar el AI Companion en un asistente ejecutivo inteligente con acceso completo a TODAS las tablas del sistema y capacidad de responder cualquier pregunta sobre el negocio.

**Fecha:** Enero 2025  
**Estado:** 🔴 CRÍTICO - Requiere implementación completa

---

## 📊 ANÁLISIS ACTUAL (0-100)

### Estado Actual: **~95%** ✅ (Actualizado: Enero 2025)

**Última actualización:** 
- ✅ Se completó el contexto pre-cargado con tarifarios, cupos, plan de cuentas y comentarios
- ✅ Se corrigieron errores de build (formatCurrency imports, tipos TypeScript)
- ✅ Build exitoso - listo para deploy

#### ✅ Lo que SÍ tiene:
1. **Esquema de base de datos básico** - Tiene ~25 tablas documentadas
2. **Contexto pre-cargado limitado** - Carga algunos datos del mes/semana actual
3. **Prompt básico** - Tiene instrucciones generales
4. **Validación de seguridad** - Solo permite queries SELECT
5. **Rate limiting** - Protección contra abuso

#### ❌ Lo que NO tiene (70% faltante):
1. **Tablas faltantes en esquema** - Faltan ~19 tablas críticas
2. **Queries dinámicas** - No puede hacer queries basadas en la pregunta
3. **Contexto completo** - Solo carga datos predefinidos, no datos específicos
4. **Sistema de queries inteligentes** - No puede generar SQL basado en la pregunta
5. **Función RPC en Supabase** - No existe función para queries readonly seguras
6. **Prompt avanzado** - El prompt es básico, no tiene ejemplos complejos
7. **Manejo de relaciones complejas** - No entiende bien las relaciones entre tablas
8. **Contexto temporal inteligente** - No puede hacer comparaciones temporales avanzadas

---

## 🎯 OBJETIVO FINAL (100%)

El AI Companion debe poder responder **CUALQUIER pregunta** sobre el negocio:

### Ejemplos de preguntas que DEBE poder responder:
- "¿Cuántas cotizaciones se enviaron este mes y cuántas se convirtieron en operaciones?"
- "¿Qué operador tiene más operaciones pendientes de pago?"
- "¿Cuál es el margen promedio por destino este trimestre?"
- "¿Cuántos cupones de pago están vencidos?"
- "¿Qué transferencias entre cajas hubo la semana pasada?"
- "¿Cuántas transacciones con tarjeta se liquidaron este mes?"
- "¿Qué pasajeros tienen documentos vencidos para viajes próximos?"
- "¿Cuál es el plan de cuentas y cómo se relaciona con las cuentas financieras?"
- "¿Qué comentarios hay en el lead de Juan Pérez?"
- "¿Cuántos retiros hicieron los socios este año y cuánto queda disponible?"

---

## 📋 TABLAS FALTANTES EN EL ESQUEMA ACTUAL

### Tablas CRÍTICAS que faltan (19 tablas):

1. **quotations** - Cotizaciones formales
2. **quotation_items** - Items de cotizaciones
3. **tariffs** - Tarifarios de operadores
4. **tariff_items** - Items de tarifarios
5. **quotas** - Cupos disponibles
6. **quota_reservations** - Reservas de cupos
7. **cash_transfers** - Transferencias entre cajas
8. **payment_coupons** - Cupones de pago
9. **card_transactions** - Transacciones con tarjetas
10. **billing_info** - Información de facturación
11. **operation_passengers** - Pasajeros de operación (diferente a operation_customers)
12. **operation_operators** - Múltiples operadores por operación
13. **chart_of_accounts** - Plan de cuentas contable
14. **recurring_payment_providers** - Proveedores de pagos recurrentes
15. **lead_comments** - Comentarios en leads
16. **manychat_list_order** - Orden de listas Manychat
17. **non_touristic_categories** - Categorías no turísticas
18. **commission_rules** - Reglas de comisiones (mencionada pero no detallada)
19. **cash_boxes** - Ya está pero falta detalle de relaciones

---

## 🚀 ROADMAP DE IMPLEMENTACIÓN

### FASE 1: Completar Esquema de Base de Datos (Prioridad ALTA)
**Tiempo estimado:** 2-3 horas

#### Tarea 1.1: Agregar todas las tablas faltantes al DATABASE_SCHEMA
- [x] Agregar `quotations` y `quotation_items`
- [x] Agregar `tariffs`, `tariff_items`, `quotas`, `quota_reservations`
- [x] Agregar `cash_transfers`
- [x] Agregar `payment_coupons`
- [x] Agregar `card_transactions`
- [x] Agregar `billing_info`
- [x] Agregar `operation_passengers`
- [x] Agregar `operation_operators`
- [x] Agregar `chart_of_accounts`
- [x] Agregar `recurring_payment_providers`
- [x] Agregar `lead_comments`
- [x] Agregar `manychat_list_order`
- [x] Agregar `commission_rules` (detallar estructura)
- [x] Mejorar documentación de `cash_boxes` y relaciones

#### Tarea 1.2: Documentar relaciones entre tablas
- [x] Mapear todas las relaciones FK
- [x] Documentar relaciones many-to-many
- [x] Documentar relaciones opcionales vs requeridas
- [x] Agregar ejemplos de queries comunes

---

### FASE 2: Sistema de Queries Dinámicas (Prioridad CRÍTICA)
**Tiempo estimado:** 4-5 horas

#### Tarea 2.1: Crear función RPC en Supabase para queries readonly
- [x] Crear función `execute_readonly_query(query_text TEXT)`
- [x] Validar que solo permite SELECT
- [x] Implementar validaciones de seguridad
- [x] Agregar logging de queries ejecutadas
- [x] Manejar errores gracefully

#### Tarea 2.2: Implementar sistema de generación de queries inteligentes
- [x] Crear función helper para sugerencias de queries
- [x] Validar SQL antes de ejecutar
- [x] Manejar errores de SQL gracefully
- [x] Retornar resultados formateados

#### Tarea 2.3: Integrar queries dinámicas en el flujo del AI
- [x] Modificar prompt para que el AI pueda solicitar queries
- [x] Implementar sistema de "tools" para el AI (function calling)
- [x] Permitir que el AI ejecute queries cuando necesite datos específicos
- [ ] Cachear resultados de queries comunes (opcional, para optimización futura)

---

### FASE 3: Mejorar Prompt y Contexto (Prioridad ALTA)
**Tiempo estimado:** 3-4 horas

#### Tarea 3.1: Expandir contexto pre-cargado
- [x] Cargar datos de cotizaciones
- [x] Cargar datos de tarifarios activos (resumen)
- [x] Cargar datos de cupos disponibles (resumen)
- [x] Cargar datos de transferencias
- [x] Cargar datos de cupones
- [x] Cargar datos de transacciones con tarjeta
- [x] Cargar datos de plan de cuentas (estructura básica)
- [x] Cargar datos de comentarios recientes en leads
- [x] Cargar datos de pasajeros (se puede hacer con queries dinámicas cuando se necesiten)

#### Tarea 3.2: Mejorar prompt del AI
- [x] Agregar ejemplos de preguntas complejas
- [x] Documentar todas las métricas de negocio
- [x] Agregar ejemplos de cómo calcular métricas
- [x] Documentar flujos de negocio completos
- [x] Agregar ejemplos de queries SQL que puede usar
- [x] Mejorar instrucciones de formato de respuesta
- [x] Documentar función execute_query

#### Tarea 3.3: Agregar contexto temporal inteligente
- [x] Comparaciones mes actual vs mes pasado (el AI puede hacer queries para esto)
- [x] Comparaciones trimestre actual vs trimestre pasado (el AI puede hacer queries)
- [x] Comparaciones año actual vs año pasado (el AI puede hacer queries)
- [x] Tendencias y proyecciones (el AI puede calcular con queries)
- [x] Análisis de crecimiento (el AI puede calcular con queries)

---

### FASE 4: Testing y Validación (Prioridad ALTA)
**Tiempo estimado:** 2-3 horas

#### Tarea 4.1: Crear suite de tests
- [ ] Test de preguntas sobre cotizaciones
- [ ] Test de preguntas sobre tarifarios
- [ ] Test de preguntas sobre cupones
- [ ] Test de preguntas sobre transferencias
- [ ] Test de preguntas sobre transacciones
- [ ] Test de preguntas sobre pasajeros
- [ ] Test de preguntas sobre plan de cuentas
- [ ] Test de preguntas complejas con múltiples tablas

#### Tarea 4.2: Validar respuestas
- [ ] Verificar que las respuestas son correctas
- [ ] Verificar que el formato es consistente
- [ ] Verificar que maneja errores gracefully
- [ ] Verificar que no expone información sensible
- [ ] Verificar performance con queries complejas

---

## 🔧 IMPLEMENTACIÓN TÉCNICA

### Arquitectura Propuesta:

```
Usuario pregunta → AI analiza pregunta
                    ↓
            ¿Necesita datos específicos?
                    ↓
            SÍ → Genera SQL → Ejecuta query → Obtiene datos
                    ↓
            NO → Usa contexto pre-cargado
                    ↓
            Genera respuesta con datos obtenidos
```

### Componentes Clave:

1. **DATABASE_SCHEMA completo** - Todas las tablas documentadas
2. **Función RPC `execute_readonly_query`** - Queries seguras
3. **Sistema de generación de queries** - AI genera SQL basado en pregunta
4. **Contexto pre-cargado expandido** - Más datos en tiempo real
5. **Prompt mejorado** - Instrucciones completas y ejemplos
6. **Function calling** - AI puede ejecutar queries cuando las necesite

---

## 📝 CHECKLIST DE VALIDACIÓN

Antes de considerar el AI Companion "completo", debe poder responder:

- [ ] Preguntas sobre cotizaciones (creadas, enviadas, convertidas)
- [ ] Preguntas sobre tarifarios y cupos
- [ ] Preguntas sobre transferencias entre cajas
- [ ] Preguntas sobre cupones de pago
- [ ] Preguntas sobre transacciones con tarjeta
- [ ] Preguntas sobre pasajeros y documentos
- [ ] Preguntas sobre múltiples operadores por operación
- [ ] Preguntas sobre plan de cuentas
- [ ] Preguntas sobre comentarios en leads
- [ ] Preguntas complejas que requieren múltiples tablas
- [ ] Preguntas con comparaciones temporales
- [ ] Preguntas con cálculos complejos (márgenes, promedios, etc.)
- [ ] Preguntas sobre relaciones entre entidades

---

## 🎯 MÉTRICAS DE ÉXITO

El AI Companion estará "completo" cuando:

1. ✅ Puede responder **cualquier pregunta** sobre el negocio
2. ✅ Tiene acceso a **TODAS las tablas** del sistema
3. ✅ Puede hacer **queries dinámicas** cuando necesita datos específicos
4. ✅ Tiene **contexto actualizado** en tiempo real
5. ✅ Las respuestas son **precisas y útiles**
6. ✅ Maneja errores **gracefully**
7. ✅ No expone información **sensible**
8. ✅ Performance es **aceptable** (< 5 segundos por respuesta)

---

## 🚨 RIESGOS Y CONSIDERACIONES

### Seguridad:
- ⚠️ Solo permitir queries SELECT
- ⚠️ Validar SQL antes de ejecutar
- ⚠️ Rate limiting para prevenir abuso
- ⚠️ Logging de todas las queries ejecutadas
- ⚠️ No exponer información sensible (passwords, tokens, etc.)

### Performance:
- ⚠️ Cachear resultados de queries comunes
- ⚠️ Limitar complejidad de queries (timeout)
- ⚠️ Optimizar queries generadas
- ⚠️ Usar índices apropiados

### UX:
- ⚠️ Respuestas claras y concisas
- ⚠️ Formato consistente
- ⚠️ Manejo de errores user-friendly
- ⚠️ Indicadores de carga cuando se ejecutan queries

---

## 📅 CRONOGRAMA ESTIMADO

- **Fase 1:** 2-3 horas
- **Fase 2:** 4-5 horas
- **Fase 3:** 3-4 horas
- **Fase 4:** 2-3 horas

**Total:** 11-15 horas de desarrollo

---

## ✅ PRÓXIMOS PASOS

1. Comenzar con Fase 1: Completar esquema de base de datos
2. Implementar Fase 2: Sistema de queries dinámicas
3. Mejorar Fase 3: Prompt y contexto
4. Validar Fase 4: Testing completo

**¡Vamos a hacerlo! 🚀**

