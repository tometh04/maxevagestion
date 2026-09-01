import {
  isTransientAuthError,
  isTransientPostgrestError,
  retryTransient,
} from "../transient"

describe("isTransientAuthError", () => {
  it("no trata la ausencia de error como falla", () => {
    expect(isTransientAuthError(null)).toBe(false)
  })

  it("reconoce el wrapper de fetch retryable de gotrue-js", () => {
    expect(isTransientAuthError({ name: "AuthRetryableFetchError", status: 0 })).toBe(true)
  })

  it("reconoce rate limit y 5xx del servicio de Auth", () => {
    expect(isTransientAuthError({ name: "AuthApiError", status: 429 })).toBe(true)
    expect(isTransientAuthError({ name: "AuthApiError", status: 408 })).toBe(true)
    expect(isTransientAuthError({ name: "AuthApiError", status: 500 })).toBe(true)
    expect(isTransientAuthError({ name: "AuthApiError", status: 502 })).toBe(true)
    expect(isTransientAuthError({ name: "AuthApiError", status: 504 })).toBe(true)
  })

  it("reconoce fallas de red sin status", () => {
    expect(isTransientAuthError({ message: "fetch failed" })).toBe(true)
    expect(isTransientAuthError({ message: "socket hang up" })).toBe(true)
    expect(isTransientAuthError({ message: "ECONNRESET" })).toBe(true)
  })

  // Lo importante del contrato: estos SI deben desloguear. Si alguno cayera del
  // lado transitorio, alguien sin sesion veria una pantalla de error en loop en
  // vez de el login.
  it("trata como terminal todo lo que dice que la sesion no sirve", () => {
    expect(isTransientAuthError({ name: "AuthSessionMissingError", status: 400 })).toBe(false)
    expect(isTransientAuthError({ name: "AuthApiError", status: 401, code: "bad_jwt" })).toBe(false)
    expect(isTransientAuthError({ name: "AuthApiError", status: 403 })).toBe(false)
    expect(
      isTransientAuthError({ name: "AuthApiError", status: 400, code: "refresh_token_not_found" })
    ).toBe(false)
    // Un mensaje de red NO alcanza si vino con status de auth.
    expect(isTransientAuthError({ status: 401, message: "fetch failed" })).toBe(false)
  })
})

describe("isTransientPostgrestError", () => {
  it("reconoce timeouts y fallas de conexion de Postgres", () => {
    expect(isTransientPostgrestError({ code: "57014" })).toBe(true)
    expect(isTransientPostgrestError({ code: "08006" })).toBe(true)
    expect(isTransientPostgrestError({ code: "53300" })).toBe(true)
    expect(isTransientPostgrestError({ message: "upstream connect error" })).toBe(true)
  })

  it("no toca los errores de negocio ni de permisos", () => {
    expect(isTransientPostgrestError(null)).toBe(false)
    // RLS/permisos: 42501. Tabla inexistente: PGRST205. Ninguno se reintenta.
    expect(isTransientPostgrestError({ code: "42501" })).toBe(false)
    expect(isTransientPostgrestError({ code: "PGRST205" })).toBe(false)
  })
})

describe("retryTransient", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("no reintenta cuando el primer intento sale bien", async () => {
    const attempt = jest.fn().mockResolvedValue({ data: "ok", error: null })
    const result = await retryTransient<{ data: unknown; error: any }>(attempt, isTransientAuthError, "test")
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(result.data).toBe("ok")
  })

  it("reintenta hasta que la falla transitoria se resuelve", async () => {
    const attempt = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: { name: "AuthRetryableFetchError" } })
      .mockResolvedValueOnce({ data: "ok", error: null })
    const result = await retryTransient<{ data: unknown; error: any }>(attempt, isTransientAuthError, "test")
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(result.error).toBeNull()
  })

  it("no reintenta un error terminal — el logout tiene que ser inmediato", async () => {
    const attempt = jest
      .fn()
      .mockResolvedValue({ data: null, error: { name: "AuthApiError", status: 401 } })
    const result = await retryTransient<{ data: unknown; error: any }>(attempt, isTransientAuthError, "test")
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(result.error).toEqual({ name: "AuthApiError", status: 401 })
  })

  it("devuelve el error transitorio si sobrevive a todos los reintentos", async () => {
    const attempt = jest
      .fn()
      .mockResolvedValue({ data: null, error: { name: "AuthRetryableFetchError" } })
    const result = await retryTransient<{ data: unknown; error: any }>(attempt, isTransientAuthError, "test")
    expect(attempt).toHaveBeenCalledTimes(3)
    expect(isTransientAuthError(result.error)).toBe(true)
  })
})
