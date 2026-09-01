# Conectar un cliente nuevo de Agente Blanco

Procedimiento estandar para dar de alta un tenant en el webhook por token.
**Es el camino por defecto desde 2026-08-28.** El endpoint legacy
(`/api/webhooks/manychat` con `X-API-Key` global) queda solo para los tenants
que todavia no migraron; no conectar clientes nuevos por ahi.

Clientes ya migrados: Kyo Viajes (Kayzen Sas) y Lozada Rosario.

## Por que el token y no la API key

La API key del endpoint legacy es **global y compartida entre todos los
tenants**. La org se deducia del campo `agency` del body con un `ILIKE` sobre el
nombre y, si no matcheaba, caia a un fallback global: un typo en el payload de
un cliente escribia el lead en el tablero de otro. Paso de verdad (lead
`8f5ace24`, 2026-08-21, `agency="kyo-viajes"` → tablero de Lozada).

Con el token la org sale de `org_integrations.webhook_token`, que es
autoritativa, y `agency` solo elige entre las agencias de **esa** org.

## Pasos

### 1. Generar credenciales

No bajar `WEBHOOK_SECRET_ENCRYPTION_KEY` a un archivo local: inyectarla con el
CLI de Railway, asi vive solo en el proceso.

```bash
railway link --project "Vibook - Sistema de Gestion" --environment production
railway run --service "Vibook - Sistema de Gestion" --environment production \
  npx tsx scripts/provision-manychat-integration.ts <org_id>
```

El script no escribe en la base: imprime el token, el secreto en claro y el SQL
para revisar. Corrido de nuevo sobre una org que ya tiene integracion, emite el
`UPDATE` de rotacion en vez del `INSERT`.

### 2. Verificar que el secreto cifrado se pueda descifrar

Si se cifra con una clave distinta a la de produccion, el endpoint devuelve
**500 en cada request** y el integrador no tiene forma de destrabarlo. Descifrar
el blob con la clave de prod y comprobar que da el secreto en claro **antes** de
insertar.

### 3. Aplicar los dos INSERT

Son dos y van juntos:

1. `org_integrations` — crea la integracion.
2. `webhook_event_log` — pre-carga el smoke test.

**Sin el segundo, el boton "Probar conexion" del integrador crea un lead real en
el tablero del cliente.** La unicidad es `(org_id, integration, event_id)`, asi
que cada cliente necesita su propia fila. El `event_id` que manda Agente Blanco
es constante para todos: `agenteblanco-smoke-test`.

### 4. Smoke test

Firmar el body crudo y verificar los tres casos:

| Caso | Esperado |
| --- | --- |
| Firma correcta | `200 {"status":"duplicate"}` sin crear lead |
| Firma incorrecta | `401 {"error":"Invalid signature"}` |
| Token inexistente | `404 {"error":"Not found"}` |

Conviene ademas firmar con el secreto de un cliente contra el token de otro:
tiene que dar `401`. Confirma que los tenants no se cruzan.

Despues verificar que no se creo ningun lead y que `webhook_event_log` de esa
org sigue teniendo solo la fila pre-cargada.

### 5. Entregar y migrar

Pasar al integrador la URL (token en el path) y el secreto (campo separado, **no
es el token**). El switch no necesita ventana: los dos endpoints conviven, y un
lead que empieza por uno y termina por el otro se deduplica bien porque ambos
caminos resuelven a la misma agencia y el mismo `source`.

Secuencia recomendada del lado del integrador: crear la conexion nueva pausada,
probar, activar la nueva, recien despues pausar la vieja.

## Contrato del endpoint

- **URL**: `POST /api/integrations/manychat/{token}/webhook`
- **Firma**: `x-vibook-signature` = `HMAC-SHA256(body crudo, secret)` en hex
  **pelado**, sin prefijo `sha256=`. Solo el body: sin metodo, path ni timestamp.
- **`event_id`**: unico por envio logico, estable entre reintentos de ese envio.
  El primer y el segundo POST del mismo lead necesitan `event_id` **distintos**,
  si no el segundo se descarta como duplicado.
- **Payload**: identico al del endpoint legacy.
- **Respuestas**: `201` creado, `200` actualizado, `401` firma invalida,
  `404` token desconocido o inactivo.

## Detalles que suelen morder

- **El body sigue mandando `agency`.** La org sale del token, pero la agencia
  dentro de la org sigue saliendo del body. Un tenant multi-agencia (Lozada:
  Rosario y Madero) tiene que seguir mandandolo o todo cae en la mas antigua.
- **La API key legacy es global.** No se puede dar de baja hasta que **todos**
  los tenants esten migrados.
- **El update no toca `list_name` ni `assigned_seller_id`.** Un lead que ya
  existia y recibe un POST con `bucket` y `vendedor_email` no se mueve de columna
  ni se asigna. Es deliberado: no deshacer trabajo de un asesor. Consecuencia
  practica: al migrar, los leads viejos no se backfillean solos.
- **El endpoint por token no valida** que venga `ig`, `name` o `whatsapp`, cosa
  que el legacy si hace. Un payload sin ninguno de los tres crea un lead
  "Sin nombre" en vez de devolver 400.

## Referencias

- `scripts/provision-manychat-integration.ts`
- `app/api/integrations/manychat/[token]/webhook/route.ts`
- `lib/manychat/sync.ts` (`determineAgencyId`, `resolveSellerIdByEmail`)
- `lib/integrations/hmac.ts`, `lib/integrations/secrets.ts`
- `.claude/rules/integrations-webhooks.md`
