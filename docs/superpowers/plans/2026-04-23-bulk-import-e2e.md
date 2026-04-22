# Bulk Import — E2E Smoke Checklist

Ejecutar en staging o con org de test en prod. Cada bloque debe verificar el flow end-to-end.

## Pre-requisitos

- [ ] Migration 161 aplicada en Supabase prod (ya corrida 2026-04-22).
- [ ] Deploy Railway OK (commits pusheados).
- [ ] Org de test con un user ORG_OWNER logueado.

## Tests por entidad

### Agencies
- [ ] Descargar plantilla → CSV tiene headers exactos + 2 filas.
- [ ] Completar con 3 filas nuevas → subir → preview muestra 3 OK.
- [ ] Importar → toast "3 insertadas".
- [ ] Verificar en `/settings/agencies` las 3 filas con `org_id = user.org_id`.
- [ ] Re-subir mismo CSV → "0 insertadas, 3 duplicadas omitidas".

### Financial accounts
- [ ] Plantilla → agregar 2 cuentas, una con `agency_name = "Rosario"` (existente).
- [ ] Subir con `agency_name = "NoExiste"` → error 400 "FK no resueltas".
- [ ] Subir con `type = FOO` → preview marca Error en esa fila, botón Importar disabled.
- [ ] Subir CSV válido → importar → modal "Saldos iniciales" → confirmar → 2 insertadas.

### Customers
- [ ] CSV con 5 clientes, 2 con mismo `document_number` → preview marca error en 1 fila por dedupe intra-CSV.
- [ ] Corregir → re-subir → 5 insertadas.
- [ ] Re-subir mismo CSV → "0 insertadas, 5 duplicadas" (dedupe por DNI via EXISTS).

### Operators
- [ ] Subir 3 operators, uno con CUIT duplicado vs fila existente → reportado como conflict.
- [ ] Subir 1 operator con mismo `name` que existente → conflict (UNIQUE por org_id,name).

### Users
- [ ] CSV con 2 emails nuevos + agency_name existente.
- [ ] Subir → modal "Confirmar invitación" → confirmar.
- [ ] 2 emails reciben link de invitación Supabase Auth.
- [ ] `/settings/users` muestra los 2 con status "Invited" (pending password).
- [ ] Response incluye `invites_sent: 2, invites_failed: []`.

### Operations
- [ ] CSV con 3 ops, una con `seller_email` inexistente → error 400 FK.
- [ ] Corregir → 3 insertadas.
- [ ] Verificar `operation_customers` tiene una fila por cada operation con `role='primary'` apuntando al `customer_document` provisto.

### Payments
- [ ] CSV con 2 pagos sobre operations existentes → insertadas.
- [ ] Pago sobre `operation_file_code = "NoExiste"` → error 400 FK.
- [ ] Re-subir mismo CSV → 0 insertadas (dedupe por composite key via EXISTS).

### Cash movements
- [ ] CSV con 50 movimientos apuntando a cuenta existente → chunk único (sync).
- [ ] Todos insertados con `user_id = <usuario logueado>`.
- [ ] Re-subir → 0 insertadas (dedupe por composite).

## Test de volumen (chunked upload)

- [ ] Generar CSV con 2500 clientes (script one-off o gen manual).
- [ ] Subir → preview OK → "Importar 2500 filas".
- [ ] Ver progress bar: "Chunk 1 de 5", "2 de 5", ... "5 de 5".
- [ ] Toast final: "2500 insertadas".
- [ ] Verificar count en DB: `SELECT COUNT(*) FROM customers WHERE org_id = <test-org>` ≥ 2500.

## Test multi-tenant isolation (CRÍTICO)

- [ ] Con user de org A, importar customer con doc "11111111".
- [ ] Con user de org B, importar customer con doc "11111111" → insertado (no colisiona cross-tenant).
- [ ] Verificar en DB: ambos existen, con diferentes `org_id`.
- [ ] User de org A: `SELECT * FROM customers WHERE document_number = '11111111'` → ve solo el suyo (RLS).

## Test de error recovery

- [ ] CSV con 1000 rows, una con error de FK en fila 600.
- [ ] Preview marca error en esa fila.
- [ ] Descargar "CSV con errores" → contiene solo las rows problemáticas + columna `_error`.
- [ ] Cliente arregla la fila 600, re-sube → 1000 insertadas (las primeras 999 como conflicts silenciosos y la 600 nueva).

## Smoke cleanup

- [ ] Banner dashboard dismissible: clickear X → refrescar → no aparece.
- [ ] localStorage: `import_banner_dismissed = "true"`.
- [ ] Settings → sidebar muestra "Importación" link que abre `/settings/import`.

## Regresión Lozada (crítico)

- [ ] Login como user real de Lozada (org `1b326d20-d133-4112-a798-f54b5af7e7cb`).
- [ ] Navegar por el sistema: customers, operations, payments, cash_movements funcionan como antes.
- [ ] `/settings/import` abre la nueva UI (accordion con 8 entidades).
- [ ] Los 42 duplicados legacy de "Costo de Operadores" siguen en DB (no se tocan).
- [ ] Importar 1 customer nuevo en Lozada → inserta con org_id correcto.
