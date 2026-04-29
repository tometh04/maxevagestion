# Importación de datos en Vibook

Vibook te permite cargar datos históricos de tu agencia (operaciones, clientes, proveedores, pagos y movimientos de caja) desde archivos CSV. No necesitás saber programar — con un Excel o Google Sheets alcanza.

---

## Los 5 tipos de importación

| # | Tipo | Cuándo usarlo |
|---|------|---------------|
| 1 | [Operaciones Master](./01-operaciones-master.md) | Cargás tu historial completo de ventas. **Empezá por acá.** |
| 2 | [Clientes](./02-clientes.md) | Cargás solo el catálogo de clientes, sin operaciones. |
| 3 | [Operadores](./03-operadores.md) | Cargás proveedores/mayoristas (Despegar, Booking, etc.). |
| 4 | [Pagos sueltos](./04-pagos-sueltos.md) | Agregás pagos a operaciones que ya existen en el sistema. |
| 5 | [Movimientos de caja](./05-movimientos-caja.md) | Cargás movimientos de caja no vinculados a una operación. |

---

## Antes de empezar

- **Rol necesario**: tu usuario debe tener rol **ADMIN** en al menos una agencia.
- **Agencia configurada**: tenés que tener al menos una agencia creada en Vibook. La importación siempre se asocia a una agencia concreta.
- **Archivo CSV**: podés armar el CSV con Excel, Google Sheets, LibreOffice, o cualquier editor de texto. Lo importante es que las columnas coincidan con la plantilla.
- **Formato de fechas**: el sistema acepta `YYYY-MM-DD` (ej: `2026-03-15`) o `DD/MM/YYYY` (ej: `15/03/2026`). Elegí uno y usalo siempre en el mismo archivo.
- **Montos**: podés escribirlos como `1234.56` o `$1.234,56` — el sistema los limpia. No pongas montos negativos.
- **Tamaño máximo**: 10 MB por archivo. Si tu CSV es más grande, cortalo en partes.

---

## Cómo funciona en general

El sistema tiene dos pasos antes de guardar nada:

### Paso 1 — Vista previa (dry-run)

Cuando subís el CSV, primero hacés click en **"Vista previa"**. El sistema lee todo el archivo, valida cada fila, y te muestra:

- Cuántas filas son válidas y cuántas tienen errores.
- Un resumen de qué se va a crear (X clientes, Y operaciones, Z pagos).
- Una tabla con los errores fila por fila, para que los puedas corregir.

**No se guarda nada en este paso.**

### Paso 2 — Confirmar e importar

Si el preview te convence, hacés click en **"Confirmar e importar"**. El sistema ejecuta todos los inserts y te muestra el resultado final.

Si hay errores en algunas filas pero el resto es válido, podés decidir importar de todas formas (las filas con error se saltan) o corregir el CSV y volver a subir.

---

## Cómo llegar a la pantalla de importación

1. Entrá a Vibook (app.vibook.ai).
2. Andá a **Configuración** → **Importar datos** (o ingresá directo a `/settings/import-v2`).

---

## Garantías de privacidad

Cada importación queda **vinculada exclusivamente a la agencia que seleccionás**. No hay forma de que los datos de una agencia sean visibles por otra — el sistema aísla la información a nivel de base de datos.

Si tenés acceso a múltiples agencias (por ejemplo, "Rosario" y "Madero"), en el paso 1 de la importación elegís a cuál va la data. Podés subir el mismo CSV a dos agencias distintas sin que se mezclen.

---

## Problemas frecuentes

Si algo no sale como esperás, revisá la guía de [Problemas frecuentes y errores comunes](./troubleshooting.md).
