# 🔗 Guía Completa: Configurar Webhooks de Trello en Producción

**Objetivo:** Configurar webhooks de Trello para sincronización automática en tiempo real en producción.

**Estado Actual:** Sistema sólido, necesita configuración de webhooks en producción.

---

## 📋 PRE-REQUISITOS

Antes de configurar los webhooks, asegúrate de tener:

1. ✅ **Trello configurado en el sistema:**
   - API Key y Token configurados en Settings → Trello
   - Board ID correcto para cada agencia
   - Configuración guardada y validada

2. ✅ **URL de producción:**
   - Dominio de producción funcionando (ej: `https://maxevagestion.vercel.app`)
   - Endpoint `/api/trello/webhook` accesible públicamente

3. ✅ **Permisos:**
   - Usuario con rol ADMIN o SUPER_ADMIN
   - Acceso a la configuración de Trello

---

## 🎯 PASO 1: Obtener URL de Producción

### 1.1 Identificar URL de Producción

La URL del webhook debe ser:
```
https://[tu-dominio-vercel].vercel.app/api/trello/webhook
```

O si tienes dominio personalizado:
```
https://[tu-dominio].com/api/trello/webhook
```

**Ejemplo:**
```
https://maxevagestion.vercel.app/api/trello/webhook
```

### 1.2 Verificar que el Endpoint Funciona

Antes de registrar el webhook, verifica que el endpoint responde:

```bash
# Verificar que el endpoint existe (debe responder 200)
curl -X HEAD https://[tu-dominio]/api/trello/webhook
```

**Resultado esperado:** Status 200

---

## 🎯 PASO 2: Configurar Webhooks desde la Interfaz

### 2.1 Acceder a Configuración de Trello

1. Inicia sesión en producción
2. Ve a **Settings** → **Trello**
3. Selecciona la primera agencia (ej: Rosario)

### 2.2 Registrar Webhook para Primera Agencia

1. Ve a la pestaña **"Webhooks"**
2. En el campo **"URL del Webhook"**, ingresa:
   ```
   https://[tu-dominio]/api/trello/webhook
   ```
3. Click en **"Registrar Webhook"**
4. **Verificar:**
   - Mensaje de éxito: "✅ Webhook registrado correctamente"
   - El webhook aparece en la lista con estado **✅ Activo**

### 2.3 Registrar Webhook para Segunda Agencia

1. Cambia a la segunda agencia (ej: Madero)
2. Repite el proceso del paso 2.2
3. **Verificar:** Ambos webhooks aparecen como activos

---

## 🎯 PASO 3: Verificar Webhooks en Trello

### 3.1 Verificar desde Trello API

Puedes verificar que los webhooks están registrados correctamente:

```bash
# Reemplaza con tus credenciales
curl "https://api.trello.com/1/tokens/[TU_TOKEN]/webhooks?key=[TU_API_KEY]"
```

**Resultado esperado:** Lista de webhooks con:
- `callbackURL`: Tu URL de producción
- `active`: `true`
- `idModel`: Board ID correspondiente

### 3.2 Verificar desde la Interfaz

1. En Settings → Trello → Webhooks
2. Deberías ver los webhooks listados
3. Estado debe ser **✅ Activo**

---

## 🧪 PASO 4: Probar el Webhook

### 4.1 Crear Card de Prueba en Trello

1. Ve a Trello
2. Abre el board configurado
3. Crea un nuevo card con:
   - **Nombre:** "Prueba Webhook - [Fecha]"
   - **Descripción:** "Testing webhook en producción"

### 4.2 Verificar Sincronización

1. Espera 2-5 segundos
2. Ve a **Sales → Leads** en el sistema
3. **Verificar:**
   - El lead aparece automáticamente
   - Tiene el nombre del card
   - Está en la lista correcta según el estado

### 4.3 Verificar Logs

1. Ve a Vercel Dashboard → Logs
2. Busca logs recientes con:
   - `📥 ========== TRELLO WEBHOOK RECEIVED ==========`
   - `✅ Card synced successfully`
3. **Verificar:** No hay errores

---

## 🔧 PASO 5: Troubleshooting

### Problema: Webhook no se registra

**Síntomas:**
- Error al hacer click en "Registrar Webhook"
- Mensaje de error en la interfaz

**Soluciones:**

1. **Verificar credenciales:**
   - Ve a Settings → Trello
   - Click en "Validar Credenciales"
   - Debe mostrar éxito

2. **Verificar URL:**
   - La URL debe ser pública (no localhost)
   - Debe terminar en `/api/trello/webhook`
   - Debe ser HTTPS (Trello requiere HTTPS)

3. **Verificar permisos del Token:**
   - El token debe tener permisos de lectura/escritura
   - Debe tener acceso al board

4. **Verificar que no hay webhook duplicado:**
   - Trello solo permite un webhook activo por board
   - Si ya existe, elimínalo primero desde Trello o desde la interfaz

### Problema: Webhook registrado pero inactivo

**Síntomas:**
- Webhook aparece en la lista pero con estado "❌ Inactivo"

**Soluciones:**

1. **Verificar que el endpoint responde:**
   ```bash
   curl -X HEAD https://[tu-dominio]/api/trello/webhook
   ```
   - Debe responder 200

2. **Verificar que Trello puede alcanzar la URL:**
   - La URL debe ser pública
   - No debe estar detrás de firewall
   - Debe ser HTTPS

3. **Re-registrar el webhook:**
   - Eliminar el webhook inactivo
   - Registrar uno nuevo

### Problema: Webhook activo pero no sincroniza

**Síntomas:**
- Webhook aparece como activo
- Pero los cards no se sincronizan automáticamente

**Soluciones:**

1. **Verificar Board ID:**
   - El Board ID en settings debe coincidir exactamente
   - Verificar en Settings → Trello que el Board ID es correcto

2. **Verificar logs:**
   - Revisar logs de Vercel
   - Buscar errores relacionados con el webhook
   - Verificar que el webhook está recibiendo eventos

3. **Probar manualmente:**
   - Crear un card en Trello
   - Verificar en logs que el webhook se recibió
   - Verificar que el card se procesó

4. **Verificar que el card está en la lista correcta:**
   - El sistema solo sincroniza cards de listas configuradas
   - Verificar el mapeo de listas en Settings → Trello

### Problema: Webhook recibe eventos pero no encuentra el board

**Síntomas:**
- Logs muestran: "⚠️ No settings found for board"
- Webhook se recibe pero se ignora

**Soluciones:**

1. **Verificar Board ID en settings:**
   - El Board ID debe ser el ID completo (no el short ID)
   - Puedes obtenerlo desde la URL del board en Trello

2. **Actualizar Board ID si es necesario:**
   - Ve a Settings → Trello
   - Actualiza el Board ID con el ID completo
   - Guarda la configuración

3. **Verificar que el board está configurado:**
   - Debe haber una entrada en `settings_trello` para ese board
   - Verificar en Supabase si es necesario

---

## 🔍 VERIFICACIÓN AVANZADA

### Verificar Webhooks desde Supabase

```sql
-- Ver configuración de Trello
SELECT 
  id,
  agency_id,
  board_id,
  webhook_id,
  webhook_url,
  trello_api_key IS NOT NULL as has_api_key,
  trello_token IS NOT NULL as has_token
FROM settings_trello;
```

### Verificar Webhooks desde Trello API

```bash
# Obtener todos los webhooks del token
curl "https://api.trello.com/1/tokens/[TU_TOKEN]/webhooks?key=[TU_API_KEY]"
```

### Verificar Logs de Webhooks

En Vercel Dashboard → Logs, buscar:
- `📥 ========== TRELLO WEBHOOK RECEIVED ==========`
- `✅ Card synced successfully`
- `❌ Error` (si hay problemas)

---

## 📝 CHECKLIST DE CONFIGURACIÓN

Usa este checklist para asegurar que todo está configurado correctamente:

### Pre-Configuración
- [ ] Trello API Key y Token configurados
- [ ] Board IDs correctos para cada agencia
- [ ] Configuración validada (click en "Validar Credenciales")
- [ ] URL de producción identificada

### Configuración
- [ ] Webhook registrado para Agencia 1 (Rosario)
- [ ] Webhook registrado para Agencia 2 (Madero)
- [ ] Ambos webhooks aparecen como **✅ Activo**

### Verificación
- [ ] Endpoint responde a HEAD request (200)
- [ ] Card de prueba creado en Trello
- [ ] Lead aparece automáticamente en el sistema
- [ ] Logs muestran webhook recibido y procesado
- [ ] No hay errores en logs

### Testing Completo
- [ ] Crear card → Aparece como lead
- [ ] Mover card a otra lista → Estado del lead cambia
- [ ] Actualizar nombre del card → Nombre del lead se actualiza
- [ ] Eliminar card → Lead se marca como perdido (o se elimina según configuración)

---

## 🚨 PROBLEMAS COMUNES Y SOLUCIONES

### Error: "Invalid API Key"

**Causa:** API Key incorrecta o sin permisos

**Solución:**
1. Verificar API Key en Settings → Trello
2. Regenerar Token si es necesario
3. Validar credenciales nuevamente

### Error: "Webhook already exists"

**Causa:** Ya existe un webhook para ese board

**Solución:**
1. Eliminar webhook existente desde la interfaz
2. O eliminar desde Trello directamente
3. Registrar nuevo webhook

### Error: "Callback URL must be HTTPS"

**Causa:** URL no es HTTPS

**Solución:**
- Asegurarse de usar `https://` en la URL
- Trello requiere HTTPS para webhooks

### Webhook se desactiva automáticamente

**Causa:** El endpoint no responde correctamente o hay errores frecuentes

**Solución:**
1. Verificar que el endpoint responde 200
2. Revisar logs por errores
3. Asegurarse de que el endpoint siempre retorna 200 (incluso en errores)

---

## ✅ CONFIGURACIÓN RECOMENDADA

### Para Producción

1. **Un webhook por board:**
   - Cada agencia tiene su propio board
   - Cada board tiene su propio webhook
   - No compartir webhooks entre boards

2. **URL única:**
   - Todos los webhooks apuntan a la misma URL
   - El sistema identifica el board automáticamente
   - No necesitas URLs diferentes por agencia

3. **Monitoreo:**
   - Revisar logs regularmente
   - Verificar que los webhooks siguen activos
   - Probar sincronización periódicamente

---

## 🎯 PASOS FINALES

Una vez configurado:

1. ✅ **Verificar que ambos webhooks están activos**
2. ✅ **Probar con cards reales en Trello**
3. ✅ **Verificar que se sincronizan automáticamente**
4. ✅ **Monitorear logs por 24 horas**
5. ✅ **Documentar cualquier problema encontrado**

---

## 📞 SOPORTE

Si después de seguir esta guía el webhook no funciona:

1. Revisa los logs de Vercel
2. Verifica los logs de Supabase
3. Revisa esta guía nuevamente
4. Contacta al equipo de desarrollo con:
   - Screenshots de la configuración
   - Logs de errores
   - Descripción del problema

---

**Última actualización:** Diciembre 2025  
**Versión:** 1.0.0

