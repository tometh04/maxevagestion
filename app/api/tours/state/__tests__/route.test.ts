/** @jest-environment node */

import { PATCH } from "../route"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { TOUR_IDS } from "@/lib/tours/registry"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))

const mockGetCurrentUser = getCurrentUser as jest.Mock
const mockCreateServerClient = createServerClient as jest.Mock

function makeRequest(body: unknown, raw?: string): Request {
  return {
    json: async () => {
      if (raw !== undefined) throw new SyntaxError("Unexpected token")
      return body
    },
  } as unknown as Request
}

function makeSupabase() {
  const eq = jest.fn().mockResolvedValue({ error: null })
  const update = jest.fn(() => ({ eq }))
  const from = jest.fn(() => ({ update }))
  return { client: { from }, from, update, eq }
}

describe("PATCH /api/tours/state", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("rechaza sin usuario autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue({ user: null })
    const res = await PATCH(makeRequest({}))
    expect(res.status).toBe(401)
  })

  it("rechaza un body que no es JSON", async () => {
    mockGetCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: "o1" } })
    const res = await PATCH(makeRequest(null, "no-json"))
    expect(res.status).toBe(400)
  })

  it("escribe solo la fila del usuario autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: "o1" } })
    const supabase = makeSupabase()
    mockCreateServerClient.mockResolvedValue(supabase.client)

    const res = await PATCH(makeRequest({ seenTours: {}, toursDisabled: true }))

    expect(res.status).toBe(200)
    expect(supabase.from).toHaveBeenCalledWith("users")
    // Defensa explícita sobre RLS: nunca un update sin scope al propio id.
    expect(supabase.eq).toHaveBeenCalledWith("id", "u1")
  })

  it("sanitiza el body antes de escribir", async () => {
    mockGetCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: "o1" } })
    const supabase = makeSupabase()
    mockCreateServerClient.mockResolvedValue(supabase.client)

    const res = await PATCH(
      makeRequest({
        seenTours: {
          "tour-inventado": { status: "completed" },
          [TOUR_IDS[0]]: { status: "completed", lastStepIndex: -5 },
        },
        toursDisabled: "yes",
        campoBasura: true,
      })
    )

    const written = (supabase.update.mock.calls as unknown as Array<[{ onboarding_state: any }]>)[0][0]
      .onboarding_state
    expect(Object.keys(written.seenTours)).toEqual([TOUR_IDS[0]])
    expect(written.seenTours[TOUR_IDS[0]].lastStepIndex).toBe(0)
    expect(written.toursDisabled).toBe(false)
    expect(written.campoBasura).toBeUndefined()

    const json = await res.json()
    expect(json.data.toursDisabled).toBe(false)
  })

  it("devuelve 500 si la escritura falla", async () => {
    mockGetCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: "o1" } })
    const eq = jest.fn().mockResolvedValue({ error: { message: "boom" } })
    mockCreateServerClient.mockResolvedValue({ from: () => ({ update: () => ({ eq }) }) })

    const res = await PATCH(makeRequest({}))
    expect(res.status).toBe(500)
  })
})
