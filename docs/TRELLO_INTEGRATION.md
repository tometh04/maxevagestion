# Integración de Trello - Documentación Completa

## Estado Actual (Funcionando Correctamente)

Esta documentación describe cómo funciona la integración de Trello **tal como está ahora**, que funciona perfectamente. **NO MODIFICAR** sin revisar esta documentación primero.

## Arquitectura General

### 1. Sincronización de Tarjetas

#### Scripts de Sincronización
- **`scripts/sync-both-agencies-complete.ts`**: Sincroniza ambas agencias (Rosario y Madero)
- **`scripts/sync-rosario-complete.ts`**: Sincroniza solo Rosario
- **`scripts/sync-madero-complete.ts`**: Sincroniza solo Madero

#### Proceso de Sincronización
1. Obtiene todas las tarjetas activas del board usando `/boards/{id}/cards/open`
2. Para cada tarjeta, llama a `fetchTrelloCard()` que trae **TODA** la información:
   - Descripción completa
   - Fotos/attachments (en tiempo real)
   - Comentarios (actions)
   - Responsable asignado (members)
   - Checklists
   - Labels
   - Custom fields
   - Due dates
   - Lista actual (trello_list_id)
3. Guarda todo en `trello_full_data` (JSONB) y sincroniza con `syncTrelloCardToLead()`

#### Límites
- **Máximo 2000 leads por agencia** (según especificación del usuario)
- Límite en API: 2000 leads por request
- Límite inicial en página: 2000 leads

### 2. Webhooks en Tiempo Real

#### Endpoint
- **`/api/trello/webhook`**: Recibe eventos de Trello en tiempo real

#### Eventos Procesados
- **Creación/Actualización**: `createCard`, `updateCard`, `moveCardToList`, etc.
- **Eliminación**: `deleteCard` (mejorado para extraer cardId de múltiples ubicaciones)

#### Flujo del Webhook
1. Recibe el evento de Trello
2. Extrae `cardId` y `boardId` del payload
3. Identifica la agencia correspondiente al board
4. Para `deleteCard`: elimina el lead usando `deleteLeadByExternalId()`
5. Para otros eventos: sincroniza la tarjeta completa

### 3. Frontend - Visualización de Leads

#### Página Principal
- **`app/(dashboard)/sales/leads/page.tsx`**: Carga inicial de leads
  - Límite inicial: **2000 leads**
  - Orden: `updated_at DESC` (más recientes primero)

#### API de Leads
- **`app/api/leads/route.ts`**: Endpoint para obtener leads
  - Límite máximo: **2000 leads**
  - Orden: `updated_at DESC`
  - Filtros: `agencyId`, `trelloListId`, `status`, `sellerId`

#### Componente Cliente
- **`components/sales/leads-page-client.tsx`**: Componente principal
  - Carga automática al seleccionar agencia
  - Límite: **2000 leads** por request
  - Usa Kanban de Trello si hay leads con `trello_list_id`

### 4. Estructura de Datos

#### Tabla `leads`
- `external_id`: ID de la tarjeta de Trello
- `trello_list_id`: ID de la lista actual en Trello (CRÍTICO)
- `trello_full_data`: JSONB con toda la información de Trello
- `source`: "Trello"
- `agency_id`: ID de la agencia (Rosario o Madero)

#### Campo `trello_full_data` (JSONB)
Contiene:
```json
{
  "id": "card_id",
  "name": "nombre de la tarjeta",
  "desc": "descripción completa",
  "url": "url de Trello",
  "idList": "lista actual",
  "labels": [...],
  "members": [...],
  "attachments": [...], // Fotos en tiempo real
  "checklists": [...],
  "actions": [...], // Comentarios
  "customFieldsData": {...},
  "badges": {...},
  "syncedAt": "timestamp"
}
```

### 5. Funciones Clave

#### `lib/trello/sync.ts`

**`fetchTrelloCard(cardId, apiKey, token)`**
- Obtiene TODA la información de una tarjeta
- Incluye retry logic con exponential backoff
- Trae: attachments, checklists, members, actions, custom fields, etc.

**`syncTrelloCardToLead(card, settings, supabase)`**
- Sincroniza una tarjeta completa a un lead
- Mapea miembros de Trello a vendedores
- Guarda toda la información en `trello_full_data`
- Actualiza o crea el lead según corresponda

**`deleteLeadByExternalId(externalId, supabase)`**
- Elimina un lead cuando se elimina la tarjeta en Trello
- Busca por `external_id`

### 6. Configuración

#### Tabla `settings_trello`
- `agency_id`: ID de la agencia
- `trello_api_key`: API Key de Trello
- `trello_token`: Token de Trello
- `board_id`: ID del board de Trello
- `list_status_mapping`: Mapeo de listas a estados
- `list_region_mapping`: Mapeo de listas a regiones
- `webhook_id`: ID del webhook configurado
- `webhook_url`: URL del webhook

### 7. Mapeos Automáticos

#### Status Mapping
- Listas con "nuevo", "pendiente", "to do" → `NEW`
- Listas con "en proceso", "proceso", "working" → `IN_PROGRESS`
- Listas con "cotizado", "quote" → `QUOTED`
- Listas con "ganado", "won" → `WON`
- Listas con "perdido", "lost" → `LOST`

#### Region Mapping
- Listas con "caribe" → `CARIBE`
- Listas con "brasil" → `BRASIL`
- Listas con "argentina" → `ARGENTINA`
- Listas con "europa" → `EUROPA`
- Listas con "eeuu", "usa" → `EEUU`
- Listas con "crucero" → `CRUCEROS`
- Por defecto → `OTROS`

### 8. Mejoras Recientes (Funcionando)

#### Eliminación de Tarjetas
- Mejorada la extracción de `cardId` para `deleteCard`
- Busca en múltiples ubicaciones del payload:
  - `action.data.card.id`
  - `action.data.cardId`
  - `action.data.old.id`
  - `model.id`

#### Carga de Leads en Frontend
- Límite aumentado a 2000 leads
- Orden por `updated_at` para mostrar más recientes primero
- Carga automática al seleccionar agencia

#### Sincronización
- Mejor manejo de rate limits
- Delays apropiados entre requests
- Retry logic con exponential backoff

## Comandos Útiles

### Sincronizar Ambas Agencias
```bash
npx tsx scripts/sync-both-agencies-complete.ts
```

### Sincronizar Solo Rosario
```bash
npx tsx scripts/sync-rosario-complete.ts
```

### Sincronizar Solo Madero
```bash
npx tsx scripts/sync-madero-complete.ts
```

## Notas Importantes

1. **NO modificar** los límites sin consultar (2000 leads por agencia)
2. **NO cambiar** el orden sin revisar impacto (`updated_at DESC`)
3. **NO modificar** la estructura de `trello_full_data` sin migración
4. **Siempre** probar cambios en desarrollo antes de producción
5. Los webhooks deben estar configurados correctamente en Trello
6. Las credenciales deben estar en `settings_trello` (no en variables de entorno)

## Troubleshooting

### Los leads no se muestran
- Verificar que el límite sea 2000
- Verificar que el orden sea `updated_at DESC`
- Verificar que se carguen al seleccionar agencia

### Las tarjetas no se eliminan
- Verificar logs del webhook
- Verificar que el webhook esté recibiendo `deleteCard`
- Verificar que el `cardId` se extraiga correctamente

### La sincronización falla
- Verificar rate limits de Trello
- Verificar credenciales en `settings_trello`
- Verificar que el board_id sea correcto

## Estado: ✅ FUNCIONANDO PERFECTAMENTE

Última actualización: Después de fix de eliminación de tarjetas y carga de leads en frontend.

