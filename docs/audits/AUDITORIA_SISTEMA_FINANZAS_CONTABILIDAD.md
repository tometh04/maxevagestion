# Auditoría: Finanzas, Contabilidad y Sistema

**Fecha:** 22 enero 2025  
**Alcance:** Archivos innecesarios, flujos críticos, lógica contable, edge cases, vulnerabilidades.

---

## Fixes aplicados (post-auditoría)

- **Bulk operator payments:** `validateSufficientBalance` antes del batch; rechazo de cuentas CpC/CpP; total en moneda de cuenta y redondeo con `roundMoney`.
- **DELETE movimiento de caja:** Uso de `ledger_movement_id` cuando existe; fallback por `operation_id` (con `is("operation_id", null)`); `invalidateBalanceCache` tras borrar.
- **Migración 090:** `ledger_movement_id` en `cash_movements`; POST de movimientos guarda y actualiza ese id.
- **Helper `roundMoney`** en `lib/currency`; uso en movimientos y bulk.
- **Código muerto:** Eliminados `calendar-01`, `calendar-04`, `data-table`, scripts `* 2.ts`.
- **`.gitignore`:** Añadido `/backups/`.
- **Sidebar Caja:** Enlaces a Movimientos y Pagos.
- **Deprecación:** Comentarios `@deprecated` en `payment-coupons` y `card-transactions`.
- **Workaround de testeo:** `docs/WORKAROUND_TESTING_AUDITORIA.md` y `npm run test:audit-fixes`.

---

## 1. Archivos y código innecesarios / huérfanos

### 1.1 Componentes no usados
| Archivo | Motivo |
|--------|--------|
| `components/calendar-01.tsx` | No importado en ningún lado. |
| `components/calendar-04.tsx` | No importado en ningún lado. |
| `components/data-table.tsx` | Tabla con dnd-kit/sortable; en la app se usa `@/components/ui/data-table`. No hay imports a `@/components/data-table`. |

### 1.2 APIs sin UI
| API | Uso en UI |
|-----|-----------|
| `/api/payment-coupons` (GET/POST) | Ninguno. No hay pantalla de cupones de pago. |
| `/api/payment-coupons/[id]/mark-paid` | Ninguno. |
| `/api/card-transactions` | Ninguno. No hay pantalla de transacciones con tarjeta. |
| `/api/cash-boxes` (GET/POST), `cash-boxes/transfer`, `cash-boxes/[id]` | El menú y las pantallas de Caja usan **Cuentas Financieras** (`/accounting/financial-accounts`). Las cash-boxes se usan solo por sync-movements y movement POST (campos legacy). |

### 1.3 Scripts duplicados o legacy
- `sync-trello-complete-v2 2.ts`, `test-complete-system-flow 2.ts`, `test-system-api-real 2.ts`, `test-system-real 2.ts`: nombres con ` 2` → copias duplicadas.
- `sync-payments-to-cash-movements.ts`: lógica similar a `POST /api/cash/sync-movements`. Posible redundancia si solo se usa el endpoint.

### 1.4 Backup en repo
- `backups/backup-2025-12-09T14-41-17-907Z.json`: backup en el repo. `.gitignore` solo excluye `*-backup-*.zip`, no `backups/`. Riesgo de subir datos sensibles.

---

## 2. Dualidad `cash_boxes` vs `financial_accounts`

### 2.1 Dos modelos de “caja”
- **`financial_accounts` + `ledger_movements`**: base usada en Caja Resumen, Libro Mayor, transferencias, pagos (mark-paid, nuevos pagos, etc.). **Es la fuente de verdad de saldos.**
- **`cash_boxes` + `cash_movements`**: legacy. `cash_movements` tiene `cash_box_id` y opcionalmente `payment_id`. Los saldos de cash_boxes se calculan por triggers sobre `cash_movements`.

### 2.2 Dónde se usa cada uno
- **Caja → Resumen:** `financial_accounts` + ledger (y “Ver movimientos” = ledger por cuenta).
- **Caja → Ingresos / Egresos:** `GET /api/payments` (tabla `payments`), no `cash_movements`.
- **Caja → Movimientos** (ruta existente pero **no** en el sidebar): `GET /api/cash/movements` → `cash_movements`.
- **Nuevo movimiento manual:**  
  - Inserta en `cash_movements` (con `cash_box_id` por defecto)  
  - Crea `ledger_movement` en la **cuenta financiera** elegida.

### 2.3 Incoherencias
1. **Movimiento manual:** El usuario elige **cuenta financiera**. Esa es la que se usa para el ledger. Para `cash_movements` se rellena un `cash_box` por defecto (por moneda/`is_default`), **no** la cuenta elegida. Resultado:  
   - Ledger y saldos de `financial_accounts` correctos.  
   - `cash_movements` asociados a una “caja” que puede no coincidir con la cuenta elegida.

2. **Sync-movements:** Crea solo `cash_movements` (usa `cash_boxes`). Los pagos ya generan `ledger_movements` al marcarse como pagados. No hay creación de ledger en el sync. Resultado:  
   - “Movimientos” (cash) y “Resumen” (ledger) no comparten la misma fuente.  
   - Si no hay `cash_boxes` o no hay default, sync puede crear movimientos con `cash_box_id` null.

3. **Caja Resumen** ignora `cash_boxes` y `cash_movements`; **Movimientos** ignora ledger. Dos vistas de “movimientos” con datos distintos.

### 2.4 Preguntas para el cliente
- ¿Siguen siendo necesarias `cash_boxes` y `cash_movements` o el sistema debería unificarse en `financial_accounts` + ledger?
- Si se mantienen ambos: ¿“Movimientos de caja” debe seguir mostrando solo `cash_movements` o debería basarse en ledger (por cuenta financiera)?
- ¿El “Sincronizar movimientos” debe seguir creando `cash_movements` o puede deprecarse si todo pasa por ledger?

---

## 3. Vulnerabilidades y errores de lógica

### 3.1 Pago masivo a operadores sin validar saldo
- **Dónde:** `POST /api/accounting/operator-payments/bulk/route.ts`
- **Qué hace:** Devuelve desde la cuenta `payment_account_id` y crea `ledger_movement` tipo EXPENSE.
- **Problema:** **No se llama a `validateSufficientBalance`** antes de crear movimientos. Se pueden registrar pagos por encima del saldo y llevar la cuenta a negativo.
- **Resto de flujos:** Pagos normales, mark-paid, cash movements, transfer, recurring pay, partner withdrawals, commissions pay **sí** validan saldo.

**Recomendación:** Antes de procesar el batch, sumar el total a pagar (en la moneda de la cuenta) y llamar a `validateSufficientBalance`. Si no hay saldo suficiente, rechazar todo el batch.

### 3.2 Eliminación de movimiento de caja y caché de saldos
- **Dónde:** `DELETE /api/cash/movements`
- **Qué hace:** Busca un `ledger_movement` “asociado” por `operation_id`, type, amount, currency y lo borra; luego borra el `cash_movement`.
- **Problemas:**  
  1. **Caché:** El borrado se hace directo contra Supabase. No se usa el servicio de ledger ni `invalidateBalanceCache`. Los saldos cacheados pueden seguir incluyendo el movimiento eliminado hasta que expire el TTL.  
  2. **Match del ledger:**  
     - Si `operation_id` es null (movimiento manual sin operación), la query usa `eq("operation_id", null)`. En SQL `= NULL` no matchea; debería usarse `is null`. No se encuentra ningún ledger y se borra solo el `cash_movement`. El ledger queda huérfano y el saldo **no** se corrige.  
  3. **Múltiples matches:** Si hubiera varios ledger con mismo operation, type, amount, currency (ej. cuenta “real” + CpC/CpP), se borra “el primero” encontrado. Podría borrarse el movimiento equivocado.

**Recomendación:**  
- Guardar `ledger_movement_id` en `cash_movements` al crear el movimiento (y usarlo en el DELETE).  
- Al eliminar, invalidar caché de la cuenta afectada.  
- Corregir el manejo de `operation_id` null si se mantiene el match por criterios.

### 3.3 Uso de `cash_box` por defecto en movimiento manual
- **Dónde:** `POST /api/cash/movements`
- **Qué hace:** Recibe `financial_account_id`; crea ledger en esa cuenta. Para `cash_movements` usa `cash_box_id` del body o un `cash_box` por defecto (moneda, `is_default`).
- **Problema:** La “caja” mostrada en Movimientos (cash) puede no corresponder a la cuenta elegida por el usuario. Dificulta trazabilidad y puede confundir.

---

## 4. Navegación y visibilidad

### 4.1 Rutas de Caja no en el sidebar
- **Sidebar (Caja):** Resumen, Ingresos, Egresos.  
- **Existen pero no aparecen en ese menú:**  
  - `/cash/movements` (Movimientos de caja)  
  - `/cash/payments` (Pagos)
- **Referencias:**  
  - `site-header` usa `/cash/movements` y `/cash/payments` para títulos.  
  - Operador detalle enlaza a `/cash/payments`.

**Pregunta:** ¿Es intencional que Movimientos y Pagos no estén en el menú de Caja? Si no, conviene añadirlos para que se descubran fácilmente.

---

## 5. Edge cases y validaciones

### 5.1 Bulk operator payments
- Sin validación de saldo (ya dicho).
- No se comprueba si `payment_account_id` es una cuenta “solo contable” (CpC/CpP). La UI usa `excludeAccountingOnly`, pero una llamada directa a la API podría usar esa cuenta.
- **Recomendación:** Rechazar cuentas solo contable en bulk (igual que en otros flujos).

### 5.2 Cuentas solo contable (CpC/CpP)
- En flujos de pagos/cobros/transferencias se usa `excludeAccountingOnly` al listar cuentas.  
- Si alguien llama las APIs con un `financial_account_id` de CpC/CpP (ej. por manipulación de requests), hay que validar en backend y rechazar. Hoy no está comprobado en todos los endpoints.

### 5.3 Rounding y decimales
- IVA y varios cálculos usan `Math.round(x * 100) / 100`.  
- En ledger y pagos se usa `parseFloat` y `Number` sin una política única de redondeo.  
- **Recomendación:** Centralizar redondeo (ej. 2 decimales) en un helper y usarlo en todos los montos que se persisten.

### 5.4 Concurrencia
- No hay bloqueos optimistas ni versionado. Dos usuarios pagando al mismo tiempo desde la misma cuenta podrían superar el saldo aunque cada request pase `validateSufficientBalance` en su momento.  
- **Recomendación:** Valorar transacciones explícitas y/o checks de saldo justo antes del `INSERT` en ledger (o uso de constraints/triggers en DB).

---

## 6. Resumen de prioridades

### Crítico
1. **Pago masivo operadores:** Añadir `validateSufficientBalance` (y rechazar el batch si no hay saldo).
2. **DELETE cash movement:** Arreglar match cuando `operation_id` es null; invalidar caché de balance; idealmente enlazar `cash_movement` ↔ `ledger_movement` por ID.

### Importante
3. **Definir** si se mantiene `cash_boxes`/`cash_movements` o se migra todo a `financial_accounts` + ledger.  
4. **Unificar** la vista “Movimientos” con la fuente de datos que se considere fuente de verdad (ledger vs cash).  
5. **Revisar** “Sincronizar movimientos”: necesidad real y coherencia con ledger.

### Mejoras
6. Rechazar explícitamente cuentas solo contable en bulk (y en el resto de endpoints que deban hacerlo).  
7. Política única de redondeo para montos.  
8. Reducir o eliminar código muerto (calendar-01/04, `data-table`, scripts ` 2`).  
9. Excluir `backups/` o `*.json` de backups en el repo vía `.gitignore`.  
10. Decidir qué hacer con `payment-coupons` y `card-transactions` (uso real o deprecación).

---

## 7. Preguntas para el cliente (checklist)

### Caja y movimientos
1. ¿`cash_boxes` y `cash_movements` siguen siendo necesarios o todo debería vivir en `financial_accounts` + ledger?  
2. ¿“Movimientos de caja” debe mostrar ledger (por cuenta) o seguir con `cash_movements`?  
3. ¿Sincronizar movimientos debe seguir creando `cash_movements` o puede eliminarse?  
4. ¿Movimientos y Pagos deben estar en el menú de Caja (sidebar)?

### Funcionalidad
5. ¿`payment_coupons` y `card_transactions` se usan o pueden deprecarse?  
6. Si hay `cash_boxes`: ¿cómo se crea una “caja” nueva? Hoy “Nueva cuenta” está en Cuentas Financieras.

### Contable
7. ¿Al eliminar un movimiento manual, debe revertirse siempre el ledger (y por tanto el saldo)?  
8. ¿Bulk de pagos a operadores debe fallar todo el lote si una sola cuenta no tiene saldo, o se admite procesamiento parcial?  
9. ¿Queremos protección explícita frente a concurrencia (ej. doble pago casi simultáneo) en cuentas críticas?

### Código y datos
10. ¿Los scripts con ` 2` en el nombre pueden eliminarse?  
11. ¿`backups/` debe estar en el repo o ignorarse?  
12. ¿Algún otro flujo “legacy” que se sepa que ya no se usa y pueda apagarse?

---

*Documento generado a partir de una auditoría estática y revisión de flujos. Conviene validar en entorno de staging y con datos reales antes de aplicar cambios.*
