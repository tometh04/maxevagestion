# Tutorial: Importar operadores (proveedores)

Usá este tipo de importación para cargar el catálogo de operadores o proveedores mayoristas de tu agencia — Despegar, Booking, Lozada, CVC, aerolíneas, hoteles, etc.

**Cuándo tiene sentido:**
- Querés tener los proveedores cargados antes de empezar a registrar operaciones manualmente.
- Venías de otro sistema y querés migrar la lista de contactos de proveedores.
- Necesitás cargar límites de crédito por proveedor para el control de deuda.

> Si ya tenés operaciones para importar con [Operaciones Master](./01-operaciones-master.md), ese proceso crea los operadores automáticamente — no necesitás importarlos por separado.

---

## Paso a paso

1. Andá a `/settings/import-v2`.
2. Elegí **"Operadores"** como tipo de importación.
3. Elegí la **agencia destino**.
4. Descargá la plantilla, completala y guardala como CSV.
5. Subila, hacé **"Vista previa"** y luego **"Confirmar e importar"**.

---

## Campos del CSV

| Campo | ¿Obligatorio? | Descripción | Ejemplo |
|-------|:---:|---|---|
| Nombre | **Sí** | Nombre del operador o proveedor. | `Despegar` |
| Contacto | No | Nombre de la persona de contacto en ese proveedor. | `María García` |
| Email Contacto | No | Email del contacto. | `ventas@despegar.com` |
| Teléfono Contacto | No | Teléfono del contacto. | `+54 11 8765-4321` |
| Límite Crédito | No | Monto máximo de deuda que aceptás tener con este proveedor (en ARS). | `5000000` |

---

## Ejemplo con 4 filas

```csv
Nombre,Contacto,Email Contacto,Teléfono Contacto,Límite Crédito
Despegar,María García,ventas@despegar.com,+54 11 8765-4321,5000000
Lozada Viajes,Carlos Lozada,clozada@lozada.com.ar,+54 341 456-7890,3000000
Booking.com,,soporte@booking.com,,0
American Airlines,Ventas Agencias,agencias@aa.com,0800-333-2424,
```

---

## Cómo funciona el control de duplicados

Los operadores se deduplicán **por nombre**, sin distinguir mayúsculas ni minúsculas. Es decir:

- `Despegar`, `DESPEGAR` y `despegar` son considerados el mismo operador.
- Si ya existe un operador con ese nombre en tu agencia, la fila se ignora (no crea un duplicado ni pisa los datos existentes).

Por eso es importante que el nombre sea consistente con el que ya tenés en el sistema — o con el que vas a usar en el CSV de operaciones.

---

## Consejos

- El **Límite Crédito** es opcional, pero te ayuda a controlar cuánto debés a cada proveedor desde la vista de finanzas.
- Si un proveedor no tiene contacto asignado todavía, dejá las columnas de contacto vacías — podés completarlas después desde el panel de operadores.
- Si importás operadores y después importás operaciones que los referencian, asegurate de que el nombre en ambos CSVs sea idéntico (mismo formato, sin errores de tipeo).
