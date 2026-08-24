import { redactSensitivePath } from "@/lib/security/redact-sensitive-path"

describe("redactSensitivePath", () => {
  it.each([
    ["/cotizacion/super-secret", "/cotizacion/[token]"],
    ["/cotizacion/super-secret/pdf", "/cotizacion/[token]/pdf"],
    [
      "/api/public/quotations/super-secret/document",
      "/api/public/quotations/[token]/document",
    ],
  ])("redacts quotation bearer paths", (input, expected) => {
    expect(redactSensitivePath(input)).toBe(expected)
  })

  it("leaves non-bearer paths untouched", () => {
    expect(redactSensitivePath("/api/quotations/123")).toBe("/api/quotations/123")
  })
})
