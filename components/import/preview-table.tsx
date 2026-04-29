"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { ParsedRow } from "@/lib/import/csv-parser"

interface Props<T> {
  rows: ParsedRow<T>[]
  headers: readonly string[]
  maxRows?: number
}

export function PreviewTable<T extends Record<string, unknown>>({ rows, headers, maxRows = 50 }: Props<T>) {
  const visible = rows.slice(0, maxRows)
  return (
    <div className="rounded-md border overflow-x-auto max-h-[400px] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Fila</TableHead>
            <TableHead className="w-24">Estado</TableHead>
            {headers.slice(0, 5).map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((r) => (
            <TableRow key={r.rowNumber} className={r.errors.length ? "bg-destructive/10" : ""}>
              <TableCell className="font-mono text-xs">{r.rowNumber}</TableCell>
              <TableCell>
                {r.errors.length > 0 ? (
                  <Badge variant="destructive">Error</Badge>
                ) : (
                  <Badge variant="outline" className="text-green-600">OK</Badge>
                )}
              </TableCell>
              {headers.slice(0, 5).map((h) => (
                <TableCell key={h} className="text-sm">
                  {String((r.data as any)[h] ?? "-")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > maxRows && (
        <p className="text-xs text-slate-500 p-2">Mostrando {maxRows} de {rows.length} filas</p>
      )}
    </div>
  )
}
