# Importación masiva de datos — Design spec

**Fecha**: 2026-04-23
**Owner**: Tomi (CEO Vibook)
**Contexto**: roadmap Prio 2. El sistema actual en `/settings/import` (5 tabs) NO setea `org_id` en los inserts, no tiene rollback transaccional, no valida Zod server-side y dedupea cross-tenant — incompatible con multi-tenant SaaS. Lo reemplazamos por un sistema nuevo.

---

## 1. Resumen ejecutivo

Un tenant que onboardea tiene que cargar toda su operación preexistente (clientes, operadores, operaciones, pagos, etc.) para que el ERP tenga datos. Hoy eso no se puede hacer de forma confiable: faltan guards multi-tenant, no hay validación fuerte, y el código existente inyecta filas sin `org_id` que después son invisibles por RLS.

Este spec define un sistema de **importación por plantillas CSV estrictas** con validación en dos capas, transaccionalidad, y soporte para volumen variable (desde 3 hasta 100k+ filas). Accesible desde `/settings/import` en cualquier momento — **sin wizard obligatorio** para que agencias nuevas sin histórico puedan ir directo al dashboard.

### Por qué ahora (lens CEO)

1. **Retention temprana**: sin importación, cada cliente tarda semanas en cargar su histórico → churn en los primeros 7-14 días.
2. **Enterprise playbook**: un Enterprise que migra de otro ERP necesita promesa clara de "traemos tu data en 1 día". Sin esto, la venta Enterprise está bloqueada.
3. **Fix bug existente**: el código actual es activamente peligroso — si alguien lo usa, le rompe los datos del tenant. Hay que reemplazarlo antes de que un cliente real lo descubra.

---

## 2. Scope

### In scope

- 8 plantillas CSV: agencies, financial_accounts, customers, operators, users (vendedores), operations, payments, cash_movements.
- Descarga de plantilla con headers exactos + 2 filas de ejemplo + bloque de instrucciones al principio (comentadas con `#`).
- Upload + parseo client-side (Papaparse) con validación Zod.
- Preview con todas las filas, estado por fila, lista clara de errores.
- Chunked upload para volumen > 500 filas con progress bar real.
- Insert transaccional server-side vía RPCs de Postgres (`bulk_import_<entity>`).
- Dedupe por natural key dentro del tenant (no cross-tenant).
- Foreign key resolution dentro del tenant (ej. `operations.seller_email` → `users.id` misma org).
- Idempotencia: `UNIQUE (org_id, natural_key)` en cada tabla. Conflicto ⇒ error claro al user.
- `/settings/import` como hub único. Banner dismissible en dashboard para quien quiera onboardear histórico.
- Reemplazo completo del código legacy — borrado de `app/api/import/*`, `app/(dashboard)/settings/import/page.tsx`, `components/settings/import-section.tsx`.

### Out of scope

- Excel (.xlsx). Solo CSV UTF-8. Si un cliente trae Excel, se lo exporta a CSV.
- Smart-matching de headers. Forzamos que el cliente use la plantilla descargada (headers exactos).
- Upsert silencioso. Si una fila ya existe (conflicto en natural key), el comportamiento default es **error** — el cliente tiene que decidir si limpiar duplicados del CSV o eliminar las rows viejas antes de re-importar. No sobrescribimos silenciosamente.
- Background jobs / queue system. Todo sync en request. Si un archivo de 100k filas tarda >300s (timeout Railway), chunked upload lo parte en piezas. No usamos Railway queues ni nada external.
- Mapping visual de columnas (drag-and-drop headers). Out of scope — forzamos formato estricto.
- Leads. Se auto-sincronizan con Trello/Manychat/CRM integrations; no importación por CSV.
- Chart of accounts, exchange_rates, commission_rules. Son config del sistema, se crean automáticamente al provisionar el tenant.

---

## 3. Entidades y plantillas

Orden de dependencias (si el cliente importa todo, este es el orden recomendado — aunque técnicamente pueden hacerlo en cualquier orden, los endpoints rechazan filas con FKs no resueltos):

### 3.1 agencies (sub-agencias)

**Natural key**: `(org_id, name)`.
**Default**: el tenant ya tiene una agencia creada en el signup. Esta plantilla es para agregar agencias adicionales (Rosario, Madero, etc. en el caso de Lozada).

| Columna | Tipo | Required | Descripción |
|---|---|---|---|
| name | string | ✓ | Nombre de la agencia (único por org). |
| city | string | ✓ | Ciudad. |
| timezone | string | ✓ | IANA timezone (ej. `America/Argentina/Buenos_Aires`). Default si vacío. |

### 3.2 financial_accounts (cajas, bancos, tarjetas)

**Natural key**: `(org_id, name)`.
**Pre-req**: agencies si la columna `agency_name` está seteada.

| Columna | Tipo | Required | Descripción |
|---|---|---|---|
| name | string | ✓ | Nombre (ej. "Caja ARS Rosario"). |
| type | enum | ✓ | `CAJA` \| `BANCO` \| `TARJETA_CREDITO` \| `BILLETERA_VIRTUAL` \| `OTRO`. |
| currency | enum | ✓ | `ARS` \| `USD`. |
| initial_balance | decimal | ✓ | Saldo inicial (default 0). |
| agency_name | string | — | Nombre de la agencia asociada (debe existir en agencies del tenant). |
| bank_name | string | — | Si `type=BANCO` o `TARJETA_CREDITO`. |
| account_number | string | — | Ídem. |

### 3.3 customers

**Natural key**: `(org_id, document_number)` si hay document_number. Fallback: `(org_id, email)`. Fallback final: `(org_id, first_name, last_name, phone)`.
**Pre-req**: ninguno.

| Columna | Tipo | Required | Descripción |
|---|---|---|---|
| first_name | string | ✓ | |
| last_name | string | ✓ | |
| phone | string | ✓ | Formato libre, validado >= 8 caracteres. |
| email | string | — | Validado como email si presente. |
| document_type | enum | — | `DNI` \| `PASAPORTE` \| `LC` \| `LE` \| `CI`. |
| document_number | string | — | |
| date_of_birth | date | — | `YYYY-MM-DD`. |
| nationality | string | — | |

### 3.4 operators

**Natural key**: `(org_id, cuit)` si hay CUIT. Fallback: `(org_id, name)`.
**Pre-req**: ninguno.

| Columna | Tipo | Required | Descripción |
|---|---|---|---|
| name | string | ✓ | |
| cuit | string | — | CUIT argentino 11 dígitos. |
| contact_name | string | — | |
| contact_email | string | — | |
| contact_phone | string | — | |
| credit_limit | decimal | — | En ARS. Default 0. |

### 3.5 users (vendedores)

**Natural key**: `(org_id, email)`.
**Pre-req**: agencies.
**Side effect**: al importar, para cada fila se crea un auth.users en Supabase + se le manda un **email de invitación con link para setear password**. Aviso claro en la UI antes de confirmar import.

| Columna | Tipo | Required | Descripción |
|---|---|---|---|
| email | string | ✓ | Validado como email. Será el login. |
| name | string | ✓ | Nombre completo visible. |
| role | enum | ✓ | `SELLER` \| `ADMIN` \| `CONTABLE` \| `VIEWER`. No `SUPER_ADMIN` (se reserva para el owner). |
| agency_name | string | — | Agencia primaria. Si vacío → primera agencia del tenant. |
| commission_percentage | decimal | — | Para vendedores. Default 0. |

### 3.6 operations (opcional)

**Natural key**: `(org_id, file_code)` si hay file_code. Sin file_code → error (no permitimos ops sin código identificador para evitar duplicados).
**Pre-req**: customers, operators, users, agencies.

| Columna | Tipo | Required | Descripción |
|---|---|---|---|
| file_code | string | ✓ | Código único de operación (ej. "OP-20250101-001"). |
| customer_document | string | ✓ | DNI del cliente titular. Debe existir en customers. |
| operator_name | string | ✓ | Debe existir en operators. |
| seller_email | string | ✓ | Debe existir en users. |
| agency_name | string | ✓ | Debe existir en agencies. |
| destination | string | ✓ | |
| departure_date | date | ✓ | `YYYY-MM-DD`. |
| return_date | date | — | |
| adults | int | — | Default 1. |
| children | int | — | Default 0. |
| sale_amount | decimal | ✓ | Monto venta al cliente (positivo). |
| operator_cost | decimal | ✓ | Costo del operador (positivo). |
| currency | enum | ✓ | `ARS` \| `USD`. |
| status | enum | ✓ | `RESERVED` \| `CONFIRMED` \| `CLOSED` \| `CANCELLED`. |

### 3.7 payments (opcional)

**Natural key**: `(org_id, operation_file_code, amount, date_due, direction)` — composite para permitir múltiples pagos parciales.
**Pre-req**: operations + financial_accounts.

| Columna | Tipo | Required | Descripción |
|---|---|---|---|
| operation_file_code | string | ✓ | Debe existir en operations. |
| direction | enum | ✓ | `INCOME` (cliente → agencia) \| `EXPENSE` (agencia → operador). |
| amount | decimal | ✓ | Positivo. |
| currency | enum | ✓ | `ARS` \| `USD`. |
| date_due | date | ✓ | Fecha de vencimiento. |
| date_paid | date | — | Fecha real de pago. Si presente → status=PAID auto. |
| status | enum | — | `PENDING` \| `PAID` \| `CANCELLED`. Default `PENDING`. |
| method | enum | — | `CASH` \| `TRANSFER` \| `CARD` \| `OTHER`. |
| financial_account_name | string | — | Debe existir en financial_accounts si el status es PAID. |
| reference | string | — | Nº de comprobante, cupón, etc. |

### 3.8 cash_movements (opcional)

**Natural key**: `(org_id, account_name, date, amount, type, reference)` — composite.
**Pre-req**: financial_accounts.

| Columna | Tipo | Required | Descripción |
|---|---|---|---|
| account_name | string | ✓ | Debe existir en financial_accounts. |
| date | date | ✓ | `YYYY-MM-DD`. |
| type | enum | ✓ | `INCOME` \| `EXPENSE` \| `TRANSFER_IN` \| `TRANSFER_OUT`. |
| amount | decimal | ✓ | Positivo. El signo lo decide el `type`. |
| currency | enum | ✓ | `ARS` \| `USD`. |
| category | string | — | Libre, para categorizar (ej. "VENTA", "GASTO_OPERATIVO"). |
| reference | string | — | |
| notes | string | — | |

---

## 4. Flow UX

### Entry points

1. **Dashboard banner dismissible** (post-signup, primeros 30 días): *"¿Traés datos de otro sistema? Importá tu histórico en `/settings/import`."* Con botón "Cerrar" que setea `localStorage.import_banner_dismissed=true`.
2. **`/settings/import`** — accesible siempre desde el sidebar de settings. Hub único con las 8 plantillas.

### `/settings/import` layout

Una sola página con:

- Título + descripción.
- **Sección "Estado general"** con 8 chips, uno por entidad, mostrando conteo actual (`12 clientes cargados`, `0 operaciones importadas`, etc.). Sirve de orientación: el cliente ve qué falta.
- **Acordeón de plantillas** (una row por entidad), en orden de dependencias. Cada row muestra:
  - Nombre + descripción corta.
  - Dependencias (ej. "Requiere: customers, operators, users, agencies").
  - 3 botones: `Descargar plantilla` / `Subir CSV` / `Ver filas cargadas` (link a la tabla del ERP).
  - Al clickear "Subir CSV" se expande la row con el flow de upload (3 pasos: upload → preview → confirmar).

### Flow de upload por entidad

1. **Upload**: el user selecciona un archivo `.csv`. Si no es CSV → error. Si pesa >50MB → advertencia pero permitido (dejamos al chunker procesarlo).
2. **Parse client-side**: Papaparse con `skipEmptyLines: true`, `header: true`. Validación inmediata:
   - Headers matchean exactos a la plantilla (case-insensitive trim). Si falta alguno o sobra, alert con la lista y abort — el cliente tiene que re-descargar la plantilla.
   - Por cada fila, Zod schema valida tipos/formatos.
   - Dedupe dentro del CSV (dos filas con misma natural key → marca ambas con error).
3. **Preview**: tabla con paginación (50 filas visibles), estado por fila (OK / Warning / Error). Panel lateral resume:
   - `N total · M OK · W warnings · E errores`.
   - Lista de los primeros 20 errores con formato `Fila 47, columna "email": formato inválido`.
   - Botón `Descargar CSV con errores` que baja el mismo CSV con una columna extra `_error` al final, rellenada solo en las filas problemáticas. El cliente abre, corrige, re-uploadea.
4. **Confirmar import**: botón `Importar N filas válidas` habilitado solo si `errores === 0`. Si hay errores → bloqueado. (Decisión: **validation-upfront** en lugar de best-effort. El cliente tiene que dejar el CSV limpio antes de importar. Evita estado parcial.)
5. **Processing**: si `rows.length <= 500`, request sync único. Si `> 500`, el cliente split en chunks de 500, manda POST secuencial con `chunk_index` + `total_chunks` + `import_session_id` (uuid generado client-side). Progress bar basado en chunks completados.
6. **Resultado**: card con `{ inserted: N, conflicts: K, rollback: boolean }`. Si `rollback=true`, ninguna fila entró (el server revirtió todo). Si `rollback=false`, N filas OK y K conflicts (natural key ya existente) listados para que el cliente decida.

### Entity-specific pre-import confirmations

Para **users** (vendedores): modal antes de confirmar:
> "Vas a importar N vendedores. A cada email se le va a mandar un link de invitación para setear contraseña. ¿Continuar?"

Para **financial_accounts**: modal si hay `initial_balance > 0`:
> "Estás configurando saldos iniciales por un total de $X ARS y $Y USD. Estos saldos crean automáticamente ledger_movements de apertura. ¿Continuar?"

---

## 5. Validación — 2 capas

### Capa 1 — Client-side (Zod schemas en `lib/import/schemas/<entity>.ts`)

Cada entidad exporta:

```ts
export const customerSchema = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  phone: z.string().trim().min(8),
  email: z.string().email().optional().or(z.literal("")),
  // ...
})

export type CustomerRow = z.infer<typeof customerSchema>

// Natural key resolver: dado un row, devuelve la key para dedupe
export function customerNaturalKey(row: CustomerRow): string {
  return row.document_number || row.email || `${row.first_name}|${row.last_name}|${row.phone}`
}

// CSV headers exactos (lowercase)
export const customerCsvHeaders = [
  "first_name", "last_name", "phone", "email",
  "document_type", "document_number", "date_of_birth", "nationality",
] as const
```

El parser genérico (`lib/import/csv-parser.ts`) toma cualquier schema + headers, parsea, corre Zod, marca errores/warnings por fila.

### Capa 2 — Server-side (endpoints `/api/import/<entity>` — nuevos)

```ts
// POST /api/import/customers
// body: { rows: CustomerRow[], chunk_index?: number, total_chunks?: number, session_id?: string }

1. Auth: user.role IN (SUPER_ADMIN, ADMIN, ORG_OWNER) y user.org_id existe.
2. Re-validate cada row con el mismo Zod schema (never trust client).
3. Resolve FKs (solo para entidades que lo requieren):
   - operations: customer_document → customers.id WHERE org_id = user.org_id.
   - payments: operation_file_code → operations.id WHERE org_id = user.org_id.
   - cash_movements: account_name → financial_accounts.id WHERE org_id = user.org_id.
   - Si alguna FK no resuelve, marca la row con error y no se incluye en el insert.
4. Chunk atómico: abre TX Postgres vía RPC `bulk_import_<entity>(p_org_id uuid, p_rows jsonb)`.
   La función RPC hace:
     - FOR EACH row IN p_rows:
         INSERT INTO <table> (org_id, ...) VALUES (p_org_id, ...)
         ON CONFLICT (org_id, <natural_key>) DO NOTHING RETURNING id;
     - Devuelve { inserted: int, conflicts: jsonb[] }.
5. Si RPC tira excepción → toda la chunk revierte (TX automática Postgres).
6. Response: { inserted, conflicts, chunk_index, total_chunks }.
```

**Política frente a conflicts (natural key duplicada)**: la RPC hace `ON CONFLICT DO NOTHING`, NO upsert. Las filas duplicadas se reportan al client como `conflicts`; el server no las sobrescribe. El client muestra "K filas ya existían y se omitieron" al final.

**Rollback cross-chunk**: si el cliente sube un archivo de 10k filas y el chunk 5 falla por error no recuperable, el client aborta los siguientes chunks. Las chunks 1-4 ya están commited. Aviso claro al user: *"Se importaron X filas antes de encontrar el error. Revertí manualmente o corregí el archivo desde la fila N+1 y re-subí solo esas."* La alternativa — rollback global de los 10k — requiere trasaccionar el archivo completo, inviable para volumen grande. Trade-off aceptado.

---

## 6. Performance y chunking

| Volumen | Estrategia | Timing esperado |
|---|---|---|
| < 500 filas | Request sync único | < 5s |
| 500 – 10k filas | Client chunkea en batches de 500, POST secuencial (o paralelo max 3). Progress bar real. | 30s – 3min |
| 10k – 100k filas | Mismo chunking. Advertencia UI: "Esto puede tardar 5-15 min. No cerrés la pestaña." | 5 – 15 min |
| > 100k filas | Aviso: "Archivo muy grande. Contactanos para migración asistida." | — |

No usamos background jobs (Railway Queues o similar). Razón: complejidad extra, pocos clientes van a llegar a volúmenes que lo requieran, y si llegan el team de Vibook hace la migración a mano con SQL.

---

## 7. Arquitectura — archivos

### Nuevos

- `lib/import/schemas/agencies.ts` — Zod schema + natural key + headers.
- `lib/import/schemas/financial-accounts.ts` — idem.
- `lib/import/schemas/customers.ts` — idem.
- `lib/import/schemas/operators.ts` — idem.
- `lib/import/schemas/users.ts` — idem (incluye validación email).
- `lib/import/schemas/operations.ts` — idem.
- `lib/import/schemas/payments.ts` — idem.
- `lib/import/schemas/cash-movements.ts` — idem.
- `lib/import/csv-parser.ts` — wrapper Papaparse + Zod. Exporta `parseCsv(file, schema, headers)`: devuelve `{ rows, errors, warnings }`.
- `lib/import/fk-resolver.ts` — helpers para resolver FKs dentro del org (ej. `resolveCustomerByDocument(org_id, doc) => customer_id | null`).
- `lib/import/chunked-upload.ts` — client helper: `uploadInChunks(rows, endpoint, onProgress)`.
- `supabase/migrations/YYYYMMDDNNNN_bulk_import_rpcs.sql` — 8 funciones RPC (`bulk_import_agencies`, etc.) + UNIQUE constraints en cada tabla si no existen.
- `app/api/import/<entity>/route.ts` — 8 endpoints nuevos, reemplazan los rotos.
- `app/(dashboard)/settings/import/page.tsx` — rewrite completo (reemplaza existente).
- `components/import/entity-panel.tsx` — UI por entidad (download template + upload + preview + confirm).
- `components/import/preview-table.tsx` — tabla con estado por fila.
- `components/import/error-panel.tsx` — lista errores + download CSV con errores.
- `components/import/status-chips.tsx` — sección "Estado general" con 8 chips.
- `components/import/entity-specific-modals.tsx` — confirmación pre-import para users y financial_accounts.
- `components/dashboard/import-banner.tsx` — banner dismissible para dashboard.
- `public/templates/agencies.csv`, `financial-accounts.csv`, `customers.csv`, `operators.csv`, `users.csv`, `operations.csv`, `payments.csv`, `cash-movements.csv` — archivos pre-generados con headers + 2 filas de ejemplo + comentarios `#` al principio.

### Eliminados (borrado + git rm)

- `app/api/import/customers/route.ts` (rota: no setea org_id).
- `app/api/import/operators/route.ts`.
- `app/api/import/operations/route.ts`.
- `app/api/import/payments/route.ts`.
- `app/api/import/cash_movements/route.ts`.
- `app/(dashboard)/settings/import/page.tsx` (vieja, reemplazada).
- `components/settings/import-section.tsx` (vieja).

---

## 8. Seguridad — multi-tenant

- **`org_id` siempre**: todas las funciones RPC reciben `p_org_id uuid` y lo inyectan en el INSERT. No se lee del row del CSV; viene del `user.org_id` del request.
- **FK resolution scopeada**: cada lookup de FK agrega `WHERE org_id = user.org_id`. Imposible resolver un `customer_document` a una row de otro tenant.
- **RLS respeta**: las RPCs son `SECURITY DEFINER` con `SET search_path = public` para poder bypasear RLS controladamente (sino cada INSERT via RLS puede ser lento). Dentro de la función, la lógica asegura que `org_id` match user.
- **Auth check**: `user.role IN (SUPER_ADMIN, ADMIN, ORG_OWNER)`. `SELLER`, `VIEWER`, `CONTABLE` NO pueden importar (403). Si un tenant quiere que otro user importe, tiene que elevarlo a ADMIN primero.
- **Rate limit**: reusamos el rate limit existente del middleware (200 req/min por IP). Suficiente para chunked upload de archivos grandes.
- **Audit log**: cada import exitoso loguea un evento en `security_audit_log` con `event_type = 'BULK_IMPORT'`, `target_entity = <tabla>`, `details = { rows_inserted, chunks, session_id }`.

---

## 9. Testing

### Unit (Jest) — `lib/import/__tests__/`

- Por cada schema: cases válidos, inválidos, edge cases (campos opcionales vacíos, formatos de fecha, enums). 50+ tests.
- `csv-parser.test.ts`: parse de CSVs reales (headers válidos, headers faltantes, headers extra, BOM, quotes).
- `fk-resolver.test.ts`: mock Supabase, resolve por document, por email, por fallback.

### Integration — `__tests__/import/`

- POST `/api/import/customers` con CSV válido → 200 + inserted match.
- POST con 1 fila inválida → 400 con error listado.
- POST con 1 conflict (natural key existente) → 200 con `conflicts: [...]`, el resto entra.
- POST con chunking (3 chunks, session_id) → cada chunk devuelve su `chunk_index`.
- Cross-tenant: user de Lozada intenta importar customers con `document_number` que ya existe en otra org → insert OK (no cross-tenant conflict).
- RLS: user de Lozada intenta hacer un POST con `org_id` manual en el body → ignorado, se usa `user.org_id` siempre.

### E2E smoke (manual, post-deploy)

- Descargar plantilla customers → completar 10 filas en Excel → exportar CSV → uploadear → preview OK → importar → verificar en `/customers` las 10 filas con `org_id = Lozada`.
- Subir CSV con 1 fila mal → preview muestra error → botón importar bloqueado → descargar CSV con errores → arreglar → re-subir → importar OK.
- Subir CSV de 2000 filas → chunking 4 chunks de 500 → progress bar → éxito.
- Subir CSV de users → confirmación modal → confirmar → verificar invitaciones enviadas a 3 emails test.

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cliente sube CSV con encoding wrong (Latin-1 en vez de UTF-8) → acentos rotos | Papaparse detecta BOM. Si no hay BOM, parseamos como UTF-8 y si vemos mojibake en el preview, el cliente lo ve y puede re-exportar. Instrucción clara en plantilla. |
| Timeout serverless (>300s) con chunk grande | Chunk máximo 500 filas. Cada chunk debe resolver en < 30s. Si un chunk individual timeout → reintento automático en client (1 vez). Si falla de nuevo → abort + notificación al user. |
| RPC `SECURITY DEFINER` comete abuso cross-tenant por bug | El spec del RPC es simple y auditado. Tests integration específicos para cross-tenant. |
| Invitaciones email a users se rebotan (emails mal) | Validación de email en Zod (`z.string().email()`) + dominio existente (opcional, out of scope). Las que reboten se loguean en `security_audit_log` para follow-up manual. |
| Cliente re-sube mismo CSV dos veces por accidente | `ON CONFLICT DO NOTHING` → las rows existentes se omiten (reportadas como `conflicts`). Sin daño. |
| Cliente importa 50k operations y el banco de datos lockea las `customers` paralelas | Chunks procesados secuencial (max concurrency=3). Si vemos lockings, reducimos a 1. |
| Fila parcial en rollback parcial (chunks 1-4 commited, chunk 5 falló) | Aceptado como trade-off. UI muestra aviso claro. Cliente puede borrar lo importado con un endpoint "clear entity" (out of scope por ahora, se hace por SQL manual si pasa). |

---

## 11. Orden de implementación sugerido

Para que `writing-plans` genere el plan:

1. Migration RPCs + UNIQUE constraints (1 migration SQL).
2. Types regenerate (`npm run db:generate`).
3. `lib/import/schemas/<entity>.ts` × 8 + Jest unit tests TDD.
4. `lib/import/csv-parser.ts` + `lib/import/fk-resolver.ts` + tests.
5. `lib/import/chunked-upload.ts` (client helper).
6. Plantillas CSV en `public/templates/`.
7. Endpoints `/api/import/<entity>/route.ts` × 8 (con tests integration).
8. Borrado de código legacy (endpoints viejos + page + component).
9. UI rewrite: `app/(dashboard)/settings/import/page.tsx` + componentes `components/import/*`.
10. Banner dashboard.
11. Smoke E2E manual.

---

## 12. Referencias

- Sistema actual (a reemplazar): `app/api/import/*/route.ts`, `app/(dashboard)/settings/import/page.tsx`, `components/settings/import-section.tsx`.
- Schema types: `lib/supabase/types.ts`.
- Multi-tenant RLS pattern: migrations 132-149.
- Auth helpers: `lib/auth.ts`, `lib/permissions.ts`.
- Audit log: `lib/security/audit.ts`.
- Supabase server: `lib/supabase/server.ts`.
