# Análisis de Funcionalidades - Savia vs ERP Lozada

**Fecha:** 28 de Noviembre de 2025  
**Sistema Analizado:** Savia 5.1126  
**URL:** https://savia5.com.ar

## 📋 Resumen Ejecutivo

Savia es el sistema estándar utilizado por la mayoría de las agencias de turismo en Argentina. Este documento analiza las funcionalidades principales de Savia y las compara con el ERP Lozada actual para identificar oportunidades de mejora.

---

## 🎯 Módulos Principales Identificados

### 1. **PÁGINA PRINCIPAL** (Dashboard)
**Funcionalidades observadas:**
- ✅ Dashboard con estadísticas de ventas
- ✅ Accesos directos a funciones principales (24 botones)
- ✅ Recordatorios/Alertas (10 recordatorios visibles)
- ✅ Búsqueda en expedientes
- ✅ Estadísticas de ventas por período:
  - Ventas del mes
  - Ventas de la última semana
  - Ventas del último día
  - Métricas: Cotizaciones, Expedientes Líquidados, PAXs

**Estado en ERP Lozada:**
- ✅ Dashboard implementado
- ✅ KPIs y métricas básicas
- ⚠️ Falta: Recordatorios/Alertas centralizadas
- ⚠️ Falta: Búsqueda global en expedientes/operaciones
- ⚠️ Falta: Accesos directos rápidos en dashboard

---

### 2. **PERFIL EMPRESARIAL**
**Funcionalidades observadas:**
- Configuración de datos de la empresa
- Perfil y configuración general

**Estado en ERP Lozada:**
- ✅ Módulo de Configuración básico
- ⚠️ Revisar si falta algo específico

---

### 3. **TARIFARIOS Y CUPOS** ⭐ IMPORTANTE
**Funcionalidades observadas:**
- Gestión de tarifarios
- Gestión de cupos disponibles
- Integración con proveedores

**Estado en ERP Lozada:**
- ❌ **NO IMPLEMENTADO** - Esta es una funcionalidad crítica faltante
- **Impacto:** Las agencias necesitan gestionar tarifarios y cupos de operadores

**Recomendación:** Implementar módulo completo de Tarifarios y Cupos

---

### 4. **PROVEEDORES Y EGRESOS**
**Funcionalidades observadas:**
- Gestión de proveedores (operadores)
- Órdenes de egreso
- Pagos a proveedores
- Listado de órdenes de egreso

**Estado en ERP Lozada:**
- ✅ Módulo de Operadores
- ✅ Pagos a operadores
- ⚠️ Revisar si "Órdenes de Egreso" es diferente a pagos actuales

---

### 5. **CLIENTES E INGRESOS**
**Funcionalidades observadas:**
- Gestión de clientes
- Órdenes de ingreso
- Listado de órdenes de ingreso
- Saldos de clientes
- Listado de pasajeros

**Estado en ERP Lozada:**
- ✅ Módulo de Clientes
- ✅ Pagos de clientes
- ⚠️ Revisar concepto de "Órdenes de Ingreso" vs pagos actuales
- ✅ Listado de pasajeros (en operaciones)

---

### 6. **CAJA Y OTROS MEDIOS** ⭐ IMPORTANTE
**Funcionalidades observadas:**
- Gestión de cajas
- Transacciones con tarjetas
- Cupones de cobro
- Egresos varios
- Ingresos no turísticos
- Egresos no turísticos
- Pagos directos
- Pagos en Stand By

**Estado en ERP Lozada:**
- ✅ Módulo de Caja básico
- ✅ Movimientos de caja
- ⚠️ **FALTA:** Gestión de múltiples cajas
- ⚠️ **FALTA:** Transacciones con tarjetas específicas
- ⚠️ **FALTA:** Cupones de cobro
- ⚠️ **FALTA:** Concepto de "Pagos en Stand By"
- ⚠️ **FALTA:** Separación clara entre ingresos/egresos turísticos y no turísticos

**Recomendación:** Expandir módulo de Caja con estas funcionalidades

---

### 7. **CONTABILIDAD Y REPORTES**
**Funcionalidades observadas:**
- Comprobantes de compras
- Comprobantes emitidos
- Comprobantes recibidos
- Reportes contables
- Comisiones percibidas

**Estado en ERP Lozada:**
- ✅ Módulo de Contabilidad básico
- ✅ Libro Mayor
- ✅ IVA
- ✅ Comprobantes básicos
- ⚠️ Revisar si falta algo en reportes

---

## 🔍 Funcionalidades Específicas Identificadas

### **Cotizaciones** ⭐ CRÍTICO
**En Savia:**
- Nueva Cotización
- Listado de Cotizaciones
- Cotizaciones Aprobadas
- Seguimiento de cotizaciones

**Estado en ERP Lozada:**
- ✅ Leads (similar a cotizaciones iniciales)
- ⚠️ **FALTA:** Sistema formal de cotizaciones con aprobación
- ⚠️ **FALTA:** Flujo: Lead → Cotización → Aprobación → Expediente

**Recomendación:** Implementar módulo de Cotizaciones completo

---

### **Expedientes** ⭐ CRÍTICO
**En Savia:**
- Crear Expediente
- Listado de Expedientes
- Expedientes Líquidados
- Búsqueda en expedientes
- PAXs en expedientes

**Estado en ERP Lozada:**
- ✅ Operaciones (equivalente a expedientes)
- ⚠️ Revisar si el concepto de "Expediente Líquidado" es diferente
- ✅ Búsqueda básica

**Nota:** "Expediente" en Savia parece ser equivalente a "Operación" en nuestro sistema

---

### **Cronogramas de Salidas** ⭐ IMPORTANTE
**En Savia:**
- Calendario de salidas programadas
- Gestión de fechas de viajes

**Estado en ERP Lozada:**
- ✅ Fechas en operaciones (departure_date, return_date)
- ⚠️ **FALTA:** Vista de calendario/cronograma visual
- ⚠️ **FALTA:** Gestión centralizada de salidas

**Recomendación:** Implementar vista de calendario/cronograma

---

### **Recordatorios/Alertas**
**En Savia:**
- Sistema de recordatorios centralizado
- 10 recordatorios visibles en dashboard

**Estado en ERP Lozada:**
- ✅ Módulo de Alertas básico
- ⚠️ Revisar si necesita mejor integración en dashboard

---

### **Pagos en Stand By**
**En Savia:**
- Concepto de pagos pendientes de confirmación
- Listado de pagos en Stand By

**Estado en ERP Lozada:**
- ✅ Pagos con estados (PENDING, PAID, OVERDUE)
- ⚠️ Revisar si "Stand By" es diferente a "PENDING"

---

## 📊 Comparativa de Métricas

### Métricas que Savia muestra:
1. **Cotizaciones Totales**
2. **Cotizaciones Aprobadas**
3. **Expedientes Líquidados**
4. **PAXs en Expedientes**

### Métricas que ERP Lozada muestra:
1. ✅ Ventas Totales
2. ✅ Total Operaciones
3. ✅ Margen Total
4. ✅ Margen Promedio
5. ✅ Pendientes Clientes
6. ✅ Pendientes Operadores

**Observación:** Las métricas son diferentes pero complementarias. Podríamos agregar:
- Cotizaciones pendientes de aprobación
- Tasa de conversión (Cotizaciones → Operaciones)
- PAXs totales

---

## 🎯 Funcionalidades Críticas Faltantes

### 1. **Módulo de Tarifarios y Cupos** 🔴 CRÍTICO
- Gestión de tarifarios de operadores
- Control de cupos disponibles
- Integración con operaciones

### 2. **Sistema de Cotizaciones Formal** 🔴 CRÍTICO
- Crear cotizaciones desde leads
- Aprobación de cotizaciones
- Conversión de cotización a expediente/operación
- Seguimiento de estado de cotizaciones

### 3. **Gestión de Múltiples Cajas** 🟡 IMPORTANTE
- Múltiples cajas (caja principal, caja chica, etc.)
- Transferencias entre cajas
- Conciliación de cajas

### 4. **Cronograma/Calendario de Salidas** 🟡 IMPORTANTE
- Vista de calendario de salidas
- Gestión visual de fechas de viajes
- Alertas de salidas próximas

### 5. **Cupones de Cobro** 🟡 IMPORTANTE
- Generación de cupones
- Seguimiento de cupones
- Integración con pagos

### 6. **Transacciones con Tarjetas** 🟡 IMPORTANTE
- Registro específico de transacciones con tarjeta
- Conciliación de tarjetas
- Comisiones de tarjetas

### 7. **Ingresos/Egresos No Turísticos** 🟢 MEJORA
- Separación clara entre movimientos turísticos y no turísticos
- Categorización de movimientos

---

## 💡 Recomendaciones de Implementación

### Prioridad ALTA (Crítico para operación):
1. **Módulo de Tarifarios y Cupos**
2. **Sistema de Cotizaciones con Aprobación**
3. **Gestión de Múltiples Cajas**

### Prioridad MEDIA (Mejora significativa):
4. **Cronograma/Calendario de Salidas**
5. **Cupones de Cobro**
6. **Transacciones con Tarjetas**

### Prioridad BAJA (Nice to have):
7. **Ingresos/Egresos No Turísticos**
8. **Mejoras en Recordatorios/Alertas**
9. **Accesos Directos en Dashboard**

---

## 📝 Notas Adicionales

- Savia tiene un sistema muy maduro y completo
- Muchas funcionalidades de Savia ya están implementadas en ERP Lozada con nombres diferentes
- El concepto de "Expediente" en Savia = "Operación" en nuestro sistema
- El concepto de "Cotización" necesita ser formalizado en nuestro sistema
- La gestión de tarifarios y cupos es una funcionalidad crítica que no tenemos

---

## 🔄 Próximos Pasos Sugeridos

1. Priorizar implementación de **Tarifarios y Cupos**
2. Implementar flujo formal de **Cotizaciones**
3. Expandir módulo de **Caja** con funcionalidades faltantes
4. Agregar vista de **Calendario/Cronograma**
5. Mejorar **Dashboard** con accesos directos y recordatorios

---

**Documento creado:** 28 de Noviembre de 2025  
**Última actualización:** 28 de Noviembre de 2025

