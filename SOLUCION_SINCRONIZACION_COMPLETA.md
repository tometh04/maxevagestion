# 🔄 Solución: Sincronización Completa de Trello

## Problema
Tienes solo 3 leads en el sistema pero 50+ en Trello. Esto ocurre porque:
- Los **webhooks solo sincronizan cambios nuevos** (no datos históricos)
- La **sincronización inicial** nunca se ejecutó o fue parcial
- Algunos cards pueden no tener miembros asignados correctamente

## Solución: Sincronización Completa Forzada

### Opción 1: Desde la Interfaz (Recomendado)

1. **Ve a Settings → Trello**
2. **Selecciona la agencia** (Rosario)
3. **Ve a la pestaña "Sync"**
4. **Marca el checkbox "Forzar sincronización completa"**
5. **Click en "Ejecutar Sincronización Completa"**
6. **Espera** (puede tardar varios minutos si hay muchos cards)

### Opción 2: Script de Sincronización Masiva

Si prefieres usar un script para más control:

```bash
# Sincronizar todas las cards de Rosario
npx tsx scripts/mass-import-trello.ts <AGENCY_ID_ROSARIO>
```

**Para obtener el Agency ID:**
```sql
-- Ejecutar en Supabase SQL Editor
SELECT id, name FROM agencies;
```

### Opción 3: API Directa

Puedes llamar directamente a la API con `forceFullSync: true`:

```bash
curl -X POST https://[tu-dominio]/api/trello/sync \
  -H "Content-Type: application/json" \
  -d '{"agencyId": "<AGENCY_ID>", "forceFullSync": true}'
```

## Verificación Post-Sincronización

### 1. Verificar Total de Leads

```sql
-- Ver total de leads de Trello por agencia
SELECT 
  agency_id,
  COUNT(*) as total_leads,
  COUNT(CASE WHEN assigned_seller_id IS NOT NULL THEN 1 END) as con_seller,
  COUNT(CASE WHEN assigned_seller_id IS NULL THEN 1 END) as sin_seller
FROM leads
WHERE source = 'Trello'
GROUP BY agency_id;
```

### 2. Verificar Leads de Maximiliano

```sql
-- Ver leads asignados a Maximiliano
SELECT 
  l.id,
  l.contact_name,
  l.status,
  l.destination,
  u.name as seller_name
FROM leads l
LEFT JOIN users u ON l.assigned_seller_id = u.id
WHERE u.name ILIKE '%maximiliano%'
  AND l.source = 'Trello'
ORDER BY l.updated_at DESC;
```

### 3. Verificar Cards sin Seller Asignado

Si hay cards en Trello que no tienen miembros asignados, aparecerán como `assigned_seller_id = NULL`. Puedes asignarlos manualmente después.

## Problemas Comunes y Soluciones

### Problema: Sincronización se detiene a mitad

**Causa:** Rate limits de Trello API

**Solución:**
- El script tiene retry logic incorporado
- Si se detiene, simplemente vuelve a ejecutarlo
- Los leads ya sincronizados se actualizarán (no se duplicarán)

### Problema: Cards no se asignan a Maximiliano

**Causa:** El nombre del miembro en Trello no coincide con el nombre del seller en la BD

**Solución:**
1. Verificar el nombre exacto del miembro en Trello
2. Verificar el nombre exacto del seller en la BD:
   ```sql
   SELECT id, name, email FROM users WHERE role IN ('SELLER', 'ADMIN', 'SUPER_ADMIN') AND is_active = true;
   ```
3. Si no coinciden, el sistema intenta matching parcial pero puede fallar
4. Puedes asignar manualmente después desde la interfaz

### Problema: Algunos cards no aparecen

**Causa:** 
- Cards en listas no mapeadas
- Cards archivados
- Cards sin `idList`

**Solución:**
- Verificar que todas las listas estén mapeadas en Settings → Trello → Status Mapping
- El sistema sincroniza cards archivados también
- Cards sin `idList` se saltan (error en Trello)

## Después de la Sincronización

1. ✅ **Verifica que todos los leads aparecen** en Sales → Leads
2. ✅ **Filtra por Maximiliano** y verifica que aparecen sus leads
3. ✅ **Asigna manualmente** los leads que no tienen seller asignado
4. ✅ **Los webhooks seguirán funcionando** para cambios futuros

## Nota Importante

- La sincronización completa puede tardar **varios minutos** si hay muchos cards
- El sistema procesa en batches para evitar rate limits
- Los leads ya existentes se **actualizan** (no se duplican)
- Después de la sincronización, los webhooks seguirán funcionando normalmente

