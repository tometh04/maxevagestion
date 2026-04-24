# AFIP Hardening & Verification Layer — Design (SP-1)

**Status:** draft awaiting user review
**Author:** Claude (sesión 2026-04-24, brainstorming skill)
**Scope:** Fase 1a del programa AFIP completo (6 sub-proyectos identificados — este spec cubre solo el primero).

---

## 1. Contexto y objetivo

MAXEVA / Vibook es un SaaS multi-tenant para agencias de viajes argentinas. Cada agencia (tenant, identificada por `org_id`) factura con **su propio CUIT, punto de venta y certificado digital** contra AFIP, usando el servicio hosted [afipsdk.com](https://afipsdk.com/) como capa de abstracción sobre WSAA/WSFE/WSCT.

El código actual (≈1.448 LOC en `lib/afip/` + ≈2.240 LOC en API routes) ya emite facturas con CAE, maneja multi-PV, pide cotización oficial, y tiene un wizard parcial de setup. Pero hay **cinco problemas reales que bloquean la confianza del usuario en el sistema**, articulados por él como "nunca pudimos resolverlo":

1. **No hay forma de confirmar que una factura "autorizada" está viva en AFIP.** Guardamos lo que el SDK dijo y confiamos — si AFIP devolvió algo distinto o si el response fue parcial, nunca lo sabemos.
2. **No hay evidencia post-hoc.** No se guardan request/response crudos. Ante una disputa con cliente o una auditoría, no tenemos cómo probar qué enviamos.
3. **Race conditions no se recuperan.** Si `createNextVoucher` timeouta, no sabemos si AFIP autorizó o no, y un retry ciego duplicaría.
4. **Aislamiento multi-tenant frágil.** La tabla `integrations` (que guarda config AFIP) usa `agency_id` como scope, no `org_id`. Post-SaaS conversion esto es un leak latente.
5. **UI duplicada con divergencias.** Dos componentes (`/operations/billing/new/page.tsx` y `components/invoices/new-invoice-dialog.tsx`) hacen casi lo mismo, con bugs distintos (falta Factura C en uno, falta fetch de cotización en el otro).

El objetivo de esta fase **no es agregar features**, es **hacer confiable y aislado lo que ya existe**. Sin esta base, SP-2 (Ganancia Facturación), SP-3 (Libro IVA), SP-4 (Factura T), SP-5 (Cert Lifecycle) y SP-6 (Facturas de Compra) acumularían deuda.

## 2. Success criteria

Cuando esta fase esté deployada:

1. **Toda emisión ejecuta read-back contra AFIP** vía `getVoucherInfo(nro, pto_vta, cbte_tipo)` inmediatamente después del `createNextVoucher`, compara importes / doc / fechas / CAE, y persiste el diff si hay discrepancia.
2. **Cada llamada al SDK queda loggeada** en `afip_voucher_requests` con request payload, response payload, verified payload, diff, timestamps, idempotency key y attempt number.
3. **Si AFIP timeouta** durante una emisión, el sistema recupera el CAE vía `getLastVoucher` + `getVoucherInfo` en vez de duplicar emisión.
4. **Las consultas de facturas respetan `org_id` del user** vía RLS — un test automatizado simula user cross-org y falla si hay leak.
5. **Existe una sola UI de emisión** (full-page `/operations/billing/new`), el dialog redundante está eliminado y sus consumidores migrados.
6. **Antes de emitir en USD, la cotización se valida contra oficial AFIP** — si el input del usuario difiere más de ±2%, el endpoint devuelve 400 con sugerencia del valor oficial.
7. **Facturas vigentes pueden re-verificarse on-demand** desde la UI ("Re-sincronizar con AFIP") y ejecuta `getVoucherInfo` otra vez, actualiza `verified_at` y `verification_status`.

## 3. Non-goals (defer a otras fases)

- Onboarding wizard CUIT+clave fiscal con auto-detección de WS autorizados → **SP-1 fase 1b**.
- Descarga de facturas (PDF individual + bulk ZIP) → **SP-1 fase 1c**.
- Facturar margen de operación desde un botón 1-click → **SP-2**.
- Libro IVA Digital (generación TXT) → **SP-3**.
- Factura T para turistas extranjeros → **SP-4**.
- Renovación automática de certificados próximos a vencer → **SP-5**.
- Facturas de compra de operadores + percepciones → **SP-6**.
- Migración a patrón "delegación a CUIT maestro" — **descartado por el usuario**; cada agencia factura con su propio CUIT/cert.

## 4. Arquitectura

### 4.1 Capas

```
┌────────────────────────────────────────────────┐
│  API route /api/invoices/[id]/authorize        │
│  (tenant-scoped, idempotent, logged)           │
└──────────────────┬─────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────┐
│  AfipService  (lib/afip/afip-service.ts)       │
│  - Una instancia por request por tenant        │
│  - Lee config via RLS (org_id scoped)          │
│  - Wrappers: issueVoucher, verifyVoucher,      │
│    recoverVoucher, getTaxpayerInfo,            │
│    getAfipRate, getPointsOfSale                │
│  - Todas las llamadas crudas al SDK van acá    │
└──────────────────┬─────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────┐
│  @afipsdk/afip.js (third-party, hosted)        │
│  afip.ElectronicBilling.{                      │
│    createNextVoucher, getLastVoucher,          │
│    getVoucherInfo, getSalesPoints,             │
│    getExchangeRate, getServerStatus            │
│  }                                             │
└────────────────────────────────────────────────┘
```

`lib/afip/afip-client.ts` queda como **legacy adapter** temporal — durante la fase su contenido se mueve progresivamente a `AfipService` y termina en un wrapper fino que solo re-exporta. No se borra todavía para no romper los 20+ callers existentes de un golpe.

### 4.2 AfipService — superficie pública

```typescript
// lib/afip/afip-service.ts
export class AfipService {
  private afip: AfipSdkInstance  // creado por request, nunca compartido
  private rateCache: Map<string, { rate: number; fetchedAt: number }> = new Map()

  constructor(
    private config: AfipConfig,              // del tenant
    private supabase: SupabaseClient,         // server client del user en curso
    private orgId: string                     // scope
  ) {
    this.afip = createAfipInstance(config)
  }

  /**
   * Emite un comprobante con verificación post-hoc, logging y recovery.
   * Idempotente por draft.id — llamadas concurrentes al mismo draft
   * se serializan por UNIQUE(idempotency_key).
   */
  async issueVoucher(draft: InvoiceDraft): Promise<IssueResult>

  /**
   * Re-verifica contra AFIP una factura ya autorizada.
   * Útil desde UI "Re-sincronizar" y desde job periódico.
   */
  async verifyVoucher(invoiceId: string): Promise<VerifyResult>

  /**
   * Dado un número tentativo que se fue en un request que timeouteó,
   * determina si AFIP lo tomó o no, y recupera el CAE si corresponde.
   */
  private async recoverVoucher(
    tentativeNumber: number,
    ptoVta: number,
    cbteTipo: TipoComprobante
  ): Promise<RecoverResult>

  /**
   * Padrón Constancia de Inscripción (A13). Cacheado 30 días en DB
   * (tabla padron_cache, ver §4.5).
   */
  async getTaxpayerInfo(cuit: string): Promise<PadronData>

  /**
   * Cotización oficial AFIP para una moneda. Cacheada 1h en memoria.
   * Usa FEParamGetCotizacion via el SDK.
   */
  async getAfipRate(currency: 'DOL' | 'PES', date?: Date): Promise<number>

  /**
   * Puntos de venta habilitados para WSFE en el CUIT del tenant.
   */
  async getPointsOfSale(): Promise<PointOfSale[]>

  /**
   * Healthcheck liviano — útil para el botón "Probar conexión" en settings.
   */
  async ping(): Promise<{ ok: boolean; latency_ms: number; error?: string }>
}

// Factory que construye la instancia con RLS-scoped config
export async function getAfipServiceForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<AfipService | null>
```

### 4.3 Modelo de datos

#### Migración nueva: `supabase/migrations/20260424000XXX_afip_hardening.sql`

```sql
-- ============================================================
-- TABLA: afip_voucher_requests
-- Log de auditoría de cada llamada a AFIP. Evidencia frente
-- a disputas con cliente o auditorías fiscales.
-- ============================================================
CREATE TABLE afip_voucher_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id),
  agency_id UUID REFERENCES agencies(id),

  -- Idempotency: UNIQUE por tenant+operación, bloquea retries paralelos.
  idempotency_key TEXT NOT NULL,
  attempt_n INT NOT NULL DEFAULT 1,

  -- 'create' = createNextVoucher
  -- 'verify' = getVoucherInfo post-create o on-demand
  -- 'recover' = getLastVoucher + getVoucherInfo ante timeout
  operation TEXT NOT NULL CHECK (operation IN ('create', 'verify', 'recover')),

  request_payload JSONB,
  response_payload JSONB,
  verified_payload JSONB,       -- lo que devolvió getVoucherInfo
  verification_diff JSONB,      -- campos que no coincidieron

  error TEXT,
  error_code TEXT,              -- código AFIP si aplica (10016, 10119, etc.)

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,

  UNIQUE (idempotency_key, attempt_n)
);

CREATE INDEX idx_afip_voucher_requests_invoice ON afip_voucher_requests(invoice_id);
CREATE INDEX idx_afip_voucher_requests_org ON afip_voucher_requests(org_id);
CREATE INDEX idx_afip_voucher_requests_idempotency ON afip_voucher_requests(idempotency_key);

ALTER TABLE afip_voucher_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY afip_voucher_requests_tenant_isolation
  ON afip_voucher_requests
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- ============================================================
-- TABLA: padron_cache
-- Cache de consultas al Padrón Constancia de Inscripción.
-- TTL 30 días. Invalidable manualmente con DELETE.
-- Global (no tenant-scoped) porque padrón es data pública.
-- ============================================================
CREATE TABLE padron_cache (
  cuit TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);
CREATE INDEX idx_padron_cache_expires ON padron_cache(expires_at);

-- ============================================================
-- INVOICES: columnas de verificación + org_id scoping
-- ============================================================
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_status TEXT
    CHECK (verification_status IN ('unverified', 'verified', 'discrepancy', 'not_found_in_afip')),
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_error TEXT;

-- Backfill: org_id desde agencies.org_id
UPDATE invoices i
SET org_id = a.org_id
FROM agencies a
WHERE a.id = i.agency_id AND i.org_id IS NULL;

-- NOT NULL después del backfill
ALTER TABLE invoices ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(org_id);

-- RLS: reemplazar política por una que use org_id
DROP POLICY IF EXISTS invoices_tenant_isolation ON invoices;
CREATE POLICY invoices_tenant_isolation
  ON invoices
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- ============================================================
-- INTEGRATIONS: scoping directo por org_id
-- ============================================================
ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

UPDATE integrations i
SET org_id = a.org_id
FROM agencies a
WHERE a.id = i.agency_id AND i.org_id IS NULL;

ALTER TABLE integrations ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_integrations_org ON integrations(org_id);

DROP POLICY IF EXISTS integrations_tenant_isolation ON integrations;
CREATE POLICY integrations_tenant_isolation
  ON integrations
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));
```

El backfill es `UPDATE FROM agencies` porque `agencies.org_id` ya existe post-SaaS conversion (migración 132).

### 4.4 Flujo de `issueVoucher` — paso a paso

```
INPUT: draft (InvoiceDraft con id, items, importes, receptor, etc.)

1. idempotency_key = `${org_id}:${pto_vta}:${cbte_tipo}:${draft.id}`

2. INSERT INTO afip_voucher_requests (
     invoice_id, org_id, agency_id,
     idempotency_key, attempt_n = 1,
     operation = 'create',
     request_payload = <payload completo>,
     started_at = NOW()
   )
   → Si ya existe una row con ese idempotency_key y attempt_n=1:
      → query el estado: si completed_at IS NOT NULL → return el resultado guardado (idempotente)
      → si completed_at IS NULL y started_at < NOW()-30s → orphan, abort y marcar error
      → si completed_at IS NULL y started_at >= NOW()-30s → 409 "en curso, reintente"

3. TRY: afip.ElectronicBilling.createNextVoucher(payload, { returnFullResponse: true })
   - Timeout Node: 45s (el endpoint declara `export const maxDuration = 60` para que Railway dé margen sobre los 45s del SDK + los ~10s de verify + overhead)
   - CATCH (timeout | network | undefined response):
       → Llamar recoverVoucher(tentative_number_from_getLastVoucher_+_1, pto_vta, cbte_tipo)
       → recoverVoucher inserta afip_voucher_requests (operation='recover', attempt_n=2)
       → Si recovery encuentra el CAE → adopt como response, set attempt_n=2
       → Si recovery determina que NO se creó → rethrow para retry manual
   - CATCH (error AFIP con código): save error + error_code, status='rejected', return
   - SUCCESS: save response_payload

4. Post-success: afip.ElectronicBilling.getVoucherInfo(voucher_number, pto_vta, cbte_tipo)
   - INSERT afip_voucher_requests (operation='verify', attempt_n=1, ...)
   - Compare fields: CAE, CbteFch, ImpTotal, ImpNeto, ImpIVA, DocNro, DocTipo
   - diff = <objeto con campos que difieren>
   - IF diff vacío: verification_status = 'verified'
     ELSE IF getVoucherInfo devolvió null: verification_status = 'not_found_in_afip'
     ELSE: verification_status = 'discrepancy'
   - UPDATE invoices SET
       cae, cae_fch_vto, cbte_nro (del create),
       verification_status, verified_at = NOW(),
       status = 'authorized'
     WHERE id = draft.id

   NOTA: `status` (operacional: draft/pending/authorized/rejected) y `verification_status`
   (calidad: unverified/verified/discrepancy/not_found_in_afip) son campos INDEPENDIENTES.
   Una factura con `status='authorized'` + `verification_status='discrepancy'` existe en AFIP
   pero los importes/fechas no coinciden con lo que creemos que mandamos — requiere
   investigación manual sin bloquear operaciones downstream (cobros, asientos contables).

5. UPDATE afip_voucher_requests
     SET response_payload, verified_payload, verification_diff,
         completed_at, verified_at
     WHERE idempotency_key = ... AND attempt_n = ...

OUTPUT: IssueResult {
  cae, cbte_nro, cae_fch_vto,
  verification_status, diff?,
  request_id (ref a afip_voucher_requests.id)
}
```

### 4.5 Recovery — detalle

```
recoverVoucher(tentativeNumber, ptoVta, cbteTipo):
  last = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo)

  CASE last === tentativeNumber:
    // AFIP lo tomó, recuperar info
    info = await afip.ElectronicBilling.getVoucherInfo(last, ptoVta, cbteTipo)
    return { success: true, adopted: true, voucher: info }

  CASE last === tentativeNumber - 1:
    // AFIP NO lo tomó, el draft puede reintentarse con mismo número
    return { success: false, adopted: false, canRetry: true }

  CASE last > tentativeNumber:
    // Anomalía: alguien más emitió después — manual alert
    return { success: false, adopted: false, anomaly: true }

  CASE last < tentativeNumber - 1:
    // Gap — tentative venía de getLastVoucher anterior desactualizado
    return { success: false, canRetry: true, note: 'stale-tentative' }
```

### 4.6 Cotización USD

En `POST /api/invoices/[id]/authorize` antes del `issueVoucher`:

```typescript
if (invoice.moneda === 'DOL') {
  const oficial = await afipService.getAfipRate('DOL', new Date(invoice.fecha_emision))
  const user = Number(invoice.cotizacion)
  const delta = Math.abs(user - oficial) / oficial

  if (delta > 0.02) {
    return NextResponse.json({
      error: 'Cotización fuera del ±2% oficial AFIP — bloqueo para evitar rechazo',
      suggested_rate: oficial,
      your_rate: user,
      diff_pct: (delta * 100).toFixed(2),
    }, { status: 400 })
  }

  if (!user || user <= 1) {
    // Si el user no ingresó cotización, usar oficial
    await supabase.from('invoices').update({ cotizacion: oficial }).eq('id', id)
  }
}
```

El caché in-memory `rateCache` del service expira a 1h. Es local al proceso Node (Railway tiene 1 replica active → suficiente).

### 4.7 UI consolidation

**Archivo a mantener:** `app/(dashboard)/operations/billing/new/page.tsx` (full page, sidebar resumen, multi-agency PV picker).

**Archivo a borrar:** `components/invoices/new-invoice-dialog.tsx`.

**Callers de la dialog** (a migrar): buscar con grep `NewInvoiceDialog` y en cada caller reemplazar el open-dialog pattern por `router.push('/operations/billing/new?operationId=X')`.

**Validaciones a portar de dialog → page** (cosas que la dialog tenía y la page no):
- Factura C cuando el emisor es monotributista (leer de `/api/finances/settings` → `tax_regime`).
- Fetch proactivo de cotización oficial al seleccionar moneda=DOL (la page lo hace solo al cambiar operación, debería hacerlo también al cambiar moneda).
- Validación visual "Tu cotización difiere X% del oficial".

### 4.8 Endpoint existente `authorize` — cambios

`app/api/invoices/[id]/authorize/route.ts` queda como un thin controller que delega a `AfipService`:

```typescript
export async function POST(request, { params }) {
  const { id } = await params
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  // Fetch invoice con RLS: si no tiene acceso, no la encuentra.
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, invoice_items(*)')
    .eq('id', id)
    .single()

  if (!invoice) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Cotización pre-check
  if (invoice.moneda === 'DOL') {
    const check = await validateUsdRate(invoice)
    if (!check.ok) return check.response
  }

  const afipService = await getAfipServiceForOrg(supabase, invoice.org_id)
  if (!afipService) return NextResponse.json({ error: 'AFIP no configurado' }, { status: 400 })

  const result = await afipService.issueVoucher(invoice)

  return NextResponse.json({
    success: result.success,
    cae: result.cae,
    cbte_nro: result.cbte_nro,
    verification_status: result.verification_status,
    diff: result.diff,
    request_id: result.request_id,
  })
}
```

### 4.9 Nuevo endpoint: verify on-demand

```
POST /api/invoices/[id]/verify
  → afipService.verifyVoucher(id)
  → INSERT afip_voucher_requests (operation='verify')
  → UPDATE invoices SET verified_at, verification_status
  → Return { verification_status, diff?, last_sync_at }
```

UI: botón "Re-sincronizar con AFIP" en detalle de factura.

## 5. Testing

### 5.1 Unit tests (Jest)

`__tests__/afip/diff.test.ts`:
- `diffVoucher({sent, received})` → cuando importes coinciden, retorna `null`
- Cuando `CbteFch` difiere → retorna `{ CbteFch: { sent, received } }`
- Cuando `ImpTotal` difiere por > 1 centavo → marca diff
- Cuando difiere por ≤ 1 centavo → tolerancia (AFIP redondea raro)

`__tests__/afip/recovery.test.ts`:
- Mock `getLastVoucher` → `tentative`, mock `getVoucherInfo` → voucher → `adopted: true`
- Mock `getLastVoucher` → `tentative - 1` → `canRetry: true`
- Mock `getLastVoucher` → `tentative + 5` → `anomaly: true`

`__tests__/afip/cotizacion.test.ts`:
- User rate == oficial → pasa
- User rate == oficial * 1.01 (1% diff) → pasa
- User rate == oficial * 1.03 (3% diff) → 400 con `suggested_rate`
- No user rate → usar oficial

### 5.2 Integration tests

`__tests__/afip/tenant-isolation.test.ts` (usa Supabase test DB):
- Crear org A + org B, cada una con una agencia y una invoice
- Loguear como user de org A → `.from('invoices').select()` → solo ve la de A
- Intentar `.from('invoices').update().eq('id', invoiceB)` → 0 rows affected (RLS bloquea)
- Repetir para `integrations` y `afip_voucher_requests`

### 5.3 Smoke test en homologación

Script `scripts/afip-smoke-test.ts`:
1. Config CUIT de testing (homologación AFIP) → `cuit: 20409378472`
2. Emite Factura B $1.000
3. Verifica `verification_status === 'verified'`
4. Re-verify on-demand
5. Simula timeout (mock del SDK que rejecta) → verifica recovery logic
6. Simula discrepancia (mock que devuelve ImpTotal distinto) → `status === 'discrepancy'`

Corre manualmente antes de deploy — NO parte del CI (no queremos pegarle a AFIP homo en cada PR).

## 6. Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Backfill de `org_id` en `invoices` falla porque alguna agency no tiene `org_id` | Baja (el SaaS conversion ya migró todo) | Pre-check con SELECT antes del UPDATE; si detecta órfanas, abort con listado |
| RLS rompe queries legítimos existentes (p.ej. rutas `/admin/*` que cruzan orgs) | Media | `platform_admins` ya existe con bypass — verificar que routes admin usen `createAdminClient` y no el user client |
| `getVoucherInfo` tira error para facturas muy viejas (antes de la feature) | Media | Solo hacer verify automático para facturas emitidas **después** de esta fase. Para las viejas, endpoint verify on-demand manual. Flag `verification_status='unverified'` por default en backfill |
| El SDK de afipsdk cambia comportamiento de `returnFullResponse` | Baja | Smoke test en homo antes de deploy. Mantener `lib/afip/afip-client.ts` como fallback si hay que rollback |
| Rate limiting de AFIP por CUIT con múltiples tenants | Media-alta | Queue `p-queue` en el AfipService con concurrency 2 por CUIT; si error 600 "already authenticated", backoff 2min |
| El migration rompe prod por RLS mal escrito | Alta si falla | Correr migration primero como `BEGIN; ... ROLLBACK;` en consola SQL para validar syntax, después committear. Testear manualmente con 2 users distintos antes de mergear |
| UI consolidation rompe flows de usuarios actuales | Media | Deprecar dialog en etapa 1: redirect a page con warning toast; en etapa 2: remove. Da 1 semana de margen |

## 7. Open questions

No dejo nada sin resolver que bloquee implementación, pero estos puntos se refinan en el plan de implementación:

1. **¿Qué pasa con facturas viejas que nunca fueron verificadas?** — decisión tentativa: dejarlas `verification_status='unverified'`. UI tiene botón "Verificar esta factura ahora" que ejecuta `verifyVoucher`. No se hace bulk retro-verify automático.
2. **¿Cuánto tiempo se retienen los payloads JSONB en `afip_voucher_requests`?** — tentativamente sin TTL (data contable, podría necesitarse para auditoría fiscal 5 años). A revisitar si el espacio en DB se vuelve issue.
3. **¿Notificación al user cuando hay discrepancy?** — V1: banner rojo en detalle de factura + columna `verification_status` con badge en el listado. V2 (fuera de scope): email / push notification.

## 8. Entregables concretos (lista archivos)

Archivos **nuevos**:
- `supabase/migrations/20260424000XXX_afip_hardening.sql`
- `lib/afip/afip-service.ts`
- `lib/afip/diff.ts` (helper puro para comparar lo enviado vs lo verificado)
- `lib/afip/rate-cache.ts` (cache in-memory de cotizaciones)
- `app/api/invoices/[id]/verify/route.ts`
- `__tests__/afip/diff.test.ts`
- `__tests__/afip/recovery.test.ts`
- `__tests__/afip/cotizacion.test.ts`
- `__tests__/afip/tenant-isolation.test.ts`
- `scripts/afip-smoke-test.ts`

Archivos **modificados**:
- `lib/supabase/types.ts` (regenerar tras migración)
- `app/api/invoices/[id]/authorize/route.ts` (delegar a AfipService)
- `app/api/invoices/route.ts` (set org_id en insert)
- `lib/afip/afip-helpers.ts` (scope por org_id)
- `app/(dashboard)/operations/billing/new/page.tsx` (port validaciones que estaban solo en dialog)
- Callers de `NewInvoiceDialog` (migrar a router.push)

Archivos **eliminados**:
- `components/invoices/new-invoice-dialog.tsx`

Nueva dependencia npm:
- `p-queue` (^8.x) — queue para rate-limit per-CUIT en `AfipService`, evita que el SDK hitee a AFIP con concurrency excesiva ante bursts de facturación.

## 9. Métricas de éxito post-deploy

Dashboard (o query manual inicial) tracked:
- `% de invoices con verification_status='verified'` → objetivo >98% tras 7 días
- `Cantidad de afip_voucher_requests con operation='recover'` → cualquier valor >0 es señal de que el recovery está funcionando (no que haya bug)
- `Cantidad de invoices con verification_status='discrepancy'` → objetivo 0; cualquier >0 se investiga manualmente
- `Mediana de tiempo between create.started_at y verify.completed_at` → objetivo <5s
- `Cantidad de errores 10119 por cotización` → objetivo 0 tras el deploy (el pre-check lo bloquea)

## 10. Próximo paso

Tras aprobación del usuario de este spec, se invoca el skill `superpowers:writing-plans` para producir un **plan de implementación paso-a-paso** con orden de tareas, dependencias y checkpoints de review. Ese plan vive en `docs/superpowers/plans/2026-04-24-afip-hardening.md`.
