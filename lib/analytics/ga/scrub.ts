// Red de seguridad en runtime: ningun parametro que salga hacia Google pasa sin
// atravesar `scrubParams`.
//
// El tipado de `lib/analytics/events.ts` ya impide en compile time mandar un
// monto o un email. Esto es la segunda capa, para el `as any`, el spread de un
// objeto de dominio entero, o el evento nuevo que alguien agrega apurado.
//
// Regla del proyecto: a Google NO van montos, nombres, emails, telefonos,
// CUIT/DNI, datos de clientes ni texto libre. Solo IDs anonimizados, enums y
// buckets.

export type GaParamValue = string | number | boolean
export type GaParams = Record<string, GaParamValue>

/**
 * Si el nombre de la clave (lowercase) contiene alguno de estos fragmentos, el
 * parametro se descarta entero. Ante la duda, agregar el fragmento: perder una
 * metrica es barato, filtrar PII no.
 */
export const DENYLISTED_KEY_FRAGMENTS: readonly string[] = [
  // Identidad de personas
  "email",
  "mail",
  "name",
  "nombre",
  "phone",
  // "telefono"/"telephone" y no "tel" a secas: "tel" matchearia "hotel", que en
  // una agencia de viajes es un nombre de parametro perfectamente legitimo.
  "telefono",
  "telephone",
  "celular",
  "cuit",
  "dni",
  "doc",
  "address",
  "direccion",
  // Plata
  "amount",
  "monto",
  "price",
  "precio",
  "total",
  "importe",
  "saldo",
  "balance",
  "cost",
  "costo",
  "iban",
  "cbu",
  "card",
  // Datos de clientes del tenant
  "customer",
  "cliente",
  "passenger",
  "pasajero",
  // Texto libre
  "note",
  "nota",
  "comment",
  // "comentario" no contiene "comment" (una sola m). Van los dos.
  "coment",
  "observ",
  "descripcion",
  "description",
  "mensaje",
  "message",
  "search",
  "query",
  // Secretos
  "token",
  "secret",
  "key",
  "password",
]

/** Claves exactas prohibidas que son demasiado cortas para un match por fragmento. */
const DENYLISTED_EXACT_KEYS: readonly string[] = ["q", "s"]

/**
 * Enteros permitidos aunque superen el techo: son contadores de UI, no plata.
 * Para cantidades de dominio usar `bucketCount()`.
 */
export const NUMERIC_ALLOWLIST_KEYS: readonly string[] = ["step", "days", "page"]

// Limites duros de GA4.
const MAX_PARAMS = 25
const MAX_KEY_LENGTH = 40
const MAX_VALUE_LENGTH = 100

/** Techo para enteros: por encima de esto asumimos que es plata disfrazada. */
const MAX_SAFE_INTEGER_VALUE = 10_000

/**
 * Etiquetas que produce `bucketCount()`. Es un conjunto cerrado y chico.
 *
 * Sirve para exceptuar del denylist a las claves `*_bucket`: `passengers_bucket`
 * contiene "passenger" (prohibido, para bloquear nombres de pasajeros) pero es
 * un agregado que por construccion no puede llevar PII. La excepcion exige que
 * el VALOR sea una de estas etiquetas exactas, asi que un `customer_bucket` con
 * texto libre adentro sigue cayendo.
 */
const BUCKET_LABELS: readonly string[] = ["0", "1", "2-5", "6-10", "11-25", "25+"]

function isSafeBucket(key: string, value: unknown): boolean {
  return (
    key.toLowerCase().endsWith("_bucket") &&
    typeof value === "string" &&
    BUCKET_LABELS.includes(value)
  )
}

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/
const LONG_DIGIT_RUN_RE = /\d{7,}/

/**
 * Claves cuyo valor es una ETIQUETA que escribe el usuario del producto, no un
 * enum nuestro.
 *
 * `from_stage` y `to_stage` son nombres de columna del tablero de ManyChat: los
 * escribe cada agencia. Pasaban el denylist (ninguna de las dos matchea un
 * fragmento prohibido) y el scrubber de strings solo recortaba a 100 chars, asi
 * que llegaban a Google tal cual, con dos problemas: texto libre del usuario en
 * una dimension, y cardinalidad sin techo.
 *
 * Se normalizan en vez de descartarse porque la metrica "de que etapa a que
 * etapa se mueven los leads" es util; lo que no sirve es el texto exacto.
 */
const LABEL_KEYS: readonly string[] = ["from_stage", "to_stage"]

/** Techo del slug. Una etapa de kanban no necesita mas. */
const MAX_LABEL_LENGTH = 32

/**
 * Reduce una etiqueta escrita por el usuario a un slug acotado: sin acentos, sin
 * espacios, sin puntuacion y con largo maximo.
 */
export function slugifyLabel(value: string): string {
  return value
    .normalize("NFD")
    // Marcas diacriticas combinantes, escapadas: los literales son invisibles
    // en un diff y se rompen con cualquier reencoding del archivo.
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LABEL_LENGTH)
}

/**
 * Filtra un objeto de parametros dejando solo lo que es seguro mandar a GA.
 * Nunca tira: ante cualquier valor raro, descarta la clave.
 */
export function scrubParams(raw: Record<string, unknown> | null | undefined): GaParams {
  if (!raw || typeof raw !== "object") return {}

  const out: GaParams = {}

  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_PARAMS) break

    if (!key || key.length > MAX_KEY_LENGTH) continue

    // Los buckets pasan aunque la clave matchee el denylist: el valor esta
    // restringido a un enum cerrado, no puede llevar informacion.
    if (isSafeBucket(key, value)) {
      out[key] = value as string
      continue
    }

    // Etiquetas escritas por el usuario: se normalizan en vez de pasar crudas.
    // Va antes del denylist porque el punto es que el VALOR queda acotado.
    if (LABEL_KEYS.includes(key)) {
      if (typeof value !== "string") continue
      const slug = slugifyLabel(value)
      if (slug) out[key] = slug
      continue
    }

    if (isDenylistedKey(key)) continue

    if (value === undefined || value === null || value === "") continue

    if (typeof value === "boolean") {
      out[key] = value
      continue
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) continue
      // Los no enteros son casi siempre plata (1250.5). Los enteros grandes
      // tambien (125000). Las cantidades de dominio van como bucket.
      if (!Number.isInteger(value)) continue
      if (
        Math.abs(value) > MAX_SAFE_INTEGER_VALUE &&
        !NUMERIC_ALLOWLIST_KEYS.includes(key)
      ) {
        continue
      }
      out[key] = value
      continue
    }

    if (typeof value === "string") {
      const trimmed = value.trim()
      if (!trimmed) continue
      // Un email o una corrida larga de digitos (CUIT, DNI, telefono, CBU) es PII
      // aunque la clave se llame `ref`.
      if (EMAIL_RE.test(trimmed)) continue
      if (LONG_DIGIT_RUN_RE.test(trimmed)) continue
      out[key] = trimmed.slice(0, MAX_VALUE_LENGTH)
      continue
    }

    // Objetos, arrays y funciones no se mandan: no hay forma de auditarlos.
  }

  return out
}

/**
 * Convierte una cantidad en un bucket, para medir volumen sin mandar el numero
 * exacto (que en operaciones/pagos puede ser reconstructivo).
 */
export function bucketCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0"
  if (n === 1) return "1"
  if (n <= 5) return "2-5"
  if (n <= 10) return "6-10"
  if (n <= 25) return "11-25"
  return "25+"
}

function isDenylistedKey(key: string): boolean {
  const lower = key.toLowerCase()
  if (DENYLISTED_EXACT_KEYS.includes(lower)) return true
  return DENYLISTED_KEY_FRAGMENTS.some((fragment) => lower.includes(fragment))
}
