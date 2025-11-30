# Análisis de Limpieza del Proyecto

## 📋 Archivos a Eliminar

### 1. Scripts de Migración/Verificación (Ya Ejecutados) ❌
- `scripts/add-webhook-columns.ts` - Migración ya ejecutada
- `scripts/check-leads.ts` - Script de verificación temporal
- `scripts/check-trello-list-ids.ts` - Script de verificación temporal
- `scripts/check-user-data.ts` - Script de verificación temporal
- `scripts/check-user.ts` - Script de verificación temporal
- `scripts/configure-trello-mapping.ts` - Configuración ya realizada
- `scripts/create-tables.ts` - Migración ya ejecutada
- `scripts/create-users-table.ts` - Migración ya ejecutada
- `scripts/delete-mockup-leads.ts` - Script temporal
- `scripts/execute-migration.ts` - Helper ya no necesario
- `scripts/execute-migrations-phase1.ts` - Migración ya ejecutada
- `scripts/execute-sql-direct.ts` - Helper temporal
- `scripts/fix-seed.ts` - Fix temporal ya aplicado
- `scripts/map-trello-members-to-sellers.ts` - Script temporal
- `scripts/register-webhook-manual.ts` - Ya no necesario (hay API route)
- `scripts/run-migration.ts` - Helper duplicado
- `scripts/run-phase1-migrations.ts` - Migración ya ejecutada
- `scripts/show-phase1-migrations.ts` - Script de verificación temporal
- `scripts/sync-trello-complete.ts` - Versión antigua (v2 es la actual)
- `scripts/test-complete-flow.ts` - Test temporal
- `scripts/test-mark-paid-endpoint.ts` - Test temporal
- `scripts/test-mark-paid.ts` - Test temporal
- `scripts/update-webhook-db.ts` - Migración ya ejecutada
- `scripts/verify-phase1-migrations.ts` - Verificación ya realizada
- `scripts/verify-sync.ts` - Verificación temporal
- `scripts/verify-tables.ts` - Verificación temporal

### 2. Documentación de Migraciones (Ya Ejecutadas) ❌
- `EJECUTAR_MIGRACIONES_FASE1.md` - Migración completada
- `EJECUTAR_MIGRACIONES_FASE2.md` - Migración completada
- `EJECUTAR_MIGRACIONES_FASE4.md` - Migración completada
- `EJECUTAR_MIGRACION_COMISIONES.md` - Migración completada
- `EJECUTAR_MIGRACION_ROLES.md` - Migración completada
- `EJECUTAR_MIGRACION_TRELLO_LIST_ID.md` - Migración completada
- `EJECUTAR_MIGRACION_TRELLO_SOURCE.md` - Migración completada
- `EJECUTAR_MIGRACION_WEBHOOKS.md` - Migración completada
- `EJECUTAR_SQL.md` - Instrucciones ya ejecutadas
- `migraciones_fase1.sql` - SQL ya ejecutado

### 3. Archivos de Coverage (No deberían estar en repo) ❌
- `coverage/` - Todo el directorio (debería estar en .gitignore)

### 4. Archivos de Build Info ❌
- `tsconfig.tsbuildinfo` - Cache de TypeScript (debería estar en .gitignore)

### 5. Componentes Potencialmente No Usados ⚠️
- `components/sales/leads-kanban.tsx` - Verificar si se usa (parece que solo se usa leads-kanban-trello.tsx)

### 6. API Routes Potencialmente No Usadas ⚠️
- `app/api/trello/test-connection/route.ts` - Verificar si se usa en frontend
- `app/api/trello/webhooks/route.ts` - Verificar si se usa
- `app/api/trello/webhooks/register/route.ts` - Verificar si se usa

## ✅ Archivos a Mantener

### Scripts Útiles ✅
- `scripts/seed-mock-data.ts` - Útil para desarrollo
- `scripts/seed.ts` - Útil para desarrollo
- `scripts/sync-trello-complete-v2.ts` - Versión actual de sync
- `scripts/migrate-historical-accounting-data.ts` - Útil para migraciones futuras

### Documentación Útil ✅
- `README.md` - Documentación principal
- `roadmap.md` - Roadmap del proyecto
- `prompt.md` - Prompt del proyecto
- `prompt_contable.md` - Prompt contable
- `.cursor/` - Documentación de desarrollo

## 📊 Resumen

- **Scripts a eliminar**: ~25 archivos
- **Documentación obsoleta**: ~10 archivos
- **Archivos de build/cache**: 2 directorios/archivos
- **Total aproximado**: ~37 archivos/directorios

## 🎯 Impacto Esperado

- Reducción de tamaño del proyecto
- Navegación más rápida
- Código más limpio y mantenible
- Menos confusión sobre qué archivos usar
