# 🚀 Registrar Webhooks de Trello en Producción

## Pasos Rápidos

### 1. Obtener la URL de tu aplicación en Vercel

Ve a tu dashboard de Vercel y copia la URL de producción. Debería ser algo como:
- `https://maxevagestion.vercel.app`
- O tu dominio personalizado si lo tienes configurado

### 2. Ejecutar el script

```bash
cd erplozada
npx tsx scripts/register-trello-webhooks-production.ts https://tu-url-de-vercel.vercel.app
```

**Ejemplo:**
```bash
npx tsx scripts/register-trello-webhooks-production.ts https://maxevagestion.vercel.app
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

Puedes verificar los webhooks registrados desde la aplicación:
1. Ve a **Settings > Trello**
2. Selecciona una agencia
3. Ve a la pestaña **Webhooks**
4. Deberías ver los webhooks listados con su estado

