# 🔧 Configuración de Supabase

## Paso 1: Obtener las credenciales de Supabase

1. Ve a tu proyecto en Supabase: https://app.supabase.com
2. Selecciona tu proyecto
3. Ve a **Settings** (Configuración) → **API**
4. Encontrarás las siguientes credenciales:

   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: Una clave larga que empieza con `eyJ...`
   - **service_role key**: Otra clave larga (¡manténla secreta!)

## Paso 2: Crear archivo .env.local

Crea un archivo llamado `.env.local` en la raíz del proyecto con el siguiente contenido:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui

# OpenAI Configuration (opcional, para OCR y AI Copilot)
OPENAI_API_KEY=tu_openai_api_key_aqui
```

**Reemplaza los valores con tus credenciales reales.**

## Paso 3: Reiniciar el servidor

Después de crear el archivo `.env.local`, reinicia el servidor de desarrollo:

```bash
# Detén el servidor actual (Ctrl+C)
# Luego inicia de nuevo:
npm run dev
```

## Paso 4: Verificar la conexión

1. Abre http://localhost:3000/login
2. Intenta iniciar sesión (si ya creaste un usuario)
3. Revisa la consola del navegador para ver si hay errores

## ⚠️ Importante

- **NUNCA** subas el archivo `.env.local` a Git (ya está en `.gitignore`)
- El `service_role_key` es muy sensible, úsalo solo en el servidor
- El `anon_key` es seguro para usar en el cliente (Next.js lo expone como `NEXT_PUBLIC_`)

## 🐛 Solución de problemas

### Error: "Missing Supabase environment variables"
- Verifica que el archivo `.env.local` existe en la raíz del proyecto
- Verifica que las variables tienen los nombres correctos
- Reinicia el servidor después de crear/modificar `.env.local`

### Error: "Invalid API key"
- Verifica que copiaste las credenciales completas
- Asegúrate de no tener espacios extra al inicio o final

### La conexión no funciona
- Verifica que tu proyecto de Supabase esté activo
- Revisa que ejecutaste el SQL de migración correctamente
- Verifica los logs en Supabase Dashboard → Logs

