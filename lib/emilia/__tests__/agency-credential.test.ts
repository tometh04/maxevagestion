import {
  resolveAgencyEmiliaCredential,
  setAgencyEmiliaCredential,
} from "@/lib/emilia/agency-credential"

class CredentialQuery {
  private filters: Record<string, unknown> = {}
  private upsertValue: any

  constructor(private table: string, private state: Record<string, any>) {}
  select() { return this }
  eq(column: string, value: unknown) { this.filters[column] = value; return this }
  upsert(value: any) { this.upsertValue = value; return this }
  async maybeSingle() {
    if (this.table === "agencies") {
      return { data: this.filters.id === this.state.agency.id && this.filters.org_id === this.state.agency.org_id ? this.state.agency : null, error: null }
    }
    if (this.table === "users") {
      return { data: this.filters.id === this.state.actor.id && this.filters.org_id === this.state.actor.org_id ? this.state.actor : null, error: null }
    }
    const row = this.state.credential
    const matches = row && Object.entries(this.filters).every(([key, value]) => row[key] === value)
    return { data: matches ? row : null, error: null }
  }
  async single() {
    if (this.table !== "agency_emilia_credentials" || !this.upsertValue) {
      return { data: null, error: { message: "unexpected query" } }
    }
    this.state.credential = {
      id: "44444444-4444-4444-8444-444444444444",
      ...this.upsertValue,
    }
    return { data: this.state.credential, error: null }
  }
}

describe("credencial Emilia por agencia", () => {
  const previousKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY
  beforeEach(() => {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = "ab".repeat(32)
  })
  afterAll(() => {
    if (previousKey === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY
    else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previousKey
  })

  it("asigna cifrada y sólo la resuelve dentro del scope exacto", async () => {
    const state: Record<string, any> = {
      agency: { id: "11111111-1111-4111-8111-111111111111", org_id: "22222222-2222-4222-8222-222222222222" },
      actor: { id: "33333333-3333-4333-8333-333333333333", org_id: "22222222-2222-4222-8222-222222222222", is_active: true },
      credential: null,
    }
    const admin = { from: (table: string) => new CredentialQuery(table, state) }
    const assigned = await setAgencyEmiliaCredential({
      admin,
      orgId: state.agency.org_id,
      agencyId: state.agency.id,
      actorId: state.actor.id,
      apiKey: "agency-api-secret",
    })
    expect(assigned.id).toBe(state.credential.id)
    expect(state.credential.api_key_encrypted).not.toContain("agency-api-secret")
    expect(state.credential.key_fingerprint).toMatch(/^[a-f0-9]{64}$/)

    const resolved = await resolveAgencyEmiliaCredential({
      admin,
      orgId: state.agency.org_id,
      agencyId: state.agency.id,
    })
    expect(resolved.apiKey).toBe("agency-api-secret")
    await expect(resolveAgencyEmiliaCredential({
      admin,
      orgId: state.agency.org_id,
      agencyId: "55555555-5555-4555-8555-555555555555",
    })).rejects.toMatchObject({ code: "AGENCY_CREDENTIAL_MISSING" })
  })
})
