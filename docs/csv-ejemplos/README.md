# 📁 Archivos CSV de Ejemplo para Migración

Esta carpeta contiene archivos CSV de ejemplo para guiarte en la preparación de tus datos para la migración.

## 📋 Archivos Disponibles

### 1. `operadores.csv`
**Descripción**: Lista de operadores/proveedores mayoristas

**Campos**:
- `name` (OBLIGATORIO): Nombre del operador
- `contact_name`: Nombre del contacto
- `contact_email`: Email del contacto
- `contact_phone`: Teléfono del contacto
- `credit_limit`: Límite de crédito (número)

**Orden de importación**: 1

---

### 2. `clientes.csv`
**Descripción**: Lista de clientes/pasajeros

**Campos**:
- `first_name` (OBLIGATORIO): Nombre
- `last_name` (OBLIGATORIO): Apellido
- `phone` (OBLIGATORIO): Teléfono
- `email`: Email (recomendado para vincular con operaciones)
- `document_type`: Tipo de documento (DNI, PASSPORT)
- `document_number`: Número de documento
- `date_of_birth`: Fecha de nacimiento (YYYY-MM-DD)
- `nationality`: Nacionalidad
- `instagram_handle`: Usuario de Instagram (sin @)
- `address`: Dirección
- `city`: Ciudad

**Orden de importación**: 2

---

### 3. `tipos_cambio.csv`
**Descripción**: Tipos de cambio históricos (opcional pero recomendado)

**Campos**:
- `rate_date` (OBLIGATORIO): Fecha (YYYY-MM-DD)
- `rate` (OBLIGATORIO): Tipo de cambio (ARS por 1 USD)
- `source`: Fuente (BCRA, MEP, CCL)
- `notes`: Notas

**Orden de importación**: 3 (opcional)

---

### 4. `cuentas_financieras.csv`
**Descripción**: Cuentas financieras (cajas, bancos, etc.)

**Campos**:
- `name` (OBLIGATORIO): Nombre de la cuenta
- `type` (OBLIGATORIO): Tipo (CASH_ARS, CASH_USD, SAVINGS_ARS, SAVINGS_USD, CHECKING_ARS, CHECKING_USD, CREDIT_CARD, ASSETS)
- `currency` (OBLIGATORIO): Moneda (ARS o USD)
- `initial_balance` (OBLIGATORIO): Saldo inicial
- `agency_name`: Nombre de la agencia
- `account_number`: Número de cuenta bancaria
- `bank_name`: Nombre del banco
- `notes`: Notas

**Orden de importación**: 4

---

### 5. `operaciones.csv`
**Descripción**: Operaciones/ventas históricas

**Campos**:
- `destination` (OBLIGATORIO): Destino
- `departure_date` (OBLIGATORIO): Fecha salida (YYYY-MM-DD)
- `sale_amount` (OBLIGATORIO): Monto de venta
- `operator_cost` (OBLIGATORIO): Costo del operador
- `file_code`: Código único de archivo
- `customer_email`: Email del cliente (debe existir)
- `return_date`: Fecha regreso (YYYY-MM-DD)
- `origin`: Origen
- `adults`: Cantidad adultos (default: 1)
- `children`: Cantidad niños (default: 0)
- `infants`: Cantidad bebés (default: 0)
- `currency`: Moneda (ARS o USD, default: ARS)
- `status`: Estado (RESERVED, CONFIRMED, CANCELLED, TRAVELLING, TRAVELLED)
- `seller_email`: Email del vendedor (debe existir)
- `operator_name`: Nombre del operador (debe existir)
- `type`: Tipo (FLIGHT, HOTEL, PACKAGE, CRUISE, TRANSFER, MIXED)
- `reservation_code_air`: Código de reserva aérea
- `reservation_code_hotel`: Código de reserva hotelera

**Orden de importación**: 5

---

### 6. `operaciones_operadores.csv`
**Descripción**: Relación múltiple entre operaciones y operadores (solo si una operación tiene múltiples operadores)

**Campos**:
- `operation_file_code` (OBLIGATORIO): Código de archivo de la operación
- `operator_name` (OBLIGATORIO): Nombre del operador
- `cost` (OBLIGATORIO): Costo de este operador
- `cost_currency`: Moneda del costo (ARS o USD, default: ARS)
- `notes`: Notas

**Orden de importación**: 6 (opcional, solo si hay múltiples operadores por operación)

---

### 7. `pagos.csv`
**Descripción**: Pagos históricos (cobranzas y pagos a operadores)

**Campos**:
- `operation_file_code` (OBLIGATORIO): Código de archivo de la operación (debe existir)
- `amount` (OBLIGATORIO): Monto del pago
- `currency` (OBLIGATORIO): Moneda (ARS o USD)
- `date_due` (OBLIGATORIO): Fecha de vencimiento (YYYY-MM-DD)
- `direction` (OBLIGATORIO): Dirección (INCOME para cobranzas, EXPENSE para pagos)
- `date_paid`: Fecha de pago (YYYY-MM-DD). Si está presente, el pago se marca como PAID
- `status`: Estado (PENDING, PAID, OVERDUE)
- `payer_type`: Tipo (CUSTOMER para cobranzas, OPERATOR para pagos)
- `method`: Método (CASH, BANK, MP, USD, OTHER)
- `reference`: Referencia/comprobante
- `exchange_rate`: Tipo de cambio (si el pago es USD y la cuenta es ARS)
- `financial_account_name`: Nombre de la cuenta financiera

**Orden de importación**: 7

---

## 📝 Notas Importantes

1. **Formato de fechas**: Todas las fechas deben estar en formato `YYYY-MM-DD` (ej: 2024-01-15)

2. **Formato de números**: Los montos deben ser números sin símbolos (ej: 150000.00, no $150.000,00)

3. **Emails**: Los emails son case-insensitive pero deben coincidir exactamente entre archivos

4. **Nombres**: Los nombres de operadores son case-insensitive pero deben coincidir exactamente

5. **Códigos de archivo**: Los códigos de archivo son case-sensitive (mayúsculas/minúsculas importan)

6. **Valores permitidos**: Revisa la guía completa para ver todos los valores permitidos en cada campo

7. **Backup**: Siempre guarda una copia de tus CSVs antes de importar

---

## 🚀 Cómo Usar

1. Descarga estos archivos CSV de ejemplo
2. Abre cada archivo en Excel, Google Sheets o tu editor de CSV preferido
3. Completa con tus datos reales
4. Guarda como CSV (UTF-8)
5. Sigue el orden de importación indicado en `GUIA_MIGRACION_DATOS.md`
6. Importa desde **Configuración → Importar Datos** en el sistema

---

## ⚠️ Advertencias

- **No modifiques los nombres de las columnas**
- **No agregues columnas que no estén en el ejemplo**
- **Verifica que los datos estén correctamente formateados antes de importar**
- **Prueba primero con pocos registros (10-20) antes de importar todo**

---

Para más información, consulta: `../GUIA_MIGRACION_DATOS.md`
