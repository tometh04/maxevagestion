/**
 * Una route handler no puede contestar con el HTML del login: el `fetch` del
 * browser sigue el 307 y la pantalla recibe HTML donde esperaba JSON. Este test
 * fija ese contrato — se rompio una vez y el sintoma fue un panel vacio sin
 * ninguna pista de que el problema era la sesion.
 */
const mockGet = jest.fn()

jest.mock("next/headers", () => ({
  headers: async () => ({ get: mockGet }),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {} }),
}))

import { loginRedirectTarget } from "../../auth"

describe("loginRedirectTarget", () => {
  beforeEach(() => mockGet.mockReset())

  it("manda las paginas al login", async () => {
    mockGet.mockReturnValue("/dashboard")
    expect(await loginRedirectTarget()).toBe("/login")
  })

  it("manda las rutas de API al 401 en JSON", async () => {
    mockGet.mockReturnValue("/api/admin/announcements")
    expect(await loginRedirectTarget()).toBe("/api/auth/unauthorized")
  })

  it("no confunde una pagina que empieza parecido", async () => {
    mockGet.mockReturnValue("/apiary")
    expect(await loginRedirectTarget()).toBe("/login")
  })

  it("cae al login si el middleware no dejo el header", async () => {
    mockGet.mockReturnValue(null)
    expect(await loginRedirectTarget()).toBe("/login")
  })

  it("cae al login si headers() explota", async () => {
    mockGet.mockImplementation(() => {
      throw new Error("no request scope")
    })
    expect(await loginRedirectTarget()).toBe("/login")
  })
})
