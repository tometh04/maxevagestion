"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
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
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  FileText,
  RefreshCw,
} from "lucide-react"
import { CreateJournalEntryDialog } from "./create-journal-entry-dialog"

interface JournalEntry {
  id: string
  entry_number: number
  entry_date: string
  description: string
  source: string
  total_amount: number
  currency: string
  notes: string | null
  created_at: string
  users?: { id: string; name: string } | null
}

interface JournalEntryLine {
  id: string
  concept: string
  debit_amount: number | null
  credit_amount: number | null
  chart_account?: {
    account_code: string
    account_name: string
    category: string
  } | null
}

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  AUTO_PAYMENT: "Pago",
  AUTO_CONFIRMATION: "Confirmación",
  AUTO_COMMISSION: "Comisión",
  AUTO_FX: "Tipo de Cambio",
}

const SOURCE_COLORS: Record<string, string> = {
  MANUAL: "bg-blue-100 text-blue-800",
  AUTO_PAYMENT: "bg-green-100 text-green-800",
  AUTO_CONFIRMATION: "bg-purple-100 text-purple-800",
  AUTO_COMMISSION: "bg-amber-100 text-amber-800",
  AUTO_FX: "bg-cyan-100 text-cyan-800",
}

function formatCurrency(amount: number, currency: string = "ARS"): string {
  if (currency === "USD") {
    return `US$ ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `$ ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00")
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function JournalEntriesPageClient() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedLines, setExpandedLines] = useState<JournalEntryLine[]>([])
  const [loadingLines, setLoadingLines] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // Filters
  const [search, setSearch] = useState("")
  const [sourceFilter, setSourceFilter] = useState<string>("ALL")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      if (sourceFilter !== "ALL") params.set("source", sourceFilter)
      if (dateFrom) params.set("dateFrom", dateFrom)
      if (dateTo) params.set("dateTo", dateTo)
      params.set("limit", "50")

      const res = await fetch(`/api/accounting/journal-entries?${params}`)
      if (!res.ok) throw new Error("Error fetching journal entries")
      const data = await res.json()
      setEntries(data.entries || [])
      setTotal(data.total || 0)
    } catch (error) {
      console.error("Error loading journal entries:", error)
    } finally {
      setLoading(false)
    }
  }, [search, sourceFilter, dateFrom, dateTo])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const toggleExpand = async (entryId: string) => {
    if (expandedId === entryId) {
      setExpandedId(null)
      setExpandedLines([])
      return
    }

    setExpandedId(entryId)
    setLoadingLines(true)
    try {
      const res = await fetch(`/api/accounting/journal-entries/${entryId}`)
      if (!res.ok) throw new Error("Error fetching entry lines")
      const data = await res.json()
      setExpandedLines(data.lines || [])
    } catch (error) {
      console.error("Error loading entry lines:", error)
      setExpandedLines([])
    } finally {
      setLoadingLines(false)
    }
  }

  const handleCreated = () => {
    setShowCreateDialog(false)
    fetchEntries()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Asientos Contables</h2>
          <p className="text-sm text-muted-foreground">
            Registro de asientos con partida doble (Debe / Haber)
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nuevo Asiento
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descripción..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Origen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="MANUAL">Manual</SelectItem>
            <SelectItem value="AUTO_PAYMENT">Pago</SelectItem>
            <SelectItem value="AUTO_CONFIRMATION">Confirmación</SelectItem>
            <SelectItem value="AUTO_COMMISSION">Comisión</SelectItem>
            <SelectItem value="AUTO_FX">Tipo de Cambio</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-[150px]"
          placeholder="Desde"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-[150px]"
          placeholder="Hasta"
        />
        <Button variant="outline" size="icon" onClick={fetchEntries}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/40">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]" />
              <TableHead className="w-[80px]">Nro</TableHead>
              <TableHead className="w-[100px]">Fecha</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-[100px]">Origen</TableHead>
              <TableHead className="w-[120px] text-right">Total</TableHead>
              <TableHead className="w-[120px]">Creado por</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-10 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground">No hay asientos contables</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Creá un asiento manual o los asientos se generarán automáticamente al registrar pagos
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <>
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <TableCell>
                      {expandedId === entry.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      #{entry.entry_number}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(entry.entry_date)}
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {entry.description}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS[entry.source] || "bg-gray-100 text-gray-800"}`}
                      >
                        {SOURCE_LABELS[entry.source] || entry.source}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(entry.total_amount, entry.currency)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(entry.users as any)?.name || "—"}
                    </TableCell>
                  </TableRow>
                  {expandedId === entry.id && (
                    <TableRow key={`${entry.id}-lines`}>
                      <TableCell colSpan={7} className="bg-muted/30 p-0">
                        <div className="px-6 py-4">
                          {loadingLines ? (
                            <div className="space-y-2">
                              <Skeleton className="h-8 w-full" />
                              <Skeleton className="h-8 w-full" />
                            </div>
                          ) : expandedLines.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              Sin líneas de detalle
                            </p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                                    Cuenta
                                  </th>
                                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                                    Concepto
                                  </th>
                                  <th className="text-right py-2 px-3 font-medium text-muted-foreground w-[130px]">
                                    Debe
                                  </th>
                                  <th className="text-right py-2 px-3 font-medium text-muted-foreground w-[130px]">
                                    Haber
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedLines.map((line) => (
                                  <tr key={line.id} className="border-b border-border/30">
                                    <td className="py-2 px-3 font-mono text-xs">
                                      {line.chart_account ? (
                                        <span>
                                          <span className="text-muted-foreground">
                                            {line.chart_account.account_code}
                                          </span>{" "}
                                          {line.chart_account.account_name}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3">{line.concept}</td>
                                    <td className="py-2 px-3 text-right font-mono">
                                      {line.debit_amount
                                        ? formatCurrency(line.debit_amount, entry.currency)
                                        : ""}
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono">
                                      {line.credit_amount
                                        ? formatCurrency(line.credit_amount, entry.currency)
                                        : ""}
                                    </td>
                                  </tr>
                                ))}
                                {/* Totals row */}
                                <tr className="font-semibold bg-muted/50">
                                  <td className="py-2 px-3" colSpan={2}>
                                    TOTALES
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono">
                                    {formatCurrency(
                                      expandedLines.reduce(
                                        (sum, l) => sum + (l.debit_amount || 0),
                                        0
                                      ),
                                      entry.currency
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono">
                                    {formatCurrency(
                                      expandedLines.reduce(
                                        (sum, l) => sum + (l.credit_amount || 0),
                                        0
                                      ),
                                      entry.currency
                                    )}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                          {entry.notes && (
                            <p className="text-xs text-muted-foreground mt-3 italic">
                              {entry.notes}
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>

        {!loading && total > 0 && (
          <div className="px-4 py-3 border-t text-sm text-muted-foreground">
            Mostrando {entries.length} de {total} asientos
          </div>
        )}
      </div>

      <CreateJournalEntryDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={handleCreated}
      />
    </div>
  )
}
