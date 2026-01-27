# 📋 GUÍA COMPLETA DE MIGRACIÓN DE DATOS

## ⚠️ IMPORTANTE: LEE ESTA GUÍA COMPLETA ANTES DE COMENZAR

Esta guía te llevará paso a paso para migrar todos tus datos históricos al sistema. **De esta migración depende el éxito del sistema**, así que tómate el tiempo necesario y sigue cada paso cuidadosamente.

---

## 📊 ÍNDICE

1. [Preparación Pre-Migración](#1-preparación-pre-migración)
2. [Orden de Importación](#2-orden-de-importación)
3. [Paso 1: Operadores](#paso-1-operadores)
4. [Paso 2: Clientes](#paso-2-clientes)
5. [Paso 3: Tipos de Cambio Históricos](#paso-3-tipos-de-cambio-históricos)
6. [Paso 4: Cuentas Financieras](#paso-4-cuentas-financieras)
7. [Paso 5: Operaciones](#paso-5-operaciones)
8. [Paso 6: Relación Operaciones-Operadores](#paso-6-relación-operaciones-operadores)
9. [Paso 7: Pagos](#paso-7-pagos)
10. [Paso 8: Validación y Verificación](#paso-8-validación-y-verificación)
11. [Solución de Problemas](#solución-de-problemas)

---

## 1. PREPARACIÓN PRE-MIGRACIÓN

### 1.1. Verificar Estado del Sistema

Antes de comenzar, verifica que:

- ✅ Tienes acceso de **ADMIN** o **SUPER_ADMIN** al sistema
- ✅ Ya existe al menos una **Agencia** configurada
- ✅ Ya existen **Usuarios** (vendedores) creados en el sistema
- ✅ El sistema está en producción y funcionando correctamente

### 1.2. Backup de Datos Actuales

**IMPORTANTE**: Antes de importar, ejecuta el script de limpieza si es necesario:

```bash
# Si necesitas limpiar datos de prueba primero
npm run limpieza:masiva
```

O consulta: `docs/PLAN_LIMPIEZA_MASIVA_PRE_IMPORTACION.md`

### 1.3. Preparar Archivos CSV

1. Descarga los archivos CSV de ejemplo desde `docs/csv-ejemplos/`
2. Completa cada CSV con tus datos reales
3. **Guarda una copia de seguridad** de todos los CSVs antes de importar
4. Verifica que los datos estén correctamente formateados (fechas, números, etc.)

---

## 2. ORDEN DE IMPORTACIÓN

**⚠️ CRÍTICO: Debes seguir este orden exacto** porque hay dependencias entre las tablas:

1. **Operadores** (no depende de nada)
2. **Clientes** (no depende de nada)
3. **Tipos de Cambio** (opcional pero recomendado)
4. **Cuentas Financieras** (necesario para pagos)
5. **Operaciones** (depende de: agencias, vendedores, operadores, clientes)
6. **Relación Operaciones-Operadores** (depende de: operaciones, operadores)
7. **Pagos** (depende de: operaciones, cuentas financieras)

---

## PASO 1: OPERADORES

### Descripción
Importa todos tus operadores/proveedores mayoristas.

### Archivo CSV: `operadores.csv`

### Campos Requeridos:
- `name` (OBLIGATORIO): Nombre del operador

### Campos Opcionales:
- `contact_name`: Nombre del contacto
- `contact_email`: Email del contacto
- `contact_phone`: Teléfono del contacto
- `credit_limit`: Límite de crédito (número, sin símbolos)

### Ejemplo de Datos:
```csv
name,contact_name,contact_email,contact_phone,credit_limit
Despegar,María González,maria@despegar.com,+5491123456789,50000
Aerolíneas Argentinas,Juan Pérez,juan@aerolineas.com,+5491123456780,100000
```

### Instrucciones:
1. Ve a **Configuración → Importar Datos**
2. Selecciona **"Operadores"**
3. Sube el archivo `operadores.csv`
4. Revisa el resumen de importación
5. Confirma la importación

### Verificación:
- Ve a **Operadores** en el menú
- Verifica que todos los operadores aparezcan correctamente

---

## PASO 2: CLIENTES

### Descripción
Importa todos tus clientes/pasajeros históricos.

### Archivo CSV: `clientes.csv`

### Campos Requeridos:
- `first_name` (OBLIGATORIO): Nombre del cliente
- `last_name` (OBLIGATORIO): Apellido del cliente
- `phone` (OBLIGATORIO): Teléfono del cliente

### Campos Opcionales:
- `email`: Email del cliente (recomendado para vincular con operaciones)
- `document_type`: Tipo de documento (ej: "DNI", "PASSPORT")
- `document_number`: Número de documento
- `date_of_birth`: Fecha de nacimiento (formato: YYYY-MM-DD)
- `nationality`: Nacionalidad
- `instagram_handle`: Usuario de Instagram (sin @)
- `address`: Dirección
- `city`: Ciudad

### Ejemplo de Datos:
```csv
first_name,last_name,phone,email,document_type,document_number,date_of_birth,nationality
Juan,Pérez,+5491123456789,juan@email.com,DNI,12345678,1990-05-15,ARGENTINA
María,González,+5491123456790,maria@email.com,DNI,87654321,1985-08-20,ARGENTINA
```

### Instrucciones:
1. Ve a **Configuración → Importar Datos**
2. Selecciona **"Clientes"**
3. Sube el archivo `clientes.csv`
4. Revisa el resumen de importación
5. Confirma la importación

### Verificación:
- Ve a **Base de Datos Clientes** en el menú
- Verifica que los clientes aparezcan correctamente
- Verifica que los emails estén correctos (se usarán para vincular con operaciones)

---

## PASO 3: TIPOS DE CAMBIO HISTÓRICOS

### Descripción
Importa los tipos de cambio históricos para que el sistema pueda calcular correctamente los equivalentes en ARS de los pagos en USD.

### Archivo CSV: `tipos_cambio.csv`

### Campos Requeridos:
- `rate_date` (OBLIGATORIO): Fecha del tipo de cambio (formato: YYYY-MM-DD)
- `rate` (OBLIGATORIO): Tipo de cambio (cuántos ARS por 1 USD)

### Campos Opcionales:
- `source`: Fuente del tipo de cambio (ej: "BCRA", "MEP", "CCL")
- `notes`: Notas adicionales

### Ejemplo de Datos:
```csv
rate_date,rate,source,notes
2024-01-01,850.50,BCRA,Tipo de cambio oficial
2024-01-15,920.00,MEP,Tipo de cambio MEP
2024-02-01,950.75,BCRA,Tipo de cambio oficial
```

### Instrucciones:
1. Ve a **Configuración → Importar Datos**
2. Selecciona **"Tipos de Cambio"** (si está disponible)
3. O importa manualmente desde la base de datos si es necesario

### ⚠️ IMPORTANTE:
- Si no importas tipos de cambio históricos, el sistema usará el tipo de cambio actual para todos los pagos históricos
- Esto puede afectar los cálculos de balances en ARS
- **Recomendación**: Importa al menos un tipo de cambio por mes

---

## PASO 4: CUENTAS FINANCIERAS

### Descripción
Crea todas tus cuentas financieras (cajas, bancos, Mercado Pago, etc.) con sus saldos iniciales.

### Archivo CSV: `cuentas_financieras.csv`

### Campos Requeridos:
- `name` (OBLIGATORIO): Nombre de la cuenta
- `type` (OBLIGATORIO): Tipo de cuenta (ver valores permitidos abajo)
- `currency` (OBLIGATORIO): Moneda (ARS o USD)
- `initial_balance` (OBLIGATORIO): Saldo inicial al momento de la migración

### Campos Opcionales:
- `agency_name`: Nombre de la agencia (si tienes múltiples agencias)
- `account_number`: Número de cuenta bancaria
- `bank_name`: Nombre del banco
- `notes`: Notas adicionales

### Valores Permitidos para `type`:
- `CASH_ARS`: Caja efectivo en pesos
- `CASH_USD`: Caja efectivo en dólares
- `SAVINGS_ARS`: Caja de ahorro en pesos
- `SAVINGS_USD`: Caja de ahorro en dólares
- `CHECKING_ARS`: Cuenta corriente en pesos
- `CHECKING_USD`: Cuenta corriente en dólares
- `CREDIT_CARD`: Tarjeta de crédito
- `ASSETS`: Activos

### Ejemplo de Datos:
```csv
name,type,currency,initial_balance,agency_name,account_number,bank_name,notes
Caja Principal ARS,CASH_ARS,ARS,150000.00,Lozada Viajes,,,
Caja Principal USD,CASH_USD,USD,5000.00,Lozada Viajes,,,
Banco Santander Cuenta Corriente,CHECKING_ARS,ARS,500000.00,Lozada Viajes,1234567890,Santander,Cuenta principal
Mercado Pago,SAVINGS_ARS,ARS,25000.50,Lozada Viajes,,,
```

### Instrucciones:
1. Ve a **Configuración → Importar Datos**
2. Selecciona **"Cuentas Financieras"** (si está disponible)
3. O crea las cuentas manualmente desde **Caja → Resumen** → Botón "Nueva Cuenta"
4. **IMPORTANTE**: Configura el `initial_balance` correctamente, ya que este será el saldo base

### ⚠️ CRÍTICO:
- El `initial_balance` debe ser el saldo real de la cuenta al momento de la migración
- Todos los movimientos históricos se sumarán/restarán a este saldo inicial
- Si importas pagos históricos, estos afectarán el balance, así que el `initial_balance` debe ser el saldo ANTES de esos pagos

---

## PASO 5: OPERACIONES

### Descripción
Importa todas tus operaciones/ventas históricas.

### Archivo CSV: `operaciones.csv`

### Campos Requeridos:
- `destination` (OBLIGATORIO): Destino de la operación
- `departure_date` (OBLIGATORIO): Fecha de salida (formato: YYYY-MM-DD)
- `sale_amount` (OBLIGATORIO): Monto total de venta (número, sin símbolos)
- `operator_cost` (OBLIGATORIO): Costo del operador (número, sin símbolos)

### Campos Opcionales:
- `file_code`: Código de archivo único (ej: "OP-20240115-ABC123")
- `customer_email`: Email del cliente principal (debe existir en la tabla de clientes)
- `return_date`: Fecha de regreso (formato: YYYY-MM-DD)
- `origin`: Origen del viaje
- `adults`: Cantidad de adultos (número, default: 1)
- `children`: Cantidad de niños (número, default: 0)
- `infants`: Cantidad de bebés (número, default: 0)
- `currency`: Moneda (ARS o USD, default: ARS)
- `status`: Estado de la operación (RESERVED, CONFIRMED, CANCELLED, TRAVELLING, TRAVELLED)
- `seller_email`: Email del vendedor (debe existir en la tabla de usuarios)
- `operator_name`: Nombre del operador principal (debe existir en la tabla de operadores)
- `type`: Tipo de operación (FLIGHT, HOTEL, PACKAGE, CRUISE, TRANSFER, MIXED)
- `reservation_code_air`: Código de reserva aérea
- `reservation_code_hotel`: Código de reserva hotelera

### Ejemplo de Datos:
```csv
file_code,customer_email,destination,departure_date,return_date,adults,children,sale_amount,operator_cost,currency,status,seller_email,operator_name,type
OP-20240115-ABC123,juan@email.com,Cancún,2024-06-15,2024-06-22,2,0,150000.00,120000.00,ARS,CONFIRMED,admin@lozada.com,Despegar,PACKAGE
OP-20240120-XYZ789,maria@email.com,París,2024-07-01,2024-07-15,1,0,5000.00,4000.00,USD,RESERVED,admin@lozada.com,Aerolíneas Argentinas,FLIGHT
```

### Instrucciones:
1. Ve a **Configuración → Importar Datos**
2. Selecciona **"Operaciones"**
3. Sube el archivo `operaciones.csv`
4. Revisa el resumen de importación (verifica errores y advertencias)
5. Confirma la importación

### ⚠️ IMPORTANTE:
- El `customer_email` debe existir en la tabla de clientes (importado en Paso 2)
- El `seller_email` debe existir en la tabla de usuarios
- El `operator_name` debe existir en la tabla de operadores (importado en Paso 1)
- Si falta alguno, la operación se creará pero sin esas relaciones
- El sistema calculará automáticamente `margin_amount` y `margin_percentage`

### Verificación:
- Ve a **Operaciones** en el menú
- Verifica que las operaciones aparezcan correctamente
- Verifica que los clientes estén vinculados
- Verifica que los vendedores estén asignados

---

## PASO 6: RELACIÓN OPERACIONES-OPERADORES

### Descripción
Si una operación tiene múltiples operadores (ej: vuelo con un operador y hotel con otro), importa estas relaciones.

### Archivo CSV: `operaciones_operadores.csv`

### Campos Requeridos:
- `operation_file_code` (OBLIGATORIO): Código de archivo de la operación
- `operator_name` (OBLIGATORIO): Nombre del operador (debe existir)
- `cost` (OBLIGATORIO): Costo de este operador para esta operación

### Campos Opcionales:
- `cost_currency`: Moneda del costo (ARS o USD, default: ARS)
- `notes`: Notas adicionales

### Ejemplo de Datos:
```csv
operation_file_code,operator_name,cost,cost_currency,notes
OP-20240115-ABC123,Despegar,80000.00,ARS,Vuelo
OP-20240115-ABC123,Hoteles.com,40000.00,ARS,Hotel
OP-20240120-XYZ789,Aerolíneas Argentinas,4000.00,USD,Vuelo directo
```

### Instrucciones:
1. Ve a **Configuración → Importar Datos**
2. Selecciona **"Operaciones-Operadores"** (si está disponible)
3. O crea las relaciones manualmente desde cada operación

### ⚠️ NOTA:
- Si una operación tiene un solo operador, no necesitas este paso (ya se vinculó en Paso 5)
- Este paso es solo para operaciones con múltiples operadores

---

## PASO 7: PAGOS

### Descripción
Importa todos los pagos históricos (tanto de clientes como a operadores).

### Archivo CSV: `pagos.csv`

### Campos Requeridos:
- `operation_file_code` (OBLIGATORIO): Código de archivo de la operación (debe existir)
- `amount` (OBLIGATORIO): Monto del pago (número, sin símbolos)
- `currency` (OBLIGATORIO): Moneda (ARS o USD)
- `date_due` (OBLIGATORIO): Fecha de vencimiento (formato: YYYY-MM-DD)
- `direction` (OBLIGATORIO): Dirección (INCOME para cobranzas, EXPENSE para pagos a operadores)

### Campos Opcionales:
- `date_paid`: Fecha de pago (formato: YYYY-MM-DD). Si está presente, el pago se marcará como PAID
- `status`: Estado (PENDING, PAID, OVERDUE). Si `date_paid` está presente, se usará PAID
- `payer_type`: Tipo de pagador (CUSTOMER para cobranzas, OPERATOR para pagos a operadores). Se infiere de `direction` si no se especifica
- `method`: Método de pago (CASH, BANK, MP, USD, OTHER)
- `reference`: Referencia/comprobante del pago
- `exchange_rate`: Tipo de cambio usado (si el pago es en USD y la cuenta es en ARS)
- `financial_account_name`: Nombre de la cuenta financiera donde se registró el pago

### Ejemplo de Datos:
```csv
operation_file_code,amount,currency,date_due,date_paid,status,direction,payer_type,method,reference,exchange_rate,financial_account_name
OP-20240115-ABC123,50000.00,ARS,2024-01-20,2024-01-18,PAID,INCOME,CUSTOMER,BANK,Transferencia 123456,,
OP-20240115-ABC123,100000.00,ARS,2024-02-15,2024-02-10,PAID,INCOME,CUSTOMER,MP,Pago MP 789012,,
OP-20240115-ABC123,120000.00,ARS,2024-01-25,2024-01-24,PAID,EXPENSE,OPERATOR,BANK,Pago a Despegar,,
OP-20240120-XYZ789,2000.00,USD,2024-02-01,2024-01-28,PAID,INCOME,CUSTOMER,CASH,Recibo 001,950.00,Caja Principal USD
OP-20240120-XYZ789,2000.00,USD,2024-03-01,,PENDING,INCOME,CUSTOMER,,,,
```

### Instrucciones:
1. Ve a **Configuración → Importar Datos**
2. Selecciona **"Pagos"**
3. Sube el archivo `pagos.csv`
4. Revisa el resumen de importación (verifica errores)
5. Confirma la importación

### ⚠️ CRÍTICO:
- El `operation_file_code` DEBE existir (operación importada en Paso 5)
- Si el pago tiene `date_paid`, se creará automáticamente el movimiento contable (`ledger_movement`)
- Si el pago es en USD y la cuenta financiera es en ARS, DEBES proporcionar `exchange_rate`
- Si no proporcionas `financial_account_name`, el sistema intentará usar una cuenta por defecto, pero puede fallar

### Verificación:
- Ve a **Operaciones** → Selecciona una operación → Pestaña "Pagos"
- Verifica que los pagos aparezcan correctamente
- Ve a **Caja → Resumen**
- Verifica que los balances de las cuentas sean correctos
- Ve a **Contabilidad → Libro Mayor**
- Verifica que los movimientos contables se hayan creado

---

## PASO 8: VALIDACIÓN Y VERIFICACIÓN

### 8.1. Verificar Operaciones

1. Ve a **Operaciones**
2. Verifica que:
   - Todas las operaciones aparezcan
   - Los clientes estén vinculados correctamente
   - Los vendedores estén asignados
   - Los operadores estén vinculados
   - Los montos sean correctos

### 8.2. Verificar Pagos

1. Ve a **Operaciones** → Selecciona una operación → Pestaña "Pagos"
2. Verifica que:
   - Todos los pagos aparezcan
   - Los estados sean correctos (PAID, PENDING, etc.)
   - Las fechas sean correctas
   - Los montos sean correctos

### 8.3. Verificar Balances de Cuentas

1. Ve a **Caja → Resumen**
2. Verifica que:
   - Todas las cuentas aparezcan
   - Los saldos sean correctos
   - Los saldos coincidan con tus registros contables

### 8.4. Verificar Movimientos Contables

1. Ve a **Contabilidad → Libro Mayor**
2. Verifica que:
   - Los movimientos de ingresos aparezcan
   - Los movimientos de egresos aparezcan
   - Los conceptos sean correctos
   - Los montos sean correctos

### 8.5. Verificar Deudores por Ventas

1. Ve a **Contabilidad → Deudores por Ventas**
2. Verifica que:
   - Los clientes con deuda aparezcan
   - Los montos de deuda sean correctos
   - Los montos pagados sean correctos

### 8.6. Verificar Cuentas por Pagar

1. Ve a **Contabilidad → Pago a Operadores**
2. Verifica que:
   - Los operadores con deuda aparezcan
   - Los montos pendientes sean correctos
   - Los montos pagados sean correctos

---

## SOLUCIÓN DE PROBLEMAS

### Error: "Operación no encontrada" al importar pagos

**Causa**: El `operation_file_code` en el CSV de pagos no coincide con ningún código de operación.

**Solución**:
1. Verifica que las operaciones se hayan importado correctamente
2. Verifica que el `file_code` en el CSV de pagos sea exactamente igual al `file_code` de la operación
3. Los códigos son case-sensitive (mayúsculas/minúsculas importan)

### Error: "Cliente no encontrado" al importar operaciones

**Causa**: El `customer_email` en el CSV de operaciones no existe en la tabla de clientes.

**Solución**:
1. Verifica que el cliente se haya importado correctamente en Paso 2
2. Verifica que el email en el CSV de operaciones sea exactamente igual al email del cliente
3. Los emails son case-insensitive pero deben coincidir exactamente

### Error: "Operador no encontrado" al importar operaciones

**Causa**: El `operator_name` en el CSV de operaciones no existe en la tabla de operadores.

**Solución**:
1. Verifica que el operador se haya importado correctamente en Paso 1
2. Verifica que el nombre en el CSV de operaciones sea exactamente igual al nombre del operador
3. Los nombres son case-insensitive pero deben coincidir exactamente

### Error: "Vendedor no encontrado" al importar operaciones

**Causa**: El `seller_email` en el CSV de operaciones no existe en la tabla de usuarios.

**Solución**:
1. Verifica que el usuario/vendedor exista en el sistema
2. Verifica que el email en el CSV de operaciones sea exactamente igual al email del usuario
3. Si no especificas `seller_email`, se usará el usuario que está importando

### Error: "Cuenta financiera no encontrada" al importar pagos

**Causa**: El `financial_account_name` en el CSV de pagos no existe.

**Solución**:
1. Verifica que la cuenta financiera se haya creado correctamente en Paso 4
2. Verifica que el nombre en el CSV de pagos sea exactamente igual al nombre de la cuenta
3. Si no especificas `financial_account_name`, el sistema intentará usar una cuenta por defecto

### Los balances de las cuentas no coinciden

**Causa**: El `initial_balance` configurado no es correcto, o faltan pagos por importar.

**Solución**:
1. Verifica el `initial_balance` de cada cuenta (Paso 4)
2. El `initial_balance` debe ser el saldo ANTES de importar los pagos históricos
3. Verifica que todos los pagos se hayan importado correctamente
4. Verifica que los tipos de cambio sean correctos para pagos en USD

### Los movimientos contables no aparecen

**Causa**: Los pagos no tienen `date_paid`, por lo que no se generan movimientos contables automáticamente.

**Solución**:
1. Los movimientos contables se generan automáticamente cuando un pago tiene `date_paid`
2. Si un pago está PENDING, no genera movimiento contable hasta que se marque como pagado
3. Para pagos históricos, asegúrate de incluir `date_paid` en el CSV

---

## 📝 CHECKLIST FINAL

Antes de considerar la migración completa, verifica:

- [ ] Todos los operadores importados
- [ ] Todos los clientes importados
- [ ] Todas las operaciones importadas
- [ ] Todos los pagos importados
- [ ] Todas las cuentas financieras creadas con saldos iniciales correctos
- [ ] Tipos de cambio históricos importados (si aplica)
- [ ] Balances de cuentas verificados y correctos
- [ ] Movimientos contables verificados
- [ ] Deudores por ventas verificados
- [ ] Cuentas por pagar verificadas
- [ ] No hay errores en los reportes
- [ ] Los cálculos de comisiones son correctos (si aplica)

---

## 🆘 SOPORTE

Si encuentras problemas durante la migración:

1. Revisa esta guía completa
2. Revisa la sección de "Solución de Problemas"
3. Verifica los logs del sistema
4. Contacta al equipo de desarrollo con:
   - Descripción del problema
   - Archivo CSV que estás intentando importar (sin datos sensibles)
   - Mensaje de error completo
   - Capturas de pantalla

---

## 📌 NOTAS FINALES

- **Tómate tu tiempo**: Una migración bien hecha es mejor que una rápida con errores
- **Haz backups**: Guarda copias de todos los CSVs antes de importar
- **Verifica paso a paso**: No pases al siguiente paso hasta verificar que el anterior esté correcto
- **Prueba con pocos datos primero**: Si tienes muchos datos, prueba primero con 10-20 registros
- **Documenta problemas**: Si encuentras problemas, anótalos para referencia futura

¡Éxito con la migración! 🚀
