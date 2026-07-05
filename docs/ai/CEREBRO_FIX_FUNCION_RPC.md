# 🔴 FIX CRÍTICO: Función RPC `execute_readonly_query` para Cerebro

## Problema Identificado

**Error:** `function execute_readonly_query(text) does not exist`

**Causa Raíz:** La migración `061_create_ai_query_function.sql` no se ha ejecutado en la base de datos de producción.

**Impacto:** Cerebro no puede ejecutar queries SQL, por lo que NO puede consultar datos reales y solo responde con información genérica.

---

## Verificación del Problema

### 1. Verificar si la función existe

Ejecuta en Supabase SQL Editor:

```sql
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc 
WHERE proname = 'execute_readonly_query';
```

**Si no devuelve resultados:** La función NO existe → Necesitas ejecutar la migración.

**Si devuelve resultados:** La función existe → El problema es otro (permisos, RLS, etc.).

---

## Solución: Ejecutar Migración 061

### Opción 1: Ejecutar Migración Manualmente (RECOMENDADO)

1. Ve a **Supabase Dashboard** → **SQL Editor**
2. Copia el contenido completo de: `supabase/migrations/061_create_ai_query_function.sql`
3. Pega y ejecuta en el SQL Editor
4. Verifica que no haya errores

### Opción 2: Verificar Estado de Migraciones

Si usas Supabase CLI, verifica el estado:

```bash
supabase migration list
```

Si la migración `061_create_ai_query_function.sql` no aparece como aplicada, ejecútala:

```bash
supabase migration up
```

---

## Código de la Migración

La migración completa está en: `supabase/migrations/061_create_ai_query_function.sql`

**Resumen de la función:**

```sql
CREATE OR REPLACE FUNCTION execute_readonly_query(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
-- Validaciones de seguridad:
-- 1. Solo permite SELECT
-- 2. Previene comandos peligrosos (DROP, DELETE, INSERT, UPDATE, etc.)
-- 3. Previene múltiples statements (SQL injection)
-- 4. Retorna JSONB con resultados
-- 5. Manejo de errores robusto
$$;

GRANT EXECUTE ON FUNCTION execute_readonly_query(TEXT) TO authenticated;
```

---

## Verificación Post-Fix

### 1. Verificar que la función existe

```sql
SELECT proname, pg_get_function_arguments(oid) 
FROM pg_proc 
WHERE proname = 'execute_readonly_query';
```

**Resultado esperado:**
```
execute_readonly_query | query_text text
```

### 2. Probar la función manualmente

```sql
SELECT execute_readonly_query('SELECT COUNT(*) as total FROM operations');
```

**Resultado esperado:**
```json
[{"total": 123}]
```

### 3. Probar desde Cerebro

1. Ve a **Cerebro** en la aplicación
2. Pregunta: "¿Cuántas operaciones hay?"
3. **Debería responder con el número real** en lugar de "No pude obtener esa información"

---

## Diferencias con Función Propuesta

### Función Existente (Migración 061) - ✅ MEJOR

**Ventajas:**
- ✅ Usa **regex** para validar comandos peligrosos (más preciso)
- ✅ Valida **múltiples statements** (previene SQL injection)
- ✅ Detecta queries lentas (>10 segundos) con warnings
- ✅ Validación más robusta de seguridad
- ✅ Manejo de errores más completo

**Ejemplo de validación regex:**
```sql
IF normalized_query ~ '\m(DROP|DELETE|INSERT|UPDATE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|CALL)\M' THEN
  RAISE EXCEPTION 'Comandos peligrosos no permitidos';
END IF;
```

### Función Propuesta (Alternativa Simple)

**Desventajas:**
- ⚠️ Usa `LIKE` en lugar de regex (menos preciso)
- ⚠️ No valida múltiples statements tan robustamente
- ⚠️ No tiene warnings de performance

**Ejemplo de validación LIKE:**
```sql
IF normalized_query LIKE '%INSERT%' OR normalized_query LIKE '%UPDATE%' THEN
  RAISE EXCEPTION 'Comandos peligrosos no permitidos';
END IF;
```

**Problema:** `LIKE '%INSERT%'` puede fallar con queries como:
```sql
SELECT * FROM operations WHERE notes LIKE '%INSERT INTO...'
```

---

## Conclusión

✅ **Tu análisis es 100% correcto** sobre el problema y el flujo de ejecución.

✅ **La solución ya existe** y es mejor que la propuesta (migración 061).

❌ **El problema real:** La migración no se ejecutó en producción.

**Acción requerida:**
1. Ejecutar la migración `061_create_ai_query_function.sql` en producción
2. Verificar que la función existe
3. Probar que Cerebro funciona correctamente

---

## Checklist de Verificación

- [ ] Migración 061 ejecutada en producción
- [ ] Función `execute_readonly_query` existe (verificar con SQL)
- [ ] Función retorna resultados correctamente (probar manualmente)
- [ ] Permisos correctos (`GRANT EXECUTE` a `authenticated`)
- [ ] Cerebro puede ejecutar queries (probar con pregunta simple)
- [ ] No hay errores en logs de Supabase

---

## Referencias

- **Migración:** `supabase/migrations/061_create_ai_query_function.sql`
- **Código que la usa:** `app/api/ai/route.ts` línea 532
- **Documentación:** `docs/AI_COMPANION_REVISION_COMPLETA.md`
