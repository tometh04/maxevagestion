# 📊 Revisión Completa de Cuentas Contables

## 🎯 Resumen

Este documento lista todos los nombres de cuentas financieras (financial_accounts) tanto en el **Frontend** como en el **Backend** para verificar consistencia.

---

## 📋 CUENTAS FINANCIERAS - Nombres por Tipo

### Backend (lib/accounting/ledger.ts - getOrCreateDefaultAccount)

**Ubicación:** `lib/accounting/ledger.ts` líneas 375-383

| Tipo | Nombre en Backend | Moneda |
|------|-------------------|--------|
| `CASH_ARS` | **"Caja Principal ARS"** | ARS |
| `CASH_USD` | **"Caja Principal USD"** | USD |
| `CHECKING_ARS` | **"Banco Principal ARS"** | ARS |
| `CHECKING_USD` | **"Banco Principal USD"** | USD |
| `CREDIT_CARD` | **"Mercado Pago"** | - |
| `SAVINGS_ARS` | **"Caja de Ahorro ARS"** | ARS |
| `SAVINGS_USD` | **"Caja de Ahorro USD"** | USD |

**Código:**
```typescript
const accountNames: Record<string, string> = {
  CASH_ARS: "Caja Principal ARS",
  CASH_USD: "Caja Principal USD",
  CHECKING_ARS: "Banco Principal ARS",
  CHECKING_USD: "Banco Principal USD",
  CREDIT_CARD: "Mercado Pago",
  SAVINGS_ARS: "Caja de Ahorro ARS",
  SAVINGS_USD: "Caja de Ahorro USD",
}
```

---

### Frontend (components/accounting/financial-accounts-page-client.tsx)

**Ubicación:** `components/accounting/financial-accounts-page-client.tsx` líneas 47-56

| Tipo | Nombre en Frontend (Etiquetas) | Nombre en Frontend (Select) |
|------|--------------------------------|----------------------------|
| `CASH_ARS` | **"Caja efectivo ARS"** | **"Caja efectivo ARS"** |
| `CASH_USD` | **"Caja efectivo USD"** | **"Caja efectivo USD"** |
| `CHECKING_ARS` | **"Cuenta corriente ARS"** | **"Cuenta corriente ARS"** |
| `CHECKING_USD` | **"Cuenta corriente USD"** | **"Cuenta corriente USD"** |
| `CREDIT_CARD` | **"Tarjeta de crédito"** | **"Tarjeta de crédito"** |
| `SAVINGS_ARS` | **"Caja de ahorro ARS"** | **"Caja de ahorro ARS"** |
| `SAVINGS_USD` | **"Caja de ahorro USD"** | **"Caja de ahorro USD"** |

**Código:**
```typescript
const accountTypeLabels: Record<string, string> = {
  SAVINGS_ARS: "Caja de ahorro ARS",
  SAVINGS_USD: "Caja de ahorro USD",
  CHECKING_ARS: "Cuenta corriente ARS",
  CHECKING_USD: "Cuenta corriente USD",
  CASH_ARS: "Caja efectivo ARS",
  CASH_USD: "Caja efectivo USD",
  CREDIT_CARD: "Tarjeta de crédito",
  ASSETS: "Activos",
}

const accountTypes = [
  { value: "SAVINGS_ARS", label: "Caja de ahorro ARS" },
  { value: "SAVINGS_USD", label: "Caja de ahorro USD" },
  { value: "CHECKING_ARS", label: "Cuenta corriente ARS" },
  { value: "CHECKING_USD", label: "Cuenta corriente USD" },
  { value: "CASH_ARS", label: "Caja efectivo ARS" },
  { value: "CASH_USD", label: "Caja efectivo USD" },
  { value: "CREDIT_CARD", label: "Tarjeta de crédito" },
  { value: "ASSETS", label: "Activos" },
]
```

---

## ⚠️ INCONSISTENCIAS ENCONTRADAS

### 1. **CASH_ARS / CASH_USD**

| Contexto | Nombre |
|----------|--------|
| **Backend** | "Caja Principal ARS" / "Caja Principal USD" |
| **Frontend** | "Caja efectivo ARS" / "Caja efectivo USD" |

**Diferencia:** Backend usa "Caja Principal", Frontend usa "Caja efectivo"

---

### 2. **CHECKING_ARS / CHECKING_USD**

| Contexto | Nombre |
|----------|--------|
| **Backend** | "Banco Principal ARS" / "Banco Principal USD" |
| **Frontend** | "Cuenta corriente ARS" / "Cuenta corriente USD" |

**Diferencia:** Backend usa "Banco Principal", Frontend usa "Cuenta corriente"

---

### 3. **CREDIT_CARD**

| Contexto | Nombre |
|----------|--------|
| **Backend** | "Mercado Pago" |
| **Frontend** | "Tarjeta de crédito" |

**Diferencia:** Backend usa "Mercado Pago", Frontend usa "Tarjeta de crédito"

---

### 4. **SAVINGS_ARS / SAVINGS_USD**

| Contexto | Nombre |
|----------|--------|
| **Backend** | "Caja de Ahorro ARS" / "Caja de Ahorro USD" |
| **Frontend** | "Caja de ahorro ARS" / "Caja de ahorro USD" |

**Diferencia:** Solo diferencia de mayúsculas ("Ahorro" vs "ahorro") - **CONSISTENTE**

---

## 📍 Otras Referencias a Nombres de Cuentas

### Migración 006 (supabase/migrations/006_create_financial_accounts.sql)

**Líneas 40-44:**
```sql
INSERT INTO financial_accounts (name, type, currency, initial_balance)
VALUES 
  ('Caja Principal', 'CASH', 'ARS', 0),
  ('Banco Principal', 'BANK', 'ARS', 0),
  ('Mercado Pago', 'MP', 'ARS', 0)
ON CONFLICT DO NOTHING;
```

**Nota:** Esta migración usa los tipos antiguos (`CASH`, `BANK`, `MP`) que fueron reemplazados por `CASH_ARS`, `CHECKING_ARS`, `CREDIT_CARD` en la migración 049.

---

### Migración 049 (supabase/migrations/049_update_financial_accounts_structure.sql)

**Actualiza la estructura** para usar los nuevos tipos:
- `CASH_ARS`, `CASH_USD`
- `CHECKING_ARS`, `CHECKING_USD`
- `SAVINGS_ARS`, `SAVINGS_USD`
- `CREDIT_CARD`

---

## 🔧 Función que muestra nombres en Frontend

**Archivo:** `components/accounting/financial-accounts-page-client.tsx`

La función `getDisplayName()` (no mostrada en el código, pero se usa en línea 608) probablemente devuelve:
- `account.name` si existe (nombre real de la base de datos)
- O usa `accountTypeLabels[account.type]` como fallback

**Línea 608:**
```typescript
<TableCell className="font-medium">{getDisplayName(account)}</TableCell>
```

---

## 📊 Tabla de Mapeo Completa

| Tipo | Backend (getOrCreateDefaultAccount) | Frontend (accountTypeLabels) | Diferencia |
|------|-------------------------------------|------------------------------|------------|
| `CASH_ARS` | "Caja Principal ARS" | "Caja efectivo ARS" | ⚠️ **DIFERENTE** |
| `CASH_USD` | "Caja Principal USD" | "Caja efectivo USD" | ⚠️ **DIFERENTE** |
| `CHECKING_ARS` | "Banco Principal ARS" | "Cuenta corriente ARS" | ⚠️ **DIFERENTE** |
| `CHECKING_USD` | "Banco Principal USD" | "Cuenta corriente USD" | ⚠️ **DIFERENTE** |
| `CREDIT_CARD` | "Mercado Pago" | "Tarjeta de crédito" | ⚠️ **DIFERENTE** |
| `SAVINGS_ARS` | "Caja de Ahorro ARS" | "Caja de ahorro ARS" | ✅ Similar (solo mayúsculas) |
| `SAVINGS_USD` | "Caja de Ahorro USD" | "Caja de ahorro USD" | ✅ Similar (solo mayúsculas) |

---

## 💡 Recomendaciones

### Opción 1: Unificar usando nombres del Backend
- **Frontend debe mostrar:** Los nombres reales de `financial_accounts.name` en la base de datos
- **Backend crea:** "Caja Principal ARS", "Banco Principal ARS", etc.
- **Frontend muestra:** `account.name` directamente (sin usar `accountTypeLabels`)

### Opción 2: Unificar usando nombres del Frontend
- **Backend debe crear:** "Caja efectivo ARS", "Cuenta corriente ARS", etc.
- **Actualizar:** `accountNames` en `lib/accounting/ledger.ts`

### Opción 3: Mantener separados (recomendado)
- **Backend:** Nombres técnicos ("Caja Principal", "Banco Principal")
- **Frontend:** Etiquetas descriptivas ("Caja efectivo", "Cuenta corriente")
- **Mostrar en UI:** `account.name` de la base de datos (del backend)
- **Usar `accountTypeLabels`:** Solo para el dropdown de creación/edición

---

## 🔍 Archivos Relacionados

1. **Backend - Creación de cuentas:**
   - `lib/accounting/ledger.ts` - `getOrCreateDefaultAccount()` (líneas 342-401)

2. **Frontend - Visualización:**
   - `components/accounting/financial-accounts-page-client.tsx` - `accountTypeLabels` (líneas 47-56)

3. **Backend - API:**
   - `app/api/accounting/financial-accounts/route.ts` - GET/POST endpoints

4. **Migraciones:**
   - `supabase/migrations/006_create_financial_accounts.sql` - Creación inicial
   - `supabase/migrations/049_update_financial_accounts_structure.sql` - Actualización de estructura
