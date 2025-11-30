# 📋 Checklist Simple para Vercel

## ✅ Pasos a Seguir

### 1. Variables de Entorno en Vercel

- [ ] Abrir https://vercel.com
- [ ] Seleccionar proyecto "maxevagestion"
- [ ] Ir a Settings → Environment Variables
- [ ] Agregar: `NEXT_PUBLIC_SUPABASE_URL`
- [ ] Agregar: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Agregar: `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Agregar: `CRON_SECRET` (cualquier texto, ej: "mi-secreto-123")
- [ ] Agregar: `TRELLO_API_KEY` (si usas Trello)
- [ ] Agregar: `TRELLO_TOKEN` (si usas Trello)
- [ ] Agregar: `OPENAI_API_KEY` (si usas OCR)

### 2. Webhooks de Trello (desde la app)

- [ ] Abrir tu app en producción
- [ ] Ir a Settings → Trello
- [ ] Registrar webhook para Rosario
- [ ] Registrar webhook para Madero

### 3. Verificar

- [ ] Crear tarjeta en Trello → Debe aparecer en la app
- [ ] Revisar que los cron jobs estén activos en Vercel

---

## 🔗 Links Útiles

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Supabase**: https://app.supabase.com
- **Trello API Key**: https://trello.com/app-key

