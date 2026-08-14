# Mapa de calor de uso del producto

Estado: activo desde 2026-08-13.
Alcance: platform admin (`/admin/usage`). Cross-tenant por diseno.

Complemento de `analytics-ga4.md`, no reemplazo. GA4 responde tendencias de
comportamiento; esto responde **que agencia usa que modulo, y desde cuando no**.

## Por que existe si ya hay GA4

Tres limites de GA4 que no se arreglan configurandolo mejor:

1. **Ad blockers**: se comen 20-40% de los hits, sesgado hacia usuarios
   tecnicos. Sirve para tendencias, no para "esta agencia esta viva".
2. **`org_id` es dimension user-scoped**: se puede segmentar, pero no cruzar
   contra `subscription_status`, MRR ni fecha de alta. La pregunta que importa
   para churn — "orgs que pagan y dejaron de operar hace tres semanas" — vive
   en Postgres.
3. **GA4 no tiene heatmaps.** Lo mas cercano es exportar a Looker Studio.

Y una ventaja que GA4 no puede dar: **historia retroactiva**. Los datos ya
estaban en la base; el mapa funciono desde el primer deploy con 90 dias de
pasado, sin esperar a acumular eventos.

## Que mide, y que no

Un "evento" = **una fila creada por una persona usando la app**.

Las **escrituras** no se instrumentaron: se derivan de lo que cada bounded
context ya hace. Por eso tienen historia retroactiva y son exactas.

Las **lecturas** salen de `usage_events`, el sink propio (fase 2, ver abajo).
Empiezan a existir recien desde su deploy.

Las dos señales se miran por separado en la UI, con un selector. **No se
suman**: una operacion creada y una pantalla mirada no son la misma unidad, y
promediarlas daria un numero que no significa nada.

Excepcion deliberada: **DAU/WAU/MAU si usan las dos** (`_admin_usage_actors`).
Ahi la pregunta es binaria — "¿esta persona trabajo hoy?" — y alguien que entra
todos los dias a mirar reportes esta activo aunque no escriba nada.

### Dimensiones del stream

| Columna | De donde sale | Cuidado |
|---|---|---|
| `screen` | cliente, validado en el server | Formato `path[#tab:x\|#dlg:x]` |
| `session_id` | cliente (`sessionStorage`) | UUID validado en JS: uno invalido tumbaria el INSERT del batch entero |
| `role` | server, congelado | `getEffectiveAgencyScopeRole` + `SELLER_AVI` |
| `agency_id` | server, solo si es inequivoco | `NULL` = sin agencia o multi-agencia |

El cliente propone `screen` y `session_id` porque son hechos del browser que el
server no puede conocer; los dos pasan por un sanitizador estricto. `role`,
`agency_id` y `org_id` **nunca** vienen del cliente.

**La agencia no se infiere.** Se guarda solo si el usuario pertenece a
exactamente una (`user_agencies` crudo, no `getUserAgencyIds()`, que responde
"que puede ver" y para un SUPER_ADMIN devuelve todas las de la org). Entre un
tercio y la mitad de los eventos quedan en `NULL`, y eso es informacion, no un
hueco: los roles de alcance org no estan asignados a ninguna sucursal, y
contabilidad, comisiones y pagos a operadores se manejan a nivel organizacion.
La UI muestra "Sin agencia" como fila explicita.

Excluido a proposito (documentado en la migracion):

| Fuente | Por que no cuenta |
|---|---|
| `ledger_movements`, `commission_records` | derivados automaticos de `payments` |
| `alerts`, `notifications` | los genera un cron |
| `audit_logs`, `billing_events` | sistema, no producto |
| `wa_messages`, `conversations` | trafico de integraciones |
| `users`, `agencies` | alta de tenant, no uso diario |

**`leads` se parte en dos.** Los que entran por webhook (Manychat, Callbell,
Chatsell, Eve, Emilia, Agente Blanco) no son uso de la app: son trafico
entrante, y son la mayoria — al escribir esto, 8.500 de 11.200 en 90 dias. Si
contaran como actividad, una org con la ingesta prendida y nadie trabajando
parece la mas activa de la plataforma. Van al modulo `ingestion`, fuera del
heatmap, y se muestran en su propia columna de la tabla. Un canal nuevo que no
este en la lista de la migracion cae del lado manual hasta que se agregue.

## Como esta armado

```txt
supabase/migrations/20260813000010_admin_usage_heatmap.sql   (fase 1: escrituras)
  _admin_usage_events(since)      union de ~30 tablas -> (org, actor, modulo, ts)
  admin_usage_by_org_module(days) la matriz del heatmap
  admin_usage_by_org(days)        resumen por org (dias activos, actores)
  admin_usage_by_hour(days)       dia x hora, en hora de Buenos Aires
  admin_usage_daily(days)         tendencia diaria

supabase/migrations/20260813000011_usage_events.sql          (fase 2: lecturas)
  usage_events                    event stream propio, sin PII
  admin_usage_reads_by_org_module(days)

lib/analytics/modules.ts          vocabulario de modulos + moduleFromPath (puro)
lib/analytics/events.ts           catalogo + EVENT_SINKS
lib/analytics/telemetry/          emit.ts (browser) + server.ts (writes)
app/api/telemetry/route.ts        ingesta; resuelve org_id de la SESION
app/api/cron/usage-retention/     purga > 90 dias

lib/admin/usage.ts                rampa y funciones puras del heatmap
components/admin/usage-heatmap.tsx        matriz org x modulo (client, selectores)
components/admin/usage-hours-heatmap.tsx  dia x hora
components/admin/usage-daily-chart.tsx    agencias activas por dia
app/admin/usage/page.tsx                  composicion + tabla de engagement
```

El vocabulario de modulos es **uno solo** (`lib/analytics/modules.ts`) y lo
comparten los tres consumidores: la union SQL de escrituras, el
`moduleFromPath()` de las lecturas y las columnas de la matriz. Si fueran tres
listas, un modulo nuevo aparecería en una señal y no en la otra, y el mapa
mentiria sin que nadie lo note.

### Seguridad

Las funciones son **SECURITY INVOKER** a proposito: se invocan con service_role
desde una pagina que ya esta detras de `isPlatformAdmin()`. Un SECURITY DEFINER
seria una escalada sin motivo.

**El `REVOKE` de la migracion no es cosmetico.** Postgres otorga `EXECUTE` a
`PUBLIC` por default en toda funcion nueva: sin revocarlo, cualquier usuario
autenticado podria llamar las RPC y enumerar la actividad de todos los tenants.
Al agregar una funcion `admin_usage_*`, agregar tambien su `REVOKE` + `GRANT ...
TO service_role`.

`app/admin/usage/page.tsx` esta en `scripts/admin-client-allowlist.txt` como
`PLATFORM_ADMIN`.

### Detalles que parecen menores y no lo son

- **Escala logaritmica.** Los volumenes estan sesgados por ordenes de magnitud:
  un import de clientes mete 6.500 filas en un dia y una agencia entera factura
  200 en un mes. En escala lineal ese import pinta una sola celda y deja todo el
  resto del mapa en blanco. `heatLevel()` tiene el test que lo fija.
- **Hora de Buenos Aires, no UTC.** En UTC el pico de la tarde argentina cae
  despues de medianoche y el heatmap de horas queda ilegible.
- **Toggle absoluto / relativo.** Absoluto responde "quien mueve volumen";
  relativo normaliza por fila y responde "que usa cada agencia" sin que la mas
  grande aplaste a una de tres personas. Son dos preguntas distintas.
- **La rampa es de un solo tono** (`--primary`, 232deg) porque el dato es
  magnitud. Va en estilos inline y no en clases de Tailwind: el indice es
  data-driven y el JIT no ve las clases dinamicas. Son valores fijos de light
  mode porque `/admin` corre siempre bajo `.light-force`; si esto alguna vez se
  muestra dentro del dashboard del tenant, necesita rampa dark antes.

## Como leerlo

- **Dias activos** es la columna que mas correlaciona con retencion. Volumen
  alto concentrado en un dia = importaron datos y se fueron.
- **Huecos en el medio de una fila**: las columnas siguen el recorrido del
  producto (captar -> cotizar -> vender -> cobrar -> contabilizar), asi que un
  hueco marca en que paso se traba la agencia.
- **"Pagan y no usan"** es la alarma de churn: cruce de
  `subscription_status` activo contra >14 dias sin escribir nada.
- `actors` es 0 en filas cargadas por import o por cron: esas tablas no siempre
  guardan quien lo hizo. No significa "nadie trabajo".

## Fase 2: el event stream propio

`usage_events` cubre exactamente lo que las tablas no pueden saber: **quien
mira que**. Lo emite `<AnalyticsPageView />` como `module_viewed` en cada
navegacion, por el mismo dispatcher que GA (ver `analytics-ga4.md`).

Cuatro decisiones que sostienen el diseño:

- **`org_id` y `user_id` salen de la sesion, nunca del payload.** Si el cliente
  pudiera elegir el org_id, cualquier usuario podria escribir telemetria en el
  tenant de otro. `createOrgAdminScope` lo hace imposible de olvidar.
- **Nada que ya deje fila en una tabla entra al stream**, o el heatmap contaria
  lo mismo dos veces. Hay un test que fija la regla.
- **`/admin` esta excluido**, y es facil de pasar por alto: los platform admins
  tienen `org_id` de una agencia real (admin@vibook.ai pertenece a Lozada), asi
  que sin la exclusion cada rato en la consola de plataforma se contabiliza como
  si esa agencia estuviera trabajando.
- **El `occurred_at` del cliente se acota a +-1h.** Un reloj mal configurado (o
  manipulado) con un evento en 2090 romperia todos los rangos para siempre.

**Un tenant no ve su propio stream crudo.** Cada fila dice que miro cada usuario
y a que hora: expuesto dentro de la agencia es una herramienta de vigilancia
sobre los empleados. Si algun dia se expone por tenant, va agregado y nunca por
persona. Esto vale mas ahora que existe `admin_usage_by_user`, que muestra
nombre y email: es la unica RPC con PII, exige `p_org_id` sin default (si no,
una sola llamada devolveria el padron de toda la plataforma) y solo se invoca
desde una pagina detras de `isPlatformAdmin()`.

### Vistas sin URL: tabs y dialogs

El pathname no alcanza. `/reports` es UNA ruta con doce vistas atras,
`/operations/[id]` tiene nueve, y el builder de cotizaciones vive **dos modales
por debajo** de `/sales/leads` — o sea que cotizar se contabilizaba como CRM.

Los **tabs** se instrumentan en `components/ui/tabs.tsx`, no en las pantallas.
Radix acepta `defaultValue` y `onValueChange` juntos, asi que el wrapper cubre
los 126 `TabsTrigger` del repo y los futuros sin una linea en los componentes.
Emite tambien en mount: el 95% de los `<Tabs>` son no controlados y para esos el
handler nunca dispara para la vista inicial, que es la mas vista de todas.
`shouldEmitScreen()` dedupea 2 s para que el remonte de tabs anidados no cuente
doble.

Los **dialogs** son opt-in explicito con `useScreenView(nombre, open)`, solo en
los siete mas pesados. No tienen un identificador propio equivalente al `value`
de un tab, y hay decenas de dialogs chicos que no son pantallas.

### Sesiones y logins

`session_id` es del browser (`sessionStorage`, muere al cerrar la pestaña) y no
tiene nada que ver con la sesion de auth: mide "una sentada de trabajo", no "un
login". Los logins salen de `login_sessions` (ver la migracion
`20260814000001`), que tiene historia retroactiva desde febrero.

**La duracion de sesion es una cota inferior**: se calcula como
`max(occurred_at) - min(occurred_at)` por sesion, asi que quien lee una pantalla
cuarenta minutos y se va mide cero. Se descarto agregar pings de engagement —
multiplicarian el volumen de la tabla mas grande del schema para afinar la
metrica menos accionable del set. Por eso ademas del promedio va la mediana:
dos sesiones abandonadas con la pestaña abierta lo arruinan.

### Retencion

`/api/cron/usage-retention` borra lo anterior a 90 dias, que es la ventana mas
larga que ofrece la UI.

Railway Cron Service, igual que los demas crons del proyecto:

```txt
Nombre    cron-usage-retention
Schedule  0 7 * * *            (UTC — 4 AM Argentina)
Comando   curl -fSs -X POST https://app.vibook.ai/api/cron/usage-retention \
            -H "Authorization: Bearer $CRON_SECRET"
Variables CRON_SECRET, con el MISMO valor que el servicio web
```

`deleted: 0` es la respuesta correcta durante los primeros 90 dias: todavia no
hay nada viejo. No confundirlo con un cron que no corre.

Se evaluo `pg_cron` (esta disponible en el proyecto de Supabase y la purga es un
DELETE puro, sin HTTP). Se descarto para no partir el lugar donde viven los
schedules: tener seis crons en Railway y uno en la base es peor que la ventaja
de ahorrarse un servicio.

No hay tabla de rollup y es deliberado: al volumen actual (~50 usuarios activos)
la agregacion sobre el crudo con los indices que ya estan es de milisegundos, y
un rollup prematuro es una copia mas que mantener sincronizada. Reevaluar si el
crudo pasa los ~5M de filas o si la pagina empieza a tardar mas de un segundo.

## Agregar un modulo

1. Agregar la entrada en `PRODUCT_MODULES` (`lib/analytics/modules.ts`) en la
   posicion que corresponda del recorrido, con su flag `write`.
2. Agregar su regla en `PATH_RULES`, **ordenada de mas especifica a mas
   general** — `/operations/billing` va antes que `/operations`, si no facturar
   cuenta como uso de operaciones y el modulo de facturacion queda vacio para
   siempre. Hay un test que fija esos pares.
3. Si tiene escrituras: agregar el `UNION ALL` en `_admin_usage_events` con su
   columna de actor (o `NULL` si la tabla solo guarda el sujeto, como
   `seller_id` en una liquidacion de comisiones, que es a quien se le liquida y
   no quien la genero).
