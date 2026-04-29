# Problemas frecuentes al importar

Esta guía cubre los errores más comunes que podés encontrar durante una importación y cómo resolverlos.

---

## Errores al intentar subir el archivo

### "El archivo supera el límite de 10 MB"

El CSV es demasiado grande. Solución: cortalo en partes más chicas.

En Excel podés hacerlo así:
1. Abrí el CSV original.
2. Seleccioná las primeras 2000 filas (después de los encabezados) y guardalas como un archivo nuevo.
3. Repetí con el resto de las filas.
4. Importá cada parte por separado.

---

### "Error: Pipeline inválido"

El sistema no reconoció el tipo de importación seleccionado. Esto es un problema interno — no tiene que ver con el CSV.

Qué hacer: recargá la página, volvé a elegir el tipo de importación, y si el error persiste, reportalo al soporte con el nombre del tipo que intentabas usar.

---

## Errores relacionados con la agencia

### "Error: Falta agency_id"

No seleccionaste ninguna agencia destino antes de subir el archivo.

Solución: volvé al paso 1 y elegí una agencia de la lista desplegable antes de continuar.

---

### "Error: No tiene acceso a esta agencia"

Tu usuario no pertenece a esa agencia o no tiene permisos suficientes.

Solución:
- Verificá que estés logueado con el usuario correcto.
- Pedile al administrador de esa agencia que te agregue como miembro con rol ADMIN.

---

## Errores de validación por fila

### "Fila X: Campo obligatorio vacío"

Alguno de los campos requeridos está en blanco en esa fila. Los campos obligatorios varían según el tipo de importación — cada tutorial tiene la tabla de campos con la columna "¿Obligatorio?".

Solución: abrí el CSV, andá a la fila indicada (recordá que la fila 1 son los encabezados, así que "Fila 2" en el error corresponde a la primera fila de datos), y completá el campo que falta.

---

### "Fila X: Email inválido"

El email en esa fila no tiene el formato correcto.

Solución: verificá que tenga el formato `usuario@dominio.com`. Valores como `juan @gmail.com` (con espacio) o `juan.gmail.com` (sin @) dan error.

Si no tenés el email del cliente, dejá la columna vacía — no pongas texto en su lugar.

---

### "Fila X: Monto venta inválido" / "Monto inválido"

El monto tiene un valor que el sistema no puede interpretar. Causas frecuentes:
- El monto es negativo (ej: `-5000`).
- Tiene letras o símbolos que el sistema no reconoce (ej: `$1.500,00` con formato europeo).
- La celda está vacía en un campo obligatorio.

Solución: usá solo números positivos. El punto decimal es aceptado (ej: `1500.50`). El símbolo `$` también se acepta. No uses coma como separador de miles si también vas a usar coma como decimal — es ambiguo.

---

### "Fila X: Fecha inválida"

La fecha no tiene un formato reconocible o la fecha no existe (ej: 31 de febrero).

Formatos aceptados:
- `YYYY-MM-DD` → `2026-04-15`
- `DD/MM/YYYY` → `15/04/2026`

Solución: elegí un formato y usalo de forma consistente en todo el archivo.

---

## Errores en pagos e importaciones que referencian operaciones

### "Operación no encontrada: OP-XXXX-XXX"

El código de operación que pusiste en el CSV no existe en la agencia seleccionada.

Causas posibles:
- El código tiene un error tipográfico (ej: `OP-2026-01` en vez de `OP-2026-001`).
- La operación existe pero en otra agencia — y la agencia seleccionada no es la correcta.
- La operación todavía no fue importada (primero hay que importar las operaciones y después los pagos sueltos).

Solución: andá a **Operaciones**, buscá la operación, y copiá el código exacto desde el listado.

---

## Dudas sobre el tipo de cambio

### "No se encontró tipo de cambio para YYYY-MM"

Tenés filas en USD de un mes para el que no hay tipo de cambio cargado.

Opciones:
1. Cargá el tipo de cambio faltante en **Configuración → Tipos de cambio**.
2. Cambiá el modo a **"Rate manual fijo"** y ponés un valor único para todo el CSV.
3. Si querés que esas filas den error en vez de usar un fallback, usá el modo **"Solo tipos de cambio mensuales"**.

---

### ¿Cuál modo de tipo de cambio conviene usar?

- Si tenés los tipos de cambio cargados mes a mes: usá **"Tipos de cambio mensuales (con fallback manual)"**.
- Si querés máxima precisión y preferís que falle antes de usar un rate incorrecto: usá **"Solo tipos de cambio mensuales"**.
- Si querés hacer una carga rápida sin preocuparte por la cotización histórica: usá **"Rate manual fijo"** y poné el valor aproximado que corresponda.

---

## Usuarios con acceso a múltiples agencias

### Tengo "Rosario" y "Madero" — ¿cómo elijo a cuál va la importación?

En el **Paso 1** de la importación aparece un selector de agencia. Elegís la que corresponde antes de subir el CSV.

Si subiste a la agencia equivocada, no hay forma de mover los datos automáticamente — tendrías que eliminar lo importado y volver a subirlo a la agencia correcta. Por eso, verificá bien qué agencia seleccionaste antes de confirmar la importación.

---

## El preview muestra muchas advertencias, ¿importo igual?

Las **advertencias** no bloquean la importación — son avisos de que algo podría estar incompleto (ej: operación sin email de cliente, o sin fecha de regreso). Podés importar igual y corregir después desde el detalle.

Los **errores** sí bloquean las filas afectadas. Si confirmás la importación con errores, esas filas se saltean y las demás se importan. Podés ver cuáles se saltaron en el resultado final.

---

## Importé algo mal — ¿puedo deshacer?

No hay un botón de "deshacer importación". Si importaste datos incorrectos, tenés que eliminarlos manualmente:

- Para operaciones: andá a **Operaciones** y eliminá una por una (o usá el filtro para encontrarlas más rápido).
- Para clientes u operadores: andá al catálogo correspondiente y eliminá los registros.

Para evitar este problema, siempre usá el **"Vista previa"** antes de confirmar — te muestra exactamente qué se va a crear.

---

## ¿Todavía tenés problemas?

Si el error que ves no aparece en esta guía, contactá al soporte con:
- El nombre del tipo de importación que usaste.
- El mensaje de error exacto (podés copiar y pegar).
- Las primeras filas del CSV (sin datos sensibles).
