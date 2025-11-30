# 🚀 Registrar Webhooks de Trello en Producción

## Pasos Rápidos

### 1. Obtener la URL de tu aplicación en Vercel

Ve a tu dashboard de Vercel y copia la URL de producción. Debería ser algo como:
- `https://maxevagestion.vercel.app`
- O tu dominio personalizado si lo tienes configurado

### 2. Ejecutar el script

```bash
cd erplozada
npx tsx scripts/register-trello-webhooks-production.ts https://vercel.com/tomassanchez04-5347s-projects/maxevagestion-v5/74chr1KaumybiTn5BiEhiu3SpMwD
```

**Ejemplo:**
```bash
npx tsx scripts/register-trello-webhooks-production.ts https://vercel.com/tomassanchez04-5347s-projects/maxevagestion-v5/74chr1KaumybiTn5BiEhiu3SpMwD
```

El script automáticamente:
- ✅ Encuentra todas las agencias configuradas
- ✅ Obtiene las configuraciones de Trello de cada una
- ✅ Registra o actualiza los webhooks en Trello
- ✅ Guarda la información en la base de datos

### 3. Verificar que funcionó

Después de ejecutar el script, deberías ver:
```
✅ Webhook registrado exitosamente
   ID: 5f8a9b7c...
   Estado: ✅ Activo
```

### 4. Probar la sincronización

1. Ve a Trello
2. Crea una nueva tarjeta en cualquiera de los boards configurados
3. La tarjeta debería aparecer automáticamente en tu aplicación en la sección **Leads**

## Troubleshooting

### Error: "No se encontraron configuraciones de Trello"
- Ve a **Settings > Trello** en tu aplicación
- Configura las credenciales de Trello para cada agencia
- Asegúrate de que el `board_id` esté configurado

### Error: "Faltan credenciales de Trello"
- Verifica que `TRELLO_API_KEY` y `TRELLO_TOKEN` estén en las variables de entorno
- O configura las credenciales desde **Settings > Trello** en la aplicación

### El webhook se registra pero no funciona
1. Verifica que la URL sea pública y accesible
2. Verifica que la URL termine en `/api/trello/webhook`
3. Revisa los logs de Vercel para ver si hay errores
4. Verifica que el webhook esté activo en Trello (el script te mostrará el estado)

## Verificar Webhooks Registrados

### Opción 1: Script de Verificación (Recomendado)

Ejecuta el script de verificación para ver el estado completo:

```bash
npx tsx scripts/verify-trello-webhooks.ts
```

Este script te mostrará:
- ✅ Todos los webhooks registrados para cada agencia
- ✅ Estado de cada webhook (activo/inactivo)
- ✅ URL del callback
- ✅ Si la URL es accesible desde internet
- ⚠️ Si hay problemas de configuración

### Opción 2: Desde la Interfaz

1. Ve a **Settings > Trello**
2. Selecciona una agencia
3. Ve a la pestaña **Webhooks**
4. Deberías ver los webhooks listados con su estado

## ⚠️ IMPORTANTE: URL del Webhook

**El campo "Allowed origins" en la configuración de la API key de Trello NO es para webhooks.**

Los webhooks se registran directamente usando la API de Trello. La URL que necesitas es:

```
https://tu-dominio.com/api/trello/webhook
```

O si estás en Vercel:
```
https://maxevagestion.vercel.app/api/trello/webhook
```

Esta URL debe ser:
- ✅ Pública y accesible desde internet
- ✅ Terminar en `/api/trello/webhook`
- ✅ Responder a requests POST de Trello
- ✅ No requerir autenticación (el endpoint es público)

## Verificar que el Endpoint Funciona

Puedes probar manualmente si el endpoint responde:

```bash
curl -X HEAD https://maxevagestion.vercel.app/api/trello/webhook
```

Debería responder con un status 200 o 405 (Method Not Allowed es normal para HEAD).

