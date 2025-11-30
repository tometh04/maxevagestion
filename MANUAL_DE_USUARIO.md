# 📘 MANUAL DE USUARIO COMPLETO - ERP LOZADA

**Versión:** 1.0  
**Última actualización:** 2024  
**Sistema:** ERP Lozada - Gestión Integral de Agencia de Viajes

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
11. [Alertas](#alertas)
12. [Reportes](#reportes)
13. [Configuración](#configuración)
14. [Flujos de Trabajo Diarios](#flujos-de-trabajo-diarios)

---

## 🔐 INTRODUCCIÓN

### ¿Qué es ERP Lozada?

ERP Lozada es un sistema integral de gestión para agencias de viajes que permite administrar todo el ciclo de vida de una venta: desde la captación del lead hasta el cierre contable y el pago de comisiones.

### Roles del Sistema

- **ADMIN**: Acceso completo a todos los módulos
- **SELLER**: Acceso a leads, cotizaciones, operaciones y su propio balance/comisiones
- **ACCOUNTANT**: Acceso a caja, contabilidad y reportes
- **OPERATOR_MANAGER**: Acceso a operaciones y pagos a operadores

---

## 🔑 ACCESO AL SISTEMA

### Pasos para Iniciar Sesión

1. Ingresar a la URL del sistema (proporcionada por el administrador)
2. Ingresar email y contraseña
3. El sistema redirigirá automáticamente según tu rol

### Cambiar Modo Claro/Oscuro

- En el **sidebar izquierdo**, arriba de "Usuario Desarrollo", encontrarás el botón de cambio de tema
- Opciones: Claro, Oscuro, Sistema

---

## 📊 DASHBOARD

### ¿Qué es el Dashboard?

El Dashboard es la pantalla principal que muestra un resumen ejecutivo de toda la operación. Es lo primero que verás al ingresar al sistema.

### Secciones del Dashboard

#### 1. **KPIs Principales (Tarjetas Superiores)**

- **Ingresos Totales**: Suma de todos los ingresos en el período seleccionado
- **Operaciones Realizadas**: Cantidad de operaciones completadas
- **Margen Promedio**: Porcentaje promedio de margen de ganancia
- **Operaciones Totales**: Contador total de operaciones

#### 2. **Pendientes Clientes / Operadores**

- **Pagos Pendientes de Clientes**: Total adeudado por clientes
- **Pagos Pendientes a Operadores**: Total a pagar a operadores

#### 3. **Gráficos**

- **Ventas por Vendedor**: Distribución de ventas y márgenes por vendedor
- **Top Destinos**: Destinos con mayor volumen de ventas y operaciones
- **Distribución de Ventas**: Gráfico de torta con los 5 destinos principales
- **Ventas por Región**: Gráfico radar mostrando distribución geográfica
- **Flujo de Caja**: Evolución de ingresos, egresos y flujo neto en el tiempo

### Filtros del Dashboard

1. **Rango de Fechas**: Selecciona el período a visualizar
   - Puedes elegir fecha desde/hasta
   - O usar rangos predefinidos (Este mes, Últimos 30 días, etc.)

2. **Agencia**: Filtra por agencia (si tienes múltiples agencias)

3. **Vendedor**: Filtra por vendedor específico

4. **Destino**: Filtra por destino específico

5. **Botón "Limpiar Filtros"**: Restablece todos los filtros a valores por defecto

### ¿Dónde se alimenta la información?

- **Ingresos**: Se calculan desde los pagos marcados como "PAGADOS" en la sección de Pagos
- **Operaciones**: Se cuentan desde la tabla `operations` con estado `CONFIRMED`
- **Margen**: Se calcula como: `(ingresos - costos) / ingresos * 100`
- **Flujo de Caja**: Se genera automáticamente cuando se marcan pagos como pagados en `/cash/payments`

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
- Los leads están agrupados por su `trello_list_id`
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
   - **Destino** (obligatorio) - Ejemplo: "París, Francia"
   - **Región**: Selecciona de la lista (ARGENTINA, CARIBE, BRASIL, EUROPA, EEUU, OTROS, CRUCEROS)
   - **Agencia**: Selecciona la agencia (si aplica)
   - **Vendedor Asignado**: Selecciona quién se encargará del lead
   - **Origen**: Dónde se obtuvo el lead (Web, Referido, Instagram, etc.)
   - **Notas**: Información adicional sobre el lead
   - **Tiene depósito recibido?**: Switch para indicar si ya recibiste un pago
3. Clic en **"Crear Lead"**

**¿Dónde impacta la creación de un Lead?**

- Se crea un registro en la tabla `leads`
- Si tiene depósito recibido, se puede crear un movimiento en Caja (opcional)
- Si está configurado Trello, se crea una tarjeta en Trello automáticamente
- Se asigna a un vendedor, quien verá el lead en su lista

#### 3. **Editar un Lead**

1. Clic en el nombre del lead (en Kanban o Tabla)
2. Se abrirá el diálogo de detalles
3. Clic en el botón **"Editar"**
4. Modifica los campos necesarios
5. Clic en **"Guardar Cambios"**

#### 4. **Cambiar Estado de un Lead**

**Estados posibles:**

- **NEW**: Nuevo (recién creado)
- **IN_PROGRESS**: En Progreso (vendedor está trabajando en él)
- **QUOTED**: Cotizado (ya se envió una cotización)
- **WON**: Ganado (el cliente aceptó y se convirtió en operación)
- **LOST**: Perdido (el cliente no siguió adelante)

**Formas de cambiar el estado:**

- **Arrastrar y soltar** en la vista Kanban a otra columna
- **Editar manualmente** en el diálogo de detalles

#### 5. **Convertir Lead a Operación**

Cuando un lead se convierte en venta confirmada:

1. Buscar el lead en la tabla o kanban
2. Clic en el botón **"Convertir"**
3. Se abrirá un diálogo donde debes:
   - Seleccionar la agencia (si aplica)
   - Seleccionar el vendedor principal
   - Confirmar los datos del cliente
4. Clic en **"Convertir"**

**¿Qué sucede al convertir un Lead?**

- Se crea una nueva **Operación** con estado `CONFIRMED`
- El lead cambia su estado a `WON`
- Si el lead tenía depósito, se transfiere a la operación
- Si había movimientos de caja asociados al lead, se transfieren a la operación
- Se crea automáticamente un cliente (o se asocia uno existente)

### Filtros de Leads

- **Estado**: Filtra por estado del lead
- **Vendedor**: Filtra por vendedor asignado
- **Agencia**: Filtra por agencia
- **Destino**: Busca por destino específico
- **Región**: Filtra por región geográfica

---

## 📄 COTIZACIONES

### ¿Qué es una Cotización?

Una cotización es un documento formal que se envía a un cliente potencial con la propuesta de viaje, incluyendo precios, servicios y condiciones.

### Funcionalidades de Cotizaciones

#### 1. **Crear una Nueva Cotización**

**Pasos:**

1. Clic en **"+ Nueva Cotización"** (esquina superior derecha)
2. Completar el formulario:
   - **Número de Cotización**: Se genera automáticamente (formato: COT-YYYY-NNNNN)
   - **Cliente**: Seleccionar cliente existente o crear uno nuevo
   - **Vendedor**: Quien está realizando la cotización
   - **Destino**: Destino del viaje
   - **Fecha de Viaje**: Fecha estimada de inicio
   - **Fecha de Vencimiento**: Hasta cuándo es válida la cotización
   - **Moneda**: ARS o USD
   - **Servicios**: Agregar servicios incluidos (hotel, vuelo, excursiones, etc.)
     - Clic en **"+ Agregar Servicio"**
     - Completar: Descripción, Cantidad, Precio Unitario, Moneda
   - **Descuentos**: Opcional, aplicar descuentos por porcentaje o monto fijo
   - **Notas**: Información adicional para el cliente
3. Clic en **"Crear Cotización"**

**Estados de Cotización:**

- **DRAFT**: Borrador (aún se está editando)
- **SENT**: Enviada (ya se envió al cliente)
- **PENDING_APPROVAL**: Pendiente de Aprobación
- **APPROVED**: Aprobada
- **REJECTED**: Rechazada
- **EXPIRED**: Expirada (pasó la fecha de vencimiento)
- **CONVERTED**: Convertida (se convirtió en operación)

#### 2. **Enviar Cotización al Cliente**

1. Buscar la cotización en la lista
2. Clic en el menú de acciones (tres puntos)
3. Seleccionar **"Marcar como Enviada"**
4. El estado cambiará a `SENT`

#### 3. **Convertir Cotización en Operación**

Cuando el cliente acepta la cotización:

1. Buscar la cotización (debe estar en estado `APPROVED` o `SENT`)
2. Clic en el menú de acciones
3. Seleccionar **"Convertir en Operación"**
4. Confirmar los datos
5. Clic en **"Convertir"**

**¿Qué sucede al convertir?**

- Se crea una nueva **Operación** con estado `CONFIRMED`
- La cotización cambia a estado `CONVERTED`
- Se copian todos los servicios y precios a la operación
- Se asocian los clientes de la cotización a la operación

#### 4. **Editar Cotización**

Solo se pueden editar cotizaciones en estado `DRAFT`:

1. Clic en la cotización
2. Clic en **"Editar"**
3. Modificar los campos necesarios
4. Clic en **"Guardar Cambios"**

#### 5. **Duplicar Cotización**

Para crear una cotización similar a una existente:

1. Menú de acciones → **"Duplicar"**
2. Se creará una copia en estado `DRAFT`
3. Editar y ajustar según sea necesario

### Filtros de Cotizaciones

- **Estado**: Filtra por estado de cotización
- **Vendedor**: Filtra por vendedor
- **Cliente**: Busca por nombre de cliente
- **Fecha de Vencimiento**: Filtra por rango de fechas
- **Moneda**: ARS o USD

---

## ✈️ OPERACIONES

### ¿Qué es una Operación?

Una Operación es una venta confirmada. Representa un viaje vendido que debe ser gestionado hasta su finalización.

### Funcionalidades de Operaciones

#### 1. **Ver Lista de Operaciones**

La lista muestra:
- **Código de Archivo**: Identificador único (ej: FILE-2024-00001)
- **Estado**: CONFIRMED, CANCELLED, COMPLETED
- **Cliente(s)**: Nombre(s) del(os) cliente(s)
- **Destino**: Destino del viaje
- **Fecha de Viaje**: Fecha de inicio
- **Vendedor**: Quien realizó la venta
- **Total de Venta**: Monto total en moneda de venta
- **Margen**: Ganancia calculada

#### 2. **Crear una Operación Manualmente**

Normalmente las operaciones se crean al convertir un Lead o Cotización, pero puedes crearlas manualmente:

1. Clic en **"+ Nueva Operación"**
2. Completar:
   - **Tipo**: HOTEL, PACKAGE, VUELO, OTROS
   - **Producto**: HOTEL, PAQUETE, VUELO, CRUCERO, etc.
   - **Cliente(s)**: Agregar uno o más clientes
   - **Vendedor Principal**: Quien realizó la venta
   - **Destino**: Destino del viaje
   - **Fecha de Check-in**: Fecha de inicio del viaje
   - **Fecha de Check-out**: Fecha de finalización
   - **Moneda de Venta**: ARS o USD
   - **Moneda de Costo**: ARS o USD (moneda del operador)
   - **Servicios**: Agregar servicios incluidos con sus costos
   - **Precio de Venta Total**: Monto que paga el cliente
   - **Costo del Operador**: Monto que se paga al operador
3. Clic en **"Crear Operación"**

#### 3. **Ver Detalles de una Operación**

Clic en cualquier operación para ver:

- **Información General**: Tipo, estado, fechas, destino
- **Clientes**: Lista de pasajeros (Principal y Acompañantes)
- **Servicios**: Detalle de servicios incluidos
- **Pagos de Clientes**: Cronograma de pagos esperados
- **Pagos a Operadores**: Cronograma de pagos a realizar
- **Movimientos de Caja**: Movimientos asociados
- **Información Contable**: Ingresos, gastos, márgenes, IVA
- **Documentos**: Documentos asociados (pasaportes, reservas, etc.)

#### 4. **Gestionar Pagos de Clientes**

En la sección de pagos de la operación:

**Agregar un Pago Esperado:**

1. En la sección **"Pagos de Clientes"**, clic en **"+ Agregar Pago"**
2. Completar:
   - **Monto**: Cantidad a pagar
   - **Moneda**: ARS o USD
   - **Fecha de Vencimiento**: Cuándo debe pagar el cliente
   - **Método de Pago**: Efectivo, Transferencia, Mercado Pago, etc.
   - **Referencia**: Número de comprobante o referencia
3. Clic en **"Agregar"**

**Marcar un Pago como Pagado:**

1. Buscar el pago en la lista (estado: PENDING)
2. Clic en el botón **"Marcar como Pagado"**
3. Completar:
   - **Fecha de Pago**: Fecha real en que se recibió
   - **Método de Pago Real**: Confirmar o cambiar el método
   - **Referencia**: Número de comprobante
4. Clic en **"Confirmar Pago"**

**¿Qué sucede al marcar un pago como pagado?**

- El pago cambia de estado `PENDING` a `PAID`
- Se crea automáticamente un **movimiento de caja** (INCOME) en la moneda correspondiente
- Se crea un **movimiento contable** (ledger_movement) tipo `INCOME`
- Si la moneda es diferente a ARS, se calcula el equivalente en ARS usando el tipo de cambio del día
- Se actualiza el balance de la cuenta financiera correspondiente
- Se genera un movimiento de flujo de caja visible en el Dashboard

#### 5. **Gestionar Pagos a Operadores**

En la sección de pagos a operadores:

**Agregar un Pago a Realizar:**

1. En la sección **"Pagos a Operadores"**, clic en **"+ Agregar Pago"**
2. Completar:
   - **Operador**: Seleccionar el operador
   - **Monto**: Cantidad a pagar
   - **Moneda**: ARS o USD
   - **Fecha de Vencimiento**: Cuándo debe pagarse
   - **Método de Pago**: Efectivo, Transferencia, etc.
   - **Concepto**: Descripción del pago (ej: "Pago de hotel")
3. Clic en **"Agregar"**

**Registrar el Pago Realizado:**

1. Buscar el pago pendiente
2. Clic en **"Registrar Pago"**
3. Completar:
   - **Fecha de Pago**: Fecha real de pago
   - **Método de Pago Real**: Confirmar o cambiar
   - **Referencia**: Número de transferencia o comprobante
   - **Caja de Origen**: Desde qué caja se pagó (si aplica)
4. Clic en **"Registrar Pago"**

**¿Qué sucede al registrar un pago a operador?**

- El pago cambia a estado `PAID`
- Se crea un **movimiento de caja** (EXPENSE) en la moneda correspondiente
- Se crea un **movimiento contable** tipo `EXPENSE` o `OPERATOR_PAYMENT`
- Si la moneda es diferente a ARS, se calcula el equivalente en ARS
- Se actualiza el balance de la cuenta financiera
- Se actualiza el flujo de caja

#### 6. **Editar una Operación**

Solo operaciones en estado `CONFIRMED` pueden editarse:

1. Abrir los detalles de la operación
2. Clic en **"Editar"**
3. Modificar los campos necesarios
4. Clic en **"Guardar Cambios"**

#### 7. **Cancelar una Operación**

1. En los detalles, clic en **"Cancelar Operación"**
2. Confirmar la cancelación
3. La operación cambiará a estado `CANCELLED`

**Impacto de cancelar:**

- Todos los pagos pendientes de clientes se cancelan
- Los pagos ya recibidos pueden ser reembolsados (se debe gestionar manualmente)
- Los pagos a operadores pendientes se cancelan
- Se mantiene el historial para referencia

### Filtros de Operaciones

- **Estado**: CONFIRMED, CANCELLED, COMPLETED
- **Vendedor**: Filtra por vendedor
- **Cliente**: Busca por nombre de cliente
- **Destino**: Filtra por destino
- **Fecha de Viaje**: Rango de fechas
- **Operador**: Filtra por operador asociado

---

## 🏢 TARIFARIOS

### ¿Qué es un Tarifario?

Un Tarifario es un catálogo de precios de servicios (hoteles, paquetes, etc.) que los operadores proporcionan a la agencia.

### Funcionalidades de Tarifarios

#### 1. **Ver Lista de Tarifarios**

La lista muestra:
- **Nombre**: Nombre descriptivo del tarifario
- **Operador**: Operador que proporciona el tarifario
- **Moneda**: Moneda de los precios
- **Fecha de Inicio/Vencimiento**: Período de validez
- **Activo**: Si está actualmente en uso

#### 2. **Crear un Nuevo Tarifario**

1. Clic en **"+ Nuevo Tarifario"**
2. Completar:
   - **Nombre**: Ej. "Hoteles Europa 2024"
   - **Operador**: Seleccionar operador
   - **Moneda**: ARS o USD
   - **Fecha de Inicio**: Desde cuándo es válido
   - **Fecha de Vencimiento**: Hasta cuándo es válido
   - **Tarifario Activo**: Switch para activar/desactivar
3. Clic en **"Crear Tarifario"**

**Uso de Tarifarios:**

Los tarifarios se usan como referencia al crear cotizaciones y operaciones, pero los precios se ingresan manualmente en cada operación. El tarifario sirve como guía de precios disponibles.

#### 3. **Editar Tarifario**

1. Clic en el tarifario
2. Clic en **"Editar"**
3. Modificar los campos
4. Clic en **"Guardar Cambios"**

#### 4. **Activar/Desactivar Tarifario**

- Switch en el listado o en el detalle
- Solo los tarifarios activos aparecen como opciones al crear operaciones

### Filtros de Tarifarios

- **Operador**: Filtra por operador
- **Moneda**: ARS o USD
- **Activo**: Solo activos o todos
- **Fecha**: Filtra por rango de validez

---

## 📦 CUPOS

### ¿Qué es un Cupo?

Un Cupo es una disponibilidad limitada de un servicio (habitaciones de hotel, plazas en un paquete, etc.) que se puede reservar para una operación.

### Funcionalidades de Cupos

#### 1. **Ver Lista de Cupos**

La lista muestra:
- **Servicio**: Nombre del servicio (ej: "Hotel XYZ - Habitación Doble")
- **Operador**: Operador que provee el cupo
- **Fecha de Check-in**: Fecha de inicio
- **Fecha de Check-out**: Fecha de finalización
- **Cantidad Total**: Total de cupos disponibles
- **Cantidad Reservada**: Cuántos están reservados
- **Cantidad Disponible**: Cuántos quedan libres
- **Estado**: Activo o Inactivo

#### 2. **Crear un Nuevo Cupo**

1. Clic en **"+ Nuevo Cupo"**
2. Completar:
   - **Operador**: Seleccionar operador
   - **Servicio**: Descripción del servicio
   - **Fecha de Check-in**: Fecha de inicio
   - **Fecha de Check-out**: Fecha de finalización
   - **Cantidad Total**: Total de cupos disponibles
   - **Moneda**: ARS o USD
   - **Precio Unitario**: Precio por cupo
   - **Cupo Activo**: Switch para activar/desactivar
3. Clic en **"Crear Cupo"**

#### 3. **Reservar un Cupo**

Cuando tienes una operación confirmada y necesitas reservar cupos:

1. Ir a la operación
2. En la sección de servicios, asociar un cupo
3. O desde la lista de cupos:
   - Clic en el cupo
   - Clic en **"Reservar"**
   - Seleccionar la operación
   - Ingresar cantidad a reservar
   - Clic en **"Confirmar Reserva"**

**¿Qué sucede al reservar?**

- La cantidad reservada aumenta
- La cantidad disponible disminuye
- El cupo queda asociado a la operación
- Si se cancela la operación, el cupo se libera automáticamente

#### 4. **Liberar un Cupo**

Si necesitas liberar un cupo reservado:

1. Clic en el cupo
2. Ver las reservas activas
3. Clic en **"Liberar"** junto a la reserva
4. Confirmar la liberación

**¿Qué sucede al liberar?**

- La cantidad reservada disminuye
- La cantidad disponible aumenta
- El cupo queda disponible para otra operación

### Filtros de Cupos

- **Operador**: Filtra por operador
- **Fecha**: Filtra por rango de fechas de check-in
- **Estado**: Activo o Inactivo
- **Disponibilidad**: Solo disponibles, solo reservados, o todos

---

## 👥 CLIENTES

### ¿Qué es un Cliente?

Un Cliente es una persona física o jurídica que ha realizado al menos una compra o que está registrado en el sistema.

### Funcionalidades de Clientes

#### 1. **Ver Lista de Clientes**

La lista muestra:
- **Nombre**: Nombre completo
- **Email**: Email de contacto
- **Teléfono**: Número de teléfono
- **Operaciones**: Cantidad de operaciones realizadas
- **Total Gastado**: Suma de todas sus compras

#### 2. **Crear un Nuevo Cliente**

1. Clic en **"+ Nuevo Cliente"**
2. Completar:
   - **Nombre** (obligatorio)
   - **Email** (opcional pero recomendado)
   - **Teléfono** (obligatorio)
   - **Documento**: DNI, Pasaporte, etc. (opcional)
   - **Dirección**: Dirección completa (opcional)
   - **Tipo**: Persona Física o Jurídica
   - **Notas**: Información adicional
3. Clic en **"Crear Cliente"**

**Nota:** Los clientes también se crean automáticamente cuando:
- Conviertes un Lead a Operación
- Conviertes una Cotización a Operación

#### 3. **Ver Detalles de un Cliente**

Clic en cualquier cliente para ver:
- **Información de Contacto**: Todos los datos del cliente
- **Historial de Operaciones**: Lista de todas sus operaciones
- **Historial de Pagos**: Resumen de pagos realizados
- **Historial de Cotizaciones**: Cotizaciones enviadas

#### 4. **Editar Cliente**

1. Abrir detalles del cliente
2. Clic en **"Editar"**
3. Modificar los campos necesarios
4. Clic en **"Guardar Cambios"**

#### 5. **Asociar Clientes a Operación**

En una operación, puedes agregar:
- **Cliente Principal**: El que realiza el pago
- **Acompañantes**: Otros pasajeros en la misma operación

**Pasos:**
1. En la operación, sección "Clientes"
2. Clic en **"+ Agregar Cliente"**
3. Seleccionar cliente existente o crear uno nuevo
4. Seleccionar rol: Principal o Acompañante
5. Clic en **"Agregar"**

### Filtros de Clientes

- **Nombre**: Busca por nombre
- **Email**: Busca por email
- **Teléfono**: Busca por teléfono
- **Tipo**: Persona Física o Jurídica

---

## 🏨 OPERADORES

### ¿Qué es un Operador?

Un Operador es una empresa proveedora de servicios turísticos (hoteles, mayoristas, líneas aéreas, etc.) con quien la agencia trabaja.

### Funcionalidades de Operadores

#### 1. **Ver Lista de Operadores**

La lista muestra:
- **Nombre**: Nombre de la empresa
- **Contacto**: Persona de contacto
- **Email**: Email de contacto
- **Teléfono**: Teléfono de contacto
- **Moneda Principal**: Moneda en que facturan
- **Operaciones**: Cantidad de operaciones realizadas

#### 2. **Crear un Nuevo Operador**

1. Clic en **"+ Nuevo Operador"**
2. Completar:
   - **Nombre** (obligatorio)
   - **Tipo**: HOTEL, MAYORISTA, AEROLINEA, OTROS
   - **Email** (obligatorio)
   - **Teléfono** (obligatorio)
   - **Contacto**: Nombre de la persona de contacto
   - **Moneda Principal**: ARS o USD
   - **Dirección**: Dirección completa
   - **CUIT/CUIL**: Para facturación
   - **Condición de Pago**: Plazo de pago (ej: "30 días")
   - **Notas**: Información adicional
3. Clic en **"Crear Operador"**

#### 3. **Ver Detalles de un Operador**

Clic en cualquier operador para ver:
- **Información de Contacto**: Todos los datos
- **Operaciones Asociadas**: Lista de operaciones con este operador
- **Pagos Realizados**: Historial de pagos
- **Pagos Pendientes**: Total adeudado

#### 4. **Editar Operador**

1. Abrir detalles del operador
2. Clic en **"Editar"**
3. Modificar los campos
4. Clic en **"Guardar Cambios"**

### Filtros de Operadores

- **Nombre**: Busca por nombre
- **Tipo**: Filtra por tipo de operador
- **Moneda**: Filtra por moneda principal

---

## 💰 CAJA

### ¿Qué es Caja?

Caja gestiona todos los movimientos de dinero entrante y saliente de la agencia, organizados por cajas físicas y monedas.

### Dashboard de Caja

#### ¿Qué muestra el Dashboard de Caja?

- **Resumen por Moneda**: 
  - Total en Caja (ARS)
  - Total en Caja (USD)
  - Total de Ingresos del período
  - Total de Egresos del período
  - Flujo Neto (Ingresos - Egresos)

- **Gráfico de Flujo de Caja**: Evolución diaria/semanal/mensual
- **Últimos Movimientos**: Lista de los movimientos más recientes

#### Filtros

- **Rango de Fechas**: Selecciona el período
- **Moneda**: ARS o USD
- **Tipo**: Ingreso, Egreso, o ambos
- **Caja**: Filtra por caja específica

---

### Movimientos

#### ¿Qué es un Movimiento de Caja?

Un movimiento de caja registra un ingreso o egreso de dinero. Puede estar asociado a una operación o ser independiente (gastos operativos, ingresos varios, etc.).

#### 1. **Ver Lista de Movimientos**

La lista muestra:
- **Fecha**: Fecha del movimiento
- **Tipo**: INCOME (Ingreso) o EXPENSE (Egreso)
- **Categoría**: Categoría del movimiento
- **Monto**: Cantidad en la moneda original
- **Moneda**: ARS o USD
- **Caja**: En qué caja se registró
- **Operación**: Si está asociado a una operación
- **Notas**: Descripción adicional

#### 2. **Crear un Movimiento Manual**

Para registrar movimientos que NO están asociados a operaciones (gastos operativos, ingresos varios, etc.):

1. Clic en **"+ Nuevo Movimiento"**
2. Completar:
   - **Tipo**: INCOME o EXPENSE
   - **Categoría**: Seleccionar o escribir categoría
     - Ejemplos de ingresos: "Ingreso Varios", "Intereses", "Reembolso"
     - Ejemplos de egresos: "Alquiler", "Servicios", "Sueldos", "Marketing"
   - **Monto**: Cantidad
   - **Moneda**: ARS o USD
   - **Fecha**: Fecha del movimiento
   - **Caja**: Seleccionar la caja (si hay múltiples)
   - **Operación**: Dejar vacío si NO está asociado a una operación
   - **Es Turístico?**: 
     - **SÍ**: Movimiento relacionado con la actividad turística (por defecto)
     - **NO**: Movimiento administrativo/operativo
   - **Notas**: Descripción detallada
3. Clic en **"Crear Movimiento"**

**¿Qué sucede al crear un movimiento?**

- Se registra en la tabla `cash_movements`
- Se actualiza el balance de la caja correspondiente
- Si es movimiento turístico, se crea un movimiento contable (ledger_movement)
- Si NO es turístico, se crea un movimiento contable con categoría específica
- Se actualiza el flujo de caja en el Dashboard

#### 3. **Editar un Movimiento**

Solo se pueden editar movimientos que NO están asociados a operaciones:

1. Buscar el movimiento
2. Clic en **"Editar"**
3. Modificar los campos necesarios
4. Clic en **"Guardar Cambios"**

**Nota:** Los movimientos generados automáticamente al marcar pagos como pagados NO se pueden editar manualmente para mantener la trazabilidad.

#### 4. **Eliminar un Movimiento**

Solo movimientos manuales pueden eliminarse:

1. Clic en el movimiento
2. Clic en **"Eliminar"**
3. Confirmar eliminación

**Impacto de eliminar:**

- Se revierte el balance de la caja
- Se elimina el movimiento contable asociado (si existe)
- Se actualiza el flujo de caja

#### 5. **Movimientos Automáticos**

Los siguientes movimientos se crean automáticamente:

**Al marcar un pago de cliente como pagado:**
- Tipo: INCOME
- Categoría: "Pago de Cliente"
- Monto: Monto del pago
- Moneda: Moneda del pago
- Asociado a: La operación correspondiente

**Al registrar un pago a operador:**
- Tipo: EXPENSE
- Categoría: "Pago a Operador"
- Monto: Monto del pago
- Moneda: Moneda del pago
- Asociado a: La operación correspondiente

### Filtros de Movimientos

- **Tipo**: INCOME, EXPENSE, o ambos
- **Categoría**: Filtra por categoría
- **Moneda**: ARS o USD
- **Caja**: Filtra por caja específica
- **Rango de Fechas**: Selecciona período
- **Operación**: Busca movimientos de una operación específica

---

### Pagos

#### ¿Qué es la sección de Pagos?

Esta sección centraliza TODOS los pagos esperados y realizados, tanto de clientes como a operadores, para facilitar el seguimiento y la gestión.

#### 1. **Ver Lista de Pagos**

La lista muestra:
- **Tipo**: Pago de Cliente o Pago a Operador
- **Operación**: Operación asociada
- **Cliente/Operador**: Quien paga o a quien se paga
- **Monto**: Cantidad
- **Moneda**: ARS o USD
- **Fecha de Vencimiento**: Cuándo debe pagarse/recibirse
- **Estado**: PENDING, PAID, OVERDUE
- **Fecha de Pago**: Si ya fue pagado

#### 2. **Filtros de Pagos**

- **Tipo**: Cliente, Operador, o ambos
- **Estado**: Pending, Paid, Overdue, o todos
- **Moneda**: ARS o USD
- **Rango de Fechas**: Por fecha de vencimiento
- **Operación**: Busca pagos de una operación específica

#### 3. **Marcar Pago como Pagado**

**Para pagos de clientes:**

1. Buscar el pago en estado PENDING
2. Clic en **"Marcar como Pagado"**
3. Completar:
   - **Fecha de Pago**: Fecha real de recepción
   - **Método de Pago**: Confirmar o cambiar
   - **Referencia**: Número de comprobante
   - **Caja**: En qué caja se depositó
4. Clic en **"Confirmar"**

**Para pagos a operadores:**

1. Buscar el pago pendiente
2. Clic en **"Registrar Pago"**
3. Completar:
   - **Fecha de Pago**: Fecha real de pago
   - **Método de Pago**: Transferencia, Efectivo, etc.
   - **Referencia**: Número de transferencia
   - **Caja de Origen**: Desde qué caja se pagó
4. Clic en **"Confirmar"**

**Impacto detallado de marcar como pagado:**

1. **Movimiento de Caja:**
   - Se crea un registro en `cash_movements`
   - Se actualiza el balance de la caja

2. **Movimiento Contable:**
   - Se crea un `ledger_movement` tipo INCOME o EXPENSE
   - Se registra en la cuenta financiera correspondiente
   - Si la moneda es diferente a ARS, se calcula el equivalente usando el tipo de cambio del día
   - Se actualiza el balance de la cuenta

3. **IVA (si aplica):**
   - Si es un pago de cliente, se calcula el IVA de la venta
   - Si es un pago a operador, se calcula el IVA de la compra (si el operador está inscripto)

4. **Flujo de Caja:**
   - Se actualiza el gráfico de flujo de caja en el Dashboard
   - Se incluye en los reportes financieros

5. **Alertas:**
   - Si había una alerta por pago vencido, se resuelve automáticamente

---

## 📊 CONTABILIDAD

### ¿Qué es Contabilidad?

La contabilidad registra todos los movimientos financieros de manera estructurada para generar reportes, calcular IVA, y mantener un libro mayor completo.

### Libro Mayor

#### ¿Qué es el Libro Mayor?

El Libro Mayor es el registro cronológico de TODOS los movimientos contables del negocio. Cada movimiento financiero genera una entrada aquí.

#### ¿Qué muestra el Libro Mayor?

La lista muestra todos los movimientos contables:
- **Fecha**: Fecha del movimiento
- **Tipo**: INCOME, EXPENSE, FX_GAIN, FX_LOSS, COMMISSION, OPERATOR_PAYMENT
- **Concepto**: Descripción del movimiento
- **Cuenta**: Cuenta financiera afectada
- **Monto Original**: Monto en moneda original
- **Monto ARS**: Monto equivalente en pesos argentinos
- **Tipo de Cambio**: Tasa usada (si aplica)
- **Operación**: Si está asociado a una operación

#### ¿De dónde vienen los movimientos?

Los movimientos se crean automáticamente cuando:

1. **Marcas un pago de cliente como pagado:**
   - Tipo: INCOME
   - Concepto: "Pago de Cliente - [Nombre Operación]"
   - Cuenta: Cuenta de Ingresos de Venta
   - Monto: Monto del pago convertido a ARS

2. **Registras un pago a operador:**
   - Tipo: EXPENSE o OPERATOR_PAYMENT
   - Concepto: "Pago a Operador - [Nombre Operador]"
   - Cuenta: Cuenta de Gastos de Operación
   - Monto: Monto del pago convertido a ARS

3. **Creas un movimiento de caja manual:**
   - Tipo: INCOME o EXPENSE según corresponda
   - Concepto: Categoría del movimiento
   - Cuenta: Según la categoría
   - Monto: Monto en ARS

4. **Hay diferencia cambiaria:**
   - Tipo: FX_GAIN o FX_LOSS
   - Concepto: "Diferencia Cambiaria"
   - Se calcula cuando el tipo de cambio de pago difiere del de venta

5. **Pagas una comisión:**
   - Tipo: COMMISSION
   - Concepto: "Pago de Comisión - [Nombre Vendedor]"
   - Cuenta: Cuenta de Gastos de Comisiones

#### Conversión a ARS

**IMPORTANTE:** Todos los movimientos se registran en ARS equivalentes:

- Si el movimiento es en USD:
  1. Se busca el tipo de cambio del día
  2. Se multiplica: `monto_usd * tipo_cambio = monto_ars`
  3. Se registra ambos: `amount_original` (USD) y `amount_ars_equivalent` (ARS)

- Si el movimiento es en ARS:
  - Se registra el mismo monto en ambos campos

#### Filtros del Libro Mayor

- **Tipo**: Filtra por tipo de movimiento
- **Cuenta**: Filtra por cuenta financiera
- **Rango de Fechas**: Selecciona período
- **Operación**: Busca movimientos de una operación
- **Vendedor**: Filtra movimientos por vendedor
- **Operador**: Filtra movimientos por operador

---

### IVA

#### ¿Qué es la sección de IVA?

Esta sección calcula y muestra todos los registros de IVA (Impuesto al Valor Agregado) tanto de ventas como de compras.

#### Ventas con IVA

Cuando marcas un pago de cliente como pagado:
- Se calcula automáticamente el IVA de la venta
- Se registra en la tabla `iva_sales`
- Se muestra en esta sección

**Cálculo:**
- Monto Total: Monto pagado por el cliente
- IVA (21%): `monto_total * 0.21 / 1.21`
- Neto: `monto_total - iva`

#### Compras con IVA

Cuando registras un pago a operador que tiene CUIT inscripto en IVA:
- Se calcula el IVA de la compra
- Se registra en la tabla `iva_purchases`
- Aparece en esta sección

**Cálculo:**
- Monto Total: Monto pagado al operador
- IVA (21%): `monto_total * 0.21 / 1.21`
- Neto: `monto_total - iva`

#### IVA a Pagar

Al final del período (mensual):
- **IVA Débito**: Suma de IVA de todas las ventas
- **IVA Crédito**: Suma de IVA de todas las compras
- **IVA a Pagar**: `IVA Débito - IVA Crédito`

**Si el resultado es positivo:** Debes pagar IVA a AFIP  
**Si el resultado es negativo:** Tienes crédito fiscal para usar en períodos futuros

#### Filtros de IVA

- **Tipo**: Ventas o Compras
- **Rango de Fechas**: Período para el cálculo
- **Operación**: Busca IVA de una operación específica

---

### Cuentas Financieras

#### ¿Qué son las Cuentas Financieras?

Las Cuentas Financieras son las cuentas contables del negocio. Cada movimiento financiero se asocia a una cuenta específica.

#### Tipos de Cuentas

- **Activo**: Cajas, Bancos, Cuentas por Cobrar
- **Pasivo**: Cuentas por Pagar, Deudas
- **Patrimonio Neto**: Capital, Resultados
- **Ingresos**: Ventas, Ingresos Varios
- **Gastos**: Costos de Venta, Gastos Operativos, Comisiones

#### Ver Balance de una Cuenta

1. Clic en la cuenta
2. Verás:
   - **Balance Actual**: Saldo actual de la cuenta
   - **Movimientos**: Todos los movimientos que afectaron esta cuenta
   - **Período**: Balance del período seleccionado

#### Crear una Cuenta Nueva

1. Clic en **"+ Nueva Cuenta"**
2. Completar:
   - **Nombre**: Nombre descriptivo
   - **Tipo**: Activo, Pasivo, Patrimonio, Ingreso, Gasto
   - **Código**: Código contable (opcional)
   - **Descripción**: Descripción adicional
3. Clic en **"Crear"**

**Nota:** Las cuentas principales se crean automáticamente al iniciar el sistema.

---

### Pagos a Operadores

#### ¿Qué es esta sección?

Esta sección centraliza todos los pagos realizados a operadores para facilitar el seguimiento y la conciliación.

#### Ver Lista de Pagos

La lista muestra:
- **Operador**: Nombre del operador
- **Operación**: Operación asociada
- **Monto**: Cantidad pagada
- **Moneda**: ARS o USD
- **Fecha de Pago**: Cuándo se realizó
- **Método**: Cómo se pagó
- **Referencia**: Número de transferencia/comprobante

#### Filtros

- **Operador**: Filtra por operador específico
- **Rango de Fechas**: Período de pagos
- **Moneda**: ARS o USD
- **Operación**: Busca pagos de una operación

#### Exportar Reporte

1. Seleccionar filtros
2. Clic en **"Exportar"**
3. Se descarga un archivo Excel con el detalle

---

## 🔔 ALERTAS

### ¿Qué son las Alertas?

Las alertas son notificaciones automáticas que el sistema genera para recordarte acciones pendientes o situaciones que requieren atención.

### Tipos de Alertas

#### 1. **Pagos Vencidos**

Se generan automáticamente cuando:
- Un pago de cliente tiene fecha de vencimiento pasada y aún está en estado PENDING
- Un pago a operador tiene fecha de vencimiento pasada y aún está en estado PENDING

**Acciones:**
- **Marcar como Hecho**: Indica que ya lo gestionaste (la alerta se oculta pero el pago sigue pendiente)
- **Ignorar**: Oculta la alerta temporalmente
- **Ir al Pago**: Te lleva directamente al pago para gestionarlo

#### 2. **Pagos Próximos a Vencer**

Se generan X días antes de la fecha de vencimiento (configurable).

#### 3. **Operaciones sin Pagos**

Operaciones confirmadas que no tienen ningún pago registrado después de X días.

#### 4. **Cupos por Vencer**

Cupos que están próximos a su fecha de check-in y aún tienen disponibilidad.

### Gestionar Alertas

1. **Ver todas las alertas**: Ir a `/alerts`
2. **Filtrar**: Por tipo, estado, fecha
3. **Marcar como Hecho**: Cuando ya gestionaste el tema
4. **Ignorar**: Si no aplica o es un falso positivo

### Filtros de Alertas

- **Tipo**: Filtra por tipo de alerta
- **Estado**: Activa, Hecha, Ignorada
- **Rango de Fechas**: Período de generación

---

## 📈 REPORTES

### ¿Qué son los Reportes?

Los reportes son análisis detallados de diferentes aspectos del negocio para la toma de decisiones.

### Tipos de Reportes

#### 1. **Reporte de Ventas**

Muestra:
- Ventas por vendedor
- Ventas por destino
- Ventas por período
- Márgenes por operación
- Comparativa entre períodos

**Uso:**
- Analizar rendimiento de vendedores
- Identificar destinos más rentables
- Planificar estrategias comerciales

#### 2. **Reporte de Comisiones**

Muestra:
- Comisiones devengadas por vendedor
- Comisiones pagadas
- Comisiones pendientes de pago
- Desglose por operación

**Uso:**
- Calcular comisiones a pagar
- Planificar pagos a vendedores
- Controlar cumplimiento de metas

#### 3. **Reporte de Operadores**

Muestra:
- Monto total pagado a cada operador
- Cantidad de operaciones por operador
- Pagos pendientes
- Historial de pagos

**Uso:**
- Conciliar pagos con operadores
- Analizar relaciones comerciales
- Planificar compras

#### 4. **Reporte Financiero**

Muestra:
- Ingresos y egresos del período
- Flujo de caja detallado
- Balance por moneda
- Comparativa con períodos anteriores

**Uso:**
- Análisis financiero general
- Presentación a inversores/socios
- Toma de decisiones estratégicas

#### 5. **Reporte de IVA**

Muestra:
- IVA de ventas del período
- IVA de compras del período
- IVA a pagar o crédito fiscal
- Desglose mensual

**Uso:**
- Preparar declaración de IVA
- Control fiscal
- Planificación tributaria

### Generar un Reporte

1. Ir a `/reports`
2. Seleccionar el tipo de reporte
3. Aplicar filtros:
   - Rango de fechas
   - Vendedor
   - Destino
   - Operador
   - Moneda
4. Clic en **"Generar Reporte"**
5. Ver resultados en pantalla
6. Opcional: Clic en **"Exportar"** para descargar Excel/PDF

---

## ⚙️ CONFIGURACIÓN

### ¿Qué es Configuración?

La sección de Configuración permite personalizar el sistema según las necesidades de la agencia.

### Módulos de Configuración

#### 1. **Usuarios**

**Gestión de Usuarios:**

- **Ver lista de usuarios**: Todos los usuarios del sistema
- **Invitar nuevo usuario**: 
  1. Clic en **"Invitar Usuario"**
  2. Ingresar email
  3. Seleccionar rol (ADMIN, SELLER, ACCOUNTANT, OPERATOR_MANAGER)
  4. Seleccionar agencia(s) a las que tiene acceso
  5. Clic en **"Enviar Invitación"**
  6. El usuario recibirá un email con instrucciones

- **Editar usuario**: Cambiar rol, agencias, o información personal
- **Desactivar usuario**: Suspender acceso sin eliminar datos

#### 2. **Agencias**

**Gestión de Agencias:**

- **Ver lista de agencias**: Todas las agencias en el sistema
- **Crear nueva agencia**:
  1. Clic en **"+ Nueva Agencia"**
  2. Completar:
     - Nombre
     - Email
     - Teléfono
     - Dirección
     - CUIT
  3. Clic en **"Crear"**

- **Editar agencia**: Modificar datos
- **Eliminar agencia**: Solo si no tiene operaciones asociadas

#### 3. **Comisiones**

**Reglas de Comisión:**

Define cómo se calculan las comisiones de los vendedores.

**Tipos de Reglas:**

- **Porcentaje fijo**: Ej. 10% de todas las ventas
- **Porcentaje variable por destino**: Ej. 15% para Europa, 10% para Caribe
- **Por monto fijo**: Ej. $1000 por operación
- **Escalonado**: Ej. 10% hasta $100k, 15% de ahí en adelante

**Crear Regla de Comisión:**

1. Clic en **"+ Nueva Regla"**
2. Seleccionar:
   - Vendedor (o "Todos")
   - Tipo de regla
   - Porcentaje o monto
   - Destino/región (si aplica)
   - Fecha de inicio
   - Fecha de fin (opcional)
3. Clic en **"Crear"**

**Las comisiones se calculan automáticamente cuando:**
- Se marca un pago de cliente como pagado
- Se confirma una operación

#### 4. **Trello**

**Integración con Trello:**

Conecta el sistema con Trello para sincronizar leads automáticamente.

**Configurar Trello:**

1. Clic en **"Configurar Trello"**
2. Ingresar:
   - **API Key**: Obtener de https://trello.com/app-key
   - **API Token**: Obtener del mismo lugar
   - **Board ID**: ID del tablero de Trello (está en la URL del tablero)
3. Clic en **"Probar Conexión"**
4. Si es exitoso, clic en **"Guardar"**

**Mapeo de Listas:**

Después de conectar, mapea las listas de Trello con estados y regiones:

1. Seleccionar una lista de Trello
2. Asignar:
   - **Estado**: NEW, IN_PROGRESS, QUOTED, WON, LOST
   - **Región**: ARGENTINA, CARIBE, etc. (opcional)
3. Repetir para todas las listas
4. Clic en **"Guardar Mapeo"**

**Webhooks:**

Para sincronización automática bidireccional:

1. Clic en **"Registrar Webhook"**
2. El sistema creará un webhook en Trello
3. Ahora, cuando muevas una tarjeta en Trello, se actualizará automáticamente en el sistema
4. Y cuando cambies el estado de un lead en el sistema, se actualizará en Trello

#### 5. **Configuración General**

- **Moneda Principal**: ARS o USD
- **Formato de Fecha**: dd/mm/yyyy
- **Zona Horaria**: UTC-3 (Argentina)
- **IVA por Defecto**: 21%

---

## 🔄 FLUJOS DE TRABAJO DIARIOS

### Flujo Completo de una Venta

#### Día 1: Captación del Lead

1. **Cliente consulta** por un viaje (llamada, WhatsApp, web, etc.)
2. **Vendedor crea un Lead** en el sistema:
   - Ingresa datos del contacto
   - Selecciona destino y región
   - Se asigna a sí mismo
3. Si está configurado Trello, **se crea automáticamente una tarjeta en Trello**
4. El lead aparece en estado **NEW**

#### Día 2-3: Trabajo del Lead

1. **Vendedor contacta al cliente** y recopila información
2. **Cambia estado a IN_PROGRESS** (arrastrando en Kanban o editando)
3. Si el cliente tiene interés, **crea una Cotización**:
   - Asocia el lead a la cotización (opcional)
   - Agrega servicios y precios
   - Define fecha de vencimiento
4. **Envía la cotización al cliente** (marca como SENT)

#### Día 4-5: Seguimiento

1. **Cliente revisa la cotización**
2. Si el cliente tiene preguntas, **vendedor edita la cotización** (si está en DRAFT) o crea una nueva
3. Si el cliente acepta, **vendedor convierte la cotización en Operación**:
   - Se crea la operación con estado CONFIRMED
   - Se copian servicios y precios
   - Se asocian los clientes

#### Día 6-10: Confirmación y Depósito

1. **Cliente realiza depósito** (ej: 30% del total)
2. **Vendedor marca el primer pago como pagado**:
   - En la operación, sección "Pagos de Clientes"
   - Clic en "Marcar como Pagado"
   - Ingresa fecha, método, referencia
3. **Se generan automáticamente:**
   - Movimiento de caja (INGRESO)
   - Movimiento contable (INCOME)
   - Actualización de flujo de caja
   - Si aplica, cálculo de IVA
4. **Vendedor confirma con operador:**
   - Reserva servicios con el operador
   - Si hay cupos, los reserva en el sistema
   - Registra los pagos a realizar al operador en la operación

#### Día 11-30: Pagos y Gestiones

1. **Cliente realiza pagos adicionales** según cronograma
2. **Cada pago se marca como pagado** cuando se recibe
3. **Se registran los pagos a operadores** cuando se realizan
4. **Se generan movimientos contables automáticamente** en cada paso

#### Día 31-60: Finalización

1. **Se realiza el viaje**
2. **Se completan todos los pagos**
3. **Se registra cualquier gasto adicional** (movimientos manuales)
4. **Operación se marca como COMPLETED** (opcional)

#### Fin de Mes: Cierre Contable

1. **Revisar Libro Mayor** para verificar todos los movimientos
2. **Generar Reporte de IVA** para declaración
3. **Generar Reporte de Comisiones** para pagar a vendedores
4. **Generar Reporte Financiero** para análisis
5. **Exportar reportes** para contador o auditoría

---

### Flujo Diario del Administrador

#### Inicio del Día (9:00 AM)

1. **Revisar Dashboard:**
   - Ver KPIs principales
   - Revisar alertas pendientes
   - Ver flujo de caja

2. **Revisar Alertas:**
   - Pagos vencidos
   - Pagos próximos a vencer
   - Operaciones sin pagos

3. **Priorizar acciones del día**

#### Durante el Día

1. **Aprobar cotizaciones** (si aplica)
2. **Gestionar pagos recibidos:**
   - Revisar movimientos de caja
   - Marcar pagos como pagados
3. **Registrar pagos a operadores:**
   - Cuando se realiza una transferencia
   - Registrar en el sistema
4. **Gestionar movimientos varios:**
   - Gastos operativos
   - Ingresos varios

#### Fin del Día (18:00 PM)

1. **Revisar movimientos del día:**
   - Verificar que todo esté registrado
   - Corregir errores si los hay
2. **Revisar caja:**
   - Verificar balances
   - Conciliar con caja física
3. **Planificar día siguiente:**
   - Revisar pagos a vencer
   - Preparar transferencias

---

### Flujo Diario del Vendedor

#### Inicio del Día

1. **Revisar Leads asignados:**
   - Ver nuevos leads
   - Seguimiento de leads en progreso
2. **Revisar cotizaciones:**
   - Cotizaciones pendientes de respuesta
   - Seguimiento de cotizaciones enviadas

#### Durante el Día

1. **Atender consultas:**
   - Crear nuevos leads
   - Actualizar información de leads existentes
2. **Preparar cotizaciones:**
   - Crear cotizaciones para clientes
   - Enviar cotizaciones
3. **Seguimiento:**
   - Llamar a clientes
   - Responder consultas
   - Actualizar estados de leads

#### Fin del Día

1. **Actualizar estados:**
   - Mover leads en el kanban según progreso
   - Actualizar notas de leads
2. **Revisar operaciones:**
   - Verificar pagos recibidos
   - Seguimiento de operaciones activas

---

### Flujo Semanal del Contador

#### Lunes

1. **Revisar movimientos de la semana anterior:**
   - Verificar que todos los movimientos estén correctos
   - Corregir errores

#### Miércoles

1. **Generar reportes parciales:**
   - Ventas de la semana
   - Pagos realizados
   - Flujo de caja

#### Viernes

1. **Cierre semanal:**
   - Revisar Libro Mayor
   - Verificar balances
   - Generar reporte financiero semanal

---

### Flujo Mensual

#### Inicio de Mes

1. **Cierre del mes anterior:**
   - Revisar todos los movimientos
   - Generar reportes finales
   - Exportar para contador

#### Durante el Mes

1. **Seguimiento continuo:**
   - Revisar alertas
   - Gestionar pagos
   - Registrar movimientos

#### Fin de Mes

1. **Cierre contable:**
   - Generar Reporte de IVA
   - Calcular IVA a pagar
   - Generar Reporte de Comisiones
   - Pagar comisiones a vendedores
   - Generar Reporte Financiero
   - Exportar todos los reportes
   - Revisar con contador/auditor

---

## ❓ PREGUNTAS FRECUENTES

### ¿Qué pasa si marco un pago como pagado por error?

- Puedes editar el movimiento de caja asociado (si no está bloqueado)
- O crear un movimiento de corrección manual
- Es recomendable contactar al administrador para reversiones complejas

### ¿Puedo eliminar una operación?

- Las operaciones confirmadas NO se pueden eliminar (solo cancelar)
- Esto es para mantener la integridad contable
- Si necesitas corregir, cancela la operación y crea una nueva

### ¿Cómo cambio el tipo de cambio?

- El tipo de cambio se obtiene automáticamente de una API externa
- Para cambiar manualmente, ve a Configuración → Tipo de Cambio (si está disponible)
- O contacta al administrador

### ¿Qué pasa si un cliente paga en efectivo pero registro transferencia?

- Puedes editar el movimiento de caja para corregir el método de pago
- O crear un movimiento de corrección

### ¿Cómo sé cuánto debo pagar a un operador?

- Ve a Contabilidad → Pagos a Operadores
- Filtra por el operador
- Verás el total pagado y los pagos pendientes

### ¿Las comisiones se calculan solas?

- Sí, las comisiones se calculan automáticamente cuando marcas un pago como pagado
- Se basan en las reglas de comisión configuradas en Configuración
- Puedes verlas en "Mis Comisiones" (vendedor) o en Reportes de Comisiones (admin)

---

## 📞 SOPORTE

Para consultas, errores o sugerencias:

1. Revisar este manual
2. Consultar con el administrador del sistema
3. Contactar al equipo de desarrollo

---

**FIN DEL MANUAL**

Este manual está en constante actualización. Versión 1.0 - 2024

