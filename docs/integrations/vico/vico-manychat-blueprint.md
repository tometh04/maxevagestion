# VICO ManyChat — Blueprint de ejecución

Receta paso-a-paso para terminar el bot ManyChat en la cuenta **Vibook AI** (plan PRO, conectada a Telegram **@vibookai_bot**).

**Tiempo estimado para ejecutar todo**: ~45 min.
**Tiempo estimado para arrancar testing real**: una vez ejecutado + tener OpenAI key.

---

## 0. Estado actual del trabajo en ManyChat

Lo que ya está hecho (no rehacer):

- ✅ Cuenta "Vibook AI" accesible, plan PRO.
- ✅ Telegram conectado (bot **@vibookai_bot**, activado).
- ✅ Automation "Telegram Welcome Message" con:
  - Trigger: "El usuario se suscribe haciendo clic en el botón Suscribirse" (Welcome nativo, dispara solo en 1ª interacción).
  - Mensaje cargado: `¡Hola! 👋 Soy el asistente virtual de Vico Travel Group ✈️\n\n¿En qué puedo ayudarte hoy?`
  - Botón #1 creado: `✈️ Quiero viajar`, acción `Iniciar otra Automatización` (destino vacío todavía).

Lo sobrante para borrar:

- 🗑️ Automation **"VICO 1 - Welcome"** (vacía, DRAFT) — eliminala desde Automatización → checkbox → Papelera.
- 🗑️ Automation **"Sin tVICO 2 - Cotizaciónítulo"** (vacía, DRAFT, nombre corrupto) — eliminala igual.

---

## 1. Crear los 5 flows downstream (vacíos primero)

Desde **Automatización → "+ Nueva Automatización"**, creá las 5 siguientes (NO les configures trigger todavía — se disparan vía "Iniciar otra Automatización" desde el Welcome):

| Nombre exacto | Función |
|---|---|
| `VICO 2 - Cotización` | Recolecta datos del viaje + LLM extract + derivación |
| `VICO 3 - Postventa` | Derivación inmediata (cliente con viaje vendido) |
| `VICO 4 - Problema en viaje` | Derivación URGENTE (cliente en problemas durante viaje) |
| `VICO 5 - Mundial` | Derivación campaña Mundial |
| `VICO 6 - F1` | Derivación campaña F1 |

**Tip para nombrar**: hacer click **una sola vez** en el "Sin título" del breadcrumb (no doble click, no triple). Esperar a que el campo se vuelva editable (borde amarillo). Borrar manual con backspace si quedó texto pre-existente. Tipear el nombre. Enter.

Cada una queda con:
- 1 nodo "Cuando..." vacío (no agregar trigger todavía — para evitar conflictos)
- 1 nodo "Enviar mensaje" vacío

Es OK que las 5 queden en DRAFT sin trigger. Las usás solo como destino del "Iniciar otra Automatización".

---

## 2. Conectar el Welcome a los 5 flows

Volvé a **Telegram Welcome Message** → click en el nodo "Enviar mensaje".

### Botón 1 (ya creado, falta conectar destino)
- Título: `✈️ Quiero viajar`
- Acción: `Iniciar otra Automatización` → **VICO 2 - Cotización**

### Botón 2 (crear nuevo)
- Click "+ Añadir botón"
- Título: `📋 Consulta sobre mi viaje`
- Acción: `Iniciar otra Automatización` → **VICO 3 - Postventa**

### Botón 3
- Click "+ Añadir botón"
- Título: `⚠️ Estoy en viaje con un problema`
- Acción: `Iniciar otra Automatización` → **VICO 4 - Problema en viaje`

### Botón 4
- Click "+ Añadir botón"
- Título: `⚽ Info paquete Mundial`
- Acción: `Iniciar otra Automatización` → **VICO 5 - Mundial**

### Botón 5
- Click "+ Añadir botón"
- Título: `🏎️ Info paquete F1`
- Acción: `Iniciar otra Automatización` → **VICO 6 - F1**

**Listo el Welcome.** Click "Publicar En Vivo" arriba a la derecha cuando termines.

---

## 3. VICO 2 - Cotización (el que tiene LLM)

Abrí la automation. Estructura:

```
[Sin trigger — se invoca desde Welcome]
  ↓
[Enviar mensaje] → "Contame en una sola línea tu viaje"
  ↓
[Esperar respuesta] → captura el mensaje del usuario en variable {{last_input}}
  ↓
[Acción externa: OpenAI extract] → llama a OpenAI con function calling, guarda JSON en variables
  ↓
[Condición] → ¿hay datos completos?
  ├── Sí → [Enviar mensaje "Perfecto, te transfiero..."] → [Webhook a Vibook] → [Marcar como conversación con agente]
  └── No → [Enviar mensaje "Ya tengo X, me falta Y"] → [Esperar respuesta] → bucle al OpenAI extract
```

### 3.1 Texto del primer mensaje

```
¡Genial! 🎒 Para preparar tu cotización, contame TODO en un solo mensaje:

🌍 Ciudad de salida (ej. Buenos Aires)
🌴 Ciudad de destino (ej. Cancún)
📆 Fechas o mes aproximado
👥 Cantidad de pasajeros y edades
💵 Presupuesto por persona en USD

Cuanto más preciso, mejor te cotizo ✨
```

### 3.2 Esperar respuesta del usuario

Bloque "Esperar respuesta" → guardar en variable de usuario llamada **`last_input`** (de tipo Texto).

### 3.3 Acción OpenAI con function calling (el LLM)

Bloque "Más" → "Solicitud HTTP externa" (External Request).

**Endpoint**: `https://api.openai.com/v1/chat/completions`
**Method**: POST
**Headers**:
```
Authorization: Bearer {{OPENAI_KEY}}
Content-Type: application/json
```

**Body** (JSON):
```json
{
  "model": "gpt-4o-mini",
  "temperature": 0,
  "messages": [
    {
      "role": "system",
      "content": "Sos un asistente que extrae datos de viaje. Devolvé SOLO el JSON con los datos que pudiste identificar. Si un dato no está, ponelo null. No converses. No agregues texto fuera del JSON."
    },
    {
      "role": "user",
      "content": "{{last_input}}"
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "datos_viaje",
      "strict": true,
      "schema": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "ciudad_salida": { "type": ["string", "null"] },
          "ciudad_destino": { "type": ["string", "null"] },
          "fecha_o_mes": { "type": ["string", "null"] },
          "pasajeros_total": { "type": ["integer", "null"] },
          "pasajeros_edades": { "type": ["array", "null"], "items": { "type": "integer" } },
          "presupuesto_usd_por_persona": { "type": ["integer", "null"] },
          "presupuesto_literal_si_no_es_usd": { "type": ["string", "null"] },
          "es_grupo_grande": { "type": "boolean" },
          "menciona_referido_vip": { "type": "boolean" }
        },
        "required": [
          "ciudad_salida",
          "ciudad_destino",
          "fecha_o_mes",
          "pasajeros_total",
          "pasajeros_edades",
          "presupuesto_usd_por_persona",
          "presupuesto_literal_si_no_es_usd",
          "es_grupo_grande",
          "menciona_referido_vip"
        ]
      }
    }
  }
}
```

**Por qué este prompt es 10x mejor que el de Callbell**:
- 250 chars vs 6258
- Function calling (output ESTRUCTURADO, no texto)
- Sin reglas conversacionales mezcladas con extracción (1 tarea = 1 prompt)
- `temperature: 0` para determinismo
- Strict JSON schema → no se equivoca con tipos

**Mapeo de variables ManyChat**:

ManyChat captura el response.choices[0].message.content como string JSON. Tenés que parsearlo a variables de usuario. Usá la sección "Mapeo de campos" del HTTP request:

| Variable ManyChat | Path en JSON response |
|---|---|
| `vico_ciudad_salida` | `$.choices[0].message.content.ciudad_salida` |
| `vico_ciudad_destino` | `$.choices[0].message.content.ciudad_destino` |
| `vico_fecha_o_mes` | `$.choices[0].message.content.fecha_o_mes` |
| `vico_pasajeros_total` | `$.choices[0].message.content.pasajeros_total` |
| `vico_presupuesto_usd` | `$.choices[0].message.content.presupuesto_usd_por_persona` |
| `vico_es_grupo_grande` | `$.choices[0].message.content.es_grupo_grande` |
| `vico_menciona_referido_vip` | `$.choices[0].message.content.menciona_referido_vip` |

⚠️ **Aviso**: ManyChat puede tener problemas parseando contenido nested. Si rompe, alternativa: poner el `content` completo en una variable string `vico_extract_raw` y parsearla en el webhook de Vibook (le pasamos el JSON crudo y Vibook lo deserializa server-side).

### 3.4 Condición: ¿completo?

Bloque "Condición":
- ¿{{vico_ciudad_salida}} es no vacío Y {{vico_ciudad_destino}} es no vacío Y {{vico_fecha_o_mes}} es no vacío Y {{vico_pasajeros_total}} es no vacío?

**Sí** → siguiente bloque (Mensaje de transferencia)
**No** → recordatorio + repreguntar

### 3.5 Mensaje de transferencia (completo)

```
¡Perfecto! Acá tu resumen:

🌍 Salida: {{vico_ciudad_salida}}
🌴 Destino: {{vico_ciudad_destino}}
📆 Fechas: {{vico_fecha_o_mes}}
👥 Pasajeros: {{vico_pasajeros_total}}
💵 Presupuesto: USD {{vico_presupuesto_usd}}/persona

Te conecto con un asesor ahora 🙌
```

### 3.6 Mensaje "Me falta..."

Lógica: para cada variable null/vacía, agregar al mensaje. Plantilla:

```
¡Genial! Ya tengo:
✅ {{vico_ciudad_salida}} → {{vico_ciudad_destino}}
✅ {{vico_fecha_o_mes}}
✅ {{vico_pasajeros_total}} pasajeros

Solo me falta tu **presupuesto por persona en USD** para terminar 💵
```

(Variante: armar 5 condicionales separados — uno por dato faltante — más laburo pero más claro).

### 3.7 Webhook a Vibook (después de la transferencia)

Bloque "Solicitud HTTP externa":

**Endpoint**: `https://app.vibook.ai/api/integrations/manychat/30fa0b47.../webhook` (el token de VICO ya está creado en `org_integrations`; sacalo de la DB Supabase con `SELECT webhook_token FROM org_integrations WHERE integration='manychat'`)

**Method**: POST
**Headers**:
```
Content-Type: application/json
X-Vibook-Signature: {{HMAC_SHA256_HEX}}
```

⚠️ Para el HMAC: ManyChat no calcula HMAC nativamente. 2 opciones:
- **A**: hacer el HMAC opcional para `manychat` igual que hicimos con `callbell-in` (commit `c68f08a4`). Más simple. **Recomendado**.
- **B**: poner un intermediario (Make.com / Zapier / Cloudflare Worker) que firma el body y reenvía. Más complejo.

**Body**:
```json
{
  "event_id": "{{user_id}}_{{timestamp}}",
  "manychat_user_id": "{{user_id}}",
  "name": "{{first_name}} {{last_name}}",
  "phone": "{{phone}}",
  "email": "{{email}}",
  "channel": "telegram",
  "intent": "cotizacion",
  "ciudad_salida": "{{vico_ciudad_salida}}",
  "ciudad_destino": "{{vico_ciudad_destino}}",
  "fecha_o_mes": "{{vico_fecha_o_mes}}",
  "pasajeros_total": "{{vico_pasajeros_total}}",
  "presupuesto_usd_por_persona": "{{vico_presupuesto_usd}}",
  "raw_extract": "{{vico_extract_raw}}",
  "es_grupo_grande": "{{vico_es_grupo_grande}}",
  "menciona_referido_vip": "{{vico_menciona_referido_vip}}"
}
```

Vibook lee este body en `app/api/integrations/manychat/[token]/webhook/route.ts` → si `crm_mode='advanced'` (VICO sí lo es) llama a `handleManychatAdvancedLead()` que ya está implementado en `lib/integrations/manychat/handler-advanced.ts`.

**Resultado**: lead aparece en `/sales/crm-manychat` de Vibook con tags + funnel "Nuevo" + datos cargados.

---

## 4. VICO 3 - Postventa (derivación inmediata)

Estructura simple:

```
[Enviar mensaje]
  ↓
[Webhook a Vibook con intent="postventa"]
  ↓
[Marcar como Live Chat]
```

### 4.1 Mensaje
```
Te conecto con un asesor que te ayuda con tu consulta de viaje 📋

Mientras tanto, contame brevemente qué necesitás (número de operación, código de reserva, etc.) para que el asesor llegue informado ✨
```

### 4.2 Webhook a Vibook
Mismo endpoint que Cotización pero con body simplificado:
```json
{
  "event_id": "{{user_id}}_{{timestamp}}",
  "manychat_user_id": "{{user_id}}",
  "name": "{{first_name}} {{last_name}}",
  "phone": "{{phone}}",
  "channel": "telegram",
  "intent": "postventa"
}
```

### 4.3 Live Chat
Bloque "Más" → "Marcar conversación para Live Chat" → toggle ON.

Esto saca el bot del medio y el agente humano puede chatear directo desde la Bandeja de entrada de ManyChat.

---

## 5. VICO 4 - Problema en viaje (URGENTE)

Igual estructura que Postventa pero con:

### 5.1 Mensaje
```
🚨 Lamento que tengas un problema. Te conecto YA con un asesor de guardia.

Para acelerar: contame en pocas palabras qué pasó (ej: "vuelo cancelado", "hotel no me reconoce reserva", "perdí documentos"). Un asesor te responde en breve.
```

### 5.2 Webhook
```json
{
  "intent": "problema_en_viaje",
  "urgency": "high",
  ...
}
```

### 5.3 Live Chat
Marcar conversación + (idealmente) notificar al equipo via push notification.

---

## 6. VICO 5 - Mundial / VICO 6 - F1 (campañas)

⚠️ **Validar con Enzo si siguen vigentes** antes de armar (Mundial 2026 ya pasó, F1 depende de calendario).

Si aplican, plantilla genérica:

### 6.1 Mensaje
```
¡Buena! 🏆 Para info del paquete <Mundial/F1>, te conecto con el equipo de eventos deportivos.

Contame: ¿qué fecha/evento te interesa y desde qué ciudad salís? 🛫
```

### 6.2 Webhook
```json
{
  "intent": "campaign_mundial"  // o campaign_f1
}
```

### 6.3 Live Chat
Marcar + tag "Campaign Mundial" / "Campaign F1".

---

## 7. Telegram Default Reply (fallback)

Editar la automation "Telegram Default Reply" (actualmente STOPPED, vacía):

### 7.1 Trigger
Default Reply nativo (ya viene pre-configurado, no tocar).

### 7.2 Mensaje + 5 botones
**Reutilizá** el mismo mensaje + botones del Welcome. Razón: si el usuario manda algo no entendido, le mostramos el menú de nuevo.

Truco para no duplicar: bloque "Más" → "Insertar automatización" → seleccionar "Telegram Welcome Message" como sub-flow. ManyChat lo soporta.

### 7.3 Publicar
Click "Publicar En Vivo".

---

## 8. Testing en Telegram

1. Abrí Telegram en tu celu, buscá **@vibookai_bot**, presioná "Iniciar".
2. **Test 1**: el bot tiene que arrancar con el saludo + 5 botones.
3. **Test 2**: tocá "✈️ Quiero viajar" → el bot pide datos → mandá `"Buenos Aires a Cancún en febrero, 2 personas 30 y 32, 1500 USD"` → el bot debe responder con resumen completo + transferir.
4. **Test 3**: tocá "📋 Consulta sobre mi viaje" → derivación inmediata.
5. **Test 4**: escribí `"asdfgh"` (mensaje sin sentido) → debe disparar Default Reply → mostrar menú de nuevo.
6. **Test 5**: andá a Vibook `/sales/crm-manychat` → los leads de los tests anteriores deben aparecer con tags y datos cargados.

---

## 9. Lo que necesito que hagas vos antes de testear

| # | Item | Por qué |
|---|---|---|
| 1 | **OpenAI API key** (https://platform.openai.com/api-keys → Create new secret) | Para que el flow Cotización use el LLM. Sin esto, el Cotización no puede extraer datos. |
| 2 | Decidir el HMAC: opción A o B | Para que el webhook a Vibook funcione. Recomendación: opción A (hacer HMAC opcional para manychat). |
| 3 | Validar con Enzo si Mundial / F1 siguen vigentes | Para no armar flows muertos. |
| 4 | Crear las variables de usuario en ManyChat (`vico_ciudad_salida`, `vico_ciudad_destino`, etc.) | ManyChat las pide pre-creadas. Vienen desde Configuración → Campos → Crear campo. Tipo: Texto (excepto `vico_pasajeros_total` que es Número, y `vico_es_grupo_grande` / `vico_menciona_referido_vip` que son Booleano). |

---

## 10. Cuando llegue Meta Business de VICO

Migrar el bot a la cuenta de VICO:

**Opción rápida**: Configuración → "Clonar Esta Cuenta" → seleccionar la nueva cuenta VICO. ManyChat copia todas las automations, variables, tags. Después conectás Instagram/WhatsApp/Facebook en la nueva cuenta. ~15 min.

**Opción manual**: re-hacer los flows desde cero en la cuenta nueva siguiendo este mismo blueprint. ~45 min (lo mismo que ahora).

---

## 11. Mejoras vs Callbell que vamos a tener

| Aspecto | Callbell actual | ManyChat nuevo |
|---|---|---|
| Selección de menú | Cliente escribe "2" → LLM falla | Botón táctil (no falla nunca) |
| Reconocimiento de datos | LLM pierde 3 de 5 datos en test | Function calling + JSON strict (extrae todo) |
| Prompt LLM | 6258 chars contradictorios | ~250 chars 1 sola tarea |
| Mensajes intermedios | LLM construye respuestas → frágil | Templates fijos con datos extraídos ("ya tengo X, me falta Y") |
| Multi-canal | 4 bots clonados (drift garantizado) | 1 sola automation, multi-canal nativo |
| Costo estimado | ~$2-3/mes a volumen actual | ~$0.40/mes (LLM solo en 1 nodo de cotización) |

---

## 12. Cosas que NO voy a armar (fuera de scope V1)

- **Sumarización de multimedia** (audio → texto + resumen vía gpt-4o). Si llega un audio, el bot dice "Te conecto con un asesor que puede escuchar tu audio" y deriva. Después se puede agregar.
- **Detección de horario laboral** (responder "El equipo está fuera de horario, te respondemos mañana"). Por ahora el bot responde 24/7 + el humano agarra al otro día.
- **Reasignación a vendedor específico** (round-robin). Por ahora todos los leads van al pool general "VICO sellers". Se puede agregar lógica en Vibook después.
- **Validaciones de ciudades** (ej. rechazar "Argentina" como ciudad). El LLM con function calling lo hace razonablemente bien tal cual.

---

## Resumen ejecutivo

**Para vos**: 45 min siguiendo este `.md` + mandarme la OpenAI key.

**Resultado**: bot mejor que el de Callbell, andando en Telegram para testing. Cuando llegue Meta Business → clonar cuenta → live en IG/WA/FB.

**Mejoras vs Callbell**: botones reales (no fail), function calling (no pierde datos), prompt 25x más corto, costo 5x menor.
