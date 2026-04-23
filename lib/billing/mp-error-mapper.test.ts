import { mpErrorToUserMessage } from "./mp-error-mapper"

describe("mpErrorToUserMessage", () => {
  it("500 Internal server error → mensaje genérico amigable", () => {
    const msg = mpErrorToUserMessage(
      'MP preapproval_plan failed (500): {"message":"Internal server error","status":500}'
    )
    expect(msg).toMatch(/problemas temporales/i)
    expect(msg).not.toMatch(/Internal server error/i)
  })

  it("400 con invalid email", () => {
    const msg = mpErrorToUserMessage(
      'MP preapproval failed (400): {"message":"invalid payer_email","cause":[{"code":"3033","description":"Invalid email"}]}'
    )
    expect(msg).toMatch(/email.*inválido/i)
  })

  it("400 genérico", () => {
    const msg = mpErrorToUserMessage('MP preapproval failed (400): {"message":"bad request"}')
    expect(msg).toMatch(/No pudimos procesar/i)
    expect(msg).not.toMatch(/bad request/i)
  })

  it("401 unauthorized", () => {
    const msg = mpErrorToUserMessage('MP preapproval failed (401): {"message":"unauthorized"}')
    expect(msg).toMatch(/autorización/i)
  })

  it("invalid transaction_amount", () => {
    const msg = mpErrorToUserMessage(
      'MP preapproval failed (400): {"cause":[{"description":"Invalid transaction_amount"}]}'
    )
    expect(msg).toMatch(/monto del plan/i)
  })

  it("mensaje desconocido → fallback genérico", () => {
    const msg = mpErrorToUserMessage("totally unknown error xyz")
    expect(msg).toMatch(/No pudimos procesar/i)
  })

  it("no expone internals de MP al user", () => {
    const msg = mpErrorToUserMessage(
      'MP preapproval_plan failed (500): {"message":"Internal server error","request_id":"abc-123"}'
    )
    expect(msg).not.toMatch(/request_id|abc-123|Internal/)
  })
})
