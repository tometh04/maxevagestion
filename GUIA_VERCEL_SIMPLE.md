# 🚀 Guía Simple para Configurar Vercel

## Paso 1: Abrir Vercel

1. Abre tu navegador
2. Ve a: **https://vercel.com**
3. Inicia sesión con tu cuenta (la misma que usaste para GitHub)

---

## Paso 2: Encontrar tu Proyecto

1. Una vez dentro de Vercel, verás una lista de proyectos
2. Busca el proyecto llamado **"maxevagestion"** (o el nombre que le hayas dado)
3. Haz **click** en ese proyecto

---

## Paso 3: Agregar Variables de Entorno

1. En la página de tu proyecto, busca el menú arriba que dice **"Settings"** (Configuración)
2. Haz click en **"Settings"**
3. En el menú de la izquierda, busca y haz click en **"Environment Variables"** (Variables de Entorno)

### Agregar cada variable:

Para cada variable, haz esto:

1. Haz click en el botón **"Add New"** (Agregar Nueva)
2. En el campo **"Name"** (Nombre), pega el nombre de la variable (ejemplo: `NEXT_PUBLIC_SUPABASE_URL`)
3. En el campo **"Value"** (Valor), pega el valor real (ejemplo: `https://xxxxx.supabase.co`)
4. Marca las 3 casillas: ☑ Production ☑ Preview ☑ Development
5. Haz click en **"Save"** (Guardar)
6. Repite para cada variable

### Variables que necesitas agregar:

**1. NEXT_PUBLIC_SUPABASE_URL**
- Valor: Tu URL de Supabase (la encuentras en https://app.supabase.com → Settings → API → Project URL)

**2. NEXT_PUBLIC_SUPABASE_ANON_KEY**
- Valor: Tu anon key de Supabase (la encuentras en https://app.supabase.com → Settings → API → anon/public key)

**3. SUPABASE_SERVICE_ROLE_KEY**
- Valor: Tu service role key de Supabase (la encuentras en https://app.supabase.com → Settings → API → service_role key)

**4. CRON_SECRET**
- Valor: Cualquier texto aleatorio, por ejemplo: `mi-secreto-123-abc-xyz`
- (Este es solo para proteger los cron jobs)

**5. TRELLO_API_KEY** (opcional - solo si usas Trello)
- Valor: Tu API key de Trello

**6. TRELLO_TOKEN** (opcional - solo si usas Trello)
- Valor: Tu token de Trello

**7. OPENAI_API_KEY** (opcional - solo si usas OCR)
- Valor: Tu API key de OpenAI

---

## Paso 4: Configurar Webhooks de Trello (desde la app)

Una vez que tu app esté desplegada en Vercel:

1. Abre tu app en producción: `https://tu-proyecto.vercel.app`
2. Inicia sesión
3. Ve a **Settings** → **Trello**
4. Selecciona la agencia (Rosario o Madero)
5. Ve a la pestaña **"Webhooks"**
6. Pega esta URL: `https://tu-proyecto.vercel.app/api/trello/webhook`
   (Reemplaza "tu-proyecto" con el nombre real de tu proyecto en Vercel)
7. Haz click en **"Registrar Webhook"**
8. Repite para la otra agencia

---

## Paso 5: Verificar que Funciona

1. Los cron jobs se configuran automáticamente (no necesitas hacer nada)
2. Para verificar los webhooks: crea una tarjeta en Trello y debería aparecer automáticamente en tu app

---

## ❓ ¿Necesitas Ayuda?

Si no encuentras algo o tienes dudas, dime en qué paso estás y te ayudo específicamente con ese paso.

