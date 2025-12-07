# 📋 Guía de Integración con Trello

Esta guía explica cómo configurar y usar la integración entre MAXEVA GESTION y Trello para sincronizar leads automáticamente.

## 🎯 ¿Qué hace la integración?

La integración con Trello permite:

- **Sincronización automática**: Los cards de Trello se convierten automáticamente en leads en MAXEVA GESTION
- **Bidireccional**: Los cambios en MAXEVA GESTION se reflejan en Trello
- **Webhooks**: Actualización en tiempo real sin necesidad de sincronización manual
- **Pipeline visual**: Usa el Kanban de Trello para gestionar tu pipeline de ventas

## ⚙️ Configuración Paso a Paso

### Paso 1: Obtener Credenciales de Trello

1. **Obtener API Key**:
   - Ve a https://trello.com/app-key
   - Copia tu **API Key**

2. **Obtener Token**:
   - En la misma página, haz clic en "Token" al final de la página
   - Autoriza la aplicación
   - Copia el **Token** generado

### Paso 2: Configurar en MAXEVA GESTION

1. **Acceder a Configuración**:
   - Inicia sesión en MAXEVA GESTION
   - Ve a **Configuración** → **Trello**

2. **Completar Credenciales**:
   - **API Key**: Pega tu API Key de Trello
   - **Token**: Pega tu Token de Trello
   - **Board ID**: ID del board de Trello que quieres sincronizar

3. **Validar Credenciales**:
   - Haz clic en **"Validar Credenciales"**
   - Si las credenciales son correctas, verás un mensaje de éxito
   - Si hay un error, verifica que hayas copiado correctamente las credenciales

4. **Configurar Listas**:
   - Selecciona qué listas de Trello corresponden a cada estado de lead:
     - **Nueva**: Lista de leads nuevos
     - **En Progreso**: Leads en seguimiento
     - **Cotizado**: Leads con cotización enviada
     - **Ganado**: Leads convertidos en operaciones

5. **Guardar Configuración**:
   - Haz clic en **"Guardar Configuración"**
   - El sistema validará las credenciales antes de guardar

### Paso 3: Configurar Webhooks (Automático)

Una vez guardada la configuración, el sistema automáticamente:

1. **Registra un webhook** en Trello para el board seleccionado
2. **Escucha cambios** en tiempo real (creación, actualización, movimiento de cards)
3. **Sincroniza automáticamente** sin necesidad de acciones manuales

## 🔍 Cómo Encontrar el Board ID

El **Board ID** es el identificador único de tu board de Trello. Puedes obtenerlo de varias formas:

### Método 1: Desde la URL
1. Abre tu board de Trello en el navegador
2. La URL será algo como: `https://trello.com/b/ABC123xyz/nombre-del-board`
3. El Board ID es `ABC123xyz` (la parte después de `/b/`)

### Método 2: Desde la API
1. Ve a: `https://api.trello.com/1/members/me/boards?key=TU_API_KEY&token=TU_TOKEN`
2. Encuentra tu board en la lista
3. Copia el campo `id`

## 📊 Estructura Recomendada de Boards

Para mejores resultados, organiza tu board de Trello así:

```
📋 Pipeline de Ventas
├── 📝 Nuevos Leads
│   └── Cards con información básica del cliente
├── 🔄 En Seguimiento
│   └── Cards de leads con los que estás en contacto activo
├── 💰 Cotizados
│   └── Cards con cotizaciones enviadas
├── ✅ Ganados
│   └── Cards convertidos en operaciones
└── ❌ Perdidos
    └── Cards que no se concretaron (opcional)
```

### Formato Recomendado de Cards

Para que la sincronización funcione mejor, incluye esta información en cada card:

**Título del Card**: Nombre del contacto
**Descripción**:
```
📧 Email: cliente@ejemplo.com
📞 Teléfono: +54 11 1234-5678
🌍 Destino: Cancún
💰 Presupuesto: USD 2,500
📝 Notas: Cliente interesado en viaje familiar
```

## 🔄 Proceso de Sincronización

### Sincronización Automática (Webhooks)

El sistema escucha estos eventos de Trello:

- ✅ **Creación de card**: Se crea un nuevo lead automáticamente
- ✅ **Actualización de card**: El lead se actualiza en MAXEVA GESTION
- ✅ **Movimiento de card**: Cambia el estado del lead según la lista
- ✅ **Eliminación de card**: El lead se marca como "Perdido" (no se elimina)

### Sincronización Manual

Si necesitas sincronizar manualmente:

1. Ve a **Configuración** → **Trello**
2. Haz clic en **"Sincronizar Ahora"**
3. El sistema sincronizará todos los cards del board
4. Verás un resumen al finalizar:
   - Cards procesados
   - Leads creados
   - Leads actualizados
   - Errores (si los hay)

## 🐛 Troubleshooting

### Error: "Invalid API Key"

**Solución**:
- Verifica que hayas copiado correctamente la API Key
- Asegúrate de no tener espacios extras antes o después
- Prueba generar un nuevo Token si el problema persiste

### Error: "Board not found"

**Solución**:
- Verifica que el Board ID sea correcto
- Asegúrate de que el Token tenga acceso al board
- El board debe ser visible (público o compartido con la cuenta de Trello)

### Los leads no se sincronizan automáticamente

**Posibles causas**:
1. **Webhook no registrado**: Verifica que la configuración se haya guardado correctamente
2. **Board ID incorrecto**: Verifica que el ID del board sea correcto
3. **Permisos**: El Token debe tener permisos para leer/escribir en el board

**Solución**:
- Ve a **Configuración** → **Trello**
- Haz clic en **"Sincronizar Ahora"** para sincronización manual
- Si el problema persiste, verifica los logs del sistema

### Cards duplicados en Trello

**Causa**: El webhook se ejecutó múltiples veces

**Solución**:
- Los webhooks tienen retry logic incorporado para evitar duplicados
- Si aún ves duplicados, verifica que solo tengas un webhook activo por board
- Puedes eliminar webhooks duplicados desde la configuración de Trello

### La sincronización es lenta

**Posibles causas**:
- Muchos cards en el board (>1000)
- Conexión a internet lenta
- Rate limits de Trello API

**Solución**:
- La sincronización manual procesa en batches
- Espera a que termine (puede tardar varios minutos)
- Si se interrumpe, puedes volver a ejecutarla

## 🔒 Seguridad

### Protección de Credenciales

- Las credenciales de Trello se almacenan encriptadas en la base de datos
- Solo usuarios con rol SUPER_ADMIN o ADMIN pueden ver/editar la configuración
- Las credenciales nunca se muestran en el frontend

### Permisos del Token

El Token de Trello debe tener estos permisos:
- ✅ **read**: Para leer cards y listas
- ✅ **write**: Para crear y actualizar cards

**No necesitas** permisos de admin del board.

## 📞 Soporte

Si tienes problemas con la integración:

1. Revisa esta guía primero
2. Verifica los logs del sistema en **Configuración** → **Logs**
3. Contacta al equipo de soporte con:
   - Descripción del problema
   - Screenshots de errores
   - Fecha/hora del problema

## 🎓 Mejores Prácticas

1. **Usa un board dedicado** para leads de MAXEVA GESTION
2. **Mantén el board organizado** con listas claras
3. **No elimines cards** manualmente en Trello (mejor muévelos a "Perdidos")
4. **Sincroniza regularmente** si trabajas principalmente en Trello
5. **Usa etiquetas** en Trello para categorías adicionales (se sincronizan como metadatos)

---

**Última actualización**: Diciembre 2025

