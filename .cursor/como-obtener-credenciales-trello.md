# Cómo Obtener las Credenciales de Trello

## 1. API Key de Trello

1. Ve a: https://trello.com/app-key
2. Inicia sesión en tu cuenta de Trello
3. Copia la **API Key** que aparece en la página

## 2. Token de Trello

1. En la misma página (https://trello.com/app-key), al final verás un link que dice:
   "Token" o "Generate a Token"
2. Haz clic ahí
3. Te pedirá autorización, acepta
4. Copia el **Token** que te muestra

## 3. Board ID (ID del Tablero)

1. Abre tu tablero de Trello en el navegador
2. Mira la URL, será algo como:
   `https://trello.com/b/ABC123XYZ/nombre-del-tablero`
3. El **Board ID** es la parte `ABC123XYZ` (después de `/b/`)

## 4. Configurar en la App

1. Ve a **Settings → Trello → Credenciales**
2. Pega:
   - **API Key**: (la que copiaste del paso 1)
   - **Token**: (la que copiaste del paso 2)
   - **Board ID**: (la que copiaste del paso 3)
3. Haz clic en **"Probar Conexión"** para verificar que funciona
4. Haz clic en **"Guardar"**

¡Listo! Ahora puedes registrar el webhook.

