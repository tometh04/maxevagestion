# Bulk Import — Testing pendiente

Cosas que NO se testearon en la implementación (2026-04-22). Anotadas para hacerlas después del smoke inicial en prod.

---

## 1. Integration tests faltantes

No hicimos tests de integración (solo unit tests de libs/schemas). Lo que falta:

### `/api/import/*` endpoints
Jamás se ejecutaron end-to-end. Solo pasan typecheck. Cada uno debería tener:

- [ ] **agencies** — POST con 1 row válida → 200, verificar INSERT real en DB con `org_id` correcto.
- [ ] **agencies** — POST sin auth → 401/redirect.
- [ ] **agencies** — POST con user sin `org_id` → 403 "Usuario sin tenant".
- [ ] **agencies** — POST con role SELLER → 403 "No tenés permiso".
- [ ] **agencies** — POST con row inválida (nombre vacío) → 400 con `details` de Zod.
- [ ] **agencies** — POST con 2 rows misma name → insertar 1, conflict 1.
- [ ] **financial-accounts** — POST con `agency_name: "NoExiste"` → 400 FK no resuelta.
- [ ] **financial-accounts** — POST con `agency_name: "Rosario"` válida → FK resuelve, 200.
- [ ] **customers** — Dedupe DNI intra-chunk.
- [ ] **operators** — Dedupe por CUIT partial index.
- [ ] **users** — Verificar que `inviteUserByEmail` realmente manda email (email llega en <1 min).
- [ ] **users** — Si el email ya tiene auth.users → conflict reportado sin crear duplicado.
- [ ] **operations** — 4 FK resolution + INSERT en `operation_customers` role='primary'.
- [ ] **payments** — FK operation_file_code, dedupe composite.
- [ ] **cash-movements** — `user_id` se setea al usuario autenticado.
- [ ] **cash-movements** — RPC recibe 3 params `(p_org_id, p_user_id, p_rows)` correctamente.

### UI components
- [ ] **EntityPanel** — upload CSV mal formateado → `headerError` visible con toast.
- [ ] **EntityPanel** — mix de rows válidas/inválidas → preview muestra badges, botón Importar deshabilitado si hay errores.
- [ ] **EntityPanel** — "Descargar CSV con errores" genera archivo con columna `_error` rellenada solo en rows problemáticas.
- [ ] **EntityPanel** — upload de 2500 rows → chunks de 500 visible en progress bar.
- [ ] **Modal "Confirmar invitación"** — Cancelar no manda request.
- [ ] **Modal "Saldos iniciales"** — Cancelar no manda request.
- [ ] **Banner dashboard** — click X, refresh → banner no aparece. localStorage `import_banner_dismissed=true`.

### RPC DB-level (requiere tests con Supabase real o mock)
- [ ] **Multi-tenant isolation** — invocar `bulk_import_customers(orgA, rows)` con un user de orgB → RLS bloquea (aunque SECURITY DEFINER bypassea; verificar que el `p_org_id` passed SIEMPRE viene del endpoint y no del body).
- [ ] **Cross-tenant dedupe NOT triggering** — mismo DNI en orgA y orgB → ambos se insertan.
- [ ] **Rollback atomic** — si falla la fila 500 de un chunk, las 499 anteriores también se revierten (Postgres transaction auto).
- [ ] **ON CONFLICT DO NOTHING** vs **EXISTS check** — verificar que rinde igual a nivel correctness (EXISTS tiene race condition en concurrent requests; OK porque 1 user por tenant importa secuencial).

---

## 2. Performance / carga

- [ ] Upload de 10k filas → time-to-response < 30s (chunk de 500 × 20 requests).
- [ ] Upload de 100k filas → timeout Railway (5min/300s). Debería seguir andando; verificar progress bar real.
- [ ] Memoria Node — parse de CSV de 50MB no crashea el lambda.
- [ ] Papaparse con BOM, quoted strings con comas, escapes: verificar edge cases.

---

## 3. Data integrity

- [ ] **Decimal precision** — `initial_balance: "1000.50"` → INSERT guarda numeric correcto, no truncado.
- [ ] **Date parsing** — `date_of_birth: "1990-01-15"` → columna `date` en DB guarda correcto. Formato inválido → error Zod antes de server.
- [ ] **Currency casing** — `currency: "ars"` vs `"ARS"` → Zod enum case-sensitive o coerce? Verificar.
- [ ] **Unicode** — primer_name con acentos (Pérez, ñoño) → guarda sin romper UTF-8.
- [ ] **Empty strings vs null** — `date_of_birth: ""` en CSV → `NULLIF` en RPC → NULL en DB.

---

## 4. Error recovery

- [ ] **Chunk fail mid-upload** — chunks 1-5 OK, chunk 6 falla (ej: network). Mensaje "Error en chunk 6. Se importaron 2500/4500 antes del error."
- [ ] **Re-upload después de chunk fail** — las 2500 no se duplican (dedupe intra-tenant funciona en 2da corrida).
- [ ] **Browser refresh durante upload** — chunks pendientes se pierden pero los ya insertados quedan. Banner info post-refresh "Importación incompleta detectada"? (out of scope ahora, pero note).

---

## 5. Security

- [ ] **Auth bypass attempt** — POST directo a `/api/import/agencies` con cookie de otro tenant → RPC insert con `p_org_id` del request, rechazado por RLS / auth.
- [ ] **SQL injection** — `name: "'; DROP TABLE customers; --"` → Papaparse + Zod + parameterized query = OK por múltiples capas.
- [ ] **Path traversal en template download** — user pega `/templates/../secret.csv` → 404 (Next static serve).
- [ ] **Rate limiting** — 100 POST consecutivos al endpoint → Railway o nuestro middleware debería rate-limitear. Actualmente NO hay rate limit — anotar como tech debt.
- [ ] **CSRF** — endpoints usan Supabase session cookie que es SameSite=Lax, más el Zod body validation. OK.

---

## 6. UX polish

- [ ] Si user viene desde `/settings?tab=import`, el accordion tendría que scrollear/highlightear la entidad que el banner recomendó.
- [ ] Toast "Importación OK" cuando inserted=0 y conflicts=N → mensaje más claro: "Todas las N filas ya existían. Nada nuevo importado."
- [ ] Mobile: accordion con 8 entidades es mucho — considerar collapse-all por default.
- [ ] "Descargar plantilla" con archivo `.csv` debería triggerear download directo, no abrir en browser. Probar en Safari (algunos browsers muestran CSV inline).
- [ ] `StatusChips` está vacío ahora (`items={[]}`). Cargar counts reales de cada entidad para mostrar "X cargados" — queda out of scope MVP pero genera confianza.

---

## 7. Legacy data (Lozada específico)

- [ ] Verificar que los 42 duplicados de "Costo de Operadores" siguen accesibles post-deploy (nada de RLS los ocultó).
- [ ] Verificar que los 30 pagos duplicados composite se pueden seguir cobrando/reconciliando normalmente.
- [ ] **Task separada**: script de cleanup para mergear los 42 "Costo de Operadores" en 1 — UPDATE cash_movements.financial_account_id = <canonical> para los 41 huérfanos, después DELETE los huérfanos. Prioridad media (no bloquea nada).

---

## Quién ejecuta qué

- **Dev local**: Tasks 1 (integration), 3 (data integrity), 5 (security básicos).
- **Staging / Lozada test org**: Tasks 2 (performance), 4 (error recovery), UI polish.
- **Manual Lozada**: Task 7 (legacy data), regresión final del sistema completo.

---

**Próximos pasos recomendados**:
1. Primer smoke real con org de test (importar 3 agencias nuevas, ver preview, importar, verificar en DB). 15 min.
2. Si OK, regresión Lozada (ir por todo el app, verificar que nada se rompió). 30 min.
3. Después, Task 1 de arriba (integration tests con Jest + supertest) en una sesión dedicada.
