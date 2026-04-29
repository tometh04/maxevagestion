/**
 * Parsea CSV plain a array de filas. Soporta:
 * - BOM al inicio
 * - Comas y newlines dentro de campos quoted
 * - Quotes escapadas como ""
 * - CRLF y LF
 */
export function parseCsv(content: string): string[][] {
  // Remover BOM
  const clean = content.replace(/^﻿/, "")
  if (!clean.trim()) return []

  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ""
  let inQuotes = false
  let i = 0

  while (i < clean.length) {
    const char = clean[i]
    const nextChar = clean[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        currentField += '"'
        i += 2
        continue
      }
      if (char === '"') {
        inQuotes = false
        i++
        continue
      }
      currentField += char
      i++
      continue
    }

    // Not in quotes
    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === ",") {
      currentRow.push(currentField)
      currentField = ""
      i++
      continue
    }
    if (char === "\n" || char === "\r") {
      // End of row
      currentRow.push(currentField)
      // Push only if row has content (skip empty lines)
      if (currentRow.some(c => c.length > 0)) {
        rows.push(currentRow)
      }
      currentRow = []
      currentField = ""
      // Skip \r\n as one
      if (char === "\r" && nextChar === "\n") i += 2
      else i++
      continue
    }
    currentField += char
    i++
  }

  // Push last field/row if any content
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField)
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow)
    }
  }

  return rows
}
