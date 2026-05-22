import crypto from "crypto"

/**
 * Verifica HMAC del body de un webhook. Timing-safe.
 *
 * - Callbell usa HMAC-SHA256 en header X-Callbell-Signature (verificar docs).
 * - ManyChat permite custom headers; usamos X-Vibook-Signature con SHA256.
 *
 * @param algo - "sha1" | "sha256"
 * @param body - el body crudo del request (string)
 * @param signature - valor del header
 * @param secret - secret decifrado del tenant
 * @param encoding - "hex" | "base64" (default: "hex")
 */
export function verifyHmac(
  algo: "sha1" | "sha256",
  body: string,
  signature: string,
  secret: string,
  encoding: "hex" | "base64" = "hex"
): boolean {
  if (!signature) return false
  if (!secret) return false
  const expected = crypto
    .createHmac(algo, secret)
    .update(body)
    .digest(encoding)
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
