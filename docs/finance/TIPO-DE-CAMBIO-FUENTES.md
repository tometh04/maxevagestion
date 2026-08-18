# Tipo de cambio: qué fuente manda en cada caso

**Estado:** contrato técnico — relevado 2026-08-18 (VIB-133)
**Alcance:** define qué tabla de tipo de cambio es autoritativa para cada consumidor.
**Prerrequisito de:** VIB-134 y, sobre todo, de la mejora **D** (diferencia de cambio y
pesificación), que no puede definirse sin fijar esto primero.

> Este documento es el **contrato**. Para el how-to de configuración (dónde se carga
> el TC desde la UI) ver [`TIPO_CAMBIO_GESTION.md`](./TIPO_CAMBIO_GESTION.md).

---

## 1. El problema

Hoy conviven **tres fuentes de tipo de cambio desacopladas**, y cada pantalla usa la que
le tocó por historia, no por diseño. Como resultado, dos pantallas pueden mostrar números
distintos para la misma operación sin que ninguna esté "mal".

---

## 2. Inventario de fuentes

### 2.1 `exchange_rates` — TC diario (migración 013)

- **Qué guarda:** una fila por `(rate_date, from_currency, to_currency)` con `rate` y `source`.
- **Cómo se lee:** `lib/accounting/exchange-rates.ts`
  - `getExchangeRate(supabase, date)` — TC de una fecha (si no hay exacto, el anterior más cercano).
  - `getLatestExchangeRate(supabase)` — el más reciente.
  - `buildExchangeRateMap(supabase, dates)` — batch, para listados.
  - `getExchangeRateWithFallback(...)` — con logging/diagnóstico del origen.
- **Quién la usa:** deuda de clientes (`debts-sales`), antigüedad de saldos (`aging`),
  semáforo de pagos (`payments-semaphore`), conversión por operación en la posición mensual,
  cuentas financieras (transferencias, ajustes, cierre) y pagos masivos a operadores.
- **Fallback:** `DEFAULT_USD_ARS_FALLBACK_RATE` = env `USD_ARS_EMERGENCY_RATE` ?? **1500**.

### 2.2 `monthly_exchange_rates` — TC mensual (migración 087)

- **Qué guarda:** una fila por `(year, month)` con `usd_to_ars_rate`. Es el TC "de cierre" del mes.
- **Quién la usa:**
  - `monthly-position` → TC del mes para la foto contable.
  - `getCurrentArsPerUsd()` (`lib/payments/load-rules.ts`) → **referencia del guard de
    plausibilidad** del TC en cobros (POST/PATCH de `/api/payments` y, desde VIB-132, `mark-paid`).
  - ABM propio en `/api/accounting/monthly-exchange-rates`.
- **Fallback:** `FALLBACK_USD_RATE` = **1000**, hardcodeado.

### 2.3 Feed BCRA — ingesta automática

- `lib/accounting/bcra-exchange-rates.ts`: consulta dolarapi con fallback a bluelytics y
  **escribe la cotización de venta en `exchange_rates`** con `source = BCRA_AUTO`.
- No escribe en `monthly_exchange_rates`.

---

## 3. Contrato: qué manda en cada caso

| Uso | Fuente autoritativa | Por qué |
|---|---|---|
| **Valuación de dinero**: deuda de clientes, deuda a operadores, aging, saldos, conversión de pagos y movimientos | **`exchange_rates`** por la fecha del hecho (operación o pago) | El valor de una deuda depende del TC del día del hecho, no de un promedio mensual |
| **Foto contable de cierre**: posición mensual, y a futuro el revalúo de la mejora D | **`monthly_exchange_rates`** del mes; si falta, el más reciente de `exchange_rates` | El cierre necesita un TC único y estable por período, decidido por administración |
| **Guard de plausibilidad** (solo detectar errores de orden de magnitud) | Referencia de mercado; **debería ser la misma que la de valuación** (ver §4) | Es un chequeo de sanidad, no una valuación: solo necesita un orden de magnitud correcto |
| **Ingesta automática** | Feed BCRA → escribe **solo** en `exchange_rates` | Una sola puerta de entrada para el TC diario |

**Regla corta:** `exchange_rates` valúa; `monthly_exchange_rates` cierra.

---

## 4. Inconsistencia detectada (pendiente de decisión)

Al relevar esto apareció un desajuste real, **todavía no corregido**:

- La valuación cae a un fallback de **1500** (`DEFAULT_USD_ARS_FALLBACK_RATE`, ajustable por env).
- El guard de plausibilidad cae a un fallback de **1000** (`FALLBACK_USD_RATE`, hardcodeado)
  y además lee `monthly_exchange_rates`, no `exchange_rates`.

Si `monthly_exchange_rates` está vacía o desactualizada, el guard compara contra **1000**
mientras el mercado y la valuación trabajan con ~1500. No es peligroso hoy —la banda del guard
es de factor 10, así que sigue atrapando los errores de orden de magnitud que le importan
(TC = 1)— pero son dos verdades para lo mismo.

**Recomendación (requiere aprobación, no se aplicó):**

1. Que `getCurrentArsPerUsd()` prefiera `exchange_rates` (el más reciente) y use
   `monthly_exchange_rates` solo como respaldo.
2. Unificar el fallback en `DEFAULT_USD_ARS_FALLBACK_RATE` (env-driven) y eliminar el 1000 hardcodeado.

No se tocó el código porque cambia el comportamiento del guard, y eso excede el alcance de
VIB-133 (que es documentar y decidir).

---

## 5. Decisiones abiertas para la mejora D

Antes de implementar diferencia de cambio y pesificación hay que confirmar:

1. **¿El revalúo de cierre usa el TC de `monthly_exchange_rates`?** Es lo que asume este
   contrato, pero lo define administración/contador.
2. **¿El revalúo escribe saldos o es informativo?** Hoy la deuda se **recalcula al leer**;
   si el revalúo persiste saldos, hay que definir cuál valor manda para no tener dos verdades.
3. **¿Se unifica el fallback?** (ver §4).

---

## Referencias

- `lib/accounting/exchange-rates.ts` — lectura del TC diario y fallbacks.
- `lib/accounting/bcra-exchange-rates.ts` — ingesta automática.
- `lib/payments/load-rules.ts` — `getCurrentArsPerUsd()`, referencia del guard.
- `lib/payments/customer-income-fx.ts` — `isExchangeRatePlausibleVsMarket()`.
- `supabase/migrations/013_create_exchange_rates.sql`
- `supabase/migrations/087_create_monthly_exchange_rates.sql`
