# Estado Actual de la Integración de Trello - FUNCIONANDO PERFECTAMENTE

**⚠️ IMPORTANTE: Esta integración está funcionando perfectamente. NO MODIFICAR sin revisar esta documentación primero.**

**Fecha de última verificación:** 2024-12-XX  
**Estado:** ✅ FUNCIONANDO PERFECTAMENTE

---

## 📋 Resumen Ejecutivo

La integración de Trello está completamente funcional y sincroniza en tiempo real:
- ✅ Sincronización manual completa
- ✅ Sincronización rápida (< 10 segundos)
- ✅ Webhooks en tiempo real (ambas agencias)
- ✅ Visualización de leads en Kanban y Tabla
- ✅ Limpieza automática de leads huérfanos

---

## 🏗️ Arquitectura

### 1. Componentes Principales

#### Backend - APIs
- **`/api/trello/webhook`**: Recibe eventos de Trello en tiempo real
- **`/api/trello/sync`**: Sincronización completa (hasta 5 minutos)
- **`/api/trello/sync-quick`**: Sincronización rápida (< 10 segundos)
- **`/api/trello/sync-card`**: Sincronizar una tarjeta específica
- **`/api/leads`**: Obtener leads con filtros

#### Librerías Core
- **`lib/trello/sync.ts`**: Funciones principales de sincronización
  - `fetchTrelloCard()`: Obtiene toda la información de una tarjeta
  - `syncTrelloCardToLead()`: Sincroniza tarjeta → lead
  - `deleteLeadByExternalId()`: Elimina lead cuando se archiva tarjeta

#### Frontend
- **`components/sales/leads-page-client.tsx`**: Componente principal de leads
- **`components/sales/leads-kanban-trello.tsx`**: Kanban con listas de Trello
- **`components/settings/trello-settings.tsx`**: Configuración y sincronización manual

---

## 🔧 Configuración Actual

### Webhooks Registrados

#### Madero
- **Webhook ID**: `6938668af03ae945ea9b5d81`
- **Board ID**: `X4IFL8rx` (corto) / `680ce7e434b85f29813d4e6f` (completo)
- **URL**: `https://www.maxevagestion.com/api/trello/webhook`
- **Estado**: ✅ ACTIVO

#### Rosario
- **Webhook ID**: `693f09db3309a87b41f086fa`
- **Board ID**: `kZh4zJ0J` (corto) / `680965f3edccf6f26eda61ef` (completo)
- **URL**: `https://www.maxevagestion.com/api/trello/webhook`
- **Estado**: ✅ ACTIVO

### Credenciales Trello
- **API Key**: Configurada en `settings_trello.trello_api_key`
- **Token**: Configurado en `settings_trello.trello_token`
- **Nota**: Las credenciales se almacenan en la base de datos, no en código

---

## 📊 Flujo de Sincronización

### Sincronización en Tiempo Real (Webhooks)

1. **Evento en Trello** → Webhook enviado a `/api/trello/webhook`
2. **Extracción de datos**: `cardId`, `boardId` del payload
3. **Identificación de agencia**: Busca `settings_trello` por `board_id`
4. **Procesamiento**:
   - **Card archivada** → Elimina lead
   - **Card creada/actualizada** → Sincroniza tarjeta completa
   - **Lista archivada** → Elimina leads de esa lista
   - **Lista creada** → Actualiza mapeos

### Sincronización Manual Completa (`/api/trello/sync`)

1. Obtiene todas las tarjetas **activas** (`cards/open`)
2. Obtiene todas las listas **activas** (`lists?filter=open`)
3. Para cada tarjeta:
   - Obtiene información completa con `fetchTrelloCard()`
   - Sincroniza con `syncTrelloCardToLead()`
4. **Limpieza de huérfanos**:
   - Elimina leads cuyo `external_id` no existe en Trello
   - Elimina leads cuyo `trello_list_id` no existe en Trello
   - **CRÍTICO**: Filtra por `agency_id` para evitar cross-agency deletion

### Sincronización Rápida (`/api/trello/sync-quick`)

1. Obtiene tarjetas modificadas en últimos **10 minutos**
2. Limita a **50 tarjetas máximo**
3. Procesa en paralelo (5 concurrentes)
4. Timeout de **8 segundos**
5. Retorna resultados parciales si se alcanza el timeout

---

## 🗄️ Estructura de Datos

### Tabla `leads`

Campos críticos para Trello:
- `external_id`: ID de la tarjeta de Trello (único por agencia)
- `trello_list_id`: ID de la lista actual en Trello (**CRÍTICO**)
- `trello_full_data`: JSONB con toda la información de Trello
- `trello_url`: URL de la tarjeta
- `source`: "Trello"
- `agency_id`: ID de la agencia (Rosario o Madero)

### Tabla `settings_trello`

- `agency_id`: ID de la agencia
- `trello_api_key`: API Key de Trello
- `trello_token`: Token de Trello
- `board_id`: Board ID (corto, ej: `kZh4zJ0J`)
- `webhook_id`: ID del webhook registrado
- `webhook_url`: URL del webhook
- `list_status_mapping`: Mapeo de listas → status
- `list_region_mapping`: Mapeo de listas → region

---

## 🔄 Eventos de Webhook Procesados

### Card Events
- `createCard`: Crea nuevo lead
- `updateCard`: Actualiza lead existente
- `updateCard:closed`: Archiva tarjeta → Elimina lead
- `moveCardFromList`: Actualiza `trello_list_id`
- `moveCardToList`: Actualiza `trello_list_id`
- `deleteCard`: Elimina lead

### List Events
- `createList`: Actualiza `list_status_mapping` y `list_region_mapping`
- `updateList`: Actualiza mapeos
- `updateList:closed`: Archiva lista → Elimina leads de esa lista
- `updateList:name`: Actualiza mapeos

---

## ⚙️ Funciones Clave

### `fetchTrelloCard(cardId, apiKey, token)`

Obtiene **TODA** la información de una tarjeta:
- Descripción completa
- Attachments (fotos)
- Comments (actions)
- Members (responsables)
- Checklists
- Custom fields
- Due dates
- Lista actual

**Retry logic**: 3 intentos con exponential backoff

### `syncTrelloCardToLead(card, settings, supabase)`

Sincroniza una tarjeta completa a un lead:
1. Extrae información de la tarjeta
2. Mapea miembros de Trello a vendedores
3. Determina status y region desde mapeos
4. Guarda todo en `trello_full_data` (JSONB)
5. Crea o actualiza el lead

**CRÍTICO**: Verifica que `card.idList` exista antes de sincronizar

### `deleteLeadByExternalId(externalId, supabase)`

Elimina un lead cuando se archiva/elimina la tarjeta en Trello:
- Busca por `external_id`
- **CRÍTICO**: Filtra por `agency_id` para evitar cross-agency deletion

---

## 🚨 Reglas Críticas

### 1. Solo Tarjetas Activas
- **NUNCA** sincronizar tarjetas archivadas (`closed: true`)
- Usar `cards/open` en lugar de `cards/all`
- Usar `lists?filter=open` en lugar de `lists/all`

### 2. Filtrado por Agencia
- **SIEMPRE** filtrar por `agency_id` en queries de eliminación
- Evitar cross-agency data corruption
- Cada webhook debe identificar correctamente su agencia

### 3. Validación de `idList`
- **SIEMPRE** verificar que `card.idList` exista antes de sincronizar
- Si no existe, saltar la tarjeta y loggear error

### 4. Limpieza de Huérfanos
- Eliminar leads cuyo `external_id` no existe en Trello
- Eliminar leads cuyo `trello_list_id` no existe en Trello
- **SIEMPRE** filtrar por `agency_id` en limpieza

### 5. Timeouts y Rate Limiting
- Timeout de 30s para llamadas a Trello API
- Rate limiting en webhook: 100 requests/minuto por IP
- Retry logic con exponential backoff

---

## 📁 Archivos Críticos

### Backend
- `app/api/trello/webhook/route.ts` - Webhook handler
- `app/api/trello/sync/route.ts` - Sincronización completa
- `app/api/trello/sync-quick/route.ts` - Sincronización rápida
- `lib/trello/sync.ts` - Funciones core de sincronización
- `lib/trello/constants.ts` - Constantes y regex

### Frontend
- `components/sales/leads-page-client.tsx` - Componente principal
- `components/sales/leads-kanban-trello.tsx` - Kanban con listas Trello
- `components/settings/trello-settings.tsx` - Configuración

### Scripts de Utilidad
- `scripts/verify-trello-webhooks-status.ts` - Verificar webhooks
- `scripts/update-webhook-in-db.ts` - Actualizar webhooks en BD
- `scripts/register-webhook-rosario.ts` - Registrar webhook Rosario
- `scripts/sync-both-agencies-complete.ts` - Sincronizar ambas agencias

---

## ✅ Checklist de Funcionamiento

Para verificar que todo funciona correctamente:

- [ ] Webhooks registrados y activos (ambas agencias)
- [ ] Webhooks guardados en BD (`settings_trello.webhook_id`)
- [ ] Sincronización manual completa funciona
- [ ] Sincronización rápida funciona (< 10 segundos)
- [ ] Webhooks en tiempo real funcionan (crear tarjeta → aparece lead)
- [ ] Mover tarjeta entre listas → actualiza `trello_list_id`
- [ ] Archivar tarjeta → elimina lead
- [ ] Archivar lista → elimina leads de esa lista
- [ ] Limpieza de huérfanos funciona correctamente
- [ ] No hay cross-agency data corruption

---

## 🔍 Debugging

### Logs de Webhook
- Vercel → Functions → `/api/trello/webhook`
- Buscar logs con prefijo `📥 ========== TRELLO WEBHOOK RECEIVED ==========`

### Verificar Webhooks
```bash
npx tsx scripts/verify-trello-webhooks-status.ts
```

### Sincronización Manual
```bash
npx tsx scripts/sync-both-agencies-complete.ts
```

---

## ⚠️ ADVERTENCIAS

1. **NO MODIFICAR** la lógica de webhook sin probar exhaustivamente
2. **NO ELIMINAR** el filtrado por `agency_id` en queries de eliminación
3. **NO CAMBIAR** de `cards/open` a `cards/all` (solo tarjetas activas)
4. **NO MODIFICAR** la validación de `idList` (crítica para integridad)
5. **NO ELIMINAR** el retry logic con exponential backoff

---

## 📝 Notas de Implementación

- Los webhooks pueden tardar 1-2 segundos en procesarse
- La sincronización completa puede tardar hasta 5 minutos (timeout configurado)
- La sincronización rápida tiene timeout de 8 segundos
- Máximo 2000 leads por agencia (según especificación)
- Rate limiting: 100 requests/minuto por IP en webhook

---

**Última actualización**: 2024-12-XX  
**Mantenido por**: Sistema de documentación automática

