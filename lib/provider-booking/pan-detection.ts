// Mirrors the Delfos PCI guardrail: 13-19 digits, payment-network MII and Luhn.
const MIN_PAN_DIGITS = 13;
const MAX_PAN_DIGITS = 19;
// Major Industry Identifier (primer dígito del PAN) de las redes de pago: 2–6
// (Visa 4, Mastercard 2/5, Amex 3, Discover/Diners/UnionPay 6, etc.). Excluye los IDs
// numéricos con relleno 0/1 que un Luhn ingenuo marcaría como tarjeta.
const MIN_MII = 2;
const MAX_MII = 6;

/** Runs maximales de dígitos con espacios/guiones de agrupación intercalados. */
const DIGIT_RUN = /\d[\d -]*\d/g;

/** Checksum de Luhn sobre una cadena de SOLO dígitos. */
export function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    const n = digits.charCodeAt(i) - 48; // '0' === 48
    if (n < 0 || n > 9) {
      return false;
    }
    let add = n;
    if (double) {
      add *= 2;
      if (add > 9) {
        add -= 9;
      }
    }
    sum += add;
    double = !double;
  }
  return sum % 10 === 0;
}

/** ¿Una secuencia de SOLO dígitos parece un PAN (longitud 13–19, MII 2–6, Luhn)? */
function looksLikePan(digits: string): boolean {
  if (digits.length < MIN_PAN_DIGITS || digits.length > MAX_PAN_DIGITS) {
    return false;
  }
  const mii = digits.charCodeAt(0) - 48; // '0' === 48
  if (mii < MIN_MII || mii > MAX_MII) {
    return false;
  }
  return passesLuhn(digits);
}

/** ¿El string contiene un PAN (separadores de agrupación tolerados)? */
function stringHasCardData(value: string): boolean {
  const candidates = value.match(DIGIT_RUN);
  if (candidates === null) {
    return false;
  }
  return candidates.some((candidate) => looksLikePan(candidate.replace(/[ -]/g, '')));
}

/**
 * Recorre recursivamente cualquier valor y detecta datos de tarjeta en sus strings. Escalares
 * no-string (números, booleanos, null/undefined) se ignoran: el contrato del proyecto es JSON con
 * PII en campos de texto (no se aceptan campos de pago).
 */
export function containsCardData(value: unknown): boolean {
  if (typeof value === 'string') {
    return stringHasCardData(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsCardData(item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((v) => containsCardData(v));
  }
  return false;
}
