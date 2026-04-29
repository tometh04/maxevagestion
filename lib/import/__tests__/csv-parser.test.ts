import { parseCsv } from "../csv-parser"

describe("parseCsv", () => {
  it("parsea CSV simple con header y filas", () => {
    const input = "name,age\nJuan,30\nMaria,25"
    expect(parseCsv(input)).toEqual([
      ["name", "age"],
      ["Juan", "30"],
      ["Maria", "25"],
    ])
  })

  it("remueve BOM al inicio si existe", () => {
    const input = "﻿name,age\nJuan,30"
    expect(parseCsv(input)).toEqual([
      ["name", "age"],
      ["Juan", "30"],
    ])
  })

  it("respeta comas dentro de comillas", () => {
    const input = 'name,note\n"Pérez, Juan","Hola, mundo"'
    expect(parseCsv(input)).toEqual([
      ["name", "note"],
      ["Pérez, Juan", "Hola, mundo"],
    ])
  })

  it("respeta comillas escapadas (doble comilla)", () => {
    const input = 'name,quote\nJuan,"He said ""hi"""'
    expect(parseCsv(input)).toEqual([
      ["name", "quote"],
      ["Juan", 'He said "hi"'],
    ])
  })

  it("ignora líneas vacías", () => {
    const input = "name,age\n\nJuan,30\n\n"
    expect(parseCsv(input)).toEqual([
      ["name", "age"],
      ["Juan", "30"],
    ])
  })

  it("soporta CRLF (Windows)", () => {
    const input = "name,age\r\nJuan,30\r\n"
    expect(parseCsv(input)).toEqual([
      ["name", "age"],
      ["Juan", "30"],
    ])
  })

  it("retorna array vacío para input vacío", () => {
    expect(parseCsv("")).toEqual([])
    expect(parseCsv("\n\n")).toEqual([])
  })
})
