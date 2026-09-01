"use client"

/**
 * Ajustes de liquidación del período (VIB-174).
 *
 * "Que en algún lugar queden todos estos ajustes, así a fin de mes vamos a
 * poder contabilizarlos, sean ganancias o pérdidas."
 *
 * Dos decisiones de lectura:
 *
 *   * Se muestra el RESULTADO (ganancia/pérdida), no el delta de costo. Es el
 *     signo con el que esto entra al mes.
 *   * ARS y USD nunca se suman: un total por moneda, como en el resto de los
 *     reportes del producto.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { Download, Scale, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { parseDateOnlyLocal, formatDateOnlyLocal } from "@/lib/utils/date-only"
import type { OperatorAdjustmentsReport } from "@/lib/reports/operator-adjustments-report"

interface OperatorAdjustmentsReportClientProps {
  agencies: Array<{ id: string; name: string }>
}

function money(value: number, currency: string) {
  const sign = value < 0 ? "-" : ""
  return `${sign}${currency} ${Math.abs(value).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function startOfCurrentMonth() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export function OperatorAdjustmentsReportClient({
  agencies,
}: OperatorAdjustmentsReportClientProps) {
  const [report, setReport] = useState<OperatorAdjustmentsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [from, setFrom] = useState<Date | undefined>(startOfCurrentMonth())
  const [to, setTo] = useState<Date | undefined>(undefined)
  const [agencyId, setAgencyId] = useState("ALL")
  const [includeReversed, setIncludeReversed] = useState(false)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (from) params.set("from", formatDateOnlyLocal(from)!)
      if (to) params.set("to", formatDateOnlyLocal(to)!)
      if (agencyId !== "ALL") params.set("agencyId", agencyId)
      if (includeReversed) params.set("includeReversed", "true")

      const response = await fetch(`/api/accounting/operator-cost-adjustments?${params}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || "No se pudo cargar el reporte")
      setReport(payload)
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar el reporte")
    } finally {
      setLoading(false)
    }
  }, [from, to, agencyId, includeReversed])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const handleRevert = async (id: string) => {
    const reason = window.prompt("¿Por qué se revierte este ajuste?")
    if (!reason || !reason.trim()) return

    try {
      const response = await fetch(`/api/accounting/operator-cost-adjustments/${id}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || "No se pudo revertir")
      toast.success("Ajuste revertido")
      fetchReport()
    } catch (err: any) {
      toast.error(err?.message || "No se pudo revertir el ajuste")
    }
  }

  const exportCsv = () => {
    if (!report || report.rows.length === 0) return

    // Excel en español: separador ";", coma decimal, BOM y CRLF.
    const header = [
      "Fecha",
      "Operacion",
      "Operador",
      "Oficina",
      "Moneda",
      "Estimado",
      "Real",
      "Resultado",
      "Agencia",
      "Vendedores",
      "Referidor",
      "Motivo",
    ]
    const decimal = (n: number) => n.toFixed(2).replace(".", ",")

    const lines = report.rows.map((row) =>
      [
        row.accrualDate,
        row.operationFileCode ?? "",
        row.operatorName ?? "",
        row.agencyName ?? "",
        row.currency,
        decimal(row.estimatedAmount),
        decimal(row.actualAmount),
        decimal(row.resultAmount),
        decimal(row.agencyShare),
        decimal(row.sellerShares.reduce((sum, s) => sum + s.amount, 0)),
        decimal(row.referrerShare),
        (row.reason || "").replace(/[;\r\n]+/g, " "),
      ].join(";"),
    )

    const csv = `sep=;\r\n${header.join(";")}\r\n${lines.join("\r\n")}\r\n`
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `ajustes-liquidacion-${formatDateOnlyLocal(from ?? new Date())}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const hasRows = (report?.rows.length ?? 0) > 0

  const totals = useMemo(() => report?.totals ?? [], [report])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Desde</Label>
          <DateInputWithCalendar value={from} onChange={setFrom} placeholder="dd/mm/aaaa" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Hasta</Label>
          <DateInputWithCalendar value={to} onChange={setTo} placeholder="dd/mm/aaaa" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Oficina</Label>
          <Select value={agencyId} onValueChange={setAgencyId}>
            <SelectTrigger className="w-[200px]">
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIncludeReversed((value) => !value)}
        >
          {includeReversed ? "Ocultar revertidos" : "Ver revertidos"}
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!hasRows}>
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <div className="space-y-3 py-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchReport}>
            Reintentar
          </Button>
        </div>
      ) : !hasRows ? (
        <div className="rounded-xl border border-dashed border-border/60 px-6 py-12 text-center">
          <Scale className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">Sin ajustes en el período</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Cuando la liquidación de un operador llegue por un monto distinto al estimado,
            registrala desde Pagos a Operadores con &ldquo;Ajustar por liquidación&rdquo; y la
            diferencia va a aparecer acá.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-px overflow-hidden rounded-xl border border-border/40 bg-border/40 sm:grid-cols-2 lg:grid-cols-4">
            {totals.map((total) => (
              <div key={total.currency} className="bg-background px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Resultado neto en {total.currency}
                </p>
                <p
                  className={`mt-0.5 text-lg font-semibold tabular-nums ${
                    total.net >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                  }`}
                >
                  {money(total.net, total.currency)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {total.count} {total.count === 1 ? "ajuste" : "ajustes"} · ganancias{" "}
                  {money(total.gain, total.currency)} · pérdidas{" "}
                  {money(total.loss, total.currency)}
                </p>
              </div>
            ))}
            {totals.map((total) => (
              <div key={`${total.currency}-split`} className="bg-background px-4 py-3">
                <p className="text-xs text-muted-foreground">Reparto en {total.currency}</p>
                <dl className="mt-1 space-y-0.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Agencia</dt>
                    <dd className="tabular-nums">{money(total.agency, total.currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Vendedores</dt>
                    <dd className="tabular-nums">{money(total.sellers, total.currency)}</dd>
                  </div>
                  {total.referrer !== 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Referidores</dt>
                      <dd className="tabular-nums">{money(total.referrer, total.currency)}</dd>
                    </div>
                  )}
                </dl>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border/40">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Operación</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead className="text-right">Estimado</TableHead>
                  <TableHead className="text-right">Real</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                  <TableHead>Reparto</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {report!.rows.map((row) => (
                  <TableRow key={row.id} className={row.reversedAt ? "opacity-50" : undefined}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(parseDateOnlyLocal(row.accrualDate) ?? new Date(), "dd/MM/yyyy", {
                        locale: es,
                      })}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.operationFileCode || "-"}
                      {row.reversedAt && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Revertido
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{row.operatorName || "-"}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {money(row.estimatedAmount, row.currency)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {money(row.actualAmount, row.currency)}
                    </TableCell>
                    <TableCell
                      className={`text-right text-sm font-medium tabular-nums ${
                        row.resultAmount >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-destructive"
                      }`}
                    >
                      {money(row.resultAmount, row.currency)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      Agencia {money(row.agencyShare, row.currency)}
                      {row.sellerShares.map((share) => (
                        <span key={share.sellerId}>
                          {" · "}
                          {share.sellerName || "Vendedor"} {money(share.amount, row.currency)}
                        </span>
                      ))}
                    </TableCell>
                    <TableCell>
                      {!row.reversedAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleRevert(row.id)}
                          title="Revertir ajuste"
                        >
                          <RotateCcw className="h-4 w-4" />
                          <span className="sr-only">Revertir ajuste</span>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
