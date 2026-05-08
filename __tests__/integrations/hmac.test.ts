import crypto from "crypto"
import { verifyHmac } from "@/lib/integrations/hmac"

const SECRET = "test-secret-1234"
const BODY = '{"event":"hello","data":{"id":42}}'

function sign(
  algo: "sha1" | "sha256",
  body: string,
  secret: string,
  encoding: "hex" | "base64" = "hex"
): string {
  return crypto.createHmac(algo, secret).update(body).digest(encoding)
}

describe("verifyHmac", () => {
  it("accepts a valid sha256/hex signature", () => {
    const sig = sign("sha256", BODY, SECRET, "hex")
    expect(verifyHmac("sha256", BODY, sig, SECRET, "hex")).toBe(true)
  })

  it("accepts a valid sha1/base64 signature", () => {
    const sig = sign("sha1", BODY, SECRET, "base64")
    expect(verifyHmac("sha1", BODY, sig, SECRET, "base64")).toBe(true)
  })

  it("rejects when body is mutated", () => {
    const sig = sign("sha256", BODY, SECRET)
    expect(verifyHmac("sha256", BODY + "x", sig, SECRET)).toBe(false)
  })

  it("rejects when signature is wrong", () => {
    const wrong = "deadbeef".repeat(8) // 64 hex chars but wrong content
    expect(verifyHmac("sha256", BODY, wrong, SECRET)).toBe(false)
  })

  it("rejects when secret is wrong", () => {
    const sig = sign("sha256", BODY, SECRET)
    expect(verifyHmac("sha256", BODY, sig, "different-secret")).toBe(false)
  })

  it("rejects empty signature", () => {
    expect(verifyHmac("sha256", BODY, "", SECRET)).toBe(false)
  })

  it("rejects empty secret", () => {
    const sig = sign("sha256", BODY, SECRET)
    expect(verifyHmac("sha256", BODY, sig, "")).toBe(false)
  })

  it("rejects signature with wrong length without throwing", () => {
    expect(verifyHmac("sha256", BODY, "short", SECRET)).toBe(false)
  })

  it("rejects signature with non-hex chars without throwing", () => {
    // 64 chars but invalid hex
    const bogus = "z".repeat(64)
    expect(verifyHmac("sha256", BODY, bogus, SECRET)).toBe(false)
  })

  it("treats sha256 hex vs sha256 base64 as different (encoding matters)", () => {
    const hexSig = sign("sha256", BODY, SECRET, "hex")
    // Verifying with base64 encoding using a hex signature should fail
    expect(verifyHmac("sha256", BODY, hexSig, SECRET, "base64")).toBe(false)
  })
})
