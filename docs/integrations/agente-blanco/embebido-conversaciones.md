# Conversaciones — embebido de Agente Blanco

Bandeja de Instagram/WhatsApp de Agente Blanco servida dentro de Vibook. Vive en
`/conversaciones` y en el sidebar aparece como **"Agente Blanco"**, con su micro
logo, dentro de Herramientas y justo arriba de WHA Control. Toda la UI del chat (lista de chats, mensajes, ficha del
lead) corre en un iframe de Agente Blanco: de este lado solo vive el marco.

No confundir con la ingesta de leads de Agente Blanco, que entra por el webhook
de ManyChat (`docs/integrations/manychat/conectar-cliente-agente-blanco.md`).
Son dos caminos distintos con la misma contraparte.

## Las piezas

| Pieza | Dónde |
| --- | --- |
| Slug de la empresa | `organizations.agente_blanco_org_slug` (migración `20260830000002`) |
| Red por agencia | `agencies.agente_blanco_network` (migración `20260830000003`) |
| Endpoint que firma el token | `app/api/agente-blanco/token/route.ts` |
| Pantalla | `app/(dashboard)/conversaciones/page.tsx` + `components/conversations/agente-blanco-inbox.tsx` |
| Carga de datos (platform admin) | `app/api/admin/orgs/[id]/agente-blanco/route.ts` + `components/admin/agente-blanco-card.tsx` |

Lógica compartida en `lib/agente-blanco/` (`config.ts`, `token.ts`, `org.ts`).

## Soft-launch (estado actual)

Mientras se valida en producción, la sección está limitada a los emails de
`SOFT_LAUNCH_EMAILS` (`lib/agente-blanco/config.ts`): la cuenta de prueba y la
de platform admin que carga el slug.

El gate se aplica en las **tres** puertas, no solo en el sidebar:

| Puerta | Efecto si no estás en la lista |
| --- | --- |
| `app/(dashboard)/layout.tsx` | el ítem no aparece en el sidebar |
| `app/(dashboard)/conversaciones/page.tsx` | 404 |
| `app/api/agente-blanco/token/route.ts` | 403 |

Esconder el ítem sin cerrar el endpoint dejaría el embebido abierto para
cualquier usuario de una org habilitada que supiera la URL — mismo criterio que
"arreglar permisos ocultando botones pero dejando la API abierta", que
`AGENTS.md` lista como anti-patrón.

Para liberar a todas las orgs con slug: borrar la constante y sus tres usos.
El slug por org sigue siendo el switch de fondo.

## La regla que no se puede aflojar

**El endpoint del token es la puerta.** Agente Blanco verifica que la firma sea
legítima y que la empresa esté habilitada, pero no vuelve a preguntar quién es
la persona: confía en que quien firmó ya lo resolvió.

En concreto, el claim `org` **nunca** puede venir de un parámetro del request.
Se resuelve server-side desde `user.org_id` (`getAgenteBlancoOrgSlug`). Si el
endpoint firmara un token con `org: "otra-empresa"`, esa bandeja se abre.

Corolarios:

- `organizations.agente_blanco_org_slug` y `agencies.agente_blanco_network` los
  escribe **solo platform admin** (`PATCH /api/admin/orgs/[id]/agente-blanco`).
  No hay endpoint de tenant: un admin de agencia que pudiera escribirlos se
  auto-asignaría la bandeja de otra empresa habilitada.
- Un slug pertenece a una sola org y una red a una sola agencia: hay índice
  único parcial en las dos columnas.
- `sub` es `users.id` y tiene que ser **estable**. Agente Blanco crea el usuario
  la primera vez que lo ve y lo reusa; si cambia, la persona aparece como
  alguien nuevo y pierde sus chats asignados.
- `AGENTE_BLANCO_SECRET` es solo backend. Nunca `NEXT_PUBLIC_`.

`agencyId` es la excepción deliberada: **sí** viaja por query string, porque se
valida contra las agencias que resolvió `getUserAgencyIds`. El usuario solo
puede elegir entre las suyas.

## Token

`GET /api/agente-blanco/token[?agencyId=<uuid>]` → `{ token }`. JWT HS256,
2 minutos, un solo uso.

Header: `{"alg":"HS256","typ":"JWT"}`, más `kid` si `AGENTE_BLANCO_KEY_ID` está
seteado. Base64url sin padding.

| Claim | Valor |
| --- | --- |
| `iss` | `AGENTE_BLANCO_CLIENT_ID` (default `vibook`) |
| `sub` | `users.id` |
| `org` | `organizations.agente_blanco_org_slug` |
| `network` | `agencies.agente_blanco_network` de la agencia elegida; se omite si la empresa tiene una sola red o si hay varias y no se eligió |
| `name` | nombre del usuario, con fallback a la parte local del mail |
| `email` | del usuario; se omite si está vacío |
| `jti` | UUID nuevo por llamada |
| `iat` / `exp` | ahora / ahora + 120 s |

`name` no es cosmético: es la firma de cada mensaje que manda esa persona y lo
que se ve en la asignación de chats. Por eso siempre mandamos algo, aunque
`users.name` venga vacío.

Se firma a mano con `node:crypto` (`lib/agente-blanco/token.ts`) en vez de sumar
`jsonwebtoken`: son 15 líneas y el repo ya hace HMAC así.

La respuesta va con `Cache-Control: no-store`. **No cachear**: el segundo uso
del mismo `jti` se rechaza con `INVALID_TOKEN`.

Permiso: `leads.read`. La bandeja son las conversaciones del CRM, así que quien
no ve leads tampoco ve los chats — eso deja afuera al asesor independiente
(VIB-69), que tiene `leads` en false por techo.

Códigos de respuesta: 400 sin org, 403 sin permiso / fuera del soft-launch /
`agencyId` ajeno, 404 si la org no tiene slug, 503 si falta
`AGENTE_BLANCO_SECRET`.

## Sucursales (el claim `network`)

En Agente Blanco la sucursal **es la red conectada**: la cuenta de Instagram o
el número de WhatsApp. Lozada es una empresa con dos redes, igual que ya se
distingue por `agency` en la ingesta de leads.

Sin el claim, Agente Blanco abre la primera red por orden alfabético. Para una
empresa de una sola red da igual; para una de dos es arbitrario y **parece que
faltan chats**.

Cómo se resuelve:

- 0 redes cargadas → no mandamos el claim.
- 1 red → la mandamos, sin pedirle nada al usuario.
- 2 o más → la pantalla muestra un selector de sucursal y manda `agencyId`.
  Cambiar de sucursal hace `destroy()` + `mount()`, que dispara un token nuevo.

Si mandamos una red que no es de esa empresa, Agente Blanco responde
`NO_NETWORK` en vez de caer en silencio a otra.

## Pantalla

El ítem del sidebar aparece solo si la org tiene slug **y** el usuario está en
el soft-launch: el layout del dashboard resuelve `getAgenteBlancoOrgSlug` y pasa
`conversationsEnabled` a `AppSidebar`, que filtra el subitem con
`requiresAgenteBlanco`. El micro logo sale de `public/agente-blanco-icon.png`
(favicon de marca que nos pasaron) y lo renderiza `nav-main.tsx` vía `iconSrc`. La ruta hace 404 en los mismos casos — no
hay cartel ni pantalla vacía.

Dos detalles del montaje:

- **Altura.** No usamos `data-height="fill"`. El shell del dashboard ya tiene
  header, banners y un contenedor con scroll propio; la bandeja es una app con
  scroll propio, no un documento que crece, así que sin altura acotada el
  iframe colapsa. La página fija la altura y el iframe ocupa el 100%.
- **Ciclo de vida.** El snippet se carga **una vez** por carga de página, sin
  `data-target` para que no auto-monte, y el montaje se maneja con
  `AgenteBlanco.mount({ clientId, org, target })` / `AgenteBlanco.destroy()`.
  Es lo que Agente Blanco recomienda para SPAs.

  `onTokenNeeded` y `on()` se registran una sola vez sobre la instancia del
  snippet, y los eventos se enrutan a la bandeja montada en ese momento
  (`currentInbox`). Registrarlos por montaje apilaría handlers duplicados.

  > Historia: la primera versión reinyectaba el `<script>` en cada navegación.
  > Eso destapó un bug del lado de Agente Blanco —el archivo reemplazaba
  > `window.AgenteBlanco` y se llevaba puesto el `onTokenNeeded` ya
  > registrado—, que ellos corrigieron. Reinyectar hoy funciona, pero
  > `mount()`/`destroy()` es el camino soportado.

Errores del snippet (`AgenteBlanco.on('error')`) mapeados en
`lib/agente-blanco/config.ts`. `ADDON_DISABLED`, `ORG_NOT_ALLOWED` y
`NO_NETWORK` se muestran como estado (configuración pendiente), no como falla.
`EMBED_SESSION_EXPIRED` no se muestra: el snippet ya pidió otro token solo.

## Detalles confirmados por Agente Blanco

- **Reloj**: aceptan ±30 s de desfasaje. El tope `exp − iat ≤ 5 min` no cambia,
  así que nuestros 2 minutos entran cómodos.
- **`sub`**: cualquier texto, sin restricción de largo más allá del tope del
  token (4 KB). Un UUID estable es el caso ideal.
- **Cookies de terceros**: no se usan. La sesión vive en memoria dentro del
  iframe y viaja como header `Authorization`. El único efecto es cosmético —
  preferencias del iframe pueden no persistir en Safari.
- **Habilitar la empresa y prender el addon son dos pasos distintos** del lado
  de ellos. Un `ADDON_DISABLED` en la primera prueba no es un error nuestro.

## CSP

Hoy la app **no** manda `Content-Security-Policy` (no hay header en
`next.config.js` ni en `middleware.ts`), así que no hubo nada que tocar. Si
alguna vez se agrega, el embebido necesita:

```
script-src https://agenteblanco.com.ar
frame-src  https://agenteblanco.com.ar
```

## Variables de entorno

```
AGENTE_BLANCO_SECRET=                 # solo backend
AGENTE_BLANCO_CLIENT_ID=vibook
AGENTE_BLANCO_KEY_ID=                 # opcional: kid del secreto vigente
NEXT_PUBLIC_AGENTE_BLANCO_EMBED_SRC=https://agenteblanco.com.ar/v1/embed.js
```

Rotación del secreto: el anterior sigue funcionando una semana, así que no hace
falta coordinar un corte. Distinto del token del CRM, que sí corta en el acto.

## Alta de una empresa

1. Pasarle a Agente Blanco los orígenes exactos (esquema + dominio, sin barra
   final, prod y staging por separado) y recibir el secreto por gestor de
   contraseñas o link de un solo uso — nunca por mail o chat. Agregar un origen
   después es un cambio de un minuto del lado de ellos.
2. Agente Blanco habilita la empresa, prende el addon y devuelve el slug más el
   identificador de cada red si tiene más de una.
3. Platform admin → `/admin/orgs/<id>` → tarjeta "Conversaciones (Agente
   Blanco)" → cargar el slug y, si hay varias redes, la red de cada agencia.
4. Verificar que el usuario esté en `SOFT_LAUNCH_EMAILS`, o la sección no se ve
   aunque la org tenga slug.
5. La sección aparece en el sidebar de esa org en la próxima navegación.

Para dar de baja, quitar el slug: la sección deja de existir para el tenant.
