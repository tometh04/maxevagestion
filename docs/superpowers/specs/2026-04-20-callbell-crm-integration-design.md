# Integración Callbell → CRM (diseño)

**Fecha**: 2026-04-20
**Estado**: Draft — brainstorming en curso. Decisiones tomadas marcadas abajo; preguntas abiertas al final.
**Cliente objetivo**: agencia "xx" (una primera agencia, pero diseño multi-tenant desde el día 1).

---

## Contexto

MAXEVA Gestión es un ERP/SaaS multi-tenant para agencias de viaje. El CRM actual recibe leads desde Trello (webhook en `/api/trello/webhook`) y desde formularios internos. Queremos ahora que Callbell (plataforma multicanal de WhatsApp) inyecte leads automáticamente cuando un cliente escribe por primera vez al WhatsApp de la agencia.

El sistema ya tiene:
- Tabla `leads` con `agency_id`, `source`, `status`, `region` (NOT NULL), `destination` (NOT NULL), `contact_name`, `contact_phone`, `contact_email`, `contact_instagram`, `assigned_seller_id`, `list_name`, `notes`, `quoted_price`, `archived_at`, etc.
- RLS por `org_id` en 42+ tablas, ya probado.
- Trello webhook como precedente de endpoint sin auth con validación por secret/firma.
- Tablas `wa_*` de `wha-control` (WhatsApp Business propio vía device/QR) — **no** se reutilizan: Callbell es un producto distinto y paralelo.

## Decisiones tomadas

### 1. Los leads van al CRM existente
Callbell inserta en la tabla `leads` ya existente. No se crea un módulo separado.

### 2. Multi-tenant desde el día 1
Cada agencia tiene su propia cuenta Callbell, su propio webhook secret y su propia URL de ingest. El diseño no hardcodea nada para una agencia en particular.

### 3. Evento que dispara lead = primer mensaje entrante
Escuchamos el evento de Callbell equivalente a "mensaje entrante de contacto nuevo". Mensajes subsiguientes **no** crean lead nuevo (pasan por la lógica de dedupe).

### 4. Dedupe state-dependent

**Estados reales del sistema** (confirmados en `supabase/migrations/001_initial_schema.sql:70`):
```
status IN ('NEW', 'IN_PROGRESS', 'QUOTED', 'WON', 'LOST')
```
Más el `archived_at IS NOT NULL` como soft-delete, y el `UNQUALIFIED` nuevo que agregaría esta feature.

**Mapa propuesto (PENDIENTE CONFIRMACIÓN CON EL CLIENTE)**:

| Estado del lead/cliente existente | Acción |
|---|---|
| `NEW` | Append a `notes` (interacción) |
| `UNQUALIFIED` | Append a `notes` |
| `IN_PROGRESS` | Append a `notes` |
| `QUOTED` | Append a `notes` |
| `WON` | Append a `notes` (¿o crear nuevo para segunda venta? — ver pregunta a cliente) |
| `LOST` | Crear lead nuevo (¿con umbral temporal? — ver pregunta a cliente) |
| `archived_at IS NOT NULL` | Crear lead nuevo (reactivación) |

**Decisiones a consultar con la agencia antes de cerrar**:
- **WON**: ¿el WhatsApp de un cliente que ya compró debe aparecer como interacción sobre la operación ganada, o crear lead nuevo para potencial segunda venta?
- **LOST reciente**: si alguien marcó LOST hace pocos días, ¿crear lead nuevo igual o hay un umbral (ej. LOST < 30 días → interacción; LOST ≥ 30 días → nuevo)?
- **Source**: ¿expandir el CHECK de `leads.source` para admitir `'Callbell'`, o reusar `'WhatsApp'` (ya admitido) y agregar columna `source_channel` para distinguir Callbell de otros canales WA?

### 5. Asignación de vendedor
**Default (MVP)**: cada agencia elige en su config un usuario que recibe todos los leads entrantes desde Callbell. El manager los reasigna a mano después.

**Opt-in futuro**: mapear el agente de Callbell ↔ user del ERP, para que el lead quede asignado a quien agarró el chat.

Opciones descartadas por ahora: round-robin, pool sin asignar, reglas por canal/línea.

### 6. Setup / configuración — manual por platform admin (MVP)
Para la primera agencia no hay UI self-service. Tomi (platform admin) genera el token único por org y le pasa la URL a la agencia, que la pega en su dashboard de Callbell. Cuando venga la segunda/tercera agencia se promueve a self-service en `/settings/integrations/callbell`.

Esto implica:
- Una tabla nueva (ej. `callbell_integrations`) con `org_id`, `webhook_token` (único, generado), `webhook_secret` (el que da Callbell para validar HMAC), `default_seller_id`, `is_active`, timestamps.
- Admin console en `/admin/integrations/callbell` para generar/listar/rotar tokens por org.

### 7. Status `UNQUALIFIED` para leads de Callbell
Los leads de Callbell entran con `status = 'UNQUALIFIED'` y defaults `region = 'OTROS'`, `destination = 'A definir'`. Aparecen en una vista/columna separada del Kanban ("Por calificar"). Cuando el vendedor completa región y destino, el lead pasa a `NEW`.

**Por qué no nullable**: mantiene la data model actual limpia (sin NULLs en campos antes obligatorios).
**Por qué no AI parsing**: fragil y caro para el MVP; se puede agregar encima después si hay volumen.

Requiere migración SQL:
- Expandir el check/enum de `leads.status` para admitir `UNQUALIFIED`.
- Ningún cambio en `region` / `destination` (siguen NOT NULL).

### 8. Texto del primer mensaje
Se guarda en `leads.notes` con formato tipo:

```
[2026-04-20 14:23 · WhatsApp/Callbell]
Hola, quería consultar por un viaje a Europa en octubre...
```

Para mensajes subsiguientes sobre el mismo lead (dedupe → interacción), se appendea al `notes` existente.

No se crea tabla `lead_interactions` por ahora (YAGNI — si piden historial estructurado, se agrega).

## Arquitectura (borrador)

### Endpoint de ingest
```
POST /api/callbell/webhook/{token}
```
- Sin auth de usuario (server-to-server). Mismo patrón que `/api/trello/webhook`.
- Validación en orden:
  1. Lookup de `callbell_integrations` por `webhook_token` → obtener `org_id` y `webhook_secret`. 404 si no existe o `is_active = false`.
  2. Validación HMAC del payload con `webhook_secret` (header que manda Callbell — verificar docs). 401 si falla.
  3. Parseo del evento. Si no es un tipo que nos interesa, responder 200 y salir.
  4. Idempotencia: guardar el `event_id` de Callbell para no procesar dos veces si Callbell retransmite.

### Lógica de procesamiento
1. Extraer phone + name + texto del primer mensaje + agent de Callbell si viene.
2. Dedupe: buscar en `leads` por `agency_id + contact_phone`. Si match → decidir según estado (ver tabla arriba) → update `notes` o crear nuevo.
3. Si crear nuevo:
   - `agency_id` = la que matchea con `org_id` del token.
   - `source = 'Callbell'`.
   - `status = 'UNQUALIFIED'`.
   - `region = 'OTROS'`, `destination = 'A definir'`.
   - `contact_name`, `contact_phone` desde el evento; email/instagram si vienen.
   - `assigned_seller_id` = `default_seller_id` de la config de la org.
   - `list_name = 'Leads - Por calificar'` (o la que aplique con UNQUALIFIED).
   - `notes` = timestamp + texto del mensaje.
4. Responder 200 rápido. Si hay que hacer laburo pesado, mover a background con `waitUntil` (Fluid Compute).

### Archivos a tocar (estimado)
- `supabase/migrations/<fecha>_callbell_integration.sql` — tabla `callbell_integrations` + expandir enum `leads.status`.
- `app/api/callbell/webhook/[token]/route.ts` — endpoint de ingest.
- `lib/callbell/verify-hmac.ts` — validación de firma.
- `lib/callbell/process-event.ts` — dedupe + create/update lead.
- `lib/callbell/types.ts` — tipos del payload Callbell.
- `app/(dashboard)/admin/integrations/callbell/page.tsx` — admin UI (generar tokens por org, ver logs).
- `app/api/admin/callbell-integrations/route.ts` — CRUD de configs.
- `components/sales/kanban` — agregar columna/vista UNQUALIFIED.
- `__tests__/callbell/` — tests de dedupe, HMAC, idempotencia.

### Testing
- Unit: HMAC verification, dedupe logic (todos los casos de estado), mapping.
- Integration: webhook end-to-end con payload real de Callbell (usar fixture).
- Isolation: que un webhook de org A no pueda crear leads en org B (extender `__tests__/isolation/`).

## Preguntas abiertas

### Para consultar con la agencia cliente
1. **Dedupe sobre WON**: ¿interacción o lead nuevo para potencial segunda venta?
2. **Dedupe sobre LOST reciente**: ¿umbral temporal? (ej. LOST < 30 días → interacción; ≥ 30 días → nuevo).
3. **Source**: expandir CHECK con `'Callbell'` vs. reusar `'WhatsApp'` + columna `source_channel`.
4. **Outbound**: ¿hace falta mandar mensajes desde el ERP hacia Callbell? (asumido **no** para MVP).
5. **Campos opcionales a mapear**: si Callbell trae tags/labels del contacto, ¿querés que mapeen a algo en el CRM?

### A verificar contra docs oficiales de Callbell (https://dev.callbell.eu/) al implementar
6. Nombre exacto del evento de "primer mensaje entrante" y shape del payload.
7. `event_id` único por evento (para idempotencia) — confirmar que existe.
8. Header y algoritmo de firma HMAC para validar webhooks.
9. Límites/retries que aplica Callbell del lado de ellos (para dimensionar rate limiting).

### Decisiones técnicas para la fase de plan
10. **Rate limiting** en el endpoint de ingest — default sugerido: 60 req/min por token, cap defensivo.
11. **Runtime del endpoint**: Node.js sobre Fluid Compute (no Edge). Permite libs de validación HMAC sin restricciones y Supabase client full.

## Fuera de scope (explícito)

- Outbound messaging (ERP → Callbell).
- UI self-service de onboarding para la agencia (viene en v2 cuando haya segunda/tercera agencia).
- AI parsing del mensaje para pre-llenar destino (v2 si hay volumen).
- Mapeo agente Callbell ↔ vendedor ERP (v2).
- Tabla `lead_interactions` estructurada (YAGNI, por ahora todo va a `notes`).
- Integración con `wa_*` (wha-control) — son productos distintos.
