# Tutorial: Importar pagos sueltos

Usá este tipo de importación para agregar pagos a operaciones que **ya existen en Vibook**. No crea operaciones nuevas — solo les suma cobros o egresos a las que ya están cargadas.

**Cuándo tiene sentido:**
- Tus operaciones ya están en el sistema (sea porque las importaste o las cargaste a mano) y querés registrar los pagos en lote.
- Tenés un extracto bancario o un resumen de cobros del mes y querés cargarlo de una vez.
- Querés registrar pagos a proveedores de forma masiva.

> Si necesitás importar operaciones **con** sus pagos de entrada, usá [Operaciones Master](./01-operaciones-master.md) — incluye los pagos en la misma fila.

---

## Paso a paso

1. Andá a `/settings/import-v2`.
2. Elegí **"Pagos sueltos"** como tipo de importación.
3. Elegí la **agencia destino**.
4. Descargá la plantilla, completala y guardala como CSV.
5. Subila, hacé **"Vista previa"** y luego **"Confirmar e importar"**.

---

## Campos del CSV

| Campo | ¿Obligatorio? | Descripción | Ejemplo |
|-------|:---:|---|---|
| Código Operación | **Sí** | El código de la operación a la que se asocia este pago. Debe coincidir **exactamente** con el código en Vibook. | `OP-2026-001` |
| Monto | **Sí** | Monto del pago. Número positivo. | `500000` |
| Moneda | **Sí** | `ARS` o `USD`. | `ARS` |
| Fecha Vencimiento | **Sí** | Fecha límite del pago. Formato `YYYY-MM-DD` o `DD/MM/YYYY`. | `15/04/2026` |
| Dirección | **Sí** | `INCOME` si es un cobro al cliente, `EXPENSE` si es un pago al proveedor. | `INCOME` |
| Fecha Pago | No | Si el pago ya se realizó, poné la fecha aquí. Si está pendiente, dejalo vacío. | `10/04/2026` |
| Tipo Pagador | No | Quién paga o cobra. `CUSTOMER` para cliente, `OPERATOR` para proveedor. | `CUSTOMER` |
| Método | No | Método de pago. Ej: `TRANSFER`, `CASH`, `CARD`. | `TRANSFER` |
| Referencia | No | Número de transferencia, comprobante u otro dato de referencia. | `REF-00123` |

---

## Ejemplo con 3 filas

```csv
Código Operación,Monto,Moneda,Fecha Vencimiento,Fecha Pago,Dirección,Tipo Pagador,Método,Referencia
OP-2026-001,500000,ARS,15/04/2026,10/04/2026,INCOME,CUSTOMER,TRANSFER,REF-00123
OP-2026-001,700000,ARS,30/04/2026,,INCOME,CUSTOMER,,
OP-2026-002,1200000,ARS,20/04/2026,18/04/2026,EXPENSE,OPERATOR,TRANSFER,TRF-9988
```

En este ejemplo:
- Las dos primeras filas agregan pagos a la operación `OP-2026-001`: uno ya cobrado (el 10/04) y uno pendiente.
- La tercera fila registra un egreso pagado al proveedor de la operación `OP-2026-002`.

---

## Cómo encontrar el código de una operación

El código de operación es el identificador que ves en la lista de operaciones, en la columna "Código" o en el detalle de la operación.

Para encontrarlo:

1. Andá a **Operaciones** en el menú lateral.
2. Buscá la operación por cliente o destino.
3. El código aparece en la primera columna (ej: `OP-2026-047`).
4. Copialo exactamente como aparece — incluyendo guiones y mayúsculas.

> **Importante**: si el código que ponés en el CSV no existe en tu agencia, esa fila da error y no se procesa. El sistema no crea la operación — solo registra el pago.

---

## Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `Operación no encontrada: OP-2026-999` | Ese código no existe en la agencia seleccionada. | Verificá el código desde el listado de operaciones. Puede tener un guion de más o estar en otra agencia. |
| `Dirección inválida: "Cobro"` | El campo Dirección tiene un valor no reconocido. | Usá exactamente `INCOME` o `EXPENSE`. |
| `Monto inválido` | El monto está vacío, es negativo, o tiene letras. | Usá solo números positivos. |
| `Moneda inválida` | La moneda no es `ARS` ni `USD`. | Corregí el valor. |
| `Falta Fecha Vencimiento` | La columna está vacía. | La fecha de vencimiento es obligatoria, aunque el pago ya se haya realizado. |
