# 📊 Guía de Migración de Datos

Esta guía explica cómo migrar datos existentes a MAXEVA GESTION, incluyendo clientes, operaciones, pagos y otros datos históricos.

## 🎯 Preparación Pre-Migración

### 1. Revisar Estructura de Datos Actual

Antes de migrar, identifica qué datos necesitas importar:

- ✅ **Clientes**: Nombres, emails, teléfonos, documentos
- ✅ **Operaciones**: Viajes históricos, estados, montos
- ✅ **Pagos**: Historial de pagos recibidos y realizados
- ✅ **Operadores**: Mayoristas y proveedores
- ✅ **Agencias**: Si manejan múltiples agencias
- ✅ **Usuarios**: Vendedores y administradores

### 2. Preparar Archivos de Datos

#### Formato Recomendado: CSV

Los archivos CSV deben seguir este formato:

**Clientes** (`clientes.csv`):
```csv
first_name,last_name,email,phone,document_type,document_number
Juan,Pérez,juan@ejemplo.com,+54 11 1234-5678,DNI,12345678
María,González,maria@ejemplo.com,+54 11 9876-5432,PASAPORTE,AB123456
```

**Operaciones** (`operaciones.csv`):
```csv
file_code,destination,operation_date,departure_date,return_date,sale_amount_total,operator_cost,currency,status,agency_name,seller_email
OP-2024-001,Cancún,2024-01-15,2024-02-01,2024-02-08,2500,2000,USD,CONFIRMED,Rosario,juan@ejemplo.com
OP-2024-002,Disney,2024-01-20,2024-03-15,2024-03-22,3500,2800,USD,CLOSED,Madero,maria@ejemplo.com
```

**Pagos** (`pagos.csv`):
```csv
operation_file_code,amount,currency,date_paid,direction,payer_type,method
OP-2024-001,1250,USD,2024-01-20,INCOME,CUSTOMER,TRANSFER
OP-2024-001,1250,USD,2024-02-01,INCOME,CUSTOMER,CASH
```

### 3. Validar Datos

Antes de importar, verifica:

- ✅ **Formato de fechas**: YYYY-MM-DD
- ✅ **Montos**: Solo números, sin símbolos de moneda
- ✅ **Emails**: Formato válido
- ✅ **Teléfonos**: Incluir código de país
- ✅ **Referencias**: Códigos de operaciones únicos

## 📥 Proceso de Importación

### Opción 1: Importación Manual (Pequeños Volúmenes)

Para menos de 50 registros, puedes importar manualmente usando la interfaz:

1. **Importar Clientes**:
   - Ve a **Clientes** → **Nuevo Cliente**
   - Completa los datos manualmente
   - Repite para cada cliente

2. **Importar Operaciones**:
   - Ve a **Operaciones** → **Nueva Operación**
   - Completa todos los campos requeridos
   - Asocia clientes existentes

### Opción 2: Script de Importación (Volúmenes Medianos)

Para 50-500 registros, usa scripts SQL directos:

#### Importar Clientes

```sql
INSERT INTO customers (first_name, last_name, email, phone, document_type, document_number, created_at, updated_at)
VALUES 
  ('Juan', 'Pérez', 'juan@ejemplo.com', '+54 11 1234-5678', 'DNI', '12345678', NOW(), NOW()),
  ('María', 'González', 'maria@ejemplo.com', '+54 11 9876-5432', 'PASAPORTE', 'AB123456', NOW(), NOW());
```

#### Importar Operaciones

```sql
-- Primero obtener IDs de agencias y vendedores
SELECT id, name FROM agencies;
SELECT id, email FROM users WHERE role = 'SELLER';

-- Luego insertar operaciones
INSERT INTO operations (
  file_code, destination, operation_date, departure_date, return_date,
  sale_amount_total, operator_cost, currency, status, agency_id, seller_id,
  created_at, updated_at
)
VALUES 
  ('OP-2024-001', 'Cancún', '2024-01-15', '2024-02-01', '2024-02-08', 
   2500, 2000, 'USD', 'CONFIRMED', 'agency-id-1', 'seller-id-1', NOW(), NOW());
```

### Opción 3: API de Importación (Volúmenes Grandes)

Para más de 500 registros, contacta al equipo de desarrollo para un script de importación personalizado.

## ✅ Validación de Datos

### Verificaciones Post-Importación

Después de importar, verifica:

1. **Conteo de Registros**:
   ```sql
   SELECT COUNT(*) FROM customers;
   SELECT COUNT(*) FROM operations;
   SELECT COUNT(*) FROM payments;
   ```

2. **Datos Faltantes**:
   ```sql
   -- Operaciones sin cliente asociado
   SELECT o.* FROM operations o
   LEFT JOIN operation_customers oc ON o.id = oc.operation_id
   WHERE oc.id IS NULL;
   ```

3. **Datos Inválidos**:
   ```sql
   -- Operaciones con fechas inválidas
   SELECT * FROM operations 
   WHERE departure_date < operation_date;
   
   -- Pagos con montos negativos
   SELECT * FROM payments WHERE amount < 0;
   ```

### Validaciones Automáticas

El sistema tiene validaciones automáticas que previenen:
- ❌ Fechas futuras en `operation_date` y `date_paid`
- ❌ Montos negativos
- ❌ `departure_date` antes de `operation_date`
- ❌ `date_due` antes de `date_paid`

## 🔧 Errores Comunes y Soluciones

### Error: "Duplicate key violation"

**Causa**: Intentando importar un registro con un código/ID que ya existe.

**Solución**:
- Verifica que los códigos sean únicos
- Si es una re-importación, elimina los registros existentes primero
- O actualiza en lugar de insertar

### Error: "Foreign key constraint violation"

**Causa**: Referencia a un registro que no existe (ej: `agency_id` inexistente).

**Solución**:
1. Verifica que todas las agencias existan antes de importar operaciones
2. Verifica que todos los usuarios existan antes de asignarlos
3. Importa en este orden: Agencias → Usuarios → Operadores → Clientes → Operaciones → Pagos

### Error: "Invalid date format"

**Causa**: Formato de fecha incorrecto.

**Solución**:
- Usa formato ISO: `YYYY-MM-DD`
- Asegúrate de que las fechas sean válidas (ej: no 31 de febrero)

### Error: "Missing required field"

**Causa**: Campo requerido está vacío o NULL.

**Solución**:
- Verifica que todos los campos requeridos estén presentes
- Para campos opcionales, usa valores por defecto apropiados

## 📋 Checklist de Migración

Usa este checklist para asegurar una migración exitosa:

### Pre-Migración
- [ ] Datos validados y limpiados
- [ ] Archivos CSV preparados con formato correcto
- [ ] Backup de base de datos actual realizado
- [ ] Usuarios y agencias creados en MAXEVA GESTION

### Migración
- [ ] Operadores importados
- [ ] Clientes importados
- [ ] Operaciones importadas
- [ ] Pagos importados
- [ ] Relaciones (operation_customers) creadas

### Post-Migración
- [ ] Conteo de registros verificado
- [ ] Datos inválidos corregidos
- [ ] KPIs del dashboard verificados
- [ ] Usuarios pueden ver sus datos correctamente
- [ ] Permisos y filtros funcionando

## 🔄 Limpieza de Datos de Prueba

Si necesitas limpiar datos de desarrollo/prueba antes de la migración:

```sql
-- ⚠️ CUIDADO: Esto elimina TODOS los datos
-- Ejecuta solo si estás seguro

-- Eliminar en orden (respetar foreign keys)
DELETE FROM commission_records;
DELETE FROM payments;
DELETE FROM operation_customers;
DELETE FROM documents;
DELETE FROM alerts;
DELETE FROM operations;
DELETE FROM customers;
DELETE FROM leads;
DELETE FROM operators;
DELETE FROM user_agencies;
DELETE FROM users WHERE role != 'SUPER_ADMIN';
```

**Nota**: No elimines:
- ✅ Agencias (necesarias para la estructura)
- ✅ Configuración de Trello
- ✅ Usuario SUPER_ADMIN
- ✅ Reglas de comisiones (si las tienes configuradas)

## 📞 Soporte

Si encuentras problemas durante la migración:

1. **Revisa esta guía** primero
2. **Verifica los logs** del sistema
3. **Haz un backup** antes de continuar
4. **Contacta al equipo** con:
   - Descripción del problema
   - Cantidad de registros intentando importar
   - Mensajes de error completos
   - Screenshots si aplica

## 🎓 Mejores Prácticas

1. **Haz backups regulares** durante la migración
2. **Importa en pequeños batches** (100-200 registros a la vez)
3. **Valida después de cada batch** antes de continuar
4. **Documenta cualquier transformación** de datos realizada
5. **Prueba con datos de muestra** antes de la migración completa

---

**Última actualización**: Diciembre 2025

