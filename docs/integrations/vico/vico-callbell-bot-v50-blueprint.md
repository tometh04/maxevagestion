# VICO Callbell Bot v50 — Blueprint paso a paso

> **Objetivo**: reemplazar el bot v49 actual (que anda mal) con una versión v50 que use Esquema JSON + Lista interactiva + prompt corto, manteniendo Callbell como inbox del equipo.
>
> **Tiempo estimado para ejecutar**: 60–90 min.
>
> **Riesgo**: cero mientras quede en DRAFT. Cualquier cambio que hagas NO afecta lo que VICO usa en producción hasta que clickees "Publicar borrador".

---

## 🛑 Reglas absolutas (leer ANTES de empezar)

1. **NO clickees "Publicar borrador"** hasta que vos hayas testeado en el simulador Y Enzo apruebe los cambios.
2. **NO toques el bot directamente sobre v49 publicada** — Callbell te crea un DRAFT automáticamente cuando hacés cambios. Verificá visualmente que el badge dice DRAFT.
3. **NO borres nodos** que no entendés. Si necesitás modificarlos, leé este doc primero — explica qué hace cada uno.
4. **NO cambies la OpenAI API key** todavía. Sigue siendo la misma key expuesta. La rotamos DESPUÉS del go-live para no romper en el medio.
5. **NO toques los otros 3 bots** (Bot Sin Multimedia bis, Messenger, Instagram) hasta que esta v50 del bot principal esté funcionando.

---

## 📋 Estado actual del bot v49 — cómo está hoy

Estás trabajando sobre el bot **"Bot Sin Multimedia (Versión 49)"** conectado al canal WhatsApp Emilia VICO. La URL es:
`https://dash.callbell.eu/bots/24537`

### Estructura actual del flow

```
[Mensaje entrante]
├── [filtra mensajes que vi…]      ← filtro DEV obsoleto (descartar mensajes del tel "111")
│   ├── [Nueva elección]            ← branch si llega media
│   │   └── (path multimedia: variable + mensaje "no audios")
│   └── [Respuesta]                 ← branch texto
│       └── [OpenAI]                ← prompt 6258 chars salida texto
│           └── [Dormir]
│               ├── [Agente]        ← decision: ¿output incluye palabra "agente"?
│               │   └── (derivación)
│               └── [Respuesta]     ← bot sigue conversando
└── [Respuesta]                     ← rama del filtro, vacía
```

### Problemas confirmados con tests en simulador

| # | Falla | Severidad |
|---|---|---|
| 1 | Cliente escribe "hola quiero ir a Cancún en febrero, 2 pax 30 y 32, USD 1500" → bot ignora 3/5 datos y vuelve a preguntar | 🔴 |
| 2 | Cliente escribe "2" (opción postventa) → bot re-envía menú inicial en vez de derivar | 🔴 |
| 3 | Bot interpreta "febrero" como "no me diste fecha" | 🔴 |
| 4 | Mensaje inicial sobrecargado (9 líneas + 5 opciones numéricas) | 🟡 |
| 5 | Derivación frágil (depende de que el LLM escriba la palabra "agente") | 🟡 estructural |

---

## 🛠️ Lo que vamos a cambiar en v50 — overview

| Aspecto | v49 (actual) | v50 (nuevo) |
|---|---|---|
| Prompt | 6258 chars con reglas contradictorias | ~600 chars con 1 tarea concreta |
| Formato salida OpenAI | "Texto" | "Esquema JSON" con schema strict |
| Menú | "Tipea 1, 2, 3..." (texto) | Lista interactiva (botones táctiles) |
| Detección de derivación | Palabra "agente" en texto | Campo `derivar` en el JSON |
| Estado de captura | LLM tiene que decidir si dar bienvenida | Boolean explícito `es_primera_interaccion` |
| Insistencia | Hasta 2 veces (LLM decide) | 1 sola repregunta + flag `cliente_persistente` |
| Detección de multimedia | Filtro pre-LLM existente | Lo dejamos igual (funciona OK) |
| Filtro debug "phone != 111" | Activo, marcado "Nodo a borrar" | **Borramos en v50** |

---

## 🚀 PASO 1 — Abrir el bot v49 y crear automáticamente el borrador v50

1. Andá a `https://dash.callbell.eu/bots/24537` (es Bot Sin Multimedia, conectado a WhatsApp Emilia VICO).
2. **Verificá** que el header dice "**Bot Sin Multimedia (Versión 49)**".
3. **Verificá** que arriba a la derecha ves un botón verde "**Publicar borrador**" (eso significa que ya hay un borrador empezado de algún cambio menor, o si dice "Publicar Versión 49" — entonces no hay borrador todavía).
4. ⚠️ Si ves modificaciones sospechosas (nodos cambiados que no recordás), **NO toques nada y avisame** primero. El borrador es del cambio que vamos a hacer pero podría haber alguien más editando.

> 💡 **Concepto clave**: en Callbell, cada vez que tocás algo, automáticamente queda en DRAFT. La versión publicada (v49) sigue corriendo en producción. Cuando hagas click "Publicar borrador" → se vuelve v50 → reemplaza v49. Hasta entonces, podés tocar lo que quieras sin riesgo.

---

## 🤖 PASO 2 — Reescribir el nodo OpenAI principal

Este es el corazón del cambio. El nodo OpenAI actual usa "Texto" como output y un prompt de 6258 chars. Lo vamos a cambiar a "Esquema JSON" con strict schema + prompt cortito.

### 2.1 Abrir el nodo OpenAI

1. En el canvas del flow, ubicá el nodo **OpenAI** que está debajo de "Respuesta" en la rama principal (texto, NO el del path multimedia). Posición aproximada en el canvas: medio derecha.
2. Click sobre el nodo. Se abre el panel "Editar acción OpenAI" a la derecha.

### 2.2 Validar las configs base

Confirmá estos valores (no los cambies, solo verificá):
- **Establecer el título de la acción**: `OpenAI` (dejar)
- **Token OpenAI**: `sk-proj-wz43H0rPoq...` (sigue siendo la actual; NO la cambies todavía — la rotamos después del go-live)
- **Modelos disponibles**: `gpt-4o-mini` (dejar)
- **Mensajes anteriores analizados**: `Sólo de la sesión actual del bot` (dejar)
- **Número máximo de tokens por respuesta**: dejar vacío (`opcional`)
- **Guardar respuesta en**: `Último éxito del webhook` (dejar)
- **Almacene el fallo en**: `Último fallo de webhook` (dejar)

### 2.3 Cambiar "Formato de salida" a Esquema JSON

1. Click en el dropdown "**Formato de salida**" (al lado derecho, dice "Texto").
2. Seleccioná "**Esquema JSON**".
3. Aparece debajo un nuevo campo "**Descripción del esquema JSON**" con un editor de código (default `{}`).

### 2.4 Pegar el JSON Schema

1. Click en el editor de "Descripción del esquema JSON".
2. Borrá el `{}` que está por default.
3. Pegá **exactamente** este schema (todo, incluyendo llaves):

```json
{
  "name": "respuesta_vico",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "mensaje_para_cliente": {
        "type": "string",
        "description": "El texto exacto que el bot le va a enviar al cliente, sin envolver en JSON. Tono cálido, breve, en español. No incluyas la palabra 'agente' salvo cuando vayas a derivar."
      },
      "intencion": {
        "type": "string",
        "enum": ["saludo_inicial", "recolectando_datos", "datos_completos_derivar", "postventa_derivar", "problema_viaje_derivar", "campania_mundial_derivar", "campania_f1_derivar", "fuera_de_scope", "datos_parciales_repreguntar"],
        "description": "Categoría de la respuesta. Usar saludo_inicial sólo en el primer mensaje. Las que terminan en _derivar disparan transferencia al equipo humano."
      },
      "derivar": {
        "type": "boolean",
        "description": "true SI Y SÓLO SI la conversación tiene que pasar a un agente humano AHORA (intencion termina en _derivar)."
      },
      "datos_extraidos": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "ciudad_salida": {
            "type": ["string", "null"],
            "description": "Ciudad de origen del viaje. null si no se mencionó o si solo dieron país."
          },
          "ciudad_destino": {
            "type": ["string", "null"],
            "description": "Ciudad de destino. null si no se mencionó o si solo dieron país/región."
          },
          "fecha_o_mes": {
            "type": ["string", "null"],
            "description": "Fecha o periodo del viaje en formato libre (ej. '15 al 22 de marzo 2026', 'segunda quincena de enero', 'febrero 2026'). null si no se mencionó."
          },
          "pasajeros_total": {
            "type": ["integer", "null"],
            "description": "Cantidad de personas que viajan. null si no se mencionó."
          },
          "pasajeros_edades": {
            "anyOf": [
              { "type": "array", "items": { "type": "integer" } },
              { "type": "null" }
            ],
            "description": "Lista de edades de cada pasajero. null si no se mencionó."
          },
          "presupuesto_usd_por_persona": {
            "type": ["integer", "null"],
            "description": "Presupuesto en USD por persona (si lo dieron en USD). null si no se mencionó o si lo dieron en otra moneda."
          },
          "presupuesto_literal": {
            "type": ["string", "null"],
            "description": "El texto literal del presupuesto si NO fue dado en USD (ej. '2 millones de pesos', '500.000 ARS'). null si fue dado en USD o no se mencionó."
          },
          "es_grupo_grande": {
            "type": "boolean",
            "description": "true si el cliente mencionó más de 9 pasajeros. Forzar derivación si true."
          },
          "menciona_referido_vip": {
            "type": "boolean",
            "description": "true si el cliente mencionó haber sido derivado por Guada Merlo u otro VIP conocido. Forzar derivación si true."
          }
        },
        "required": ["ciudad_salida", "ciudad_destino", "fecha_o_mes", "pasajeros_total", "pasajeros_edades", "presupuesto_usd_por_persona", "presupuesto_literal", "es_grupo_grande", "menciona_referido_vip"]
      },
      "datos_faltantes_para_derivar": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["ciudad_salida", "ciudad_destino", "fecha_o_mes", "pasajeros_total", "pasajeros_edades", "presupuesto_usd_por_persona"]
        },
        "description": "Lista de qué datos seguís necesitando para completar la cotización. Vacío si ya tenés todo."
      },
      "es_primera_interaccion": {
        "type": "boolean",
        "description": "true sólo si esta es la PRIMERA respuesta del bot en la conversación (no hay mensajes previos del bot). Importante: NO repetir el saludo si ya hubo intercambio."
      }
    },
    "required": ["mensaje_para_cliente", "intencion", "derivar", "datos_extraidos", "datos_faltantes_para_derivar", "es_primera_interaccion"]
  }
}
```

4. **Verificá visualmente** que el editor muestra el JSON con sintaxis válida (sin marcas rojas de error).

### 2.5 Reemplazar el Prompt

1. En el textarea "**Prompt**" (donde dice "💬 SALUDO Y MENÚ INICIAL..." con todo el texto largo).
2. **Seleccioná TODO** (Cmd+A o Ctrl+A dentro del textarea).
3. **Borrá**.
4. **Pegá exactamente** este prompt nuevo:

```
Sos el asistente virtual de Vico Travel Group, agencia de viajes de Argentina. Devolvés SOLO el JSON definido por el schema, sin texto adicional.

REGLAS DURAS:
1. Si es la primera interacción (no hay mensajes previos del bot en el historial), seteá es_primera_interaccion=true y mensaje_para_cliente incluí saludo + 5 opciones que el cliente puede elegir. NUNCA repitas el saludo si ya hubo turno previo del bot.
2. Si el cliente expresa intención de COTIZAR viaje (con o sin todos los datos): seteá intencion=recolectando_datos, extraé lo que puedas, pedí en mensaje_para_cliente SOLO los datos que faltan (sin re-preguntar lo que ya te dió). Si tenés ciudad_salida + ciudad_destino + fecha_o_mes + pasajeros_total + (edades O presupuesto) → seteá intencion=datos_completos_derivar y derivar=true.
3. Si el cliente dice "ya tengo un viaje con VICO", "consulta de mi viaje", "tengo una reserva", o similar → intencion=postventa_derivar, derivar=true. NO preguntes nada más.
4. Si el cliente dice "tengo un problema en el viaje", "estoy varado", "vuelo cancelado", "me robaron docs" o muestra urgencia → intencion=problema_viaje_derivar, derivar=true. NO preguntes nada más.
5. Si menciona "Mundial" o "Copa del mundo" → intencion=campania_mundial_derivar, derivar=true.
6. Si menciona "F1" o "Formula 1" o "Gran Premio" → intencion=campania_f1_derivar, derivar=true.
7. Si menciona >9 pasajeros → es_grupo_grande=true Y derivar=true con intencion=datos_completos_derivar.
8. Si menciona "Guada Merlo" o cualquier referido VIP → menciona_referido_vip=true Y derivar=true con intencion=datos_completos_derivar.
9. Si el cliente dice algo fuera de scope (ej. "qué temperatura hace en Cancún", "cuál es la mejor playa"): intencion=fuera_de_scope, derivar=true, mensaje_para_cliente educadamente lo transferís.

PARSING DE DATOS:
- Si dice "febrero", "marzo", o un mes solo → fecha_o_mes = ese mes (no es null).
- Si dice "segunda quincena de X" → fecha_o_mes = "del 15 al 31 de X" o "del 15 al 28 de X" según el mes.
- Si dice una cantidad y luego una serie de números (ej. "5 personas, 1/5/11/35/38") → asumir las edades.
- Si presupuesto está en USD → presupuesto_usd_por_persona = entero. Si está en otra moneda → presupuesto_literal = texto tal cual.
- Ciudades: rechazar países o regiones ("Argentina", "Europa", "Brasil") y pedir aclaración con intencion=datos_parciales_repreguntar.

ESTILO DEL mensaje_para_cliente:
- Tono cálido, breve (max 3 párrafos).
- Argentino informal pero profesional ("contame", "fijate", "ya te paso con un asesor").
- Emojis OK pero moderados.
- NO uses la palabra "agente" salvo en el mensaje final de derivación.
- En derivación, frase tipo: "Te paso con un asesor de VICO que te responde en breve ✨".
```

5. Click "**Guardar**" abajo del panel.

### 2.6 Verificar el cambio

1. Cerrá el panel con la X arriba a la derecha.
2. El nodo OpenAI sigue con título "OpenAI" pero su comportamiento ahora es completamente distinto.
3. Si volvés a hacer click → debería abrirse con "Formato de salida: Esquema JSON" y el textarea con el prompt nuevo.

---

## 🎛️ PASO 3 — Cambiar el nodo "Agente" (decision)

Este nodo actual chequea "Último éxito del webhook **incluye** 'agente'". Como ahora el output es JSON, hay que cambiarlo a chequear `derivar == true`.

### 3.1 Abrir el nodo Agente

1. En el canvas, ubicá el nodo **Agente** (dice "Agente" con icono X de cruce). Está después del nodo "Dormir".
2. Click → se abre panel "Editar opción".

### 3.2 Cambiar la condición

Panel actual muestra:
- **Establecer el título**: `Agente`
- **Elección de activación si**: `Último éxito del webhook` **incluye** `agente`

Vas a reemplazar la condición:

1. Click en el primer dropdown (donde dice "Último éxito del webhook"). Buscá si hay opción "Output JSON" o similar.
2. ⚠️ **Verificación necesaria**: Callbell puede o no soportar acceder a campos individuales del JSON. Si solo te deja referenciar "Último éxito del webhook" (todo el JSON como string), hacé esto:
   - Dejá la variable como está.
   - Cambiá el operador: `incluye` → `incluye` (igual).
   - Cambiá el valor de la derecha: `agente` → `"derivar": true` (con esas comillas exactas).

Eso hace que cuando el JSON output incluya el texto `"derivar": true` (que sí lo incluye cuando derivar=true) la condición se cumpla. Es un workaround pero funciona porque el schema strict siempre produce el campo derivar.

3. **Cambiar el título** del nodo de "Agente" → **"Decisión: derivar?"** (para que sea más claro). Click en el campo "título de la acción" y poné el nuevo nombre.
4. Click "**Guardar**".

### 3.3 Verificar la rama "Sí" sigue conectada al path de derivación

El path derecho del nodo decision debería seguir conectado a:
- [Mensaje transferencia ...] → [Añadir nota] → [Asignar equipo] → [Añadir acción]

No cambiar nada de eso. Solo verificar que sigue conectado.

---

## 💬 PASO 4 — Actualizar el nodo "Mensaje transferencia a agente"

Este nodo manda al cliente el mensaje de transferencia. Actualmente reenvía `Último éxito del webhook` (todo el JSON, que se ve feo al cliente). Hay que cambiarlo para que mande SOLO el campo `mensaje_para_cliente`.

### 4.1 Opción A — Si Callbell permite path-access en variables (verificar primero)

1. Click en el nodo "Mensaje transferencia a agente".
2. En el textarea del mensaje, donde dice `{{Último éxito del webhook}}`, cambialo a `{{Último éxito del webhook.mensaje_para_cliente}}`.
3. Click "Guardar".
4. **TEST**: en el simulador, mandá un mensaje y verificá que el bot responde solo el texto del mensaje (no el JSON completo).

### 4.2 Opción B — Si Callbell NO soporta path-access (probable)

Entonces el cliente va a ver el JSON crudo, lo cual rompe la UX. Hay 2 alternativas:

**B1 — Variable intermedia con "Establecer variable"**:
1. Antes del nodo "Mensaje transferencia a agente", agregá un nodo "Establecer variable":
   - Variable nueva: `respuesta_bot` (crear si no existe)
   - Acción: Sustituir texto
   - Con valor: necesitamos extraer el campo del JSON. Si Callbell tiene "Realizar JS" o función `JSON.parse`, usá eso. Si NO, fallback a B2.

**B2 — Cambiar el output a "Objeto JSON"** (en lugar de "Esquema JSON") y usar la variable Callbell nativa para acceder a `mensaje_para_cliente`:
1. Volver al nodo OpenAI, cambiar "Formato de salida" a "Objeto JSON" (mantiene structured output pero sin validación strict).
2. En el campo "Guardar respuesta en", crear/usar una variable de tipo Objeto.
3. Referenciar con `{{variable.mensaje_para_cliente}}`.

⚠️ **Verificación necesaria al momento de ejecutar**: probá primero la Opción A. Si el mensaje muestra el JSON crudo, fallback a B2.

---

## 🎯 PASO 5 — Agregar nodo de Lista interactiva ANTES del OpenAI

Esta es la mejora UX más grande: en vez de que el bot escriba "1️⃣, 2️⃣, 3️⃣...", el cliente recibe una lista táctil de WhatsApp con 5 opciones.

⚠️ **Importante**: este nodo se ejecuta SOLO en la primera interacción. Si lo ponemos antes del OpenAI siempre, va a mostrar el menú en CADA mensaje del cliente. Solución: agregamos un branch condicional ANTES del OpenAI que detecte si es la primera vez.

### 5.1 Diseño del flow nuevo

```
[Mensaje entrante]
└── [filtra mensajes que vi…]   (mantener)
    ├── [Nueva elección]         (path multimedia: mantener)
    └── [Respuesta texto]
        └── [NUEVO: ¿Primera interacción?] (condicional)
            ├── Sí → [NUEVO: Enviar saludo + Lista interactiva] → [Esperar respuesta] → ↓
            └── No → [OpenAI con esquema JSON] → ...
```

### 5.2 Cómo detectar "primera interacción"

Callbell tiene una variable nativa de contacto que indica si ya tuvo mensajes previos. La más común: `bot_session_count` (o similar). Si no existe, usamos un workaround con custom variable:

1. Crear una variable **persistente** (tipo Booleano) llamada `bot_inicializado`, default `false`.
2. La condición es: `bot_inicializado == false`.
3. DESPUÉS del nodo Lista (paso 5.4), agregar un nodo "Establecer variable" que setea `bot_inicializado = true`.

Eso garantiza que el saludo sale 1 sola vez por cliente.

### 5.3 Crear nodo condicional

1. En el canvas, sobre la rama "Respuesta" (la que va al OpenAI), arrastrar un bloque condicional.
2. Configurar:
   - Variable: `bot_inicializado` (custom var)
   - Operador: `es igual a`
   - Valor: `false` (o `vacío` si la var no se creó nunca para ese contacto)
3. Conectar el output **Sí** al nuevo nodo Lista (paso 5.4).
4. Conectar el output **No** directamente al OpenAI (mantener flow actual).

### 5.4 Crear nodo "Enviar mensaje" con Lista interactiva

1. Click sobre el canvas vacío, arrastrar un nuevo bloque "Enviar mensaje".
2. Conectarlo desde el output "Sí" del condicional.
3. Click el nuevo nodo → abre el panel a la derecha.
4. **Mensaje** (textarea):

```
¡Hola! 👋 Soy el asistente virtual de Vico Travel Group ✈️

¿En qué puedo ayudarte hoy?
```

5. **Botones interactivos** (dropdown a la derecha):
   - Click el dropdown que dice "Ninguno" → seleccionar "**Lista**".
   - Aparecen opciones para configurar los items de la lista.

6. **Configurar la Lista** (5 items):

| # | Título (max 24 chars) | Descripción (max 72 chars) | Payload (lo que llega al bot cuando elige) |
|---|---|---|---|
| 1 | ✈️ Quiero viajar | Cotizar un viaje nuevo | `quiero_viajar` |
| 2 | 📋 Consulta mi viaje | Sobre un viaje ya contratado | `postventa` |
| 3 | ⚠️ Problema en viaje | Estoy de viaje y tengo un problema | `problema_viaje` |
| 4 | ⚽ Info Mundial | Paquetes deportivos Mundial | `info_mundial` |
| 5 | 🏎️ Info F1 | Paquetes deportivos F1 | `info_f1` |

7. **Título de la lista** (header): `Elegí una opción` (max 24 chars).
8. **Texto del botón** (CTA que abre la lista): `Ver opciones` (max 20 chars).
9. Click "Guardar".

### 5.5 Después de la Lista — setear bot_inicializado = true

1. Arrastrar nodo "Establecer variable" después del nodo Lista.
2. Variable: `bot_inicializado`
3. Acción: `Sustituir texto`
4. Valor: `true`
5. Conectar el output a un nodo "Esperar respuesta".

### 5.6 Después de "Esperar respuesta" — al OpenAI

El output del "Esperar respuesta" se conecta al **OpenAI** (mismo que ya existe). Cuando el cliente toca una opción de la Lista, el payload llega como texto (`quiero_viajar`, `postventa`, etc.) y el OpenAI lo interpreta porque el prompt está armado para reconocer esas opciones.

---

## 🗑️ PASO 6 — Borrar el filtro debug obsoleto

El nodo "filtra mensajes que vi…" actualmente filtra mensajes del teléfono `111`, y tiene como título "Nodo a borrar". Borrarlo limpia el flow.

1. Click sobre el nodo "filtra mensajes que vi…".
2. En el panel, click "**Borrar**" (botón gris).
3. Confirmar.
4. El flow se reconecta automáticamente — el nodo "Mensaje entrante" pasa a conectar directo a sus 2 hijos (Nueva elección + Respuesta texto).

### Si el borrado deja huérfanos:
1. Verificá visualmente que el path multimedia (Nueva elección) sigue conectado a sus descendientes.
2. Verificá que el path texto (Respuesta) sigue conectado al OpenAI.
3. Si quedó algún nodo flotando sin conexión, reconectarlo manualmente (arrastrar línea entre nodos).

---

## 🧪 PASO 7 — Testear v50 con el simulador (sin publicar)

Ahora viene la parte importante: probar 6 escenarios concretos.

### 7.1 Abrir el simulador

1. Click "**Ejecutar simulador**" arriba a la derecha.
2. Aparece panel a la derecha "Simulador de Bot".

### 7.2 Test 1 — Primera interacción

1. Tipeá: `hola`
2. Click Enviar.
3. **Esperado**: el bot manda saludo + lista táctil con 5 opciones.
4. **Si falla**: revisar el condicional "¿Primera interacción?" — capaz `bot_inicializado` se está chequeando mal.

### 7.3 Test 2 — Elegir opción Cotización

1. Tocá el item "✈️ Quiero viajar" de la lista.
2. **Esperado**: el bot dice algo tipo "Genial, contame en una sola línea desde qué ciudad salís, a dónde, cuándo, cuántos pasajeros con edades, y tu presupuesto en USD por persona".
3. **Si falla**: ver en el simulador la respuesta del OpenAI cruda. Si el JSON no se interpreta bien, revisar el schema en el paso 2.4.

### 7.4 Test 3 — Mandar todos los datos juntos (el que rompía en v49)

1. Tipeá: `Buenos Aires a Cancún en febrero, 2 personas 30 y 32 años, 1500 USD por persona`
2. Click Enviar.
3. **Esperado**: el bot debe responder algo tipo "¡Perfecto! Ya tengo todo: BA→Cancún en febrero, 2 pax (30 y 32), USD 1500/pp. Te paso con un asesor de VICO que te responde en breve ✨" + el flow debe pasar a la rama de derivación.
4. **Verificá**: el simulador debería mostrar que llegó a "Mensaje transferencia a agente" → "Añadir nota" → "Asignar equipo".

### 7.5 Test 4 — Postventa (el que MUY rompía en v49)

1. Click "Restablecer" para resetear la conversación.
2. Tipeá: `hola`
3. Cuando aparece la lista, tocá "📋 Consulta mi viaje".
4. **Esperado**: el bot DERIVA inmediatamente sin hacer preguntas. Algo tipo "Te paso con un asesor para tu consulta de viaje 📋. Mientras tanto, contame brevemente qué necesitás."
5. **Si falla**: el prompt no está agarrando el payload `postventa`. Revisar el prompt paso 2.5 punto 3.

### 7.6 Test 5 — Datos parciales

1. Restablecer.
2. Después del saludo, tocá "✈️ Quiero viajar".
3. Tipeá: `quiero ir a punta cana`
4. **Esperado**: el bot extrae ciudad_destino=Punta Cana y pide específicamente: ciudad_salida, fecha_o_mes, cantidad de pasajeros, edades, presupuesto. NO debe repetir Punta Cana.
5. **Si falla**: el JSON Schema no se está usando bien. Revisar el output del OpenAI en el simulador (debería ver el JSON crudo).

### 7.7 Test 6 — Caso edge: presupuesto en pesos

1. Restablecer.
2. Tipeá: `Buenos Aires a Cancún, 2 personas 30/32 en febrero, presupuesto 2 millones de pesos cada uno`
3. **Esperado**: el bot derive a un agente (datos completos) con la nota interna conteniendo `presupuesto_literal: "2 millones de pesos"`.
4. **NO debe** convertir a USD ni decir "no acepto pesos" — el prompt dice dejar el monto literal.

---

## 🤝 PASO 8 — Comparar v49 (prod) vs v50 (draft) para mostrar a Enzo

### 8.1 Documentar visualmente

1. En la tab del simulador con v50, hacé los 6 tests arriba.
2. Tomá screenshot de las conversaciones completas.
3. Guardalas en un Google Doc / Notion / lo que uses.

### 8.2 Abrí en otra tab el bot v49 PUBLICADO

⚠️ Cuidado: si tocás algo se crea un nuevo borrador (lo que NO queremos). Solo usar el simulador, NO modificar.

1. En otra tab, abrí `https://dash.callbell.eu/bots/24537`.
2. Si te muestra ya tu DRAFT, click el ícono de **historial** arriba a la derecha (al lado del simulador) → ver "Versión 49" → seleccionar para ver el published.
3. Click "Ejecutar simulador" sobre el v49.
4. Hacer los **mismos 6 tests** y capturar screenshots.

### 8.3 Comparativa para Enzo

Armá una tabla con los 6 tests, comparando lado a lado:

| Test | v49 (actual) | v50 (propuesto) | Veredicto |
|---|---|---|---|
| 1 - Saludo | Mensaje largo 9 líneas con números | Saludo corto + lista táctil | ✅ Mejor v50 |
| 2 - Elegir Cotización | Espera que tipees "1" | Tocás botón táctil | ✅ Mejor v50 |
| 3 - Todos los datos juntos | Ignora 3/5 datos, re-pregunta | Confirma todo + deriva | ✅ Mucho mejor v50 |
| 4 - Postventa | Re-envía el menú inicial | Deriva inmediato sin preguntar | ✅ FIX bug v49 |
| 5 - Datos parciales | Re-pregunta lo que ya dio | Confirma lo dado + pide lo que falta | ✅ Mejor v50 |
| 6 - Pesos | El LLM convierte mal (a veces) | Deja literal en nota | ✅ Mejor v50 |

### 8.4 Mensaje para Enzo (template)

Copy-paste para mandarle a Enzo cuando esté listo:

> Hola Enzo, hicimos una versión nueva del bot de WhatsApp (v50, en borrador). Te paso comparación lado a lado con la actual (v49) en estos 6 escenarios:
>
> [link a tu Google Doc / screenshots]
>
> Resumen de mejoras:
> - **No más números del menú** → lista táctil (el cliente toca la opción)
> - **El bot ahora SÍ confirma los datos** que le diste (no re-pregunta lo que ya sabe)
> - **Postventa deriva sin volver a mostrar el menú** (bug actual)
> - **Mensaje inicial más corto y claro**
>
> Si te parece bien, lo publico. Si querés ajustes, decime. **No tocamos nada en producción hasta tu OK** ✅

---

## 🚀 PASO 9 — Publicar el borrador (solo después del OK de Enzo)

⚠️ **NO ejecutar este paso** hasta que Enzo dé OK por escrito.

1. Volver al bot v50 (donde tenés tu DRAFT).
2. Click el botón verde "**Publicar borrador**" arriba a la derecha.
3. Aparece modal de confirmación → confirmar.
4. La versión se promueve a v50 y reemplaza v49 en producción.
5. Verificar: el header del bot ahora dice "Bot Sin Multimedia (Versión 50)".

### Si algo sale mal post-publicación

Callbell guarda el historial de versiones. Si v50 está fallando en prod:

1. Click el ícono de historial.
2. Buscar "Versión 49".
3. Opción "Restaurar" / "Promover" — vuelve a hacer v49 la activa.
4. **Tiempo de rollback**: ~30 segundos.

---

## 🔄 PASO 10 — Replicar el cambio en los otros 3 bots

Si v50 anda bien, hay que aplicar los mismos cambios a los otros 3 bots activos:

| Bot a actualizar | Canal | URL |
|---|---|---|
| Bot Sin Multimedia bis | WhatsApp Aldana VICO | `https://dash.callbell.eu/bots/<id>` (buscar en Flujos) |
| Messenger | VICO facebook | (buscar en Flujos) |
| Instagram | VICO instagram | (buscar en Flujos) |

### Estrategia recomendada: clonar el bot v50

Callbell probablemente tiene "Duplicar bot" (similar a otros sistemas). Si existe:
1. En "Flujos" → bot v50 → menú "⋮" → "Duplicar".
2. Renombrar el clon (ej. "Bot Sin Multimedia bis v50").
3. Conectarlo al canal correspondiente.
4. Repetir tests del paso 7.

### Si NO existe "Duplicar"

Hay que repetir los pasos 2-6 en cada bot manualmente. Tedioso pero directo.

⚠️ **Importante**: cada bot tiene su propio Token OpenAI configurado (el mismo plaintext). NO los cambies todavía — los rotamos JUNTOS después del go-live.

---

## 🔐 PASO 11 — Post go-live: rotar la OpenAI API key

Una vez que TODOS los bots están en v50 y funcionando:

1. Ir a `https://platform.openai.com/api-keys`.
2. Click el botón ⋮ al lado de la key `sk-proj-wz43H0rPoq...`.
3. **Generar nueva key** primero (NO revoques la vieja todavía).
4. Copiar la nueva key.
5. En cada bot Callbell (los 4 activos), pegar la nueva key en el campo "Token OpenAI" del nodo OpenAI.
6. **Verificar** con el simulador que sigue funcionando.
7. **Solo cuando los 4 estén verificados** → volver a OpenAI y revocar la key vieja.

⚠️ Si revocás la vieja antes de cambiar los 4 bots → cualquier conversación en curso se rompe.

---

## 📊 PASO 12 — Monitoreo de las primeras 24h

Después del go-live:

### 12.1 Logs de Callbell

1. En Callbell, ir a **Conversaciones** o **Métricas** → ver tasa de conversación con bot.
2. Comparar contra el día anterior (con v49).
3. Métrica clave: **% de conversaciones que derivan al equipo / % que quedan en bot loop**.

### 12.2 Logs de Vibook (webhook callbell-in)

1. SSH/UI Railway → maxevagestion service → Deploy Logs.
2. Filtrar por `callbell-in` o `[cron:callbell-reconcile]`.
3. Buscar errores 400/500 (mal-formed JSON, etc.).

### 12.3 Métricas en Vibook

1. Ir a `/sales/crm-manychat` → ver nuevos leads creados las últimas 24h.
2. Verificar que los leads tienen tags + datos cargados (no leads vacíos).
3. Si hay leads vacíos / mal etiquetados → revisar el handler `handleManychatAdvancedLead` y el tag-resolver.

### 12.4 Avisar al equipo VICO

1. Mandar a Enzo + a los 9 sellers del equipo "General" un mensaje tipo:
   > "Hola equipo, desde ayer el bot del WhatsApp Emilia está respondiendo con la versión nueva. Si ven respuestas raras del bot o conversaciones que no se derivaron y deberían, mándenme un screenshot acá. Los primeros 2 días vamos a estar monitoreando. 🙏"
2. Estar disponible las primeras 48h para hot-fix si hay regresiones.

---

## 🆘 PASO 13 — Plan de rollback

Si algo sale mal post-publicación y no podés volver con el botón "Restaurar":

### 13.1 Rollback rápido (1-3 min)

1. En Callbell, ir al bot afectado.
2. Click ícono de historial (arriba a la derecha).
3. Buscar **Versión 49**.
4. Click "Activar" / "Promover" → confirma.
5. v49 vuelve a producción inmediatamente.

### 13.2 Rollback de los otros bots (si se publicaron)

Repetir 13.1 para cada bot que actualizaste.

### 13.3 Comunicar al equipo

Mensaje al equipo VICO:
> "Detectamos un problema con la versión nueva del bot. Volvimos a la versión anterior. Las conversaciones siguen funcionando con normalidad. Investigamos y avisamos cuando esté solucionado. Disculpas por la molestia 🙏"

---

## ⚙️ Cosas que NO estoy haciendo en V50 (fuera de scope)

Para que esto sea ejecutable hoy, dejo afuera:

- **Multimedia avanzada**: si el cliente manda audio o imagen, sigue derivando a humano. No transcribimos.
- **Detección de horario laboral**: el bot responde 24/7. Si Enzo quiere "fuera de horario" pasamos a v51.
- **Reasignación granular de vendedor**: todos los leads van al equipo "General". El round-robin lo hace Callbell.
- **Multi-idioma**: solo español.
- **Plantillas WhatsApp aprobadas para fuera de la ventana 24h**: si pasa más de 24h sin respuesta del cliente, Meta exige plantillas pre-aprobadas. Eso es otro proyecto.

---

## 🎯 Checklist final antes de empezar

- [ ] Leí las **reglas absolutas** arriba.
- [ ] Tengo el bot v49 abierto en `https://dash.callbell.eu/bots/24537`.
- [ ] Confirmé que el botón "Publicar borrador" está visible (significa que la edición se va a guardar como DRAFT).
- [ ] Tengo este `.md` abierto en otra ventana para seguir los pasos.
- [ ] Avisé al equipo VICO que voy a estar testeando en simulador (no afecta prod, solo aviso).
- [ ] Tengo bloqueado al menos 60-90 min sin interrupciones.

---

## 📞 Si algo no funciona o tenés dudas

Decime exactamente:
1. En qué **paso** estás.
2. Qué **resultado esperabas** según el doc.
3. Qué **viste en pantalla** (screenshot ideal).
4. Si fue **antes o después** de "Guardar" en el panel.

Con eso te resuelvo en el momento.

---

## 🏁 TL;DR — Resumen ejecutivo

- **Lo que hacés**: reemplazás el prompt malo de 6258 chars + output texto del LLM por un prompt cortito + output JSON strict, y agregás una Lista interactiva para el menú inicial. **Mantenés Callbell como inbox del equipo** — no migrás nada.
- **Lo que cambia para tus vendedores**: nada. Siguen contestando en Callbell igual que hoy. El bot solo es más inteligente.
- **Lo que cambia para tus clientes**: lista táctil (no escribir números), menos repreguntas, menos frustración.
- **Lo que cambia para Vibook**: nada. El webhook callbell-in sigue funcionando igual. Los leads aparecen igual en `/sales/crm-manychat`.
- **Tiempo total tuyo**: 60-90 min ejecutando + ~30 min Enzo aprobando = ~2 horas total.
- **Riesgo**: cero hasta que clickees "Publicar borrador". Y aún ahí, rollback es 30 segundos.
