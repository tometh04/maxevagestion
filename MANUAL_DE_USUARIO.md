# 📘 MANUAL DE USUARIO COMPLETO - MAXEVA GESTIÓN

**Versión:** 2.0  
**Última actualización:** Diciembre 2025  
**Sistema:** MAXEVA GESTIÓN - Sistema Integral de Gestión para Agencias de Viajes

---

## 📋 TABLA DE CONTENIDOS

1. [Introducción](#introducción)
2. [Acceso al Sistema](#acceso-al-sistema)
3. [Dashboard](#dashboard)
4. [Leads](#leads)
5. [Cotizaciones](#cotizaciones)
6. [Operaciones](#operaciones)
   - [Lista de Operaciones](#lista-de-operaciones)
   - [Tarifarios](#tarifarios)
   - [Cupos](#cupos)
7. [Clientes](#clientes)
8. [Operadores](#operadores)
9. [Caja](#caja)
   - [Dashboard de Caja](#dashboard-de-caja)
   - [Movimientos](#movimientos)
   - [Pagos](#pagos)
10. [Contabilidad](#contabilidad)
    - [Libro Mayor](#libro-mayor)
    - [IVA](#iva)
    - [Cuentas Financieras](#cuentas-financieras)
    - [Pagos a Operadores](#pagos-a-operadores)
11. [Mensajes WhatsApp](#mensajes-whatsapp)
12. [Alertas](#alertas)
13. [Calendario](#calendario)
14. [Reportes](#reportes)
15. [Configuración](#configuración)
16. [Funciones Avanzadas](#funciones-avanzadas)
    - [Búsqueda Global (⌘K)](#búsqueda-global-k)
    - [Notificaciones](#notificaciones)
    - [Estados de Cuenta](#estados-de-cuenta)
    - [Generación de PDFs](#generación-de-pdfs)
    - [Importación de Datos](#importación-de-datos)
17. [Flujos de Trabajo Diarios](#flujos-de-trabajo-diarios)

---

## 🔐 INTRODUCCIÓN

### ¿Qué es MAXEVA GESTIÓN?

MAXEVA GESTIÓN es un sistema integral de gestión para agencias de viajes que permite administrar todo el ciclo de vida de una venta: desde la captación del lead hasta el cierre contable, el pago de comisiones y la comunicación con clientes vía WhatsApp.

### Roles del Sistema

- **SUPER_ADMIN**: Acceso total al sistema, gestión de agencias y usuarios
- **ADMIN**: Acceso completo a todos los módulos de su agencia
- **SELLER**: Acceso a leads, cotizaciones, operaciones y su propio balance/comisiones
- **VIEWER**: Solo lectura, sin permisos de modificación

---

## 🔑 ACCESO AL SISTEMA

### Pasos para Iniciar Sesión

1. Ingresar a la URL del sistema: `https://www.maxevagestion.com`
2. Ingresar email y contraseña
3. El sistema redirigirá automáticamente según tu rol

### Cambiar Modo Claro/Oscuro

- En el **sidebar izquierdo**, en la parte inferior, encontrarás el botón de cambio de tema
- Opciones: Claro, Oscuro, Sistema

### Navegación Principal

El sidebar izquierdo contiene todos los módulos:
- 📊 Dashboard
- 🎯 Leads
- 📄 Cotizaciones
- ✈️ Operaciones
- 👥 Clientes
- 🏨 Operadores
- 💵 Caja
- 📈 Contabilidad
- 💬 Mensajes
- 🔔 Alertas
- 📅 Calendario
- 📊 Reportes
- ⚙️ Configuración

---

## 📊 DASHBOARD

### ¿Qué es el Dashboard?

El Dashboard es la pantalla principal que muestra un resumen ejecutivo de toda la operación. Es lo primero que verás al ingresar al sistema.

### Secciones del Dashboard

#### 1. **KPIs Principales (Tarjetas Superiores)**

- **Ventas Totales**: Suma de todos los ingresos en el período (formato abreviado: $23.78M)
- **Total Operaciones**: Cantidad de operaciones en el período
- **Margen Total**: Suma de márgenes de todas las operaciones
- **Margen Promedio**: Porcentaje promedio de margen de ganancia

Cada KPI muestra una **comparación vs período anterior** con flechas verdes (↑ mejora) o rojas (↓ disminución).

#### 2. **Pendientes**

- **Pendientes Clientes**: Total por cobrar de clientes (color ámbar)
- **Pendientes Operadores**: Total a pagar a operadores (color ámbar)

#### 3. **Cumpleaños del Día** 🎂

Tarjeta especial que muestra clientes que cumplen años hoy:
- Lista de clientes con su nombre y foto de perfil
- Botón rápido de **WhatsApp** para enviar felicitación
- Click en el cliente para ver su perfil completo

#### 4. **Alertas Pendientes** 🔔

Muestra las 5 alertas más urgentes:
- **Pagos vencidos** (resaltados en ámbar)
- **Viajes próximos**
- **Documentos faltantes**
- **Márgenes bajos**
- Click en cualquier alerta para ir directamente a resolverla

#### 5. **Próximos Viajes** ✈️

Muestra las 5 operaciones con salidas más próximas:
- Código de archivo y destino
- Días restantes (badge de urgencia: rojo < 3 días, ámbar < 7 días)
- Cantidad de pasajeros
- Vendedor asignado

#### 6. **Top Vendedores del Mes** 🏆

Ranking de los 5 mejores vendedores:
- Posición con medalla (oro, plata, bronce)
- Cantidad de operaciones
- Margen generado
- Ventas totales

### Filtros del Dashboard

1. **Rango de Fechas**: Selecciona el período a visualizar
2. **Agencia**: Filtra por agencia (si tienes múltiples agencias)
3. **Vendedor**: Filtra por vendedor específico
4. **Botón "Reiniciar filtros"**: Restablece todos los filtros

---

## 🎯 LEADS

### ¿Qué es un Lead?

Un Lead es un contacto potencial que ha mostrado interés en viajar. Es la primera etapa del proceso de venta.

### Funcionalidades de Leads

#### 1. **Visualización de Leads**

Tienes dos formas de ver los leads:

**a) Vista Kanban (Trello)**
- Muestra los leads organizados por listas de Trello
- Cada columna representa una lista de Trello
- Puedes arrastrar y soltar leads entre columnas para cambiar su estado

**b) Vista Tabla**
- Vista tradicional con filas y columnas
- Muestra: Contacto, Destino, Región, Estado, Vendedor, Fecha, Acciones

#### 2. **Crear un Nuevo Lead**

**Pasos:**

1. Clic en el botón **"+ Nuevo Lead"** (esquina superior derecha)
2. Completar el formulario:
   - **Nombre del Contacto** (obligatorio)
   - **Teléfono** (obligatorio)
   - **Email** (opcional)
   - **Instagram** (opcional)
   - **Destino** (obligatorio)
   - **Región**: Selecciona de la lista
   - **Agencia**: Selecciona la agencia
   - **Vendedor Asignado**: Quién se encargará del lead
   - **Origen**: Dónde se obtuvo el lead
   - **Notas**: Información adicional
   - **Tiene depósito recibido?**: Switch para indicar si ya recibiste un pago
3. Clic en **"Crear Lead"**

**¿Qué sucede al crear un Lead?**

- Se crea un registro en la base de datos
- Si tiene depósito recibido, se puede crear un movimiento en Caja
- Si está configurado Trello, se crea una tarjeta automáticamente
- Se asigna a un vendedor

#### 3. **Estados de un Lead**

- **NEW**: Nuevo (recién creado)
- **IN_PROGRESS**: En Progreso
- **QUOTED**: Cotizado (ya se envió una cotización)
- **WON**: Ganado (se convirtió en operación)
- **LOST**: Perdido (el cliente no siguió adelante)

#### 4. **Convertir Lead a Operación**

Cuando un lead se convierte en venta confirmada:

1. Buscar el lead en la tabla o kanban
2. Clic en el botón **"Convertir"**
3. Confirmar los datos del cliente
4. Clic en **"Convertir"**

**¿Qué sucede al convertir un Lead?**

- Se crea una nueva **Operación** con estado `CONFIRMED`
- Se **crea automáticamente un Cliente** (o se asocia uno existente)
- El lead cambia su estado a `WON`
- Si el lead tenía depósito, se transfiere a la operación
- Si había movimientos de caja asociados al lead, se transfieren

---

## 📄 COTIZACIONES

### ¿Qué es una Cotización?

Una cotización es un documento formal que se envía a un cliente potencial con la propuesta de viaje, incluyendo precios, servicios y condiciones.

### Funcionalidades de Cotizaciones

#### 1. **Crear una Nueva Cotización**

1. Clic en **"+ Nueva Cotización"**
2. Completar el formulario:
   - **Número de Cotización**: Se genera automáticamente
   - **Cliente**: Seleccionar cliente existente o crear uno nuevo
   - **Vendedor**: Quien está realizando la cotización
   - **Destino**: Destino del viaje
   - **Fecha de Viaje**: Fecha estimada de inicio
   - **Fecha de Vencimiento**: Hasta cuándo es válida
   - **Moneda**: ARS o USD
   - **Seleccionar Tarifario**: Usa el **selector de tarifas** para pre-cargar precios
   - **Servicios**: Agregar servicios incluidos
   - **Notas**: Información adicional

#### 2. **Selector de Tarifas** 📋

Al crear cotizaciones, puedes usar tarifarios existentes:

1. Clic en **"Seleccionar Tarifa"**
2. Se abre un diálogo con tarifarios disponibles
3. Selecciona el tarifario y la tarifa específica
4. Los precios se pre-cargan automáticamente

#### 3. **Estados de Cotización**

- **DRAFT**: Borrador
- **SENT**: Enviada al cliente
- **PENDING_APPROVAL**: Pendiente de Aprobación
- **APPROVED**: Aprobada
- **REJECTED**: Rechazada
- **EXPIRED**: Expirada
- **CONVERTED**: Convertida en operación

#### 4. **Enviar Cotización por Email** 📧

1. Abrir la cotización
2. Clic en **"Enviar por Email"**
3. Se genera automáticamente un **PDF** de la cotización
4. El cliente recibe el email con el PDF adjunto

#### 5. **Descargar PDF de Cotización** 📑

1. Abrir la cotización
2. Clic en **"Descargar PDF"**
3. Se descarga el documento con formato profesional

#### 6. **Convertir Cotización en Operación**

1. Buscar la cotización (estado `APPROVED` o `SENT`)
2. Clic en **"Convertir en Operación"**
3. Confirmar los datos
4. Se crea automáticamente:
   - Una nueva operación
   - Un cliente (si no existía)
   - Todos los servicios copiados
   - **Reserva de cupos** (si había cupos asociados)

---

## ✈️ OPERACIONES

### ¿Qué es una Operación?

Una Operación es una venta confirmada. Representa un viaje vendido que debe ser gestionado hasta su finalización.

### Funcionalidades de Operaciones

#### 1. **Ver Lista de Operaciones**

La lista muestra:
- **Código de Archivo**: Identificador único (ej: OP12002-2025)
- **Estado**: CONFIRMED, CANCELLED, COMPLETED
- **Cliente(s)**: Nombre(s) del(os) cliente(s)
- **Destino**: Destino del viaje
- **Fecha de Viaje**: Fecha de inicio
- **Vendedor**: Quien realizó la venta
- **Total de Venta**: Monto total
- **Margen**: Ganancia calculada

**Acciones Rápidas en la Tabla:**
- **Editar**: Botón de lápiz para editar la operación rápidamente
- **Ver**: Click en la fila para ver detalles completos

#### 2. **Detalle de una Operación**

Al hacer clic en una operación, verás:

**Información General:**
- Tipo, estado, fechas, destino
- **Botón Editar** (abre diálogo de edición)

**Pestañas de Información:**
- **Clientes**: Lista de pasajeros con botón WhatsApp para cada uno
- **Servicios**: Detalle de servicios incluidos
- **Pagos de Clientes**: Cronograma de pagos esperados
- **Pagos a Operadores**: Cronograma de pagos a realizar
- **Movimientos de Caja**: Movimientos asociados
- **Contabilidad**: Ingresos, gastos, márgenes, IVA
- **Documentos**: Documentos asociados
- **Mensajes**: Historial de mensajes WhatsApp enviados

#### 3. **Editar una Operación**

1. Abrir los detalles de la operación
2. Clic en **"Editar"** (botón con ícono de lápiz)
3. Se abre un **diálogo de edición** con:
   - Información básica (destino, fechas, etc.)
   - Precios de venta y costo
   - **Cálculo automático de margen** en tiempo real
4. Clic en **"Guardar Cambios"**

#### 4. **Gestionar Pagos de Clientes**

**Marcar un Pago como Pagado:**

1. En la sección "Pagos de Clientes", buscar el pago pendiente
2. Clic en **"Marcar como Pagado"**
3. Completar:
   - **Fecha de Pago**: Fecha real
   - **Referencia**: Número de comprobante
4. Clic en **"Confirmar Pago"**

**¿Qué sucede automáticamente?**

- El pago cambia de estado `PENDING` a `PAID`
- Se crea un **movimiento de caja** (INCOME)
- Se crea un **movimiento contable** (ledger_movement)
- Se genera un **mensaje de WhatsApp** de confirmación de pago (si está activo)
- Se puede calcular **comisión** para el vendedor

#### 5. **Generar Voucher PDF** 🎫

1. En el detalle de la operación
2. Clic en **"Descargar Voucher"**
3. Se genera un PDF profesional con todos los detalles del viaje

---

## 🏢 TARIFARIOS

### ¿Qué es un Tarifario?

Un Tarifario es un catálogo de precios de servicios que los operadores proporcionan a la agencia.

### Uso de Tarifarios

1. **En Cotizaciones**: Al crear una cotización, puedes seleccionar una tarifa del tarifario para pre-cargar precios
2. **En Operaciones**: Sirve como referencia de precios

---

## 📦 CUPOS

### ¿Qué es un Cupo?

Un Cupo es una disponibilidad limitada de un servicio (habitaciones de hotel, plazas en un paquete, etc.) que se puede reservar para una operación.

### Funcionalidades de Cupos

#### 1. **Selector de Cupos**

Al crear operaciones, puedes reservar cupos:

1. Clic en **"Seleccionar Cupo"**
2. Ver disponibilidad en tiempo real
3. Reservar cantidad necesaria

**¿Qué sucede al reservar?**

- La cantidad disponible disminuye
- El cupo queda asociado a la operación
- Si se cancela la operación, el cupo se libera automáticamente

---

## 👥 CLIENTES

### ¿Qué es un Cliente?

Un Cliente es una persona que ha realizado al menos una compra o está registrado en el sistema.

### Funcionalidades de Clientes

#### 1. **Lista de Clientes**

La tabla muestra:
- **Nombre**: Nombre completo
- **Email**: Email de contacto
- **Teléfono**: Número de teléfono
- **Instagram**: Handle de Instagram
- **Operaciones**: Cantidad de operaciones
- **Acciones**:
  - **WhatsApp**: Botón para enviar mensaje rápido
  - **Editar**: Editar datos del cliente

#### 2. **Crear un Nuevo Cliente**

1. Clic en **"Nuevo Cliente"**
2. Completar:
   - **Nombre** y **Apellido** (obligatorio)
   - **Email** (obligatorio)
   - **Teléfono** (obligatorio)
   - **Instagram** (opcional)
   - **Documento**: DNI, Pasaporte, etc.
   - **Fecha de Nacimiento**: Para alertas de cumpleaños
   - **Nacionalidad**
3. Clic en **"Crear Cliente"**

#### 3. **Detalle de un Cliente**

Al hacer clic en un cliente, verás:

**Pestañas:**
- **Información**: Todos los datos de contacto
- **Operaciones**: Lista de todas sus operaciones
- **Estado de Cuenta**: Balance y pagos pendientes
- **Mensajes**: Historial de mensajes WhatsApp enviados

**Acciones:**
- **Editar**: Modificar datos del cliente
- **WhatsApp Rápido**: Enviar mensaje directo
- **Enviar Estado de Cuenta**: Enviar resumen por email

#### 4. **Eliminar un Cliente**

- Solo se pueden eliminar clientes **sin operaciones asociadas**
- Si tiene operaciones, primero cancela o elimina las operaciones

#### 5. **Estado de Cuenta del Cliente** 📊

En la pestaña "Estado de Cuenta" del cliente:
- **Balance Total**: Total pendiente de pago
- **Historial de Pagos**: Todos los pagos realizados
- **Próximos Vencimientos**: Pagos por vencer
- **Botón "Enviar Estado de Cuenta"**: Envía un PDF por email

---

## 🏨 OPERADORES

### ¿Qué es un Operador?

Un Operador es una empresa proveedora de servicios turísticos con quien la agencia trabaja.

### Funcionalidades de Operadores

#### 1. **Lista de Operadores**

Muestra:
- **Nombre**: Nombre de la empresa
- **Contacto**: Persona de contacto
- **Email**: Email de contacto
- **Teléfono**: Teléfono
- **Límite de Crédito**: Límite de crédito asignado

#### 2. **Crear un Nuevo Operador**

1. Clic en **"Nuevo Operador"**
2. Completar:
   - **Nombre** (obligatorio)
   - **Tipo**: HOTEL, MAYORISTA, AEROLINEA, OTROS
   - **Email** y **Teléfono**
   - **Contacto**: Nombre de la persona
   - **Límite de Crédito**: Monto máximo de deuda
3. Clic en **"Crear Operador"**

#### 3. **Detalle de un Operador**

**Pestañas:**
- **Información**: Datos de contacto
- **Operaciones**: Lista de operaciones con este operador
- **Estado de Cuenta**: Balance y pagos pendientes/realizados

#### 4. **Editar/Eliminar Operador**

- **Editar**: Clic en botón "Editar" en el detalle
- **Eliminar**: Solo si no tiene operaciones asociadas

---

## 💰 CAJA

### ¿Qué es Caja?

Caja gestiona todos los movimientos de dinero entrante y saliente de la agencia.

### Dashboard de Caja

- **Total en Caja (ARS)**: Balance en pesos
- **Total en Caja (USD)**: Balance en dólares
- **Ingresos del Período**: Total de entradas
- **Egresos del Período**: Total de salidas
- **Flujo Neto**: Diferencia

### Movimientos

#### Crear un Movimiento Manual

Para gastos operativos o ingresos varios no asociados a operaciones:

1. Clic en **"+ Nuevo Movimiento"**
2. Completar:
   - **Tipo**: INCOME o EXPENSE
   - **Categoría**: Seleccionar categoría
   - **Monto** y **Moneda**
   - **Fecha**
   - **Notas**: Descripción detallada
3. Clic en **"Crear Movimiento"**

### Pagos

Centraliza TODOS los pagos esperados y realizados:
- Pagos de clientes
- Pagos a operadores
- Filtros por estado: PENDING, PAID, OVERDUE

---

## 📊 CONTABILIDAD

### Libro Mayor

Registro cronológico de TODOS los movimientos contables:
- **Tipo**: INCOME, EXPENSE, FX_GAIN, FX_LOSS, COMMISSION
- **Monto Original**: En moneda original
- **Monto ARS**: Equivalente en pesos

### IVA

Cálculo automático de IVA:
- **IVA Ventas**: De pagos recibidos de clientes
- **IVA Compras**: De pagos a operadores
- **IVA a Pagar**: Débito - Crédito

### Pagos a Operadores

Lista centralizada de pagos a operadores con:
- Historial de pagos
- Pagos pendientes
- Exportación a Excel

---

## 💬 MENSAJES WHATSAPP

### ¿Qué es el Sistema de Mensajes?

El sistema de mensajes permite enviar comunicaciones por WhatsApp a clientes de forma organizada y automatizada, usando links directos (sin API de WhatsApp Business).

### Acceder a Mensajes

En el sidebar, clic en **"Mensajes"** (ícono de mensaje)

### Secciones del Centro de Mensajes

#### 1. **Pestañas de Mensajes**

- **Pendientes**: Mensajes generados esperando ser enviados
- **Enviados**: Mensajes ya enviados
- **Omitidos**: Mensajes que decidiste no enviar
- **Todos**: Vista completa

#### 2. **Cada Mensaje Muestra**

- **Cliente**: Nombre y avatar
- **Mensaje**: Preview del contenido
- **Operación/Pago asociado** (si aplica)
- **Estado**: Pendiente, Enviado, Omitido
- **Botón "Enviar por WhatsApp"**: Abre WhatsApp con el mensaje pre-escrito

#### 3. **Templates de Mensajes** 📝

Clic en **"Templates"** para gestionar plantillas:

**Templates Predefinidos:**
- **Cotización Enviada**: Cuando envías una cotización
- **Recordatorio de Pago (3 días)**: 3 días antes del vencimiento
- **Pago Recibido**: Confirmación de pago
- **Pago Vencido**: Alerta de mora
- **Viaje Próximo (7 días)**: Recordatorio de viaje
- **Viaje Mañana**: Último recordatorio
- **Post-Viaje**: Seguimiento después del viaje
- **Feliz Cumpleaños**: Felicitación automática
- **Plan de Pagos Creado**: Cuando generas un plan de pagos

**Cargar Templates por Defecto:**

Si no tienes templates:
1. Clic en **"Templates"**
2. Clic en **"Cargar Templates por Defecto"**
3. Se cargan 10 templates predefinidos

**Crear un Template Nuevo:**

1. Clic en **"Templates"**
2. Clic en **"Nuevo Template"**
3. Completar:
   - **Nombre**: Nombre descriptivo
   - **Categoría**: PAYMENT, TRIP, BIRTHDAY, MARKETING, CUSTOM
   - **Tipo de Trigger**: Cuándo se genera (manual, automático)
   - **Emoji Prefijo**: Emoji inicial del mensaje
   - **Template**: Texto con variables como `{nombre}`, `{destino}`, `{monto}`
4. Clic en **"Crear"**

**Variables Disponibles:**
- `{nombre}`: Nombre del cliente
- `{destino}`: Destino del viaje
- `{monto}`: Monto del pago
- `{moneda}`: Moneda (ARS, USD)
- `{fecha_vencimiento}`: Fecha de vencimiento
- `{n_cuotas}`: Número de cuotas
- `{link_cotizacion}`: Link a cotización
- `{link_voucher}`: Link a voucher

#### 4. **Generar Mensajes Automáticos**

Clic en **"Generar Mensajes"** para crear mensajes basados en:
- Pagos próximos a vencer (3 días)
- Viajes próximos (7 días, 1 día)
- Cumpleaños del día
- Pagos vencidos

#### 5. **WhatsApp Rápido** ⚡

En varias partes del sistema hay botones de **WhatsApp Rápido**:

- **En tabla de Clientes**: Botón verde de WhatsApp
- **En tarjeta de Cumpleaños**: Botón para felicitar
- **En detalle de Cliente**: Botón de mensaje rápido

Al hacer clic, se abre WhatsApp Web con un mensaje personalizado pre-escrito.

### Mensajes en Detalle de Cliente

En la pestaña **"Mensajes"** del detalle de un cliente, verás:
- Historial de todos los mensajes enviados
- Estado de cada mensaje
- Fecha de envío

---

## 🔔 ALERTAS

### ¿Qué son las Alertas?

Las alertas son notificaciones automáticas que el sistema genera para recordarte acciones pendientes.

### Tipos de Alertas

- **Pagos Vencidos**: Pagos con fecha pasada
- **Pagos Próximos a Vencer**: Pagos por vencer en los próximos días
- **Viajes Próximos**: Operaciones con salida cercana
- **Documentos Faltantes**: Operaciones sin documentación completa
- **Márgenes Bajos**: Operaciones con margen por debajo del umbral

### Gestionar Alertas

1. **Ver todas**: Ir a `/alerts`
2. **Acciones**:
   - **Resolver**: Marcar como resuelta
   - **Ignorar**: Ocultar temporalmente
   - **Ir al detalle**: Navegar a la operación/pago relacionado

### Alertas en Dashboard

Las 5 alertas más urgentes aparecen en el Dashboard con:
- Tipo de alerta
- Descripción breve
- Tiempo desde que se venció (si aplica)
- Badge "Vencida" en ámbar para alertas vencidas

---

## 📅 CALENDARIO

### ¿Qué es el Calendario?

Vista de calendario con todas las operaciones organizadas por fecha de salida.

### Funcionalidades

- **Vista Mensual**: Ver operaciones del mes
- **Clic en Operación**: Ir al detalle de la operación
- **Colores por Estado**: CONFIRMED (verde), CANCELLED (rojo)

---

## 📈 REPORTES

### Tipos de Reportes

- **Ventas**: Por vendedor, destino, período
- **Comisiones**: Devengadas, pagadas, pendientes
- **Operadores**: Pagos por operador
- **Financiero**: Ingresos, egresos, flujo de caja
- **IVA**: Débito, crédito, a pagar

### Exportar Reportes

1. Seleccionar tipo de reporte
2. Aplicar filtros
3. Clic en **"Exportar"**
4. Elegir formato: **CSV** o **JSON**
5. Se descarga el archivo

---

## ⚙️ CONFIGURACIÓN

### Módulos de Configuración

#### 1. **Usuarios**

- Ver lista de usuarios
- Invitar nuevos usuarios
- Editar roles y permisos
- Desactivar usuarios

#### 2. **Agencias**

- Crear y editar agencias
- Configurar datos fiscales

#### 3. **Comisiones**

- Definir reglas de comisión por vendedor
- Tipos: Porcentaje fijo, variable por destino, escalonado

#### 4. **Trello**

- Conectar con tablero de Trello
- Mapear listas con estados de leads
- Configurar webhooks para sincronización

#### 5. **Importar Datos** 📥

Sección para importar datos masivos:

1. Ir a **Configuración** → Tab **"Importar Datos"**
2. Seleccionar tipo de datos:
   - **Clientes**: Importar clientes desde CSV
   - **Operadores**: Importar operadores desde CSV
   - **Operaciones**: Importar operaciones desde CSV
   - **Pagos**: Importar pagos desde CSV
   - **Movimientos de Caja**: Importar movimientos desde CSV
3. **Descargar Plantilla**: Obtén un CSV de ejemplo con los campos requeridos
4. **Subir Archivo**: Selecciona tu archivo CSV
5. **Previsualizar**: Revisa los datos antes de importar
6. **Importar**: Ejecuta la importación

**Formato del CSV:**
- Primera fila: Nombres de columnas (headers)
- Separador: Coma (`,`)
- Formato de fechas: `YYYY-MM-DD`

#### 6. **Preferencias de Notificaciones**

Configura qué notificaciones quieres recibir:
- Pagos vencidos
- Viajes próximos
- Nuevos leads
- etc.

---

## 🚀 FUNCIONES AVANZADAS

### Búsqueda Global (⌘K)

Acceso rápido a cualquier parte del sistema:

1. Presiona **⌘K** (Mac) o **Ctrl+K** (Windows)
2. Escribe lo que buscas:
   - Nombre de cliente
   - Código de operación
   - Nombre de lead
   - Nombre de operador
3. Selecciona el resultado
4. Navegas directamente al detalle

**Comandos Rápidos:**
- Escribir "nuevo cliente" → Crear cliente
- Escribir "nuevo lead" → Crear lead
- Escribir "OP1200" → Buscar operación

### Notificaciones 🔔

**Bell de Notificaciones (Navbar):**

En la barra superior, verás un ícono de campana:
- **Badge rojo**: Cantidad de notificaciones no leídas
- **Clic**: Ver lista de notificaciones recientes
- Tipos: Nuevos leads, pagos recibidos, alertas

**Notificaciones en Tiempo Real:**
- Los leads nuevos aparecen automáticamente
- Sin necesidad de refrescar la página

### Estados de Cuenta

**Estado de Cuenta del Cliente:**

1. Ir al detalle del cliente
2. Tab "Estado de Cuenta"
3. Ver:
   - Balance total pendiente
   - Historial de pagos
   - Próximos vencimientos
4. **Enviar por Email**: Clic en "Enviar Estado de Cuenta"

**Estado de Cuenta del Operador:**

1. Ir al detalle del operador
2. Tab "Estado de Cuenta"
3. Ver:
   - Total adeudado
   - Historial de pagos realizados
   - Pagos pendientes

### Generación de PDFs 📑

**PDFs Disponibles:**

- **Cotización**: Documento formal para el cliente
- **Voucher de Operación**: Documento de viaje para el cliente
- **Recibo de Pago**: Comprobante cuando se marca un pago como pagado
- **Estado de Cuenta**: Resumen financiero del cliente

**Cómo Generar:**

1. Ir al detalle correspondiente
2. Clic en el botón de descarga/PDF
3. Se descarga automáticamente

### Hover Cards 👁️

**Preview Rápido sin Navegar:**

En listas y tablas, al pasar el mouse sobre:
- **Nombre de Cliente**: Ver datos básicos y últimas operaciones
- **Código de Operación**: Ver resumen de la operación

---

## 🔄 FLUJOS DE TRABAJO DIARIOS

### Flujo Completo de una Venta

#### Día 1: Captación del Lead

1. **Cliente consulta** por un viaje
2. **Vendedor crea un Lead** en el sistema
3. El lead aparece en estado **NEW**
4. Si está configurado, se crea tarjeta en Trello

#### Día 2-3: Trabajo del Lead

1. **Vendedor contacta al cliente**
2. **Cambia estado a IN_PROGRESS**
3. **Crea una Cotización** usando el selector de tarifas
4. **Envía la cotización** (email con PDF adjunto)
5. Sistema genera **mensaje WhatsApp** de cotización enviada

#### Día 4-5: Seguimiento

1. **Cliente revisa la cotización**
2. Si acepta, **vendedor convierte la cotización en Operación**
3. Se crea automáticamente:
   - Operación con estado CONFIRMED
   - Cliente (si no existía)
   - Reserva de cupos (si aplica)

#### Día 6-10: Confirmación y Depósito

1. **Cliente realiza depósito**
2. **Vendedor marca el pago como pagado**
3. Sistema genera automáticamente:
   - Movimiento de caja
   - Movimiento contable
   - Mensaje WhatsApp de confirmación
   - Cálculo de comisión

#### Días Siguientes: Pagos

1. **Sistema genera recordatorios automáticos** (3 días antes de vencimiento)
2. **Vendedor envía recordatorios vía WhatsApp**
3. **Cada pago se marca cuando se recibe**

#### Antes del Viaje

1. **Sistema genera alertas de viaje próximo** (7 días, 1 día antes)
2. **Vendedor envía información del viaje vía WhatsApp**
3. **Cliente puede descargar su voucher**

#### Post-Viaje

1. **Sistema genera mensaje de seguimiento**
2. **Vendedor envía encuesta de satisfacción**

### Flujo del Cumpleaños

1. **Sistema detecta cumpleaños** del cliente
2. **Aparece en tarjeta de Dashboard**
3. **Vendedor hace clic en WhatsApp**
4. **Se abre WhatsApp con mensaje de felicitación**

---

## ❓ PREGUNTAS FRECUENTES

### ¿Por qué no puedo cargar templates de WhatsApp?

Necesitas ejecutar la migración SQL en Supabase primero. El botón "Cargar Templates por Defecto" creará los templates predefinidos.

### ¿Puedo personalizar los mensajes de WhatsApp?

Sí, en **Mensajes → Templates** puedes crear y editar templates con tus propias variables.

### ¿Los mensajes de WhatsApp se envían automáticamente?

No, el sistema genera los mensajes pero debes hacer clic en "Enviar por WhatsApp" para abrirlos en WhatsApp Web. Esto es intencional para que tengas control sobre cada mensaje.

### ¿Cómo cambio el tipo de cambio?

El tipo de cambio se obtiene automáticamente. Para cambiar manualmente, contacta al administrador.

### ¿Puedo eliminar una operación?

Las operaciones confirmadas NO se pueden eliminar (solo cancelar) para mantener la integridad contable.

### ¿Cómo exporto datos?

En Reportes, selecciona el tipo de reporte, aplica filtros, y clic en "Exportar" para descargar CSV o JSON.

### ¿Cómo importo clientes masivamente?

En Configuración → Importar Datos → Clientes, descarga la plantilla, complétala, y súbela.

---

## 📞 SOPORTE

Para consultas, errores o sugerencias:

1. Revisar este manual
2. Consultar con el administrador del sistema
3. Contactar al equipo de desarrollo

---

**FIN DEL MANUAL**

**Versión 2.0 - Diciembre 2025**

Incluye: Sistema de Mensajes WhatsApp, Búsqueda Global, Notificaciones en Tiempo Real, Estados de Cuenta, Generación de PDFs, Importación de Datos, y mejoras de UI.
