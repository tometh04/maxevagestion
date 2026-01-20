# 🔄 AFIP SDK - Pendiente de Implementación/Testing

**Fecha de creación:** 2025-01-19  
**Estado:** Implementación base completa, pendiente testing y mejoras

---

## ✅ Lo que ya está implementado

### 1. Configuración por Cliente desde UI
- ✅ Formulario completo con CUIT, Clave Fiscal, Punto de Venta
- ✅ Selección de ambiente (Sandbox/Producción)
- ✅ Endpoint `/api/integrations/afip/setup` funcional
- ✅ Validación de CUIT y permisos

### 2. Automatizaciones AFIP SDK
- ✅ Creación automática de certificados (dev y prod)
- ✅ Autorización automática de servicios web (WSFEV1)
- ✅ Función `setupAfipAutomatically` completa
- ✅ Polling de automatizaciones con timeout

### 3. Almacenamiento de Configuración
- ✅ Guardado en tabla `integrations` con JSONB
- ✅ Función `saveAfipConfigForAgency` implementada
- ✅ Función `getAfipConfigForAgency` para recuperar config
- ✅ Multi-agencia soportado

### 4. UI de Integraciones
- ✅ Página de integraciones (`/settings/integrations`)
- ✅ Formulario especial para AFIP
- ✅ Botón "Probar" conexión
- ✅ Listado de integraciones configuradas

### 5. Cliente AFIP SDK
- ✅ `lib/afip/afip-client.ts` - Cliente HTTP completo
- ✅ `lib/afip/types.ts` - Tipos TypeScript completos
- ✅ `lib/afip/afip-automations.ts` - Automatizaciones
- ✅ `lib/afip/afip-helpers.ts` - Helpers y config

---

## ⚠️ Pendiente de tu lado

### 1. Variable de Entorno en Vercel
**CRÍTICO - Sin esto no funciona nada**

1. Ve a [Vercel Dashboard](https://vercel.com)
2. Selecciona tu proyecto
3. Ve a **Settings** → **Environment Variables**
4. Agrega:
   ```
   AFIP_SDK_API_KEY=tu_api_key_aqui
   ```
5. **Redeploy** el proyecto después de agregar la variable

### 2. Cuenta de AFIP SDK
1. Crear cuenta en [afipsdk.com](https://afipsdk.com)
2. Plan Free: 1 CUIT, 1,000 requests/mes (suficiente para testing)
3. Obtener API Key desde el dashboard
4. Guardar la API Key de forma segura

---

## 🔧 Pendiente de mi lado

### 1. Testing Completo del Flujo
- [ ] Probar creación de certificado de desarrollo
- [ ] Probar autorización de servicio web
- [ ] Probar guardado y recuperación de configuración
- [ ] Probar creación de facturas con la config guardada
- [ ] Probar autorización de facturas
- [ ] Probar manejo de errores (CUIT inválido, password incorrecto, etc.)

### 2. Verificación de Seguridad
- [ ] Confirmar que las Claves Fiscales se guardan encriptadas
- [ ] Confirmar que los certificados/keys se guardan de forma segura
- [ ] Revisar encriptación en `saveAfipConfigForAgency`
- [ ] Verificar que no se expongan datos sensibles en logs

### 3. Manejo de Errores Mejorado
- [ ] Mejorar mensajes de error cuando falla creación de certificados
- [ ] Mejorar manejo de timeouts en automatizaciones
- [ ] Agregar retry logic si es necesario
- [ ] Mensajes de error más descriptivos para el usuario

### 4. Verificación de Facturación
- [ ] Verificar que `/api/invoices/[id]/authorize` use la config correcta
- [ ] Verificar que se obtenga el TA (Ticket de Acceso) correctamente
- [ ] Verificar que las facturas se creen y autoricen correctamente
- [ ] Probar diferentes tipos de comprobantes (A, B, C)

### 5. Mejoras de UX
- [ ] Agregar indicador de progreso durante configuración
- [ ] Mostrar pasos de configuración (creando certificado, autorizando servicio, etc.)
- [ ] Mejorar feedback visual durante el proceso
- [ ] Agregar tooltips explicativos en el formulario

---

## 📋 Archivos Relevantes

### Backend
- `app/api/integrations/afip/setup/route.ts` - Endpoint de configuración
- `app/api/integrations/[id]/test/route.ts` - Endpoint de testing
- `app/api/invoices/[id]/authorize/route.ts` - Autorización de facturas
- `lib/afip/afip-client.ts` - Cliente HTTP
- `lib/afip/afip-automations.ts` - Automatizaciones
- `lib/afip/afip-helpers.ts` - Helpers
- `lib/afip/afip-config.ts` - Configuración y validación

### Frontend
- `components/integrations/integrations-page-client.tsx` - UI de integraciones
- `app/(dashboard)/settings/integrations/page.tsx` - Página de integraciones

### Documentación
- `docs/GUIA_AFIP_SDK.md` - Guía completa de uso
- `docs/AFIP_SDK_PENDIENTE.md` - Este documento

---

## 🚀 Próximos Pasos

1. **Configurar API Key en Vercel** (TÚ)
   - Sin esto, nada funciona
   - Una vez configurado, redeploy

2. **Testing Inicial** (YO)
   - Probar flujo completo de configuración
   - Identificar bugs y errores
   - Corregir problemas encontrados

3. **Mejoras de Seguridad** (YO)
   - Verificar encriptación de datos sensibles
   - Revisar logs para evitar exposición de datos

4. **Testing de Facturación** (YO)
   - Probar creación y autorización de facturas
   - Verificar diferentes tipos de comprobantes

5. **Mejoras de UX** (YO)
   - Agregar indicadores de progreso
   - Mejorar mensajes de error
   - Agregar tooltips y ayuda

---

## 📝 Notas Importantes

- La API Key de AFIP SDK es **global del sistema**, no por cliente
- Cada cliente solo necesita proporcionar CUIT y Clave Fiscal
- El sistema maneja automáticamente certificados y autorizaciones
- Los certificados se crean automáticamente vía automatizaciones de AFIP SDK
- En sandbox se puede usar CUIT de prueba sin certificado propio
- En producción se requiere certificado real creado con Clave Fiscal

---

## 🔗 Recursos

- **Documentación AFIP SDK**: [https://docs.afipsdk.com](https://docs.afipsdk.com)
- **Automatizaciones**: [https://afipsdk.com/docs/automations/integrations/api](https://afipsdk.com/docs/automations/integrations/api)
- **AFIP Clave Fiscal**: [https://www.afip.gob.ar/claveFiscal/](https://www.afip.gob.ar/claveFiscal/)
- **Dashboard AFIP SDK**: [https://afipsdk.com](https://afipsdk.com)

---

**Última actualización:** 2025-01-19
