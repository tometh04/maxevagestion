# Migración: Agregar Campo trello_full_data

Esta migración agrega un campo JSONB a la tabla `leads` para guardar TODA la información completa de Trello, incluyendo:

- Custom Fields (campos personalizados)
- Checklists completos con estados
- Attachments con URLs
- Comments/Actions (comentarios y cambios)
- Labels completos
- Members asignados
- Due dates y fechas importantes
- Badges (contadores)
- Información del Board y List

## Ejecutar la Migración

### Opción 1: Desde Supabase Dashboard

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Navega a **SQL Editor**
3. Copia y pega el contenido de `supabase/migrations/022_add_trello_full_data.sql`
4. Ejecuta la query

### Opción 2: Desde la línea de comandos

```bash
# Asegúrate de tener las credenciales de Supabase configuradas
psql $DATABASE_URL -f supabase/migrations/022_add_trello_full_data.sql
```

## Verificación

Después de ejecutar la migración, verifica que el campo se haya creado correctamente:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'leads' AND column_name = 'trello_full_data';
```

Deberías ver:
- `column_name`: `trello_full_data`
- `data_type`: `jsonb`

## Sincronización Automática

Una vez que la migración esté aplicada, la próxima vez que:

1. Se reciba un webhook de Trello
2. Se ejecute una sincronización manual

El sistema automáticamente guardará TODA la información de Trello en el campo `trello_full_data`.

## Visualización

La información completa de Trello se mostrará automáticamente en el diálogo de detalles del lead cuando:

- El lead tenga `source = 'Trello'`
- El lead tenga `trello_full_data` con información

Se mostrarán:
- ✅ Checklists con progreso
- 📎 Attachments con enlaces
- 🏷️ Custom Fields
- 🏷️ Labels con colores
- 👥 Members asignados
- 💬 Comments recientes

## Notas Importantes

- El campo `trello_full_data` es opcional (puede ser NULL)
- Solo se llena para leads que vienen de Trello
- Se actualiza automáticamente cada vez que se sincroniza la tarjeta
- Los datos se guardan tal cual vienen de la API de Trello
- El índice GIN permite búsquedas rápidas en el JSONB

