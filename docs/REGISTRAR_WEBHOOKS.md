# 📡 Cómo Registrar Webhooks de Trello

## ✅ Estado Actual

- ✅ **Rosario**: Board ID `kZh4zJ0J` configurado
- ✅ **Madero**: Board ID `X4IFL8rx` configurado
- ⚠️ **Webhooks**: Pendientes de registro

## Opción 1: Desarrollo Local (usando ngrok)

### Paso 1: Instalar ngrok

```bash
# Mac
brew install ngrok

# O descargar desde https://ngrok.com
```

### Paso 2: Iniciar tu servidor de desarrollo

```bash
npm run dev
```

El servidor debería estar corriendo en `http://localhost:3044`

### Paso 3: Exponer con ngrok

En otra terminal:

```bash
ngrok http 3044
```

Ngrok te dará una URL como: `https://abc123.ngrok.io`

### Paso 4: Registrar los webhooks

```bash
npx tsx scripts/register-webhooks-all-agencies.ts https://abc123.ngrok.io/api/trello/webhook
```

**⚠️ Importante**: Cada vez que reinicies ngrok, obtendrás una nueva URL. Si tienes cuenta de ngrok, puedes configurar una URL fija.

## Opción 2: Producción

Si ya tienes el sistema en producción:

```bash
npx tsx scripts/register-webhooks-all-agencies.ts https://tu-dominio.com/api/trello/webhook
```

## Opción 3: Desde la Interfaz

También puedes registrar los webhooks manualmente desde la interfaz:

1. Ve a **Settings > Trello**
2. Selecciona la agencia (Rosario o Madero)
3. Ve a la pestaña **Webhooks**
4. Pega la URL del webhook en el campo
5. Haz clic en **"Registrar Webhook"**
6. Repite para la otra agencia

## Verificar que Funciona

Después de registrar los webhooks:

1. Ve a **Settings > Trello > Webhooks**
2. Deberías ver los webhooks listados con estado **✅ Activo**
3. Crea una tarjeta en Trello en cualquiera de los boards
4. Debería aparecer automáticamente en el sistema en la sección **Leads**

## Troubleshooting

### El webhook no se registra

- Verifica que la URL sea pública y accesible desde internet
- Verifica que la URL termine en `/api/trello/webhook`
- Revisa los logs del servidor para ver errores

### Los leads no se sincronizan

1. Verifica que el webhook esté activo en Trello
2. Ejecuta una sincronización manual desde **Settings > Trello > Sincronización**
3. Verifica que el Board ID sea correcto para cada agencia

### Error: "Webhook already exists"

El script detectará si ya existe un webhook y lo actualizará automáticamente. Si quieres eliminar webhooks antiguos:

1. Ve a **Settings > Trello > Webhooks**
2. Haz clic en **"Eliminar"** en el webhook que quieras eliminar
3. O elimínalo directamente desde la API de Trello

