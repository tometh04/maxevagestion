# Documentación de Integración Trello

Esta carpeta contiene la documentación completa y scripts de mantenimiento para la integración de Trello que está funcionando perfectamente.

## 📚 Documentación

### `ESTADO_ACTUAL.md`
Documentación completa del estado actual de la integración, incluyendo:
- Arquitectura y componentes
- Configuración actual
- Flujos de sincronización
- Estructura de datos
- Reglas críticas
- Checklist de funcionamiento

**⚠️ IMPORTANTE**: Leer este documento antes de hacer cualquier modificación a la integración.

## 🔧 Scripts de Mantenimiento

### Health Check
Verifica que todos los componentes estén funcionando correctamente:

```bash
npx tsx scripts/trello-health-check.ts
```

**Qué verifica:**
- ✅ Configuración de agencias
- ✅ Configuración de Trello (API keys, tokens, board IDs)
- ✅ Webhooks registrados y activos
- ✅ Estructura de datos (leads)
- ✅ Endpoints API
- ✅ Última sincronización

**Salida:**
- `✅ OK`: Componente funcionando correctamente
- `⚠️ WARNING`: Advertencia, revisar antes de continuar
- `❌ ERROR`: Error crítico, la integración no está funcionando

### Restauración
Restaura la integración a su estado funcional si se rompe:

```bash
npx tsx scripts/trello-restore-integration.ts
```

**Qué hace:**
1. Verifica y restaura configuración de Trello en BD
2. Verifica y restaura webhooks en Trello
3. Crea webhooks nuevos si no existen
4. Actualiza información en BD

**Requisitos:**
- Variables de entorno `TRELLO_API_KEY` y `TRELLO_TOKEN` configuradas (opcional, usa BD si no están)
- Acceso a Supabase y Trello API

## 🚨 Si la Integración se Rompe

### Paso 1: Verificar Estado
```bash
npx tsx scripts/trello-health-check.ts
```

### Paso 2: Restaurar Integración
```bash
npx tsx scripts/trello-restore-integration.ts
```

### Paso 3: Verificar Nuevamente
```bash
npx tsx scripts/trello-health-check.ts
```

### Paso 4: Sincronización Manual (si es necesario)
```bash
npx tsx scripts/sync-both-agencies-complete.ts
```

## 📋 Checklist de Verificación Rápida

Para verificar rápidamente que todo funciona:

- [ ] Health check pasa sin errores
- [ ] Webhooks registrados y activos (ambas agencias)
- [ ] Sincronización manual funciona
- [ ] Sincronización rápida funciona (< 10 segundos)
- [ ] Webhooks en tiempo real funcionan (crear tarjeta → aparece lead)

## 🔍 Debugging

### Ver Logs de Webhook
- Vercel → Functions → `/api/trello/webhook`
- Buscar logs con prefijo `📥 ========== TRELLO WEBHOOK RECEIVED ==========`

### Verificar Webhooks Manualmente
```bash
npx tsx scripts/verify-trello-webhooks-status.ts
```

### Sincronización Manual Completa
```bash
npx tsx scripts/sync-both-agencies-complete.ts
```

## ⚠️ Advertencias Importantes

1. **NO MODIFICAR** la lógica de webhook sin probar exhaustivamente
2. **NO ELIMINAR** el filtrado por `agency_id` en queries de eliminación
3. **NO CAMBIAR** de `cards/open` a `cards/all` (solo tarjetas activas)
4. **NO MODIFICAR** la validación de `idList` (crítica para integridad)
5. **NO ELIMINAR** el retry logic con exponential backoff

## 📝 Notas

- Los webhooks pueden tardar 1-2 segundos en procesarse
- La sincronización completa puede tardar hasta 5 minutos
- La sincronización rápida tiene timeout de 8 segundos
- Máximo 2000 leads por agencia

---

**Última actualización**: 2024-12-XX  
**Mantenido por**: Sistema de documentación automática

