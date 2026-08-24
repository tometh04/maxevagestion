/** @jest-environment node */

import { POST } from "./route"
import { checkCronAuth } from "@/lib/cron/auth"
import { processNextQuotationConversionEffects } from "@/lib/quotations/conversion-effects"
import { createAdminClient } from "@/lib/supabase/server"

jest.mock("@/lib/cron/auth", () => ({ checkCronAuth: jest.fn() }))
jest.mock("@/lib/quotations/conversion-effects", () => ({
  processNextQuotationConversionEffects: jest.fn(),
}))
jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn() }))

const request = () => new Request("http://localhost/api/cron/quotation-conversion-effects", {
  method: "POST",
  headers: { authorization: "Bearer test" },
})

describe("POST /api/cron/quotation-conversion-effects", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(checkCronAuth as jest.Mock).mockReturnValue({ authorized: true })
  })

  it("rechaza antes de crear el cliente admin cuando falla el secreto", async () => {
    ;(checkCronAuth as jest.Mock).mockReturnValue({
      authorized: false,
      reason: "Bearer token no coincide",
    })

    const response = await POST(request())

    expect(response.status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("consume un lote acotado con el mismo procesador durable", async () => {
    const admin = { rpc: jest.fn() }
    ;(createAdminClient as jest.Mock).mockReturnValue(admin)
    ;(processNextQuotationConversionEffects as jest.Mock).mockResolvedValue({
      claimed: 2,
      completed: 1,
      review: 1,
      processing: 0,
      errors: [{ operationId: "operation-2", messages: ["snapshot inválido"] }],
    })

    const response = await POST(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(expect.objectContaining({ ok: true, claimed: 2, completed: 1 }))
    expect(processNextQuotationConversionEffects).toHaveBeenCalledWith({
      supabase: admin,
      limit: 20,
    })
  })
})
