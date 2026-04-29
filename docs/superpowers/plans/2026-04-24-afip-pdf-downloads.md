# AFIP PDF Downloads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el flujo de descargas de facturas electrónicas AFIP: fix QR oficial RG 4291 en PDF individual, refactor a RLS/`org_id`, extraer renderer a lib pura, nuevo endpoint bulk ZIP con filtros de fecha/tipo/estado, y botón "Descargar ZIP" en la UI.

**Architecture:** PDF render se extrae del route handler a `lib/pdf/invoice-pdf.ts` (función pura). QR payload en `lib/afip/qr.ts` (formato AFIP RG 4291 → base64 URL-safe → URL). Bulk endpoint reusa el renderer con promise pool (concurrency=5) + jszip streaming. UI consume filtros activos del listado.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase RLS, `pdf-lib` (ya instalado), `qrcode` (nuevo), `jszip` (nuevo), Jest.

**Ref spec:** `/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/specs/2026-04-24-afip-pdf-downloads-design.md`

**Git policy:** Commits locales frecuentes OK. Push final al terminar todo con OK explícito del user.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `lib/afip/qr.ts` | `buildAfipQrPayload(invoice, emisorCuit)` + `buildAfipQrUrl(payload)` — pure functions, formato RG 4291 |
| `lib/pdf/invoice-pdf.ts` | `renderInvoicePdf(params)` — función pura que genera PDF bytes con QR embebido |
| `app/api/invoices/export/route.ts` | `GET /api/invoices/export` — bulk ZIP con filtros fecha/tipo/estado |
| `__tests__/afip/qr.test.ts` | Unit tests del QR payload + URL format |
| `__tests__/pdf/invoice-pdf.test.ts` | Unit tests del renderer (bytes válidos, QR embebido) |
| `__tests__/invoices/export.test.ts` | Unit tests del bulk endpoint (filtros, max, ZIP content) |

### Modified files

| Path | Change |
|---|---|
| `package.json` | +deps `qrcode`, `jszip`, `@types/qrcode` |
| `app/api/invoices/[id]/pdf/route.ts` | Thin controller: RLS + `getAfipServiceForOrg` + delega a `renderInvoicePdf` |
| `components/invoices/invoices-page-client.tsx` | Botón "Descargar ZIP" en header del listado con handler + default mes corriente |

### No migration SQL

Schema no cambia. Multi-tenancy ya resuelto por SP-1 fase 1a.

---

## Phase 1 — Foundation (deps + pure helpers)

### Task 1: Instalar dependencias npm

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar qrcode + jszip + tipos**

Run:
```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm install qrcode@^1.5.3 jszip@^3.10.1 && npm install -D @types/qrcode@^1.5.5
```

Expected: `package.json` updated, `package-lock.json` updated. No install errors.

- [ ] **Step 2: Verificar versiones instaladas**

Run:
```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && cat package.json | python3 -c 'import json,sys; d=json.load(sys.stdin); deps={**d.get("dependencies",{}), **d.get("devDependencies",{})}; print("qrcode:", deps.get("qrcode")); print("jszip:", deps.get("jszip")); print("@types/qrcode:", deps.get("@types/qrcode"))'
```

Expected: los 3 paquetes aparecen con versión ≥ la pedida.

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add package.json package-lock.json && git commit -m "$(cat <<'EOF'
deps(afip): add qrcode + jszip for PDF downloads (SP-1c)

- qrcode ^1.5.3: genera PNG del QR AFIP RG 4291 (pure JS, ~160KB)
- jszip ^3.10.1: bulk ZIP streaming para endpoint /export (pure JS, ~100KB)
- @types/qrcode: type safety

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: QR AFIP payload helper (TDD)

**Files:**
- Create: `lib/afip/qr.ts`
- Test: `__tests__/afip/qr.test.ts`

- [ ] **Step 1: Escribir el test**

Create `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/afip/qr.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { buildAfipQrPayload, buildAfipQrUrl } from "@/lib/afip/qr"

describe("buildAfipQrPayload", () => {
  const baseInvoice = {
    fecha_emision: "2026-04-24",
    pto_vta: 1,
    cbte_tipo: 6,
    cbte_nro: 42,
    imp_total: 12100.5,
    moneda: "PES",
    cotizacion: 1,
    receptor_doc_tipo: 99,
    receptor_doc_nro: "0",
    cae: "12345678901234",
  }

  it("builds payload with all required RG 4291 fields", () => {
    const payload = buildAfipQrPayload(baseInvoice as any, "20123456789")
    expect(payload).toEqual({
      ver: 1,
      fecha: "2026-04-24",
      cuit: 20123456789,
      ptoVta: 1,
      tipoCmp: 6,
      nroCmp: 42,
      importe: 12100.5,
      moneda: "PES",
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      tipoCodAut: "E",
      codAut: 12345678901234,
    })
  })

  it("converts string CAE to number", () => {
    const payload = buildAfipQrPayload(baseInvoice as any, "20123456789")
    expect(typeof payload.codAut).toBe("number")
    expect(payload.codAut).toBe(12345678901234)
  })

  it("converts string doc nro to number", () => {
    const inv = { ...baseInvoice, receptor_doc_nro: "20999888777" }
    const payload = buildAfipQrPayload(inv as any, "20123456789")
    expect(payload.nroDocRec).toBe(20999888777)
  })

  it("handles USD currency", () => {
    const inv = { ...baseInvoice, moneda: "DOL", cotizacion: 1415 }
    const payload = buildAfipQrPayload(inv as any, "20123456789")
    expect(payload.moneda).toBe("DOL")
    expect(payload.ctz).toBe(1415)
  })
})

describe("buildAfipQrUrl", () => {
  it("encodes payload as base64 URL-safe and prepends AFIP URL", () => {
    const payload = {
      ver: 1,
      fecha: "2026-04-24",
      cuit: 20123456789,
      ptoVta: 1,
      tipoCmp: 6,
      nroCmp: 42,
      importe: 12100.5,
      moneda: "PES",
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      tipoCodAut: "E",
      codAut: 12345678901234,
    }
    const url = buildAfipQrUrl(payload)
    expect(url).toMatch(/^https:\/\/www\.afip\.gob\.ar\/fe\/qr\/\?p=/)
    const encoded = url.slice("https://www.afip.gob.ar/fe/qr/?p=".length)
    // base64 URL-safe: no +, no /, no = padding
    expect(encoded).not.toMatch(/[+/=]/)
    // Decodable back to the original payload
    const standard = encoded.replace(/-/g, "+").replace(/_/g, "/")
    const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4)
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf-8"))
    expect(decoded).toEqual(payload)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/qr.test.ts`

Expected: FAIL with "Cannot find module '@/lib/afip/qr'".

- [ ] **Step 3: Implement qr.ts**

Create `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/afip/qr.ts`:

```typescript
/**
 * QR AFIP (RG 4291) — generador de payload y URL para validación.
 *
 * El QR oficial AFIP contiene un JSON codificado en base64 URL-safe,
 * prependido con la URL del validador de AFIP. Cuando el receptor escanea
 * el QR con la cámara, va al validador oficial y confirma autenticidad.
 *
 * Spec: https://www.afip.gob.ar/fe/qr/especificaciones.asp (RG 4291)
 */

export interface AfipQrPayload {
  ver: 1
  fecha: string      // YYYY-MM-DD
  cuit: number       // CUIT emisor
  ptoVta: number
  tipoCmp: number    // tipo comprobante AFIP (1=A, 6=B, 11=C, 19=E...)
  nroCmp: number
  importe: number    // ImpTotal
  moneda: string     // "PES" | "DOL" | etc
  ctz: number        // cotización
  tipoDocRec: number // tipo documento receptor
  nroDocRec: number
  tipoCodAut: "E" | "A" // E=CAE, A=CAEA
  codAut: number
}

interface InvoiceForQr {
  fecha_emision: string
  pto_vta: number
  cbte_tipo: number
  cbte_nro: number
  imp_total: number
  moneda: string
  cotizacion: number
  receptor_doc_tipo: number
  receptor_doc_nro: string
  cae: string
}

/**
 * Construye el payload AFIP QR desde los campos de una factura autorizada.
 * El CUIT del emisor viene del afip config de la agencia, no de la factura.
 */
export function buildAfipQrPayload(
  invoice: InvoiceForQr,
  emisorCuit: string
): AfipQrPayload {
  return {
    ver: 1,
    fecha: invoice.fecha_emision,
    cuit: Number(emisorCuit),
    ptoVta: invoice.pto_vta,
    tipoCmp: invoice.cbte_tipo,
    nroCmp: invoice.cbte_nro,
    importe: Number(invoice.imp_total),
    moneda: invoice.moneda,
    ctz: Number(invoice.cotizacion),
    tipoDocRec: invoice.receptor_doc_tipo,
    nroDocRec: Number(invoice.receptor_doc_nro) || 0,
    tipoCodAut: "E",
    codAut: Number(invoice.cae),
  }
}

/**
 * Codifica el payload en base64 URL-safe y arma la URL de validación.
 * base64 URL-safe: + → -, / → _, sin padding = (RFC 4648 §5).
 */
export function buildAfipQrUrl(payload: AfipQrPayload): string {
  const json = JSON.stringify(payload)
  const base64 = Buffer.from(json, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`
}
```

- [ ] **Step 4: Run test to verify PASS**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/qr.test.ts`

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add lib/afip/qr.ts __tests__/afip/qr.test.ts && git commit -m "$(cat <<'EOF'
feat(afip): QR payload + URL generator (RG 4291)

- buildAfipQrPayload(invoice, emisorCuit): JSON con los 13 campos oficiales
- buildAfipQrUrl(payload): base64 URL-safe + URL oficial AFIP
- Pure functions, 5 tests unit

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Invoice PDF renderer (pure, con QR embebido)

**Files:**
- Create: `lib/pdf/invoice-pdf.ts`
- Test: `__tests__/pdf/invoice-pdf.test.ts`

Esta task EXTRAE el renderer desde el route handler actual (272 LOC) a una función pura, **y agrega el QR**. El route handler se actualiza en Task 4.

- [ ] **Step 1: Escribir el test primero**

Create `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/pdf/invoice-pdf.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { renderInvoicePdf, type InvoicePdfParams } from "@/lib/pdf/invoice-pdf"

describe("renderInvoicePdf", () => {
  const baseParams: InvoicePdfParams = {
    invoice: {
      id: "inv-001",
      cbte_tipo: 6,
      pto_vta: 1,
      cbte_nro: 42,
      cae: "12345678901234",
      cae_fch_vto: "20260530",
      fecha_emision: "2026-04-24",
      fch_serv_desde: "2026-04-20",
      fch_serv_hasta: "2026-04-24",
      imp_total: 12100,
      imp_neto: 10000,
      imp_iva: 2100,
      imp_tot_conc: 0,
      imp_op_ex: 0,
      receptor_nombre: "Juan Pérez",
      receptor_doc_tipo: 96,
      receptor_doc_nro: "12345678",
      receptor_condicion_iva: 5,
      amount_entry_mode: "NET",
      moneda: "PES",
      cotizacion: 1,
      invoice_items: [
        {
          descripcion: "Paquete turístico Cancún 7 días",
          cantidad: 1,
          precio_unitario: 10000,
          subtotal: 10000,
          iva_porcentaje: 21,
          iva_importe: 2100,
          total: 12100,
          tax_treatment: "GRAVADO",
        },
      ],
    },
    emisor: { cuit: "20123456789", razonSocial: "Agencia Test SA" },
    agency: { name: "Agencia Test" },
    footerCompanyName: "MAXEVA",
  }

  it("returns a non-empty Uint8Array", async () => {
    const bytes = await renderInvoicePdf(baseParams)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it("produces a valid PDF (starts with %PDF header)", async () => {
    const bytes = await renderInvoicePdf(baseParams)
    const header = Buffer.from(bytes.slice(0, 4)).toString("ascii")
    expect(header).toBe("%PDF")
  })

  it("embeds the AFIP QR when CAE is present", async () => {
    const bytes = await renderInvoicePdf(baseParams)
    // PDF with embedded PNG has a FlateDecode stream for the image
    const pdfString = Buffer.from(bytes).toString("binary")
    expect(pdfString).toContain("/Subtype /Image")
  })

  it("skips QR when invoice has no CAE (draft state)", async () => {
    const params = {
      ...baseParams,
      invoice: { ...baseParams.invoice, cae: "" },
    }
    const bytes = await renderInvoicePdf(params)
    expect(bytes.length).toBeGreaterThan(1000)
    // No image embedded
    const pdfString = Buffer.from(bytes).toString("binary")
    expect(pdfString).not.toContain("/Subtype /Image")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/pdf/invoice-pdf.test.ts`

Expected: FAIL with "Cannot find module '@/lib/pdf/invoice-pdf'".

- [ ] **Step 3: Implement invoice-pdf.ts**

Create `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/pdf/invoice-pdf.ts`:

```typescript
/**
 * Renderer de facturas electrónicas AFIP a PDF.
 *
 * Pure function: recibe los datos denormalizados (invoice + items + emisor +
 * agency) y devuelve Uint8Array del PDF. No toca Supabase ni request.
 *
 * Incluye el QR oficial AFIP (RG 4291) en el footer cuando hay CAE.
 */

import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib"
import QRCode from "qrcode"
import { COMPROBANTE_LABELS } from "@/lib/afip/types"
import {
  formatInvoiceMoney,
  ITEM_TAX_TREATMENT_LABELS,
  shouldHideInvoiceTaxBreakdown,
} from "@/lib/invoices/calculation"
import { buildAfipQrPayload, buildAfipQrUrl } from "@/lib/afip/qr"

export interface InvoicePdfParams {
  invoice: any
  emisor: { cuit: string; razonSocial: string }
  agency: { name: string }
  footerCompanyName?: string
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const fmtDate = (s?: string | null) => {
  if (!s) return "-"
  if (s.length === 8) return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`
  try {
    return new Date(s).toLocaleDateString("es-AR")
  } catch {
    return s
  }
}

export async function renderInvoicePdf(params: InvoicePdfParams): Promise<Uint8Array> {
  const { invoice, emisor, agency, footerCompanyName } = params

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage(PageSizes.A4) // 595 × 842 pt
  const { width, height } = page.getSize()

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const black = rgb(0, 0, 0)
  const gray = rgb(0.45, 0.45, 0.45)
  const light = rgb(0.92, 0.92, 0.92)
  const orange = rgb(0.85, 0.33, 0.1)

  const L = 40
  const R = width - 40
  const W = R - L
  let y = height - 40

  const line = (x1: number, y1: number, x2: number, y2: number, color = black, t = 0.5) => {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color })
  }
  const rect = (x: number, ry: number, w: number, h: number, fillColor = light) => {
    page.drawRectangle({ x, y: ry, width: w, height: h, color: fillColor })
  }
  const text = (t: string, x: number, ty: number, size = 9, font = regular, color = black) => {
    page.drawText(t, { x, y: ty, size, font, color })
  }

  const hideTaxBreakdown = shouldHideInvoiceTaxBreakdown({
    amountEntryMode: invoice.amount_entry_mode,
    cbteTipo: invoice.cbte_tipo,
    receptorCondicionIva: invoice.receptor_condicion_iva,
  })
  const fmtMoney = (value: number) => formatInvoiceMoney(value, invoice.moneda)

  // HEADER
  rect(L, y - 54, W, 56, orange)
  text("FACTURA ELECTRÓNICA", L + 8, y - 16, 14, bold, rgb(1, 1, 1))
  const comprobanteLabel =
    COMPROBANTE_LABELS[invoice.cbte_tipo as keyof typeof COMPROBANTE_LABELS] ??
    `Tipo ${invoice.cbte_tipo}`
  text(comprobanteLabel.toUpperCase(), L + 8, y - 32, 11, bold, rgb(1, 1, 1))
  if (invoice.cbte_nro) {
    const nroStr = `${String(invoice.pto_vta).padStart(4, "0")}-${String(invoice.cbte_nro).padStart(8, "0")}`
    text(`Nro: ${nroStr}`, R - 130, y - 22, 10, bold, rgb(1, 1, 1))
  }
  text(`P. Venta: ${String(invoice.pto_vta).padStart(4, "0")}`, R - 130, y - 36, 9, regular, rgb(1, 1, 1))
  y -= 60

  // EMISOR / RECEPTOR
  const mid = L + W / 2
  rect(L, y - 52, W / 2 - 2, 54, light)
  rect(mid + 2, y - 52, W / 2 - 2, 54, light)

  text("EMISOR", L + 6, y - 10, 8, bold, gray)
  text(agency.name, L + 6, y - 22, 9, bold)
  if (emisor.cuit) {
    const c = emisor.cuit
    text(`CUIT: ${c.slice(0, 2)}-${c.slice(2, -1)}-${c.slice(-1)}`, L + 6, y - 34, 9, regular)
  }
  text("Responsable Inscripto", L + 6, y - 46, 8, regular, gray)

  text("RECEPTOR", mid + 8, y - 10, 8, bold, gray)
  text(invoice.receptor_nombre, mid + 8, y - 22, 9, bold)
  const docLabel =
    invoice.receptor_doc_tipo === 99 ? "Doc"
    : invoice.receptor_doc_tipo === 80 ? "CUIT"
    : invoice.receptor_doc_tipo === 86 ? "CUIL"
    : "DNI"
  text(`${docLabel}: ${invoice.receptor_doc_nro}`, mid + 8, y - 34, 9, regular)
  const condStr =
    invoice.receptor_condicion_iva === 5 ? "Consumidor Final"
    : invoice.receptor_condicion_iva === 1 ? "Responsable Inscripto"
    : invoice.receptor_condicion_iva === 6 ? "Monotributista"
    : "Consumidor Final"
  text(condStr, mid + 8, y - 46, 8, regular, gray)
  y -= 60

  // FECHAS
  const fechaEmision = invoice.fecha_emision ?? invoice.created_at
  text(`Fecha de emisión: ${fmtDate(fechaEmision)}`, L, y, 8, regular, gray)
  if (invoice.fch_serv_desde) {
    text(`Periodo: ${fmtDate(invoice.fch_serv_desde)} al ${fmtDate(invoice.fch_serv_hasta)}`, mid, y, 8, regular, gray)
  }
  y -= 18

  // TABLA ITEMS
  const rowH = 14
  const colDesc = L
  const colQty = L + W * 0.52
  const colPrice = L + W * 0.63
  const colIva = L + W * 0.76
  const colTotal = L + W * 0.87

  rect(L, y - rowH, W, rowH + 2, rgb(0.2, 0.2, 0.2))
  text("DESCRIPCIÓN", colDesc + 4, y - rowH + 4, 8, bold, rgb(1, 1, 1))
  text("CANT.", colQty + 2, y - rowH + 4, 8, bold, rgb(1, 1, 1))
  text("P. UNIT.", colPrice + 2, y - rowH + 4, 8, bold, rgb(1, 1, 1))
  text(hideTaxBreakdown ? "TRAT." : "IVA%", colIva + 2, y - rowH + 4, 8, bold, rgb(1, 1, 1))
  text("TOTAL", colTotal + 2, y - rowH + 4, 8, bold, rgb(1, 1, 1))
  y -= rowH + 4

  const items: any[] = invoice.invoice_items ?? []
  items.forEach((item, i) => {
    const rowColor = i % 2 === 0 ? rgb(1, 1, 1) : light
    rect(L, y - rowH, W, rowH + 1, rowColor)
    const taxTreatment = (item.tax_treatment || (item.iva_porcentaje === 0 ? "EXENTO" : "GRAVADO")) as keyof typeof ITEM_TAX_TREATMENT_LABELS
    const maxDescChars = 42
    const desc = item.descripcion.length > maxDescChars ? item.descripcion.slice(0, maxDescChars) + "..." : item.descripcion

    text(desc, colDesc + 4, y - rowH + 3, 8, regular)
    text(String(item.cantidad), colQty + 2, y - rowH + 3, 8, regular)
    text(fmtMoney(item.precio_unitario), colPrice + 2, y - rowH + 3, 8, regular)
    text(
      hideTaxBreakdown
        ? ITEM_TAX_TREATMENT_LABELS[taxTreatment]
        : `${item.iva_porcentaje}%`,
      colIva + 2,
      y - rowH + 3,
      8,
      regular
    )
    text(fmtMoney(item.total), colTotal + 2, y - rowH + 3, 8, regular)
    y -= rowH + 2
  })

  line(L, y, R, y)
  y -= 10

  // TOTALES
  const totW = 160
  const totX = R - totW
  const addTotalRow = (label: string, value: number, isBold = false) => {
    text(label, totX, y, 9, isBold ? bold : regular, isBold ? black : gray)
    const valueLabel = fmtMoney(value)
    text(valueLabel, R - 4 - regular.widthOfTextAtSize(valueLabel, 9), y, 9, isBold ? bold : regular)
    y -= 14
  }

  if (!hideTaxBreakdown && Number(invoice.imp_neto || 0) > 0) addTotalRow("Neto gravado:", invoice.imp_neto ?? 0)
  if (!hideTaxBreakdown && Number(invoice.imp_tot_conc || 0) > 0) addTotalRow("No gravado:", invoice.imp_tot_conc ?? 0)
  if (!hideTaxBreakdown && Number(invoice.imp_op_ex || 0) > 0) addTotalRow("Exento:", invoice.imp_op_ex ?? 0)
  if (!hideTaxBreakdown && Number(invoice.imp_iva || 0) > 0) addTotalRow("IVA:", invoice.imp_iva ?? 0)
  addTotalRow(hideTaxBreakdown ? "TOTAL FINAL:" : "TOTAL:", invoice.imp_total, true)

  if (hideTaxBreakdown) {
    y -= 2
    text("IVA no discriminado en la presentacion al cliente.", totX, y, 7, regular, gray)
    y -= 12
  }
  if (invoice.moneda === "DOL") {
    y -= 2
    text(`(USD × ${fmt(invoice.cotizacion ?? 1)} ARS/USD)`, totX, y, 7, regular, gray)
    y -= 12
  }
  y -= 6

  // CAE BOX + QR
  if (invoice.cae) {
    const boxH = 90
    rect(L, y - boxH, W, boxH, rgb(0.95, 0.98, 0.95))
    line(L, y - boxH, R, y - boxH, rgb(0.3, 0.65, 0.3), 0.8)
    line(L, y, R, y, rgb(0.3, 0.65, 0.3), 0.8)

    text("COMPROBANTE AUTORIZADO POR AFIP", L + 8, y - 14, 9, bold, rgb(0.1, 0.5, 0.1))
    text(`CAE Nro: ${invoice.cae}`, L + 8, y - 30, 9, regular)
    text(`Vencimiento CAE: ${fmtDate(invoice.cae_fch_vto)}`, L + 8, y - 44, 9, regular)
    text(
      `Comprobante: ${String(invoice.pto_vta).padStart(4, "0")}-${String(invoice.cbte_nro).padStart(8, "0")}`,
      L + 8,
      y - 58,
      9,
      regular
    )

    // QR AFIP oficial (embed PNG)
    const qrPayload = buildAfipQrPayload(invoice, emisor.cuit)
    const qrUrl = buildAfipQrUrl(qrPayload)
    const qrPngBuffer = await QRCode.toBuffer(qrUrl, {
      errorCorrectionLevel: "M",
      width: 160,
      margin: 1,
    })
    const qrImage = await pdfDoc.embedPng(qrPngBuffer)
    const qrSize = 72
    page.drawImage(qrImage, { x: R - 8 - qrSize, y: y - boxH + 8, width: qrSize, height: qrSize })
    text("Verificá en AFIP", R - 8 - qrSize, y - 14, 7, regular, gray)

    y -= boxH + 10
  }

  // FOOTER
  const company = footerCompanyName || agency.name
  line(L, 35, R, 35, gray, 0.3)
  text(`Comprobante generado por ${company} - Sistema de Gestion`, L, 22, 7, regular, gray)
  text("Verificá en: www.afip.gob.ar/fe/qr", R - 160, 22, 7, regular, gray)

  return await pdfDoc.save()
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/pdf/invoice-pdf.test.ts`

Expected: PASS (4 tests).

Si falla alguno: lee el output cuidadosamente. Posibles issues:
- `pdf-lib` embedPng falla con el Buffer → pasar `Uint8Array` en lugar de Buffer.
- El test "embeds QR" no encuentra "/Subtype /Image" → el pdf-lib puede usar diferente encoding. Probar con otra aserción que confirme dimensiones cambiadas (PDF con QR es bytes-ier).

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add lib/pdf/invoice-pdf.ts __tests__/pdf/invoice-pdf.test.ts && git commit -m "$(cat <<'EOF'
feat(pdf): invoice PDF renderer con QR AFIP oficial embebido

- Pure function extraída del route handler actual
- QR oficial RG 4291 embebido como PNG (error correction M, 72pt)
- Skip QR cuando invoice no tiene CAE (draft state)
- 4 tests unit

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Individual PDF refactor

### Task 4: Refactor `/api/invoices/[id]/pdf` route

**Files:**
- Modify: `app/api/invoices/[id]/pdf/route.ts`

- [ ] **Step 1: Leer el archivo actual para entender estructura**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && wc -l app/api/invoices/\[id\]/pdf/route.ts`

Expected: ~272 líneas (antes del refactor). Post-refactor queda ~50.

- [ ] **Step 2: Reemplazar el contenido completo**

Replace the entire content of `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/invoices/[id]/pdf/route.ts` with:

```typescript
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getAfipServiceForOrg } from "@/lib/afip/afip-service"
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * GET /api/invoices/[id]/pdf
 *
 * Devuelve el PDF de una factura con QR AFIP oficial embebido (RG 4291).
 * RLS scope: si el user no pertenece al org de la factura, 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 })
    }

    const { data: invoice, error: fetchError } = await (supabase.from("invoices") as any)
      .select("*, invoice_items (*)")
      .eq("id", id)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    // Agency (para nombre en emisor del PDF)
    const { data: agency } = await (supabase.from("agencies") as any)
      .select("id, name")
      .eq("id", invoice.agency_id)
      .single()

    // Emisor CUIT via AfipService (scopeado por org_id)
    const afipSvc = await getAfipServiceForOrg(supabase, invoice.org_id)
    const emisorCuit = (afipSvc as any)?.config?.cuit || ""

    // Footer company name opcional desde organization_settings
    const { data: orgSettings } = await (supabase.from("organization_settings") as any)
      .select("key, value")
    const footerCompanyName =
      orgSettings?.find((s: any) => s.key === "company_name")?.value || agency?.name

    const pdfBytes = await renderInvoicePdf({
      invoice,
      emisor: { cuit: emisorCuit, razonSocial: agency?.name ?? "" },
      agency: { name: agency?.name ?? "Agencia" },
      footerCompanyName,
    })

    const compStr = invoice.cbte_nro
      ? `${String(invoice.pto_vta).padStart(4, "0")}-${String(invoice.cbte_nro).padStart(8, "0")}`
      : id.slice(0, 8)

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="factura-${compStr}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error("Error generating invoice PDF:", error)
    return NextResponse.json({ error: error.message || "Error al generar PDF" }, { status: 500 })
  }
}
```

- [ ] **Step 3: Build check**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -20`

Expected: build succeeds.

- [ ] **Step 4: Verify tests still pass (no regression)**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test 2>&1 | tail -10`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add app/api/invoices/\[id\]/pdf/route.ts && git commit -m "$(cat <<'EOF'
refactor(invoices/pdf): thin controller + RLS + delegate a renderInvoicePdf

- Elimina 222 LOC de lógica inline de pdf-lib
- Usa RLS por org_id (consistente con SP-1 authorize/verify)
- getAfipServiceForOrg en vez de getAfipConfigForAgency (legacy)
- Delega rendering a lib/pdf/invoice-pdf.ts (incluye QR AFIP oficial)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Bulk export endpoint

### Task 5: `GET /api/invoices/export` (bulk ZIP)

**Files:**
- Create: `app/api/invoices/export/route.ts`
- Test: `__tests__/invoices/export.test.ts`

- [ ] **Step 1: Escribir el test primero**

Create `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/invoices/export.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { NextRequest } from "next/server"

// Mocks
const mockGetCurrentUser = jest.fn()
const mockCreateServerClient = jest.fn()
const mockRenderInvoicePdf = jest.fn()
const mockGetAfipServiceForOrg = jest.fn()

jest.mock("@/lib/auth", () => ({
  getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
}))
jest.mock("@/lib/supabase/server", () => ({
  createServerClient: (...args: any[]) => mockCreateServerClient(...args),
}))
jest.mock("@/lib/pdf/invoice-pdf", () => ({
  renderInvoicePdf: (...args: any[]) => mockRenderInvoicePdf(...args),
}))
jest.mock("@/lib/afip/afip-service", () => ({
  getAfipServiceForOrg: (...args: any[]) => mockGetAfipServiceForOrg(...args),
}))
jest.mock("@/lib/permissions", () => ({
  canAccessModule: () => true,
}))

function makeMockInvoice(id: string, cbte_nro: number, agency_id: string) {
  return {
    id,
    org_id: "org-aaa",
    agency_id,
    cbte_nro,
    pto_vta: 1,
    cbte_tipo: 6,
    status: "authorized",
    cae: "12345678901234",
    fecha_emision: "2026-04-15",
    invoice_items: [],
  }
}

function makeMockSupabase(opts: {
  invoices: any[]
  count?: number
  agencies?: any[]
}) {
  return {
    from: (table: string) => {
      if (table === "invoices") {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          gte: () => chain,
          lte: () => chain,
          order: () => chain,
          limit: () => chain,
          then: (cb: any) => cb({ data: opts.invoices, error: null, count: opts.count ?? opts.invoices.length }),
        }
        return chain
      }
      if (table === "agencies") {
        const chain: any = {
          select: () => chain,
          in: () => ({
            then: (cb: any) => cb({ data: opts.agencies ?? [{ id: "ag-1", name: "Agencia 1" }], error: null }),
          }),
        }
        return chain
      }
      if (table === "organization_settings") {
        const chain: any = {
          select: () => ({
            then: (cb: any) => cb({ data: [], error: null }),
          }),
        }
        return chain
      }
      return {}
    },
  }
}

describe("GET /api/invoices/export", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } })
    mockGetAfipServiceForOrg.mockResolvedValue({ config: { cuit: "20123456789" } })
    mockRenderInvoicePdf.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))
  })

  it("returns a ZIP with one entry per invoice", async () => {
    mockCreateServerClient.mockResolvedValue(
      makeMockSupabase({
        invoices: [
          makeMockInvoice("inv-1", 42, "ag-1"),
          makeMockInvoice("inv-2", 43, "ag-1"),
        ],
      })
    )
    const { GET } = await import("@/app/api/invoices/export/route")
    const req = new NextRequest(
      "http://localhost/api/invoices/export?from=2026-04-01&to=2026-04-30"
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/zip")
    const blob = await res.arrayBuffer()
    expect(blob.byteLength).toBeGreaterThan(0)
    expect(mockRenderInvoicePdf).toHaveBeenCalledTimes(2)
  })

  it("returns 400 when more than 500 invoices match the filter", async () => {
    mockCreateServerClient.mockResolvedValue(makeMockSupabase({ invoices: [], count: 501 }))
    const { GET } = await import("@/app/api/invoices/export/route")
    const req = new NextRequest(
      "http://localhost/api/invoices/export?from=2026-01-01&to=2026-12-31"
    )
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/reduce|demasiadas/i)
  })

  it("returns 400 when no invoices match", async () => {
    mockCreateServerClient.mockResolvedValue(makeMockSupabase({ invoices: [], count: 0 }))
    const { GET } = await import("@/app/api/invoices/export/route")
    const req = new NextRequest(
      "http://localhost/api/invoices/export?from=2026-04-01&to=2026-04-30"
    )
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/no hay facturas/i)
  })

  it("returns 400 when from/to params are missing", async () => {
    mockCreateServerClient.mockResolvedValue(makeMockSupabase({ invoices: [] }))
    const { GET } = await import("@/app/api/invoices/export/route")
    const req = new NextRequest("http://localhost/api/invoices/export")
    const res = await GET(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/invoices/export.test.ts`

Expected: FAIL with "Cannot find module '@/app/api/invoices/export/route'".

- [ ] **Step 3: Implement the endpoint**

Create `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/invoices/export/route.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getAfipServiceForOrg } from "@/lib/afip/afip-service"
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf"
import JSZip from "jszip"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX_INVOICES = 500
const CONCURRENCY = 5

/**
 * GET /api/invoices/export?from=YYYY-MM-DD&to=YYYY-MM-DD&cbte_tipo=6&status=authorized
 *
 * Descarga ZIP con PDFs de las facturas del tenant (RLS) que matchean los
 * filtros. Max 500 por request. Default status='authorized'.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getCurrentUser()
    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 })
    }

    const sp = request.nextUrl.searchParams
    const from = sp.get("from")
    const to = sp.get("to")
    const cbteTipoParam = sp.get("cbte_tipo")
    const statusParam = sp.get("status") ?? "authorized"

    if (!from || !to) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos: from y to (YYYY-MM-DD)" },
        { status: 400 }
      )
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json(
        { error: "Formato de fecha inválido. Usá YYYY-MM-DD" },
        { status: 400 }
      )
    }

    const supabase = await createServerClient()

    // Query con RLS automático por org_id
    let query = (supabase.from("invoices") as any)
      .select("*, invoice_items (*)", { count: "exact" })
      .gte("fecha_emision", from)
      .lte("fecha_emision", to)
      .eq("status", statusParam)
      .order("cbte_nro", { ascending: true })
      .limit(MAX_INVOICES + 1)

    if (cbteTipoParam) {
      query = query.eq("cbte_tipo", parseInt(cbteTipoParam, 10))
    }

    const { data: invoices, count, error } = await query

    if (error) {
      console.error("Error fetching invoices for export:", error)
      return NextResponse.json({ error: "Error al consultar facturas" }, { status: 500 })
    }

    const invoicesList: any[] = invoices ?? []
    if (invoicesList.length === 0) {
      return NextResponse.json({ error: "No hay facturas con esos filtros" }, { status: 400 })
    }

    if (invoicesList.length > MAX_INVOICES || (typeof count === "number" && count > MAX_INVOICES)) {
      return NextResponse.json(
        {
          error: `Demasiadas facturas (${count ?? invoicesList.length}). Reduce el rango de fechas o agregá filtros. Máximo ${MAX_INVOICES} por descarga.`,
        },
        { status: 400 }
      )
    }

    // Batch fetch agencies (para nombre emisor)
    const agencyIds = Array.from(new Set(invoicesList.map((i) => i.agency_id).filter(Boolean)))
    const { data: agencies } = await (supabase.from("agencies") as any)
      .select("id, name, org_id")
      .in("id", agencyIds)
    const agencyById = new Map((agencies ?? []).map((a: any) => [a.id, a]))

    // Batch fetch AFIP configs por org_id (typically 1 org per user)
    const orgIds = Array.from(new Set(invoicesList.map((i) => i.org_id)))
    const afipCuitByOrg = new Map<string, string>()
    for (const orgId of orgIds) {
      const svc = await getAfipServiceForOrg(supabase, orgId)
      afipCuitByOrg.set(orgId, (svc as any)?.config?.cuit ?? "")
    }

    // Footer company name (unique per org)
    const { data: orgSettings } = await (supabase.from("organization_settings") as any).select("key, value")
    const footerCompanyName = orgSettings?.find((s: any) => s.key === "company_name")?.value

    // Promise pool (concurrency=5) para render paralelo
    const zip = new JSZip()
    const errors: Array<{ id: string; error: string }> = []

    for (let i = 0; i < invoicesList.length; i += CONCURRENCY) {
      const batch = invoicesList.slice(i, i + CONCURRENCY)
      await Promise.all(
        batch.map(async (inv) => {
          try {
            const agency: any = agencyById.get(inv.agency_id)
            const emisorCuit = afipCuitByOrg.get(inv.org_id) ?? ""
            const pdfBytes = await renderInvoicePdf({
              invoice: inv,
              emisor: { cuit: emisorCuit, razonSocial: agency?.name ?? "" },
              agency: { name: agency?.name ?? "Agencia" },
              footerCompanyName,
            })
            const pv = String(inv.pto_vta).padStart(4, "0")
            const nro = String(inv.cbte_nro ?? 0).padStart(8, "0")
            zip.file(`factura-${pv}-${nro}.pdf`, pdfBytes)
          } catch (err: any) {
            errors.push({ id: inv.id, error: err?.message ?? String(err) })
          }
        })
      )
    }

    if (errors.length > 0 && zip.files && Object.keys(zip.files).length === 0) {
      // Todas fallaron
      return NextResponse.json(
        { error: "No se pudo generar ninguna factura", details: errors.slice(0, 5) },
        { status: 500 }
      )
    }

    const zipBytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    })

    return new NextResponse(Buffer.from(zipBytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="facturas-${from}-${to}.zip"`,
        ...(errors.length > 0 ? { "X-Export-Partial-Errors": String(errors.length) } : {}),
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/invoices/export:", error)
    return NextResponse.json(
      { error: error.message || "Error al exportar facturas" },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/invoices/export.test.ts`

Expected: 4 PASS.

Si alguno falla:
- El mock de supabase chain puede no coincidir con el orden real de chaining del código — ajustar mock para matchear.
- El "fetch agency.in" puede no ser awaited correctamente — el mock devuelve `{ then: ... }` que funciona si el código usa `await query`.

- [ ] **Step 5: Build check**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -10`

Expected: build succeeds, new route `/api/invoices/export` en output.

- [ ] **Step 6: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add app/api/invoices/export/route.ts __tests__/invoices/export.test.ts && git commit -m "$(cat <<'EOF'
feat(invoices): GET /api/invoices/export (bulk ZIP)

- Filtros: from, to (requeridos YYYY-MM-DD), cbte_tipo, status (default=authorized)
- Max 500 facturas por request (400 si excede)
- RLS automático por org_id
- Promise pool concurrency=5 para render paralelo
- Partial errors via X-Export-Partial-Errors header
- Filename: facturas-{from}-{to}.zip, entries: factura-{pv}-{nro}.pdf

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — UI

### Task 6: Botón "Descargar ZIP" en listado

**Files:**
- Modify: `components/invoices/invoices-page-client.tsx`

- [ ] **Step 1: Inspect current filter state structure**

Run:
```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && grep -n 'filters\|useState\|dateFrom\|dateTo' components/invoices/invoices-page-client.tsx | head -20
```

Expected: shows where `filters` state lives, what keys exist.

Leer el archivo completo (`Read` tool) para entender la estructura y dónde insertar el botón (idealmente al lado de otros botones de acción en el header del listado).

- [ ] **Step 2: Agregar imports (si no están)**

En los imports del componente, asegurá que están:

```tsx
import { Download, Loader2 } from "lucide-react"
```

(`Button`, `useState`, `useToast` seguramente ya están — chequeá antes.)

- [ ] **Step 3: Agregar state + handler**

Al lado del state existente de filters (o cerca), agregar:

```tsx
const [exporting, setExporting] = useState(false)

const handleExport = async () => {
  setExporting(true)
  try {
    const now = new Date()
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

    // Adaptar los nombres `filters.dateFrom`/`filters.dateTo`/etc al schema real
    // detectado en el Step 1. Si se llaman distinto, usar esos nombres.
    const params = new URLSearchParams({
      from: (filters as any).dateFrom || firstOfMonth,
      to: (filters as any).dateTo || lastOfMonth,
    })
    if ((filters as any).cbteType) params.set("cbte_tipo", String((filters as any).cbteType))
    if ((filters as any).status) params.set("status", String((filters as any).status))

    const res = await fetch(`/api/invoices/export?${params}`)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Error desconocido" }))
      toast({
        title: "No se pudo descargar",
        description: err.error || `HTTP ${res.status}`,
        variant: "destructive",
      })
      return
    }

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `facturas-${params.get("from")}-${params.get("to")}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast({
      title: "Descarga iniciada",
      description: "El ZIP con las facturas se está descargando.",
    })
  } catch (err: any) {
    toast({
      title: "Error de red",
      description: err?.message || "No se pudo contactar el servidor",
      variant: "destructive",
    })
  } finally {
    setExporting(false)
  }
}
```

- [ ] **Step 4: Agregar el botón en el header del listado**

Ubicar el header/toolbar del listado (donde están los filtros o botones de acción) y agregar:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={handleExport}
  disabled={exporting}
>
  {exporting ? (
    <Loader2 className="h-4 w-4 animate-spin mr-2" />
  ) : (
    <Download className="h-4 w-4 mr-2" />
  )}
  Descargar ZIP
</Button>
```

Colocar junto al botón "Nueva Factura" si existe, o al top de la tabla.

- [ ] **Step 5: Build + lint check**

Run:
```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -15
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add components/invoices/invoices-page-client.tsx && git commit -m "$(cat <<'EOF'
feat(invoices): botón 'Descargar ZIP' en listado

Usa los filtros activos (fecha/tipo/estado) o defaultea al mes corriente
si no hay filtros. Descarga desde /api/invoices/export con toast de
estado. Disabled + spinner mientras descarga.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Final verification

### Task 7: Full test + build + lint + smoke + push

- [ ] **Step 1: Full Jest run**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test 2>&1 | tail -10`

Expected: todos los tests PASS. Contar: debería haber ~580 tests (570 pre-SP-1c + 5 qr + 4 pdf + 4 export).

- [ ] **Step 2: Build**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -10`

Expected: build succeeds, nuevas rutas `/api/invoices/export` listed.

- [ ] **Step 3: Lint**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run lint 2>&1 | tail -10; echo 'EXIT:' $?`

Expected: exit 0.

- [ ] **Step 4: Smoke manual — pedir al user que haga**

Presentar al user:

1. Arrancar dev: `npm run dev` (puerto 3044).
2. Ir a `/operations/billing`.
3. Click en una factura autorizada real → "Descargar PDF" → abrir en Preview (macOS) o evince (Linux).
4. Verificar que aparece el QR en el box verde del CAE.
5. Con iPhone Camera o cualquier scanner QR, apuntar al QR → debería abrir `https://www.afip.gob.ar/fe/qr/?p=...` en el navegador.
6. Ese link debería mostrar los datos del comprobante en el validador oficial AFIP.
7. Volver al listado, click "Descargar ZIP" → descargar un ZIP del mes corriente → abrir ZIP → verificar que tiene un PDF por factura con el naming correcto.

Si algo falla en el scan manual del QR — reporte con screenshot y investigamos el payload.

- [ ] **Step 5: Pedir OK al user para push**

Mensaje:
> "Tests pasan, build ok, lint ok. Tengo N commits locales (contar con `git log origin/main..HEAD --oneline | wc -l`). ¿Pusheo a main para que Railway deploy?"

Esperar OK explícito (memoria `feedback_no_push_until_told.md`).

- [ ] **Step 6: Push tras OK**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git push origin main
```

---

## Post-deploy monitoring

Métricas a trackear en Supabase SQL Editor post-deploy:

**1. ZIP downloads exitosos (implícito por logs Railway):**
```sql
-- No hay DB table de logs de export; monitorear via Railway logs filtering
-- por "Error in GET /api/invoices/export" vs logs de éxito 200.
```

**2. QR scans funcionan end-to-end:** smoke test manual mensual con un iPhone.

**3. Si aparece un usuario con >500 facturas/mes queriendo export:**
- Agregar paginación real: `offset` param + "Descargar próxima página".
- O subir el `MAX_INVOICES` si es volumen razonable.

**4. Cache-friendliness:** el endpoint no cachea (cada request genera fresh). Si aparece issue de perf, considerar cacheo por invoice.id con hash de updated_at.

---

## Next steps (fuera de este plan)

1. **SP-2** — Ganancia Facturación (1-click desde operación con monto custom del margen).
2. **SP-1b** — Onboarding wizard (CUIT + clave fiscal + auto-detect WS autorizados).
3. **SP-3** — Libro IVA Digital mensual (TXT AFIP).
4. **SP-4** — Factura T turismo extranjeros (RG 3971).
