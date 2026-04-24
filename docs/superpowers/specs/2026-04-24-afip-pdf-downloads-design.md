# AFIP PDF Downloads — Design (SP-1 fase 1c)

**Status:** draft awaiting user review
**Author:** Claude (sesión 2026-04-24, brainstorming skill)
**Scope:** Fase 1c del programa AFIP. Complementa SP-1 fase 1a (AFIP Hardening ya deployed) y precede SP-1 fase 1b (onboarding wizard) + SP-2 (Ganancia Facturación).

---

## 1. Contexto y objetivo

El equipo de Maxi (agencia Lozada) necesita **descargar las facturas emitidas** desde el sistema, no desde el portal AFIP manual. Hoy existe un endpoint `GET /api/invoices/[id]/pdf` (272 LOC) que genera un PDF con `pdf-lib` — pero tiene dos problemas:

1. **No incluye el QR oficial AFIP**. El texto "Verificá en: www.afip.gob.ar/fe/qr" aparece en el footer, pero nunca se renderiza el QR mismo. **Esto convierte las facturas en impugnables** — RG 4291 requiere QR embebido en toda factura electrónica.
2. **Usa `agency_id` legacy**, no `org_id` + RLS (el multi-tenant del SP-1).

Además, no existe **descarga masiva** — si el contador pide "todas las facturas de marzo" hay que descargar de a una.

El objetivo de esta fase: **cerrar el loop de descargas** con QR AFIP válido, multi-tenant correcto, y bulk ZIP con filtros.

## 2. Success criteria

Cuando esta fase esté deployada:

1. **Toda factura descargada incluye el QR oficial AFIP** embebido como imagen en el PDF, con payload correcto según RG 4291.
2. **El endpoint de PDF individual respeta RLS por org_id** — un user de Lozada no puede descargar facturas de LOLO aunque conozca el UUID.
3. **Existe `GET /api/invoices/export`** que devuelve un ZIP con todas las facturas del tenant filtradas por fecha / tipo / estado, con streaming (no OOM en 500 facturas).
4. **El listado de facturas tiene botón "Descargar ZIP"** que reusa los filtros activos y descarga el archivo al click.
5. **Cero facturas fuera del scope del user** en el ZIP — RLS filtra antes de generar.
6. **El endpoint individual sigue funcionando para las existentes** post-refactor — backward compat con facturas pre-SP-1 (que pueden tener `org_id` backfilled).

## 3. Non-goals

- Email / WhatsApp de facturas a clientes → future.
- Archivo firmado digitalmente (PDF/A) → future, requiere certificado distinto del AFIP.
- Pre-generar PDFs en storage → no es cuello de botella.
- Usar el endpoint `createPDF` de afipsdk.com → costo sin beneficio sobre pdf-lib local.
- Soporte offline / PWA → future.
- Bulk > 500 facturas en un solo request → paginación del user; si pide más, 400 con instrucción.

## 4. Arquitectura

### 4.1 Componentes

```
┌────────────────────────────────────────────────────┐
│  UI: components/invoices/invoices-page-client.tsx  │
│  - Botón "Descargar ZIP" junto a filtros           │
│  - Botón "Descargar PDF" por row (ya existe)       │
└──────────────────┬─────────────────────────────────┘
                   │
                   ├── GET /api/invoices/[id]/pdf  (REFACTOR)
                   │   - RLS por org_id
                   │   - Inyecta QR AFIP
                   │
                   └── GET /api/invoices/export    (NUEVO)
                       - Filtros: from, to, cbte_tipo, status
                       - Max 500 facturas → ZIP streaming

┌────────────────────────────────────────────────────┐
│  lib/afip/qr.ts (NUEVO)                            │
│  - buildAfipQrPayload(invoice, afipConfig)         │
│  - Retorna URL "https://www.afip.gob.ar/fe/qr/?p=..." │
│  - Pure function, 100% testeable                   │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  lib/pdf/invoice-pdf.ts (REFACTOR desde route.ts) │
│  - renderInvoicePdf(invoice, emisorConfig)         │
│  - Incluye embed de QR via qrcode npm              │
│  - Pure function, no depende de request/supabase  │
│  - Reutilizable desde /pdf y desde /export         │
└────────────────────────────────────────────────────┘
```

### 4.2 QR AFIP — payload spec

Según el manual oficial AFIP RG 4291:

```typescript
// Payload JSON antes de codificar
{
  ver: 1,
  fecha: "2026-04-24",              // ISO YYYY-MM-DD
  cuit: 20123456789,                // número, CUIT emisor
  ptoVta: 1,                        // número
  tipoCmp: 6,                       // número (6 = Factura B)
  nroCmp: 42,                       // número
  importe: 12100.00,                // number, ImpTotal
  moneda: "PES",                    // "PES" | "DOL"
  ctz: 1,                           // cotización
  tipoDocRec: 99,                   // tipo documento receptor
  nroDocRec: 0,                     // número documento receptor
  tipoCodAut: "E",                  // "E" = CAE, "A" = CAEA
  codAut: 12345678901234            // CAE como número
}
```

Codificación: `JSON.stringify` → base64 URL-safe (sin padding) → concatenar a `https://www.afip.gob.ar/fe/qr/?p=<base64>`

La URL resultante se renderiza como QR PNG vía `qrcode` npm (embed como PNG base64 en el PDF).

### 4.3 PDF refactor — extracción

El código actual (272 LOC) vive dentro del route handler. Se extrae a `lib/pdf/invoice-pdf.ts` como función pura:

```typescript
export async function renderInvoicePdf(params: {
  invoice: InvoiceWithItems
  emisor: { cuit: string; name: string }
  agency: { name: string }
  orgFooterCompanyName?: string
}): Promise<Uint8Array> {
  // mismo contenido actual + QR embed en footer
}
```

El route handler queda como thin controller:
```typescript
const invoice = await supabase.from('invoices').select('*, invoice_items(*)').eq('id', id).single() // RLS
const afipSvc = await getAfipServiceForOrg(supabase, invoice.org_id)
const agency = await supabase.from('agencies').select('name').eq('id', invoice.agency_id).single()
const pdfBytes = await renderInvoicePdf({ invoice, emisor: afipSvc.config, agency, ... })
return new NextResponse(Buffer.from(pdfBytes), { ... })
```

### 4.4 Bulk export — endpoint y flujo

```
GET /api/invoices/export?
  from=2026-03-01&         ISO YYYY-MM-DD (requerido, fecha_emision >= from)
  to=2026-03-31&           ISO YYYY-MM-DD (requerido, fecha_emision <= to)
  cbte_tipo=6&             opcional
  status=authorized        opcional, default='authorized'
```

Flujo:
1. Validar params (Zod schema).
2. Query `.select('*, invoice_items(*)').gte('fecha_emision', from).lte('fecha_emision', to)...` con RLS automatic.
3. Si count > 500 → `return 400 { error: 'Demasiadas facturas. Reduce el rango de fechas o filtros.' }`.
4. Si count == 0 → `return 400 { error: 'No hay facturas con esos filtros.' }`.
5. Para cada factura, fetch agency + emisor AFIP config (group by agency_id primero para no N+1).
6. Promise pool (concurrency=5) sobre `renderInvoicePdf(inv)` → buffer.
7. Build ZIP con `jszip`: `factura-<ptoVta>-<nro>.pdf` por cada.
8. `return new NextResponse(zipBuffer, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="facturas-<from>-<to>.zip"' })`.

### 4.5 UI

En `components/invoices/invoices-page-client.tsx`:

1. Nuevo botón en el header del listado (junto a los filtros o arriba de la tabla):
   ```tsx
   <Button variant="outline" onClick={handleExport} disabled={exporting}>
     {exporting ? <Loader2 className="animate-spin" /> : <Download />}
     Descargar ZIP
   </Button>
   ```
2. Handler usa los filtros activos del state (existing) para construir query string. Si no hay `dateFrom`/`dateTo` en los filtros UI, el handler defaultea al **mes actual** (primero al último día del mes corriente), evitando 400 por params faltantes:
   ```typescript
   const now = new Date()
   const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
   const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

   const params = new URLSearchParams({
     from: filters.dateFrom || firstOfMonth,
     to: filters.dateTo || lastOfMonth,
     ...(filters.cbteType && { cbte_tipo: filters.cbteType }),
     ...(filters.status && { status: filters.status }),
   })
   const res = await fetch(`/api/invoices/export?${params}`)
   if (!res.ok) {
     const err = await res.json()
     toast({ title: 'Error', description: err.error, variant: 'destructive' })
     return
   }
   const blob = await res.blob()
   const url = URL.createObjectURL(blob)
   const a = document.createElement('a')
   a.href = url
   a.download = `facturas-${filters.dateFrom}-${filters.dateTo}.zip`
   a.click()
   URL.revokeObjectURL(url)
   toast({ title: 'Descarga iniciada', description: `ZIP con facturas.` })
   ```

## 5. Testing

### 5.1 Unit — QR payload

`__tests__/afip/qr.test.ts`:
- Payload structure exacto contra ejemplo oficial de AFIP (hardcoded fixture).
- Base64 URL-safe: no `+`, `/`, `=` padding.
- URL format: `https://www.afip.gob.ar/fe/qr/?p=<base64>`.
- CAE como número (no string).

### 5.2 Unit — PDF render

`__tests__/pdf/invoice-pdf.test.ts`:
- `renderInvoicePdf(mockInvoice)` retorna `Uint8Array` > 0 bytes.
- `pdf-parse` (dev dep) extrae texto y verifica: CAE presente, números de factura presente, receptor presente.
- Parse como PDF válido (no corrupto).

### 5.3 Unit — Bulk export filter

`__tests__/invoices/export.test.ts`:
- Mock supabase con 3 facturas, 1 de otro org (RLS simulation).
- Llamada a handler retorna ZIP con 2 entries (solo del org del user).
- Filtros de fecha funcionan.
- > 500 → 400.
- 0 resultados → 400.

### 5.4 Smoke manual

1. Descargar PDF de una factura autorizada real → abrir en Preview → verificar QR presente + scaneable (iPhone Camera lo abre → muestra URL AFIP).
2. Descargar ZIP de un mes completo → verify filenames + count.
3. Scanear QR de factura en el portal AFIP real → confirmar que resuelve al comprobante.

## 6. Riesgos y mitigaciones

| Riesgo | Prob | Mitigación |
|---|---|---|
| `qrcode` npm genera QR con nivel de error bajo y no escanea | Baja | Usar error correction level `M` (default); smoke test scan con iPhone |
| Bulk export OOM en 500 facturas (cada PDF ~50KB → 25MB JSON en memoria) | Media | Streaming con jszip `generateAsync({ streamFiles: true })` + buffer incremental; fallback: reducir max a 200 si hay issues |
| N+1 queries en bulk (agency + afip config por cada factura) | Alta sin mitigación | Group by `agency_id` y fetch una sola vez por agency; cache en memoria por request |
| Facturas pre-SP-1 sin `org_id` fallan el RLS | Baja | El backfill del SP-1 ya aseguró NOT NULL + todas tienen org_id. Validated en tenant-isolation test |
| PDF refactor rompe facturas en curso | Media | Tests contra PDF actual + mantener mismo layout visual. Smoke test antes de push |
| QR payload format incorrecto → AFIP rechaza verificación | Media | Contra ejemplo oficial de RG 4291 + smoke real scan |

## 7. Entregables concretos

### Archivos nuevos
- `lib/afip/qr.ts` — payload + URL generator
- `lib/pdf/invoice-pdf.ts` — render puro (extracción desde route)
- `app/api/invoices/export/route.ts` — bulk ZIP endpoint
- `__tests__/afip/qr.test.ts`
- `__tests__/pdf/invoice-pdf.test.ts`
- `__tests__/invoices/export.test.ts`

### Archivos modificados
- `app/api/invoices/[id]/pdf/route.ts` — thin controller, usa `renderInvoicePdf` + RLS
- `components/invoices/invoices-page-client.tsx` — botón "Descargar ZIP"
- `package.json` — nueva dep `qrcode`, `jszip`, `@types/qrcode` (dev)

### No migración SQL
Este sub-proyecto no toca el schema. Todo el multi-tenant ya está resuelto por SP-1.

### Nuevas deps npm
- `qrcode` ^1.5.x — generación PNG (pure JS, ~160KB)
- `jszip` ^3.10.x — ZIP streaming (pure JS, ~100KB)
- `@types/qrcode` ^1.5.x (dev)

## 8. Open questions

1. **Filename convention:** `factura-{ptoVta}-{cbteNro}.pdf` (ej: `factura-0001-00000042.pdf`) es mi propuesta. Alternativas: incluir tipo (`FB-0001-00000042.pdf`), fecha, razón social. Default: el propuesto porque es único y AFIP-style.
2. **Facturas sin CAE (draft/rejected) en el bulk:** default `status=authorized` excluye. User puede pedir explícitamente `status=draft` para auditoría. Nunca descargar facturas con CAE vacío (omit silently) para no confundir.
3. **Max 500:** arbitrary pero razonable. Una agencia con 300 facturas/mes lo cubre. Si aparece un case de >500, aumentamos o implementamos paginación real.

## 9. Métricas post-deploy

- % de PDFs con QR verificable (smoke test 1 vez/mes scan manual)
- Tiempo de generación ZIP vs cantidad (target <15s para 500)
- Errores 400 por >500 → si son frecuentes, ajustamos max
- 500 errors del endpoint export → target 0

## 10. Próximo paso

Aprobación del user → `writing-plans` skill para el plan de implementación detallado → subagent-driven execution (mismo patrón de SP-1).
