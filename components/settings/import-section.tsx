"use client"

import { useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { 
  Download, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Loader2,
  Trash2
} from "lucide-react"
import { toast } from "sonner"

interface ImportSectionProps {
  type: string
  name: string
  description: string
  fields: string[]
  requiredFields: string[]
  templateName: string
}

interface ParsedRow {
  data: Record<string, string>
  errors: string[]
  warnings: string[]
  rowNumber: number
}

interface ImportResult {
  success: number
  errors: number
  warnings: number
  details: string[]
}

// Mapeo de campos a nombres legibles en español
const fieldLabels: Record<string, string> = {
  first_name: "Nombre",
  last_name: "Apellido",
  phone: "Teléfono",
  email: "Email",
  document_type: "Tipo Doc.",
  document_number: "Nro. Doc.",
  date_of_birth: "Fecha Nac.",
  nationality: "Nacionalidad",
  name: "Nombre",
  contact_name: "Contacto",
  contact_email: "Email Contacto",
  contact_phone: "Teléfono Contacto",
  credit_limit: "Límite Crédito",
  file_code: "Código",
  customer_email: "Email Cliente",
  destination: "Destino",
  departure_date: "Fecha Salida",
  return_date: "Fecha Regreso",
  adults: "Adultos",
  children: "Children",
  sale_amount: "Monto Venta",
  operator_cost: "Costo Operador",
  currency: "Moneda",
  status: "Estado",
  seller_email: "Email Vendedor",
  operator_name: "Operador",
  operation_file_code: "Código Op.",
  amount: "Monto",
  date_due: "Fecha Venc.",
  date_paid: "Fecha Pago",
  direction: "Dirección",
  payer_type: "Tipo Pagador",
  method: "Método",
  reference: "Referencia",
  date: "Fecha",
  type: "Tipo",
  account_name: "Cuenta",
  category: "Categoría",
  notes: "Notas",
}

export function ImportSection({
  type,
  name,
  description,
  fields,
  requiredFields,
  templateName,
}: ImportSectionProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedRow[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [progress, setProgress] = useState(0)

  // Generar y descargar template
  const downloadTemplate = () => {
    const headers = fields.map(f => fieldLabels[f] || f).join(",")
    const exampleRow = fields.map(f => getExampleValue(f)).join(",")
    const csvContent = `${headers}\n${exampleRow}`
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = templateName
    link.click()
    URL.revokeObjectURL(url)
    
    toast.success("Template descargado")
  }

  // Valores de ejemplo para el template
  function getExampleValue(field: string): string {
    const examples: Record<string, string> = {
      first_name: "Juan",
      last_name: "Pérez",
      phone: "+54 11 1234-5678",
      email: "juan@email.com",
      document_type: "DNI",
      document_number: "12345678",
      date_of_birth: "1990-01-15",
      nationality: "Argentina",
      name: "Operador Ejemplo",
      contact_name: "María García",
      contact_email: "contacto@operador.com",
      contact_phone: "+54 11 8765-4321",
      credit_limit: "1000000",
      file_code: "OP-20250101-001",
      customer_email: "cliente@email.com",
      destination: "Cancún",
      departure_date: "2025-03-15",
      return_date: "2025-03-22",
      adults: "2",
      children: "0",
      sale_amount: "500000",
      operator_cost: "400000",
      currency: "ARS",
      status: "CONFIRMED",
      seller_email: "vendedor@maxeva.com",
      operator_name: "Despegar",
      operation_file_code: "OP-20250101-001",
      amount: "100000",
      date_due: "2025-02-15",
      date_paid: "2025-02-10",
      direction: "INCOME",
      payer_type: "CUSTOMER",
      method: "TRANSFER",
      reference: "REF-001",
      date: "2025-01-15",
      type: "INCOME",
      account_name: "Caja ARS",
      category: "SALE",
      notes: "Pago inicial",
    }
    return examples[field] || ""
  }

  // Parsear CSV
  const parseCSV = useCallback((content: string): ParsedRow[] => {
    const lines = content.split(/\r?\n/).filter(line => line.trim())
    if (lines.length < 2) return []

    const headers = lines[0].split(",").map(h => h.trim())
    
    // Mapear headers a nombres de campos
    const headerToField: Record<string, string> = {}
    for (const field of fields) {
      const label = fieldLabels[field] || field
      const headerIndex = headers.findIndex(h => 
        h.toLowerCase() === label.toLowerCase() || 
        h.toLowerCase() === field.toLowerCase()
      )
      if (headerIndex !== -1) {
        headerToField[headers[headerIndex]] = field
      }
    }

    const rows: ParsedRow[] = []
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i])
      const rowData: Record<string, string> = {}
      const errors: string[] = []
      const warnings: string[] = []

      headers.forEach((header, index) => {
        const field = headerToField[header]
        if (field) {
          rowData[field] = values[index]?.trim() || ""
        }
      })

      // Validar campos requeridos
      for (const required of requiredFields) {
        if (!rowData[required] || rowData[required].trim() === "") {
          errors.push(`Campo requerido: ${fieldLabels[required] || required}`)
        }
      }

      // Validaciones específicas
      if (rowData.email && !isValidEmail(rowData.email)) {
        warnings.push("Email con formato inválido")
      }
      if (rowData.phone && rowData.phone.length < 8) {
        warnings.push("Teléfono parece muy corto")
      }
      if (rowData.currency && !["ARS", "USD"].includes(rowData.currency.toUpperCase())) {
        errors.push("Moneda debe ser ARS o USD")
      }

      rows.push({
        data: rowData,
        errors,
        warnings,
        rowNumber: i + 1,
      })
    }

    return rows
  }, [fields, requiredFields])

  // Parsear línea de CSV (maneja comas dentro de comillas)
  function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ""
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === "," && !inQuotes) {
        result.push(current)
        current = ""
      } else {
        current += char
      }
    }
    result.push(current)
    return result
  }

  function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  // Manejar selección de archivo
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (!selectedFile.name.endsWith(".csv")) {
      toast.error("Por favor selecciona un archivo CSV")
      return
    }

    setFile(selectedFile)
    setIsUploading(true)
    setImportResult(null)

    try {
      const content = await selectedFile.text()
      const parsed = parseCSV(content)
      setParsedData(parsed)
      
      const errorCount = parsed.filter(r => r.errors.length > 0).length
      const warningCount = parsed.filter(r => r.warnings.length > 0).length
      
      if (errorCount > 0) {
        toast.warning(`${parsed.length} filas parseadas. ${errorCount} con errores.`)
      } else if (warningCount > 0) {
        toast.info(`${parsed.length} filas parseadas. ${warningCount} con advertencias.`)
      } else {
        toast.success(`${parsed.length} filas listas para importar`)
      }
    } catch (error) {
      toast.error("Error al leer el archivo")
      console.error(error)
    } finally {
      setIsUploading(false)
    }
  }

  // Ejecutar importación
  const handleImport = async () => {
    const validRows = parsedData.filter(r => r.errors.length === 0)
    if (validRows.length === 0) {
      toast.error("No hay filas válidas para importar")
      return
    }

    setIsImporting(true)
    setProgress(0)

    try {
      const response = await fetch(`/api/import/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          rows: validRows.map(r => r.data),
        }),
      })

      const result = await response.json()

      if (response.ok) {
        setImportResult(result)
        toast.success(`Importación completada: ${result.success} registros`)
        
        // Limpiar estado si fue exitoso
        if (result.errors === 0) {
          setFile(null)
          setParsedData([])
        }
      } else {
        toast.error(result.error || "Error en la importación")
      }
    } catch (error) {
      toast.error("Error de conexión")
      console.error(error)
    } finally {
      setIsImporting(false)
      setProgress(100)
    }
  }

  // Limpiar selección
  const clearFile = () => {
    setFile(null)
    setParsedData([])
    setImportResult(null)
  }

  const validCount = parsedData.filter(r => r.errors.length === 0).length
  const errorCount = parsedData.filter(r => r.errors.length > 0).length
  const warningCount = parsedData.filter(r => r.warnings.length > 0 && r.errors.length === 0).length

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar {name}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Campos del template */}
          <div>
            <h4 className="text-sm font-medium mb-2">Campos del template:</h4>
            <div className="flex flex-wrap gap-2">
              {fields.map((field) => (
                <Badge 
                  key={field} 
                  variant={requiredFields.includes(field) ? "default" : "outline"}
                >
                  {fieldLabels[field] || field}
                  {requiredFields.includes(field) && " *"}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">* Campos requeridos</p>
          </div>

          {/* Botones de acción */}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Descargar Template
            </Button>

            <div className="relative">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isUploading || isImporting}
              />
              <Button variant="secondary" disabled={isUploading || isImporting}>
                {isUploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Subir CSV
              </Button>
            </div>

            {file && (
              <Button variant="ghost" size="icon" onClick={clearFile}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Archivo seleccionado */}
          {file && (
            <Alert>
              <FileSpreadsheet className="h-4 w-4" />
              <AlertTitle>Archivo seleccionado</AlertTitle>
              <AlertDescription>
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Vista previa de datos */}
      {parsedData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Vista Previa</CardTitle>
            <CardDescription className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {validCount} válidos
              </span>
              {warningCount > 0 && (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  {warningCount} advertencias
                </span>
              )}
              {errorCount > 0 && (
                <span className="flex items-center gap-1">
                  <XCircle className="h-4 w-4 text-red-500" />
                  {errorCount} errores
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead className="w-24">Estado</TableHead>
                    {fields.slice(0, 5).map((field) => (
                      <TableHead key={field}>{fieldLabels[field] || field}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.slice(0, 50).map((row, index) => (
                    <TableRow 
                      key={index}
                      className={row.errors.length > 0 ? "bg-red-50 dark:bg-red-950/20" : 
                                row.warnings.length > 0 ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}
                    >
                      <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                      <TableCell>
                        {row.errors.length > 0 ? (
                          <Badge variant="destructive" className="text-xs">
                            Error
                          </Badge>
                        ) : row.warnings.length > 0 ? (
                          <Badge variant="outline" className="text-xs text-yellow-600">
                            Advertencia
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-green-600">
                            OK
                          </Badge>
                        )}
                      </TableCell>
                      {fields.slice(0, 5).map((field) => (
                        <TableCell key={field} className="text-sm">
                          {row.data[field] || "-"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsedData.length > 50 && (
              <p className="text-sm text-muted-foreground mt-2">
                Mostrando 50 de {parsedData.length} filas
              </p>
            )}

            {/* Errores detallados */}
            {errorCount > 0 && (
              <Alert variant="destructive" className="mt-4">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Errores encontrados</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside text-sm mt-2">
                    {parsedData
                      .filter(r => r.errors.length > 0)
                      .slice(0, 5)
                      .map((row, i) => (
                        <li key={i}>
                          Fila {row.rowNumber}: {row.errors.join(", ")}
                        </li>
                      ))}
                    {errorCount > 5 && <li>... y {errorCount - 5} más</li>}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Botón de importar */}
            <div className="flex justify-end mt-4">
              <Button 
                onClick={handleImport} 
                disabled={validCount === 0 || isImporting}
                size="lg"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Importar {validCount} registros
                  </>
                )}
              </Button>
            </div>

            {isImporting && (
              <Progress value={progress} className="mt-4" />
            )}
          </CardContent>
        </Card>
      )}

      {/* Resultado de la importación */}
      {importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {importResult.errors === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              )}
              Resultado de la Importación
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20">
                <p className="text-2xl font-bold text-green-600">{importResult.success}</p>
                <p className="text-sm text-muted-foreground">Importados</p>
              </div>
              <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/20">
                <p className="text-2xl font-bold text-yellow-600">{importResult.warnings}</p>
                <p className="text-sm text-muted-foreground">Advertencias</p>
              </div>
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20">
                <p className="text-2xl font-bold text-red-600">{importResult.errors}</p>
                <p className="text-sm text-muted-foreground">Errores</p>
              </div>
            </div>

            {importResult.details.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Detalles:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {importResult.details.slice(0, 10).map((detail, i) => (
                    <li key={i}>• {detail}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

