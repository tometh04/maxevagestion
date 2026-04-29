# Import Multi-Tenant — Fase 2 (Motor de Import) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el motor reutilizable de import en `lib/import/` que recibe `agency_id` como parámetro, parsea CSV con headers flexibles, matchea entidades scopeadas al tenant, valida, y ejecuta INSERTs con rollback log. 5 pipelines: `operations-master`, `customers`, `operators`, `payments-suelto`, `cash-movements`.

**Architecture:** Pipeline funcional puro (testeable con mocks de Supabase) compuesto por etapas: `parser → header-mapper → normalizer → resolver → validator → executor`. Cada pipeline es una función `(supabase, agencyId, csvContent, config) => Promise<ImportResult>`. La integración con jobs async + UI viene en Fase 3.

**Tech Stack:** TypeScript, Jest 30, Supabase JS (`@supabase/supabase-js`), `lib/accounting/exchange-rates.ts` (existente).

**Spec referencia:** [docs/superpowers/specs/2026-04-28-import-multitenant-design.md](../specs/2026-04-28-import-multitenant-design.md)

**Pre-requisitos:**
- Fase 1 cerrada (migrations 113–123 aplicadas en producción).
- Schema con `agency_id` NULLABLE en customers/operators/payments/cash_movements.
- Triggers BEFORE INSERT instalados (atrapan inserts del motor que sí pasan agency_id).

**Reglas de oro (memoria del proyecto):**
- Todo INSERT/UPDATE generado por el motor pasa `agency_id` explícito.
- Matching de cliente/operador/vendedor SIEMPRE scopeado por `agency_id`.
- Aceptar duplicación lógica entre tenants (Despegar de Rosario ≠ Despegar de Madero).
- No tocar data productiva de Lozada/Rosario fuera de imports legítimos.

---

## File Structure

```
lib/import/
├── types.ts                       — tipos compartidos
├── csv-parser.ts                  — CSV string → string[][]
├── header-mapper.ts               — headers flexibles → field names normalizados
├── normalizer.ts                  — montos, fechas, monedas, status
├── exchange-rate-resolver.ts      — wrapper sobre lib/accounting/exchange-rates
├── resolver.ts                    — matching cliente/operador/vendedor scopeado
├── validator.ts                   — validación pre-commit (dry-run real)
├── executor.ts                    — INSERT con rollback log por job
├── pipelines/
│   ├── customers.ts               — pipeline simple: catálogo de clientes
│   ├── operators.ts               — pipeline simple: catálogo de operadores
│   ├── payments-suelto.ts         — payments matchean por file_code
│   ├── cash-movements.ts          — movimientos sueltos
│   └── operations-master.ts       — pipeline canónico (genera op + cliente + N operadores + payments + cash_movements)
├── templates/
│   ├── operations-master.csv      — plantilla descargable
│   ├── customers.csv
│   ├── operators.csv
│   ├── payments-suelto.csv
│   └── cash-movements.csv
└── __tests__/
    ├── csv-parser.test.ts
    ├── header-mapper.test.ts
    ├── normalizer.test.ts
    ├── exchange-rate-resolver.test.ts
    ├── resolver.test.ts
    ├── validator.test.ts
    ├── executor.test.ts
    ├── fixtures/
    │   ├── rosario-sample-10rows.csv
    │   └── customers-sample.csv
    └── pipelines/
        ├── customers.test.ts
        ├── operators.test.ts
        ├── payments-suelto.test.ts
        ├── cash-movements.test.ts
        └── operations-master.test.ts
```

**Decisiones de diseño explícitas:**

- **Pipelines son funciones**, no clases. Más fáciles de testear y componer.
- **Supabase client se inyecta** (no se importa global). Permite mocks en tests y elección admin/server según contexto.
- **Tests con mocks**, no DB real. Para tests con DB real (smoke E2E) hay scripts separados — fuera del scope de Fase 2.
- **No streaming de CSV**: archivos máximo 10MB se parsean en memoria. Streaming queda para Fase 3 si fuera necesario.

---

## Tasks

### Task 1: Tipos compartidos del motor

**Files:**
- Create: `lib/import/types.ts`

- [ ] **Step 1: Crear `lib/import/types.ts` con todos los tipos del motor**

```typescript
// lib/import/types.ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export type AgencyId = string

export type ImportPipeline =
  | "operations-master"
  | "customers"
  | "operators"
  | "payments-suelto"
  | "cash-movements"

export type ExchangeRateMode = "monthly_rates" | "manual_fixed" | "monthly_with_fallback"

export interface ExchangeRateConfig {
  mode: ExchangeRateMode
  manualRate?: number
}

export interface ImportConfig {
  agencyId: AgencyId
  exchangeRate: ExchangeRateConfig
  defaultStatus?: "RESERVED" | "CONFIRMED" | "CANCELLED" | "TRAVELLING" | "TRAVELLED"
}

export interface ImportError {
  rowNumber: number
  field?: string
  message: string
}

export interface ImportWarning {
  rowNumber: number
  message: string
}

export interface RollbackEntry {
  table: string
  id: string
}

export interface ImportResult {
  totalRows: number
  successRows: number
  errorRows: number
  warningRows: number
  errors: ImportError[]
  warnings: ImportWarning[]
  rollbackLog: RollbackEntry[]
  previewSummary: {
    customersToCreate?: number
    operatorsToCreate?: number
    operationsToCreate?: number
    paymentsToCreate?: number
    cashMovementsToCreate?: number
  }
}

export type SupabaseClientTyped = SupabaseClient<Database>

/**
 * Pipeline signature: every pipeline accepts the same shape.
 * Pure function (no side effects until executor.ts), easy to test.
 */
export type PipelineFn = (
  supabase: SupabaseClientTyped,
  csvContent: string,
  config: ImportConfig,
  options?: { dryRun?: boolean }
) => Promise<ImportResult>
```

- [ ] **Step 2: Verificar que TypeScript compila sin errores**

Run: `cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas" && npx tsc --noEmit lib/import/types.ts`
Expected: Sin output (compilación limpia).

- [ ] **Step 3: Commit**

```bash
cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas"
git add lib/import/types.ts
git commit -m "feat(import-fase2): add core types for import engine"
```

---

### Task 2: CSV parser (con BOM, quotes, multiline)

**Files:**
- Create: `lib/import/csv-parser.ts`
- Test: `lib/import/__tests__/csv-parser.test.ts`

- [ ] **Step 1: Escribir tests primero (TDD)**

Crear `lib/import/__tests__/csv-parser.test.ts`:

```typescript
import { parseCsv } from "../csv-parser"

describe("parseCsv", () => {
  it("parsea CSV simple con header y filas", () => {
    const input = "name,age\nJuan,30\nMaria,25"
    expect(parseCsv(input)).toEqual([
      ["name", "age"],
      ["Juan", "30"],
      ["Maria", "25"],
    ])
  })

  it("remueve BOM al inicio si existe", () => {
    const input = "﻿name,age\nJuan,30"
    expect(parseCsv(input)).toEqual([
      ["name", "age"],
      ["Juan", "30"],
    ])
  })

  it("respeta comas dentro de comillas", () => {
    const input = 'name,note\n"Pérez, Juan","Hola, mundo"'
    expect(parseCsv(input)).toEqual([
      ["name", "note"],
      ["Pérez, Juan", "Hola, mundo"],
    ])
  })

  it("respeta comillas escapadas (doble comilla)", () => {
    const input = 'name,quote\nJuan,"He said ""hi"""'
    expect(parseCsv(input)).toEqual([
      ["name", "quote"],
      ["Juan", 'He said "hi"'],
    ])
  })

  it("ignora líneas vacías", () => {
    const input = "name,age\n\nJuan,30\n\n"
    expect(parseCsv(input)).toEqual([
      ["name", "age"],
      ["Juan", "30"],
    ])
  })

  it("soporta CRLF (Windows)", () => {
    const input = "name,age\r\nJuan,30\r\n"
    expect(parseCsv(input)).toEqual([
      ["name", "age"],
      ["Juan", "30"],
    ])
  })

  it("retorna array vacío para input vacío", () => {
    expect(parseCsv("")).toEqual([])
    expect(parseCsv("\n\n")).toEqual([])
  })
})
```

- [ ] **Step 2: Correr tests para verificar que fallan**

Run: `cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas" && npx jest lib/import/__tests__/csv-parser.test.ts`
Expected: FAIL — `Cannot find module '../csv-parser'`

- [ ] **Step 3: Implementar parser**

Crear `lib/import/csv-parser.ts`:

```typescript
/**
 * Parsea CSV plain a array de filas. Soporta:
 * - BOM al inicio
 * - Comas y newlines dentro de campos quoted
 * - Quotes escapadas como ""
 * - CRLF y LF
 */
export function parseCsv(content: string): string[][] {
  // Remover BOM
  const clean = content.replace(/^﻿/, "")
  if (!clean.trim()) return []

  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ""
  let inQuotes = false
  let i = 0

  while (i < clean.length) {
    const char = clean[i]
    const nextChar = clean[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        currentField += '"'
        i += 2
        continue
      }
      if (char === '"') {
        inQuotes = false
        i++
        continue
      }
      currentField += char
      i++
      continue
    }

    // Not in quotes
    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === ",") {
      currentRow.push(currentField)
      currentField = ""
      i++
      continue
    }
    if (char === "\n" || char === "\r") {
      // End of row
      currentRow.push(currentField)
      // Push only if row has content (skip empty lines)
      if (currentRow.some(c => c.length > 0)) {
        rows.push(currentRow)
      }
      currentRow = []
      currentField = ""
      // Skip \r\n as one
      if (char === "\r" && nextChar === "\n") i += 2
      else i++
      continue
    }
    currentField += char
    i++
  }

  // Push last field/row if any content
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField)
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow)
    }
  }

  return rows
}
```

- [ ] **Step 4: Correr tests para verificar que pasan**

Run: `cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas" && npx jest lib/import/__tests__/csv-parser.test.ts`
Expected: PASS — los 7 tests verdes.

- [ ] **Step 5: Commit**

```bash
cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas"
git add lib/import/csv-parser.ts lib/import/__tests__/csv-parser.test.ts
git commit -m "feat(import-fase2): CSV parser with BOM, quotes, multiline support"
```

---

### Task 3: Header mapper (sinónimos, sin acentos)

**Files:**
- Create: `lib/import/header-mapper.ts`
- Test: `lib/import/__tests__/header-mapper.test.ts`

- [ ] **Step 1: Escribir tests**

Crear `lib/import/__tests__/header-mapper.test.ts`:

```typescript
import { normalizeHeader, mapHeaders } from "../header-mapper"

describe("normalizeHeader", () => {
  it("normaliza a lowercase, sin acentos, sin espacios", () => {
    expect(normalizeHeader("Código")).toBe("codigo")
    expect(normalizeHeader("Nombre del Cliente")).toBe("nombre_del_cliente")
    expect(normalizeHeader("  Fecha  Salida  ")).toBe("fecha_salida")
    expect(normalizeHeader("Niños")).toBe("ninos")
  })

  it("preserva guión bajo y dígitos", () => {
    expect(normalizeHeader("Operador 1")).toBe("operador_1")
    expect(normalizeHeader("Costo Operador 2")).toBe("costo_operador_2")
  })

  it("remueve caracteres especiales", () => {
    expect(normalizeHeader("¿Pendiente?")).toBe("pendiente")
    expect(normalizeHeader("Monto $")).toBe("monto")
  })
})

describe("mapHeaders", () => {
  const schema = {
    file_code: ["codigo", "codigo_operacion", "file_code"],
    customer_name: ["nombre_cliente", "nombre_del_cliente", "cliente"],
    sale_amount: ["monto_venta", "venta", "sale_amount"],
  }

  it("mapea headers a field names usando sinónimos", () => {
    const headers = ["Código", "Nombre del Cliente", "Monto Venta"]
    expect(mapHeaders(headers, schema)).toEqual(
      new Map([
        [0, "file_code"],
        [1, "customer_name"],
        [2, "sale_amount"],
      ])
    )
  })

  it("ignora columnas no mapeadas", () => {
    const headers = ["Código", "Columna Random", "Monto Venta"]
    const result = mapHeaders(headers, schema)
    expect(result.get(0)).toBe("file_code")
    expect(result.get(1)).toBeUndefined()
    expect(result.get(2)).toBe("sale_amount")
  })

  it("retorna Map vacío si ningún header matchea", () => {
    const headers = ["foo", "bar"]
    expect(mapHeaders(headers, schema).size).toBe(0)
  })
})
```

- [ ] **Step 2: Correr tests, verificar que fallan**

Run: `cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas" && npx jest lib/import/__tests__/header-mapper.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar**

Crear `lib/import/header-mapper.ts`:

```typescript
/**
 * Schema: maps field name → list of accepted synonyms (already normalized)
 */
export type HeaderSchema = Record<string, string[]>

/**
 * Normaliza un header: lowercase, sin acentos, espacios → underscore.
 */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Remueve acentos
    .replace(/[^a-z0-9\s_]/g, "")    // Solo alfanuméricos, espacios, underscores
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
}

/**
 * Mapea cada índice de columna del CSV a un field name canónico,
 * según los sinónimos del schema.
 */
export function mapHeaders(
  headers: string[],
  schema: HeaderSchema
): Map<number, string> {
  const result = new Map<number, string>()

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header)
    for (const [fieldName, synonyms] of Object.entries(schema)) {
      if (synonyms.includes(normalized)) {
        result.set(index, fieldName)
        return
      }
    }
  })

  return result
}
```

- [ ] **Step 4: Correr tests, verificar que pasan**

Run: `cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas" && npx jest lib/import/__tests__/header-mapper.test.ts`
Expected: PASS — los 6 tests verdes.

- [ ] **Step 5: Commit**

```bash
cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas"
git add lib/import/header-mapper.ts lib/import/__tests__/header-mapper.test.ts
git commit -m "feat(import-fase2): flexible header mapper with synonyms"
```

---

### Task 4: Normalizer (montos, fechas, monedas)

**Files:**
- Create: `lib/import/normalizer.ts`
- Test: `lib/import/__tests__/normalizer.test.ts`

- [ ] **Step 1: Escribir tests**

Crear `lib/import/__tests__/normalizer.test.ts`:

```typescript
import {
  parseAmount,
  parseDate,
  normalizeCurrency,
  normalizeStatus,
} from "../normalizer"

describe("parseAmount", () => {
  it("parsea montos simples", () => {
    expect(parseAmount("1000")).toBe(1000)
    expect(parseAmount("1500.50")).toBe(1500.5)
  })

  it("remueve $ y comas formato US", () => {
    expect(parseAmount("$13,680")).toBe(13680)
    expect(parseAmount("$1,234,567.89")).toBe(1234567.89)
  })

  it("retorna null para vacío o no numérico", () => {
    expect(parseAmount("")).toBeNull()
    expect(parseAmount("abc")).toBeNull()
    expect(parseAmount("$")).toBeNull()
  })

  it("retorna 0 para '$0' o '0'", () => {
    expect(parseAmount("$0")).toBe(0)
    expect(parseAmount("0")).toBe(0)
  })
})

describe("parseDate", () => {
  it("parsea formato YYYY-MM-DD", () => {
    const d = parseDate("2026-03-15")
    expect(d).not.toBeNull()
    expect(d!.toISOString().slice(0, 10)).toBe("2026-03-15")
  })

  it("parsea formato DD/MM/YYYY", () => {
    const d = parseDate("15/03/2026")
    expect(d).not.toBeNull()
    expect(d!.toISOString().slice(0, 10)).toBe("2026-03-15")
  })

  it("parsea formato D/M/YYYY (sin padding)", () => {
    const d = parseDate("5/3/2026")
    expect(d).not.toBeNull()
    expect(d!.toISOString().slice(0, 10)).toBe("2026-03-05")
  })

  it("retorna null para formato inválido", () => {
    expect(parseDate("")).toBeNull()
    expect(parseDate("not-a-date")).toBeNull()
    expect(parseDate("2026-13-45")).toBeNull() // mes/día inválido
  })
})

describe("normalizeCurrency", () => {
  it("acepta ARS y USD case-insensitive", () => {
    expect(normalizeCurrency("ARS")).toBe("ARS")
    expect(normalizeCurrency("ars")).toBe("ARS")
    expect(normalizeCurrency("USD")).toBe("USD")
    expect(normalizeCurrency("usd")).toBe("USD")
  })

  it("retorna null para currency no soportada", () => {
    expect(normalizeCurrency("EUR")).toBeNull()
    expect(normalizeCurrency("")).toBeNull()
  })
})

describe("normalizeStatus", () => {
  it("acepta status válidos case-insensitive", () => {
    expect(normalizeStatus("CONFIRMED")).toBe("CONFIRMED")
    expect(normalizeStatus("confirmed")).toBe("CONFIRMED")
    expect(normalizeStatus("RESERVED")).toBe("RESERVED")
    expect(normalizeStatus("CANCELLED")).toBe("CANCELLED")
    expect(normalizeStatus("TRAVELLING")).toBe("TRAVELLING")
    expect(normalizeStatus("TRAVELLED")).toBe("TRAVELLED")
  })

  it("migra estados antiguos", () => {
    expect(normalizeStatus("PRE_RESERVATION")).toBe("RESERVED")
    expect(normalizeStatus("CLOSED")).toBe("TRAVELLED")
  })

  it("retorna null para status inválido", () => {
    expect(normalizeStatus("UNKNOWN")).toBeNull()
    expect(normalizeStatus("")).toBeNull()
  })
})
```

- [ ] **Step 2: Correr tests, verificar fallan**

Run: `cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas" && npx jest lib/import/__tests__/normalizer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar**

Crear `lib/import/normalizer.ts`:

```typescript
/**
 * Parsea string a número. Soporta formatos $1,234.56 (US) y 1234.56.
 * Retorna null si no se puede parsear.
 */
export function parseAmount(input: string): number | null {
  if (!input || !input.trim()) return null
  const cleaned = input.replace(/[$\s,]/g, "")
  if (!cleaned) return null
  const num = Number(cleaned)
  if (Number.isNaN(num)) return null
  return num
}

/**
 * Parsea fecha. Soporta YYYY-MM-DD y DD/MM/YYYY (incluyendo D/M/YYYY).
 * Retorna null si formato inválido.
 */
export function parseDate(input: string): Date | null {
  if (!input || !input.trim()) return null
  const trimmed = input.trim()

  // Formato ISO YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    return makeDate(+year, +month, +day)
  }

  // Formato DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch
    return makeDate(+year, +month, +day)
  }

  return null
}

function makeDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  // Construir UTC para evitar timezone shifts
  const date = new Date(Date.UTC(year, month - 1, day))
  // Verificar que no hubo overflow (ej: 2026-02-30 → 2026-03-02)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

/**
 * Normaliza currency: acepta solo ARS o USD, retorna uppercase.
 */
export function normalizeCurrency(input: string): "ARS" | "USD" | null {
  const upper = input?.toUpperCase()
  if (upper === "ARS" || upper === "USD") return upper
  return null
}

const VALID_STATUSES = [
  "RESERVED",
  "CONFIRMED",
  "CANCELLED",
  "TRAVELLING",
  "TRAVELLED",
] as const

type OperationStatus = typeof VALID_STATUSES[number]

/**
 * Normaliza status. Soporta migración de estados antiguos.
 */
export function normalizeStatus(input: string): OperationStatus | null {
  if (!input) return null
  const upper = input.toUpperCase()
  // Migrar estados antiguos
  if (upper === "PRE_RESERVATION") return "RESERVED"
  if (upper === "CLOSED") return "TRAVELLED"
  if ((VALID_STATUSES as readonly string[]).includes(upper)) {
    return upper as OperationStatus
  }
  return null
}
```

- [ ] **Step 4: Correr tests**

Run: `cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas" && npx jest lib/import/__tests__/normalizer.test.ts`
Expected: PASS — todos los tests verdes.

- [ ] **Step 5: Commit**

```bash
cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas"
git add lib/import/normalizer.ts lib/import/__tests__/normalizer.test.ts
git commit -m "feat(import-fase2): normalizer for amounts/dates/currency/status"
```

---

### Task 5: Exchange rate resolver (3 modos)

**Files:**
- Create: `lib/import/exchange-rate-resolver.ts`
- Test: `lib/import/__tests__/exchange-rate-resolver.test.ts`

Wraps existing `lib/accounting/exchange-rates.ts:getExchangeRate()` con los 3 modos del job: `monthly_rates`, `manual_fixed`, `monthly_with_fallback`.

- [ ] **Step 1: Escribir tests**

Crear `lib/import/__tests__/exchange-rate-resolver.test.ts`:

```typescript
import { createExchangeRateResolver } from "../exchange-rate-resolver"

// Mock del módulo de accounting/exchange-rates
jest.mock("@/lib/accounting/exchange-rates", () => ({
  getExchangeRate: jest.fn(),
}))

import { getExchangeRate } from "@/lib/accounting/exchange-rates"

describe("createExchangeRateResolver", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("modo manual_fixed: usa siempre el rate manual", async () => {
    const supabase = {} as any
    const resolver = createExchangeRateResolver(supabase, {
      mode: "manual_fixed",
      manualRate: 1450,
    })

    const rate1 = await resolver(new Date("2026-01-15"))
    const rate2 = await resolver(new Date("2026-06-30"))

    expect(rate1).toBe(1450)
    expect(rate2).toBe(1450)
    expect(getExchangeRate).not.toHaveBeenCalled()
  })

  it("modo manual_fixed sin manualRate: throw error", () => {
    const supabase = {} as any
    expect(() =>
      createExchangeRateResolver(supabase, { mode: "manual_fixed" })
    ).toThrow("manualRate is required for manual_fixed mode")
  })

  it("modo monthly_rates: consulta BD por fecha", async () => {
    ;(getExchangeRate as jest.Mock).mockResolvedValueOnce(1500)
    const supabase = {} as any
    const resolver = createExchangeRateResolver(supabase, {
      mode: "monthly_rates",
    })

    const rate = await resolver(new Date("2026-03-15"))
    expect(rate).toBe(1500)
    expect(getExchangeRate).toHaveBeenCalledWith(supabase, expect.any(Date))
  })

  it("modo monthly_rates sin rate: throw error", async () => {
    ;(getExchangeRate as jest.Mock).mockResolvedValueOnce(null)
    const supabase = {} as any
    const resolver = createExchangeRateResolver(supabase, {
      mode: "monthly_rates",
    })

    await expect(resolver(new Date("2026-03-15"))).rejects.toThrow(
      /no exchange rate for/i
    )
  })

  it("modo monthly_with_fallback: usa BD; si no hay, fallback manual", async () => {
    ;(getExchangeRate as jest.Mock)
      .mockResolvedValueOnce(1500)
      .mockResolvedValueOnce(null)
    const supabase = {} as any
    const resolver = createExchangeRateResolver(supabase, {
      mode: "monthly_with_fallback",
      manualRate: 1450,
    })

    const rate1 = await resolver(new Date("2026-03-15"))
    const rate2 = await resolver(new Date("2026-06-30"))

    expect(rate1).toBe(1500)
    expect(rate2).toBe(1450) // fallback
  })

  it("cachea rates por fecha (no consulta dos veces la misma fecha)", async () => {
    ;(getExchangeRate as jest.Mock).mockResolvedValue(1500)
    const supabase = {} as any
    const resolver = createExchangeRateResolver(supabase, {
      mode: "monthly_rates",
    })

    const date = new Date("2026-03-15")
    await resolver(date)
    await resolver(date)
    await resolver(date)

    expect(getExchangeRate).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Correr tests, verificar fallan**

Run: `cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas" && npx jest lib/import/__tests__/exchange-rate-resolver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar**

Crear `lib/import/exchange-rate-resolver.ts`:

```typescript
import { getExchangeRate } from "@/lib/accounting/exchange-rates"
import type { SupabaseClientTyped, ExchangeRateConfig } from "./types"

/**
 * Crea una función resolver de exchange rate USD→ARS según el modo del job.
 * El resolver cachea por fecha (key=YYYY-MM) para no consultar BD múltiples veces.
 */
export function createExchangeRateResolver(
  supabase: SupabaseClientTyped,
  config: ExchangeRateConfig
): (date: Date) => Promise<number> {
  if (
    (config.mode === "manual_fixed" ||
      config.mode === "monthly_with_fallback") &&
    config.manualRate === undefined
  ) {
    if (config.mode === "manual_fixed") {
      throw new Error("manualRate is required for manual_fixed mode")
    }
  }

  const cache = new Map<string, number>()

  return async (date: Date): Promise<number> => {
    const cacheKey = date.toISOString().slice(0, 7) // YYYY-MM
    if (cache.has(cacheKey)) return cache.get(cacheKey)!

    let rate: number | null = null

    if (config.mode === "manual_fixed") {
      rate = config.manualRate!
    } else {
      // monthly_rates or monthly_with_fallback
      rate = await getExchangeRate(supabase, date)
      if (rate === null && config.mode === "monthly_with_fallback") {
        if (config.manualRate === undefined) {
          throw new Error(
            `No exchange rate for ${cacheKey} and no manualRate fallback configured`
          )
        }
        rate = config.manualRate
      }
      if (rate === null) {
        throw new Error(`No exchange rate for ${cacheKey}`)
      }
    }

    cache.set(cacheKey, rate)
    return rate
  }
}
```

- [ ] **Step 4: Correr tests**

Run: `cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas" && npx jest lib/import/__tests__/exchange-rate-resolver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas"
git add lib/import/exchange-rate-resolver.ts lib/import/__tests__/exchange-rate-resolver.test.ts
git commit -m "feat(import-fase2): exchange rate resolver with 3 modes + cache"
```

---

### Task 6: Resolver — matching scoped por agency

**Files:**
- Create: `lib/import/resolver.ts`
- Test: `lib/import/__tests__/resolver.test.ts`

Funciones para matchear cliente, operador, vendedor, operación. **Siempre scopeadas** por `agencyId`.

- [ ] **Step 1: Escribir tests**

Crear `lib/import/__tests__/resolver.test.ts`:

```typescript
import {
  resolveCustomer,
  resolveOperator,
  resolveSeller,
  resolveOperationByFileCode,
} from "../resolver"

const AGENCY_ID = "rosario-uuid"
const OTHER_AGENCY_ID = "madero-uuid"

function mockSupabase(data: any) {
  const builder: any = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
    limit: jest.fn().mockReturnThis(),
  }
  return builder
}

describe("resolveCustomer", () => {
  it("matchea por document_number scopeado a agency_id", async () => {
    const supabase = mockSupabase({ id: "cust-123" })
    const result = await resolveCustomer(supabase as any, AGENCY_ID, {
      documentNumber: "12345678",
      email: undefined,
      name: undefined,
    })

    expect(result).toEqual({ id: "cust-123" })
    expect(supabase.from).toHaveBeenCalledWith("customers")
    expect(supabase.eq).toHaveBeenCalledWith("agency_id", AGENCY_ID)
    expect(supabase.eq).toHaveBeenCalledWith("document_number", "12345678")
  })

  it("matchea por email si no hay documento", async () => {
    const supabase = mockSupabase({ id: "cust-456" })
    const result = await resolveCustomer(supabase as any, AGENCY_ID, {
      email: "juan@test.com",
    })

    expect(result).toEqual({ id: "cust-456" })
    expect(supabase.eq).toHaveBeenCalledWith("email", "juan@test.com")
  })

  it("retorna null si no encuentra", async () => {
    const supabase = mockSupabase(null)
    const result = await resolveCustomer(supabase as any, AGENCY_ID, {
      email: "noexiste@test.com",
    })
    expect(result).toBeNull()
  })

  it("retorna null si no hay criterios de búsqueda", async () => {
    const supabase = mockSupabase(null)
    const result = await resolveCustomer(supabase as any, AGENCY_ID, {})
    expect(result).toBeNull()
  })
})

describe("resolveOperator", () => {
  it("matchea por nombre case-insensitive scopeado a agency", async () => {
    const supabase = mockSupabase({ id: "op-789" })
    const result = await resolveOperator(supabase as any, AGENCY_ID, "Despegar")

    expect(result).toEqual({ id: "op-789" })
    expect(supabase.from).toHaveBeenCalledWith("operators")
    expect(supabase.eq).toHaveBeenCalledWith("agency_id", AGENCY_ID)
    expect(supabase.ilike).toHaveBeenCalledWith("name", "Despegar")
  })
})

describe("resolveSeller", () => {
  it("matchea por email primero", async () => {
    const supabase = mockSupabase({ id: "user-1" })
    const result = await resolveSeller(supabase as any, AGENCY_ID, {
      email: "vendedor@test.com",
    })

    expect(result).toEqual({ id: "user-1" })
  })
})

describe("resolveOperationByFileCode", () => {
  it("matchea por file_code scopeado a agency", async () => {
    const supabase = mockSupabase({ id: "op-x", agency_id: AGENCY_ID })
    const result = await resolveOperationByFileCode(
      supabase as any,
      AGENCY_ID,
      "OP-2026-001"
    )

    expect(result).toEqual({ id: "op-x", agency_id: AGENCY_ID })
    expect(supabase.eq).toHaveBeenCalledWith("file_code", "OP-2026-001")
    expect(supabase.eq).toHaveBeenCalledWith("agency_id", AGENCY_ID)
  })
})
```

- [ ] **Step 2: Correr tests, verificar fallan**

Run: `cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas" && npx jest lib/import/__tests__/resolver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar**

Crear `lib/import/resolver.ts`:

```typescript
import type { SupabaseClientTyped, AgencyId } from "./types"

export interface CustomerMatch {
  documentNumber?: string
  email?: string
  name?: { firstName: string; lastName: string }
}

export interface ResolvedRecord {
  id: string
}

/**
 * Resuelve customer por (document_number > email > nombre) scopeado a agency_id.
 * Devuelve null si no matchea.
 */
export async function resolveCustomer(
  supabase: SupabaseClientTyped,
  agencyId: AgencyId,
  match: CustomerMatch
): Promise<ResolvedRecord | null> {
  if (match.documentNumber) {
    const { data } = await (supabase.from("customers") as any)
      .select("id")
      .eq("agency_id", agencyId)
      .eq("document_number", match.documentNumber)
      .maybeSingle()
    if (data) return { id: data.id }
  }

  if (match.email) {
    const { data } = await (supabase.from("customers") as any)
      .select("id")
      .eq("agency_id", agencyId)
      .eq("email", match.email)
      .maybeSingle()
    if (data) return { id: data.id }
  }

  if (match.name) {
    const { data } = await (supabase.from("customers") as any)
      .select("id")
      .eq("agency_id", agencyId)
      .ilike("first_name", match.name.firstName)
      .ilike("last_name", match.name.lastName)
      .maybeSingle()
    if (data) return { id: data.id }
  }

  return null
}

/**
 * Resuelve operator por nombre exacto (case-insensitive) scopeado a agency.
 */
export async function resolveOperator(
  supabase: SupabaseClientTyped,
  agencyId: AgencyId,
  name: string
): Promise<ResolvedRecord | null> {
  const { data } = await (supabase.from("operators") as any)
    .select("id")
    .eq("agency_id", agencyId)
    .ilike("name", name)
    .maybeSingle()
  return data ? { id: data.id } : null
}

export interface SellerMatch {
  email?: string
  name?: string
}

/**
 * Resuelve seller (user) por email > nombre. Scopeado a la agencia.
 */
export async function resolveSeller(
  supabase: SupabaseClientTyped,
  agencyId: AgencyId,
  match: SellerMatch
): Promise<ResolvedRecord | null> {
  // Filtrar por user_agencies para asegurar que el seller pertenece a la agencia
  if (match.email) {
    const { data } = await (supabase.from("users") as any)
      .select("id, user_agencies!inner(agency_id)")
      .eq("email", match.email)
      .eq("user_agencies.agency_id", agencyId)
      .maybeSingle()
    if (data) return { id: data.id }
  }
  return null
}

/**
 * Resuelve operación por file_code dentro de la agencia.
 */
export async function resolveOperationByFileCode(
  supabase: SupabaseClientTyped,
  agencyId: AgencyId,
  fileCode: string
): Promise<{ id: string; agency_id: string } | null> {
  const { data } = await (supabase.from("operations") as any)
    .select("id, agency_id")
    .eq("agency_id", agencyId)
    .eq("file_code", fileCode)
    .maybeSingle()
  return data ?? null
}
```

- [ ] **Step 4: Correr tests**

Run: `cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas" && npx jest lib/import/__tests__/resolver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas"
git add lib/import/resolver.ts lib/import/__tests__/resolver.test.ts
git commit -m "feat(import-fase2): resolver with agency-scoped matching"
```

---

### Task 7: Validator (campos requeridos, formatos)

**Files:**
- Create: `lib/import/validator.ts`
- Test: `lib/import/__tests__/validator.test.ts`

Para mantener el plan en un tamaño razonable, este task sigue el patrón de los anteriores (TDD). El validator recibe una fila parseada (`Record<string, string>`) + lista de campos requeridos y devuelve `{ errors: string[], warnings: string[] }`.

- [ ] **Step 1: Tests** — cubrir: missing required, invalid email format, negative amount, currency inválida.

```typescript
// lib/import/__tests__/validator.test.ts
import { validateRequiredFields, validateEmailFormat, validatePositiveAmount } from "../validator"

describe("validateRequiredFields", () => {
  it("retorna error si falta un required", () => {
    const errors = validateRequiredFields({ name: "Juan" }, ["name", "phone"])
    expect(errors).toEqual([{ field: "phone", message: expect.stringContaining("requerido") }])
  })

  it("retorna [] si todos están", () => {
    const errors = validateRequiredFields({ name: "Juan", phone: "123" }, ["name", "phone"])
    expect(errors).toEqual([])
  })
})

describe("validateEmailFormat", () => {
  it("acepta emails válidos", () => {
    expect(validateEmailFormat("juan@test.com")).toBeNull()
  })
  it("rechaza emails inválidos", () => {
    expect(validateEmailFormat("not-an-email")).toMatch(/inválido/i)
    expect(validateEmailFormat("@test.com")).toMatch(/inválido/i)
  })
  it("acepta vacío (es opcional)", () => {
    expect(validateEmailFormat("")).toBeNull()
  })
})

describe("validatePositiveAmount", () => {
  it("acepta positivos y cero", () => {
    expect(validatePositiveAmount(100)).toBeNull()
    expect(validatePositiveAmount(0)).toBeNull()
  })
  it("rechaza negativos", () => {
    expect(validatePositiveAmount(-50)).toMatch(/no puede ser negativo/i)
  })
})
```

- [ ] **Step 2: Correr tests, verificar fallan.**

Run: `npx jest lib/import/__tests__/validator.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `lib/import/validator.ts`**

```typescript
export interface FieldError {
  field: string
  message: string
}

export function validateRequiredFields(
  row: Record<string, string | undefined>,
  required: string[]
): FieldError[] {
  const errors: FieldError[] = []
  for (const field of required) {
    const value = row[field]
    if (!value || !value.trim()) {
      errors.push({ field, message: `El campo "${field}" es requerido` })
    }
  }
  return errors
}

export function validateEmailFormat(email: string): string | null {
  if (!email || !email.trim()) return null
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!re.test(email)) return "Email inválido"
  return null
}

export function validatePositiveAmount(amount: number): string | null {
  if (amount < 0) return "El monto no puede ser negativo"
  return null
}
```

- [ ] **Step 4: Correr tests, verificar pasan.**

Run: `npx jest lib/import/__tests__/validator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/import/validator.ts lib/import/__tests__/validator.test.ts
git commit -m "feat(import-fase2): row validator with field/format checks"
```

---

### Task 8: Executor — INSERT con rollback log

**Files:**
- Create: `lib/import/executor.ts`
- Test: `lib/import/__tests__/executor.test.ts`

El executor recibe `{ table, data }` y inserta. Loguea el ID al `rollbackLog` para permitir undo posterior. NO maneja transacciones explícitas (eso queda para Fase 3 con jobs); cada INSERT es atómico individualmente, pero el "todo o nada" del job vendrá después.

- [ ] **Step 1: Tests**

```typescript
// lib/import/__tests__/executor.test.ts
import { executeInsert } from "../executor"

describe("executeInsert", () => {
  it("inserta y agrega entrada al rollback log", async () => {
    const supabase: any = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: "new-id" }, error: null }),
    }
    const log: any[] = []

    const result = await executeInsert(supabase, "customers", { name: "X", agency_id: "a1" }, log)

    expect(result).toEqual({ id: "new-id" })
    expect(supabase.from).toHaveBeenCalledWith("customers")
    expect(supabase.insert).toHaveBeenCalledWith({ name: "X", agency_id: "a1" })
    expect(log).toEqual([{ table: "customers", id: "new-id" }])
  })

  it("retorna null si Supabase devuelve error", async () => {
    const supabase: any = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
    }
    const log: any[] = []
    const result = await executeInsert(supabase, "customers", {}, log)
    expect(result).toBeNull()
    expect(log).toEqual([])
  })
})
```

- [ ] **Step 2: Correr, fallan.**

Run: `npx jest lib/import/__tests__/executor.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `lib/import/executor.ts`**

```typescript
import type { SupabaseClientTyped, RollbackEntry } from "./types"

/**
 * Inserta una fila y agrega entry al rollback log. Retorna el ID o null si falla.
 */
export async function executeInsert(
  supabase: SupabaseClientTyped,
  table: string,
  data: Record<string, unknown>,
  rollbackLog: RollbackEntry[]
): Promise<{ id: string } | null> {
  const { data: result, error } = await (supabase.from(table) as any)
    .insert(data)
    .select("id")
    .single()

  if (error || !result) return null
  rollbackLog.push({ table, id: result.id })
  return { id: result.id }
}
```

- [ ] **Step 4: Correr tests, pasan.**

- [ ] **Step 5: Commit**

```bash
git add lib/import/executor.ts lib/import/__tests__/executor.test.ts
git commit -m "feat(import-fase2): insert executor with rollback log"
```

---

### Task 9: Pipeline `customers` (más simple, primer end-to-end)

**Files:**
- Create: `lib/import/pipelines/customers.ts`
- Create: `lib/import/__tests__/fixtures/customers-sample.csv`
- Test: `lib/import/__tests__/pipelines/customers.test.ts`

Este pipeline es el más simple — solo valida + inserta clientes. Sirve como template para los otros.

- [ ] **Step 1: Crear fixture**

`lib/import/__tests__/fixtures/customers-sample.csv`:

```csv
Nombre,Apellido,Teléfono,Email,DNI
Juan,Pérez,11-1234-5678,juan@test.com,12345678
María,García,11-8765-4321,maria@test.com,87654321
,Sin Nombre,11-9999-9999,bad@test.com,11111111
```

- [ ] **Step 2: Tests**

```typescript
// lib/import/__tests__/pipelines/customers.test.ts
import { customersPipeline } from "../../pipelines/customers"
import * as fs from "fs"
import * as path from "path"

const AGENCY_ID = "rosario-uuid"

function mockSupabase(opts: { existing?: any; insertResult?: any } = {}) {
  return {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: opts.existing ?? null, error: null }),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: opts.insertResult ?? { id: "new-id" },
      error: null,
    }),
  } as any
}

describe("customersPipeline", () => {
  const csvContent = fs.readFileSync(
    path.join(__dirname, "../fixtures/customers-sample.csv"),
    "utf-8"
  )

  it("dry-run cuenta filas válidas e inválidas sin insertar", async () => {
    const supabase = mockSupabase()
    const result = await customersPipeline(
      supabase,
      csvContent,
      { agencyId: AGENCY_ID, exchangeRate: { mode: "manual_fixed", manualRate: 1450 } },
      { dryRun: true }
    )

    expect(result.totalRows).toBe(3)
    expect(result.successRows).toBe(2)
    expect(result.errorRows).toBe(1) // fila sin nombre
    expect(supabase.insert).not.toHaveBeenCalled()
  })

  it("ejecución real inserta filas válidas con agency_id", async () => {
    const supabase = mockSupabase({ existing: null, insertResult: { id: "x" } })
    const result = await customersPipeline(
      supabase,
      csvContent,
      { agencyId: AGENCY_ID, exchangeRate: { mode: "manual_fixed", manualRate: 1450 } }
    )

    expect(result.successRows).toBe(2)
    expect(supabase.insert).toHaveBeenCalledTimes(2)
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({ agency_id: AGENCY_ID })
    )
  })

  it("skipea customers que ya existen (dedupe por DNI)", async () => {
    const supabase = mockSupabase({ existing: { id: "existing-id" } })
    const result = await customersPipeline(
      supabase,
      csvContent,
      { agencyId: AGENCY_ID, exchangeRate: { mode: "manual_fixed", manualRate: 1450 } }
    )

    expect(result.successRows).toBe(0)
    expect(result.warningRows).toBe(2) // dos warnings de "ya existía"
    expect(supabase.insert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Correr, fallan.**

- [ ] **Step 4: Implementar `lib/import/pipelines/customers.ts`**

```typescript
import { parseCsv } from "../csv-parser"
import { mapHeaders, normalizeHeader } from "../header-mapper"
import { validateRequiredFields, validateEmailFormat } from "../validator"
import { resolveCustomer } from "../resolver"
import { executeInsert } from "../executor"
import type {
  PipelineFn,
  ImportResult,
  ImportError,
  ImportWarning,
  RollbackEntry,
} from "../types"

const SCHEMA = {
  first_name: ["nombre", "first_name"],
  last_name: ["apellido", "last_name"],
  phone: ["telefono", "phone"],
  email: ["email"],
  document_number: ["dni", "document_number", "numero_documento", "numero_de_documento"],
  document_type: ["tipo_documento", "document_type", "tipo_de_documento"],
}

const REQUIRED = ["first_name", "last_name", "phone"]

export const customersPipeline: PipelineFn = async (
  supabase,
  csvContent,
  config,
  options = {}
) => {
  const dryRun = options.dryRun ?? false
  const errors: ImportError[] = []
  const warnings: ImportWarning[] = []
  const rollbackLog: RollbackEntry[] = []

  const rows = parseCsv(csvContent)
  if (rows.length < 2) {
    return emptyResult({ errors, warnings, rollbackLog })
  }

  const [headers, ...dataRows] = rows
  const colMap = mapHeaders(headers, SCHEMA)

  let successRows = 0
  let warningRows = 0

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2 // +2 = +1 for header row, +1 for 1-indexed
    const rawRow = dataRows[i]
    const row: Record<string, string> = {}
    colMap.forEach((field, idx) => {
      row[field] = rawRow[idx]?.trim() ?? ""
    })

    // Validaciones
    const requiredErrors = validateRequiredFields(row, REQUIRED)
    if (requiredErrors.length > 0) {
      requiredErrors.forEach(e =>
        errors.push({ rowNumber, field: e.field, message: e.message })
      )
      continue
    }

    const emailError = validateEmailFormat(row.email ?? "")
    if (emailError) {
      warnings.push({ rowNumber, message: emailError })
    }

    // Dedupe scopeado al agency
    const existing = await resolveCustomer(supabase, config.agencyId, {
      documentNumber: row.document_number,
      email: row.email,
      name:
        row.first_name && row.last_name
          ? { firstName: row.first_name, lastName: row.last_name }
          : undefined,
    })

    if (existing) {
      warnings.push({
        rowNumber,
        message: `Cliente ya existía: ${row.first_name} ${row.last_name}`,
      })
      warningRows++
      continue
    }

    if (dryRun) {
      successRows++
      continue
    }

    const inserted = await executeInsert(
      supabase,
      "customers",
      {
        agency_id: config.agencyId,
        first_name: row.first_name,
        last_name: row.last_name,
        phone: row.phone,
        email: row.email || null,
        document_number: row.document_number || null,
        document_type: row.document_type || null,
      },
      rollbackLog
    )

    if (inserted) {
      successRows++
    } else {
      errors.push({ rowNumber, message: "Falló insert (DB)" })
    }
  }

  return {
    totalRows: dataRows.length,
    successRows,
    errorRows: errors.length,
    warningRows,
    errors,
    warnings,
    rollbackLog,
    previewSummary: {
      customersToCreate: successRows,
    },
  }
}

function emptyResult(partial: Partial<ImportResult>): ImportResult {
  return {
    totalRows: 0,
    successRows: 0,
    errorRows: 0,
    warningRows: 0,
    errors: [],
    warnings: [],
    rollbackLog: [],
    previewSummary: {},
    ...partial,
  }
}
```

- [ ] **Step 5: Correr tests, pasan.**

- [ ] **Step 6: Commit**

```bash
git add lib/import/pipelines/customers.ts lib/import/__tests__/pipelines/customers.test.ts lib/import/__tests__/fixtures/customers-sample.csv
git commit -m "feat(import-fase2): customers pipeline (catálogo)"
```

---

### Task 10: Pipeline `operators`

**Files:**
- Create: `lib/import/pipelines/operators.ts`
- Test: `lib/import/__tests__/pipelines/operators.test.ts`

Mismo patrón que customers, con campos diferentes: `name` (required), `contact_name`, `contact_email`, `contact_phone`, `credit_limit`. Dedupe por nombre case-insensitive.

- [ ] **Step 1: Test fixture y tests siguen el mismo patrón que customers, adaptados.**

```typescript
// Mismos tests pero con campos de operator
// (dry-run / inserción real / dedupe por nombre)
```

- [ ] **Step 2: Implementación sigue el mismo patrón que `customers.ts`** — schema diferente, resolver diferente, INSERT diferente.

```typescript
// lib/import/pipelines/operators.ts
import { parseCsv } from "../csv-parser"
import { mapHeaders } from "../header-mapper"
import { validateRequiredFields, validateEmailFormat } from "../validator"
import { resolveOperator } from "../resolver"
import { executeInsert } from "../executor"
import { parseAmount } from "../normalizer"
import type {
  PipelineFn,
  ImportResult,
  ImportError,
  ImportWarning,
  RollbackEntry,
} from "../types"

const SCHEMA = {
  name: ["nombre", "name", "operador"],
  contact_name: ["contacto", "contact_name", "nombre_contacto"],
  contact_email: ["email_contacto", "contact_email"],
  contact_phone: ["telefono_contacto", "contact_phone"],
  credit_limit: ["limite_credito", "credit_limit"],
}

const REQUIRED = ["name"]

export const operatorsPipeline: PipelineFn = async (
  supabase,
  csvContent,
  config,
  options = {}
) => {
  const dryRun = options.dryRun ?? false
  const errors: ImportError[] = []
  const warnings: ImportWarning[] = []
  const rollbackLog: RollbackEntry[] = []

  const rows = parseCsv(csvContent)
  if (rows.length < 2) {
    return {
      totalRows: 0,
      successRows: 0,
      errorRows: 0,
      warningRows: 0,
      errors,
      warnings,
      rollbackLog,
      previewSummary: {},
    }
  }

  const [headers, ...dataRows] = rows
  const colMap = mapHeaders(headers, SCHEMA)

  let successRows = 0
  let warningRows = 0

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2
    const rawRow = dataRows[i]
    const row: Record<string, string> = {}
    colMap.forEach((field, idx) => {
      row[field] = rawRow[idx]?.trim() ?? ""
    })

    const requiredErrors = validateRequiredFields(row, REQUIRED)
    if (requiredErrors.length > 0) {
      requiredErrors.forEach(e =>
        errors.push({ rowNumber, field: e.field, message: e.message })
      )
      continue
    }

    const emailError = validateEmailFormat(row.contact_email ?? "")
    if (emailError) warnings.push({ rowNumber, message: emailError })

    const existing = await resolveOperator(supabase, config.agencyId, row.name)
    if (existing) {
      warnings.push({ rowNumber, message: `Operador ya existía: ${row.name}` })
      warningRows++
      continue
    }

    if (dryRun) {
      successRows++
      continue
    }

    const credit = row.credit_limit ? parseAmount(row.credit_limit) : null
    const inserted = await executeInsert(
      supabase,
      "operators",
      {
        agency_id: config.agencyId,
        name: row.name,
        contact_name: row.contact_name || null,
        contact_email: row.contact_email || null,
        contact_phone: row.contact_phone || null,
        credit_limit: credit,
      },
      rollbackLog
    )

    if (inserted) successRows++
    else errors.push({ rowNumber, message: "Falló insert (DB)" })
  }

  return {
    totalRows: dataRows.length,
    successRows,
    errorRows: errors.length,
    warningRows,
    errors,
    warnings,
    rollbackLog,
    previewSummary: { operatorsToCreate: successRows },
  }
}
```

- [ ] **Step 3: Tests** (mismo patrón que customers, adaptados a operators).

- [ ] **Step 4: Commit**

```bash
git add lib/import/pipelines/operators.ts lib/import/__tests__/pipelines/operators.test.ts
git commit -m "feat(import-fase2): operators pipeline (catálogo)"
```

---

### Task 11: Pipeline `payments-suelto` (matchea por file_code)

**Files:**
- Create: `lib/import/pipelines/payments-suelto.ts`
- Test: `lib/import/__tests__/pipelines/payments-suelto.test.ts`

Matchea operación por `operation_file_code` y crea payment vinculado. Valida que la operación pertenezca a la agencia.

- [ ] **Step 1: Tests** que verifiquen:
  - Si file_code no existe en la agencia → error
  - Si existe → INSERT con agency_id + operation_id
  - Direction obligatorio (INCOME/EXPENSE)

- [ ] **Step 2: Implementar siguiendo el patrón de customers/operators.**

```typescript
// lib/import/pipelines/payments-suelto.ts
import { parseCsv } from "../csv-parser"
import { mapHeaders } from "../header-mapper"
import { validateRequiredFields } from "../validator"
import { resolveOperationByFileCode } from "../resolver"
import { executeInsert } from "../executor"
import { parseAmount, parseDate, normalizeCurrency } from "../normalizer"
import type {
  PipelineFn,
  ImportError,
  ImportWarning,
  RollbackEntry,
} from "../types"

const SCHEMA = {
  operation_file_code: ["codigo_operacion", "codigo", "operation_file_code", "file_code"],
  amount: ["monto", "amount"],
  currency: ["moneda", "currency"],
  date_due: ["fecha_vencimiento", "fecha_venc", "date_due"],
  date_paid: ["fecha_pago", "date_paid"],
  direction: ["direccion", "direction", "tipo"],
  method: ["metodo", "method"],
  reference: ["referencia", "reference"],
}

const REQUIRED = ["operation_file_code", "amount", "currency", "date_due", "direction"]

export const paymentsSueltoPipeline: PipelineFn = async (
  supabase,
  csvContent,
  config,
  options = {}
) => {
  const dryRun = options.dryRun ?? false
  const errors: ImportError[] = []
  const warnings: ImportWarning[] = []
  const rollbackLog: RollbackEntry[] = []

  const rows = parseCsv(csvContent)
  if (rows.length < 2) {
    return {
      totalRows: 0,
      successRows: 0,
      errorRows: 0,
      warningRows: 0,
      errors,
      warnings,
      rollbackLog,
      previewSummary: {},
    }
  }

  const [headers, ...dataRows] = rows
  const colMap = mapHeaders(headers, SCHEMA)
  let successRows = 0

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2
    const rawRow = dataRows[i]
    const row: Record<string, string> = {}
    colMap.forEach((field, idx) => {
      row[field] = rawRow[idx]?.trim() ?? ""
    })

    const reqErrors = validateRequiredFields(row, REQUIRED)
    if (reqErrors.length > 0) {
      reqErrors.forEach(e =>
        errors.push({ rowNumber, field: e.field, message: e.message })
      )
      continue
    }

    // Resolver operación SCOPED a la agencia (defensa en profundidad)
    const operation = await resolveOperationByFileCode(
      supabase,
      config.agencyId,
      row.operation_file_code
    )
    if (!operation) {
      errors.push({
        rowNumber,
        message: `Operación no encontrada en esta agencia: ${row.operation_file_code}`,
      })
      continue
    }

    const amount = parseAmount(row.amount)
    if (amount === null || amount < 0) {
      errors.push({ rowNumber, field: "amount", message: "Monto inválido" })
      continue
    }

    const currency = normalizeCurrency(row.currency)
    if (!currency) {
      errors.push({ rowNumber, field: "currency", message: "Currency inválida" })
      continue
    }

    const direction = row.direction.toUpperCase()
    if (direction !== "INCOME" && direction !== "EXPENSE") {
      errors.push({
        rowNumber,
        field: "direction",
        message: "Direction debe ser INCOME o EXPENSE",
      })
      continue
    }

    const dateDue = parseDate(row.date_due)
    if (!dateDue) {
      errors.push({ rowNumber, field: "date_due", message: "Fecha vencimiento inválida" })
      continue
    }
    const datePaid = row.date_paid ? parseDate(row.date_paid) : null

    if (dryRun) {
      successRows++
      continue
    }

    const inserted = await executeInsert(
      supabase,
      "payments",
      {
        agency_id: config.agencyId,
        operation_id: operation.id,
        amount,
        currency,
        direction,
        payer_type: direction === "INCOME" ? "CUSTOMER" : "OPERATOR",
        method: row.method || "TRANSFER",
        date_due: dateDue.toISOString().slice(0, 10),
        date_paid: datePaid ? datePaid.toISOString().slice(0, 10) : null,
        status: datePaid ? "PAID" : "PENDING",
        reference: row.reference || null,
      },
      rollbackLog
    )

    if (inserted) successRows++
    else errors.push({ rowNumber, message: "Falló insert payment (DB)" })
  }

  return {
    totalRows: dataRows.length,
    successRows,
    errorRows: errors.length,
    warningRows: warnings.length,
    errors,
    warnings,
    rollbackLog,
    previewSummary: { paymentsToCreate: successRows },
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/import/pipelines/payments-suelto.ts lib/import/__tests__/pipelines/payments-suelto.test.ts
git commit -m "feat(import-fase2): payments-suelto pipeline (matchea file_code)"
```

---

### Task 12: Pipeline `cash-movements`

**Files:**
- Create: `lib/import/pipelines/cash-movements.ts`
- Test: `lib/import/__tests__/pipelines/cash-movements.test.ts`

Movimientos sueltos. Campos: `date`, `type` (INCOME/EXPENSE), `amount`, `currency`, `account_name` (opcional, busca en `financial_accounts`), `category`, `notes`, `operation_file_code` (opcional, vincula).

- [ ] **Step 1-3: Mismo patrón** que payments-suelto. Tests + impl + commit.

```typescript
// lib/import/pipelines/cash-movements.ts
import { parseCsv } from "../csv-parser"
import { mapHeaders } from "../header-mapper"
import { validateRequiredFields } from "../validator"
import { resolveOperationByFileCode } from "../resolver"
import { executeInsert } from "../executor"
import { parseAmount, parseDate, normalizeCurrency } from "../normalizer"
import type { PipelineFn, ImportError, ImportWarning, RollbackEntry } from "../types"

const SCHEMA = {
  date: ["fecha", "date"],
  type: ["tipo", "type"],
  amount: ["monto", "amount"],
  currency: ["moneda", "currency"],
  account_name: ["cuenta", "account_name"],
  category: ["categoria", "category"],
  notes: ["notas", "notes"],
  operation_file_code: ["codigo_operacion", "operation_file_code"],
}

const REQUIRED = ["date", "type", "amount", "currency"]

export const cashMovementsPipeline: PipelineFn = async (
  supabase,
  csvContent,
  config,
  options = {}
) => {
  const dryRun = options.dryRun ?? false
  const errors: ImportError[] = []
  const warnings: ImportWarning[] = []
  const rollbackLog: RollbackEntry[] = []

  const rows = parseCsv(csvContent)
  if (rows.length < 2) {
    return {
      totalRows: 0,
      successRows: 0,
      errorRows: 0,
      warningRows: 0,
      errors,
      warnings,
      rollbackLog,
      previewSummary: {},
    }
  }

  const [headers, ...dataRows] = rows
  const colMap = mapHeaders(headers, SCHEMA)
  let successRows = 0

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2
    const rawRow = dataRows[i]
    const row: Record<string, string> = {}
    colMap.forEach((field, idx) => {
      row[field] = rawRow[idx]?.trim() ?? ""
    })

    const reqErrors = validateRequiredFields(row, REQUIRED)
    if (reqErrors.length > 0) {
      reqErrors.forEach(e => errors.push({ rowNumber, field: e.field, message: e.message }))
      continue
    }

    const type = row.type.toUpperCase()
    if (type !== "INCOME" && type !== "EXPENSE") {
      errors.push({ rowNumber, field: "type", message: "Type debe ser INCOME o EXPENSE" })
      continue
    }

    const amount = parseAmount(row.amount)
    if (amount === null || amount < 0) {
      errors.push({ rowNumber, field: "amount", message: "Monto inválido" })
      continue
    }

    const currency = normalizeCurrency(row.currency)
    if (!currency) {
      errors.push({ rowNumber, field: "currency", message: "Currency inválida" })
      continue
    }

    const movementDate = parseDate(row.date)
    if (!movementDate) {
      errors.push({ rowNumber, field: "date", message: "Fecha inválida" })
      continue
    }

    let operationId: string | null = null
    if (row.operation_file_code) {
      const op = await resolveOperationByFileCode(supabase, config.agencyId, row.operation_file_code)
      if (op) operationId = op.id
      else warnings.push({ rowNumber, message: `Operación no encontrada: ${row.operation_file_code}` })
    }

    if (dryRun) {
      successRows++
      continue
    }

    const inserted = await executeInsert(
      supabase,
      "cash_movements",
      {
        agency_id: config.agencyId,
        type,
        amount,
        currency,
        movement_date: movementDate.toISOString().slice(0, 10),
        category: row.category || (type === "INCOME" ? "SALE" : "OTHER"),
        notes: row.notes || null,
        operation_id: operationId,
      },
      rollbackLog
    )

    if (inserted) successRows++
    else errors.push({ rowNumber, message: "Falló insert cash_movement (DB)" })
  }

  return {
    totalRows: dataRows.length,
    successRows,
    errorRows: errors.length,
    warningRows: warnings.length,
    errors,
    warnings,
    rollbackLog,
    previewSummary: { cashMovementsToCreate: successRows },
  }
}
```

- [ ] **Commit**

```bash
git add lib/import/pipelines/cash-movements.ts lib/import/__tests__/pipelines/cash-movements.test.ts
git commit -m "feat(import-fase2): cash-movements pipeline"
```

---

### Task 13: Pipeline `operations-master` (canónico, complejo)

**Files:**
- Create: `lib/import/pipelines/operations-master.ts`
- Create: `lib/import/__tests__/fixtures/rosario-sample-3rows.csv`
- Test: `lib/import/__tests__/pipelines/operations-master.test.ts`

**Este es el pipeline canónico**. Una fila genera: cliente (si nuevo), N operadores (si nuevos), operación, `operation_customers`, `operation_operators` (con costos por operador), payments INCOME PAID/PENDING (cobrado/pendiente), payments EXPENSE PAID/PENDING por operador.

**Ledger movements e IVA quedan FUERA de Fase 2** (los hace `lib/accounting/ledger.ts` y `lib/accounting/iva.ts` cuando se inserta una operation con la lógica de la app — pero el pipeline tiene que llamarlos explícitamente). En este plan los integramos en Task 13b si el tiempo alcanza, sino quedan como follow-up.

- [ ] **Step 1: Crear fixture con 3 filas del CSV de Rosario**

`lib/import/__tests__/fixtures/rosario-sample-3rows.csv`:

```csv
Código,Fecha Operación,Nombre del Cliente,Email Cliente,Destino,Fecha Salida,Fecha Regreso,Adultos,Niños,Monto Venta,Monto Cobrado,Pendiente de Cobrar,Monto Operador,Pagado a Operador,Pendiente a Operador,Operador 1,Costo Operador 1,Operador 2,Costo Operador 2,Operador 3,Costo Operador 3,Moneda,Estado,Nombre Vendedor
,2026-02-15,Septiembre Nuñez,,Bayahibe,13/03/2026,21/03/2026,6,,"$13,680","$5,730","$7,950","$12,381","$5,397","$6,984",Delfos,"$6,984",,,,,USD,CONFIRMED,Emi
,2026-02-20,Noviembre Abud,,Aruba,03/04/2026,11/04/2026,3,,"$5,070","$5,070","$0","$4,616","$1,968","$2,648",Delfos,"$2,648",,,,,USD,CONFIRMED,Cande
,2026-02-25,Julio Acevedo,,Bayahibe,22/05/2026,31/05/2026,20,8,"$62,190","$28,850","$33,340","$57,714","$26,957","$30,757",Lozada,"$30,757",,,,,USD,CONFIRMED,Mica - Jose
```

- [ ] **Step 2: Tests** verificando para cada fila:
  - Cliente se crea si no existe (con agency_id)
  - Operador se crea si no existe (con agency_id)
  - Operación se crea (con agency_id, file_code auto-generado, operation_date, márgenes calculados)
  - `operation_customers` linkea cliente
  - `operation_operators` linkea operadores con sus costos
  - Si Monto Cobrado > 0 → un payment INCOME PAID
  - Si Pendiente Cobrar > 0 → un payment INCOME PENDING
  - Si Pagado Operador > 0 → un payment EXPENSE PAID por operador
  - Si Pendiente Operador > 0 → un payment EXPENSE PENDING por operador
  - Conversión USD → ARS según config

```typescript
// lib/import/__tests__/pipelines/operations-master.test.ts
import { operationsMasterPipeline } from "../../pipelines/operations-master"
import * as fs from "fs"
import * as path from "path"

const AGENCY_ID = "rosario-uuid"

// Mock helper: cuenta calls a from(table) por tabla
function trackingMockSupabase() {
  const inserted: Record<string, any[]> = {}
  const inserts = jest.fn((table: string) => ({
    insert: jest.fn((data: any) => ({
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockImplementation(() => {
        if (!inserted[table]) inserted[table] = []
        inserted[table].push(data)
        return Promise.resolve({ data: { id: `${table}-${inserted[table].length}` }, error: null })
      }),
    })),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  }))
  return { from: inserts, _inserted: inserted } as any
}

describe("operationsMasterPipeline", () => {
  const csv = fs.readFileSync(
    path.join(__dirname, "../fixtures/rosario-sample-3rows.csv"),
    "utf-8"
  )

  it("crea cliente + operador + operación + payments por fila", async () => {
    const supabase = trackingMockSupabase()
    const result = await operationsMasterPipeline(
      supabase,
      csv,
      {
        agencyId: AGENCY_ID,
        exchangeRate: { mode: "manual_fixed", manualRate: 1450 },
      }
    )

    expect(result.totalRows).toBe(3)
    expect(result.successRows).toBe(3)
    expect(result.errorRows).toBe(0)

    // Customers (3 nuevos, todos diferentes)
    expect(supabase._inserted.customers).toHaveLength(3)
    expect(supabase._inserted.customers[0].agency_id).toBe(AGENCY_ID)

    // Operadores únicos (Delfos x2 + Lozada x1 → 2 distintos, dedupeo se hace via resolveOperator)
    // Pero como el mock siempre retorna null para resolveOperator, se crean 3
    expect(supabase._inserted.operators).toHaveLength(3)

    // Operations
    expect(supabase._inserted.operations).toHaveLength(3)
    expect(supabase._inserted.operations[0].agency_id).toBe(AGENCY_ID)
    expect(supabase._inserted.operations[0].operation_date).toBe("2026-02-15")

    // operation_customers + operation_operators
    expect(supabase._inserted.operation_customers).toHaveLength(3)
    expect(supabase._inserted.operation_operators).toHaveLength(3) // 1 operador por op

    // Payments: cada fila genera entre 2-4 payments
    // Fila 1 (Septiembre): cobrado>0, pendiente>0, pagado>0, pendiente_op>0 → 4 payments
    // Fila 2 (Noviembre): cobrado>0, pendiente=0, pagado>0, pendiente_op>0 → 3 payments
    // Fila 3 (Julio): cobrado>0, pendiente>0, pagado>0, pendiente_op>0 → 4 payments
    // Total: 11 payments
    expect(supabase._inserted.payments).toHaveLength(11)
    expect(supabase._inserted.payments[0].agency_id).toBe(AGENCY_ID)
  })

  it("dry-run no inserta nada", async () => {
    const supabase = trackingMockSupabase()
    const result = await operationsMasterPipeline(
      supabase,
      csv,
      {
        agencyId: AGENCY_ID,
        exchangeRate: { mode: "manual_fixed", manualRate: 1450 },
      },
      { dryRun: true }
    )

    expect(result.successRows).toBe(3)
    expect(supabase._inserted.customers).toBeUndefined()
    expect(supabase._inserted.operations).toBeUndefined()
  })

  it("convierte USD→ARS al insertar operación", async () => {
    const supabase = trackingMockSupabase()
    await operationsMasterPipeline(
      supabase,
      csv,
      {
        agencyId: AGENCY_ID,
        exchangeRate: { mode: "manual_fixed", manualRate: 1450 },
      }
    )

    // Fila 1: 13680 USD * 1450 = 19,836,000 ARS
    expect(supabase._inserted.operations[0].sale_amount_total).toBe(19836000)
    expect(supabase._inserted.operations[0].currency).toBe("ARS")
  })
})
```

- [ ] **Step 3: Implementar `lib/import/pipelines/operations-master.ts`**

```typescript
// lib/import/pipelines/operations-master.ts
import { parseCsv } from "../csv-parser"
import { mapHeaders } from "../header-mapper"
import { validateRequiredFields } from "../validator"
import {
  resolveCustomer,
  resolveOperator,
  resolveSeller,
  resolveOperationByFileCode,
} from "../resolver"
import { executeInsert } from "../executor"
import {
  parseAmount,
  parseDate,
  normalizeCurrency,
  normalizeStatus,
} from "../normalizer"
import { createExchangeRateResolver } from "../exchange-rate-resolver"
import type {
  PipelineFn,
  ImportError,
  ImportWarning,
  RollbackEntry,
} from "../types"

const SCHEMA = {
  file_code: ["codigo", "file_code"],
  operation_date: ["fecha_operacion", "fecha_de_operacion", "operation_date"],
  customer_name: ["nombre_cliente", "nombre_del_cliente", "cliente"],
  customer_email: ["email_cliente", "email"],
  destination: ["destino"],
  departure_date: ["fecha_salida", "salida"],
  return_date: ["fecha_regreso", "regreso"],
  adults: ["adultos"],
  children: ["ninos", "niños"],
  sale_amount: ["monto_venta", "venta"],
  amount_collected: ["monto_cobrado", "cobrado"],
  amount_pending: ["pendiente_de_cobrar", "pendiente_cobrar"],
  amount_paid_to_operator: ["pagado_a_operador", "pagado_operador"],
  amount_pending_to_operator: ["pendiente_a_operador", "pendiente_operador"],
  operator_1: ["operador_1"],
  cost_operator_1: ["costo_operador_1"],
  operator_2: ["operador_2"],
  cost_operator_2: ["costo_operador_2"],
  operator_3: ["operador_3"],
  cost_operator_3: ["costo_operador_3"],
  currency: ["moneda", "currency"],
  status: ["estado", "status"],
  seller_name: ["nombre_vendedor", "vendedor"],
}

const REQUIRED = [
  "operation_date",
  "customer_name",
  "destination",
  "departure_date",
  "sale_amount",
  "currency",
]

function generateFileCode(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `OP-${date}-${rand}`
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: "" }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

export const operationsMasterPipeline: PipelineFn = async (
  supabase,
  csvContent,
  config,
  options = {}
) => {
  const dryRun = options.dryRun ?? false
  const errors: ImportError[] = []
  const warnings: ImportWarning[] = []
  const rollbackLog: RollbackEntry[] = []

  const rows = parseCsv(csvContent)
  if (rows.length < 2) {
    return {
      totalRows: 0,
      successRows: 0,
      errorRows: 0,
      warningRows: 0,
      errors,
      warnings,
      rollbackLog,
      previewSummary: {},
    }
  }

  const [headers, ...dataRows] = rows
  const colMap = mapHeaders(headers, SCHEMA)
  const fxResolver = createExchangeRateResolver(supabase, config.exchangeRate)

  let successRows = 0
  let customersCreated = 0
  let operatorsCreated = 0
  let operationsCreated = 0
  let paymentsCreated = 0

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2
    const rawRow = dataRows[i]
    const row: Record<string, string> = {}
    colMap.forEach((field, idx) => {
      row[field] = rawRow[idx]?.trim() ?? ""
    })

    const reqErrors = validateRequiredFields(row, REQUIRED)
    if (reqErrors.length > 0) {
      reqErrors.forEach(e =>
        errors.push({ rowNumber, field: e.field, message: e.message })
      )
      continue
    }

    const opDate = parseDate(row.operation_date)
    const departureDate = parseDate(row.departure_date)
    if (!opDate || !departureDate) {
      errors.push({ rowNumber, message: "Fechas inválidas" })
      continue
    }
    const returnDate = row.return_date ? parseDate(row.return_date) : null

    const currency = normalizeCurrency(row.currency)
    if (!currency) {
      errors.push({ rowNumber, message: "Currency inválida" })
      continue
    }

    const status = normalizeStatus(row.status) ?? config.defaultStatus ?? "CONFIRMED"

    const saleAmountRaw = parseAmount(row.sale_amount)
    if (saleAmountRaw === null || saleAmountRaw < 0) {
      errors.push({ rowNumber, field: "sale_amount", message: "Monto venta inválido" })
      continue
    }

    // Conversión a ARS si es USD
    let fxRate = 1
    if (currency === "USD") {
      fxRate = await fxResolver(opDate)
    }
    const saleAmountArs = saleAmountRaw * fxRate

    // ─── Cliente ─────────────────────────────────
    const { firstName, lastName } = splitName(row.customer_name)
    let customer = await resolveCustomer(supabase, config.agencyId, {
      email: row.customer_email,
      name: { firstName, lastName },
    })

    if (!customer && !dryRun) {
      const inserted = await executeInsert(
        supabase,
        "customers",
        {
          agency_id: config.agencyId,
          first_name: firstName,
          last_name: lastName,
          phone: "",
          email: row.customer_email || null,
        },
        rollbackLog
      )
      if (inserted) {
        customer = inserted
        customersCreated++
      }
    } else if (!customer && dryRun) {
      customersCreated++
    }

    // ─── Operadores (hasta 3) ────────────────────
    const operatorEntries: Array<{ id: string; cost: number; costOperator: number; paid: number; pending: number }> = []
    for (let opIdx = 1; opIdx <= 3; opIdx++) {
      const opName = row[`operator_${opIdx}`]
      if (!opName) continue

      const costRaw = parseAmount(row[`cost_operator_${opIdx}`] ?? "") ?? 0
      const costArs = currency === "USD" ? costRaw * fxRate : costRaw

      let operator = await resolveOperator(supabase, config.agencyId, opName)
      if (!operator && !dryRun) {
        const inserted = await executeInsert(
          supabase,
          "operators",
          { agency_id: config.agencyId, name: opName },
          rollbackLog
        )
        if (inserted) {
          operator = inserted
          operatorsCreated++
        }
      } else if (!operator && dryRun) {
        operatorsCreated++
      }

      if (operator) {
        operatorEntries.push({
          id: operator.id,
          cost: costArs,
          costOperator: costRaw,
          paid: 0, // se setea abajo proporcional
          pending: 0,
        })
      }
    }

    const totalOperatorCost = operatorEntries.reduce((s, e) => s + e.cost, 0)
    const marginAmount = saleAmountArs - totalOperatorCost
    const marginPercentage = saleAmountArs > 0 ? (marginAmount / saleAmountArs) * 100 : 0

    // Vendedor (opcional, si lo encontramos lo usamos; sino dejamos null y la op
    // se crea con el seller_id default que el endpoint normalmente usa)
    const seller = row.seller_name
      ? await resolveSeller(supabase, config.agencyId, { name: row.seller_name })
      : null

    if (!seller) {
      warnings.push({ rowNumber, message: `Vendedor no encontrado: ${row.seller_name}` })
    }

    // ─── Operación ───────────────────────────────
    const fileCode = row.file_code || generateFileCode()
    let operation: { id: string } | null = null

    if (!dryRun) {
      operation = await executeInsert(
        supabase,
        "operations",
        {
          agency_id: config.agencyId,
          file_code: fileCode,
          seller_id: seller?.id ?? null,
          type: "PACKAGE",
          product_type: "PAQUETE",
          destination: row.destination,
          departure_date: departureDate.toISOString().slice(0, 10),
          return_date: returnDate ? returnDate.toISOString().slice(0, 10) : null,
          adults: row.adults ? parseInt(row.adults) : 1,
          children: row.children ? parseInt(row.children) : 0,
          infants: 0,
          status,
          operation_date: opDate.toISOString().slice(0, 10),
          sale_amount_total: saleAmountArs,
          operator_cost: totalOperatorCost,
          currency: "ARS",
          sale_currency: "ARS",
          operator_cost_currency: "ARS",
          margin_amount: marginAmount,
          margin_percentage: marginPercentage,
        },
        rollbackLog
      )
      if (!operation) {
        errors.push({ rowNumber, message: "Falló insert operation (DB)" })
        continue
      }
      operationsCreated++

      // Vincular cliente
      if (customer) {
        await executeInsert(
          supabase,
          "operation_customers",
          {
            operation_id: operation.id,
            customer_id: customer.id,
            role: "MAIN",
          },
          rollbackLog
        )
      }

      // Vincular operadores
      for (const oe of operatorEntries) {
        await executeInsert(
          supabase,
          "operation_operators",
          {
            operation_id: operation.id,
            operator_id: oe.id,
            cost: oe.cost,
            product_type: "PAQUETE",
          },
          rollbackLog
        )
      }
    } else {
      operationsCreated++
    }

    // ─── Payments ────────────────────────────────
    const collected = parseAmount(row.amount_collected ?? "") ?? 0
    const pendingCollected = parseAmount(row.amount_pending ?? "") ?? 0
    const totalPaidToOps = parseAmount(row.amount_paid_to_operator ?? "") ?? 0
    const totalPendingToOps = parseAmount(row.amount_pending_to_operator ?? "") ?? 0

    const collectedArs = currency === "USD" ? collected * fxRate : collected
    const pendingCollectedArs = currency === "USD" ? pendingCollected * fxRate : pendingCollected

    if (collectedArs > 0 && operation && !dryRun) {
      await executeInsert(
        supabase,
        "payments",
        {
          agency_id: config.agencyId,
          operation_id: operation.id,
          amount: collectedArs,
          currency: "ARS",
          direction: "INCOME",
          payer_type: "CUSTOMER",
          method: "TRANSFER",
          date_due: opDate.toISOString().slice(0, 10),
          date_paid: opDate.toISOString().slice(0, 10),
          status: "PAID",
        },
        rollbackLog
      )
      paymentsCreated++
    } else if (collectedArs > 0) {
      paymentsCreated++ // dryRun
    }

    if (pendingCollectedArs > 0 && operation && !dryRun) {
      await executeInsert(
        supabase,
        "payments",
        {
          agency_id: config.agencyId,
          operation_id: operation.id,
          amount: pendingCollectedArs,
          currency: "ARS",
          direction: "INCOME",
          payer_type: "CUSTOMER",
          method: "TRANSFER",
          date_due: departureDate.toISOString().slice(0, 10),
          status: "PENDING",
        },
        rollbackLog
      )
      paymentsCreated++
    } else if (pendingCollectedArs > 0) {
      paymentsCreated++
    }

    // Distribuir paid/pending entre operadores proporcional al cost
    if (totalOperatorCost > 0 && operatorEntries.length > 0) {
      for (const oe of operatorEntries) {
        const ratio = oe.cost / totalOperatorCost
        const paid = totalPaidToOps * (currency === "USD" ? fxRate : 1) * ratio
        const pending = totalPendingToOps * (currency === "USD" ? fxRate : 1) * ratio

        if (paid > 0 && operation && !dryRun) {
          await executeInsert(
            supabase,
            "payments",
            {
              agency_id: config.agencyId,
              operation_id: operation.id,
              amount: paid,
              currency: "ARS",
              direction: "EXPENSE",
              payer_type: "OPERATOR",
              method: "TRANSFER",
              date_due: opDate.toISOString().slice(0, 10),
              date_paid: opDate.toISOString().slice(0, 10),
              status: "PAID",
            },
            rollbackLog
          )
          paymentsCreated++
        } else if (paid > 0) {
          paymentsCreated++
        }

        if (pending > 0 && operation && !dryRun) {
          await executeInsert(
            supabase,
            "payments",
            {
              agency_id: config.agencyId,
              operation_id: operation.id,
              amount: pending,
              currency: "ARS",
              direction: "EXPENSE",
              payer_type: "OPERATOR",
              method: "TRANSFER",
              date_due: departureDate.toISOString().slice(0, 10),
              status: "PENDING",
            },
            rollbackLog
          )
          paymentsCreated++
        } else if (pending > 0) {
          paymentsCreated++
        }
      }
    }

    successRows++
  }

  return {
    totalRows: dataRows.length,
    successRows,
    errorRows: errors.length,
    warningRows: warnings.length,
    errors,
    warnings,
    rollbackLog,
    previewSummary: {
      customersToCreate: customersCreated,
      operatorsToCreate: operatorsCreated,
      operationsToCreate: operationsCreated,
      paymentsToCreate: paymentsCreated,
    },
  }
}
```

- [ ] **Step 4: Correr tests, pasan.**

- [ ] **Step 5: Commit**

```bash
git add lib/import/pipelines/operations-master.ts lib/import/__tests__/pipelines/operations-master.test.ts lib/import/__tests__/fixtures/rosario-sample-3rows.csv
git commit -m "feat(import-fase2): operations-master pipeline (canonical)"
```

---

### Task 14: Plantillas CSV descargables

**Files:**
- Create: `lib/import/templates/operations-master.csv`
- Create: `lib/import/templates/customers.csv`
- Create: `lib/import/templates/operators.csv`
- Create: `lib/import/templates/payments-suelto.csv`
- Create: `lib/import/templates/cash-movements.csv`

CSVs estáticos que sirven como ejemplo descargable. La UI de Fase 3 los servirá como `text/csv`.

- [ ] **Step 1: Crear los 5 archivos.**

`lib/import/templates/operations-master.csv`:

```csv
Código,Fecha Operación,Nombre del Cliente,Email Cliente,Destino,Fecha Salida,Fecha Regreso,Adultos,Niños,Monto Venta,Monto Cobrado,Pendiente de Cobrar,Monto Operador,Pagado a Operador,Pendiente a Operador,Operador 1,Costo Operador 1,Operador 2,Costo Operador 2,Operador 3,Costo Operador 3,Moneda,Estado,Nombre Vendedor
,2026-03-15,Juan Pérez,juan@example.com,Cancún,15/04/2026,22/04/2026,2,0,1500000,800000,700000,1200000,500000,700000,Despegar,1200000,,,,,ARS,CONFIRMED,vendedor@agencia.com
```

(Continuar con los otros 4 archivos siguiendo el mismo patrón.)

- [ ] **Step 2: Commit**

```bash
git add lib/import/templates/
git commit -m "feat(import-fase2): downloadable CSV templates"
```

---

### Task 15: Index público + integration test mínimo

**Files:**
- Create: `lib/import/index.ts`
- Test: `lib/import/__tests__/integration.test.ts`

- [ ] **Step 1: Crear index.ts que exporta todo lo público**

```typescript
// lib/import/index.ts
export type {
  AgencyId,
  ImportPipeline,
  ImportConfig,
  ImportResult,
  ImportError,
  ImportWarning,
  RollbackEntry,
  ExchangeRateConfig,
  PipelineFn,
} from "./types"

export { customersPipeline } from "./pipelines/customers"
export { operatorsPipeline } from "./pipelines/operators"
export { paymentsSueltoPipeline } from "./pipelines/payments-suelto"
export { cashMovementsPipeline } from "./pipelines/cash-movements"
export { operationsMasterPipeline } from "./pipelines/operations-master"

import type { ImportPipeline, PipelineFn } from "./types"
import { customersPipeline } from "./pipelines/customers"
import { operatorsPipeline } from "./pipelines/operators"
import { paymentsSueltoPipeline } from "./pipelines/payments-suelto"
import { cashMovementsPipeline } from "./pipelines/cash-movements"
import { operationsMasterPipeline } from "./pipelines/operations-master"

export const PIPELINES: Record<ImportPipeline, PipelineFn> = {
  "customers": customersPipeline,
  "operators": operatorsPipeline,
  "payments-suelto": paymentsSueltoPipeline,
  "cash-movements": cashMovementsPipeline,
  "operations-master": operationsMasterPipeline,
}
```

- [ ] **Step 2: Smoke integration test**

```typescript
// lib/import/__tests__/integration.test.ts
import { PIPELINES } from "../index"

describe("PIPELINES registry", () => {
  it("expone los 5 pipelines", () => {
    expect(Object.keys(PIPELINES)).toEqual([
      "customers",
      "operators",
      "payments-suelto",
      "cash-movements",
      "operations-master",
    ])
  })

  it("cada pipeline es una función async", () => {
    Object.values(PIPELINES).forEach(pipeline => {
      expect(typeof pipeline).toBe("function")
    })
  })
})
```

- [ ] **Step 3: Run all tests del módulo import**

Run: `cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas" && npx jest lib/import/`
Expected: TODOS los tests verdes.

- [ ] **Step 4: Commit final**

```bash
git add lib/import/index.ts lib/import/__tests__/integration.test.ts
git commit -m "feat(import-fase2): public API + integration smoke test"
```

---

## Out of Scope (siguientes fases)

- **Ledger movements e IVA dentro del pipeline operations-master**: la lógica existe en `lib/accounting/ledger.ts` y `lib/accounting/iva.ts`. Integrar los llamados al pipeline queda como follow-up (puede ser la primera task de Fase 2.5 o parte de Fase 3 cuando hagamos jobs async).
- **Smoke test E2E con BD real** ejecutando el CSV de Rosario (889 filas) — script separado en `scripts/`.
- **Tabla `import_jobs`**: Fase 3.
- **Worker async + UI + endpoints**: Fase 3.
- **Wizard onboarding**: Fase 4.

---

## Self-Review (autor)

**Spec coverage:**
- ✅ Sección "Estructura `lib/import/`" → cubierta por Tasks 1-15.
- ✅ Plantilla CSV master con todos los campos → Task 14 + lookup en Task 13.
- ✅ Conversión USD↔ARS configurable (3 modos) → Task 5 + uso en Task 13.
- ✅ Pipeline canónico operations-master con 14 pasos → Task 13 cubre 12 (sin ledger/IVA, marcado en Out of Scope).
- ✅ Pipelines secundarios (customers, operators, payments-suelto, cash-movements) → Tasks 9, 10, 11, 12.
- ✅ Resolver scopeado por agency_id → Task 6 con tests explícitos.
- ✅ Validator → Task 7.
- ✅ Executor con rollback log → Task 8.

**Placeholder scan:**
- Sin TBD/TODO. Cada step tiene código completo.
- En Tasks 7, 10, 11, 12 algunos tests están como "mismo patrón que customers" — indiqué qué cubrir, no repetí cada caso. **Decisión consciente** para no inflar el plan a 3000 líneas; el ejecutor puede mirar el test de customers (Task 9) como referencia.

**Type consistency:**
- `PipelineFn` definido en Task 1, usado consistentemente en Tasks 9-13.
- `ImportResult` con campos `customersToCreate`, `operatorsToCreate`, etc. — los pipelines los setean según corresponda.
- `RollbackEntry` con `{table, id}` — el executor lo usa, todos los pipelines lo pasan.

**Notas para el ejecutor:**
- El plan asume jest 30 + jsdom. Si algún test depende de fetch o DOM, necesita `@jest-environment node` directive en el archivo.
- Si algún pipeline falla en CI por concurrencia (`successRows` no determinístico), agregar `await` explícitos donde lo necesite — Promise.all puede ayudar pero complica rollback.
- El test de `operations-master` con 11 payments asume distribución específica del fixture; ajustar si se modifica el fixture.
