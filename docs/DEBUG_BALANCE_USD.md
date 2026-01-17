# 🔍 Debug: Balance USD incorrecto

## Problema Reportado

- Ingreso de 1000 USD en efectivo
- Retiro de Maxi de 100 USD
- Balance esperado: **900 USD**
- Balance mostrado: **-100 USD**

## Diagnóstico

El problema puede ser que el ingreso y el retiro están en **cuentas financieras diferentes**.

### Verificación

Para verificar si ambos movimientos están en la misma cuenta:

```sql
-- Ver movimientos USD recientes
SELECT 
  lm.id,
  lm.type,
  lm.concept,
  lm.amount_original,
  lm.currency,
  lm.created_at,
  fa.id as account_id,
  fa.name as account_name,
  fa.type as account_type,
  fa.currency as account_currency
FROM ledger_movements lm
JOIN financial_accounts fa ON lm.account_id = fa.id
WHERE fa.currency = 'USD'
  AND fa.type = 'CASH_USD'
ORDER BY lm.created_at DESC
LIMIT 10;
```

### Solución Aplicada

**Commit:** `fix: asegurar que getOrCreateDefaultAccount siempre devuelva la misma cuenta`

**Cambios:**
1. Ordenar por `created_at ASC` en `getOrCreateDefaultAccount` para siempre devolver la misma cuenta (la más antigua)
2. Filtrar por `is_active = true` para solo usar cuentas activas

**Resultado esperado:**
- Todos los pagos USD en efectivo usarán la misma cuenta `CASH_USD`
- Todos los retiros USD en efectivo usarán la misma cuenta `CASH_USD`
- El balance debería calcularse correctamente: **1000 - 100 = 900 USD**

## Si el problema persiste

1. **Verificar que no hay múltiples cuentas CASH_USD:**
```sql
SELECT id, name, type, currency, created_at, is_active
FROM financial_accounts
WHERE type = 'CASH_USD' AND currency = 'USD'
ORDER BY created_at;
```

2. **Si hay múltiples cuentas:**
   - Consolidar movimientos a una sola cuenta
   - O marcar una como `is_default = true` si existe ese campo

3. **Verificar que los movimientos están en la cuenta correcta:**
```sql
-- Ver todos los movimientos de una cuenta específica
SELECT 
  lm.type,
  lm.concept,
  lm.amount_original,
  lm.created_at
FROM ledger_movements lm
WHERE lm.account_id = 'ID_DE_LA_CUENTA_CASH_USD'
ORDER BY lm.created_at DESC;
```
