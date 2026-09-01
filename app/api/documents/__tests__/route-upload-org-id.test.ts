// app/api/documents/__tests__/route-upload-org-id.test.ts
/**
 * @jest-environment node
 *
 * VIB-139 — "cargo el DNI, me dice que está cargado correctamente pero no puedo verlo".
 *
 * Las rutas que insertan en `documents` nunca escribían `org_id`, pero la
 * pantalla del cliente lee con `.eq("org_id", userOrgId)`. El insert entraba
 * (de ahí el mensaje de éxito) y la lectura no lo encontraba nunca. En
 * producción había 1177 de 1327 documentos (89%) con org_id NULL, repartidos
 * en 5 agencias.
 *
 * El invariante que fija este test es simple y vale para cualquier tenant:
 * todo documento nace sellado con la org de quien lo sube. Se verifica sobre
 * el payload real del insert, no sobre la respuesta HTTP, porque justamente
 * el bug era que la respuesta decía 200 mientras la fila quedaba huérfana.
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => {
      const body = JSON.stringify(data)
      return {
        status: init?.status ?? 200,
        json: async () => JSON.parse(body),
      }
    },
  },
}))

jest.mock("@/lib/permissions/request", () => ({ getRequestPermissions: jest.fn() }))
jest.mock("@/lib/permissions-api", () => ({ canAccessDocumentResource: jest.fn() }))
jest.mock("openai", () => ({ __esModule: true, default: jest.fn(() => ({})) }))
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }))

import { createClient } from "@supabase/supabase-js"
import { canAccessDocumentResource } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"

const ORG_ID = "11111111-1111-1111-1111-111111111111"
const OTHER_ORG_ID = "22222222-2222-2222-2222-222222222222"
const USER_ID = "33333333-3333-3333-3333-333333333333"
const CUSTOMER_ID = "44444444-4444-4444-4444-444444444444"

/** Payloads capturados de `documents.insert(...)` durante el test. */
let insertedDocuments: any[] = []

/**
 * Cliente Supabase mínimo: storage que "sube" bien y un `from()` que captura
 * lo que se inserta en `documents` y devuelve vacío para el resto.
 */
function buildSupabaseMock() {
  return {
    storage: {
      from: () => ({
        upload: jest.fn(async () => ({ data: { path: "x" }, error: null })),
        getPublicUrl: () => ({ data: { publicUrl: "https://storage.test/doc.pdf" } }),
        remove: jest.fn(async () => ({ data: null, error: null })),
      }),
    },
    from: (table: string) => {
      if (table === "documents") {
        return {
          insert: (payload: any) => {
            insertedDocuments.push(payload)
            return {
              select: () => ({
                single: async () => ({
                  data: { id: "doc-1", ...payload },
                  error: null,
                }),
              }),
            }
          },
          update: () => ({ eq: async () => ({ error: null }) }),
          select: () => buildEmptyQuery(),
        }
      }
      return { select: () => buildEmptyQuery() }
    },
  }
}

/** Query encadenable que siempre resuelve vacío (sin operaciones ni leads). */
function buildEmptyQuery(): any {
  const q: any = {
    eq: () => q,
    in: () => q,
    limit: () => q,
    order: () => q,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    then: (resolve: any) => resolve({ data: [], error: null }),
  }
  return q
}

/** Request falso con el formData que manda la pantalla de documentos. */
function buildRequest(fields: Record<string, unknown>) {
  const map = new Map<string, unknown>(Object.entries(fields))
  return {
    formData: async () => ({ get: (k: string) => (map.has(k) ? map.get(k) : null) }),
  } as any
}

/** Archivo falso: PDF a propósito, para no entrar en la rama de OCR. */
function buildFile() {
  return {
    name: "dni.pdf",
    type: "application/pdf",
    size: 1024,
    arrayBuffer: async () => new ArrayBuffer(8),
  }
}

describe("VIB-139 — los documentos nacen con org_id", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    insertedDocuments = []
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key"
    ;(createClient as jest.Mock).mockImplementation(() => buildSupabaseMock())
    ;(canAccessDocumentResource as jest.Mock).mockResolvedValue(true)
    ;(getRequestPermissions as jest.Mock).mockResolvedValue({
      user: { id: USER_ID, org_id: ORG_ID, role: "ADMIN" },
      matrix: {},
    })
  })

  // Las dos rutas que usa la app: el diálogo genérico pega a /upload y la
  // sección de documentos del cliente —la del ticket— a /upload-with-ocr.
  const routes: Array<{ name: string; load: () => Promise<any> }> = [
    { name: "upload", load: () => import("../upload/route") },
    { name: "upload-with-ocr", load: () => import("../upload-with-ocr/route") },
  ]

  describe.each(routes)("POST /api/documents/$name", ({ load }) => {
    it("sella el documento con la org del usuario que lo sube", async () => {
      const { POST } = await load()

      const response = await POST(
        buildRequest({ file: buildFile(), type: "DNI", customerId: CUSTOMER_ID })
      )

      expect(response.status).toBe(200)
      expect(insertedDocuments).toHaveLength(1)
      expect(insertedDocuments[0].org_id).toBe(ORG_ID)
    })

    it("no deja el org_id en null ni undefined (era el bug: la fila quedaba invisible)", async () => {
      const { POST } = await load()

      await POST(buildRequest({ file: buildFile(), type: "DNI", customerId: CUSTOMER_ID }))

      expect(insertedDocuments[0]).toHaveProperty("org_id")
      expect(insertedDocuments[0].org_id).not.toBeNull()
      expect(insertedDocuments[0].org_id).not.toBeUndefined()
    })

    it("usa la org del usuario, no una org arbitraria del payload", async () => {
      const { POST } = await load()

      // Si alguna vez el body pudiera influir en el org_id, esto lo detecta.
      await POST(
        buildRequest({
          file: buildFile(),
          type: "DNI",
          customerId: CUSTOMER_ID,
          org_id: OTHER_ORG_ID,
        })
      )

      expect(insertedDocuments[0].org_id).toBe(ORG_ID)
      expect(insertedDocuments[0].org_id).not.toBe(OTHER_ORG_ID)
    })
  })
})
