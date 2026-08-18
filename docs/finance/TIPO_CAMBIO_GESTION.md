# 💱 Gestión de Tipos de Cambio

## 📋 Resumen

Este documento explica cómo se gestionan los tipos de cambio en el sistema MAXEVA GESTIÓN, dónde se configuran y cómo se utilizan.

> **¿Buscás qué fuente de TC manda en cada caso?** Este documento es el how-to de
> configuración. El contrato técnico —qué tabla es autoritativa para valuar deuda, para
> el cierre mensual y para el guard de plausibilidad— está en
> [`TIPO-DE-CAMBIO-FUENTES.md`](./TIPO-DE-CAMBIO-FUENTES.md).

---

## 🎯 Configuración del Tipo de Cambio

### 1. **Configuración Principal** (Recomendado)

**Ubicación:** `Finanzas → Configuración → Tab "Monedas"`

**Pasos:**
1. Ir a **Finanzas** en el menú lateral
2. Click en **Configuración**
3. Seleccionar el tab **"Monedas"**
4. En la sección **"Tipos de Cambio"**:
   - **Fuente:** Seleccionar "Manual" o "API Externa"
   - **Tipo de Cambio USD/ARS por Defecto:** Ingresar el valor (ej: 1000.00)
   - **Actualización Automática:** Activar si se usa API externa

**Archivo relacionado:**
- UI: `components/finances/finances-settings-page-client.tsx`
- API: `app/api/finances/settings/route.ts`
- Base de datos: `financial_settings` (tabla)

---

### 2. **Tasas de Cambio Históricas**

**Ubicación:** Base de datos `exchange_rates` (tabla)

**Descripción:**
- Almacena tasas de cambio por fecha
- Se puede insertar manualmente via SQL Editor de Supabase
- O usar la función `upsertExchangeRate` del código

**Ejemplo SQL:**
```sql
INSERT INTO exchange_rates (rate_date, from_currency, to_currency, rate, source, notes)
VALUES ('2026-01-17', 'USD', 'ARS', 1250.00, 'MANUAL', 'Tasa manual del día');
```

**Archivos relacionados:**
- Migración: `supabase/migrations/013_create_exchange_rates.sql`
- Funciones: `lib/accounting/exchange-rates.ts`

---

## 🔧 Funciones Principales

### `getExchangeRate()`
Obtiene la tasa de cambio para una fecha específica. Si no hay tasa exacta, devuelve la más cercana anterior.

**Uso:**
```typescript
import { getExchangeRate } from "@/lib/accounting/exchange-rates"

const rate = await getExchangeRate(supabase, new Date("2026-01-17"))
// Retorna: 1250.00 (o null si no existe)
```

**Archivo:** `lib/accounting/exchange-rates.ts` (línea 28)

---

### `getLatestExchangeRate()`
Obtiene la tasa de cambio más reciente disponible.

**Uso:**
```typescript
import { getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

const rate = await getLatestExchangeRate(supabase)
// Retorna: 1250.00 (la tasa más reciente)
```

**Archivo:** `lib/accounting/exchange-rates.ts` (línea 74)

---

### `upsertExchangeRate()`
Crea o actualiza una tasa de cambio para una fecha específica.

**Uso:**
```typescript
import { upsertExchangeRate } from "@/lib/accounting/exchange-rates"

await upsertExchangeRate(
  supabase,
  new Date("2026-01-17"),
  1250.00,
  "USD",
  "ARS",
  "MANUAL",
  "Actualización diaria",
  userId
)
```

**Archivo:** `lib/accounting/exchange-rates.ts` (línea 99)

---

## 📊 Cómo se Usa el Tipo de Cambio

### 1. **Al Crear Pagos en USD**

Cuando se registra un pago en USD, el sistema:
1. Busca la tasa de cambio para la fecha del pago
2. Si no encuentra, usa `getLatestExchangeRate()`
3. Si aún no hay tasa, usa `default_usd_rate` de `financial_settings`
4. Calcula `amount_ars_equivalent = amount_original * exchange_rate`

**Ejemplo:**
- Pago: 1000 USD
- Tasa: 1250 ARS/USD
- `amount_original = 1000`
- `amount_ars_equivalent = 1,250,000`

**Archivos relacionados:**
- `app/api/payments/mark-paid/route.ts` (líneas 161-172)
- `app/api/payments/route.ts`

---

### 2. **Al Calcular Balances**

**Para cuentas USD:**
- Se usa `amount_original` (en USD)
- NO se usa `amount_ars_equivalent` (eso es solo para contabilidad)

**Para cuentas ARS:**
- Se usa `amount_ars_equivalent` (en ARS)

**Archivo:** `lib/accounting/ledger.ts` - función `getAccountBalance()` (línea 107)

---

## 🔄 Flujo de Actualización

### Manual (Configuración Recomendada)

1. Ir a **Finanzas → Configuración**
2. Tab **"Monedas"**
3. Modificar **"Tipo de Cambio USD/ARS por Defecto"**
4. Click en **"Guardar Cambios"**

### Automático (Si está habilitado)

Si `exchange_rate_config.auto_update = true`:
- El sistema buscaría una API externa (no implementado aún)
- O usaría un job programado (no implementado aún)

---

## ⚙️ Configuración por Defecto

### Valores Iniciales

Al crear la configuración financiera por primera vez:

```typescript
{
  primary_currency: 'USD',           // Moneda principal
  default_usd_rate: 1000.00,         // Tasa por defecto
  exchange_rate_config: {
    source: 'manual',                // Fuente: manual
    auto_update: false               // Sin actualización automática
  }
}
```

**Archivo:** `app/api/finances/settings/route.ts` (línea 75)

---

## 📝 Notas Importantes

1. **Independencia de Monedas:**
   - Las cajas ARS y USD son **completamente independientes**
   - El gráfico de evolución solo muestra **ARS** (cuentas ARS)
   - Los KPIs muestran **ARS y USD separados**

2. **Tasa por Fecha:**
   - Cada día puede tener una tasa diferente
   - Si no hay tasa para una fecha, se usa la más cercana anterior
   - Si no hay ninguna tasa, se usa `default_usd_rate`

3. **Moneda Principal:**
   - Por defecto: **USD** (configurado en `primary_currency`)
   - Se puede cambiar en **Finanzas → Configuración → Monedas**

---

## 🛠️ Troubleshooting

### Problema: "No exchange rate found"

**Solución:**
1. Verificar que existe `default_usd_rate` en `financial_settings`
2. O crear una tasa en `exchange_rates` para la fecha requerida
3. O verificar que `getLatestExchangeRate()` retorna un valor

### Problema: Balance USD incorrecto

**Solución:**
- Verificar que `getAccountBalance()` usa `amount_original` para cuentas USD
- No usar `amount_ars_equivalent` para calcular balances USD

---

## 📚 Referencias

- **Tabla `exchange_rates`:** `supabase/migrations/013_create_exchange_rates.sql`
- **Funciones:** `lib/accounting/exchange-rates.ts`
- **Configuración:** `components/finances/finances-settings-page-client.tsx`
- **API Settings:** `app/api/finances/settings/route.ts`
