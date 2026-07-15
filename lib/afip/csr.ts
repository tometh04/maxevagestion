/**
 * Generación y validación de certificados AFIP para el modo "manual / sociedad".
 *
 * Una persona jurídica (S.A.S./S.R.L.) no puede generar su certificado por el
 * flujo automático (afipsdk se loguea con Clave Fiscal, y a AFIP solo entra una
 * persona física). El camino que sí funciona es el CSR:
 *   1. vibook genera un par de claves + un CSR (acá).
 *   2. la sociedad sube el CSR a AFIP y descarga el certificado firmado.
 *   3. vibook valida que el cert empareje con la clave y lo activa.
 *
 * La clave privada nunca sale del server; el CSR es público.
 */
import * as crypto from "crypto"
import * as forge from "node-forge"

// OID del atributo serialNumber (donde AFIP espera "CUIT <11 dígitos>").
const OID_SERIAL_NUMBER = "2.5.4.5"

export interface CsrResult {
  privateKeyPem: string
  csrPem: string
}

export interface CertInfo {
  cuit: string | null
  commonName: string | null
  notBefore: Date
  notAfter: Date
  issuer: string
}

/**
 * Genera un par de claves RSA 2048 (nativo, rápido) y un CSR con el subject que
 * exige AFIP: C=AR, O=<razón social>, CN=<alias>, serialNumber=CUIT <cuit>.
 * Devuelve la clave privada (PKCS#1 PEM, como `openssl genrsa`) y el CSR PEM.
 */
export function generateKeyAndCsr(opts: {
  cuit: string
  razonSocial: string
  alias?: string
}): CsrResult {
  const cuit = String(opts.cuit).replace(/\D/g, "")
  const alias = (opts.alias || "vibook").replace(/[^a-zA-Z0-9]/g, "") || "vibook"
  const razonSocial = (opts.razonSocial || "").trim() || `CUIT ${cuit}`

  // Keypair RSA 2048 con crypto nativo (mucho más rápido que forge en JS puro).
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" }, // "RSA PRIVATE KEY"
  })

  // Armar y firmar el CSR con forge usando ese par de claves.
  const csr = forge.pki.createCertificationRequest()
  csr.publicKey = forge.pki.publicKeyFromPem(publicKey)
  csr.setSubject([
    { shortName: "C", value: "AR" },
    { shortName: "O", value: razonSocial },
    { shortName: "CN", value: alias },
    { type: OID_SERIAL_NUMBER, value: `CUIT ${cuit}` },
  ])
  csr.sign(forge.pki.privateKeyFromPem(privateKey), forge.md.sha256.create())

  return {
    privateKeyPem: privateKey,
    csrPem: forge.pki.certificationRequestToPem(csr),
  }
}

/**
 * Lee los datos de un certificado X.509 (PEM) firmado por AFIP: CUIT del subject
 * (serialNumber), CN, vigencia y emisor.
 */
export function parseCertificate(certPem: string): CertInfo {
  const cert = forge.pki.certificateFromPem(certPem)
  const serial = cert.subject.getField({ type: OID_SERIAL_NUMBER }) as
    | { value: string }
    | null
  const cn = cert.subject.getField("CN") as { value: string } | null
  const issuerO = cert.issuer.getField("O") as { value: string } | null
  const issuerCn = cert.issuer.getField("CN") as { value: string } | null

  return {
    cuit: serial?.value ? String(serial.value).replace(/\D/g, "") : null,
    commonName: cn?.value ?? null,
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    issuer: [issuerO?.value, issuerCn?.value].filter(Boolean).join(" "),
  }
}

/**
 * Verifica que un certificado empareje con una clave privada comparando el
 * modulus RSA. Es la validación clave antes de activar: sin match, el cert no
 * sirve con esa clave (AFIP no autenticaría).
 */
export function certificateMatchesKey(certPem: string, privateKeyPem: string): boolean {
  try {
    const cert = forge.pki.certificateFromPem(certPem)
    const key = forge.pki.privateKeyFromPem(privateKeyPem)
    const certPub = cert.publicKey as forge.pki.rsa.PublicKey
    return certPub.n.toString(16) === (key as forge.pki.rsa.PrivateKey).n.toString(16)
  } catch {
    return false
  }
}
