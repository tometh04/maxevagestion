import crypto from "crypto"

/**
 * Encriptación AES-256-GCM de webhook secrets.
 *
 * La key viene de WEBHOOK_SECRET_ENCRYPTION_KEY (32 bytes hex).
 * Generar con: openssl rand -hex 32
 *
 * Format: <iv-hex>:<ciphertext-hex>:<auth-tag-hex>
 */

const ALGO = "aes-256-gcm"
const IV_LEN = 12
const AUTH_TAG_LEN = 16

function getKey(): Buffer {
  const hex = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY
  if (!hex) {
    throw new Error("WEBHOOK_SECRET_ENCRYPTION_KEY no configurada")
  }
  if (hex.length !== 64) {
    throw new Error(
      `WEBHOOK_SECRET_ENCRYPTION_KEY debe ser 64 chars hex (32 bytes); recibí ${hex.length}`
    )
  }
  return Buffer.from(hex, "hex")
}

export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`
}

export function decryptSecret(stored: string): string {
  const key = getKey()
  const parts = stored.split(":")
  if (parts.length !== 3) {
    throw new Error("Formato de secret encriptado inválido")
  }
  const [ivHex, ciphertextHex, authTagHex] = parts
  const iv = Buffer.from(ivHex, "hex")
  const ciphertext = Buffer.from(ciphertextHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  if (authTag.length !== AUTH_TAG_LEN) {
    throw new Error(`Auth tag length inválida: ${authTag.length}`)
  }
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])
  return decrypted.toString("utf8")
}
