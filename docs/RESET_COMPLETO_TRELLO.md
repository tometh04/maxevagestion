# Reset Completo de Trello - Importación Masiva

Este documento explica cómo hacer un reset completo: borrar todos los leads e importar TODO desde Trello.

## ⚠️ ADVERTENCIA

Este proceso **BORRARÁ TODOS LOS LEADS** de la base de datos y los reimportará desde Trello. Asegúrate de tener un backup si es necesario.

## Pasos para Reset Completo

### 1. Obtener el Agency ID

Primero, necesitas saber el ID de la agencia:

```bash
npx tsx scripts/list-agencies.ts
```

Esto mostrará todas las agencias con sus IDs.

### 2. Ejecutar Reset Completo

Ejecuta el script maestro que hace todo automáticamente:

```bash
npx tsx scripts/full-trello-reset.ts <agencyId>
```

**Ejemplo:**
```bash
npx tsx scripts/full-trello-reset.ts 123e4567-e89b-12d3-a456-426614174000
```

### 3. ¿Qué hace el script?

1. **Borra TODOS los leads** de la base de datos
2. **Verifica el webhook** de Trello (para actualización en tiempo real)
3. **Importa TODAS las cards** del board de Trello
4. **Actualiza el checkpoint** para futuras sincronizaciones incrementales

### 4. Configurar Webhook (si no está configurado)

Si el script detecta que no hay webhook activo, ejecuta:

```bash
npx tsx scripts/register-trello-webhooks-production.ts https://maxevagestion.vercel.app
```

Reemplaza la URL con tu URL de producción.

## Scripts Individuales (si prefieres hacerlo paso a paso)

### Borrar todos los leads

```bash
npx tsx scripts/clear-all-leads.ts
```

### Importación masiva

```bash
npx tsx scripts/mass-import-trello.ts <agencyId>
```

## Verificación

Después del proceso:

1. Verifica en Supabase que tienes todos los leads
2. Verifica en la UI que se muestran todos los leads
3. Prueba crear/modificar una card en Trello y verifica que se actualiza en tiempo real

## Troubleshooting

### Error: "No hay configuración de Trello"
- Asegúrate de haber configurado Trello en Settings → Trello Settings

### Error: "Rate limit exceeded"
- El script maneja rate limits automáticamente, pero si persiste, espera unos minutos y vuelve a ejecutar

### No se ven todos los leads en la UI
- Verifica que el límite del API esté configurado correctamente (ahora es 10000)
- Recarga la página
- Verifica los filtros aplicados

## Notas

- El proceso puede tardar varios minutos dependiendo de la cantidad de cards
- El script muestra progreso cada 100 cards
- Los errores individuales no detienen el proceso completo
- El checkpoint se actualiza automáticamente al finalizar

