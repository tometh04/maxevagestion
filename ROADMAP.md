# 🚀 ROADMAP - MAXEVA GESTIÓN

**Última actualización:** Diciembre 2025  
**Estado general:** ✅ Sistema funcional en producción

---

## 📋 TAREAS PENDIENTES

### ⚠️ Configuración Inicial (Acción Manual Requerida)

#### Datos
- [ ] Limpiar seed data (preservar Trello leads)
- [ ] Cargar operaciones abiertas reales
- [ ] Configurar saldos iniciales de caja
- [ ] Importar clientes reales
- [ ] Cargar operadores

#### Usuarios
- [ ] Crear usuario Maxi (SUPER_ADMIN)
- [ ] Crear usuario Yamil (CONTABLE)
- [ ] Crear usuarios vendedoras (SELLER)
- [ ] Asignar usuarios a sus agencias correspondientes

#### Configuración

**Variables de Entorno en Vercel (Producción):**
- [ ] `NEXT_PUBLIC_SUPABASE_URL` - URL del proyecto de Supabase
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Clave pública/anónima de Supabase
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Clave de servicio de Supabase (⚠️ secreta)
- [ ] `OPENAI_API_KEY` - API Key de OpenAI (para OCR y AI Copilot)
- [ ] `TRELLO_API_KEY` - API Key de Trello
- [ ] `TRELLO_TOKEN` - Token de Trello
- [ ] `RESEND_API_KEY` - API Key de Resend (para envío de emails, opcional)
- [ ] `RESEND_FROM_EMAIL` - Email remitente para Resend (opcional, tiene valor por defecto)
- [ ] `CRON_SECRET` - Secreto para proteger endpoints de cron (opcional pero recomendado)
- [ ] `WEBHOOK_URL` o `NEXT_PUBLIC_WEBHOOK_URL` - URL pública del webhook (ej: https://erplozada.vercel.app)

**Integración Trello:**
- [x] Trello configurado para ambas agencias (Rosario + Madero)
- [x] Webhooks de Trello registrados en producción
- [x] Mapeo de listas configurado para ambas agencias
- [x] Sincronización en tiempo real funcionando

**Verificaciones Post-Deploy:**
- [ ] Verificar que todos los endpoints API responden correctamente
- [ ] Probar sincronización de Trello (crear/mover/archivar una card)
- [ ] Verificar que AI Copilot funciona (probar una consulta)
- [ ] Verificar que OCR de documentos funciona (subir un documento)
- [ ] Verificar que los cron jobs se ejecutan correctamente (si están configurados)

---

## 🔮 MEJORAS FUTURAS (No Bloqueantes)

### Funcionalidades
- [ ] Recalcular movimientos contables automáticamente al cambiar moneda
- [ ] Actualizar exchange rates automáticamente
- [ ] Recalcular balances automáticamente
- [ ] Exportación PDF/Excel de reportes financieros

### Optimizaciones
- [x] Validación de permisos en todos los endpoints (revisión exhaustiva)
- [ ] Mejoras en performance para datasets muy grandes (>10k operaciones)

### UX/UI
- [x] Breadcrumbs en todas las páginas
- [ ] Timeline de operaciones con notas
- [ ] Historial de comunicación con clientes
- [ ] Mejoras en AI Copilot (historial, sugerencias proactivas)

---

## ✅ COMPLETADO

- ✅ Todas las funcionalidades core implementadas
- ✅ Performance optimizada (paginación, caché, índices)
- ✅ Integración Trello completa con sincronización en tiempo real
- ✅ Validaciones robustas
- ✅ Manejo de edge cases
- ✅ Búsqueda global
- ✅ AI Copilot con contexto completo
- ✅ Sistema de permisos y roles
- ✅ Documentación técnica completa
- ✅ Validación exhaustiva de permisos en todos los endpoints API
- ✅ Breadcrumbs implementados en todas las páginas principales

---

**Nota:** El sistema está listo para uso en producción. Las tareas pendientes son principalmente configuración inicial y mejoras no bloqueantes.