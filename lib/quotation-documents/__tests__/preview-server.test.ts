/** @jest-environment node */
import { renderQuotationDocumentForUser } from "../server"
import { cloneQuotationJson, KYO_FULL_ITINERARY_FIXTURE, createDefaultManifest, buildQuotationDocumentData } from "@/lib/quotation-documents"

jest.mock("@/lib/permissions/agency-scope-server", () => ({ applyAgencyPermissionScope: (query: unknown) => query }))
jest.mock("@/lib/quotation-documents", () => ({ ...jest.requireActual("@/lib/quotation-documents"), buildQuotationDocumentData: jest.fn() }))
jest.mock("@/lib/quotation-documents/assets-server", () => ({
  ...jest.requireActual("@/lib/quotation-documents/assets-server"),
  freezeQuotationDocumentAssets: jest.fn(async (html: string) => ({ html, frozenSources: {}, omittedRemoteAssetCount: 0 })),
}))

it("previews new prices with the same frozen template that will be used on reissue", async () => {
  const model = cloneQuotationJson(KYO_FULL_ITINERARY_FIXTURE)
  const manifest = createDefaultManifest("travel-summary-v1")
  manifest.copy.documentTitle = "Modelo guardado"
  manifest.theme.primaryColor = "#123456"
  jest.mocked(buildQuotationDocumentData).mockReturnValue(model)
  const rows: Record<string, unknown> = {
    quotations: { id: "quote", org_id: "org", agency_id: "agency", status: "DRAFT", active_document_id: "issued" },
    issued_quotation_documents: { id: "issued", revision_id: "old-revision", data_snapshot: model, manifest_snapshot: manifest, html_snapshot: "old HTML", content_hash: "old hash", file_name: "quote.pdf" },
    organization_settings: [],
  }
  const from = jest.fn((table: string) => {
    if (!(table in rows)) throw new Error(`Unexpected table: ${table}`)
    const result = { data: rows[table], error: null }
    const query: Record<string, unknown> = {}
    for (const method of ["select", "eq", "in"]) query[method] = () => query
    query.maybeSingle = async () => result
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return query
  })
  const result = await renderQuotationDocumentForUser({ supabase: { from } as never, quotationId: "quote", orgId: "org", accessScope: { agencyIds: ["agency"] } as never, purpose: "preview" })
  expect(result.layoutKey).toBe("travel-summary-v1")
  expect(result.revisionId).toBe("old-revision")
  expect(result.html).toContain("#123456")
  expect(result.html).not.toBe("old HTML")
  expect(from.mock.calls.map(([table]) => table)).not.toContain("quotation_document_bindings")
  expect(result.issuedDocumentId).toBeNull()
})
