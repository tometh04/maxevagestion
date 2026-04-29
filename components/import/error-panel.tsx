"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { XCircle, Download } from "lucide-react"
import type { ParsedRow } from "@/lib/import/csv-parser"

interface Props<T> {
  rows: ParsedRow<T>[]
  headers: readonly string[]
  fileName: string
}

export function ErrorPanel<T extends Record<string, unknown>>({ rows, headers, fileName }: Props<T>) {
  const rowsWithErrors = rows.filter((r) => r.errors.length > 0)
  if (rowsWithErrors.length === 0) return null

  function downloadErrorsCsv() {
    const headerLine = [...headers, "_error"].join(",")
    const bodyLines = rows.map((r) => {
      const values = headers.map((h) => JSON.stringify((r.data as any)[h] ?? ""))
      const errCol = r.errors.length > 0 ? `"${r.errors.join("; ").replace(/"/g, '""')}"` : ""
      return [...values, errCol].join(",")
    })
    const csv = "\uFEFF" + [headerLine, ...bodyLines].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName.replace(/\.csv$/i, "") + "_con_errores.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Alert variant="destructive" className="mt-4">
      <XCircle className="h-4 w-4" />
      <AlertTitle>{rowsWithErrors.length} fila(s) con errores</AlertTitle>
      <AlertDescription>
        <ul className="list-disc list-inside text-sm mt-2 space-y-0.5">
          {rowsWithErrors.slice(0, 10).map((r) => (
            <li key={r.rowNumber}>
              Fila {r.rowNumber}: {r.errors.join(", ")}
            </li>
          ))}
          {rowsWithErrors.length > 10 && <li>…y {rowsWithErrors.length - 10} más.</li>}
        </ul>
        <Button variant="outline" size="sm" onClick={downloadErrorsCsv} className="mt-3">
          <Download className="mr-2 h-4 w-4" /> Descargar CSV con errores
        </Button>
      </AlertDescription>
    </Alert>
  )
}
