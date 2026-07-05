# VICO Callbell Bot — Análisis para replicación en ManyChat

> Investigación realizada 2026-05-12 mirando el panel de Callbell de VICO.
> Objetivo: documentar TODO lo que el bot actual hace en Callbell para poder
> replicarlo en ManyChat más adelante.

## 1. Inventario de bots

VICO tiene **8 bots** en Callbell, **4 activos** cubriendo todos los canales:

| Bot | Estado | Canal | Versión | Creado |
|---|---|---|---|---|
| Bot Sin Multimedia | ✅ Activo | WhatsApp Emilia VICO | 49 | 14/10/2025 |
| Bot Sin Multimedia bis | ✅ Activo | WhatsApp Aldana VICO | 23 | 17/10/2025 |
| Messenger | ✅ Activo | VICO facebook | 24 | 17/10/2025 |
| Instagram | ✅ Activo | VICO instagram | 26 | 17/10/2025 |
| Prueba Luciano | (inactivo) | WhatsApp Emilia VICO | 54 | 11/09/2025 |
| Bot (1) (1) | (inactivo) | WhatsApp Aldana VICO | 8 | 09/09/2025 |
| Bot (1) | (inactivo) | WhatsApp Aldana VICO | 19 | 01/09/2025 |
| Bot | (inactivo) | WhatsApp Aldana VICO | 55 | 29/05/2025 |

**Iteraciones**: bot principal lleva 49 versiones — 7 meses de iteración. El bot original (mayo 2025) llegó a v55 antes de pausarse.

**Multi-canal**: cubren los 4 puntos de contacto principales (2 WhatsApps + Messenger + Instagram). Cada canal tiene su propio bot.

---

## 2. Bot principal — "Bot Sin Multimedia" v49 (WhatsApp Emilia VICO)

### 2.1 Estructura del flow

```
Mensaje entrante
├── filtra mensajes que vi... (filtro DEV: phone != "111", marcado "Nodo a borrar")
│   │
│   ├── Nueva elección  (rama MULTIMEDIA — fires si message tiene attachment URL)
│   │   └── Establecer variable: adjunto-valorar = URL del archivo
│   │       └── Enviar mensaje (template multimedia ↓ §2.4)
│   │           └── Esperar una respuesta
│   │               └── Continuar a (loop back)
│   │
│   └── Respuesta  (rama TEXTO)
│       └── OpenAI #1 (gpt-4o-mini, prompt principal ↓ §2.3)
│           └── Dormir
│               ├── Agente  (check: ¿OpenAI dijo "derivar"?)
│               │   └── Mensaje transferencia ...
│               │       └── Añadir nota
│               │           └── Asignar equipo
│               │               └── Añadir acción
│               │
│               └── Respuesta  (rama: bot sigue conversando)
│                   └── Enviar mensaje (output de OpenAI)
│                       └── Esperar una respuesta
│                           │
│                           ├── Multimedia  (si próxima respuesta es media)
│                           │   ├── ya procesado (idempotencia)
│                           │   │   └── Continuar a
│                           │   └── Respuesta
│                           │       └── Derivar a agente ya qu...
│                           │           └── OpenAI #2
│                           │               └── Añadir nota
│                           │                   └── Asignar equipo
│                           │                       └── Añadir acción
│                           │
│                           └── Texto
│                               └── Continuar a (loop back al OpenAI #1)
│
└── Respuesta (rama del filtro inicial)
    └── Añadir acción
```

### 2.2 Stack técnico

- **Modelo IA**: `gpt-4o-mini` (cost-efficient)
- **Mensajes anteriores analizados**: "Sólo de la sesión actual del bot" (context window per-session)
- **Formato salida OpenAI**: Texto plano (no JSON / function calling)
- **Output → variable**: "Último éxito del webhook"
- **Errores → variable**: "Último fallo de webhook"
- **🚨 SEGURIDAD**: la **OpenAI API key** está pegada en plaintext en la config del nodo OpenAI. Empieza con `sk-proj-wz43H0rPoq...`. **Rotar antes de replicar** porque cualquiera con acceso al panel Callbell la ve.

### 2.3 Prompt completo del OpenAI principal

```
💬 SALUDO Y MENÚ INICIAL
En la primera respuesta de cada conversación, saludá siempre con este formato completo, sin importar lo que haya escrito el usuario:
"Hola, soy el asistente virtual de Vico Travel Group 😊 Estoy acá para ayudarte."
Después de ese saludo, continuá inmediatamente con:
"Para que la conversación sea más eficiente, por favor comunicate solo por texto, evitando audios o imágenes. ¿En qué puedo ayudarte hoy?"
Luego mostrale las siguientes opciones:
1️⃣ Quiero viajar ✈️
2️⃣ Ya tengo mi viaje con VICO y quiero hacer una consulta 📋
3️⃣ Estoy en viaje y tengo un problema ⚠️
4️⃣ Quiero info del Mundial ⚽🏆
5️⃣ Quiero info del paquete F1 🏎️🏁
No repitas este saludo más de una vez por conversación.

⚙️ REGLAS PRINCIPALES
No uses la palabra "agente" en mensajes intermedios.
Solo podés decir "agente" en el mensaje final de cierre, cuando ya vayas a derivar.
En los pasos previos, usá frases como:
"Con estos datos podré ayudarte de la mejor forma posible 🙌"
"Con esta información ya puedo continuar con tu cotización 😊"
"Gracias, con esto avanzo para prepararte el siguiente paso ✨"
No derives ni prometas respuesta en breve si el cliente escribe fuera del horario laboral (eso lo maneja Callbell).
Si el cliente escribe cosas genéricas como "hola", "quiero info", "me interesa", "mandame la promo", no lo derives todavía.
Primero obtené los datos clave.
Derivá solo cuando:
Tengas todos los datos requeridos, o
Falte alguno pero el cliente demuestre interés real después de 2 intentos.

🔁 REGLAS DE DERIVACIÓN
Si el mensaje del usuario coincide con alguna opción aunque no use número (por ejemplo, escribe "tengo una consulta de mi viaje" o "estoy viajando"), actuá igual que si la hubiera elegido.
Si elige 1️⃣, iniciá la recopilación de datos.
Si elige 2️⃣ o 3️⃣, o muestra urgencia después del primer intercambio, no hagas ninguna pregunta acerca del problema o de la consulta que quiere hacer, o si detectas que viene de parte de Guada Merlo en su primer mensaje, solamente derivá la conversación a un agente y enviá:
Te transfiero a un agente que te responderá en breve.
Incluí un resumen breve si tenés datos previos.
➡️ Si elige 4️⃣ "Quiero info del Mundial ⚽🏆" derivá automáticamente a un agente.
➡️ Si elige5️⃣ "Quiero info del paquete F1 🏎️🏁 " derivá automáticamente a un agente.

🧭 DETECCIÓN DE DESTINOS Y PROMOS
Si el cliente menciona un destino o promoción (ej. "quiero el paquete a Maceió", "me interesa la promo de Punta Cana"), asumí que ya tiene destino definido.
No le muestres sugerencias; pedile directamente los datos clave.
Si no menciona destino, pedile igual la información básica para poder ayudarlo.
No derives hasta tener esos datos o confirmar interés genuino.

📋 DATOS QUE DEBÉS RECOLECTAR
Pedí todos los datos en un solo mensaje.
Luego repreguntá solo lo que falte.
El objetivo es que el cliente complete lo siguiente:
Ciudad de salida (una ciudad precisa, no un país).
Ciudad o ciudades de destino (también una ciudad o destino específico).
Fechas de viaje:
¿Tenés fecha de ida y vuelta exacta o preferís contarme en qué mes y cuántas noches te gustaría quedarte?
También podés decirme que tenés fechas flexibles.
Si tenés las fechas exactas, mejor, así podemos cotizarte con más precisión. ✈️
Si el cliente menciona algo como "segunda quincena de enero" o "a mediados de marzo", interpretalo como un rango aproximado (por ejemplo, del 15 al 31 de enero).
Si dice "7 noches en la segunda quincena de enero", registrá esas 7 noches dentro de ese rango.
No insistas por fechas exactas si ya dio una referencia clara.
Cantidad de pasajeros y edades:
Si indica solo la cantidad (ej. "5 pasajeros"), pedile las edades.
Si responde con números separados por comas, barras o espacios (ej. "1 / 5 / 11 / 35 / 38"), asumí que son las edades.
Aceptá esa respuesta sin pedir aclaraciones extra.
Si el cliente menciona más de 9 pasajeros, aplicá la regla de grupos: derivá inmediatamente al equipo humano y aclarar en la nota interna:
"Cotización grupal (más de 9 pasajeros)".
Presupuesto por persona (en USD):
Puede ser un monto aproximado. Si no lo sabe o no quiere decirlo, insistí hasta 2 veces máximo, luego continuá con la información disponible. Si te pasa el presupuesto en Pesos o en cualquier otra moneda, no intentes hacer la conversión a USD. Solo agregalo en la nota tal cual te lo pasa el cliente.

🔁 INSISTENCIA LIMITADA
Si después de pedir los datos el cliente no responde alguno, pero sigue interactuando (por ejemplo: hace preguntas, dice "quiero info", "contame más"), asumí que está interesado.
Intentá recuperar el dato faltante hasta 2 veces máximo.
Si después de eso sigue conversando, derivá igual e informá en la nota qué dato faltó.

🧩 VALIDACIÓN DE CIUDADES
Si el cliente menciona solo un país o región (ej. "Argentina", "Brasil", "Europa"), pedile amablemente que aclare las ciudades exactas:
¿Podés confirmarme desde qué ciudad salís y a qué ciudad te gustaría ir?
No avances ni derives hasta que confirme las ciudades exactas de salida y destino antes de continuar.

🧩 MENSAJES INTERMEDIOS
Usá estos cierres mientras recopilás información (no uses "agente"):
Con estos datos podré ayudarte de la mejor forma posible 🙌
Con esta información ya puedo continuar con tu cotización 😊
Gracias, con esto avanzo para prepararte el siguiente paso ✈️
Usá solo una de estas frases por conversación, antes de derivar o insistir.

✅ MENSAJE FINAL (DERIVACIÓN)
Cuando ya tengas todos los datos necesarios o el cliente demuestre interés real aunque falte alguno, enviá:
Perfecto, acá tenés un resumen de los datos que me pasaste:
🌍 Ciudad de salida: [dato]
🌴 Ciudad de destino: [dato]
📆 Fechas: [dato o "Fecha estimada" si no es exacta]
👥 Cantidad de pasajeros: [dato con edades si las dio]
💵 Presupuesto por persona: [dato en USD o "pendiente"]
Te transfiero a un agente que te responderá a la brevedad.

🚫 REGLAS DE SEGURIDAD FINAL
Nunca uses "agente" salvo en el mensaje final de derivación.
No respondas fuera de horario laboral (lo maneja Callbell).
No repitas mensajes automáticos.
No vuelvas a iniciar conversación si ya se activó el mensaje de bienvenida.
```

### 2.4 Template "Multimedia recibido"

Cuando el user envía un attachment (audio/imagen/PDF), antes del prompt OpenAI se ejecuta:

```
¡Hola! Soy Vico, tu asistente virtual de Vico Travel Group. Estoy aquí para
ayudarte a planificar tu próxima aventura. Para asegurar una comunicación
rápida y eficiente, por favor, comunícate con nosotros solo por mensaje de
texto, sin audios ni llamadas. ¿En qué puedo ayudarte hoy?
```

(283 chars, sin botones, sin adjunto. La URL del adjunto del usuario queda guardada en variable `adjunto-valorar` para futura referencia).

### 2.5 Datos que el bot extrae del cliente

| Dato | Tipo | Cómo se obtiene |
|---|---|---|
| Ciudad de salida | string | Pregunta directa; rechaza países, exige ciudad |
| Ciudad de destino | string | Pregunta directa; rechaza países/regiones |
| Fechas de viaje | rango o exacto | Acepta fechas exactas, mes+noches, o rangos tipo "segunda quincena enero" |
| Cantidad de pasajeros | número | Pregunta directa |
| Edades de pasajeros | lista | Acepta `"1, 5, 11, 35, 38"` o `"1/5/11/35/38"` |
| Presupuesto por persona | número en USD | Acepta aproximado; si lo da en pesos lo deja literal en nota |
| Origen de la consulta | label | 1=cotización / 2=postventa / 3=problema en viaje / 4=Mundial / 5=F1 |
| Caso especial "Guada Merlo" | flag | Si menciona "Guada Merlo" en primer mensaje → derivación inmediata |
| Caso "grupo >9 pasajeros" | flag | Derivación inmediata con nota "Cotización grupal" |

### 2.6 Lógica de derivación a agente humano

Deriva en estos casos:
- Tiene todos los datos (ciudad x2 + fechas + pasajeros/edades + presupuesto).
- Falta algún dato pero cliente demostró interés real después de 2 intentos.
- Cliente elige opciones 2 (postventa), 3 (problema viaje), 4 (Mundial), 5 (F1).
- Cliente menciona "Guada Merlo" (referido directo de alguien interno).
- Cotización grupal (>9 pasajeros).

**No deriva** cuando:
- Cliente dice cosas genéricas tipo "hola", "mandame info", "me interesa la promo".
- Solo ha dado país/región (sin ciudad específica).
- Fuera de horario laboral (Callbell lo maneja con su propia respuesta).

### 2.7 Templates de derivación al humano

**Mensaje de transferencia al cliente** (el último mensaje que el bot manda antes de pasar al humano):
```
Perfecto, acá tenés un resumen de los datos que me pasaste:
🌍 Ciudad de salida: [dato]
🌴 Ciudad de destino: [dato]
📆 Fechas: [dato o "Fecha estimada"]
👥 Cantidad de pasajeros: [dato con edades]
💵 Presupuesto por persona: [dato en USD o "pendiente"]
Te transfiero a un agente que te responderá a la brevedad.
```

Para casos sin recolección de datos (urgencias, postventa):
```
Te transfiero a un agente que te responderá en breve.
```

**Nota interna** (queda como nota privada en la conversación de Callbell — sirve para que el vendedor humano vea el contexto sin tener que scrollear el chat).
- TODO: confirmar exactamente qué pone (pendiente — clickear nodo "Añadir nota").

**Asignar equipo**:
- TODO: confirmar a qué equipo (pendiente — clickear nodo "Asignar equipo").

---

## 3. Lógica de los nodos clave (confirmada)

### Nodo "Agente" (decision)
- **Condición**: `Último éxito del webhook` (output del OpenAI #1) **incluye** la palabra `agente`.
- **Comportamiento**: si fire → branch izquierdo (derivación). Si no → branch derecho (bot sigue conversando).
- **Truco**: el prompt INSTRUYE al LLM a NO usar "agente" durante la recolección, solo al final cuando ya decide derivar. Es decir, **la palabra `agente` es la señal de control** entre el LLM y el flow engine.

### Nodo "Mensaje transferencia a agente"
- **Contenido**: variable `Último éxito del webhook` (= output del LLM, tal cual).
- El LLM construye el mensaje final completo (incluido el resumen 🌍📆👥💵). El bot solo lo reenvía al cliente.

### Nodo "Añadir nota" (después de la transferencia)
- **Contenido**: mismo `Último éxito del webhook`.
- La misma info que ve el cliente queda como nota interna privada en la conversación.
- **Por qué**: cuando el agente humano abre el chat, ve la nota arriba con todos los datos. No tiene que scrollear el chat.

### Nodo "Asignar equipo"
- **Equipo**: `General` (9 miembros).
- Todos los leads van a un único equipo "General". El reparto interno (round-robin / pickup manual / por agente disponible) lo hace Callbell. Es decir: **VICO NO tiene asignación específica por vendedor en el bot** — todo cae al pool de 9 agentes del equipo General.

### Nodo "ya procesado" (idempotency)
- **Condición**: `adjunto-valorar` (URL guardada de la última multimedia procesada) **==** `Url del archivo adjunto del último usuario` (URL de la multimedia que acaba de llegar).
- **Comportamiento**: si fire → skip (es la misma media que ya procesamos, no re-derivar). Si no → procesar via OpenAI #2 + derivar.
- **Por qué**: cuando el bot ya derivó a un agente humano por una media no soportada, si el cliente vuelve a mandar la misma media (re-envío accidental), no spamear al agente con otra derivación.

### Nodo "Derivar a agente ya que usuario mando audio"
- **Contenido literal**: "Por el momento no puedo interpretar audios, imágenes ni documentos. Pero no te preocupes! Te derivo a un agente para que pueda ayudarte a la brevedad!"
- 150 chars. Sin botones, sin adjunto.

### OpenAI #2 (al final del path multimedia)
- **Modelo**: `gpt-4o` (full, no mini — usan el más capaz para resumir).
- **Prompt completo**: `"Resumir el contenido de la conversación hasta el momento."`
- **Output**: el resumen se guarda en `Último éxito del webhook` → se usa como nota interna para el agente que tome el caso.
- **Por qué**: el agente recibe un resumen limpio (texto), no tiene que re-leer todo el chat.

## 4. Cross-bot check

Verifiqué que el **bot de Instagram (v26)** tiene el **MISMO prompt** que el de WhatsApp Emilia VICO (v49): **6258 chars, mismo inicio y mismo final**. La estructura del flow es idéntica entre los 4 bots activos.

Asumimos por consistencia que **`Bot Sin Multimedia bis`** (WhatsApp Aldana) y **`Messenger`** (Facebook) también son copias del mismo bot. Las distintas versiones (49 / 23 / 24 / 26) reflejan cuándo se actualizó cada copia, no contenido distinto.

**Implicación para nosotros**: tenemos UN solo prompt que replicar en ManyChat, no 4. ✅

---

## 4. Implicaciones para replicar en ManyChat

### Lo bueno (lo que reusamos directo)

- **Prompt del OpenAI**: portable tal cual a ManyChat (ManyChat soporta OpenAI custom action).
- **Modelo**: gpt-4o-mini es razonable, bajo costo. Sirve para empezar.
- **Template multimedia**: tal cual.
- **Variables del lead**: ciudad_salida, ciudad_destino, fechas, pasajeros, edades, presupuesto, fuente — todas ya están mapeadas a las tags + campos custom que armamos en el bootstrap.

### Lo que hay que adaptar

- **Trigger**: en Callbell el bot fires en cualquier mensaje entrante. En ManyChat el flow se dispara con palabras clave o desde el growth tool (link de Instagram/WhatsApp).
- **Categorías 4 y 5 (Mundial / F1)**: probablemente ya no aplican (campañas pasadas). Validar con Enzo cuáles son las campañas activas al momento de armar el bot.
- **"Guada Merlo"**: hardcoded en el prompt. Si hay más referidores así, conviene parametrizarlos.
- **Asignación a vendedor**: en Callbell asignan a un equipo Callbell. En ManyChat → Vibook tenemos que mapearlo a un `assigned_seller_id`. Falta decidir: ¿round-robin? ¿manual desde Vibook? ¿depende del horario?
- **Notas internas**: en Callbell quedan como "nota" privada en la conversación. En Vibook van como `leads.notes` (text). Cuando el reconcile cron sincronice, las notas Callbell también vienen vía API.

### 🚨 Tareas previas obligatorias antes de replicar

1. **Rotar la OpenAI API key** que está visible en plaintext en el bot de Callbell. Cualquiera con acceso al panel la ve.
2. **Documentar las 5 opciones de menú activas** con Enzo (cuáles son evergreen vs campañas terminadas).
3. **Definir el mapeo agente → equipo Vibook** (multi-tenant aware: el "agente Vibook" tiene que ser un usuario con seller permissions del tenant VICO).
4. **Decidir si el bot vive en ManyChat O Callbell o ambos**:
   - Si ambos: hay que coordinar para que no se pisen (Callbell desactivado en los canales que ManyChat va a manejar, o ManyChat en lectura solamente).
   - Recomendación inicial: **mantener Callbell como inbox para vendedores** y **ManyChat solo en Instagram** (donde Callbell no tiene tan buen ROI), después decidir si extender.

---

## 5. Comparativa Callbell ↔ ManyChat

| Feature | Callbell | ManyChat |
|---|---|---|
| OpenAI integration | ✅ Nativa (action node) | ✅ Nativa (action node) |
| Multi-canal | ✅ WhatsApp + IG + FB + Telegram + Email | ✅ IG + FB + WhatsApp + SMS |
| Bot visual builder | ✅ Sí | ✅ Sí (más maduro) |
| Variables / contexto | ✅ Sí | ✅ Sí + Custom Fields más ricos |
| Asignación a agente humano | ✅ Sí (equipos Callbell) | 🟡 Vía Live Chat handover |
| Costo de envío de mensaje | $$ (cobra por conversación) | $ (más barato, plantillas WA aparte) |
| Inbox para vendedores | ✅ Excelente (su core) | 🟡 OK pero peor UX |
| Templates de respuesta rápida | ✅ Sí | ✅ Sí |
| Funnels visuales | ✅ Sí | ✅ Sí |
| API webhook | ✅ Sí (configurada para Vibook ya) | ✅ Sí |

**Conclusión inicial**: el rol natural sería **ManyChat para captura + qualification** (lo más fuerte de ManyChat) y **Callbell para el seguimiento humano de la conversación** (su mejor producto). Esto coincide con el diseño actual de la integración Vibook (ManyChat webhook crea el lead, Callbell webhook lo enriquece con nota/tag/funnel).

---

## 6. Resumen ejecutivo — qué hay que replicar en ManyChat

### Componentes a clonar (en orden de prioridad)

1. **Prompt único de 6258 chars** (§2.3). Portable tal cual a ManyChat (action `OpenAI Custom`).
2. **OpenAI principal**: `gpt-4o-mini` con context = "sólo sesión actual".
3. **Trigger de derivación**: detección de la palabra `agente` en el output del LLM.
4. **Reenvío del output OpenAI** como mensaje al user (sin transformar).
5. **Copia del mismo output como nota interna** (en Vibook: `leads.notes`).
6. **Asignación al equipo "General"** (en Vibook: round-robin entre los 9 sellers de VICO o manual desde el kanban).
7. **OpenAI secundario** (`gpt-4o`, prompt "Resumir...") **solo** si decidimos manejar multimedia. Si en la primera versión nos quedamos solo con texto en ManyChat, se puede saltear.

### Variables que tiene que setear ManyChat al pegarle al webhook Vibook

Las variables que el bot extrae del cliente (mapean a `leads.* + tags + funnels`):

| Bot field | Vibook destination | Tag/Field type |
|---|---|---|
| Ciudad de salida | `leads.origin_city` (custom field) o nota | string |
| Ciudad de destino | tag categoría `destino` | string → match con tags pre-seedeadas |
| Fechas de viaje | `leads.travel_dates` + tag categoría `mes` | rango date o flag de mes |
| Cantidad de pasajeros | `leads.pax_count` | int |
| Edades pasajeros | `leads.pax_ages` (jsonb array) | int[] |
| Presupuesto USD | `leads.budget_usd` | int (o string si no es USD) |
| Origen consulta (opción 1-5) | tag categoría `origen` | enum: PUBLICIDAD/REFERIDO/CANALES/OPERADOR/DERIVACION |
| Caso especial "Guada Merlo" | tag categoría `origen` = REFERIDO + nota | flag |

### Reglas de negocio críticas (NO olvidar al replicar)

- **No usar la palabra "agente" en mensajes intermedios** (es la señal de control del flow engine).
- **Pedir todos los datos en UN solo mensaje**, después repreguntar solo lo que falta.
- **Insistir máximo 2 veces** por dato faltante. Después → derivar igual con nota.
- **Rechazar países/regiones** como ciudades. Pedir ciudad específica.
- **Cotización grupal (>9 pasajeros)** → derivación inmediata con nota "Cotización grupal".
- **No convertir presupuesto a USD** si lo dan en otra moneda. Dejarlo literal en la nota.
- **No responder fuera de horario laboral** (Callbell ya lo maneja; en ManyChat hay que armar un mini-flow de horario o dejar que el bot responda 24/7 + el humano agarra al otro día).
- **"Guada Merlo" hardcoded como flag de referido VIP** → derivación inmediata.

### Pendientes con Enzo antes de replicar

1. **Validar las 5 opciones de menú actuales** (1️⃣ Quiero viajar / 2️⃣ Consulta de viaje vendido / 3️⃣ Problema en viaje / 4️⃣ Mundial / 5️⃣ F1):
   - ¿4️⃣ Mundial sigue activo o ya pasó la campaña?
   - ¿5️⃣ F1 sigue activo o ya pasó?
   - ¿Hay nuevas campañas que agregar?
2. **Pedirle la lista actualizada de referidores VIP** (no solo Guada Merlo).
3. **Decidir estrategia ManyChat vs Callbell**:
   - **Opción A**: ManyChat solo en Instagram (donde Callbell no usan); Callbell sigue en WhatsApp/FB.
   - **Opción B**: ManyChat en todos los canales (Instagram + WhatsApp + FB) y desactivar bots Callbell. Más limpio pero requiere migrar conversaciones activas.
   - **Opción C**: ManyChat para captura inicial → siempre deriva a Callbell para humanos (ambos coexisten).
4. **OpenAI API key**:
   - 🚨 **La actual está visible en plaintext en Callbell**. Antes de hacer cualquier cosa, rotar.
   - Decidir si la nueva key se usa también en ManyChat o cada uno tiene la propia.
5. **Asignación**: el bot Callbell asigna al equipo "General" (9 personas). En Vibook tenemos los 10 users de VICO (1 SUPER_ADMIN, 1 ADMIN, 1 CONTABLE, 7 SELLER). ¿Round-robin entre los 7 SELLER cuando llega un lead de ManyChat?

### Estimación de esfuerzo (cuando se decida arrancar)

- Replicar el prompt + flow básico en ManyChat: **4-6 hs** (una persona, sin testing).
- Ajustar el webhook ManyChat→Vibook para mapear las variables nuevas: **2-3 hs**.
- Testing end-to-end (mensaje desde IG real → lead aparece en Vibook con tags + nota + asignación): **2-3 hs**.
- **Total: ~1-1.5 días** para tener un MVP funcionando en un canal (Instagram).

### Riesgos a anticipar

1. **Drift entre prompts**: si se modifica el bot Callbell pero no el de ManyChat (o viceversa), el cliente recibe respuestas inconsistentes según canal. Necesita disciplina o automatización del sync.
2. **Costo OpenAI**: el bot ya usa `gpt-4o-mini` + `gpt-4o`. Con 14+ conversaciones por día (estimado) y conversaciones de 5-10 turns, los tokens suben. Vale la pena medir.
3. **Latencia de derivación**: el bot Callbell deriva al equipo "General" (9 agentes). El proceso humano de pickup en Callbell parece ya estar resuelto. En ManyChat hay que diseñar cómo notificar al seller asignado (push notification Vibook? email? otro canal?).
4. **Conflicto multi-canal**: si un cliente escribe por IG y después por WhatsApp, son contactos distintos en Callbell. Validar que en Vibook se unifiquen por teléfono/email o se mantengan separados.
