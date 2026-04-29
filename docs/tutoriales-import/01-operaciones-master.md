# Tutorial: Importar operaciones (historial completo)

Este es el tipo de importación más completo y el que vas a usar primero si sos una agencia nueva que quiere cargar su historial de ventas.

**Una sola fila del CSV genera automáticamente:**
- Una operación
- El cliente (si no existe, lo crea; si ya existe, lo reutiliza)
- Hasta 3 operadores/proveedores
- Los pagos cobrados y pendientes, tanto del cliente como al proveedor

---

## Cuándo usar este tipo

- Arrancás con Vibook y querés cargar todos tus viajes anteriores.
- Tenés un Excel con ventas del año y querés pasarlo al sistema.
- Necesitás registrar operaciones con su estado de cobro incluido.

Si solo querés cargar clientes o proveedores sin operaciones, usá los tutoriales [02-clientes](./02-clientes.md) o [03-operadores](./03-operadores.md).

---

## Paso a paso

1. Andá a `/settings/import-v2`.
2. En **Tipo de importación**, elegí **"Operaciones Master"**.
3. Elegí la **agencia destino**.
4. Hacé click en **"Descargar plantilla CSV"** y abrila con Excel o Google Sheets.
5. Completá tus datos siguiendo la tabla de campos de abajo.
6. Guardá el archivo como `.csv` (en Excel: Archivo → Guardar como → CSV UTF-8).
7. Configurá el tipo de cambio (si tus montos son en USD, ver sección más abajo).
8. Subí el archivo y hacé click en **"Vista previa"**.
9. Revisá los errores y advertencias, corregí si hace falta.
10. Si todo se ve bien, hacé click en **"Confirmar e importar"**.

---

## Tabla de campos

| Campo | ¿Obligatorio? | Descripción | Ejemplo |
|-------|:---:|---|---|
| Código | No | Código propio de la operación. Si lo dejás vacío, el sistema genera uno automático. | `OP-2024-001` |
| Fecha Operación | **Sí** | Fecha en que se registró la venta. Formato `YYYY-MM-DD` o `DD/MM/YYYY`. | `15/03/2026` |
| Nombre del Cliente | **Sí** | Nombre completo del pasajero principal. | `Juan Pérez` |
| Email Cliente | No | Email del cliente. Ayuda a evitar duplicados. | `juan@gmail.com` |
| Destino | **Sí** | Destino del viaje. Texto libre. | `Cancún` |
| Fecha Salida | **Sí** | Fecha de salida. Formato `DD/MM/YYYY` o `YYYY-MM-DD`. | `10/04/2026` |
| Fecha Regreso | No | Fecha de regreso. Mismo formato. Si es solo ida, dejalo vacío. | `17/04/2026` |
| Adultos | No | Cantidad de pasajeros adultos. Si lo dejás vacío, el sistema asume 1. | `2` |
| Niños | No | Cantidad de menores. Si lo dejás vacío, el sistema asume 0. | `1` |
| Monto Venta | **Sí** | Total que le cobrás al cliente. Número positivo. | `1500000` |
| Monto Cobrado | No | Cuánto ya cobró la agencia del total. Genera un pago **cobrado**. Por defecto 0. | `800000` |
| Pendiente de Cobrar | No | Cuánto queda por cobrar. Genera un pago **pendiente**. Por defecto 0. | `700000` |
| Monto Operador | No | Suma de lo que cuesta a los proveedores (informativo). | `1200000` |
| Pagado a Operador | No | Cuánto ya se le pagó al proveedor. Genera un pago **pagado** (egreso). Por defecto 0. | `500000` |
| Pendiente a Operador | No | Cuánto queda por pagar al proveedor. Genera un pago **pendiente** (egreso). Por defecto 0. | `700000` |
| Operador 1 | No | Nombre del primer proveedor. Si no existe, se crea. | `Despegar` |
| Costo Operador 1 | No | Costo asignado al primer proveedor. | `1200000` |
| Operador 2 | No | Nombre del segundo proveedor (opcional). | `Booking` |
| Costo Operador 2 | No | Costo del segundo proveedor. | `0` |
| Operador 3 | No | Nombre del tercer proveedor (opcional). | _(vacío)_ |
| Costo Operador 3 | No | Costo del tercer proveedor. | _(vacío)_ |
| Moneda | **Sí** | `ARS` o `USD`. | `ARS` |
| Estado | No | Estado de la operación. Valores aceptados: `RESERVED`, `CONFIRMED`, `CANCELLED`, `TRAVELLING`, `TRAVELLED`. Por defecto: `CONFIRMED`. | `CONFIRMED` |
| Nombre Vendedor | No | Nombre o email del vendedor. El sistema busca en los usuarios de la agencia. | `maria@agencia.com` |

---

## Ejemplo con 5 filas reales

```csv
Código,Fecha Operación,Nombre del Cliente,Email Cliente,Destino,Fecha Salida,Fecha Regreso,Adultos,Niños,Monto Venta,Monto Cobrado,Pendiente de Cobrar,Monto Operador,Pagado a Operador,Pendiente a Operador,Operador 1,Costo Operador 1,Operador 2,Costo Operador 2,Operador 3,Costo Operador 3,Moneda,Estado,Nombre Vendedor
,15/03/2026,Juan Pérez,juan@gmail.com,Cancún,10/04/2026,17/04/2026,2,0,1500000,800000,700000,1200000,500000,700000,Despegar,1200000,,,,,ARS,CONFIRMED,
,02/03/2026,María González,maria.g@hotmail.com,Bayahibe,20/05/2026,27/05/2026,2,1,2200000,2200000,0,1800000,1800000,0,Lozada Viajes,1800000,,,,,ARS,CONFIRMED,vendedor@miagencia.com
OP-2025-890,10/01/2026,Roberto Sánchez,,Punta Cana,15/02/2026,22/02/2026,1,0,950000,500000,450000,750000,0,750000,Avantrip,750000,,,,,ARS,RESERVED,
,28/02/2026,Claudia Martínez,claudia@yahoo.com,Miami,01/06/2026,,3,2,3800000,3800000,0,3100000,3100000,0,Despegar,2000000,American Airlines,1100000,,0,ARS,CONFIRMED,
,05/03/2026,Familia López,,Río de Janeiro,10/07/2026,20/07/2026,2,2,1800000,900000,900000,1400000,700000,700000,CVC Brasil,900000,Latam,500000,,0,USD,CONFIRMED,
```

> **Nota sobre la última fila**: está en USD. El sistema la convierte a ARS según el tipo de cambio que configures (ver sección siguiente).

---

## Cómo configurar el tipo de cambio

Este paso solo aparece si alguna fila de tu CSV tiene `Moneda = USD`.

Tenés tres opciones:

### Opción 1 — Tipos de cambio mensuales (recomendado)

El sistema usa los tipos de cambio que tenés cargados en **Configuración → Tipos de cambio**, mes a mes. Si falta el rate de algún mes, cae al valor manual que ingreses como respaldo.

Esta es la opción más precisa si trabajás con cotizaciones históricas.

### Opción 2 — Solo tipos de cambio mensuales

Igual que la anterior, pero sin fallback manual. Si falta el rate de algún mes, **esa fila da error**. Usala cuando querés asegurarte de no importar con un rate incorrecto.

### Opción 3 — Rate manual fijo

Ingresás un solo número (ej: `1450`) y se aplica a todas las filas en USD. Práctico para cargas rápidas donde la variación mensual no importa.

---

## Qué se crea cuando subís una fila

Cuando confirmás la importación, por cada fila válida el sistema hace lo siguiente:

1. **Cliente**: busca si ya existe alguien con el mismo email o nombre. Si no existe, lo crea. Si ya existe, vincula la operación a ese cliente (sin duplicarlo).

2. **Operadores**: mismo proceso — por cada operador en la fila (hasta 3), busca si ya existe por nombre. Si no, lo crea.

3. **Operación**: se crea con todos los datos de la fila (destino, fechas, montos, estado, etc.).

4. **Pagos**: según los montos que hayas completado, se generan hasta 4 pagos por operación:
   - Ingreso cobrado (Monto Cobrado > 0)
   - Ingreso pendiente (Pendiente de Cobrar > 0)
   - Egreso pagado al operador (Pagado a Operador > 0)
   - Egreso pendiente al operador (Pendiente a Operador > 0)

---

## Errores comunes y cómo arreglarlos

| Error | Causa probable | Cómo arreglarlo |
|-------|---------------|-----------------|
| `Falta campo obligatorio: Nombre del Cliente` | La columna está vacía en esa fila. | Completá el nombre del cliente. |
| `Fecha inválida: "31-13-2026"` | El formato de fecha está mal o la fecha no existe. | Usá `DD/MM/YYYY` o `YYYY-MM-DD` y verificá que la fecha sea real. |
| `Monto venta inválido` | El monto es negativo, tiene letras, o está vacío. | Usá solo números positivos, sin letras. Podés usar punto decimal (ej: `1500.50`). |
| `Moneda inválida: "DOLAR"` | El campo Moneda tiene un valor que el sistema no reconoce. | Usá exactamente `ARS` o `USD`. |
| `Estado inválido: "Viajando"` | El estado tiene un valor no permitido. | Usá uno de: `RESERVED`, `CONFIRMED`, `CANCELLED`, `TRAVELLING`, `TRAVELLED`. |
| `No se encontró tipo de cambio para 2025-06` | Tenés filas en USD del mes 2025-06 y no hay rate cargado para ese mes. | Cargá el tipo de cambio de ese mes en Configuración, o usá el modo "Rate manual fijo". |
| `Falta Fecha Salida` | La columna está vacía. | La fecha de salida es obligatoria. |

---

## Cómo verificar que se importó bien

Después de importar:

1. Andá a **Operaciones** en el menú lateral.
2. Buscá por destino, cliente o fecha para encontrar las operaciones que subiste.
3. Hacé click en una operación y verificá que los montos, pagos y operadores estén correctos.
4. Si encontrás algo mal, podés editar la operación manualmente desde el detalle.

Si querés verificar los clientes, andá a **Clientes** y buscá por nombre.

---

## Consejos para armar el CSV

- Usá la plantilla descargada — ya tiene los nombres de columna correctos.
- No cambies el orden de las columnas.
- No borres la primera fila (encabezados).
- Guardá el archivo como **CSV UTF-8** para que los acentos (ó, é, ü) se guarden bien. En Excel: *Archivo → Guardar como → CSV UTF-8 (con BOM)*.
- Si una columna no aplica a una fila, dejala vacía — no pongas un guión ni un cero si el campo es opcional.
