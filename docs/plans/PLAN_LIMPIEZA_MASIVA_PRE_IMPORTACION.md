# Plan de Acción: Limpieza Masiva Pre-Importación

**Objetivo:** Limpiar completamente el sistema antes de importar datos históricos reales, manteniendo intactos los leads de Trello y ManyChat.

**Fecha:** 2025-01-22

---

## ⚠️ IMPORTANTE: BACKUP PRIMERO

**ANTES DE HACER CUALQUIER COSA:**
1. Hacer backup completo de la base de datos Supabase
2. Exportar todos los datos a JSON/CSV como respaldo
3. Verificar que el backup se puede restaurar

---

## 📋 TABLAS A MANTENER (NO TOCAR)

### 1. Leads de Trello y ManyChat
- **Tabla:** `leads`
- **Condición:** Solo mantener leads donde `source IN ('Trello', 'Manychat')`
- **Campos relacionados a mantener:**
  - `external_id` (ID de Trello/ManyChat)
  - `trello_url`
  - `trello_list_id`
  - `trello_full_data` (JSONB completo de Trello)
  - `manychat_full_data` (JSONB completo de ManyChat)
  - `list_name` (nombre de lista para visualización)
  - Todos los demás campos del lead

### 2. Configuración de Integraciones
- **Tabla:** `integrations` - **NO TOCAR** (contiene config de Trello y ManyChat)
- **Tabla:** `integration_logs` - **NO TOCAR** (logs de sincronización)
- **Tabla:** `integration_webhooks` - **NO TOCAR** (webhooks recibidos)
- **Tabla:** `settings_trello` - **NO TOCAR** (configuración de Trello por agencia)
- **Tabla:** `manychat_list_order` - **NO TOCAR** (si existe, orden de listas de ManyChat)

### 3. Estructura Base (Opcional - mantener si querés conservar estructura)
- **Tabla:** `agencies` - **MANTENER** (estructura de agencias)
- **Tabla:** `chart_of_accounts` - **MANTENER** (plan de cuentas contable - estructura)
- **Tabla:** `recurring_payment_categories` - **MANTENER** (categorías - estructura)

---

## 🗑️ TABLAS A ELIMINAR COMPLETAMENTE

### Fase 1: Datos Financieros y Contables (Dependen de operaciones)
1. `ledger_movements` - Movimientos contables
2. `cash_movements` - Movimientos de caja
3. `operator_payments` - Pagos a operadores
4. `payments` - Pagos de clientes y a operadores
5. `financial_accounts` - Cuentas financieras (CUIDADO: algunos leads pueden tener `deposit_account_id`)
6. `iva_sales` - IVA de ventas
7. `iva_purchases` - IVA de compras
8. `monthly_exchange_rates` - Tipos de cambio mensuales
9. `exchange_rates` - Tipos de cambio históricos (opcional, puede mantener estructura)

### Fase 2: Operaciones y Relaciones
10. `operation_customers` - Relación operaciones-clientes
11. `operation_operators` - Relación operaciones-operadores múltiples
12. `operations` - Operaciones principales
13. `quotations` - Cotizaciones
14. `quotation_items` - Items de cotizaciones (si existe)

### Fase 3: Clientes (excepto los vinculados a leads de Trello/ManyChat)
15. `customers` - **ELIMINAR PARCIALMENTE**: Solo eliminar clientes que NO están vinculados a leads de Trello/ManyChat
16. `customer_interactions` - Interacciones con clientes
17. `customer_segments` - Segmentos de clientes (estructura puede mantenerse)

### Fase 4: Documentos y Archivos
18. `documents` - Documentos (pasaportes, DNIs, vouchers, etc.)
19. `notes` - Notas del sistema

### Fase 5: Alertas y Notificaciones
20. `alerts` - **ELIMINAR PARCIALMENTE**: Solo eliminar alertas relacionadas con operaciones/pagos, mantener las de leads si existen
21. `whatsapp_messages` - Mensajes de WhatsApp generados

### Fase 6: Comisiones y Pagos
22. `commission_records` - Registros de comisiones
23. `commission_rules` - Reglas de comisiones (estructura puede mantenerse)
24. `partner_accounts` - Cuentas de socios
25. `partner_profit_allocations` - Asignaciones de ganancias

### Fase 7: Facturas y Billing
26. `invoices` - Facturas AFIP
27. `invoice_items` - Items de facturas
28. `billing_info` - Información de facturación

### Fase 8: Gastos Recurrentes
29. `recurring_payments` - Gastos recurrentes (datos, no estructura)

### Fase 9: Usuarios y Permisos
30. `user_agencies` - Relación usuarios-agencias
31. `users` - **ELIMINAR PARCIALMENTE**: Mantener solo usuarios admin básicos necesarios para el sistema
32. `teams` - Equipos (si no están relacionados con leads)
33. `team_members` - Miembros de equipos

### Fase 10: Operadores
34. `operators` - Operadores/proveedores

### Fase 11: Otros
35. `communications` - Comunicaciones
36. `destination_requirements` - Requisitos por destino (estructura puede mantenerse)
37. `emilia_conversations` - Conversaciones de Emilia/Cerebro (opcional)
38. `emilia_messages` - Mensajes de Emilia (opcional)
39. `audit_logs` - Logs de auditoría (opcional, puede limpiarse)
40. `pdf_templates` - Plantillas PDF (estructura puede mantenerse)
41. `tools_settings` - Configuración de herramientas (estructura puede mantenerse)
42. `operation_settings` - Configuración de operaciones (estructura puede mantenerse)
43. `customer_settings` - Configuración de clientes (estructura puede mantenerse)
44. `financial_settings` - Configuración financiera (estructura puede mantenerse)
45. `lead_comments` - Comentarios de leads (mantener solo los de Trello/ManyChat)

---

## 🔄 ORDEN DE ELIMINACIÓN (Respetar Foreign Keys)

### Paso 1: Preparación
```sql
-- 1.1. Verificar leads de Trello/ManyChat que se mantienen
SELECT COUNT(*) FROM leads WHERE source IN ('Trello', 'Manychat');

-- 1.2. Identificar clientes vinculados a leads de Trello/ManyChat (si aplica)
-- Nota: Los leads no tienen relación directa con customers, pero verificar si hay alguna relación indirecta
```

### Paso 2: Eliminar Datos Financieros (Dependen de operaciones)
```sql
-- 2.1. Eliminar movimientos contables
DELETE FROM ledger_movements;

-- 2.2. Eliminar movimientos de caja
DELETE FROM cash_movements;

-- 2.3. Eliminar pagos a operadores
DELETE FROM operator_payments;

-- 2.4. Eliminar pagos
DELETE FROM payments;

-- 2.5. Eliminar IVA
DELETE FROM iva_sales;
DELETE FROM iva_purchases;

-- 2.6. Eliminar tipos de cambio (opcional, puede mantener estructura)
DELETE FROM monthly_exchange_rates;
DELETE FROM exchange_rates;
```

### Paso 3: Eliminar Operaciones y Relaciones
```sql
-- 3.1. Eliminar relaciones operaciones-clientes
DELETE FROM operation_customers;

-- 3.2. Eliminar relaciones operaciones-operadores
DELETE FROM operation_operators;

-- 3.3. Eliminar operaciones
DELETE FROM operations;

-- 3.4. Eliminar cotizaciones
DELETE FROM quotation_items; -- Si existe
DELETE FROM quotations;
```

### Paso 4: Limpiar Leads (Mantener solo Trello/ManyChat)
```sql
-- 4.1. Eliminar leads que NO son de Trello ni ManyChat
DELETE FROM leads WHERE source NOT IN ('Trello', 'Manychat');

-- 4.2. Limpiar campos de leads que quedan (si tienen referencias a operaciones eliminadas)
UPDATE leads 
SET lead_id = NULL, 
    operation_id = NULL,
    deposit_account_id = NULL
WHERE source IN ('Trello', 'Manychat');
```

### Paso 5: Eliminar Clientes (Solo los no vinculados a leads mantenidos)
```sql
-- 5.1. Identificar clientes a eliminar
-- Nota: Como los leads no tienen relación directa con customers, 
-- podemos eliminar todos los clientes que no están en operation_customers
-- (pero ya eliminamos operation_customers, así que podemos eliminar todos)

-- 5.2. Eliminar interacciones de clientes
DELETE FROM customer_interactions;

-- 5.3. Eliminar clientes
DELETE FROM customers;
```

### Paso 6: Eliminar Documentos
```sql
-- 6.1. Eliminar documentos
DELETE FROM documents;
```

### Paso 7: Limpiar Alertas
```sql
-- 7.1. Eliminar alertas relacionadas con operaciones/pagos
DELETE FROM alerts 
WHERE operation_id IS NOT NULL 
   OR type IN ('PAYMENT_DUE', 'OPERATOR_DUE', 'UPCOMING_TRIP');

-- 7.2. Mantener alertas de leads si existen (opcional)
```

### Paso 8: Eliminar Comisiones y Pagos
```sql
-- 8.1. Eliminar registros de comisiones
DELETE FROM commission_records;

-- 8.2. Eliminar asignaciones de ganancias
DELETE FROM partner_profit_allocations;

-- 8.3. Eliminar cuentas de socios
DELETE FROM partner_accounts;
```

### Paso 9: Eliminar Facturas
```sql
-- 9.1. Eliminar items de facturas
DELETE FROM invoice_items;

-- 9.2. Eliminar facturas
DELETE FROM invoices;

-- 9.3. Eliminar información de facturación
DELETE FROM billing_info;
```

### Paso 10: Eliminar Gastos Recurrentes
```sql
-- 10.1. Eliminar gastos recurrentes (mantener categorías)
DELETE FROM recurring_payments;
```

### Paso 11: Limpiar Usuarios
```sql
-- 11.1. Eliminar relaciones usuarios-agencias (excepto admin básico)
-- Primero identificar usuarios admin a mantener
-- Luego eliminar relaciones de otros usuarios
DELETE FROM user_agencies 
WHERE user_id NOT IN (
  SELECT id FROM users 
  WHERE role IN ('SUPER_ADMIN', 'ADMIN') 
  AND email IN ('admin@erplozada.com', 'tu-email@ejemplo.com') -- Ajustar emails
);

-- 11.2. Eliminar usuarios (excepto admin básico)
DELETE FROM users 
WHERE id NOT IN (
  SELECT id FROM users 
  WHERE role IN ('SUPER_ADMIN', 'ADMIN') 
  AND email IN ('admin@erplozada.com', 'tu-email@ejemplo.com') -- Ajustar emails
);

-- 11.3. Eliminar equipos
DELETE FROM team_members;
DELETE FROM teams;
```

### Paso 12: Eliminar Operadores
```sql
-- 12.1. Eliminar operadores
DELETE FROM operators;
```

### Paso 13: Eliminar Otros
```sql
-- 13.1. Eliminar comunicaciones
DELETE FROM communications;

-- 13.2. Eliminar mensajes de WhatsApp
DELETE FROM whatsapp_messages;

-- 13.3. Eliminar conversaciones de Emilia (opcional)
DELETE FROM emilia_messages;
DELETE FROM emilia_conversations;

-- 13.4. Limpiar logs de auditoría (opcional)
DELETE FROM audit_logs;

-- 13.5. Limpiar comentarios de leads (solo los no relacionados con Trello/ManyChat)
-- Los comentarios de leads de Trello/ManyChat se mantienen automáticamente
-- porque los leads se mantienen
```

### Paso 14: Limpiar Cuentas Financieras
```sql
-- 14.1. IMPORTANTE: Primero limpiar referencias en leads
UPDATE leads SET deposit_account_id = NULL WHERE source IN ('Trello', 'Manychat');

-- 14.2. Eliminar cuentas financieras
DELETE FROM financial_accounts;
```

---

## 📝 SCRIPT SQL COMPLETO (Para Ejecutar en Orden)

```sql
-- =====================================================
-- LIMPIEZA MASIVA PRE-IMPORTACIÓN
-- Mantiene: Leads de Trello y ManyChat + Integraciones
-- =====================================================

BEGIN;

-- Verificar cantidad de leads a mantener
SELECT 'Leads a mantener (Trello/ManyChat):' as info, COUNT(*) as cantidad 
FROM leads WHERE source IN ('Trello', 'Manychat');

-- FASE 1: Datos Financieros
DELETE FROM ledger_movements;
DELETE FROM cash_movements;
DELETE FROM operator_payments;
DELETE FROM payments;
DELETE FROM iva_sales;
DELETE FROM iva_purchases;
DELETE FROM monthly_exchange_rates;
DELETE FROM exchange_rates;

-- FASE 2: Operaciones
DELETE FROM operation_customers;
DELETE FROM operation_operators;
DELETE FROM operations;
DELETE FROM quotation_items; -- Si existe
DELETE FROM quotations;

-- FASE 3: Limpiar Leads (mantener solo Trello/ManyChat)
DELETE FROM leads WHERE source NOT IN ('Trello', 'Manychat');
UPDATE leads SET deposit_account_id = NULL WHERE source IN ('Trello', 'Manychat');

-- FASE 4: Clientes
DELETE FROM customer_interactions;
DELETE FROM customers;

-- FASE 5: Documentos
DELETE FROM documents;

-- FASE 6: Alertas (solo las relacionadas con operaciones)
DELETE FROM alerts 
WHERE operation_id IS NOT NULL 
   OR type IN ('PAYMENT_DUE', 'OPERATOR_DUE', 'UPCOMING_TRIP');

-- FASE 7: Comisiones
DELETE FROM commission_records;
DELETE FROM partner_profit_allocations;
DELETE FROM partner_accounts;

-- FASE 8: Facturas
DELETE FROM invoice_items;
DELETE FROM invoices;
DELETE FROM billing_info;

-- FASE 9: Gastos Recurrentes
DELETE FROM recurring_payments;

-- FASE 10: Usuarios (mantener solo admin básico)
-- AJUSTAR EMAILS SEGÚN NECESIDAD
DELETE FROM user_agencies 
WHERE user_id NOT IN (
  SELECT id FROM users 
  WHERE role IN ('SUPER_ADMIN', 'ADMIN') 
  AND email IN ('admin@erplozada.com') -- CAMBIAR POR EMAIL REAL
);

DELETE FROM users 
WHERE id NOT IN (
  SELECT id FROM users 
  WHERE role IN ('SUPER_ADMIN', 'ADMIN') 
  AND email IN ('admin@erplozada.com') -- CAMBIAR POR EMAIL REAL
);

DELETE FROM team_members;
DELETE FROM teams;

-- FASE 11: Operadores
DELETE FROM operators;

-- FASE 12: Otros
DELETE FROM communications;
DELETE FROM whatsapp_messages;
DELETE FROM emilia_messages;
DELETE FROM emilia_conversations;
DELETE FROM audit_logs;

-- FASE 13: Cuentas Financieras (después de limpiar referencias)
DELETE FROM financial_accounts;

-- Verificar resultado
SELECT 'Leads mantenidos:' as info, COUNT(*) as cantidad 
FROM leads WHERE source IN ('Trello', 'Manychat');

COMMIT;
```

---

## ✅ CHECKLIST PRE-EJECUCIÓN

- [ ] Backup completo de la base de datos realizado
- [ ] Backup verificado (restauración de prueba)
- [ ] Emails de usuarios admin a mantener identificados
- [ ] Leads de Trello/ManyChat verificados (cantidad aproximada)
- [ ] Integraciones verificadas (Trello y ManyChat activas)
- [ ] Equipo notificado de la limpieza
- [ ] Horario de mantenimiento programado

---

## ✅ CHECKLIST POST-EJECUCIÓN

- [ ] Verificar que leads de Trello/ManyChat se mantuvieron
- [ ] Verificar que integraciones se mantuvieron
- [ ] Verificar que usuarios admin se mantuvieron
- [ ] Verificar que no quedan operaciones
- [ ] Verificar que no quedan clientes
- [ ] Verificar que no quedan pagos
- [ ] Verificar que no quedan movimientos contables
- [ ] Verificar que no quedan cuentas financieras
- [ ] Probar sincronización de Trello
- [ ] Probar sincronización de ManyChat
- [ ] Sistema listo para importación

---

## 🔄 REVERSIÓN (Si algo sale mal)

Si necesitás revertir la limpieza:
1. Restaurar backup completo de la base de datos
2. Verificar que todos los datos se restauraron correctamente
3. Revisar logs para identificar qué salió mal

---

## 📌 NOTAS IMPORTANTES

1. **Leads de Trello/ManyChat:** Se mantienen completamente, incluyendo todos sus campos (`trello_full_data`, `manychat_full_data`, `external_id`, etc.)

2. **Integraciones:** Las configuraciones de Trello y ManyChat en `integrations` y `settings_trello` se mantienen intactas.

3. **Agencias:** Se mantienen las agencias (estructura), pero se pueden limpiar si no son necesarias.

4. **Plan de Cuentas:** Se mantiene `chart_of_accounts` (estructura contable), pero se pueden limpiar las cuentas si no son necesarias.

5. **Usuarios Admin:** Asegurarse de mantener al menos un usuario SUPER_ADMIN para poder acceder al sistema después de la limpieza.

6. **Foreign Keys:** El orden de eliminación respeta las foreign keys. Si hay algún error, revisar las dependencias.

---

## 🚀 PRÓXIMOS PASOS DESPUÉS DE LA LIMPIEZA

1. Verificar que el sistema funciona correctamente
2. Probar sincronización de Trello
3. Probar sincronización de ManyChat
4. Preparar script de importación de datos históricos
5. Ejecutar importación en ambiente de prueba primero
6. Validar datos importados
7. Ejecutar importación en producción

---

**Última actualización:** 2025-01-22
