# 🧪 PLAN DE TESTEO COMPLETO - ERP LOZADA

**Fecha:** 2025-01-17  
**Versión:** Post-Reestructuración Contabilidad  
**Estado:** 📋 LISTO PARA EJECUTAR

---

## 📋 ÍNDICE

1. [Pre-requisitos](#pre-requisitos)
2. [Testeo General del Sistema](#testeo-general-del-sistema)
3. [Testeo de Módulo de Contabilidad](#testeo-de-módulo-de-contabilidad)
4. [Testeo de Operaciones](#testeo-de-operaciones)
5. [Testeo de Clientes](#testeo-de-clientes)
6. [Testeo de Reportes y Analytics](#testeo-de-reportes-y-analytics)
7. [Testeo de Integraciones](#testeo-de-integraciones)
8. [Checklist Final](#checklist-final)

---

## 🔧 PRE-REQUISITOS

Antes de comenzar el testeo, verificar:

- [ ] Base de datos actualizada con todas las migraciones (hasta 087)
- [ ] Tabla `monthly_exchange_rates` existe y referencia `users(id)` (no `auth.users(id)`)
- [ ] Usuario de prueba con permisos completos (rol ADMIN o SUPER_ADMIN)
- [ ] Datos de prueba disponibles:
  - [ ] Al menos 3 clientes
  - [ ] Al menos 5 operaciones (algunas con pagos, algunas sin)
  - [ ] Al menos 2 operadores
  - [ ] Al menos 3 gastos recurrentes con categorías diferentes
  - [ ] Al menos 1 socio creado
  - [ ] Al menos 1 comisión pagada en el mes actual
  - [ ] Al menos 1 tipo de cambio mensual configurado

---

## 🌐 TESTEO GENERAL DEL SISTEMA

### 1. Navegación y Sidebar

**Objetivo:** Verificar que toda la navegación funciona correctamente

**Pasos:**
1. Abrir la aplicación
2. Verificar que el sidebar se carga correctamente
3. Verificar que los textos no se truncan (especialmente submenús)
4. Expandir/colapsar secciones del sidebar
5. Navegar a cada sección principal desde el sidebar

**Resultado esperado:**
- ✅ Sidebar tiene ancho adecuado (no truncamiento de texto)
- ✅ Todos los links funcionan
- ✅ Submenús se expanden/colapsan correctamente
- ✅ Navegación fluida entre secciones

**Secciones a verificar:**
- [ ] Dashboard
- [ ] Base de Datos Clientes
- [ ] Operaciones
- [ ] Finanzas → Contabilidad
- [ ] Finanzas → Reportes
- [ ] Configuración

---

### 2. Búsqueda Global (Command Menu / Lupa)

**Objetivo:** Verificar que la búsqueda global funciona en todos los escenarios

**Pasos:**
1. Hacer clic en el icono de lupa o presionar `⌘K` / `Ctrl+K`
2. Buscar un cliente por nombre
3. Buscar una operación por código
4. Buscar por código de reserva (si existe)
5. Buscar un operador
6. Cerrar y volver a abrir la búsqueda
7. Hacer múltiples búsquedas consecutivas

**Resultado esperado:**
- ✅ El dialog se abre correctamente
- ✅ Los resultados aparecen después de escribir 2+ caracteres
- ✅ Los resultados incluyen: clientes, operaciones, operadores, leads
- ✅ Se puede navegar a los resultados haciendo clic
- ✅ El estado se resetea correctamente al cerrar/abrir
- ✅ No queda en estado "cargando" infinito

**Búsquedas a probar:**
- [ ] Nombre de cliente existente
- [ ] Código de operación
- [ ] Código de reserva aéreo
- [ ] Código de reserva hotel
- [ ] Nombre de operador
- [ ] Búsqueda que no devuelve resultados

---

## 💰 TESTEO DE MÓDULO DE CONTABILIDAD

### 1. Posición Contable Mensual

**Objetivo:** Verificar que el TC mensual y la distribución de ganancias funcionan correctamente

**Pasos:**
1. Ir a: Finanzas → Contabilidad → Posición Mensual
2. Seleccionar mes/año actual
3. Verificar que aparece el campo "Tipo de Cambio USD/ARS"
4. Ingresar un TC (ej: 1500)
5. Hacer clic en "Guardar"
6. Verificar que aparece "Actual: 1500.0000"
7. Cambiar de mes y volver al mes original
8. Verificar que el TC se mantiene
9. Revisar la sección "Distribución de Ganancias del Mes"
10. Verificar que aparecen las tres categorías: Comisiones, Gastos Operativos, Participaciones Societarias
11. Verificar que cada una muestra monto en ARS y USD (si hay TC configurado)

**Resultado esperado:**
- ✅ El TC se guarda correctamente sin errores 500
- ✅ El TC se muestra correctamente al seleccionar el mes
- ✅ La distribución muestra valores correctos en ARS y USD
- ✅ Los montos coinciden con los datos reales del mes
- ✅ Si no hay TC, solo muestra ARS (sin USD)

**Verificar:**
- [ ] TC se guarda sin errores
- [ ] TC se carga al cambiar de mes
- [ ] Distribución muestra comisiones del mes
- [ ] Distribución muestra gastos operativos del mes
- [ ] Distribución muestra participaciones societarias del mes
- [ ] Conversión ARS → USD es correcta (ARS / TC)

---

### 2. Deudas por Ventas

**Objetivo:** Verificar que los cálculos y filtros funcionan correctamente

**Pasos:**
1. Ir a: Finanzas → Contabilidad → Deudores por Ventas
2. Verificar que la tabla muestra clientes con deuda
3. Verificar que el monto de deuda está en USD (correctamente convertido)
4. Aplicar filtro por moneda (USD)
5. Aplicar filtro por cliente (escribir nombre)
6. Aplicar filtros de fecha (desde/hasta)
7. Hacer clic en "Exportar Excel"
8. Verificar que se descarga el archivo
9. Abrir el Excel y verificar que tiene 2 hojas: "Resumen por Cliente" y "Detalle de Operaciones"
10. Limpiar filtros y verificar que vuelve a mostrar todos

**Resultado esperado:**
- ✅ La tabla muestra clientes con deuda correctamente calculada
- ✅ Las deudas están en USD (ARS convertidos usando TC histórico)
- ✅ Los filtros funcionan correctamente
- ✅ El Excel se descarga con el formato correcto
- ✅ Los datos en el Excel son correctos

**Verificar:**
- [ ] Cálculo de deuda es correcto (venta - pagos)
- [ ] Conversión ARS → USD usa TC histórico
- [ ] Filtros funcionan (moneda, cliente, fechas)
- [ ] Excel se descarga correctamente
- [ ] Excel tiene formato correcto (2 hojas)

---

### 3. Pagos a Operadores

**Objetivo:** Verificar que el pago masivo y los pagos parciales funcionan

**Pasos:**
1. Ir a: Finanzas → Contabilidad → Pagos a Operadores
2. Verificar que aparecen pagos pendientes
3. Hacer clic en "Cargar Pago Masivo"
4. Aplicar filtros (operador, moneda)
5. Seleccionar múltiples pagos con checkboxes
6. Modificar el monto de uno de los pagos (pago parcial)
7. Seleccionar cuenta de origen del pago
8. Hacer clic en "Registrar Pago"
9. Verificar que los pagos se actualizan en la tabla
10. Verificar que aparece badge "Parcial" si el pago no está completo
11. Verificar que el balance de la cuenta origen disminuyó

**Resultado esperado:**
- ✅ El dialog de pago masivo se abre correctamente
- ✅ Los filtros funcionan en el dialog
- ✅ Se pueden seleccionar múltiples pagos
- ✅ Se pueden modificar montos individuales
- ✅ El pago se registra correctamente
- ✅ Los pagos parciales muestran el badge
- ✅ El balance de la cuenta se actualiza

**Verificar:**
- [ ] Pago masivo funciona correctamente
- [ ] Pagos parciales funcionan
- [ ] Conversión de moneda funciona (si aplica)
- [ ] Balance de cuenta se actualiza
- [ ] Badge "Parcial" aparece cuando corresponde

---

### 4. Gastos Recurrentes

**Objetivo:** Verificar que las categorías, filtros y gráficos funcionan

**Pasos:**
1. Ir a: Finanzas → Contabilidad → Gastos Recurrentes
2. Verificar que los filtros de mes/año NO tienen `value=""` (debe ser "ALL" o número)
3. Seleccionar un mes y año
4. Verificar que los gastos se filtran correctamente
5. Hacer clic en "Nuevo Gasto Recurrente"
6. Seleccionar una categoría
7. Verificar que aparece el indicador de color de la categoría
8. Guardar el gasto
9. Verificar que aparece en la lista con su categoría
10. Revisar los gráficos (barras, líneas, torta)
11. Verificar que los colores coinciden con las categorías

**Resultado esperado:**
- ✅ No hay errores de SelectItem sin value
- ✅ Los filtros de mes/año funcionan correctamente
- ✅ Las categorías se asignan correctamente
- ✅ Los gráficos se muestran correctamente
- ✅ Los colores de los gráficos coinciden con las categorías

**Verificar:**
- [ ] No hay errores en consola sobre SelectItem
- [ ] Filtros de mes/año funcionan
- [ ] Selector de categoría funciona
- [ ] Gráficos se muestran correctamente
- [ ] Datos en gráficos son correctos

---

### 5. Cuentas de Socios

**Objetivo:** Verificar que la creación de socios y retiros funciona

**Pasos:**
1. Ir a: Finanzas → Contabilidad → Cuentas de Socios
2. Hacer clic en "Nuevo Socio" (solo si eres SUPER_ADMIN)
3. Ingresar nombre y guardar
4. Hacer clic en "Nuevo Retiro"
5. Seleccionar socio, cuenta financiera, monto, moneda
6. Guardar el retiro
7. Verificar que el balance de la cuenta financiera disminuyó
8. Ir a la sección de Cuentas Financieras y verificar el balance

**Resultado esperado:**
- ✅ Se puede crear socio (si eres SUPER_ADMIN)
- ✅ Se puede registrar retiro
- ✅ El retiro impacta en el balance de la cuenta
- ✅ El balance se actualiza inmediatamente

**Verificar:**
- [ ] Creación de socio funciona
- [ ] Registro de retiro funciona
- [ ] Balance se actualiza correctamente
- [ ] El retiro aparece en reportes

---

## 📊 TESTEO DE OPERACIONES

### 1. Creación y Edición de Operaciones

**Objetivo:** Verificar que los nuevos campos funcionan

**Pasos:**
1. Ir a: Operaciones
2. Hacer clic en "Nueva Operación"
3. Completar los datos básicos
4. Verificar que aparecen los campos "Cod. Rva Aéreo" y "Cod. Rva Hotel"
5. Ingresar códigos de reserva
6. Guardar la operación
7. Abrir la operación para editar
8. Verificar que los códigos de reserva se guardaron
9. Modificar los códigos y guardar
10. Buscar la operación por código de reserva usando la lupa global

**Resultado esperado:**
- ✅ Los campos de código de reserva aparecen
- ✅ Los códigos se guardan correctamente
- ✅ Los códigos aparecen en la tabla de operaciones
- ✅ La búsqueda global encuentra la operación por código de reserva

**Verificar:**
- [ ] Campos de reserva existen en formulario
- [ ] Códigos se guardan correctamente
- [ ] Códigos aparecen en tabla
- [ ] Búsqueda por código funciona

---

### 2. Pagos en Operaciones

**Objetivo:** Verificar que el sistema de pagos con TC funciona

**Pasos:**
1. Abrir una operación
2. Ir a la sección "Pagos"
3. Hacer clic en "Registrar Cobro"
4. Seleccionar moneda ARS
5. Ingresar monto (ej: 200,000 ARS)
6. Verificar que aparece el campo "Tipo de Cambio"
7. Ingresar TC (ej: 1500)
8. Verificar que aparece "Equivale a USD 133.33"
9. Guardar el pago
10. Verificar que los KPIs se actualizan correctamente (en USD)
11. Verificar que la tabla de pagos muestra: Monto Original, T/C, Equiv. USD
12. Hacer otro pago en USD y verificar que no pide TC

**Resultado esperado:**
- ✅ El campo TC aparece solo para ARS
- ✅ El cálculo USD se muestra en tiempo real
- ✅ Los KPIs se calculan en USD
- ✅ La tabla muestra todas las columnas correctamente
- ✅ USD no requiere TC

**Verificar:**
- [ ] Campo TC aparece para ARS
- [ ] Cálculo USD en tiempo real es correcto
- [ ] KPIs están en USD
- [ ] Tabla muestra columnas correctas
- [ ] USD no requiere TC

---

## 👥 TESTEO DE CLIENTES

### 1. Creación de Cliente con OCR

**Objetivo:** Verificar que el OCR funciona con imágenes y PDFs

**Pasos:**
1. Ir a: Base de Datos Clientes
2. Hacer clic en "Nuevo Cliente"
3. Subir una imagen de DNI
4. Verificar que extrae: nombre, número de documento, número de trámite
5. Verificar que el campo "Número de Trámite" está después de "Número de Documento"
6. Guardar el cliente
7. Crear otro cliente subiendo un PDF
8. Verificar que el PDF se procesa correctamente
9. Verificar que extrae los datos correctamente

**Resultado esperado:**
- ✅ El OCR funciona con imágenes
- ✅ El OCR funciona con PDFs
- ✅ Extrae número de trámite
- ✅ Los campos están en el orden correcto

**Verificar:**
- [ ] OCR con imagen funciona
- [ ] OCR con PDF funciona
- [ ] Número de trámite se extrae
- [ ] Orden de campos es correcto

---

## 📈 TESTEO DE REPORTES Y ANALYTICS

### 1. Reportes de Ventas

**Objetivo:** Verificar que todos los montos están en USD

**Pasos:**
1. Ir a: Finanzas → Reportes → Ventas
2. Verificar que todos los totales están en USD
3. Seleccionar diferentes períodos
4. Verificar que las conversiones ARS → USD son correctas
5. Exportar reporte si está disponible
6. Verificar que el Excel tiene los montos en USD

**Resultado esperado:**
- ✅ Todos los totales están en USD
- ✅ Las conversiones son correctas
- ✅ No hay mezcla de monedas

---

### 2. Reportes de Márgenes

**Objetivo:** Verificar cálculos en USD

**Pasos:**
1. Ir a: Finanzas → Reportes → Márgenes
2. Verificar que todos los cálculos están en USD
3. Revisar agregaciones por vendedor, operador, producto
4. Verificar que las conversiones son correctas

**Resultado esperado:**
- ✅ Todos los cálculos en USD
- ✅ Conversiones correctas
- ✅ Agregaciones correctas

---

## 🔌 TESTEO DE INTEGRACIONES

### 1. Caja y Balances

**Objetivo:** Verificar que los movimientos impactan correctamente

**Pasos:**
1. Ir a: Finanzas → Caja
2. Verificar que aparece el resumen de cajas (ARS y USD separadas)
3. Registrar un pago en USD
4. Verificar que el balance USD se actualiza
5. Registrar un retiro de socio
6. Verificar que el balance disminuye
7. Verificar que ARS y USD son independientes

**Resultado esperado:**
- ✅ Las cajas ARS y USD son independientes
- ✅ Los movimientos impactan correctamente
- ✅ Los balances se actualizan en tiempo real

---

## ✅ CHECKLIST FINAL

Antes de considerar el testeo completo, verificar:

### Funcionalidades Críticas
- [ ] Todas las páginas cargan sin errores
- [ ] No hay errores 500 en APIs
- [ ] No hay errores de SelectItem en consola
- [ ] Los cálculos monetarios están todos en USD
- [ ] Las conversiones ARS → USD son correctas
- [ ] Los filtros funcionan en todas las secciones
- [ ] La búsqueda global funciona correctamente

### Nuevas Funcionalidades
- [ ] TC mensual se guarda y carga correctamente
- [ ] Distribución de ganancias muestra datos correctos
- [ ] Pago masivo funciona
- [ ] Gastos recurrentes con categorías funciona
- [ ] Códigos de reserva se guardan y buscan
- [ ] Número de trámite funciona en OCR

### Migraciones
- [ ] Todas las migraciones están aplicadas
- [ ] La migración 087 usa `users(id)` (no `auth.users(id)`)
- [ ] No hay errores de foreign key constraint

### UI/UX
- [ ] Sidebar no trunca textos
- [ ] Los gráficos se muestran correctamente
- [ ] Los formularios validan correctamente
- [ ] Los mensajes de error son claros

---

## 🐛 PROBLEMAS CONOCIDOS Y SOLUCIONES

### Error: Foreign key constraint en monthly_exchange_rates
**Solución:** Ejecutar manualmente en Supabase SQL Editor:
```sql
ALTER TABLE monthly_exchange_rates 
DROP CONSTRAINT IF EXISTS monthly_exchange_rates_created_by_fkey;

ALTER TABLE monthly_exchange_rates
ADD CONSTRAINT monthly_exchange_rates_created_by_fkey
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
```

### Error: SelectItem sin value
**Solución:** Ya corregido. Verificar que `recurring-payments-page-client.tsx` usa `value="ALL"` en lugar de `value=""`

---

## 📝 NOTAS DE TESTING

- **Ambiente:** Probar primero en staging/pre-producción
- **Datos:** Usar datos de prueba realistas pero no críticos
- **Usuarios:** Probar con diferentes roles (ADMIN, USER, SUPER_ADMIN)
- **Monedas:** Probar con operaciones en ARS y USD
- **Fechas:** Probar con diferentes meses/años
- **Errores:** Documentar cualquier error encontrado con screenshot y pasos para reproducir

---

**Fecha de último testeo:** ___________  
**Ejecutado por:** ___________  
**Resultado:** ☐ APROBADO ☐ RECHAZADO (ver notas arriba)
