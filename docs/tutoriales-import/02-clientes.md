# Tutorial: Importar clientes

Usá este tipo de importación cuando querés cargar el catálogo de clientes de tu agencia sin asociarlos todavía a ninguna operación o venta.

**Cuándo tiene sentido:**
- Venías usando otro sistema y querés traer la base de contactos a Vibook.
- Querés tener los clientes cargados antes de empezar a cargar operaciones manualmente.
- Tenés una lista de clientes a los que todavía no les vendiste nada.

> Si ya tenés operaciones para asociar, usá directamente [Operaciones Master](./01-operaciones-master.md) — ese proceso crea los clientes automáticamente.

---

## Paso a paso

1. Andá a `/settings/import-v2`.
2. Elegí **"Clientes"** como tipo de importación.
3. Elegí la **agencia destino**.
4. Descargá la plantilla, completala y guardala como CSV.
5. Subila, hacé **"Vista previa"** y luego **"Confirmar e importar"**.

---

## Campos del CSV

| Campo | ¿Obligatorio? | Descripción | Ejemplo |
|-------|:---:|---|---|
| Nombre | **Sí** | Nombre del cliente. | `Juan` |
| Apellido | **Sí** | Apellido del cliente. | `Pérez` |
| Teléfono | **Sí** | Número de contacto. Puede incluir código de área. | `+54 11 1234-5678` |
| Email | No | Email de contacto. | `juan@gmail.com` |
| Tipo Documento | No | Tipo de documento de identidad. Ej: `DNI`, `Pasaporte`, `CUIT`. | `DNI` |
| Número Documento | No | Número del documento. | `30123456` |
| Fecha Nacimiento | No | Formato `YYYY-MM-DD` o `DD/MM/YYYY`. | `15/06/1985` |
| Nacionalidad | No | País de origen. Texto libre. | `Argentina` |

---

## Ejemplo con 3 filas

```csv
Nombre,Apellido,Teléfono,Email,Tipo Documento,Número Documento,Fecha Nacimiento,Nacionalidad
Juan,Pérez,+54 11 1234-5678,juan@gmail.com,DNI,30123456,15/06/1985,Argentina
María,González,+54 9 351 456-7890,maria.g@hotmail.com,DNI,27654321,22/03/1990,Argentina
Roberto,Sánchez,+54 11 9876-5432,,Pasaporte,AAB123456,01/01/1978,Uruguay
```

---

## Cómo funciona el control de duplicados

El sistema evita crear el mismo cliente dos veces usando este orden de prioridad:

1. **Por número de documento** (DNI, pasaporte, etc.) — si ya existe un cliente con ese número en tu agencia, se usa ese registro y no se crea uno nuevo.
2. **Por email** — si no hay documento cargado, busca por email.
3. **Por nombre completo** — si tampoco hay email, compara nombre + apellido (sin distinguir mayúsculas/minúsculas).

Si el sistema detecta que un cliente ya existe, la fila se considera "sin cambios" — no duplica ni pisa el cliente existente.

---

## Consejos

- Cuanto más datos cargues (especialmente DNI y email), mejor funciona el control de duplicados.
- Si tenés clientes con el mismo nombre pero son personas distintas, asegurate de que tengan DNI o email distintos para que el sistema no los confunda.
- El teléfono es obligatorio, pero el formato es libre — podés poner `1112345678` o `+54 11 1234-5678`, el sistema lo acepta igual.
