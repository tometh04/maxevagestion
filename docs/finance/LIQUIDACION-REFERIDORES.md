# Liquidación de comisiones al referidor

Nota técnica del flujo de pago a socios referidores (VIB-86). Aplica a cualquier
organización que use el módulo de Referidos.

## El problema que resuelve

Hasta esta entrega, "pagar" una comisión de referido era `PATCH
/api/referral-commissions/[id]` con `status: "PAID"`: cambiaba un flag y nada
más. **No generaba movimiento en el ledger**, así que la plata que la agencia le
entregaba al referidor nunca salía de ninguna cuenta.

Consecuencias:

- el saldo de las cuentas financieras quedaba inflado por todo lo pagado a
  referidores;
- el egreso no aparecía en ningún reporte financiero ni en el libro mayor;
- era el único "pagar" del sistema que no movía plata (la comisión del vendedor,
  los pagos a operador y los gastos de caja sí crean su `ledger_movement`).

La decisión original (VIB-62) fue explícita —"es un registro/seguimiento"— y era
defendible cuando el módulo estaba sin estrenar. Dejó de serlo al usarse.

## Modelo: liquidación, no pago fila por fila

Al referidor no se le paga venta por venta: se le paga un total por período. Una
**liquidación** (`referral_settlements`) agrupa N comisiones de **un** referidor
en **una** moneda, genera **un** `ledger_movement` y respalda un comprobante en
PDF con el detalle venta por venta.

Motivos:

1. Refleja cómo se paga en la realidad.
2. El referidor es un tercero externo (otra agencia), no un empleado: necesita un
   comprobante para conciliar lo que cobra.
3. Evita una trampa del ledger: `createLedgerMovement()` con `type: "COMMISSION"`
   y `operation_id` dispara `markCommissionsAsPaidIfLedgerExists()`, que marcaría
   como pagada la comisión del **vendedor** de esa operación. La liquidación va
   con `operation_id: null` (cubre muchas ventas), así que el hook ni se activa.
   `seller_id` también va `null`: el referidor no es un usuario del tenant.

## Superficie

| Pieza | Archivo |
|---|---|
| Reglas puras (selección válida, conversión de moneda) | `lib/referrals/settlement.ts` |
| Pago | `POST /api/referral-settlements` |
| Listado | `GET /api/referral-settlements` |
| Reversión | `POST /api/referral-settlements/[id]/reverse` |
| Comprobante | `GET /api/referral-settlements/[id]/pdf` |
| Generador de PDF | `lib/pdf/referral-settlement-pdf.ts` |
| UI | `components/referrals/referrals-view.tsx`, `referral-settlement-dialog.tsx` |
| Migración | `supabase/migrations/20260812000001_referral_settlements.sql` |

## Permisos

El gate es `referrals:read` **+** `cash:write`: ver cuánto se le paga a un
referidor y poder sacar plata de una cuenta. La intersección da SUPER_ADMIN,
ORG_OWNER, ADMIN y CONTABLE.

Esto además corrige una inconsistencia previa: la matriz decía que CONTABLE
"liquida las comisiones al referidor", pero el gate real era `commissions:write`,
que CONTABLE no tiene.

El vendedor sigue sin ver montos de referido, en pantalla ni por API (VIB-86).

## Invariantes

- Una liquidación es de **un referidor** y **una moneda**. Nunca se suman ARS y
  USD: el total no significaría nada.
- Se puede pagar cross-moneda (comisión en USD desde cuenta en ARS y viceversa)
  con tipo de cambio explícito, igual que `/api/commissions/pay`. El gasto manual
  de Caja **no** soporta esto: exige que la moneda de la cuenta coincida.
- Se valida saldo suficiente antes de pagar (`validateSufficientBalance`).
- Orden de escritura: fila de liquidación → imputación de comisiones **con CAS**
  → movimiento de ledger. Si algo falla después de imputar, se compensa (las
  comisiones vuelven a su estado previo y la liquidación se borra). Nunca queda
  una comisión pagada sin egreso, que es el bug que este flujo vino a arreglar.
- `account_id` es `ON DELETE SET NULL`, no `RESTRICT`: el borrado de cuentas
  financieras es un hard delete que primero elimina los `ledger_movements` de la
  cuenta y después la cuenta, así que un `RESTRICT` haría fallar ese flujo en el
  último paso y dejaría la cuenta sin movimientos pero sin borrar. El nombre de
  la cuenta se copia en `account_name` para que el comprobante siga siendo
  legible si la cuenta desaparece.
- Revertir **contra-asienta**: inserta un `INCOME` con `reverses_movement_id` y
  marca el original con `reversed_at`. No borra nada. (El revert de comisión al
  vendedor, `/api/commissions/revert`, sí borra el movimiento y pierde el rastro;
  no se replicó ese criterio.)

## Regularización de lo pagado con el flujo viejo

Una comisión con `status = 'PAID'` y `settlement_id IS NULL` es una que se marcó
como pagada cuando el sistema no registraba el egreso. La pantalla de Referidos
las señala y ofrece registrar de qué cuenta salió, creando una liquidación con
`is_regularization = true`.

No es un segundo pago: sólo agrega la salida de caja que faltó. Al revertir una
regularización, las comisiones vuelven a `PAID` (como estaban), no a `PENDING`.

## Limitación conocida

`GET /api/referral-commissions` no filtra por agencia: en una organización
multi-agencia, quien tiene `referrals:read` ve las comisiones de todas. La
liquidación hereda ese alcance. Es comportamiento previo a esta entrega, no
introducido acá; si hiciera falta scopearlo, hay que hacerlo en el listado y en
el endpoint de pago a la vez.

## Aplicar la migración

Es idempotente (`IF NOT EXISTS` / `IF EXISTS` en todo) y va dentro de una única
transacción, así que reintentarla es seguro y un fallo no deja nada a medias.

Dos decisiones pensadas para una base con tráfico:

- `SET LOCAL lock_timeout = '10s'`: si no consigue el lock, corta con un error
  claro en vez de quedar bloqueando lectores.
- El `ALTER TABLE referral_commissions` va **último**, justo antes del `COMMIT`.
  Es lo único que toca una tabla en uso y `ADD COLUMN` retiene
  AccessExclusiveLock hasta el commit; cuanto más tarde se tome, menor la
  ventana. El primer intento murió por deadlock sobre esa tabla, contra un
  proceso concurrente ajeno a este cambio (la otra relación del deadlock era
  `storage.buckets`).

### Tipos

Aplicada la migración, `referral_settlements` y `referral_commissions.settlement_id`
se agregaron a `lib/supabase/types.ts` **a mano**, derivando cada columna de
`information_schema` para que coincidan con el esquema real. La próxima corrida
del generador los sobreescribe con lo mismo.

**Cuidado con `npm run db:generate` y `db:generate:remote`**: ambos scripts son
`supabase gen types ... > lib/supabase/types.ts`. Si el CLI no está instalado o
la sesión no está logueada, el comando falla pero **el redirect ya vació el
archivo** y deja `types.ts` en 0 líneas, rompiendo la compilación entera. Hacer
copia antes de correrlos, o generar a un archivo temporal y mover si salió bien.
`db:generate` además apunta a una instancia **local** (`--local`), no a
producción.
