"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Eye,
  Play,
} from "lucide-react"
import { toast } from "sonner"

type Pipeline =
  | "operations-master"
  | "customers"
  | "operators"
  | "payments-suelto"
  | "cash-movements"

type FxMode = "monthly_rates" | "manual_fixed" | "monthly_with_fallback"

interface ImportError {
  rowNumber: number
  field?: string
  message: string
}

interface ImportWarning {
  rowNumber: number
  message: string
}

interface ImportResult {
  totalRows: number
  successRows: number
  errorRows: number
  warningRows: number
  errors: ImportError[]
  warnings: ImportWarning[]
  previewSummary: {
    customersToCreate?: number
    operatorsToCreate?: number
    operationsToCreate?: number
    paymentsToCreate?: number
    cashMovementsToCreate?: number
  }
}

const PIPELINES: Array<{ id: Pipeline; name: string; description: string }> = [
  {
    id: "operations-master",
    name: "Operaciones (Master)",
    description:
      "Import canónico — una fila genera operación + cliente + operadores + payments cobrados/pendientes. Recomendado para arrancar.",
  },
  {
    id: "customers",
    name: "Clientes (catálogo)",
    description: "Solo agregar clientes al catálogo, sin operaciones.",
  },
  {
    id: "operators",
    name: "Operadores (catálogo)",
    description: "Solo agregar operadores/proveedores al catálogo.",
  },
  {
    id: "payments-suelto",
    name: "Pagos sueltos",
    description:
      "Cobros o pagos vinculados a operaciones existentes (matchea por código de operación).",
  },
  {
    id: "cash-movements",
    name: "Movimientos de Caja",
    description:
      "Movimientos sueltos de caja, opcionalmente vinculados a operaciones.",
  },
]

interface Props {
  agencies: Array<{ id: string; name: string }>
}

export function ImportV2Client({ agencies }: Props) {
  const [pipeline, setPipeline] = useState<Pipeline>("operations-master")
  const [agencyId, setAgencyId] = useState<string>(agencies[0]?.id ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [fxMode, setFxMode] = useState<FxMode>("monthly_with_fallback")
  const [manualRate, setManualRate] = useState<string>("1450")
  const [isLoading, setIsLoading] = useState(false)
  const [stage, setStage] = useState<"idle" | "preview" | "done">("idle")
  const [result, setResult] = useState<ImportResult | null>(null)

  const downloadTemplate = () => {
    window.open(`/api/import/v2/templates/${pipeline}`, "_blank")
  }

  const submit = async (dryRun: boolean) => {
    if (!file) {
      toast.error("Subí un archivo CSV primero")
      return
    }
    if (!agencyId) {
      toast.error("Seleccioná una agencia")
      return
    }

    const fd = new FormData()
    fd.append("file", file)
    fd.append("pipeline", pipeline)
    fd.append("agency_id", agencyId)
    fd.append("dry_run", dryRun ? "true" : "false")
    fd.append("exchange_rate_mode", fxMode)
    if (fxMode !== "monthly_rates" && manualRate) {
      fd.append("manual_rate", manualRate)
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/import/v2/run", {
        method: "POST",
        body: fd,
      })
      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error ?? "Error en la importación")
        return
      }

      setResult(data)
      setStage(dryRun ? "preview" : "done")
      toast.success(
        dryRun
          ? `Preview listo: ${data.successRows} OK, ${data.errorRows} errores`
          : `Importación completada: ${data.successRows} filas`
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "desconocido"
      toast.error(`Error: ${msg}`)
    } finally {
      setIsLoading(false)
    }
  }

  const reset = () => {
    setFile(null)
    setStage("idle")
    setResult(null)
  }

  const selectedPipeline = PIPELINES.find((p) => p.id === pipeline)!

  const stepNumber = (n: number) =>
    pipeline === "operations-master" ? n : n - 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Importación de Datos</h1>
        <p className="text-muted-foreground">
          Subí un CSV para importar tu data al sistema. Toda la data queda
          aislada en la agencia que selecciones.
        </p>
      </div>

      {/* Paso 1: Pipeline + Agencia */}
      <Card>
        <CardHeader>
          <CardTitle>1. ¿Qué querés importar?</CardTitle>
          <CardDescription>
            Elegí el tipo de import y la agencia destino.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de import</Label>
              <Select
                value={pipeline}
                onValueChange={(v) => {
                  setPipeline(v as Pipeline)
                  reset()
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINES.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {selectedPipeline.description}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Agencia destino</Label>
              <Select value={agencyId} onValueChange={setAgencyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar agencia" />
                </SelectTrigger>
                <SelectContent>
                  {agencies.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Toda la data importada va a esta agencia. No es visible para
                otras agencias.
              </p>
            </div>
          </div>

          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Descargar plantilla CSV de ejemplo
          </Button>
        </CardContent>
      </Card>

      {/* Paso 2: Tipo de cambio (solo si pipeline es operations-master) */}
      {pipeline === "operations-master" && (
        <Card>
          <CardHeader>
            <CardTitle>2. Tipo de cambio USD → ARS</CardTitle>
            <CardDescription>
              Usado para convertir montos USD del CSV a ARS al guardar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Modo</Label>
              <Select
                value={fxMode}
                onValueChange={(v) => setFxMode(v as FxMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly_with_fallback">
                    Tipos de cambio mensuales registrados (con fallback manual)
                  </SelectItem>
                  <SelectItem value="monthly_rates">
                    Solo tipos de cambio mensuales registrados
                  </SelectItem>
                  <SelectItem value="manual_fixed">
                    Manual fijo (un solo rate para todo el CSV)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {fxMode !== "monthly_rates" && (
              <div className="space-y-2">
                <Label>
                  Rate{" "}
                  {fxMode === "manual_fixed"
                    ? "(obligatorio)"
                    : "(fallback si falta el mes)"}
                </Label>
                <Input
                  type="number"
                  value={manualRate}
                  onChange={(e) => setManualRate(e.target.value)}
                  placeholder="1450"
                />
                <p className="text-sm text-muted-foreground">
                  ARS por 1 USD. Ej: 1450
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Paso 3 (o 2): Subir archivo */}
      <Card>
        <CardHeader>
          <CardTitle>{stepNumber(3)}. Subí tu CSV</CardTitle>
          <CardDescription>
            Tamaño máximo: 10 MB. Para CSVs grandes (&gt;500 filas) podés
            cortarlo en partes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Archivo CSV</Label>
            <Input
              id="file"
              type="file"
              accept=".csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setStage("idle")
                setResult(null)
              }}
            />
          </div>

          {file && (
            <Alert>
              <FileSpreadsheet className="h-4 w-4" />
              <AlertTitle>{file.name}</AlertTitle>
              <AlertDescription>
                {(file.size / 1024).toFixed(1)} KB
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => submit(true)}
              disabled={!file || isLoading}
              variant="outline"
            >
              {isLoading && stage === "idle" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              Vista previa (dry-run)
            </Button>

            {stage === "preview" && (
              <Button onClick={() => submit(false)} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Confirmar e importar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resultado */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {stage === "preview" ? (
                <>
                  <Eye className="h-5 w-5" />
                  Vista previa (no se guardó nada todavía)
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Importación completada
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Total" value={result.totalRows} />
              <Stat
                label="Éxitos"
                value={result.successRows}
                variant="success"
              />
              <Stat
                label="Advertencias"
                value={result.warningRows}
                variant="warning"
              />
              <Stat
                label="Errores"
                value={result.errorRows}
                variant="destructive"
              />
            </div>

            {result.previewSummary && (
              <div className="flex flex-wrap gap-3 text-sm">
                {result.previewSummary.customersToCreate !== undefined && (
                  <Badge variant="secondary">
                    Clientes: {result.previewSummary.customersToCreate}
                  </Badge>
                )}
                {result.previewSummary.operatorsToCreate !== undefined && (
                  <Badge variant="secondary">
                    Operadores: {result.previewSummary.operatorsToCreate}
                  </Badge>
                )}
                {result.previewSummary.operationsToCreate !== undefined && (
                  <Badge variant="secondary">
                    Operaciones: {result.previewSummary.operationsToCreate}
                  </Badge>
                )}
                {result.previewSummary.paymentsToCreate !== undefined && (
                  <Badge variant="secondary">
                    Payments: {result.previewSummary.paymentsToCreate}
                  </Badge>
                )}
                {result.previewSummary.cashMovementsToCreate !== undefined && (
                  <Badge variant="secondary">
                    Movimientos caja:{" "}
                    {result.previewSummary.cashMovementsToCreate}
                  </Badge>
                )}
              </div>
            )}

            {result.errors.length > 0 && (
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  Errores
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Fila</TableHead>
                      <TableHead className="w-32">Campo</TableHead>
                      <TableHead>Mensaje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.errors.slice(0, 50).map((e, i) => (
                      <TableRow key={i}>
                        <TableCell>{e.rowNumber}</TableCell>
                        <TableCell>{e.field ?? "-"}</TableCell>
                        <TableCell className="text-sm">{e.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {result.errors.length > 50 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Mostrando 50 de {result.errors.length} errores.
                  </p>
                )}
              </div>
            )}

            {result.warnings.length > 0 && (
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  Advertencias
                </h4>
                <ul className="text-sm space-y-1">
                  {result.warnings.slice(0, 30).map((w, i) => (
                    <li key={i} className="text-muted-foreground">
                      Fila {w.rowNumber}: {w.message}
                    </li>
                  ))}
                </ul>
                {result.warnings.length > 30 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Mostrando 30 de {result.warnings.length} advertencias.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  variant,
}: {
  label: string
  value: number
  variant?: "success" | "warning" | "destructive"
}) {
  const colorClass =
    variant === "success"
      ? "text-green-600"
      : variant === "warning"
        ? "text-yellow-600"
        : variant === "destructive"
          ? "text-destructive"
          : ""
  return (
    <div className="text-center p-3 rounded-md border">
      <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  )
}
