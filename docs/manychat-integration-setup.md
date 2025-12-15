# 🚀 Guía de Configuración - Integración Manychat

## 📋 Checklist de Configuración

- [ ] Paso 1: Generar API Key
- [ ] Paso 2: Configurar variable de entorno en Vercel
- [ ] Paso 3: Obtener URL del webhook
- [ ] Paso 4: Configurar webhook en Manychat
- [ ] Paso 5: Probar la integración

---

## Paso 1: Generar API Key

Necesitas generar una API key secreta para autenticar los webhooks de Manychat.

### Opción A: Generar online
1. Ve a: https://www.uuidgenerator.net/
2. Genera un UUID v4 (o usa cualquier string aleatorio largo y seguro)
3. Ejemplo: `mc_webhook_7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c`

### Opción B: Generar desde terminal
```bash
# En Mac/Linux:
openssl rand -hex 32

# O simplemente usa un string largo y aleatorio
```

**Guarda esta API key, la necesitarás en el siguiente paso.**

---

## Paso 2: Configurar Variable de Entorno en Vercel

1. Ve a tu proyecto en Vercel: https://vercel.com
2. Selecciona tu proyecto
3. Ve a **Settings** → **Environment Variables**
4. Agrega una nueva variable:
   - **Name:** `MANYCHAT_WEBHOOK_API_KEY`
   - **Value:** La API key que generaste en el Paso 1
   - **Environment:** Production, Preview, Development (marca todas)
5. Haz clic en **Save**
6. **IMPORTANTE:** Despliega nuevamente la aplicación para que la variable tome efecto:
   - Ve a **Deployments**
   - Haz clic en los 3 puntos del último deployment
   - Selecciona **Redeploy**

---

## Paso 3: Obtener URL del Webhook

Tu URL del webhook será:
```
https://tu-dominio.vercel.app/api/webhooks/manychat
```

**Reemplaza `tu-dominio.vercel.app` con tu dominio real de Vercel.**

Ejemplo:
```
https://erplozada.vercel.app/api/webhooks/manychat
```

**Guarda esta URL, la necesitarás en Manychat.**

---

## Paso 4: Configurar Solicitud Externa en Manychat

**¡SIN ZAPIER!** Manychat puede hacer solicitudes HTTP directas al sistema.

### 4.1. Configurar External Request en Manychat

1. Ve a tu flujo en Manychat
2. Agrega un nuevo paso: **"External Request"** o **"Custom Request"**
   - Si no ves esta opción, busca: **"HTTP Request"** o **"Webhook"**
3. Configura el paso:

#### Configuración Básica:
- **Request Type:** `POST`
- **URL:** `https://tu-dominio.vercel.app/api/webhooks/manychat`
- **Content Type:** `application/json`

#### Headers:
Agrega un header:
- **Key:** `X-API-Key`
- **Value:** `[La API key que generaste en el Paso 1]`
- **Key:** `Content-Type`
- **Value:** `application/json`

#### Body (JSON):
Configura el body como JSON con los campos de Manychat:

```json
{
  "ig": "{{user.ig_username}}",
  "name": "{{user.name}}",
  "whatsapp": "{{user.whatsapp_1}}",
  "destino": "{{user.destination}}",
  "region": "{{user.region}}",
  "fechas": "{{user.dates_1}}",
  "personas": "{{user.people}}",
  "menores": "{{user.minors}}",
  "presupuesto": "{{user.budget}}",
  "servicio": "{{user.service_type}}",
  "evento": "{{user.event}}",
  "phase": "{{user.mc_phase}}",
  "bucket": "{{user.bucket}}",
  "agency": "rosario"
}
```

**IMPORTANTE:**
- Reemplaza los campos `{{user.xxx}}` con los nombres exactos de tus campos custom en Manychat
- El campo `agency` debe ser hardcodeado:
  - Si es cuenta de Rosario → `"rosario"`
  - Si es cuenta de Madero → `"madero"`
- Si un campo no existe en Manychat, déjalo vacío o elimínalo del JSON

### 4.2. Mapeo de Campos Manychat → JSON

**Campos estándar de Manychat:**
- `{{user.name}}` → Nombre del usuario
- `{{user.ig_username}}` → Instagram username
- `{{user.phone_number}}` → Teléfono (si está disponible)

**Campos custom (ajusta según tus nombres exactos):**
- `{{user.whatsapp_1}}` → WhatsApp (ajusta el nombre)
- `{{user.destination}}` → Destino
- `{{user.region}}` → Región
- `{{user.dates_1}}` → Fechas
- `{{user.people}}` → Personas
- `{{user.minors}}` → Menores
- `{{user.budget}}` → Presupuesto
- `{{user.service_type}}` → Tipo de servicio
- `{{user.event}}` → Evento
- `{{user.mc_phase}}` → Fase
- `{{user.bucket}}` → Bucket/Campaña

### 4.3. Verificar Nombres de Campos en Manychat

Para obtener los nombres exactos de tus campos custom:
1. Ve a Manychat → **Audience** → **Custom Fields**
2. Revisa los nombres exactos de cada campo
3. Úsalos en el JSON del External Request

### 4.4. Activar el Flujo

1. Guarda el paso de External Request
2. Publica el flujo en Manychat
3. El flujo se ejecutará automáticamente cuando se dispare el trigger

---

## Paso 5: Probar la Integración

### 5.1. Test Manual (opcional)

Puedes probar el webhook manualmente usando curl:

```bash
curl -X POST https://tu-dominio.vercel.app/api/webhooks/manychat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: [tu-api-key]" \
  -d '{
    "ig": "test_user",
    "name": "Usuario de Prueba",
    "whatsapp": "+5491123456789",
    "destino": "Cancún",
    "region": "CARIBE",
    "phase": "initial",
    "agency": "rosario"
  }'
```

**Respuesta esperada:**
```json
{
  "success": true,
  "created": true,
  "leadId": "uuid-del-lead",
  "message": "Lead creado correctamente"
}
```

### 5.2. Test desde Manychat

1. Dispara el flujo en Manychat (envía un mensaje que active el trigger)
2. Verifica en Manychat que el External Request se ejecutó correctamente
3. Ve a tu sistema: `/leads`
4. Selecciona "Pre-Leads Manychat" en el filtro de "Origen"
5. Deberías ver el nuevo lead creado

### 5.3. Verificar en la Base de Datos

Si quieres verificar directamente en Supabase:
1. Ve a tu proyecto en Supabase
2. Tabla `leads`
3. Filtra por `source = 'Manychat'`
4. Deberías ver el lead con todos los datos

---

## 🔍 Solución de Problemas

### Error: "No autorizado" (401)
- Verifica que la API key en el header `X-API-Key` coincida con `MANYCHAT_WEBHOOK_API_KEY` en Vercel
- Verifica que hiciste redeploy después de agregar la variable de entorno

### Error: "Configuración del servidor incompleta" (500)
- Verifica que agregaste `MANYCHAT_WEBHOOK_API_KEY` en Vercel
- Verifica que hiciste redeploy

### Error: "No se pudo determinar la agencia"
- Verifica que el campo `agency` en el payload sea "rosario" o "madero" (case insensitive)
- Verifica que existan agencias en la base de datos con esos nombres

### El lead no aparece en el sistema
- Verifica que seleccionaste "Pre-Leads Manychat" en el filtro de origen
- Verifica los logs de Vercel para ver si hay errores
- Verifica en Manychat que el External Request se ejecutó (revisa los logs del flujo)
- Verifica que el flujo esté publicado y activo en Manychat

### El lead se crea pero falta información
- Verifica que todos los campos en el JSON del External Request estén mapeados correctamente
- Verifica que los nombres de los campos custom coincidan exactamente con los de Manychat
- Verifica que los campos custom de Manychat tengan datos
- Revisa los logs del External Request en Manychat para ver qué se envió

---

## 📝 Formato del Payload Completo

Este es el formato exacto que espera el webhook:

```json
{
  "ig": "laurisariii",
  "name": "Lali Central",
  "bucket": "Campaña X",
  "region": "CARIBE",
  "whatsapp": "+5491123456789",
  "destino": "Bayahibe",
  "fechas": "2025-08-15",
  "personas": "2",
  "menores": "0",
  "presupuesto": "50000",
  "servicio": "Paquete",
  "evento": "",
  "phase": "initial",
  "agency": "rosario",
  "manychat_user_id": "123456",
  "flow_id": "flow_abc",
  "page_id": "page_xyz",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

**Campos requeridos:**
- `ig` O `name` (al menos uno)

**Campos opcionales pero recomendados:**
- `whatsapp`
- `destino`
- `region`
- `agency` (si no se envía, default: Rosario)

---

## ✅ Checklist Final

Antes de considerar la integración completa:

- [ ] API key generada y guardada de forma segura
- [ ] Variable `MANYCHAT_WEBHOOK_API_KEY` configurada en Vercel
- [ ] Redeploy realizado en Vercel
- [ ] External Request configurado en Manychat con la URL correcta
- [ ] Header `X-API-Key` configurado en Manychat
- [ ] Body JSON configurado con todos los campos mapeados
- [ ] Campo `agency` hardcodeado según la cuenta
- [ ] Flujo publicado y activo en Manychat
- [ ] Test realizado y lead creado correctamente
- [ ] Lead visible en `/leads` con filtro "Pre-Leads Manychat"

---

## 🎉 ¡Listo!

Una vez completados todos los pasos, la integración estará funcionando. Los leads de Manychat se crearán automáticamente en el sistema cada vez que se dispare el flujo.

**Recordatorio:** Esta integración es 100% independiente de Trello. No afecta la sincronización existente.

