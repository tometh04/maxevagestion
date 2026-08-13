/**
 * Decodificación de CSVs subidos por el usuario (VIB-118).
 *
 * El import usaba `file.text()`, que por spec **siempre** decodifica UTF-8. Excel
 * en español guarda "CSV (delimitado por comas)" en Windows-1252, donde la Ñ es
 * el byte 0xD1 — inválido como UTF-8. El decoder lo reemplazaba por U+FFFD (�) y
 * el dato entraba roto a la base.
 *
 * Es una pérdida IRREVERSIBLE: U+FFFD no conserva el byte original, así que
 * "AVENDAÑO" quedaba como "AVENDA�O" para siempre y no aparecía ni buscando
 * "AVENDAÑO" ni "AVENDANO". Incidente real: 27 clientes y 1 operador de Milla
 * Cero, importados el 21-22/05/2026.
 *
 * Estrategia: UTF-8 estricto primero y Windows-1252 como fallback. Un archivo
 * UTF-8 válido siempre gana (es un superset de ASCII y sus secuencias multibyte
 * no son válidas por casualidad), así que el fallback solo se activa cuando el
 * archivo realmente no era UTF-8.
 */

export type CsvEncoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252"

export interface DecodedCsv {
  text: string
  /** Con qué codificación se interpretó. Útil para loguear y para avisar en la UI. */
  encoding: CsvEncoding
  /** true si hubo que caer al fallback: el archivo no era UTF-8 válido. */
  usedFallback: boolean
}

/** BOMs que Excel y editores suelen anteponer. */
const BOM_UTF8 = [0xef, 0xbb, 0xbf]
const BOM_UTF16LE = [0xff, 0xfe]
const BOM_UTF16BE = [0xfe, 0xff]

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false
  return prefix.every((b, i) => bytes[i] === b)
}

/**
 * Convierte el contenido crudo de un CSV a texto, detectando la codificación.
 *
 * No adivina por heurística de contenido: se apoya en el BOM cuando existe y, si
 * no, en si el archivo es UTF-8 válido. Es determinista y no puede "mejorar" un
 * archivo ya correcto.
 */
export function decodeCsvBuffer(buffer: ArrayBuffer): DecodedCsv {
  const bytes = new Uint8Array(buffer)

  // 1. BOM explícito: es la señal más confiable, no hay nada que adivinar.
  if (startsWith(bytes, BOM_UTF16LE)) {
    return {
      text: new TextDecoder("utf-16le").decode(bytes.subarray(2)),
      encoding: "utf-16le",
      usedFallback: false,
    }
  }
  if (startsWith(bytes, BOM_UTF16BE)) {
    return {
      text: new TextDecoder("utf-16be").decode(bytes.subarray(2)),
      encoding: "utf-16be",
      usedFallback: false,
    }
  }

  // El BOM UTF-8 se saca acá: dejarlo convierte el primer header en "﻿id" y
  // el mapeo de columnas deja de matchear.
  const body = startsWith(bytes, BOM_UTF8) ? bytes.subarray(3) : bytes

  // 2. UTF-8 estricto. `fatal` hace que tire en vez de insertar U+FFFD, que es
  //    justamente el bug: sin esto, un archivo Windows-1252 "decodifica bien"
  //    pero con la Ñ ya destruida.
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(body),
      encoding: "utf-8",
      usedFallback: false,
    }
  } catch {
    // 3. No era UTF-8. Windows-1252 es lo que exporta Excel en español y mapea
    //    todos los bytes 0x00-0xFF, así que nunca vuelve a fallar ni produce U+FFFD.
    return {
      text: new TextDecoder("windows-1252").decode(body),
      encoding: "windows-1252",
      usedFallback: true,
    }
  }
}

/**
 * ¿El texto tiene el carácter de reemplazo? Señal de que el daño ya ocurrió
 * aguas arriba (por ejemplo un archivo que ya venía corrupto de otro sistema).
 * En ese caso no hay decodificación que lo arregle: hay que avisar, no seguir.
 */
export function hasReplacementCharacter(text: string): boolean {
  return text.includes("�")
}
