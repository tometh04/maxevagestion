import { buildAnalyticsIdentity } from "../identity"

const USER = {
  id: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  org_id: "410ada50-0000-4000-8000-000000000000",
  role: "ADMIN",
  email: "juan@agencia.com",
  name: "Juan Perez",
  is_independent_advisor: false,
}

describe("buildAnalyticsIdentity", () => {
  it("no reporta al usuario falso del bypass DISABLE_AUTH", () => {
    // `getCurrentUser()` devuelve un usuario hardcodeado en dev con
    // DISABLE_AUTH=true. Si llegara a GA contaminaria los reportes con un
    // user_id que no existe en la base.
    expect(buildAnalyticsIdentity(USER, { disableAuth: true })).toBeNull()
  })

  it("devuelve null sin usuario", () => {
    expect(buildAnalyticsIdentity(null)).toBeNull()
    expect(buildAnalyticsIdentity(undefined)).toBeNull()
    expect(buildAnalyticsIdentity({ id: "" })).toBeNull()
  })

  it("expone exactamente user_id, org_id, role y plan", () => {
    const identity = buildAnalyticsIdentity(USER, { plan: "PRO" })
    expect(identity).toEqual({
      user_id: USER.id,
      org_id: USER.org_id,
      role: "ADMIN",
      plan: "PRO",
    })
  })

  it("nunca filtra email ni nombre", () => {
    // Assert sobre las claves y no sobre el valor: si alguien ensancha el tipo
    // de retorno mas adelante, esto falla ruidosamente en vez de empezar a
    // mandarle PII a Google en silencio.
    const identity = buildAnalyticsIdentity(USER, { plan: "PRO" })!
    expect(Object.keys(identity).sort()).toEqual(["org_id", "plan", "role", "user_id"])
    expect(JSON.stringify(identity)).not.toContain("juan@agencia.com")
    expect(JSON.stringify(identity)).not.toContain("Juan Perez")
  })

  it("acepta override de rol para superficies fuera del tenant", () => {
    const identity = buildAnalyticsIdentity(USER, { role: "platform_admin" })
    expect(identity?.role).toBe("platform_admin")
  })

  it("normaliza org y plan ausentes a null", () => {
    expect(buildAnalyticsIdentity({ id: "u1" })).toEqual({
      user_id: "u1",
      org_id: null,
      role: "unknown",
      plan: null,
    })
  })
})
