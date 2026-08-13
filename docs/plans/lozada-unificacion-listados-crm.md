# Unificacion de listados del CRM — Lozada (Rosario + Madero)

Fecha de relevamiento: 2026-07-28
Org: `Lozada Rosario` (`1b326d20-d133-4112-a798-f54b5af7e7cb`, `crm_mode = legacy`)
Agencias: Rosario (`66563aeb-4e8b-40ee-a622-b39defb380dd`) y Madero (`fabbc2e7-81d8-4ca1-85b2-7809c5f88e75`)
Estado: **APLICADO el 2026-07-28**. El cliente aprobo las fusiones de la seccion 4.
Detalle de lo ejecutado en la seccion 9.

---

## 1. Problema

El CRM Ventas de Lozada tiene hoy **66 columnas visibles** entre sus dos agencias:
40 en Rosario y 26 en Madero, sobre 10.615 leads. El tablero es ilegible y los vendedores
no tienen un criterio claro de donde cae cada lead.

## 2. Causa raiz

En `crm_mode = legacy` **no existe una tabla de listas con id**. La columna del kanban es el
string `leads.list_name`; `manychat_list_order` solo guarda orden, dueno (`seller_id`) y
prompt de Emilia, con `UNIQUE(agency_id, list_name)`. La clave de columna se deriva en runtime:

```sql
-- supabase/migrations/20260724000001_crm_kanban_lazy_rpcs.sql
COALESCE(NULLIF(btrim(p_list_name), ''), NULLIF(btrim(p_region), ''), 'Sin lista')
```

Consecuencia: **cualquier variacion de texto crea una columna nueva**. Eso dejo tres capas
superpuestas:

1. Dos prefijos conviviendo para el mismo destino: `Leads - Brasil` y `Campana - Brasil`.
2. Columnas fantasma de la era Trello, en mayusculas, que nunca se registraron en
   `manychat_list_order` (`OTROS`, `CARIBE`, `CRUCEROS`). Son visibles solo para admins.
3. Campanas estacionales que quedaron abiertas despues de terminar
   (`Campana - Caribe Marzo/Junio`, `Campana - EUROPA -SEPTIEMBRE OCTUBRE`,
   `Campana - EXOTICOS - MACHU PICHU - AGOSTO`).

Ademas, como `manychat_list_order` es `UNIQUE(agency_id, list_name)` y **todos los usuarios de
Lozada pertenecen a las dos agencias** (`user_agencies`), el set de listas esta duplicado por
agencia y en la vista "Todas las agencias" se mezclan las claves.

## 3. Criterio acordado

- Los listados de destino quedan con **nombre limpio, sin prefijo**: `Brasil`, `Caribe`,
  `Estados Unidos`, `Argentina`, `Cruceros`, `Europa`, `Exoticos`, `Instagram`, `Otros`.
- **Las listas personales por vendedor no se tocan en esta ronda.** Sus duplicados entre
  agencias quedan registrados en la seccion 7 para una ronda posterior.

---

## 4. Fusiones propuestas

### Rosario — 21 columnas de destino → 9

| Listado nuevo | Se fusionan | Leads activos |
|---|---|---|
| **Brasil** | `Campana - Brasil` (205) + `Leads - Brasil` (10) + `Campana - Pre Venta Brasil Verano` (1) | 216 |
| **Estados Unidos** | `Campana - EE UU` (233) + `Leads - EEUU` (61) | 294 |
| **Caribe** | `Campana - Caribe` (159) + `Leads - Caribe` (44) + `Campana - Caribe Marzo/Junio` (1) + `CARIBE` (1, fantasma Trello) + `Caribe en Cuotas` (0) | 205 |
| **Instagram** | `Leads - Instagram` (190) — solo se renombra | 190 |
| **Otros** | `Leads - Otros` (41) + `OTROS` (3, fantasma Trello) | 44 |
| **Cruceros** | `Campana - Cruceros` (33) + `CRUCEROS` (4, fantasma Trello) | 37 |
| **Argentina** | `Leads - Argentina` (15) + `Campana - Argentina` (2) | 17 |
| **Europa** | `Leads - Europa` (4) + `Campana - EUROPA -SEPTIEMBRE OCTUBRE` (0 activos, 1 archivado) | 4 |
| **Exoticos** | `Leads - Exoticos` (1) + `Campana - EXOTICOS - MACHU PICHU - AGOSTO` (0 activos, 2 archivados) | 1 |

### Madero — 13 columnas de destino → 8

| Listado nuevo | Se fusionan | Leads activos |
|---|---|---|
| **Estados Unidos** | `Campana - EE UU` (132) + `Leads - EEUU` (2) | 134 |
| **Caribe** | `Campana - Caribe` (64) + `Leads - Caribe` (13) | 77 |
| **Otros** | `Leads - Otros` (44) | 44 · ver seccion 5 |
| **Instagram** | `Leads - Instagram` (24) — solo se renombra | 24 |
| **Brasil** | `Leads - Brasil` (11) + `Campana - Brasil` (0) | 11 |
| **Destino BestSeller** | queda como esta o se absorbe en `Otros` — **decision del cliente** | 3 |
| **Argentina** | `Leads - Argentina` (1) + `Campana - Argentina` (0) | 1 |
| **Cruceros** | `Campana - Cruceros` (0) — vacia, se renombra o se elimina | 0 |

### Resultado

| | Hoy | Despues |
|---|---|---|
| Rosario | 40 columnas (21 destino + 19 personales) | 28 (9 + 19) |
| Madero | 26 columnas (13 destino + 13 personales) | 21 (8 + 13) |
| **Total** | **66** | **49** |

---

## 5. Decision aparte: `OTROS` de Madero (1.588 leads)

Columna fantasma (no registrada en `manychat_list_order`) con **1.588 leads activos**, todos
con `source = 'Trello'`, y **sin un solo lead nuevo desde el 18/04/2026**. Es el volcado
historico de la migracion de Trello, no una lista en uso.

Fusionarla dentro de `Otros` dejaria una columna de 1.632 leads que nadie trabaja, y seria el
unico cambio del plan que empeora la lectura del tablero en vez de mejorarla.

**Recomendacion original: archivar el bloque completo** (`archived_at`), no fusionarlo.

**Lo que se hizo:** el cliente aprobo las fusiones pero no respondio esta pregunta, asi que
no se archivo nada. Ademas aparecio un problema que obligaba a actuar igual: el kanban agrupa
las columnas **case-insensitive** (`normColKey` en `components/sales/leads-kanban-manychat.tsx`,
lineas 720-732 y 766-780). Renombrar `Leads - Otros` a `Otros` habria hecho que `OTROS` y
`Otros` colapsaran en la misma columna, arrastrando los 1.588 leads sin que nadie lo decidiera.

Solucion aplicada: a esos leads se les asigno `list_name = 'Otros - Historico'`. Quedan como
columna propia y claramente etiquetada. **No se archivo ni se oculto nada**, y no se registro
en `manychat_list_order` a proposito: asi conserva la misma visibilidad que tenia (columna
adicional, visible solo para admins). La pregunta de archivarlos sigue abierta con el cliente.

---

## 6. Los dos riesgos tecnicos que hubo que resolver

### 6.1 Renombrar desde la UI no alcanzaba

`PUT /api/manychat/lists` (`app/api/manychat/lists/route.ts:200-226`) renombra la lista en
`manychat_list_order` y actualiza `leads.list_name`, pero **filtrando por `source = 'Manychat'`**.

Los leads con otro `source` (`Trello`, `Agente Blanco`, `Instagram`, `WhatsApp`, `Cliente`,
`Other`) **quedan con el nombre viejo y regeneran la columna que se quiso eliminar**. Casi
todas las listas de Lozada son mixtas: por ejemplo `Leads - Caribe` (Rosario) tenia leads de
seis sources distintos.

Por eso la unificacion se hizo con un script con service role
(`scripts/unify-lozada-crm-lists.ts`) que actualiza `leads.list_name` **sin ese filtro**.

**Este bug del endpoint sigue abierto.** No se toco en esta ronda: si un admin renombra una
lista desde la UI, el problema se reproduce.

### 6.2 La ingesta regeneraba las columnas viejas

Mas grave: `lib/manychat/sync.ts` tenia los nombres **hardcodeados** y no consultaba
`manychat_list_order`.

- `detectRegionList` (lineas 301-334) devolvia `"Leads - Caribe"`, `"Leads - Brasil"`, etc.
- `determineListName` (linea 360) devolvia `` `Campaña - ${bucket}` `` para leads de campaña.

Como ManyChat es la fuente principal de leads de Lozada, migrar solo los datos habria
recreado `Leads - Caribe`, `Campaña - Brasil` y compania **en cuestion de horas**. La
unificacion se habria deshecho sola.

Solucion: `lib/manychat/list-resolver.ts` traduce el nombre candidato al nombre real que la
agencia tiene configurado. Se aplica en los dos puntos de ingesta que usaban la funcion
heredada de Zapier:

- `lib/manychat/sync.ts` (ManyChat)
- `lib/integrations/eve/sync-handler.ts` (Eve)

Orden de resolucion: match exacto del candidato completo → match exacto del nucleo sin el
prefijo (`Campaña - Brasil` → `Brasil`) → alias de region (`EE UU` → `Estados Unidos`) →
si nada matchea, devuelve el candidato intacto.

Ese ultimo paso es lo que lo hace **retrocompatible con el resto de los tenants**: una agencia
que conserva `Leads - Caribe` matchea en el primer paso y recibe el mismo string de siempre.
Hay tests de no-regresion para eso en `lib/manychat/__tests__/list-resolver.test.ts`.

`app/api/leads/route.ts` y `components/sales/new-lead-dialog.tsx` ya resolvian contra las
listas reales del tenant, no hubo que tocarlos. Si se endurecio `resolveListNameForRegion`
(`lib/manychat/seed-lists.ts`) para que priorice el match **exacto** sobre el match por
contenido: con un `includes()`, una lista `Otros - Historico` se quedaba con los leads de
region OTROS solo por contener la palabra.

---

## 7. Observaciones registradas, fuera de esta ronda

1. **Listas personales duplicadas entre agencias con nombres distintos.** Maira Labadie tiene
   `MAIRA` en Madero (509) y `Mai Rosario` en Rosario (89); Florencia Gaytan tiene `Flor` (452)
   y `flor` (17); Gianella Ponce tiene `Giane ✨🌸` (504) y `Giane 🌸` (41). Como todos los
   vendedores pertenecen a las dos agencias, en la vista "Todas" aparecen separadas.
2. **`Mai S` (Rosario, 10 leads) tiene a Camila Vega como duena**, igual que la lista `Cami`.
   El nombre sugiere que deberia ser de Maira Sposito. Probable error de asignacion.
3. **Leads de vendedoras de Rosario cayendo en Madero**: `Leads - Emilia R.` (3),
   `Leads - Malena` (1) y `Leads - Ramiro` (1 archivado) existen como columnas fantasma en
   Madero. Indica leads entrando con la agencia equivocada.
4. **Listas de vendedores dados de baja siguen abiertas**: `Valen ✨🪄🧚🏼` (Valentina Zotti,
   inactiva, 129 leads, sin movimiento desde 05/06) y `Leads - Martina` (Martina Schiriatti,
   inactiva, 0 leads).
5. **Listas registradas sin ningun lead**: Rosario → `Caribe en Cuotas`, `Leads - Julieta`,
   `Leads - Martina`, `Leads - Naza`. Madero → `Campana - Brasil`, `Campana - Cruceros`,
   `Campana - Argentina`.
6. **Solucion de fondo**: migrar Lozada de `crm_mode = legacy` a `advanced`
   (`lead_funnels`, `supabase/migrations/20260508000001_advanced_crm_mode.sql`), que usa FK
   real (`leads.funnel_id`) en vez de un string. Elimina la clase de problema completa:
   renombrar deja de romper nada y no se pueden generar columnas fantasma.

---

## 8. Mensaje para el cliente

Formato WhatsApp, para Maxi / Santi. Copiar desde aca.

```
Hola! Revisamos los listados del CRM de Rosario y Madero y encontramos
bastante duplicacion: hoy entre las dos agencias hay 66 columnas y muchas
son el mismo destino escrito de dos formas distintas.

El caso mas claro: "Leads - Brasil" y "Campana - Brasil" son lo mismo, y
pasa igual con Caribe, EEUU, Argentina y Cruceros. Tambien quedaron
columnas viejas de la epoca de Trello (OTROS, CARIBE, CRUCEROS) y campanas
de temporadas que ya pasaron.

La propuesta es dejar un solo listado por destino, con nombre limpio:

ROSARIO - de 21 columnas de destino a 9
- Brasil <- Campana - Brasil + Leads - Brasil + Pre Venta Brasil Verano (216 leads)
- Estados Unidos <- Campana - EE UU + Leads - EEUU (294)
- Caribe <- Campana - Caribe + Leads - Caribe + Caribe Marzo/Junio + CARIBE + Caribe en Cuotas (205)
- Instagram <- Leads - Instagram (190)
- Otros <- Leads - Otros + OTROS (44)
- Cruceros <- Campana - Cruceros + CRUCEROS (37)
- Argentina <- Leads - Argentina + Campana - Argentina (17)
- Europa <- Leads - Europa + Campana EUROPA Septiembre/Octubre (4)
- Exoticos <- Leads - Exoticos + Campana EXOTICOS Machu Picchu (1)

MADERO - de 13 columnas de destino a 8
- Estados Unidos <- Campana - EE UU + Leads - EEUU (134)
- Caribe <- Campana - Caribe + Leads - Caribe (77)
- Otros <- Leads - Otros (44)
- Instagram <- Leads - Instagram (24)
- Brasil <- Leads - Brasil + Campana - Brasil (11)
- Argentina <- Leads - Argentina + Campana - Argentina (1)
- Cruceros <- Campana - Cruceros (hoy vacia)
- Destino BestSeller (3) - nos decis si la dejamos o la pasamos a Otros

No se pierde ningun lead: se mueven todos al listado unificado y se mantiene
el historial. Las listas personales de cada vendedora quedan igual que ahora,
no las tocamos en esta ronda.

Dos consultas antes de avanzar:

1) En Madero hay una columna "OTROS" con 1.588 leads que vinieron de Trello y
no recibe nada nuevo desde el 18 de abril. La archivamos? Los leads no se
borran, siguen estando y se pueden buscar, pero dejan de ocupar el tablero.

2) "Destino BestSeller" en Madero tiene 3 leads. La mantenemos o la pasamos
a Otros?

Con eso confirmado lo dejamos aplicado. Quedaria el tablero en 49 columnas
en total en vez de 66.
```

---

## 9. Ejecucion (2026-07-28)

### Codigo

| Archivo | Cambio |
|---|---|
| `lib/manychat/list-resolver.ts` | **Nuevo.** `normalizeListKey` + `resolveListNameForAgency` + `REGION_SYNONYMS` (movido aca como fuente unica). |
| `lib/manychat/seed-lists.ts` | `resolveListNameForRegion` ahora prioriza match exacto normalizado sobre match por contenido. |
| `lib/manychat/sync.ts` | La ingesta ManyChat resuelve el candidato contra las listas reales de la agencia. |
| `lib/integrations/eve/sync-handler.ts` | Idem para Eve. |
| `lib/manychat/__tests__/list-resolver.test.ts` | **Nuevo.** 13 tests, incluyendo no-regresion para tenants sin renombrar. |
| `__tests__/integrations/eve-sync-handler.test.ts` | El mock ahora modela la query a `manychat_list_order`. |
| `scripts/unify-lozada-crm-lists.ts` | **Nuevo.** Migracion de datos, dry-run por defecto. |

### Datos

`npx tsx scripts/unify-lozada-crm-lists.ts --apply` — **2.917 leads movidos**, 13 filas
duplicadas de `manychat_list_order` borradas, 43 listas renombradas y reposicionadas.

El script es idempotente (correrlo de nuevo reporta "nada que mover") y guarda un backup JSON
del estado previo antes de escribir.

Guardas que aborta antes de tocar nada: que los UUID de agencia correspondan a los nombres
esperados, que ninguna lista a fusionar tenga `seller_id` o `prompt` configurado (se perderia
sin aviso), y que los nombres finales no colisionen entre si.

### Resultado real

| | Antes | Despues |
|---|---|---|
| Rosario | 40 columnas | **28** (9 destino + 19 personales) |
| Madero | 26 columnas | **22** (8 destino + 13 personales + `Otros - Historico`) |
| **Total** | **66** | **50** |

Son 50 y no 49 porque `Otros - Historico` es una columna que antes no existia como tal: los
1.588 leads estaban en la columna derivada `OTROS`. El conteo de columnas no baja, pero deja
de ser una columna fantasma sin nombre claro.

Verificado que `Otros` (45 leads) y `Otros - Historico` (1.588) quedaron separadas.

### Lo que quedo pendiente

1. **Respuesta del cliente** sobre archivar los 1.588 leads historicos de Madero y sobre que
   hacer con `Destino BestSeller` (3 leads, sin tocar).
2. **El filtro `source = 'Manychat'` en `PUT /api/manychat/lists`** (seccion 6.1) sigue ahi.
3. **Las listas personales** (seccion 7) siguen duplicadas entre agencias.
4. `Campaña - Pre Venta Brasil Verano` y las demas campañas estacionales: si ManyChat vuelve a
   mandar ese `bucket`, se crea de nuevo la columna. El resolver solo unifica cuando el nucleo
   del nombre matchea una lista existente; un bucket nuevo genera su propia columna, que es el
   comportamiento correcto para una campaña nueva.

### Nota

No se publico novedad con `npm run announce`: el changelog es **global a todos los tenants** y
este cambio afecta unicamente el tablero de Lozada.
