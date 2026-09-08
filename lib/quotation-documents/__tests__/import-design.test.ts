/** @jest-environment node */
import type OpenAI from "openai"
import { PDFDocument } from "pdf-lib"
import { interpretQuotationDesign, quotationManifestFromDesign, validateQuotationDesignPdf } from "../import-design"

const design = { layoutKey: "travel-summary-v1", primaryColor: "#D99A16", secondaryColor: "#555555", accentColor: "#D99A16" }

async function referencePdf(pages = 2) {
  const pdf = await PDFDocument.create()
  for (let index = 0; index < pages; index += 1) pdf.addPage()
  return pdf.save()
}

it("accepts image-only PDFs and bounds malformed or oversized references", async () => {
  await expect(validateQuotationDesignPdf(await referencePdf())).resolves.toBeUndefined()
  await expect(validateQuotationDesignPdf(Buffer.from("not a PDF"))).rejects.toThrow(/PDF/)
  await expect(validateQuotationDesignPdf(await referencePdf(7))).rejects.toThrow(/6 páginas/)
  await expect(validateQuotationDesignPdf(new Uint8Array(10 * 1024 * 1024 + 1))).rejects.toThrow(/10 MB/)
})

it("imports only safe design properties and never source agency or quotation content", () => {
  const manifest = quotationManifestFromDesign(design)
  expect(manifest.layoutKey).toBe("travel-summary-v1")
  expect(manifest.assets).toEqual({})
  expect(manifest.branding).toEqual({})
  for (const extra of [{ html: "<script>alert(1)</script>" }, { company_name: "Compañía de Viajes SRL" }, { total: 10000 }]) {
    expect(() => quotationManifestFromDesign({ ...design, ...extra })).toThrow()
  }
  expect(() => quotationManifestFromDesign({ ...design, primaryColor: "url(https://evil.example)" })).toThrow()
})

it("passes the PDF to vision and validates the complete response before producing a draft", async () => {
  const create = jest.fn().mockResolvedValue({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(design) } }] })
  const client = { chat: { completions: { create } } } as unknown as OpenAI
  const result = await interpretQuotationDesign(await referencePdf(), client)
  expect(result.theme.primaryColor).toBe("#D99A16")
  expect(create.mock.calls[0][0].messages[1].content[0].file.file_data).toMatch(/^data:application\/pdf;base64,/)
  create.mockResolvedValue({ choices: [{ finish_reason: "length", message: { content: JSON.stringify(design) } }] })
  await expect(interpretQuotationDesign(await referencePdf(), client)).rejects.toThrow(/completo/)
  create.mockResolvedValue({ choices: [{ finish_reason: "stop", message: { content: '{"html":"bad"}' } }] })
  await expect(interpretQuotationDesign(await referencePdf(), client)).rejects.toThrow(/diseño válido/)
})
