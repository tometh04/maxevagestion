import { encryptSecret, decryptSecret } from "@/lib/integrations/secrets"

describe("encryptSecret / decryptSecret", () => {
  const TEST_KEY = "0".repeat(64) // 64 hex chars = 32 bytes — only for testing

  beforeAll(() => {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_KEY
  })

  it("round-trips a simple string", () => {
    const enc = encryptSecret("hola-mundo")
    expect(decryptSecret(enc)).toBe("hola-mundo")
  })

  it("round-trips a long secret with special chars", () => {
    const secret = "sk_test_1234567890.abcDEFghi-jkl_mno+pqr/stu=vwx"
    const enc = encryptSecret(secret)
    expect(decryptSecret(enc)).toBe(secret)
  })

  it("produces different ciphertext each time (IV randomness)", () => {
    const a = encryptSecret("same-input")
    const b = encryptSecret("same-input")
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe("same-input")
    expect(decryptSecret(b)).toBe("same-input")
  })

  it("rejects invalid format (not 3 parts)", () => {
    expect(() => decryptSecret("not-a-valid-encrypted-string")).toThrow(
      /Formato de secret encriptado inválido/
    )
  })

  it("rejects tampered ciphertext", () => {
    const enc = encryptSecret("original-secret")
    const parts = enc.split(":")
    // Flip a single byte in the ciphertext
    const tampered = `${parts[0]}:${parts[1].slice(0, -2)}ff:${parts[2]}`
    expect(() => decryptSecret(tampered)).toThrow()
  })

  it("throws if WEBHOOK_SECRET_ENCRYPTION_KEY is missing", () => {
    const saved = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY
    delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY
    try {
      expect(() => encryptSecret("x")).toThrow(
        /WEBHOOK_SECRET_ENCRYPTION_KEY no configurada/
      )
    } finally {
      process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = saved
    }
  })

  it("throws if key length is wrong", () => {
    const saved = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = "short"
    try {
      expect(() => encryptSecret("x")).toThrow(/debe ser 64 chars hex/)
    } finally {
      process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = saved
    }
  })
})
