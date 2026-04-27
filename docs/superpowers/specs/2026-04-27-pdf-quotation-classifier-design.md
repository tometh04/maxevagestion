# Clasificador de PDFs como cotizaciones reales

**Fecha**: 2026-04-27
**Bullet origen**: Reunión Gabi #3 — "IA filtra PDFs como cotizaciones reales: evita contar documentos irrelevantes"
**Status**: Spec aprobado por Tomi

## Problema

El dashboard `/dashboard/whatsapp` muestra una métrica "PDFs Enviados" que hoy cuenta TODO PDF enviado por WhatsApp, sin importar el tipo. Se cuelan facturas, vouchers, asistencias, seguros, boletos, etc. La métrica deja de ser útil para medir productividad de los sellers (cuántas cotizaciones reales mandan) — el indicador real de actividad comercial.

## Objetivo

Clasificar cada PDF enviado como **cotización** (true) o **otro documento** (false), y usar ese flag para que el contador `pdfs_sent_count` sólo refleje cotizaciones reales.

## No-objetivos

- No clasificamos PDFs recibidos (los manda el cliente, suele ser DNI o pasaporte, no aporta a productividad).
- No mostramos un badge "cotización" en el inbox de mensajes (puede agregarse después si Maxi lo pide; fuera de scope).
- No usamos clasificación basada en contenido visual (image embeddings) — solo texto del PDF.
- No hacemos backfill de toda la historia con un script masivo. El cron va llenando huecos los primeros 30 días.

## Arquitectura

```
WhatsApp PDF arrives → wa_messages row inserted (is_quotation = NULL)
                                    │
                                    ▼
            Cron Railway every 30 min hits /api/cron/classify-quotation-pdfs
                                    │
                                    ▼
        ┌──────────── Heurística filename (instant) ────────────┐
        │  /cotiz|presupuesto|quotation|propuesta/i → true       │
        │  /factura|invoice|voucher|seguro|asistencia|...→ false │
        │  resto → LLM                                            │
        └────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (sólo si ambiguo)
        ┌──────────── LLM fallback ────────────┐
        │  GPT-4o-mini con filename + 1ª página  │
        │  → { is_quotation, confidence }        │
        │  confidence < 0.7 → false              │
        └────────────────────────────────────────┘
                                    │
                                    ▼
        UPDATE wa_messages SET is_quotation = <result>
                                    │
                                    ▼
        Dashboard summary endpoint cuenta sólo is_quotation = true
```

### Componentes

#### 1. Schema change

`supabase/migrations/20260427000004_wa_messages_is_quotation.sql`:

```sql
ALTER TABLE wa_messages
  ADD COLUMN IF NOT EXISTS is_quotation BOOLEAN; -- NULL = no clasificado, true | false

-- Índice parcial para que el cron filtre rápido pendientes
CREATE INDEX IF NOT EXISTS idx_wa_messages_unclassified_pdfs
  ON wa_messages (sent_at DESC)
  WHERE message_type = 'document' AND is_quotation IS NULL;
```

`is_quotation` es nullable a propósito: NULL = pending classification (default para todos los rows nuevos y todos los históricos). Después del cron toma valor true|false.

#### 2. Lógica clasificadora (lib)

`lib/wha-control/classify-quotation.ts`:

```typescript
export type ClassificationResult = {
  is_quotation: boolean
  source: "heuristic_positive" | "heuristic_negative" | "llm" | "llm_low_confidence"
  confidence?: number
}

const POSITIVE_RX = /\b(cotiz|presupuesto|quotation|cotizacion|propuesta|cot[-_])/i
const NEGATIVE_RX = /\b(factura|invoice|voucher|recibo|receipt|comprobante|asistencia|seguro|itiner|boleto|ticket|pasaporte|dni|cartilla)\b/i

export function classifyByFilename(filename: string | null): ClassificationResult | null {
  if (!filename) return null
  if (POSITIVE_RX.test(filename)) return { is_quotation: true, source: "heuristic_positive" }
  if (NEGATIVE_RX.test(filename)) return { is_quotation: false, source: "heuristic_negative" }
  return null // ambiguo
}

export async function classifyByLLM(
  filename: string,
  firstPageText: string
): Promise<ClassificationResult> {
  // Llamado a OpenAI GPT-4o-mini con prompt corto pidiendo JSON
  // { is_quotation: bool, confidence: number 0..1 }
  // Si confidence < 0.7 → asumimos false
}
```

#### 3. Endpoint cron

`app/api/cron/classify-quotation-pdfs/route.ts`:

- Bearer auth con `CRON_SECRET` (mismo patrón que el resto de crons).
- `createAdminClient()` para bypass RLS multi-tenant.
- Query: `wa_messages WHERE message_type='document' AND is_quotation IS NULL AND sent_at >= now() - 30 days ORDER BY sent_at DESC LIMIT 200`.
- Para cada row:
  1. Llamar `classifyByFilename(media_file_name)`. Si no es null → UPDATE y siguiente.
  2. Si fue null → fetch del PDF de Supabase Storage usando `media_url` o equivalente; extraer first page con `pdf-parse`; llamar `classifyByLLM`; UPDATE.
- Log de evento `INFO` con `{ classified: N, llm_calls: M, errors: K }`.
- Devuelve `{ ok: true, stats }`.

#### 4. Métrica modificada

`app/api/wha-control/metrics/summary/route.ts`:

```typescript
// Antes:
if (m.message_type === "document" && isPdfDocument(m, docPdfSet)) {
  if (m.direction === "outbound") pdfs_sent_count++
  ...
}

// Después:
if (m.message_type === "document" && isPdfDocument(m, docPdfSet)) {
  if (m.direction === "outbound") {
    if (m.is_quotation === true) pdfs_sent_count++
    else if (m.is_quotation === null) pdfs_sent_pending_classification++
    // false → no contamos
  }
  ...
}
```

Nuevo campo en respuesta: `pdfs_sent_pending_classification`.

#### 5. UI dashboard

`components/tools/wha-control/metrics-dashboard.tsx`:

- "PDFs Enviados" subtítulo cambia a "(cotizaciones)".
- Si `pdfs_sent_pending_classification > 0`, badge chico "+N pendientes" al lado del número, en gris, con tooltip "PDFs sin clasificar todavía — el sistema los procesa cada 30 min".

#### 6. Railway Cron Service

Nombre: `cron-classify-quotation-pdfs`
Image: `curlimages/curl:latest`
Schedule: `*/30 * * * *` (cada 30 min)
Command: `curl -fsS -X POST -H "Authorization: Bearer ${CRON_SECRET}" https://app.vibook.ai/api/cron/classify-quotation-pdfs`

Mismo patrón que los otros 8 crons que ya tenés.

## Costo estimado

- Lozada manda ~50 PDFs/día por WhatsApp (estimación basada en datos del summary).
- Heurística clasifica ~80% al instante (filenames como `Cotizacion_Maragogi.pdf`, `Factura_AR_001.pdf`).
- LLM corre sobre ~10 PDFs/día.
- GPT-4o-mini ~$0.0001/llamada con prompt cortito (~200 tokens in + 50 out).
- **Total: ~$0.001/día = $0.36/año por agencia.** Negligible incluso con 100 agencias.

## Manejo de errores

- LLM down / timeout → row queda con `is_quotation = NULL`, próximo run lo reintenta. Cron loggea pero sigue.
- PDF no descargable (URL muerta) → asumir `is_quotation = false` después de 3 reintentos en runs distintos. Marcar para no reintentar más con un campo adicional o simplemente con un `notes` interno.
- `pdf-parse` no extrae texto (PDF imagen) → fallar al LLM con sólo filename como input. Si filename ambiguo → `is_quotation = false`.

## Backfill

Estrategia perezosa: el cron procesa 200 rows/run × 48 runs/día = 9600 rows/día. Para Lozada (que tiene ~30 días × 50 PDFs/día = 1500 PDFs históricos) basta 1 día para clasificar todo lo histórico de los últimos 30 días.

Para forzar reclasificación si el user lo pide:
```sql
UPDATE wa_messages SET is_quotation = NULL
WHERE message_type = 'document' AND sent_at >= now() - interval '30 days';
```

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| OpenAI costos se disparan si flujo de PDFs crece x10 | Cron tiene LIMIT 200/run hardcodeado. Si supera, queda colado para próximo run. Visible en `pdfs_sent_pending_classification`. |
| Heurística da falsos positivos (filename `Cotizacion_que_no_es.pdf`) | Aceptable: la métrica es indicador, no auditoría. Si Maxi reporta error específico, podemos tunear el regex. |
| Multi-tenant: clasificación cruza orgs | `wa_messages` ya tiene RLS por org_id (mig 147). El cron usa admin client que bypasea, pero el endpoint summary respeta RLS y filtra por org del caller. |
| `is_quotation` se cuelga en NULL si el cron falla por días | Visible en `pdfs_sent_pending_classification` en el dashboard. Operacionalmente checkable. |

## Testing

- Unit tests para `classifyByFilename` con casos positivos, negativos y ambiguos. Mock para `classifyByLLM` con respuestas variables.
- Integration: smoke manual del endpoint cron con un row de prueba (`is_quotation = NULL`) → verificar que se actualiza a true|false.
- Verificación visual del dashboard tras pasar la migration y correr el cron 1 vez.

## Smoke pendiente al deployear

1. Pasar migration en Supabase.
2. Pushear código.
3. Crear Railway Cron Service.
4. Verificar primer run del cron en logs (espera 30 min).
5. Refrescar dashboard `/dashboard/whatsapp`, contar "PDFs Enviados" — ahora debería ser menor que antes.
6. Confirmar con Maxi/Gabi que el número tiene sentido para la actividad real.
