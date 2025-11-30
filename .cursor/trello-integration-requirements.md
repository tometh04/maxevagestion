# Requisitos para Integración en Tiempo Real con Trello

## ✅ Lo que ya está implementado

- ✅ Servicio de sincronización (`lib/trello/sync.ts`)
- ✅ Endpoint de webhook (`POST /api/trello/webhook`)
- ✅ API para registrar webhooks (`POST /api/trello/webhooks/register`)
- ✅ API para gestionar webhooks (`GET/DELETE /api/trello/webhooks`)
- ✅ UI en Settings para gestionar webhooks
- ✅ Sincronización automática en tiempo real

## 🔧 Lo que necesito de tu lado

### 1. **URL Pública para Webhooks** ⚠️ OBLIGATORIO

Trello necesita enviar eventos a una URL pública. Tienes dos opciones:

#### Opción A: Desarrollo Local (Recomendado para probar)
Usa **ngrok** para exponer tu servidor local:

1. Instalar ngrok:
   ```bash
   brew install ngrok  # Mac
   # O descargar desde https://ngrok.com
   ```

2. Ejecutar ngrok:
   ```bash
   ngrok http 3000
   ```

3. Copiar la URL HTTPS que te da (ej: `https://abc123.ngrok.io`)

4. Usar esa URL + `/api/trello/webhook`:
   ```
   https://abc123.ngrok.io/api/trello/webhook
   ```

#### Opción B: Producción
Si ya tienes un dominio en producción:
```
https://tu-dominio.com/api/trello/webhook
```

### 2. **Configurar el Webhook**

Una vez que tengas la URL pública:

1. Ve a **Settings → Trello → Webhooks**
2. Pega la URL en el campo "URL del Webhook"
3. Haz clic en "Registrar Webhook"
4. ¡Listo! Ahora las tarjetas se sincronizarán automáticamente

### 3. **Estructura de Tarjetas de Trello** (Opcional - para mejorar el mapeo)

Si quieres que extraiga mejor la información, puedes estructurar tus tarjetas así:

- **Nombre de tarjeta:** `Nombre Contacto - Destino` o `Nombre: Destino`
- **Labels:** Usa labels para destinos (el sistema los detectará automáticamente)
- **Descripción:** Puede incluir teléfono, email, Instagram (se extraen automáticamente)

**Ejemplo de tarjeta:**
- Nombre: `Juan Pérez - Cancún`
- Label: `Caribe` (opcional)
- Descripción: `Tel: +54 11 1234-5678\nEmail: juan@example.com\n@juanperez`

---

## 🎯 Próximos pasos

1. **Obtén una URL pública** (ngrok para desarrollo o tu dominio para producción)
2. **Ve a Settings → Trello → Webhooks**
3. **Pega la URL y registra el webhook**
4. **¡Prueba!** Crea una tarjeta en Trello y debería aparecer automáticamente en el sistema

---

## 📝 Notas

- El webhook sincroniza automáticamente cuando:
  - ✅ Se crea una tarjeta
  - ✅ Se actualiza una tarjeta (nombre, descripción)
  - ✅ Se mueve una tarjeta entre listas (cambio de estado)
  - ✅ Se elimina una tarjeta

- Si cambias la URL del webhook, elimina el anterior y registra uno nuevo.

- Para desarrollo local, cada vez que reinicies ngrok obtendrás una nueva URL. Tendrás que actualizar el webhook.

---

**¿Listo?** Solo necesitas la URL pública y registrar el webhook desde la UI. 🚀
