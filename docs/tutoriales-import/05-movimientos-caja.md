# Tutorial: Importar movimientos de caja

Usá este tipo de importación para cargar movimientos de caja de forma masiva — ingresos y egresos que no necesariamente están vinculados a una operación de viaje.

**Cuándo tiene sentido:**
- Querés registrar el historial de tu caja chica o cuenta bancaria.
- Tenés gastos fijos (alquiler, servicios, sueldos) que querés cargar en lote.
- Tenés cobros sueltos que no corresponden a ningún viaje específico.
- Necesitás importar movimientos desde otro sistema o planilla de Excel.

---

## Paso a paso

1. Andá a `/settings/import-v2`.
2. Elegí **"Movimientos de caja"** como tipo de importación.
3. Elegí la **agencia destino**.
4. Descargá la plantilla, completala y guardala como CSV.
5. Subila, hacé **"Vista previa"** y luego **"Confirmar e importar"**.

---

## Campos del CSV

| Campo | ¿Obligatorio? | Descripción | Ejemplo |
|-------|:---:|---|---|
| Fecha | **Sí** | Fecha del movimiento. Formato `YYYY-MM-DD` o `DD/MM/YYYY`. | `15/04/2026` |
| Tipo | **Sí** | `INCOME` para un ingreso, `EXPENSE` para un egreso. | `INCOME` |
| Monto | **Sí** | Monto del movimiento. Número positivo. | `50000` |
| Moneda | **Sí** | `ARS` o `USD`. | `ARS` |
| Cuenta | No | Nombre de la caja o cuenta bancaria. Texto libre. | `Caja Principal` |
| Categoría | No | Categoría del movimiento. Texto libre. | `SALE` |
| Notas | No | Descripción o detalle adicional. Texto libre. | `Cobro anticipo Juan Pérez` |
| Código Operación | No | Si el movimiento corresponde a una operación, poné su código acá para vincularlo. Si no aplica, dejalo vacío. | `OP-2026-047` |

---

## Ejemplo con 4 filas

```csv
Fecha,Tipo,Monto,Moneda,Cuenta,Categoría,Notas,Código Operación
15/04/2026,INCOME,500000,ARS,Caja Principal,SALE,Cobro anticipo Juan Pérez,OP-2026-001
10/04/2026,EXPENSE,85000,ARS,Cuenta Corriente,ADMIN,Alquiler oficina abril,,
08/04/2026,INCOME,1200000,ARS,Caja Principal,SALE,Cobro total María González,OP-2026-002
05/04/2026,EXPENSE,45000,ARS,Caja Chica,ADMIN,Materiales de oficina,
```

---

## Vincular un movimiento a una operación

Si el movimiento corresponde a un viaje concreto, podés ponerle el código de operación en la última columna. Esto lo vincula al detalle de esa operación.

Si dejás ese campo vacío, el movimiento queda como un movimiento de caja libre, sin asociación a ninguna operación.

Para encontrar el código de una operación, andá a **Operaciones** en el menú, buscá la que necesitás, y copiá el código que aparece en la primera columna (ej: `OP-2026-047`).

---

## Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `Tipo inválido: "Ingreso"` | El campo Tipo tiene un valor no reconocido. | Usá exactamente `INCOME` o `EXPENSE`. |
| `Monto inválido` | El monto está vacío, es negativo, o tiene letras. | Usá solo números positivos. |
| `Moneda inválida` | La moneda no es `ARS` ni `USD`. | Corregí el valor. |
| `Operación no encontrada: OP-2026-999` | El código de operación no existe en la agencia. | Verificá el código o dejá la columna vacía si no querés vincularlo. |
| `Falta Fecha` | La columna Fecha está vacía. | La fecha es obligatoria. |
