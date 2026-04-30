"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Download, Upload, CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { parseCsv, type ParsedRow } from "@/lib/import/csv-parser"
import { uploadInChunks } from "@/lib/import/chunked-upload"
import { PreviewTable } from "./preview-table"
import { ErrorPanel } from "./error-panel"

interface Props<T> {
  entityKey: string
  title: string
  description: string
  schema: z.ZodType<T>
  headers: readonly string[]
  templatePath: string
  endpoint: string
  deps?: string[]
  onConfirm?: () => boolean | Promise<boolean>
}

export function EntityPanel<T extends Record<string, unknown>>({
  entityKey, title, description, schema, headers, templatePath, endpoint, deps, onConfirm,
}: Props<T>) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ParsedRow<T>[]>([])
  const [headerError, setHeaderError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<{ inserted: number; conflicts: number } | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.toLowerCase().endsWith(".csv")) {
      toast.error("Solo archivos .csv")
      return
    }
    setFile(f)
    const text = await f.text()
    const res = await parseCsv(text, schema, headers)
    if (res.headerError) {
      setHeaderError(res.headerError)
      setRows([])
      toast.error(res.headerError)
    } else {
      setHeaderError(null)
      setRows(res.rows)
    }
  }

  async function handleImport() {
    if (onConfirm) {
      const ok = await onConfirm()
      if (!ok) return
    }
    const validRows = rows.filter((r) => r.errors.length === 0).map((r) => r.data)
    if (validRows.length === 0) {
      toast.error("No hay filas válidas para importar")
      return
    }
    setIsImporting(true)
    setResult(null)
    const out = await uploadInChunks(validRows, endpoint, setProgress)
    setIsImporting(false)
    if (out.aborted) {
      toast.error(`Error: ${out.errorMessage}. Se importaron ${out.totalInserted} antes del error.`)
    } else {
      setResult({ inserted: out.totalInserted, conflicts: out.totalConflicts })
      toast.success(`Importación OK: ${out.totalInserted} insertadas, ${out.totalConflicts} duplicadas omitidas.`)
      setFile(null)
      setRows([])
      setProgress(null)
    }
  }

  const validCount = rows.filter((r) => r.errors.length === 0).length
  const errorCount = rows.filter((r) => r.errors.length > 0).length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
            {deps && deps.length > 0 && (
              <div className="flex gap-1 mt-2">
                <span className="text-xs text-muted-foreground">Requiere:</span>
                {deps.map((d) => <Badge key={d} variant="outline" className="text-xs">{d}</Badge>)}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3 flex-wrap">
          <Button variant="outline" asChild>
            <a href={templatePath} download>
              <Download className="mr-2 h-4 w-4" /> Descargar plantilla
            </a>
          </Button>
          <div className="relative">
            <input
              type="file"
              accept=".csv"
              onChange={handleFile}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isImporting}
            />
            <Button variant="secondary" disabled={isImporting}>
              <Upload className="mr-2 h-4 w-4" /> Subir CSV
            </Button>
          </div>
        </div>

        {headerError && (
          <Alert variant="destructive">
            <AlertDescription>{headerError}</AlertDescription>
          </Alert>
        )}

        {rows.length > 0 && (
          <>
            <div className="text-sm flex gap-4">
              <span>Total: <strong>{rows.length}</strong></span>
              <span className="text-success">OK: <strong>{validCount}</strong></span>
              {errorCount > 0 && <span className="text-destructive">Errores: <strong>{errorCount}</strong></span>}
            </div>
            <PreviewTable rows={rows} headers={headers} />
            <ErrorPanel rows={rows} headers={headers} fileName={file?.name || "data.csv"} />
            <div className="flex justify-end">
              <Button
                onClick={handleImport}
                disabled={validCount === 0 || errorCount > 0 || isImporting}
                size="lg"
              >
                {isImporting
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando…</>
                  : <><CheckCircle2 className="mr-2 h-4 w-4" /> Importar {validCount} filas</>}
              </Button>
            </div>
            {progress && (
              <div>
                <Progress value={(progress.current / progress.total) * 100} />
                <p className="text-xs text-muted-foreground mt-1">
                  Chunk {progress.current} de {progress.total}
                </p>
              </div>
            )}
          </>
        )}

        {result && (
          <Alert>
            <AlertDescription>
              Importación completada: <strong>{result.inserted}</strong> insertadas,{" "}
              <strong>{result.conflicts}</strong> duplicadas omitidas.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
