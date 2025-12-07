# 🚀 DEPLOY A PRODUCCIÓN - CHECKLIST

**Fecha:** Diciembre 2025  
**Último commit:** Verificado y pusheado a `main`

---

## ✅ PRE-DEPLOY (Completado)

- [x] Código 100% completado
- [x] Todas las fases del roadmap implementadas
- [x] Testing documentado
- [x] Commits pusheados a `main`
- [x] Vercel detectará automáticamente el push

---

## 🔄 DEPLOY AUTOMÁTICO

Vercel debería estar haciendo el deploy automáticamente ahora. Verifica en:

1. **Vercel Dashboard**: https://vercel.com/dashboard
2. **Deployments tab**: Verifica que el nuevo deploy esté en progreso/completado

---

## 📋 POST-DEPLOY (Acciones Manuales Requeridas)

### 1. Verificar Deploy en Vercel
- [ ] Acceder a Vercel Dashboard
- [ ] Verificar que el deploy se completó exitosamente
- [ ] Verificar que no hay errores de build
- [ ] Verificar que la aplicación está funcionando en producción

### 2. Ejecutar Migraciones SQL en Producción
- [ ] Acceder a Supabase Dashboard (producción)
- [ ] Ejecutar migración `050_performance_indexes_final.sql`
- [ ] Verificar que todos los índices se crearon correctamente
- [ ] Verificar que no hay errores

### 3. Configurar Variables de Entorno en Vercel
- [ ] `NEXT_PUBLIC_SUPABASE_URL` - URL de Supabase producción
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anon key de producción
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Service role key de producción
- [ ] `OPENAI_API_KEY` - API key de OpenAI
- [ ] `TRELLO_API_KEY` (si aplica)
- [ ] `TRELLO_TOKEN` (si aplica)
- [ ] `RESEND_API_KEY` (si aplica)

### 4. Crear Usuarios Iniciales
- [ ] Usuario SUPER_ADMIN (Maxi)
- [ ] Usuario CONTABLE (Yamil)
- [ ] Usuarios SELLER (vendedoras)
- [ ] Asignar usuarios a sus agencias correspondientes

### 5. Configurar Trello para Producción
- [ ] Seguir `GUIA_TRELLO.md`
- [ ] Configurar Trello para ambas agencias
- [ ] **Registrar webhooks en producción** (Ver `GUIA_WEBHOOK_TRELLO_PRODUCCION.md`)
  - Opción 1: Desde la interfaz (Settings → Trello → Webhooks)
  - Opción 2: Script automático: `npx tsx scripts/register-trello-webhook-production.ts <URL_PRODUCCION>`
- [ ] Verificar que los webhooks están activos
- [ ] Probar sincronización: crear card en Trello → verificar que aparece en Leads

### 6. Migrar Datos Históricos
- [ ] Seguir `GUIA_MIGRACION_DATOS.md`
- [ ] Importar clientes
- [ ] Importar operaciones abiertas
- [ ] Configurar saldos iniciales de caja
- [ ] Importar operadores
- [ ] Validar integridad de datos

### 7. Testing Final en Producción
- [ ] Probar login con usuarios creados
- [ ] Verificar dashboard carga correctamente
- [ ] Probar creación de lead
- [ ] Probar conversión a operación
- [ ] Verificar que Trello sincroniza
- [ ] Probar AI Copilot
- [ ] Verificar performance (tiempos de carga)

### 8. Monitoreo Inicial
- [ ] Revisar logs de Vercel por errores
- [ ] Verificar logs de Supabase
- [ ] Monitorear primeros minutos de uso
- [ ] Verificar que no hay errores en consola del navegador

---

## 🎯 VERIFICACIÓN POST-DEPLOY

Después del deploy, verifica:

### URLs de Producción
- [ ] Aplicación principal: https://[tu-dominio].vercel.app
- [ ] Dashboard carga correctamente
- [ ] Login funciona
- [ ] Todas las rutas accesibles

### Funcionalidades Críticas
- [ ] Dashboard muestra KPIs (con caché funcionando)
- [ ] Operaciones lista con paginación
- [ ] Leads Kanban funciona
- [ ] Búsqueda global (Cmd+K) funciona
- [ ] Creación de operación funciona
- [ ] Validaciones funcionan (probar con datos inválidos)

### Performance
- [ ] Dashboard carga en < 2 segundos
- [ ] Listado de operaciones carga en < 1 segundo
- [ ] Paginación funciona correctamente
- [ ] No hay queries lentas

---

## 🚨 SI HAY PROBLEMAS

### Build Falla en Vercel
1. Revisar logs de build en Vercel
2. Verificar variables de entorno
3. Verificar que todas las dependencias están en `package.json`
4. Verificar TypeScript errors

### Aplicación No Funciona
1. Verificar variables de entorno
2. Verificar logs de runtime en Vercel
3. Revisar Supabase logs
4. Verificar que las migraciones se ejecutaron

### Errores en Consola
1. Abrir DevTools
2. Revisar errores en Console
3. Revisar errores en Network tab
4. Verificar que las APIs responden correctamente

---

## ✅ CHECKLIST FINAL

- [ ] Deploy completado en Vercel
- [ ] Migraciones SQL ejecutadas
- [ ] Variables de entorno configuradas
- [ ] Usuarios creados
- [ ] Trello configurado
- [ ] Datos migrados
- [ ] Testing básico completado
- [ ] Monitoreo activo

---

**Estado del Deploy:** ⏳ En progreso  
**Última actualización:** Diciembre 2025

---

## 🎉 ¡FELICITACIONES!

Si todos los checks pasan, **¡el sistema está en producción!** 🚀

