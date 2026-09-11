import { renderHtmlToPdfBlob } from "../quote-pdf-designs"
import html2canvas from "html2canvas"

jest.mock("html2canvas", () => ({ __esModule: true, default: jest.fn() }))
jest.mock("jspdf", () => ({ __esModule: true, default: jest.fn(() => ({
  addPage: jest.fn(), addImage: jest.fn(), output: () => new Blob(["pdf"]),
})) }))
jest.mock("@/lib/quotation-documents/fonts-client", () => ({ waitForQuotationDocumentFonts: jest.fn() }))

describe("quotation PDF rendering", () => {
  afterEach(() => { document.body.innerHTML = ""; jest.clearAllMocks() })

  it("captures only the quotation, without cloning CRM nodes or styles on every page", async () => {
    document.body.innerHTML = '<main id="crm">Large CRM</main>'
    jest.mocked(html2canvas).mockImplementation(async (target) => {
      expect(target.ownerDocument).not.toBe(document)
      expect(target.ownerDocument.getElementById("crm")).toBeNull()
      return { toDataURL: () => "data:image/jpeg;base64,AA==", width: 1, height: 1 } as HTMLCanvasElement
    })
    await renderHtmlToPdfBlob('<html><body><div data-pdf-page>One</div><div data-pdf-page>Two</div></body></html>')
    expect(html2canvas).toHaveBeenCalledTimes(2)
    expect(document.querySelector("iframe")).toBeNull()
    expect(document.getElementById("crm")).not.toBeNull()
  })

  it("releases the render frame if the canvas library never completes", async () => {
    jest.useFakeTimers()
    try {
      jest.mocked(html2canvas).mockImplementation(() => new Promise(() => {}))
      const result = renderHtmlToPdfBlob('<div data-pdf-page>One</div>').catch(error => error.message)
      await jest.advanceTimersByTimeAsync(31_000)
      expect(await result).toContain("dibujar el PDF")
      expect(document.querySelector("iframe")).toBeNull()
    } finally { jest.useRealTimers() }
  })
})
