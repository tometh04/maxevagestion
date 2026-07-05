# Workaround de testeo – Fixes de auditoría (finanzas y contabilidad)

**Objetivo:** Validar todos los cambios aplicados tras la auditoría (`AUDITORIA_SISTEMA_FINANZAS_CONTABILIDAD.md`).  
**Quién ejecuta primero:** Desarrollo. **Quién audita:** Cliente/Product Owner.

---

## 0. Pre-requisitos

- [ ] `npm run build` en `erplozada` termina sin errores.
- [ ] Migración `090_add_ledger_movement_id_to_cash_movements.sql` aplicada en la DB (Supabase).
  - Local: `npx supabase db push` o aplicar el SQL a mano.
  - Producción: desplegar migraciones vía tu pipeline.
- [ ] Servidor dev corriendo (`npm run dev`) y logueado como usuario con rol **ADMIN** o **SUPER_ADMIN** (y acceso a Caja / Contabilidad).

---

## 1. Pago masivo a operadores – Saldo y CpC/CpP

### 1.1 Rechazo por saldo insuficiente

**Pasos:**

1. Ir a **Contabilidad → Pagos a Operadores**.
2. Abrir **Pago masivo** (bulk).
3. Elegir un operador con deudas pendientes y una cuenta financiera que **tengas seguro que tiene saldo muy bajo o cero** (ej. una caja de prueba).
4. Seleccionar varios pagos cuya suma sea **mayor** que el saldo de esa cuenta.
5. Intentar confirmar el pago masivo.

**Resultado esperado:**

- El sistema **rechaza** el lote completo.
- Mensaje de error tipo: **"Saldo insuficiente en la cuenta"** (o similar), sin que se haya registrado ningún pago.

**Checklist auditor:**

- [ ] No se crean pagos cuando el total supera el saldo.
- [ ] El mensaje es claro (saldo insuficiente).

---

### 1.2 Rechazo por cuenta solo contable (CpC/CpP)

**Pasos:**

1. En **Pago masivo**, si en algún flujo pudieras elegir cuenta (en la UI suelen ocultarse las CpC/CpP):
   - Si **no** se pueden elegir: considerar este caso cubierto por UI.
2. **Prueba vía API** (opcional): `POST /api/accounting/operator-payments/bulk` con `payment_account_id` = ID de una cuenta **Cuentas por Cobrar** o **Cuentas por Pagar**.

**Resultado esperado:**

- Si se permite elegir CpC/CpP en algún lado, el backend debe responder **400** con mensaje tipo: **"No se puede usar una cuenta solo contable (Cuentas por Cobrar/Pagar) para pagos."**

**Checklist auditor:**

- [ ] No se usan cuentas CpC/CpP para pagos masivos (ya sea por UI o por API).

---

## 2. Movimientos de caja – POST, `ledger_movement_id`, DELETE y caché

### 2.1 Crear movimiento y verificar `ledger_movement_id`

**Pasos:**

1. Ir a **Caja → Movimientos** (ahora en el menú bajo Caja).
2. **Nuevo movimiento**: Ingreso o egreso manual, cuenta financiera con saldo conocido, monto y fecha.
3. Crear y anotar el **ID del movimiento** (o identificarlo en tabla/listado).

**Resultado esperado:**

- Movimiento creado.
- En DB: `cash_movements.ledger_movement_id` tiene valor (no null) para ese movimiento.

**Checklist auditor:**

- [ ] Movimiento creado correctamente.
- [ ] `ledger_movement_id` guardado en `cash_movements` (verificar en DB si se puede).

---

### 2.2 Eliminar movimiento (con `ledger_movement_id`) y saldo

**Pasos:**

1. Crear un **ingreso** manual en una cuenta y anotar saldo antes.
2. Eliminar ese movimiento vía **DELETE**:
   - `DELETE /api/cash/movements?movementId=<id>` (si hay UI de eliminar, usar esa; si no, llamar al API con usuario ADMIN/SUPER_ADMIN).
3. Ver **Caja → Resumen** (o Libro Mayor) para esa cuenta.

**Resultado esperado:**

- El movimiento desaparece de Movimientos.
- El saldo de la cuenta **vuelve** al valor anterior al ingreso (el ledger_movement asociado se eliminó y se invalidó caché).

**Checklist auditor:**

- [ ] Al borrar movimiento, el saldo se actualiza correctamente (no queda “pegado” por caché).

---

### 2.3 Eliminar movimiento sin operación (`operation_id` null)

**Pasos:**

1. Crear un movimiento **manual sin operación** (sin vincular a operación).
2. Eliminarlo igual que en 2.2.

**Resultado esperado:**

- Movimiento eliminado.
- Ledger asociado también eliminado (ya no se usa solo `operation_id` para matchear; se usa `ledger_movement_id` o fallback con `is("operation_id", null)`).

**Checklist auditor:**

- [ ] Movimientos sin operación se eliminan bien y el saldo se corrige.

---

## 3. Navegación – Caja

**Pasos:**

1. Abrir el menú **Finanzas → Caja** en el sidebar.

**Resultado esperado:**

- Dentro de Caja aparecen:
  - Resumen  
  - Ingresos  
  - Egresos  
  - **Movimientos**  
  - **Pagos**

**Checklist auditor:**

- [ ] Movimientos y Pagos accesibles desde el menú de Caja.

---

## 4. Redondeo y helper `roundMoney`

**Pasos:**

1. Crear movimientos o pagos con montos con varios decimales (ej. 1000.456).
2. Revisar en **Libro Mayor** o **Movimientos** y en DB que los valores persistidos usen **2 decimales** (redondeo consistente).

**Resultado esperado:**

- No hay montos “sucios” con muchos decimales; se usa `roundMoney` en rutas críticas (movimientos, bulk).

**Checklist auditor:**

- [ ] Montos mostrados y guardados con redondeo coherente.

---

## 5. Código muerto y deprecaciones

**Verificación rápida:**

- [ ] No existen `components/calendar-01.tsx`, `components/calendar-04.tsx`, `components/data-table.tsx`.
- [ ] No existen scripts `* 2.ts` (ej. `test-system-api-real 2.ts`, etc.).
- [ ] `.gitignore` incluye `/backups/`.
- [ ] En `app/api/payment-coupons/route.ts` y `app/api/card-transactions/route.ts` hay comentarios `@deprecated` referenciando la auditoría.

---

## 6. Script de comprobación vía API (opcional)

En `erplozada`:

```bash
npm run test:audit-fixes
# o: npx tsx scripts/test-audit-fixes.ts
```

El script:

- Llama a **bulk** con una cuenta sin saldo suficiente y espera **400**.
- (Opcional) Llama a **bulk** con `payment_account_id` = CpC/CpP y espera **400**.

Marcar en el workaround:

- [ ] Script ejecutado sin errores y los rechazos (400) son los esperados.

---

## 7. Resumen para el auditor

| # | Área | Qué se probó | OK / Falla |
|---|------|--------------|------------|
| 1.1 | Bulk operadores | Rechazo por saldo insuficiente | |
| 1.2 | Bulk operadores | Rechazo CpC/CpP (UI o API) | |
| 2.1 | Movimientos | POST y `ledger_movement_id` | |
| 2.2 | Movimientos | DELETE con id y actualización de saldo | |
| 2.3 | Movimientos | DELETE sin operación | |
| 3 | Navegación | Movimientos y Pagos en menú Caja | |
| 4 | Redondeo | `roundMoney` en montos | |
| 5 | Código | Dead code y deprecaciones | |
| 6 | Script | `test-audit-fixes.ts` | |

**Cierre:** Cuando todas las filas estén en **OK**, se considera cerrado el workaround de testeo para estos fixes.
