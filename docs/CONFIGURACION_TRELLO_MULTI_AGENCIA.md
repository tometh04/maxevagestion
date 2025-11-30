# Configuración Trello Multi-Agencia - Guía Completa

## ✅ Implementación Completada

El sistema ahora soporta completamente múltiples agencias con Trello, cada una con su propio board y webhook independiente.

## Cómo Configurar Cada Agencia

### Paso 1: Ir a Settings > Trello

1. Accede a **Configuración** en el sidebar
2. Haz clic en la pestaña **Trello**

### Paso 2: Seleccionar la Agencia

1. En la parte superior derecha verás un selector de **Agencia**
2. Selecciona la agencia que quieres configurar (ej: "Rosario", "Madero")
3. El sistema cargará automáticamente la configuración de esa agencia

### Paso 3: Configurar Credenciales (Tab "Credenciales")

Para cada agencia necesitas configurar:

- **API Key**: La misma API Key de Trello para todas las agencias
- **Token**: El mismo Token de Trello para todas las agencias  
- **Board ID**: El Board ID específico de esa agencia
  - Rosario: `kZh4zJ0J`
  - Madero: `X4IFL8rx`

**Pasos:**
1. Completa los campos API Key, Token y Board ID
2. Haz clic en **"Probar Conexión"** para verificar que funciona
3. Haz clic en **"Guardar"** para guardar la configuración

### Paso 4: Configurar Mapeos (Tab "Mapeo")

Una vez guardadas las credenciales, el sistema cargará automáticamente las listas del board:

1. **Mapeo de Estados**: Para cada lista de Trello, selecciona el estado correspondiente:
   - `NEW` - Nuevo
   - `IN_PROGRESS` - En Progreso
   - `QUOTED` - Cotizado
   - `WON` - Ganado
   - `LOST` - Perdido

2. **Mapeo de Regiones** (opcional): Si tus listas están organizadas por región, mapea cada lista a su región correspondiente

3. Haz clic en **"Guardar Mapeos"** cuando termines

### Paso 5: Registrar Webhook (Tab "Webhooks")

Para sincronización en tiempo real, cada agencia necesita su propio webhook:

1. Verifica que la **URL del Webhook** sea correcta (normalmente se autocompleta)
   - Ejemplo: `https://tu-dominio.com/api/trello/webhook`
   - ⚠️ La URL debe ser pública y accesible desde internet

2. Haz clic en **"Registrar Webhook"**
3. Verifica que aparezca en la lista de **"Webhooks Activos"** con estado ✅ Activo

**Importante:** Cada agencia debe tener su propio webhook registrado. Si cambias de agencia en el selector, verás los webhooks de esa agencia específica.

### Paso 6: Sincronizar Leads Existentes (Tab "Sincronización")

1. Haz clic en **"Ejecutar Sincronización"**
2. El sistema traerá todas las tarjetas del board de Trello de esa agencia
3. Se mostrará un resumen con:
   - Total procesadas
   - Creadas
   - Actualizadas

## Configuración Actual

### Rosario
- **Board ID**: `kZh4zJ0J`
- **Estado**: Configurada y funcionando

### Madero
- **Board ID**: `X4IFL8rx`
- **Estado**: Configurada (Board ID ya configurado via script)
- **Pendiente**: 
  - Registrar webhook
  - Sincronizar leads existentes

## Características del Sistema

### ✅ Independencia por Agencia

- Cada agencia tiene su propia configuración de Trello
- Cada agencia tiene su propio Board ID
- Cada agencia tiene su propio webhook
- Los leads se mantienen separados por `agency_id`

### ✅ Sincronización en Tiempo Real

- Los cambios en Trello se reflejan automáticamente en el sistema
- El webhook identifica automáticamente la agencia según el `board_id`
- No se mezclan los leads entre agencias

### ✅ Selector de Agencias

- En **Settings > Trello**: Selector para configurar cada agencia
- En **Leads**: Selector para filtrar leads por agencia
- Cada agencia muestra solo sus propios leads

## Verificación

Para verificar que todo funciona:

1. **En Leads:**
   - Selecciona "Rosario" → Debe mostrar solo leads de Rosario
   - Selecciona "Madero" → Debe mostrar solo leads de Madero
   - Selecciona "Todas las agencias" → Muestra leads de todas

2. **En Trello:**
   - Crea un card en el board de Rosario → Debe aparecer en el sistema
   - Crea un card en el board de Madero → Debe aparecer en el sistema
   - Mueve un card entre listas → El estado se actualiza automáticamente

## Notas Importantes

- ✅ **API Key y Token son compartidos** entre agencias (mismo account de Trello)
- ✅ **Board ID es único** por agencia
- ✅ **Webhook es único** por agencia (cada uno apunta al mismo endpoint pero Trello los identifica por board)
- ✅ **Los leads nunca se mezclan** - cada lead tiene su `agency_id`

## Troubleshooting

### El selector de agencias no aparece en Settings

- Verifica que el usuario tenga rol ADMIN o SUPER_ADMIN
- Verifica que existan agencias en la base de datos

### Los webhooks no funcionan

1. Verifica que la URL sea pública y accesible
2. Verifica que el webhook esté registrado en Trello (Settings > Trello > Webhooks)
3. Revisa los logs del servidor para ver si llegan los webhooks

### Los leads no se sincronizan

1. Verifica que el Board ID sea correcto para esa agencia
2. Verifica que las credenciales (API Key/Token) sean correctas
3. Ejecuta una sincronización manual desde Settings > Trello > Sincronización

### No se ven los leads de una agencia

1. Verifica que la agencia esté seleccionada en el selector de Leads
2. Verifica que los leads tengan el `agency_id` correcto
3. Ejecuta una sincronización para esa agencia específica

