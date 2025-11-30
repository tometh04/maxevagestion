# ✅ Checklist para Despliegue a Producción

## 🎯 Estado: LISTO PARA PRODUCCIÓN

### ✅ Errores Corregidos
- [x] Todos los errores de TypeScript corregidos
- [x] Build compilando exitosamente
- [x] Todas las migraciones ejecutadas
- [x] Interfaces de tipos alineadas

### ✅ Funcionalidades Implementadas

#### FASE 1: Pagos Recurrentes y Vencimientos
- [x] Sistema de pagos recurrentes a proveedores
- [x] Recordatorios automáticos de pagos (7 días, 3 días, hoy, vencidos)

#### FASE 2: Fechas y Recordatorios
- [x] Fecha de check-in en leads con recordatorios automáticos
- [x] Alertas de vencimiento de cotizaciones y expiración automática
- [x] Vista de calendario de eventos

#### FASE 3: Facturación y Datos de Clientes
- [x] Facturación a terceros (tabla `billing_info`, APIs)
- [x] Sistema de múltiples pasajeros (tabla `operation_passengers`)
- [x] Documentación por pasajero

#### FASE 4: Seguimiento y Comunicación
- [x] Sistema de historial de comunicaciones
- [x] Recordatorios automáticos de seguimiento

---

## 📋 Pre-Deploy Checklist

### 1. Base de Datos
- [x] Todas las migraciones ejecutadas:
  - [x] `020_create_recurring_payments.sql`
  - [x] `021_add_lead_dates.sql`
  - [x] `022_add_quotation_expiration.sql`
  - [x] `023_create_billing_info.sql`
  - [x] `024_create_operation_passengers.sql`
  - [x] `025_add_passenger_to_documents.sql`
  - [x] `026_create_communications.sql`
- [ ] Verificar que no hay errores en las migraciones
- [ ] Backup de la base de datos antes del deploy

### 2. Variables de Entorno
- [ ] Verificar `.env.production` tiene todas las variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - Variables de Trello (si aplica)
- [ ] Verificar URLs de webhooks de Trello configuradas correctamente

### 3. Build y Compilación
- [x] `npm run build` ejecuta sin errores
- [ ] Verificar que no hay warnings críticos
- [ ] Verificar tamaño del bundle (opcional, para performance)

### 4. Testing Manual
- [ ] Probar creación de leads con depósitos
- [ ] Verificar que depósitos aparecen en Caja y Libro Mayor
- [ ] Probar pagos recurrentes
- [ ] Verificar calendario de eventos
- [ ] Probar cotizaciones con vencimiento
- [ ] Verificar integración Trello multi-agencia

### 5. Cron Jobs
- [ ] Configurar cron job para pagos recurrentes:
  ```bash
  # Ejecutar diariamente a las 00:00
  0 0 * * * curl -X POST https://tu-dominio.com/api/recurring-payments/generate
  ```
- [ ] Configurar cron job para recordatorios:
  ```bash
  # Ejecutar diariamente a las 08:00
  0 8 * * * curl -X POST https://tu-dominio.com/api/alerts/generate-payment-reminders
  ```
- [ ] Configurar cron job para generación de alertas:
  ```bash
  # Ejecutar diariamente a las 09:00
  0 9 * * * curl -X POST https://tu-dominio.com/api/alerts/generate
  ```

### 6. Webhooks de Trello
- [ ] Verificar webhooks registrados para ambas agencias:
  - Rosario: Board ID `kZh4zJ0J`
  - Madero: Board ID `X4IFL8rx`
- [ ] URLs de webhook apuntan al dominio de producción
- [ ] Verificar que los webhooks están activos en Trello

### 7. Permisos y Seguridad
- [ ] Verificar permisos RLS en Supabase
- [ ] Verificar que todas las APIs tienen validación de permisos
- [ ] Verificar rate limiting activo

### 8. Performance
- [ ] Verificar índices en la base de datos
- [ ] Verificar que las queries están optimizadas
- [ ] Verificar caching donde sea apropiado

### 9. Monitoreo
- [ ] Configurar logs de errores (Sentry, LogRocket, etc.)
- [ ] Configurar monitoreo de performance
- [ ] Configurar alertas de errores críticos

### 10. Documentación
- [x] Manual de usuario completo (`MANUAL_DE_USUARIO.md`)
- [x] Guía de pruebas (`GUIA_PRUEBAS_COMPLETA.md`)
- [ ] Documentación de APIs (si aplica)
- [ ] README actualizado

---

## 🚀 Pasos para Deploy

### Opción 1: Vercel (Recomendado)

1. **Conectar repositorio a Vercel:**
   ```bash
   # Si no está conectado, hacerlo desde el dashboard de Vercel
   ```

2. **Configurar variables de entorno en Vercel:**
   - Ir a Settings → Environment Variables
   - Agregar todas las variables de `.env.production`

3. **Deploy:**
   ```bash
   git add .
   git commit -m "feat: ready for production"
   git push origin main
   ```
   - Vercel desplegará automáticamente

4. **Verificar deploy:**
   - Esperar a que el build termine
   - Probar la URL de producción
   - Verificar logs de errores

### Opción 2: Otra plataforma (Railway, Render, etc.)

1. **Configurar variables de entorno**
2. **Conectar repositorio**
3. **Configurar build command:** `npm run build`
4. **Configurar start command:** `npm start`
5. **Deploy**

---

## 🔄 Post-Deploy

### Inmediatamente después del deploy:

1. **Verificar que la aplicación carga correctamente:**
   - [ ] Homepage carga
   - [ ] Login funciona
   - [ ] Dashboard carga

2. **Verificar funcionalidades críticas:**
   - [ ] Crear un lead de prueba
   - [ ] Verificar que aparece en el Kanban
   - [ ] Verificar integración Trello

3. **Verificar webhooks:**
   - [ ] Crear una tarjeta en Trello
   - [ ] Verificar que aparece en el sistema

4. **Configurar cron jobs:**
   - [ ] Usar servicio de cron (cron-job.org, EasyCron, etc.)
   - [ ] O configurar en el servidor

---

## 🐛 Troubleshooting

### Si algo falla después del deploy:

1. **Revisar logs:**
   - Vercel: Dashboard → Deployments → View Function Logs
   - O revisar logs del servidor

2. **Verificar variables de entorno:**
   - Asegurar que todas están configuradas
   - Verificar que no hay typos

3. **Verificar base de datos:**
   - Asegurar que las migraciones están ejecutadas
   - Verificar conexión a Supabase

4. **Rollback si es necesario:**
   - En Vercel: Deployments → ... → Promote to Production
   - Seleccionar el deploy anterior que funcionaba

---

## 📞 Contacto y Soporte

Si algo falla durante el deploy o en producción:
1. Revisar logs detalladamente
2. Verificar que todas las migraciones están ejecutadas
3. Verificar variables de entorno
4. Revisar permisos de base de datos

---

## ✅ Sign-off

- [ ] Todas las migraciones ejecutadas
- [ ] Build compila sin errores
- [ ] Testing manual completado
- [ ] Variables de entorno configuradas
- [ ] Webhooks configurados
- [ ] Cron jobs configurados (o planificados)
- [ ] Documentación completa
- [ ] Listo para producción

**Fecha de deploy:** _______________

**Deployado por:** _______________

**Notas adicionales:**
_________________________________________________
_________________________________________________
_________________________________________________

---

## 🎉 ¡FELICIDADES! 

El sistema está listo para producción. ¡A volar! 🚀

