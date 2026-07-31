/** @jest-environment node */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { LibraryContext } from "@/lib/library/types"
import {
  createLinkResource,
  listResourcesForViewer,
  listResourcesForAdmin,
} from "@/lib/library/resource-service"
import { LibraryValidationError } from "@/lib/library/access"

const orgId = "11111111-1111-4111-8111-111111111111"
const userId = "33333333-3333-4333-8333-333333333333"

/** Mock chainable + thenable de un query builder de supabase-js. */
function makeQuery(result: { data: unknown; error: unknown }) {
  const q: any = {}
  const methods = [
    "select",
    "eq",
    "is",
    "or",
    "order",
    "insert",
    "update",
    "delete",
  ]
  for (const m of methods) q[m] = jest.fn(() => q)
  q.single = jest.fn().mockResolvedValue(result)
  q.maybeSingle = jest.fn().mockResolvedValue(result)
  q.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return q
}

function ctxWith(query: any, roles: string[] = ["SELLER"]): LibraryContext {
  const supabase = {
    from: jest.fn(() => query),
    storage: { from: jest.fn() },
  } as unknown as SupabaseClient<Database>
  return { supabase, orgId, userId, userRoles: roles }
}

describe("library resource-service — tenancy y destinatarios", () => {
  beforeEach(() => jest.clearAllMocks())

  it("el listado de consulta filtra por org_id, publicado y no archivado", async () => {
    const query = makeQuery({ data: [], error: null })
    const ctx = ctxWith(query, ["SELLER"])

    await listResourcesForViewer(ctx)

    expect(query.eq).toHaveBeenCalledWith("org_id", orgId)
    expect(query.eq).toHaveBeenCalledWith("published", true)
    expect(query.is).toHaveBeenCalledWith("archived_at", null)
  })

  it("aplica el filtro de destinatarios por rol (target_roles vacío o con overlap)", async () => {
    const query = makeQuery({ data: [], error: null })
    const ctx = ctxWith(query, ["SELLER", "POST_VENTA"])

    await listResourcesForViewer(ctx)

    expect(query.or).toHaveBeenCalledTimes(1)
    const orArg = (query.or as jest.Mock).mock.calls[0][0] as string
    expect(orArg).toContain("target_roles.eq.{}")
    // un `cs` por rol individual (sin comas dentro de las llaves)
    expect(orArg).toContain("target_roles.cs.{SELLER}")
    expect(orArg).toContain("target_roles.cs.{POST_VENTA}")
    // no debe usar overlap multi-elemento (coma interna rompe el .or de PostgREST)
    expect(orArg).not.toContain(".ov.")
  })

  it("no incluye roles desconocidos en el literal del filtro", async () => {
    const query = makeQuery({ data: [], error: null })
    // 'weird role' no matchea /^[A-Z_]+$/ y debe descartarse
    const ctx = ctxWith(query, ["SELLER", "weird role"])

    await listResourcesForViewer(ctx)

    const orArg = (query.or as jest.Mock).mock.calls[0][0] as string
    expect(orArg).toContain("target_roles.cs.{SELLER}")
    expect(orArg).not.toContain("weird")
  })

  it("includeAllTargets (managers) omite el filtro de destinatarios", async () => {
    const query = makeQuery({ data: [], error: null })
    const ctx = ctxWith(query, ["ADMIN"])

    await listResourcesForViewer(ctx, { includeAllTargets: true })

    expect(query.or).not.toHaveBeenCalled()
  })

  it("el listado de admin ignora destinatarios y no filtra por publicado", async () => {
    const query = makeQuery({ data: [], error: null })
    const ctx = ctxWith(query, ["ADMIN"])

    await listResourcesForAdmin(ctx)

    expect(query.or).not.toHaveBeenCalled()
    expect(query.eq).toHaveBeenCalledWith("org_id", orgId)
    expect(query.eq).not.toHaveBeenCalledWith("published", true)
  })
})

describe("library resource-service — creación de link", () => {
  beforeEach(() => jest.clearAllMocks())

  it("rechaza una URL inválida antes de tocar la base", async () => {
    const query = makeQuery({ data: null, error: null })
    const ctx = ctxWith(query, ["ADMIN"])

    await expect(
      createLinkResource(ctx, { title: "Video", externalUrl: "no-es-url" })
    ).rejects.toBeInstanceOf(LibraryValidationError)
    expect(query.insert).not.toHaveBeenCalled()
  })

  it("rechaza protocolos que no sean http/https", async () => {
    const query = makeQuery({ data: null, error: null })
    const ctx = ctxWith(query, ["ADMIN"])

    await expect(
      createLinkResource(ctx, {
        title: "Video",
        externalUrl: "javascript:alert(1)",
      })
    ).rejects.toBeInstanceOf(LibraryValidationError)
    expect(query.insert).not.toHaveBeenCalled()
  })

  it("inserta con org_id, resource_type=link y target_roles normalizados", async () => {
    const row = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      category_id: null,
      title: "Guía",
      description: null,
      resource_type: "link",
      storage_path: null,
      file_mime_type: null,
      file_size: null,
      original_file_name: null,
      external_url: "https://youtu.be/abc",
      target_roles: ["SELLER"],
      published: true,
      sort_order: 0,
      created_at: "2026-07-31T00:00:00Z",
      updated_at: "2026-07-31T00:00:00Z",
    }
    const query = makeQuery({ data: row, error: null })
    const ctx = ctxWith(query, ["ADMIN"])

    const dto = await createLinkResource(ctx, {
      title: "Guía",
      externalUrl: "https://youtu.be/abc",
      // 'GERENTE' no es un rol válido -> se descarta en la normalización
      targetRoles: ["SELLER", "GERENTE"],
    })

    expect(query.insert).toHaveBeenCalledTimes(1)
    const inserted = (query.insert as jest.Mock).mock.calls[0][0]
    expect(inserted.org_id).toBe(orgId)
    expect(inserted.resource_type).toBe("link")
    expect(inserted.external_url).toBe("https://youtu.be/abc")
    expect(inserted.target_roles).toEqual(["SELLER"])
    expect(dto.resource_type).toBe("link")
    expect(dto.url).toBeNull()
  })
})
