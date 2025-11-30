# 🐛 Debugging Trello Webhooks

## ✅ Mejoras Implementadas

### 1. Logging Detallado
- Cada webhook ahora registra información completa:
  - Tipo de acción recibida
  - Card ID y Board ID
  - Estructura completa del payload
  - Tiempo de procesamiento
  - Errores detallados con stack traces

### 2. Mejor Matching de Boards
- Intenta múltiples formas de encontrar el board:
  - Busca en diferentes lugares del payload
  - Compara IDs completos y cortos
  - Si no encuentra, hace fetch del card para obtener el board ID
  - Prueba con todas las configuraciones disponibles

### 3. Manejo de Errores Mejorado
- Siempre retorna 200 OK para evitar que Trello marque el webhook como fallido
- Los errores se registran en logs pero no rompen el webhook
- Esto permite que Trello siga enviando eventos aunque haya errores temporales

### 4. Endpoint de Test
- Nuevo endpoint para probar la sincronización manualmente:
  ```
  POST /api/trello/webhook/test
  Body: { cardId: "trello_card_id", agencyId?: "agency_id" }
  ```

## 🔍 Cómo Verificar que Funciona

### Opción 1: Ver Logs en Vercel
1. Ve a tu dashboard de Vercel
2. Selecciona el proyecto `maxevagestion-v5`
3. Ve a **Deployments** → Selecciona el último deploy
4. Haz clic en **Runtime Logs**
5. Crea una tarjeta en Trello
6. Deberías ver logs como:
   ```
   📥 ========== TRELLO WEBHOOK RECEIVED ==========
   📋 Action Type: createCard
   🆔 Card ID: abc123...
   🆔 Board ID: xyz789...
   🔄 Syncing card: abc123...
   ✅ Card fetched successfully: Nombre de la tarjeta
   ✅ Card synced successfully: { created: true, leadId: "..." }
   ```

### Opción 2: Usar el Endpoint de Test
```bash
curl -X POST https://www.maxevagestion.com/api/trello/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"cardId": "TU_CARD_ID_DE_TRELLO"}'
```

Esto te mostrará:
- Si el card se puede obtener de Trello
- Si la sincronización funciona
- Qué agencia se usó
- Si se creó o actualizó el lead

### Opción 3: Verificar en la Base de Datos
1. Ve a Supabase Dashboard
2. Abre la tabla `leads`
3. Filtra por `source = 'Trello'`
4. Crea una tarjeta en Trello
5. Deberías ver el lead aparecer en unos segundos

## 🚨 Troubleshooting

### El webhook no se recibe
1. Verifica que los webhooks estén activos:
   ```bash
   npx tsx scripts/register-trello-webhooks-production.ts https://www.maxevagestion.com
   ```

2. Verifica en Trello:
   - Ve a tu board en Trello
   - Settings → Power-Ups → Webhooks
   - Deberías ver el webhook listado como "Active"

### El webhook se recibe pero no sincroniza
1. Revisa los logs en Vercel (Runtime Logs)
2. Busca errores que empiecen con `❌`
3. Verifica que:
   - El board_id en `settings_trello` coincida con el board de Trello
   - Las credenciales de Trello (API key y token) sean válidas
   - El mapping de listas esté configurado correctamente

### El card se sincroniza pero no aparece en la UI
1. Verifica que el lead esté en la base de datos (Supabase)
2. Verifica que el `agency_id` del lead coincida con la agencia que estás viendo
3. Refresca la página de Leads en la aplicación

## 📊 Acciones que se Sincronizan

El webhook ahora procesa estos eventos:
- ✅ `createCard` - Crear nueva tarjeta
- ✅ `updateCard` - Actualizar tarjeta
- ✅ `moveCardFromList` - Mover tarjeta de lista
- ✅ `moveCardToList` - Mover tarjeta a lista
- ✅ `updateCard:closed` - Archivar/desarchivar tarjeta
- ✅ `updateCard:name` - Cambiar nombre
- ✅ `updateCard:desc` - Cambiar descripción
- ✅ `addMemberToCard` - Agregar miembro
- ✅ `removeMemberFromCard` - Quitar miembro
- ✅ `addLabelToCard` - Agregar label
- ✅ `removeLabelFromCard` - Quitar label
- ✅ `deleteCard` - Eliminar tarjeta

## 🔧 Configuración Requerida

Para que funcione correctamente, necesitas:

1. **Configuración de Trello en la app:**
   - Ve a Settings → Trello
   - Configura API Key y Token para cada agencia
   - Configura el Board ID
   - Configura el mapping de listas (status y region)

2. **Webhooks registrados:**
   - Ejecuta el script de registro de webhooks
   - O regístralos manualmente desde Settings → Trello → Webhooks

3. **Variables de entorno:**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

## 📝 Notas Importantes

- El webhook siempre retorna 200 OK para evitar que Trello lo marque como fallido
- Los errores se registran en logs pero no rompen el flujo
- Si un card no se puede sincronizar, se registra el error pero el webhook sigue funcionando
- El matching de boards es más robusto y debería funcionar incluso si el board ID viene en diferentes formatos

