"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  EXPORT_DEFINITIONS,
  EXPORT_GROUPS,
  type ExportDefinition,
  type ExportSelection,
} from "@/lib/exports/catalog"

interface DataExportsSettingsProps {
  agencies: Array<{ id: string; name: string }>
  /** Ids del catálogo que este usuario puede descargar, resueltos en el server. */
  allowedExportIds: string[]
}

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

/** Desde el 1 de enero de este año hasta hoy: el período que más se pide. */
function periodoInicial(): { dateFrom: string; dateTo: string } {
  const hoy = new Date()
  const year = hoy.getFullYear()
  return {
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`,
  }
}

/** El mes anterior completo, que es el que se cierra y se le manda al contador. */
function mesInicial(): { year: number; month: number } {
  const hoy = new Date()
  const mes = hoy.getMonth() // 0-11; el mes anterior en base 1 da el mismo número
  return mes === 0
    ? { year: hoy.getFullYear() - 1, month: 12 }
    : { year: hoy.getFullYear(), month: mes }
}

function filenameFromResponse(response: Response, fallback: string): string {
  const disposition = response.headers.get("Content-Disposition") || ""
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback
}

/** Los endpoints devuelven el error como JSON aunque el archivo sea CSV/ZIP. */
async function errorFromResponse(response: Response): Promise<string> {
  const body = await response.json().catch(() => null)
  if (body && typeof body.error === "string") return body.error
  return `No se pudo generar el archivo (HTTP ${response.status})`
}

export function DataExportsSettings({ agencies, allowedExportIds }: DataExportsSettingsProps) {
  const periodo = periodoInicial()
  const mes = mesInicial()

  const [dateFrom, setDateFrom] = useState(periodo.dateFrom)
  const [dateTo, setDateTo] = useState(periodo.dateTo)
  const [agencyId, setAgencyId] = useState("ALL")
  const [year, setYear] = useState(mes.year)
  const [month, setMonth] = useState(mes.month)
  /** `${exportId}:${formatId}` mientras esa descarga está en curso. */
  const [descargando, setDescargando] = useState<string | null>(null)

  const selection: ExportSelection = { dateFrom, dateTo, agencyId, year, month }

  const disponibles = useMemo(
    () => EXPORT_DEFINITIONS.filter((definition) => allowedExportIds.includes(definition.id)),
    [allowedExportIds]
  )

  const usaPeriodo = disponibles.some((definition) => definition.controls.includes("period"))
  const usaAgencia =
    agencies.length > 1 && disponibles.some((definition) => definition.controls.includes("agency"))

  const years = useMemo(() => {
    const actual = new Date().getFullYear()
    return Array.from({ length: 6 }, (_, i) => actual - i)
  }, [])

  const rangoInvalido = Boolean(dateFrom && dateTo && dateFrom > dateTo)

  async function descargar(definition: ExportDefinition, formatId: string) {
    if (definition.controls.includes("period")) {
      if (!dateFrom || !dateTo) {
        toast.error("Elegí el período que querés descargar")
        return
      }
      if (rangoInvalido) {
        toast.error('La fecha "Desde" es posterior a la fecha "Hasta"')
        return
      }
    }

    const key = `${definition.id}:${formatId}`
    setDescargando(key)
    try {
      const response = await fetch(definition.buildUrl(formatId, selection))
      if (!response.ok) {
        toast.error(await errorFromResponse(response))
        return
      }

      const blob = await response.blob()
      const filename = filenameFromResponse(response, `${definition.id}.${formatId}`)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
      toast.success(`Descargado: ${filename}`)
    } catch (error: any) {
      toast.error(error?.message || "No se pudo contactar el servidor")
    } finally {
      setDescargando(null)
    }
  }

  if (disponibles.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No tenés permisos para exportar información de la agencia.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Descargá la información de tu agencia. Son los mismos archivos que genera cada pantalla,
        juntos en un solo lugar.
      </p>

      {(usaPeriodo || usaAgencia) && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-4">
          {usaPeriodo && (
            <>
              <div className="space-y-1.5">
                <label
                  htmlFor="exports-date-from"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Desde
                </label>
                <Input
                  id="exports-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="h-9 w-[160px]"
                  aria-invalid={rangoInvalido}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="exports-date-to"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Hasta
                </label>
                <Input
                  id="exports-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="h-9 w-[160px]"
                  aria-invalid={rangoInvalido}
                />
              </div>
            </>
          )}

          {usaAgencia && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Agencia</label>
              <Select value={agencyId} onValueChange={setAgencyId}>
                <SelectTrigger className="h-9 w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  {agencies.map((agency) => (
                    <SelectItem key={agency.id} value={agency.id}>
                      {agency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {rangoInvalido && (
            <p className="w-full text-xs text-destructive">
              La fecha &quot;Desde&quot; es posterior a la fecha &quot;Hasta&quot;.
            </p>
          )}
        </div>
      )}

      {EXPORT_GROUPS.map((group) => {
        const items = disponibles.filter((definition) => definition.groupId === group.id)
        if (items.length === 0) return null

        return (
          <Card key={group.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{group.label}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {items.map((definition) => (
                  <li
                    key={definition.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium">{definition.label}</p>
                      <p className="text-sm text-muted-foreground">{definition.description}</p>
                      {definition.note && (
                        <p className="text-xs text-muted-foreground/80">{definition.note}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {definition.controls.includes("month") && (
                        <>
                          <Select
                            value={String(month)}
                            onValueChange={(value) => setMonth(Number(value))}
                          >
                            <SelectTrigger className="h-9 w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MESES.map((nombre, index) => (
                                <SelectItem key={nombre} value={String(index + 1)}>
                                  {nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={String(year)}
                            onValueChange={(value) => setYear(Number(value))}
                          >
                            <SelectTrigger className="h-9 w-[95px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {years.map((value) => (
                                <SelectItem key={value} value={String(value)}>
                                  {value}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      )}

                      {definition.formats.map((formato) => {
                        const key = `${definition.id}:${formato.id}`
                        const enCurso = descargando === key
                        return (
                          <Button
                            key={formato.id}
                            variant="outline"
                            size="sm"
                            onClick={() => descargar(definition, formato.id)}
                            disabled={descargando !== null || rangoInvalido}
                          >
                            {enCurso ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="mr-2 h-4 w-4" />
                            )}
                            {formato.label}
                          </Button>
                        )
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
