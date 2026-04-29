# PDF Quotation Classifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter the WhatsApp dashboard "PDFs Enviados" metric so it only counts real quotations, not invoices/vouchers/etc, using a heuristic-first + LLM-fallback classifier that runs in a Railway cron.

**Architecture:** Add `is_quotation BOOLEAN` to `wa_messages`. A cron every 30 min picks unclassified outbound PDFs from the last 30 days, runs filename heuristics (regex), and falls back to GPT-4o-mini using only the filename. Result is persisted; the dashboard endpoint now filters by `is_quotation = true` and exposes a `pdfs_sent_pending_classification` counter for transparency.

**Tech Stack:** Next.js Route Handlers, Supabase Postgres, OpenAI SDK (already installed), Jest for unit tests.

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `supabase/migrations/20260427000004_wa_messages_is_quotation.sql` | Schema: add column + partial index | new |
| `lib/wha-control/classify-quotation.ts` | Pure functions: heuristic regex + LLM call + orchestrator | new |
| `lib/wha-control/__tests__/classify-quotation.test.ts` | Unit tests for heuristic and orchestrator | new |
| `app/api/cron/classify-quotation-pdfs/route.ts` | Cron endpoint (Bearer auth, admin client, batch process) | new |
| `app/api/wha-control/metrics/summary/route.ts` | Modify: filter by is_quotation + expose pending counter | modify |
| `components/tools/wha-control/metrics-dashboard.tsx` | Modify: subtitle + pending badge | modify |

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/20260427000004_wa_messages_is_quotation.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Clasificador PDFs cotización (#3 reunión Gabi)
-- is_quotation = NULL: pending classification
-- is_quotation = true: real quotation, cuenta para "PDFs Enviados"
-- is_quotation = false: otro doc (factura/voucher/etc), NO cuenta
ALTER TABLE wa_messages
  ADD COLUMN IF NOT EXISTS is_quotation BOOLEAN;

-- Índice parcial: el cron filtra rápido pendientes outbound recientes
CREATE INDEX IF NOT EXISTS idx_wa_messages_unclassified_pdfs
  ON wa_messages (sent_at DESC)
  WHERE message_type = 'document' AND is_quotation IS NULL AND direction = 'outbound';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260427000004_wa_messages_is_quotation.sql
git commit -m "feat(wa): #3 add wa_messages.is_quotation + partial index"
```

Note: el SQL se aplica en Supabase manualmente al final del feature (patrón `feedback_supabase_migrations.md`).

---

## Task 2: Heurística filename (TDD)

**Files:**
- Create: `lib/wha-control/__tests__/classify-quotation.test.ts`
- Create: `lib/wha-control/classify-quotation.ts`

- [ ] **Step 1: Write failing tests for `classifyByFilename`**

```typescript
// lib/wha-control/__tests__/classify-quotation.test.ts
import { classifyByFilename } from "../classify-quotation"

describe("classifyByFilename", () => {
  describe("positive cases (cotización)", () => {
    it.each([
      "Cotizacion_Maragogi.pdf",
      "presupuesto Familia Lopez.pdf",
      "PROPUESTA viaje Bariloche.pdf",
      "quotation_Q4_2026.pdf",
      "COT-2026-0042.pdf",
      "Cotización a Punta Cana - 4 pax.pdf",
    ])("should classify '%s' as quotation", (filename) => {
      const result = classifyByFilename(filename)
      expect(result?.is_quotation).toBe(true)
      expect(result?.source).toBe("heuristic_positive")
    })
  })

  describe("negative cases (otros docs)", () => {
    it.each([
      "Factura_AR_001.pdf",
      "invoice_2026-04.pdf",
      "Voucher_Hotel_Confirm.pdf",
      "asistencia_seguro.pdf",
      "Itinerario_final.pdf",
      "boleto_aerolinea.pdf",
      "ticket_AA1234.pdf",
      "Recibo_pago.pdf",
      "DNI_Lopez.pdf",
      "Pasaporte_titular.pdf",
      "comprobante_transferencia.pdf",
      "cartilla_medica.pdf",
    ])("should classify '%s' as NOT a quotation", (filename) => {
      const result = classifyByFilename(filename)
      expect(result?.is_quotation).toBe(false)
      expect(result?.source).toBe("heuristic_negative")
    })
  })

  describe("ambiguous cases", () => {
    it.each([
      "documento.pdf",
      "scan_001.pdf",
      "image-123456.pdf",
      "PDF_2026.pdf",
    ])("should return null for ambiguous '%s'", (filename) => {
      expect(classifyByFilename(filename)).toBeNull()
    })

    it("returns null for empty filename", () => {
      expect(classifyByFilename("")).toBeNull()
    })

    it("returns null for null", () => {
      expect(classifyByFilename(null)).toBeNull()
    })
  })

  describe("priority: positive wins if both regex match", () => {
    it("'Cotizacion factura.pdf' is treated as quotation (positive priority)", () => {
      const result = classifyByFilename("Cotizacion factura.pdf")
      expect(result?.is_quotation).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- lib/wha-control/__tests__/classify-quotation.test.ts
```

Expected: FAIL with "Cannot find module '../classify-quotation'".

- [ ] **Step 3: Write minimal implementation of `classifyByFilename`**

```typescript
// lib/wha-control/classify-quotation.ts

export type ClassificationSource =
  | "heuristic_positive"
  | "heuristic_negative"
  | "llm"
  | "llm_low_confidence"

export type ClassificationResult = {
  is_quotation: boolean
  source: ClassificationSource
  confidence?: number
}

const POSITIVE_RX = /\b(cotiz|presupuesto|quotation|propuesta|cot[-_])/i
const NEGATIVE_RX = /\b(factura|invoice|voucher|recibo|receipt|comprobante|asistencia|seguro|itiner|boleto|ticket|pasaporte|dni|cartilla)\b/i

export function classifyByFilename(filename: string | null): ClassificationResult | null {
  if (!filename) return null
  if (POSITIVE_RX.test(filename)) {
    return { is_quotation: true, source: "heuristic_positive" }
  }
  if (NEGATIVE_RX.test(filename)) {
    return { is_quotation: false, source: "heuristic_negative" }
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- lib/wha-control/__tests__/classify-quotation.test.ts
```

Expected: all 23+ tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wha-control/classify-quotation.ts lib/wha-control/__tests__/classify-quotation.test.ts
git commit -m "feat(wa): #3 filename heuristic for quotation PDF classifier"
```

---

## Task 3: LLM fallback (TDD with mock)

**Files:**
- Modify: `lib/wha-control/__tests__/classify-quotation.test.ts`
- Modify: `lib/wha-control/classify-quotation.ts`

- [ ] **Step 1: Write failing tests for `classifyByLLM`**

Append to the test file:

```typescript
import { classifyByLLM, classifyPdf } from "../classify-quotation"

// Mock OpenAI
jest.mock("openai", () => {
  const mockCreate = jest.fn()
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
    mockCreate,
  }
})

import OpenAI from "openai"
const { mockCreate } = OpenAI as unknown as { mockCreate: jest.Mock }

describe("classifyByLLM", () => {
  beforeEach(() => mockCreate.mockReset())

  it("returns is_quotation=true when LLM responds with quotation + high confidence", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ is_quotation: true, confidence: 0.92 }) } }],
    })
    const result = await classifyByLLM("propuesta viaje.pdf", "test-api-key")
    expect(result.is_quotation).toBe(true)
    expect(result.source).toBe("llm")
    expect(result.confidence).toBe(0.92)
  })

  it("returns is_quotation=false when LLM responds with confidence < 0.7", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ is_quotation: true, confidence: 0.5 }) } }],
    })
    const result = await classifyByLLM("documento.pdf", "test-api-key")
    expect(result.is_quotation).toBe(false)
    expect(result.source).toBe("llm_low_confidence")
  })

  it("returns is_quotation=false on malformed LLM response", async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: "not json" } }] })
    const result = await classifyByLLM("documento.pdf", "test-api-key")
    expect(result.is_quotation).toBe(false)
    expect(result.source).toBe("llm_low_confidence")
  })

  it("propagates LLM API errors", async () => {
    mockCreate.mockRejectedValueOnce(new Error("rate limit"))
    await expect(classifyByLLM("doc.pdf", "test-api-key")).rejects.toThrow("rate limit")
  })
})

describe("classifyPdf (orchestrator)", () => {
  beforeEach(() => mockCreate.mockReset())

  it("returns heuristic positive without calling LLM", async () => {
    const result = await classifyPdf("Cotizacion_Maragogi.pdf", "test-key")
    expect(result.is_quotation).toBe(true)
    expect(result.source).toBe("heuristic_positive")
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("returns heuristic negative without calling LLM", async () => {
    const result = await classifyPdf("factura_001.pdf", "test-key")
    expect(result.is_quotation).toBe(false)
    expect(result.source).toBe("heuristic_negative")
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("falls back to LLM for ambiguous filename", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ is_quotation: true, confidence: 0.85 }) } }],
    })
    const result = await classifyPdf("documento.pdf", "test-key")
    expect(result.is_quotation).toBe(true)
    expect(result.source).toBe("llm")
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it("returns false (without calling LLM) when filename is null", async () => {
    const result = await classifyPdf(null, "test-key")
    expect(result.is_quotation).toBe(false)
    expect(result.source).toBe("llm_low_confidence")
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- lib/wha-control/__tests__/classify-quotation.test.ts
```

Expected: new tests FAIL with "classifyByLLM is not a function" or similar.

- [ ] **Step 3: Implement `classifyByLLM` and `classifyPdf`**

Append to `lib/wha-control/classify-quotation.ts`:

```typescript
import OpenAI from "openai"

const LLM_MODEL = "gpt-4o-mini"
const CONFIDENCE_THRESHOLD = 0.7

const SYSTEM_PROMPT = `Clasificás nombres de archivos PDF enviados por una agencia de viajes argentina por WhatsApp. Tu tarea es decidir si el filename sugiere que es una COTIZACIÓN/PRESUPUESTO de viaje (true) o cualquier otro tipo de documento — facturas, vouchers, asistencias, comprobantes, DNIs, pasaportes, itinerarios — (false).

Respondé SOLO con JSON válido en formato exacto:
{"is_quotation": boolean, "confidence": number}

confidence es de 0 a 1. Si el filename es ambiguo o genérico ("documento.pdf", "scan001.pdf"), confidence debe ser baja (<0.5).`

export async function classifyByLLM(
  filename: string,
  apiKey: string,
): Promise<ClassificationResult> {
  const openai = new OpenAI({ apiKey })
  const completion = await openai.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Filename: ${filename}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 50,
  })

  const raw = completion.choices[0]?.message?.content || ""
  let parsed: { is_quotation?: boolean; confidence?: number }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { is_quotation: false, source: "llm_low_confidence", confidence: 0 }
  }

  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0
  const isQuot = !!parsed.is_quotation

  if (confidence < CONFIDENCE_THRESHOLD) {
    return { is_quotation: false, source: "llm_low_confidence", confidence }
  }
  return { is_quotation: isQuot, source: "llm", confidence }
}

export async function classifyPdf(
  filename: string | null,
  apiKey: string,
): Promise<ClassificationResult> {
  if (!filename) {
    return { is_quotation: false, source: "llm_low_confidence", confidence: 0 }
  }
  const heuristic = classifyByFilename(filename)
  if (heuristic) return heuristic
  return classifyByLLM(filename, apiKey)
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
npm test -- lib/wha-control/__tests__/classify-quotation.test.ts
```

Expected: all tests (heuristic + LLM + orchestrator) PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wha-control/classify-quotation.ts lib/wha-control/__tests__/classify-quotation.test.ts
git commit -m "feat(wa): #3 LLM fallback (GPT-4o-mini) for ambiguous PDF filenames"
```

---

## Task 4: Cron endpoint

**Files:**
- Create: `app/api/cron/classify-quotation-pdfs/route.ts`

- [ ] **Step 1: Write the endpoint**

```typescript
// app/api/cron/classify-quotation-pdfs/route.ts
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { classifyPdf } from "@/lib/wha-control/classify-quotation"

const BATCH_LIMIT = 200
const LOOKBACK_DAYS = 30

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 })
  }

  const supabase = createAdminClient() as any
  const since = new Date()
  since.setDate(since.getDate() - LOOKBACK_DAYS)
  const sinceIso = since.toISOString()

  const { data: rows, error } = await supabase
    .from("wa_messages")
    .select("id, media_file_name")
    .eq("message_type", "document")
    .eq("direction", "outbound")
    .is("is_quotation", null)
    .gte("sent_at", sinceIso)
    .order("sent_at", { ascending: false })
    .limit(BATCH_LIMIT)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const stats = { processed: 0, llm_calls: 0, heuristic_positive: 0, heuristic_negative: 0, errors: 0 }

  for (const row of (rows || []) as Array<{ id: string; media_file_name: string | null }>) {
    try {
      const result = await classifyPdf(row.media_file_name, openaiKey)
      if (result.source === "llm" || result.source === "llm_low_confidence") stats.llm_calls++
      if (result.source === "heuristic_positive") stats.heuristic_positive++
      if (result.source === "heuristic_negative") stats.heuristic_negative++

      const { error: updError } = await supabase
        .from("wa_messages")
        .update({ is_quotation: result.is_quotation })
        .eq("id", row.id)
      if (updError) {
        stats.errors++
        console.warn(`[classify-quotation-pdfs] update failed for ${row.id}:`, updError.message)
      } else {
        stats.processed++
      }
    } catch (err: any) {
      stats.errors++
      console.warn(`[classify-quotation-pdfs] classify failed for ${row.id}:`, err?.message)
    }
  }

  return NextResponse.json({ ok: true, stats, batch_size: rows?.length || 0 })
}

export async function POST(request: Request) {
  return GET(request)
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npx tsc --noEmit 2>&1 | grep -E "classify-quotation-pdfs"
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/classify-quotation-pdfs/route.ts
git commit -m "feat(wa): #3 cron endpoint to classify pending PDF rows"
```

---

## Task 5: Modify metrics summary

**Files:**
- Modify: `app/api/wha-control/metrics/summary/route.ts:130-167`

- [ ] **Step 1: Add `is_quotation` to the message SELECT**

Edit `app/api/wha-control/metrics/summary/route.ts` line 76 — add `is_quotation` to the `.select(...)`:

```typescript
// Cambiar:
let msgQuery = supabase
  .from("wa_messages")
  .select("id, device_id, chat_id, direction, sent_at, message_type, from_me, media_mime_type, media_file_name")

// Por:
let msgQuery = supabase
  .from("wa_messages")
  .select("id, device_id, chat_id, direction, sent_at, message_type, from_me, media_mime_type, media_file_name, is_quotation")
```

- [ ] **Step 2: Modify the PDF count loop**

Replace the current PDF counting block (around line 143-152) — the one that currently reads:

```typescript
// Count PDFs for ALL directions (both sent and received)
if (m.message_type === "document" && isPdfDocument(m, docPdfSet)) {
  if (m.direction === "outbound") {
    pdfs_sent_count++
  } else if (m.direction === "inbound") {
    pdfs_received_count++
  }
}
```

With:

```typescript
// Count PDFs. For OUTBOUND, only those classified as quotation (#3 reunión Gabi).
// PDFs sin clasificar (is_quotation === null) se cuentan en pdfs_sent_pending_classification
// para transparencia — el cron los procesa cada 30 min.
if (m.message_type === "document" && isPdfDocument(m, docPdfSet)) {
  if (m.direction === "outbound") {
    if (m.is_quotation === true) {
      pdfs_sent_count++
    } else if (m.is_quotation === null) {
      pdfs_sent_pending_classification++
    }
  } else if (m.direction === "inbound") {
    pdfs_received_count++
  }
}
```

- [ ] **Step 3: Add the new counter declaration and expose it**

Above the loop (around line 131), where `let inbound_count = 0` is declared, add:

```typescript
let pdfs_sent_pending_classification = 0
```

In the `summary` object returned (around line 294), add the new field:

```typescript
const summary = {
  inbound_count,
  outbound_count,
  active_chats_count: chatIds.size,
  new_chats_count: newChatsCount || 0,
  responded_chats_count: respondedCount,
  unanswered_chats_count: unansweredCount,
  avg_first_response_seconds,
  initiated_count,
  pdfs_sent_count,
  pdfs_sent_pending_classification, // NEW
  pdfs_received_count,
  pdfs_total_count: pdfs_sent_count + pdfs_received_count,
}
```

Also update `emptySummary()` (around line 328) to include the same field with value `0`.

- [ ] **Step 4: Verify typecheck passes**

```bash
npx tsc --noEmit 2>&1 | grep -E "wha-control/metrics/summary"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/api/wha-control/metrics/summary/route.ts
git commit -m "feat(wa): #3 metrics PDFs Enviados ahora cuenta solo cotizaciones"
```

---

## Task 6: Dashboard UI badge

**Files:**
- Modify: `components/tools/wha-control/metrics-dashboard.tsx`

- [ ] **Step 1: Update interface and tile**

Find the `Summary` type (around line 30) and add the new field:

```typescript
type Summary = {
  inbound_count: number
  outbound_count: number
  active_chats_count: number
  new_chats_count: number
  responded_chats_count: number
  unanswered_chats_count: number
  avg_first_response_seconds: number | null
  initiated_count: number
  pdfs_sent_count: number
  pdfs_sent_pending_classification: number  // NEW
  pdfs_received_count: number
  pdfs_total_count: number
}
```

Find the tile around line 135 that says `{ label: "PDFs Enviados", ...}` and replace its label so it says "(cotizaciones)" + render a tooltip badge for pending.

Locate where the tiles array is rendered (search for `summary.pdfs_sent_count`). Update label:

```typescript
{ label: "PDFs Enviados (cotizaciones)", value: summary.pdfs_sent_count, icon: FileText, color: "text-rose-600", subtitle: summary.pdfs_sent_pending_classification > 0 ? `+${summary.pdfs_sent_pending_classification} pendientes` : undefined },
```

If the tile renderer doesn't already support `subtitle`, add a `<span>` below the value that shows it. Find where the tile component renders and add a check:

```tsx
{tile.subtitle && (
  <span className="text-[10px] text-muted-foreground" title="PDFs sin clasificar — el sistema los procesa cada 30 min">
    {tile.subtitle}
  </span>
)}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npx tsc --noEmit 2>&1 | grep -E "metrics-dashboard"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add components/tools/wha-control/metrics-dashboard.tsx
git commit -m "feat(wa): #3 dashboard tile muestra PDFs sin clasificar"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm test -- lib/wha-control
```

Expected: all classify-quotation tests PASS.

- [ ] **Step 2: Run full typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -E "(classify-quotation|wha-control|metrics-dashboard)"
```

Expected: no output.

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Manual smoke checklist (post-deploy)**

Hand to user as a checklist. NO code action by the agent.

```
[ ] Pasar migration en Supabase (SQL del Task 1)
[ ] Crear Railway Cron Service:
    - Empty Service → Connect Image → curlimages/curl:latest
    - Schedule: */30 * * * *
    - Custom Start Command:
      curl -fsS -X POST -H "Authorization: Bearer ${{maxevagestion.CRON_SECRET}}" \
        https://app.vibook.ai/api/cron/classify-quotation-pdfs
[ ] Esperar 30 min al primer run, ver logs Railway = ok
[ ] Refrescar /dashboard/whatsapp → "PDFs Enviados (cotizaciones)" debería ser MENOR que antes
[ ] Si aparece "+N pendientes", esperar 1-2 días para que el cron termine de procesar histórico
```

---

## Self-review checklist (completed at plan write-time)

- **Spec coverage:** Schema (T1), heuristic (T2), LLM (T3), cron (T4), metric (T5), UI (T6), smoke (T7) → all spec sections covered.
- **Placeholder scan:** No TBD/TODO/etc. Every code step has full code.
- **Type consistency:** `ClassificationResult.source` enum matches across heuristic + LLM + orchestrator. `is_quotation` BOOLEAN matches column type. `pdfs_sent_pending_classification` consistent across summary endpoint, type, and dashboard tile.
- **Notes:** PDF parsing of content (pdf-parse) was DROPPED from spec — using filename only for LLM input keeps things simple and avoids new dep. Spec already approved this simplification verbally; reflected here.
