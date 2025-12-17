# Checklist de Testing Manual - MAXEVA GESTION

**Fecha de creación:** 2025-01-16  
**Propósito:** Guía completa para testing manual del sistema, organizada por funcionalidad del sidebar

---

## Cómo usar este documento

Para cada funcionalidad:
1. **Revisar "Acciones Previas"** - Realizar las acciones necesarias para preparar el escenario de prueba
2. Realizar las acciones listadas en "Acciones a Probar"
3. Verificar que los "Resultados Esperados" se cumplan
4. Revisar las "Verificaciones Adicionales" si es necesario
5. Marcar cada ítem como completado cuando se verifique

**Nota:** Muchas verificaciones requieren acciones previas (ej: crear una operación antes de verificar que se generaron alertas). Estas acciones previas están indicadas al inicio de cada sección relevante.

---

## 1. Dashboard

**Ruta:** `/dashboard`  
**Módulo:** `dashboard`

### Acciones a Probar

1. **Cargar la página del Dashboard**
   - Navegar a `/dashboard`
   - Esperar a que carguen todos los KPIs

2. **Verificar KPIs principales**
   - Ventas totales
   - Número de operaciones
   - Número de leads
   - Número de clientes
   - Verificar que los números sean coherentes

3. **Cambiar filtro de fecha**
   - Seleccionar rango de fechas personalizado
   - Cambiar a "Últimos 7 días"
   - Cambiar a "Último mes"
   - Cambiar a "Último año"

4. **Cambiar filtro de agencia**
   - Si eres SUPER_ADMIN: seleccionar diferentes agencias
   - Si eres otro rol: verificar que solo veas tus agencias

5. **Cambiar filtro de vendedor**
   - Seleccionar diferentes vendedores
   - Seleccionar "Todos"

6. **Verificar gráficos**
   - Verificar que los gráficos se actualicen al cambiar filtros
   - Verificar que los datos en gráficos coincidan con los KPIs

7. **Verificar permisos según rol**
   - Si eres SELLER: verificar que solo veas tus datos
   - Si eres ADMIN/SUPER_ADMIN: verificar que veas todos los datos

### Resultados Esperados

- ✅ KPIs se muestran correctamente sin errores
- ✅ Filtros aplican cambios inmediatamente (sin necesidad de recargar)
- ✅ Gráficos reflejan los datos filtrados correctamente
- ✅ No hay errores en la consola del navegador
- ✅ Los permisos se respetan según el rol del usuario

### Verificaciones Adicionales

- Abrir DevTools (F12) y verificar que no haya errores en la consola
- Verificar que las llamadas a la API se completen correctamente (pestaña Network)
- Verificar tiempos de carga razonables (< 3 segundos)

---

## 2. Leads (Trello)

**Ruta:** `/sales/leads`  
**Módulo:** `leads`

### Acciones a Probar

1. **Ver leads en vista Kanban**
   - Navegar a `/sales/leads`
   - Verificar que se muestren las listas de Trello
   - Verificar que los leads estén en las listas correctas

2. **Ver leads en vista Tabla**
   - Cambiar a vista de tabla
   - Verificar que se muestren todas las columnas
   - Verificar ordenamiento por columnas

3. **Crear nuevo lead manualmente**
   - Hacer clic en "Nuevo Lead" o botón similar
   - Completar formulario con datos de prueba
   - Guardar

4. **Editar lead de Trello**
   - Abrir un lead que tenga `source: "Trello"` y `external_id` presente
   - Intentar editar campos
   - Verificar que solo `assigned_seller_id` y `notes` sean editables

5. **Editar lead de Manychat**
   - Abrir un lead que tenga `source: "Manychat"`
   - Verificar que todos los campos sean editables

6. **Asignar lead a vendedor ("agarrar")**
   - Si eres SELLER: hacer clic en botón "Agarrar" en un lead sin asignar
   - Verificar que el lead se asigne a ti
   - Si el lead es de Trello: verificar que se mueva la tarjeta en Trello

7. **Convertir lead a operación**
   - Abrir un lead
   - Hacer clic en "Convertir a Operación"
   - Completar formulario de conversión
   - Guardar

8. **Filtrar leads**
   - Filtrar por agencia
   - Filtrar por vendedor
   - Filtrar por estado
   - Verificar que los filtros funcionen correctamente

9. **Buscar leads**
   - Usar el campo de búsqueda
   - Buscar por nombre de contacto
   - Buscar por destino
   - Verificar que los resultados sean relevantes

10. **Mover lead entre listas (Kanban)**
    - Arrastrar un lead de una lista a otra
    - Verificar que se actualice en la UI
    - Si es lead de Trello: verificar que se actualice en Trello

### Resultados Esperados

- ✅ Leads se muestran correctamente en ambas vistas (Kanban y Tabla)
- ✅ Edición funciona según tipo de lead (Trello: restringida; Manychat: completa)
- ✅ Asignación actualiza la UI inmediatamente
- ✅ Conversión crea la operación y actualiza el estado del lead a "WON"
- ✅ Filtros y búsqueda funcionan correctamente
- ✅ Movimiento entre listas se refleja en tiempo real

### Verificaciones Adicionales

- Verificar en la base de datos que el lead se actualizó correctamente
- Si es lead de Trello: verificar en Trello que los cambios se sincronizaron
- Verificar que los documentos del lead se transfirieron a la operación y al cliente

---

## 3. CRM Manychat

**Ruta:** `/sales/crm-manychat`  
**Módulo:** `leads`

### Acciones a Probar

1. **Ver leads de Manychat en Kanban**
   - Navegar a `/sales/crm-manychat`
   - Verificar que se muestren solo leads de Manychat
   - Verificar que las listas sean independientes de Trello

2. **Crear lead manualmente**
   - Hacer clic en "Nuevo Lead"
   - Completar formulario
   - Guardar

3. **Editar lead (todos los campos editables)**
   - Abrir cualquier lead de Manychat
   - Verificar que todos los campos sean editables
   - Modificar varios campos
   - Guardar

4. **Asignar lead a vendedor (sin sincronización Trello)**
   - Hacer clic en "Agarrar" en un lead sin asignar
   - Verificar que se asigne correctamente
   - Verificar que NO se haga ninguna llamada a Trello

5. **Convertir lead a operación**
   - Abrir un lead de Manychat
   - Convertir a operación
   - Verificar que se cree correctamente

6. **Cambiar orden de listas**
   - Arrastrar listas para cambiar su orden
   - Recargar la página
   - Verificar que el orden se mantenga

7. **Mover lead entre listas**
   - Arrastrar lead de una lista a otra
   - Verificar que se actualice `list_name` en la base de datos

### Resultados Esperados

- ✅ Leads de Manychat son completamente independientes de Trello
- ✅ Edición completa disponible para todos los campos
- ✅ Asignación no interactúa con Trello (verificar en Network tab)
- ✅ Orden de listas se guarda correctamente
- ✅ Movimiento entre listas funciona sin errores

### Verificaciones Adicionales

- Abrir DevTools > Network y verificar que no haya llamadas a API de Trello al asignar leads
- Verificar en la base de datos que `list_name` se actualiza correctamente
- Verificar que `source: "Manychat"` se mantiene

---

## 4. Operaciones

**Ruta:** `/operations`  
**Módulo:** `operations`

### Acciones Previas (Preparación)

Antes de probar la generación automática de IVA, contabilidad, alertas y mensajes:

1. **Asegurar que existan:**
   - Al menos una agencia configurada
   - Al menos un vendedor (usuario con rol SELLER, ADMIN o SUPER_ADMIN)
   - Al menos un operador
   - Al menos un destino con requisitos configurados (para probar alertas de requisitos)
   - Tasa de cambio configurada para USD (si vas a crear operación en USD)
   - Plantillas de WhatsApp configuradas (para probar generación automática de mensajes)

2. **Preparar datos de prueba:**
   - Tener un lead disponible para convertir a operación
   - Tener datos de cliente (nombre, email, teléfono) para crear operación manual

### Acciones a Probar

1. **Ver lista de operaciones**
   - Navegar a `/operations`
   - Verificar que se muestren todas las operaciones
   - Verificar que la columna "Destino" sea visible

2. **Crear operación desde lead (pre-llenado)**
   - **Acción previa:** Tener un lead disponible (puede ser de Trello o Manychat)
   - Ir a un lead
   - Hacer clic en "Convertir a Operación"
   - Verificar que los campos se pre-llenen con datos del lead
   - Completar campos faltantes (fechas, montos, operadores, etc.)
   - **Importante:** Asegurar que `sale_amount_total > 0` para generar IVA de venta
   - **Importante:** Agregar al menos un operador con costo para generar IVA de compra
   - **Importante:** Seleccionar un destino con requisitos configurados para generar alertas
   - Guardar

3. **Crear operación manualmente**
   - Hacer clic en "Nueva Operación"
   - Completar formulario completo:
     - Seleccionar agencia, vendedor, operador
     - Ingresar destino (preferiblemente uno con requisitos configurados)
     - Ingresar fechas (`departure_date` y `return_date` donde `return_date > departure_date`)
     - Ingresar `sale_amount_total > 0` (para generar IVA de venta)
     - Agregar operadores con costo (para generar IVA de compra y pagos)
     - Seleccionar moneda (USD o ARS)
   - Guardar

4. **Editar operación**
   - Abrir una operación existente
   - Modificar campos
   - Guardar

5. **Ver detalle de operación**
   - Hacer clic en una operación
   - Verificar que se muestren todos los datos
   - Verificar tabs: Información, Pagos, Documentos, Alertas, etc.

6. **Filtrar operaciones**
   - Filtrar por agencia
   - Filtrar por vendedor
   - Filtrar por estado
   - Filtrar por destino
   - Verificar que los filtros funcionen

7. **Buscar operaciones**
   - Usar campo de búsqueda
   - Buscar por destino
   - Buscar por nombre de cliente
   - Buscar por código de archivo

8. **Subir documento a operación**
   - **Acción previa:** Tener una operación creada (pasos 2 o 3)
   - Abrir la operación creada
   - Ir a tab "Documentos"
   - Subir un documento (PDF, imagen, etc.)
   - Verificar que se muestre en la lista
   - **Anotar el ID del cliente asociado** para el siguiente paso

9. **Verificar documento aparece en cliente asociado**
   - **Acción previa:** Haber completado el paso 8 (subir documento a operación)
   - Ir al cliente asociado a la operación (usar el ID anotado o buscar desde la operación)
   - Ir a tab "Documentos"
   - Verificar que el documento subido a la operación aparezca aquí también

### Resultados Esperados

- ✅ Operación se crea correctamente con todos los datos
- ✅ Se generan automáticamente:
  - ✅ IVA de ventas (si `sale_amount_total > 0`)
  - ✅ IVA de compras (por cada operador con costo)
  - ✅ Movimientos contables (Cuentas por Cobrar y Cuentas por Pagar)
  - ✅ Pagos a operadores (con fecha de vencimiento calculada)
  - ✅ Alertas (requisitos de destino, check-in, check-out)
  - ✅ Mensajes de WhatsApp (si hay plantillas configuradas)
- ✅ Documento se asocia a la operación Y al cliente principal
- ✅ Filtros y búsqueda funcionan correctamente
- ✅ Columna "Destino" siempre visible

### Verificaciones Adicionales

- Verificar en la base de datos:
  - Tabla `operations`: operación creada
  - Tabla `iva_sales`: registro de IVA de venta
  - Tabla `iva_purchases`: registros de IVA de compra (uno por operador)
  - Tabla `ledger_movements`: movimientos de Cuentas por Cobrar y Pagar
  - Tabla `operator_payments`: pagos a operadores
  - Tabla `alerts`: alertas generadas
  - Tabla `whatsapp_messages`: mensajes generados (si hay plantillas)
  - Tabla `documents`: documento asociado a operación Y cliente
- Verificar que `return_date > departure_date` (validación)
- Verificar que la tasa de cambio se obtenga correctamente (no usar fallback silencioso)

---

## 5. Clientes

**Ruta:** `/customers`  
**Módulo:** `customers`

### Acciones Previas (Preparación)

Antes de probar la vinculación de documentos, pagos y mensajes:

1. **Tener operaciones creadas:**
   - Al menos una operación creada desde un lead (esto crea automáticamente un cliente)
   - O crear una operación manualmente que asocie un cliente

2. **Para probar documentos:**
   - Haber subido al menos un documento a una operación (ver sección 4, paso 8)

3. **Para probar pagos:**
   - Haber registrado al menos un pago asociado a una operación del cliente

4. **Para probar mensajes:**
   - Haber generado mensajes desde alertas (al crear operación) o manualmente

### Acciones a Probar

1. **Ver lista de clientes**
   - Navegar a `/customers`
   - Verificar que se muestren todos los clientes
   - Verificar que los nombres estén limpios (sin prefijos/sufijos)

2. **Ver detalle de cliente**
   - Hacer clic en un cliente
   - Verificar que se muestre la información completa

3. **Verificar tabs en detalle de cliente**
   - Tab "Información": datos del cliente
   - Tab "Operaciones": todas las operaciones del cliente
   - Tab "Pagos": todos los pagos de todas sus operaciones
   - Tab "Documentos": documentos del cliente Y de sus operaciones
   - Tab "Mensajes": mensajes del cliente Y de sus operaciones

4. **Filtrar clientes**
   - Usar filtros disponibles
   - Verificar que funcionen correctamente

5. **Buscar clientes**
   - Buscar por nombre
   - Buscar por email
   - Buscar por teléfono
   - Verificar que los resultados sean relevantes

6. **Verificar nombres extraídos correctamente**
   - Verificar que "JOSE LUIS-3415 55-2242-CRUCERO" se muestre como "Jose Luis"
   - Verificar que "Jime Bert - jime_bert" se muestre como "Jime Bert"
   - Verificar que "PASADO A AGUS Maru Gamba - Bariloche" se muestre como "Agus Gamba"

7. **Verificar teléfonos normalizados**
   - Verificar formato consistente (ej: "11 1234-5678")
   - Verificar que no se muestren fechas como teléfonos
   - Verificar que números internacionales se muestren con "+"

8. **Verificar documentos del cliente Y de sus operaciones**
   - **Acción previa:** Tener una operación asociada a un cliente
   - Subir documento a una operación del cliente (ver sección 4, paso 8)
   - Ir al cliente
   - Ir a tab "Documentos"
   - Verificar que el documento subido a la operación aparezca aquí también

9. **Verificar pagos de todas sus operaciones**
   - **Acción previa:** Tener operaciones con pagos registrados
   - Ir a un cliente que tenga operaciones
   - Ir a tab "Pagos"
   - Verificar que se muestren pagos de todas las operaciones del cliente
   - Verificar que los montos sean correctos

10. **Verificar mensajes del cliente Y de sus operaciones**
    - **Acción previa:** Haber generado mensajes (automáticamente desde alertas o manualmente)
    - Ir a un cliente
    - Ir a tab "Mensajes"
    - Verificar que se muestren mensajes asociados directamente al cliente
    - Verificar que se muestren mensajes asociados a sus operaciones

### Resultados Esperados

- ✅ Lista muestra clientes correctamente
- ✅ Nombres limpios (sin prefijos como "PASADO A", sin sufijos como "-CRUCERO")
- ✅ Teléfonos formateados consistentemente (ej: "11 1234-5678")
- ✅ Documentos del cliente Y de sus operaciones se muestran
- ✅ Pagos de todas sus operaciones se muestran
- ✅ Mensajes del cliente Y de sus operaciones se muestran

### Verificaciones Adicionales

- Verificar en la base de datos que los documentos estén asociados correctamente
- Verificar que `operation_customers` tenga la relación correcta
- Verificar que los mensajes estén asociados a `customer_id` o `operation_id`

---

## 6. Operadores

**Ruta:** `/operators`  
**Módulo:** `operators`

### Acciones a Probar

1. **Ver lista de operadores**
   - Navegar a `/operators`
   - Verificar que se muestren todos los operadores

2. **Crear operador**
   - Hacer clic en "Nuevo Operador"
   - Completar formulario
   - Guardar

3. **Editar operador**
   - Abrir un operador
   - Modificar datos
   - Guardar

4. **Ver detalle de operador**
   - Hacer clic en un operador
   - Verificar información completa

5. **Ver operaciones asociadas**
   - En el detalle del operador
   - Verificar que se listen las operaciones donde participa

### Resultados Esperados

- ✅ CRUD funciona correctamente
- ✅ Operaciones asociadas se muestran
- ✅ Datos se guardan correctamente

### Verificaciones Adicionales

- Verificar en la base de datos que el operador se creó/actualizó correctamente
- Verificar que `operation_operators` tenga las relaciones correctas

---

## 7. Caja

### 7.1 Dashboard de Caja

**Ruta:** `/cash`  
**Módulo:** `cash`

#### Acciones a Probar

1. **Ver resumen de caja**
   - Navegar a `/cash`
   - Verificar que se muestre el resumen general

2. **Ver saldos por cuenta**
   - Verificar que se muestren saldos de cada cuenta
   - Verificar que los saldos sean correctos

3. **Ver movimientos recientes**
   - Verificar que se muestren los últimos movimientos
   - Verificar que los datos sean correctos

#### Resultados Esperados

- ✅ Saldos correctos según movimientos
- ✅ Movimientos actualizados
- ✅ Sin errores en la consola

### 7.2 Movimientos

**Ruta:** `/cash/movements`  
**Módulo:** `cash`

#### Acciones a Probar

1. **Ver lista de movimientos**
   - Navegar a `/cash/movements`
   - Verificar que se muestren todos los movimientos

2. **Crear movimiento manual**
   - Hacer clic en "Nuevo Movimiento"
   - Completar formulario (tipo, cuenta, monto, descripción)
   - Guardar

3. **Filtrar movimientos**
   - Filtrar por cuenta
   - Filtrar por tipo
   - Filtrar por fecha
   - Verificar que funcionen

4. **Editar movimiento**
   - Abrir un movimiento
   - Modificar datos
   - Guardar

#### Resultados Esperados

- ✅ Movimientos se registran correctamente
- ✅ Filtros funcionan
- ✅ Saldos se actualizan automáticamente

### 7.3 Pagos

**Ruta:** `/cash/payments`  
**Módulo:** `cash`

#### Acciones a Probar

1. **Ver lista de pagos**
   - Navegar a `/cash/payments`
   - Verificar que se muestren todos los pagos

2. **Registrar pago**
   - Hacer clic en "Registrar Pago"
   - Completar formulario
   - Guardar

3. **Filtrar pagos**
   - Filtrar por cliente
   - Filtrar por operación
   - Filtrar por estado
   - Verificar que funcionen

4. **Ver detalle de pago**
   - Hacer clic en un pago
   - Verificar información completa

#### Resultados Esperados

- ✅ Pagos se registran correctamente
- ✅ Se actualizan saldos automáticamente
- ✅ Filtros funcionan

---

## 8. Contabilidad

### 8.1 Libro Mayor

**Ruta:** `/accounting/ledger`  
**Módulo:** `accounting`

#### Acciones Previas (Preparación)

1. **Tener operaciones creadas:**
   - Crear al menos una operación (ver sección 4, pasos 2 o 3)
   - Preferiblemente una en USD para probar equivalentes en ARS

2. **Tener tasa de cambio configurada:**
   - Asegurar que exista tasa de cambio para USD en la fecha de la operación

#### Acciones a Probar

1. **Ver movimientos contables**
   - Navegar a `/accounting/ledger`
   - Verificar que se muestren todos los movimientos

2. **Filtrar movimientos**
   - Filtrar por cuenta financiera
   - Filtrar por fecha
   - Filtrar por tipo (DEBIT/CREDIT)
   - Verificar que funcionen

3. **Verificar movimientos automáticos de operaciones**
   - **Acción previa:** Crear una nueva operación (ver sección 4, paso 2 o 3)
   - Ir al Libro Mayor
   - Filtrar por la fecha de la operación creada
   - Verificar que se hayan creado:
     - Movimiento de Cuentas por Cobrar (DEBIT) con el monto de venta
     - Movimiento de Cuentas por Pagar (CREDIT) con el costo de operadores

4. **Verificar equivalentes en ARS**
   - **Acción previa:** Tener una operación en USD creada
   - Ir al Libro Mayor
   - Buscar movimientos de la operación en USD
   - Verificar que tengan columna "ARS Equivalent" con el valor calculado
   - Verificar que se use la tasa de cambio correcta (no fallback silencioso)
   - Verificar en consola que no haya warnings de tasa de cambio faltante

#### Resultados Esperados

- ✅ Movimientos se muestran correctamente
- ✅ Equivalentes ARS calculados correctamente
- ✅ Filtros funcionan
- ✅ Movimientos automáticos se crean al crear operación

### 8.2 IVA

**Ruta:** `/accounting/iva`  
**Módulo:** `accounting`

#### Acciones Previas (Preparación)

1. **Tener operaciones con montos:**
   - Crear una operación con `sale_amount_total > 0` (para IVA de venta)
   - Agregar al menos un operador con `cost > 0` (para IVA de compra)

#### Acciones a Probar

1. **Ver IVA de ventas**
   - Navegar a `/accounting/iva`
   - Verificar que se muestren registros de IVA de ventas

2. **Ver IVA de compras**
   - Verificar que se muestren registros de IVA de compras (por operador)

3. **Verificar generación automática al crear operación**
   - **Acción previa:** Crear una nueva operación con:
     - `sale_amount_total > 0` (ej: 1000 USD)
     - Al menos un operador con `cost > 0` (ej: 800 USD)
   - Ir a IVA
   - Filtrar por la fecha de la operación creada
   - Verificar que se haya creado registro de IVA de venta (21% de `sale_amount_total`)
   - Verificar que se hayan creado registros de IVA de compra (uno por operador, 21% de cada `cost`)

4. **Filtrar IVA**
   - Filtrar por fecha
   - Filtrar por operación
   - Verificar que funcionen

#### Resultados Esperados

- ✅ IVA se calcula correctamente (21% en Argentina)
- ✅ Se genera automáticamente al crear operación
- ✅ Filtros funcionan

### 8.3 Cuentas Financieras

**Ruta:** `/accounting/financial-accounts`  
**Módulo:** `accounting`

#### Acciones a Probar

1. **Ver lista de cuentas**
   - Navegar a `/accounting/financial-accounts`
   - Verificar que se muestren todas las cuentas

2. **Crear cuenta**
   - Hacer clic en "Nueva Cuenta"
   - Completar formulario (nombre, tipo, código)
   - Guardar

3. **Editar cuenta**
   - Abrir una cuenta
   - Modificar datos
   - Guardar

4. **Verificar tipo correcto (ASSETS vs LIABILITIES)**
   - Verificar que "Cuentas por Cobrar" sea tipo ASSETS
   - Verificar que "Cuentas por Pagar" sea tipo LIABILITIES (no ASSETS)

#### Resultados Esperados

- ✅ CRUD funciona
- ✅ Tipos correctos (Cuentas por Pagar = LIABILITIES, no ASSETS)
- ✅ Cuentas se crean automáticamente si no existen

### 8.4 Posición Mensual

**Ruta:** `/accounting/monthly-position`  
**Módulo:** `accounting`

#### Acciones a Probar

1. **Ver posición mensual**
   - Navegar a `/accounting/monthly-position`
   - Verificar que se muestre la posición del mes actual

2. **Cambiar mes**
   - Seleccionar un mes diferente
   - Verificar que se actualicen los datos

3. **Verificar cálculos**
   - Verificar que ingresos, egresos y saldo sean correctos
   - Verificar que coincidan con movimientos del libro mayor

#### Resultados Esperados

- ✅ Datos correctos según movimientos
- ✅ Cálculos precisos
- ✅ Navegación entre meses funciona

### 8.5 Pagos a Operadores

**Ruta:** `/accounting/operator-payments`  
**Módulo:** `accounting`

#### Acciones Previas (Preparación)

1. **Tener operaciones con operadores:**
   - Crear una operación agregando al menos un operador con costo
   - Seleccionar un tipo de producto (PAQUETE, VUELO, HOTEL, etc.) para que se calcule la fecha de vencimiento

#### Acciones a Probar

1. **Ver pagos pendientes**
   - Navegar a `/accounting/operator-payments`
   - Verificar que se muestren pagos pendientes

2. **Ver pagos realizados**
   - Filtrar por estado "PAID"
   - Verificar que se muestren correctamente

3. **Marcar como pagado**
   - **Acción previa:** Tener al menos un pago pendiente
   - Seleccionar un pago pendiente
   - Marcar como pagado
   - Verificar que se actualice el estado

4. **Verificar generación automática**
   - **Acción previa:** Crear una nueva operación con:
     - Al menos un operador con `cost > 0`
     - Tipo de producto seleccionado (ej: PAQUETE, VUELO)
     - Fechas de salida y regreso
   - Ir a Pagos a Operadores
   - Filtrar por la fecha de la operación
   - Verificar que se hayan creado pagos automáticamente (uno por operador)
   - Verificar que las fechas de vencimiento sean correctas según tipo de producto:
     - PAQUETE: fecha de salida
     - VUELO: fecha de salida
     - HOTEL: fecha de check-in
     - etc.

#### Resultados Esperados

- ✅ Pagos se generan automáticamente al crear operación
- ✅ Estado se actualiza correctamente
- ✅ Fechas de vencimiento calculadas correctamente

### 8.6 Pagos Recurrentes

**Ruta:** `/accounting/recurring-payments`  
**Módulo:** `accounting`

#### Acciones a Probar

1. **Ver pagos recurrentes**
   - Navegar a `/accounting/recurring-payments`
   - Verificar que se muestren todos los pagos recurrentes

2. **Crear pago recurrente**
   - Hacer clic en "Nuevo Pago Recurrente"
   - Completar formulario (descripción, monto, frecuencia, cuenta)
   - Guardar

3. **Editar frecuencia**
   - Abrir un pago recurrente
   - Cambiar frecuencia (mensual, trimestral, etc.)
   - Guardar

#### Resultados Esperados

- ✅ CRUD funciona
- ✅ Frecuencia se respeta
- ✅ Pagos se generan según frecuencia

### 8.7 Cuentas de Socios

**Ruta:** `/accounting/partner-accounts`  
**Módulo:** `accounting`

#### Acciones a Probar

1. **Ver cuentas de socios**
   - Navegar a `/accounting/partner-accounts`
   - Verificar que se muestren todas las cuentas

2. **Ver movimientos por socio**
   - Hacer clic en un socio
   - Verificar que se muestren sus movimientos

3. **Crear cuenta de socio**
   - Hacer clic en "Nueva Cuenta de Socio"
   - Completar formulario
   - Guardar

#### Resultados Esperados

- ✅ Datos correctos
- ✅ Movimientos asociados correctamente

---

## 9. Mensajes

**Ruta:** `/messages`  
**Módulo:** (sin módulo específico)

### Acciones Previas (Preparación)

1. **Tener plantillas de WhatsApp configuradas:**
   - Ir a Configuración > Plantillas de Mensajes
   - Crear al menos una plantilla activa para cada trigger:
     - `DESTINATION_REQUIREMENT`
     - `CHECK_IN`
     - `CHECK_OUT`
     - `PAYMENT_DUE`
   - Esto es necesario para que se generen mensajes automáticamente desde alertas

2. **Tener clientes con teléfono:**
   - Asegurar que los clientes tengan número de teléfono válido

### Acciones a Probar

1. **Ver lista de mensajes WhatsApp**
   - Navegar a `/messages`
   - Verificar que se muestren todos los mensajes

2. **Crear mensaje manual**
   - **Acción previa:** Tener al menos un cliente con teléfono
   - Hacer clic en "Nuevo Mensaje"
   - Seleccionar cliente
   - Seleccionar plantilla o escribir mensaje
   - Programar o enviar inmediatamente

3. **Ver mensajes programados**
   - Filtrar por estado "PENDING"
   - Verificar que se muestren correctamente

4. **Ver mensajes enviados**
   - Filtrar por estado "SENT"
   - Verificar que se muestren correctamente

5. **Filtrar mensajes**
   - Filtrar por cliente
   - Filtrar por operación
   - Filtrar por estado
   - Verificar que funcionen

6. **Verificar generación automática desde alertas**
   - **Acción previa:** 
     - Tener plantillas de WhatsApp configuradas (paso 1 de Acciones Previas)
     - Crear una operación que genere alertas (ver sección 4, paso 2 o 3)
     - La operación debe tener:
       - Destino con requisitos configurados (para alertas de requisitos)
       - Fechas de salida/regreso (para alertas de check-in/check-out)
   - Ir a Mensajes
   - Filtrar por la fecha de creación de la operación
   - Verificar que se hayan generado mensajes automáticamente desde las alertas
   - Verificar que los mensajes tengan `alert_id` asociado

### Resultados Esperados

- ✅ Mensajes se crean correctamente
- ✅ Se generan automáticamente desde alertas (si hay plantillas configuradas)
- ✅ Filtros funcionan
- ✅ Estados se actualizan correctamente

### Verificaciones Adicionales

- Verificar en la base de datos que los mensajes se crearon correctamente
- Verificar que `template_id` esté asociado si se usó plantilla
- Verificar que `alert_id` esté asociado si se generó desde alerta

---

## 10. Alertas

**Ruta:** `/alerts`  
**Módulo:** `alerts`

### Acciones Previas (Preparación)

1. **Configurar requisitos de destino:**
   - Ir a Configuración (o donde se configuren destinos)
   - Asegurar que al menos un destino tenga requisitos configurados (ej: "Pasaporte", "Visa", etc.)
   - Cada requisito debe tener `days_before_trip` configurado

2. **Tener plantillas de WhatsApp (opcional):**
   - Para probar generación de mensajes desde alertas, tener plantillas configuradas (ver sección 9, Acciones Previas)

### Acciones a Probar

1. **Ver lista de alertas**
   - Navegar a `/alerts`
   - Verificar que se muestren todas las alertas

2. **Filtrar alertas**
   - Filtrar por tipo (DESTINATION_REQUIREMENT, CHECK_IN, CHECK_OUT, PAYMENT_DUE, etc.)
   - Filtrar por estado (PENDING, COMPLETED)
   - Filtrar por fecha
   - Verificar que funcionen

3. **Marcar alerta como completada**
   - **Acción previa:** Tener al menos una alerta pendiente
   - Seleccionar una alerta
   - Marcar como completada
   - Verificar que se actualice el estado

4. **Verificar generación automática: Requisitos de destino**
   - **Acción previa:** Tener un destino con requisitos configurados (paso 1 de Acciones Previas)
   - Crear una operación con ese destino (ver sección 4, paso 2 o 3)
   - Ir a Alertas
   - Filtrar por tipo "DESTINATION_REQUIREMENT"
   - Verificar que se hayan creado alertas para cada requisito del destino
   - Verificar que las fechas de alerta sean correctas (`departure_date - days_before_trip`)

5. **Verificar generación automática: Check-in (30 días antes)**
   - **Acción previa:** Calcular una fecha 30 días en el futuro
   - Crear una operación con `departure_date` = fecha en 30 días
   - Ir a Alertas
   - Filtrar por tipo "CHECK_IN"
   - Verificar que se haya creado alerta de check-in con fecha = `departure_date - 30 días`

6. **Verificar generación automática: Check-out (1 día antes)**
   - **Acción previa:** Calcular una fecha 1 día en el futuro
   - Crear una operación con `return_date` = fecha en 1 día (y `departure_date` anterior)
   - Ir a Alertas
   - Filtrar por tipo "CHECK_OUT"
   - Verificar que se haya creado alerta de check-out con fecha = `return_date - 1 día`

7. **Verificar generación automática: Pagos vencidos/próximos**
   - **Acción previa:** Crear una operación con operadores (esto genera pagos automáticamente)
   - Ir a Alertas
   - Filtrar por tipo "PAYMENT_DUE"
   - Verificar que se creen alertas para pagos próximos a vencer (según configuración del sistema)

8. **Verificar mensajes WhatsApp generados desde alertas**
   - **Acción previa:** 
     - Tener plantillas de WhatsApp configuradas (ver sección 9, Acciones Previas)
     - Crear una operación que genere alertas (pasos 4, 5 o 6 de esta sección)
   - Ir a Mensajes (ver sección 9)
   - Verificar que se hayan generado mensajes automáticamente desde las alertas
   - Verificar que los mensajes tengan `alert_id` asociado

### Resultados Esperados

- ✅ Alertas se generan automáticamente al crear operación
- ✅ Mensajes se crean desde alertas (si hay plantillas)
- ✅ Filtros funcionan
- ✅ Estados se actualizan correctamente

### Verificaciones Adicionales

- Verificar en la base de datos que las alertas se crearon con las fechas correctas
- Verificar que `date_due` sea correcto según el tipo de alerta
- Verificar que los mensajes estén asociados a las alertas (`alert_id`)

---

## 11. Calendario

**Ruta:** `/calendar`  
**Módulo:** `alerts`

### Acciones a Probar

1. **Ver calendario de operaciones**
   - Navegar a `/calendar`
   - Verificar que se muestren las operaciones en el calendario

2. **Ver alertas en calendario**
   - Verificar que las alertas se muestren en el calendario
   - Verificar que las fechas coincidan

3. **Filtrar por agencia**
   - Seleccionar una agencia
   - Verificar que solo se muestren operaciones/alertas de esa agencia

4. **Filtrar por vendedor**
   - Seleccionar un vendedor
   - Verificar que solo se muestren operaciones/alertas de ese vendedor

5. **Navegar entre meses**
   - Ir al mes anterior
   - Ir al mes siguiente
   - Verificar que los datos se carguen correctamente

### Resultados Esperados

- ✅ Operaciones y alertas se muestran en el calendario
- ✅ Navegación funciona correctamente
- ✅ Filtros funcionan

---

## 12. Reportes

**Ruta:** `/reports`  
**Módulo:** `reports`

### Acciones a Probar

1. **Ver reportes disponibles**
   - Navegar a `/reports`
   - Verificar que se muestren los reportes disponibles

2. **Generar reporte**
   - Seleccionar un tipo de reporte
   - Configurar filtros (fecha, agencia)
   - Generar reporte

3. **Filtrar por fecha**
   - Seleccionar rango de fechas
   - Verificar que el reporte refleje el rango

4. **Filtrar por agencia**
   - Seleccionar una agencia
   - Verificar que el reporte solo incluya datos de esa agencia

5. **Exportar reporte**
   - Generar un reporte
   - Hacer clic en "Exportar"
   - Verificar que se descargue el archivo

### Resultados Esperados

- ✅ Reportes se generan correctamente
- ✅ Datos precisos según filtros
- ✅ Exportación funciona

---

## 13. Mi Balance

**Ruta:** `/my/balance`  
**Módulo:** (solo para SELLER)

### Acciones a Probar

1. **Ver balance personal**
   - Navegar a `/my/balance` (solo si eres SELLER)
   - Verificar que se muestre tu balance

2. **Ver operaciones propias**
   - Verificar que solo se muestren tus operaciones
   - Verificar que los datos sean correctos

3. **Ver comisiones**
   - Verificar que se muestren tus comisiones
   - Verificar que los cálculos sean correctos

### Resultados Esperados

- ✅ Solo datos del vendedor actual
- ✅ Cálculos correctos
- ✅ No se muestran datos de otros vendedores

### Verificaciones Adicionales

- Verificar que si eres otro rol, no puedas acceder a esta ruta
- Verificar en la base de datos que los filtros se apliquen correctamente

---

## 14. Mis Comisiones

**Ruta:** `/my/commissions`  
**Módulo:** (solo para SELLER)

### Acciones a Probar

1. **Ver comisiones propias**
   - Navegar a `/my/commissions` (solo si eres SELLER)
   - Verificar que se muestren solo tus comisiones

2. **Filtrar por fecha**
   - Seleccionar rango de fechas
   - Verificar que se filtren correctamente

3. **Ver detalle de comisión**
   - Hacer clic en una comisión
   - Verificar información completa (operación, monto, porcentaje)

### Resultados Esperados

- ✅ Solo comisiones del vendedor actual
- ✅ Cálculos correctos
- ✅ Filtros funcionan

---

## 15. Emilia

**Ruta:** `/emilia`  
**Módulo:** (sin módulo específico)

### Acciones a Probar

1. **Hacer pregunta al AI**
   - Navegar a `/emilia`
   - Escribir una pregunta
   - Enviar

2. **Verificar respuesta contextual**
   - Hacer pregunta sobre una operación específica
   - Verificar que la respuesta sea relevante y use datos del sistema

3. **Verificar acceso a datos del sistema**
   - Preguntar sobre ventas del mes
   - Preguntar sobre operaciones de un cliente
   - Verificar que tenga acceso a los datos correctos

### Resultados Esperados

- ✅ Respuestas relevantes y contextuales
- ✅ Acceso a datos del sistema correcto
- ✅ Respuestas en tiempo razonable

---

## 16. Configuración

**Ruta:** `/settings`  
**Módulo:** `settings`

### Acciones Previas (Preparación)

1. **Para configurar Trello:**
   - Tener credenciales de Trello (API key y token)
   - Tener acceso al Board de Trello que se quiere sincronizar
   - Tener permisos de ADMIN o SUPER_ADMIN

2. **Para configurar plantillas WhatsApp:**
   - Decidir qué triggers necesitas (DESTINATION_REQUIREMENT, CHECK_IN, CHECK_OUT, PAYMENT_DUE, etc.)
   - Preparar textos de plantillas con variables (ej: `{nombre}`, `{destino}`, `{fecha}`)

### Acciones a Probar

1. **Ver configuración de Trello**
   - Navegar a `/settings`
   - Ir a sección "Trello"
   - Verificar que se muestre la configuración actual

2. **Configurar webhooks**
   - **Acción previa:** Tener credenciales de Trello (paso 1 de Acciones Previas)
   - Configurar API key y token de Trello
   - Configurar Board ID
   - Registrar webhook
   - Verificar que se registre correctamente en Trello (puedes verificar en Trello > Board Settings > Power-ups)

3. **Ver configuración de Manychat**
   - Ir a sección "Manychat"
   - Verificar configuración
   - Cambiar orden de listas
   - Verificar que el orden se guarde

4. **Ver configuración de plantillas WhatsApp**
   - **Acción previa:** Tener textos de plantillas preparados (paso 2 de Acciones Previas)
   - Ir a sección "Plantillas de Mensajes"
   - Ver plantillas existentes
   - Crear nueva plantilla:
     - Seleccionar trigger type (ej: DESTINATION_REQUIREMENT)
     - Escribir template con variables (ej: "Hola {nombre}, recuerda traer {requisito} para tu viaje a {destino}")
     - Activar plantilla
   - Editar plantilla existente
   - Verificar que las plantillas activas se usen para generar mensajes automáticos

5. **Ver configuración de usuarios**
   - **Acción previa:** Tener permisos de ADMIN o SUPER_ADMIN
   - Ir a sección "Usuarios"
   - Ver lista de usuarios
   - Crear nuevo usuario:
     - Completar datos (nombre, email, rol)
     - Asignar agencias
   - Editar usuario existente
   - Cambiar rol de usuario
   - Verificar que los cambios se reflejen en permisos

6. **Ver configuración de agencias**
   - **Acción previa:** Tener permisos de ADMIN o SUPER_ADMIN
   - Ir a sección "Agencias"
   - Ver lista de agencias
   - Crear nueva agencia:
     - Completar datos (nombre, etc.)
   - Editar agencia existente
   - Verificar que las agencias se asocien correctamente a usuarios

### Resultados Esperados

- ✅ Configuraciones se guardan correctamente
- ✅ Webhooks se registran en Trello
- ✅ Cambios se reflejan inmediatamente
- ✅ Permisos se respetan (solo ADMIN/SUPER_ADMIN pueden configurar)

### Verificaciones Adicionales

- Verificar en Trello que el webhook se registró correctamente
- Verificar en la base de datos que las configuraciones se guardaron

---

## Checklist General de Verificaciones

Después de probar cada funcionalidad, verificar:

- [ ] No hay errores en la consola del navegador
- [ ] Las llamadas a la API se completan correctamente (status 200)
- [ ] Los tiempos de carga son razonables (< 3 segundos)
- [ ] Los permisos se respetan según el rol del usuario
- [ ] Los datos se guardan correctamente en la base de datos
- [ ] Las relaciones entre tablas son correctas
- [ ] Los cálculos son precisos
- [ ] La UI se actualiza correctamente después de cada acción

---

## Notas Finales

- Este checklist debe usarse como guía, no como lista exhaustiva
- Algunas acciones pueden requerir datos específicos en la base de datos
- Si encuentras un bug, documentarlo con:
  - Funcionalidad afectada
  - Acción realizada
  - Resultado esperado vs resultado actual
  - Pasos para reproducir
  - Capturas de pantalla si es necesario

---

**Fin del Checklist de Testing Manual**

