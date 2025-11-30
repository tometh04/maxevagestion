# Sistema Multi-Agencia con Trello

## Resumen

El sistema ERP Lozada soporta múltiples agencias, cada una con su propio board de Trello. Los leads se sincronizan en tiempo real desde Trello usando webhooks, y cada agencia puede tener su propia configuración independiente.

## Arquitectura

### Configuración por Agencia

Cada agencia tiene su propia configuración de Trello en la tabla `settings_trello`:

- **`agency_id`**: ID único de la agencia
- **`board_id`**: ID del board de Trello (ej: `X4IFL8rx` para Madero, `kZh4zJ0J` para Rosario)
- **`trello_api_key`**: API Key de Trello (compartida entre agencias)
- **`trello_token`**: Token de Trello (compartido entre agencias)
- **`list_status_mapping`**: Mapeo de listas de Trello a estados del sistema
- **`list_region_mapping`**: Mapeo de listas de Trello a regiones del sistema
- **`webhook_id`**: ID del webhook registrado en Trello
- **`webhook_url`**: URL del webhook

### Sincronización en Tiempo Real

El sistema usa webhooks de Trello para recibir actualizaciones en tiempo real:

1. **Registro de Webhooks**: Cada agencia tiene su propio webhook registrado en Trello
2. **Endpoint único**: Todos los webhooks apuntan a `/api/trello/webhook`
3. **Identificación por Board**: El sistema identifica qué agencia corresponde según el `board_id` del webhook recibido
4. **Sincronización automática**: Cuando hay cambios en Trello, el webhook actualiza los leads en la base de datos

## Componentes Principales

### 1. Selector de Agencias en Leads

Ubicación: `components/sales/leads-page-client.tsx`

- Permite seleccionar una agencia específica o "Todas las agencias"
- Cuando se selecciona una agencia, se cargan solo los leads de esa agencia
- El kanban de Trello muestra las listas del board correspondiente a la agencia seleccionada

### 2. API de Leads

Ubicación: `app/api/leads/route.ts`

- Soporta filtrado por `agencyId` mediante query parameter
- Respeta los permisos del usuario según su rol
- Si el usuario es SELLER, solo ve leads asignados a él de sus agencias

### 3. API de Trello Lists

Ubicación: `app/api/trello/lists/route.ts`

- Obtiene las listas del board de Trello de una agencia específica
- Usa el `agencyId` para encontrar la configuración correcta
- Devuelve las listas en el orden exacto que están en Trello

### 4. Webhook Handler

Ubicación: `app/api/trello/webhook/route.ts`

- Recibe webhooks de Trello para cualquier board
- Identifica la agencia correspondiente buscando el `board_id` en todas las configuraciones
- Procesa diferentes tipos de acciones:
  - `createCard`: Crea un nuevo lead
  - `updateCard`: Actualiza un lead existente
  - `deleteCard`: Marca un lead como eliminado
  - `moveCardFromListToList`: Actualiza el estado según el mapeo de listas

### 5. Registro de Webhooks

Ubicación: `app/api/trello/webhooks/register/route.ts`

- Registra un webhook en Trello para una agencia específica
- Guarda el `webhook_id` y `webhook_url` en la configuración
- Cada agencia debe tener su propio webhook registrado

## Configuración de una Nueva Agencia

### Paso 1: Configurar Trello Settings

Usar el script existente o la UI de Settings:

```bash
# Script para configurar Madero
cd scripts
npx tsx setup-trello-madero.ts
```

O desde la UI:
1. Ir a **Settings > Trello**
2. Seleccionar la agencia
3. Ingresar:
   - API Key de Trello
   - Token de Trello
   - Board ID de Trello
4. El sistema automáticamente obtiene las listas y crea un mapeo inicial

### Paso 2: Ajustar Mapeos

1. Revisar el mapeo de estados (`list_status_mapping`)
   - Cada lista de Trello debe mapearse a un estado: `NEW`, `IN_PROGRESS`, `QUOTED`, `WON`, `LOST`
   
2. Revisar el mapeo de regiones (`list_region_mapping`) (opcional)
   - Si las listas están organizadas por región, mapearlas correctamente

### Paso 3: Registrar Webhook

1. Ir a **Settings > Trello**
2. Hacer clic en **"Registrar Webhook"**
3. El sistema registra el webhook en Trello para esa agencia específica

### Paso 4: Sincronizar Leads Existentes

1. Ir a **Settings > Trello**
2. Hacer clic en **"Sincronizar Ahora"**
3. El sistema sincroniza todos los cards existentes en el board

## Uso Diario

### Ver Leads de una Agencia

1. Ir a **Leads**
2. Seleccionar la agencia en el selector (arriba a la derecha)
3. Los leads se filtran automáticamente
4. El kanban muestra las listas del board de Trello de esa agencia

### Crear un Nuevo Lead

1. Hacer clic en **"Nuevo Lead"**
2. Seleccionar la agencia (o se usa la agencia seleccionada en el filtro)
3. Completar los datos y guardar

### Sincronización Automática

Los cambios en Trello se reflejan automáticamente:
- Crear un card en Trello → Se crea un lead en el sistema
- Mover un card entre listas → Se actualiza el estado del lead
- Editar un card → Se actualizan los datos del lead
- Eliminar un card → Se marca el lead como eliminado

## Estructura de Datos

### Lead

Cada lead tiene un `agency_id` que lo vincula a una agencia:

```typescript
{
  id: string
  agency_id: string
  trello_url: string | null
  trello_list_id: string | null  // ID de la lista de Trello donde está el card
  source: string  // Puede ser "Trello" o el source original
  // ... otros campos
}
```

### Settings Trello

Cada agencia tiene su configuración:

```typescript
{
  id: string
  agency_id: string
  board_id: string  // ID único del board
  trello_api_key: string
  trello_token: string
  list_status_mapping: Record<string, string>  // { "lista_id": "NEW" }
  list_region_mapping: Record<string, string>  // { "lista_id": "ARGENTINA" }
  webhook_id: string | null
  webhook_url: string | null
}
```

## Flujo de Sincronización

1. **Usuario hace cambio en Trello** (ej: mueve un card)
2. **Trello envía webhook** a `/api/trello/webhook`
3. **Sistema identifica la agencia** buscando el `board_id` en `settings_trello`
4. **Sistema procesa la acción** usando el mapeo de la agencia
5. **Sistema actualiza el lead** en la base de datos
6. **Usuario ve el cambio** en tiempo real en la UI

## Configuración de Madero

La agencia Madero está configurada con:

- **Board ID**: `X4IFL8rx`
- **API Key y Token**: Mismos que Rosario (compartidos)

Para configurar Madero, ejecutar:

```bash
cd scripts
npx tsx setup-trello-madero.ts
```

Este script:
1. Busca la agencia "Madero" en la base de datos
2. Obtiene las listas del board `X4IFL8rx`
3. Crea mapeos automáticos basados en los nombres de las listas
4. Guarda la configuración en `settings_trello`

Después de ejecutar el script:
1. Revisar y ajustar los mapeos en Settings > Trello
2. Registrar el webhook para Madero
3. Sincronizar los leads existentes

## Notas Importantes

- ✅ **Cada agencia tiene su propio board** pero puede compartir credenciales
- ✅ **Los webhooks funcionan independientemente** para cada board
- ✅ **El selector de agencias** permite ver leads de una agencia específica
- ✅ **La sincronización es en tiempo real** mediante webhooks
- ✅ **Los mapeos son configurables** por agencia en Settings

## Troubleshooting

### Los webhooks no funcionan

1. Verificar que el webhook esté registrado: Settings > Trello > Ver Webhooks
2. Verificar que el `webhook_url` sea accesible desde internet
3. Verificar los logs del servidor para ver si llegan los webhooks

### Los leads no se sincronizan

1. Verificar que la configuración de Trello esté correcta para esa agencia
2. Verificar que el `board_id` sea correcto
3. Ejecutar una sincronización manual desde Settings > Trello

### El selector de agencias no muestra todas las agencias

1. Verificar que el usuario tenga acceso a esas agencias en `user_agencies`
2. Verificar los permisos del usuario según su rol

