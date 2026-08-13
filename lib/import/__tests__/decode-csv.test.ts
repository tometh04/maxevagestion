// jsdom no expone TextDecoder/TextEncoder; en el runtime de Next (Node) sí son
// globales. Mismo polyfill que app/api/quotations/__tests__/id-route.test.ts.
const { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder } = require("util")
if (typeof global.TextDecoder === "undefined") global.TextDecoder = NodeTextDecoder
if (typeof global.TextEncoder === "undefined") global.TextEncoder = NodeTextEncoder

import { decodeCsvBuffer, hasReplacementCharacter } from "../decode-csv"

/** Arma un ArrayBuffer a partir de bytes crudos, como llegaría del upload. */
function buf(...bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer
}

function utf8(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer
}

/** Codifica en Windows-1252 (solo el rango que usamos en los tests). */
function win1252(text: string): ArrayBuffer {
  const map: Record<string, number> = {
    "Ñ": 0xd1, "ñ": 0xf1, "É": 0xc9, "é": 0xe9, "Á": 0xc1, "á": 0xe1,
    "Ó": 0xd3, "ó": 0xf3, "Ú": 0xda, "ú": 0xfa, "Í": 0xcd, "í": 0xed,
    "’": 0x92, // apóstrofo tipográfico de Word
  }
  const out: number[] = []
  for (const ch of text) {
    const mapped = map[ch]
    out.push(mapped !== undefined ? mapped : ch.charCodeAt(0))
  }
  return new Uint8Array(out).buffer
}

describe("decodeCsvBuffer", () => {
  it("decodifica UTF-8 sin tocar nada", () => {
    const result = decodeCsvBuffer(utf8("nombre,apellido\nJOAQUIN,AVENDAÑO"))
    expect(result.text).toBe("nombre,apellido\nJOAQUIN,AVENDAÑO")
    expect(result.encoding).toBe("utf-8")
    expect(result.usedFallback).toBe(false)
  })

  it("saca el BOM UTF-8 para que el primer header matchee", () => {
    const withBom = new Uint8Array([
      0xef, 0xbb, 0xbf,
      ...Array.from(new Uint8Array(utf8("nombre,apellido\nANA,PEREZ"))),
    ]).buffer
    const result = decodeCsvBuffer(withBom)
    expect(result.text.startsWith("nombre")).toBe(true)
    expect(result.encoding).toBe("utf-8")
  })

  // El corazón de VIB-118.
  it("recupera la Ñ de un CSV Windows-1252 (Excel en español)", () => {
    const result = decodeCsvBuffer(win1252("nombre,apellido\nJOAQUIN,AVENDAÑO"))
    expect(result.text).toBe("nombre,apellido\nJOAQUIN,AVENDAÑO")
    expect(result.encoding).toBe("windows-1252")
    expect(result.usedFallback).toBe(true)
    expect(hasReplacementCharacter(result.text)).toBe(false)
  })

  it("recupera acentos y el apóstrofo tipográfico de Word", () => {
    const result = decodeCsvBuffer(win1252("HÉCTOR,GASTÓN,D’AMBRA,NÚÑEZ"))
    expect(result.text).toBe("HÉCTOR,GASTÓN,D’AMBRA,NÚÑEZ")
    expect(hasReplacementCharacter(result.text)).toBe(false)
  })

  it("nunca produce U+FFFD, que es lo que rompía el dato de forma irreversible", () => {
    // 0xD1 suelto es inválido en UTF-8; el decoder no estricto lo volvía "�".
    const result = decodeCsvBuffer(buf(0x41, 0xd1, 0x4f)) // A Ñ O
    expect(result.text).toBe("AÑO")
    expect(hasReplacementCharacter(result.text)).toBe(false)
  })

  it("prefiere UTF-8 cuando el archivo es válido en ambas codificaciones", () => {
    // "AÑO" en UTF-8 son los bytes C3 91; leído como Windows-1252 daría "AÃO".
    const result = decodeCsvBuffer(utf8("AÑO"))
    expect(result.text).toBe("AÑO")
    expect(result.encoding).toBe("utf-8")
  })

  it("maneja UTF-16LE con BOM (Excel 'Texto Unicode')", () => {
    const result = decodeCsvBuffer(buf(0xff, 0xfe, 0x41, 0x00, 0xd1, 0x00, 0x4f, 0x00))
    expect(result.text).toBe("AÑO")
    expect(result.encoding).toBe("utf-16le")
  })

  it("no rompe con un archivo vacío", () => {
    const result = decodeCsvBuffer(new ArrayBuffer(0))
    expect(result.text).toBe("")
    expect(result.encoding).toBe("utf-8")
  })
})

describe("hasReplacementCharacter", () => {
  it("detecta contenido que ya venía corrupto de otro sistema", () => {
    expect(hasReplacementCharacter("AVENDA�O")).toBe(true)
    expect(hasReplacementCharacter("AVENDAÑO")).toBe(false)
  })
})
