/** @jest-environment node */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}))

import { PATCH } from "../route"

describe("retired quotation price endpoint", () => {
  it("cannot mutate a single price outside the atomic document draft", async () => {
    const response = await PATCH({} as Request, {
      params: Promise.resolve({ id: "quotation-1" }),
    })
    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: "QUOTATION_DOCUMENT_PREPARE_REQUIRED",
    }))
  })
})
