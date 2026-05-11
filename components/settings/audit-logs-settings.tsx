"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  RefreshCw,
  Clock,
  User,
  FileText,
  Loader2,
  X,
  Info,
} from "lucide-react"
import { toast } from "sonner"

interface AuditLog {
  id: string
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  details: Record<string, any>
  ip_address: string | null
  created_at: string
  users?: {
    id: string
    name: string
    email: string
  } | null
}

interface Filters {
  actions: string[]
  entityTypes: string[]
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  PAYMENT_MARKED_PAID: { label: "Pago realizado", color: "bg-success/10 text-success dark:bg-success dark:text-success" },
  OPERATION_DELETED: { label: "Operación eliminada", color: "bg-destructive/10 text-destructive dark:bg-destructive dark:text-destructive" },
  USER_ACTIVATED: { label: "Usuario activado", color: "bg-primary/10 text-primary dark:bg-primary dark:text-primary" },
  USER_DEACTIVATED: { label: "Usuario desactivado", color: "bg-accent-coral/10 text-accent-coral dark:bg-accent-coral dark:text-accent-coral" },
  USER_ROLE_CHANGED: { label: "Rol cambiado", color: "bg-accent-violet/10 text-accent-violet dark:bg-accent-violet dark:text-accent-violet" },
  LOGIN: { label: "Inicio de sesión", color: "bg-muted text-foreground dark:bg-card dark:text-muted-foreground" },
  LOGOUT: { label: "Cierre de sesión", color: "bg-muted text-foreground dark:bg-card dark:text-muted-foreground" },
}

const ENTITY_LABELS: Record<string, string> = {
  payment: "Pago",
  operation: "Operación",
  user: "Usuario",
  customer: "Cliente",
  lead: "Lead",
  commission: "Comisión",
}

function getActionInfo(action: string) {
  return ACTION_LABELS[action] || { label: action, color: "bg-muted text-foreground dark:bg-card dark:text-muted-foreground" }
}

function formatDetails(details: Record<string, any>): string[] {
  if (!details || Object.keys(details).length === 0) return []

  const lines: string[] = []
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined) continue
    const label = key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase())
    if (typeof value === "number") {
      lines.push(`${label}: ${value.toLocaleString("es-AR")}`)
    } else {
      lines.push(`${label}: ${String(value)}`)
    }
  }
  return lines
}

export function AuditLogsSettings() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState<Filters>({ actions: [], entityTypes: [] })

  // Filter state
  const [searchQuery, setSearchQuery] = useState("")
  const [actionFilter, setActionFilter] = useState<string>("ALL")
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("ALL")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("limit", "30")

      if (searchQuery) params.set("search", searchQuery)
      if (actionFilter && actionFilter !== "ALL") params.set("action", actionFilter)
      if (entityTypeFilter && entityTypeFilter !== "ALL") params.set("entity_type", entityTypeFilter)
      if (dateFrom) params.set("date_from", dateFrom)
      if (dateTo) params.set("date_to", dateTo)

      const response = await fetch(`/api/audit-logs?${params.toString()}`)
      if (!response.ok) throw new Error("Error al cargar logs")

      const data = await response.json()

      if (data.tableNotFound) {
        setLogs([])
        setTotal(0)
        setTotalPages(0)
        return
      }

      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 0)
      if (data.filters) {
        setFilters(data.filters)
      }
    } catch (error) {
      console.error("Error fetching audit logs:", error)
      toast.error("Error al cargar los logs de auditoría")
    } finally {
      setLoading(false)
    }
  }, [page, searchQuery, actionFilter, entityTypeFilter, dateFrom, dateTo])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleSearch = () => {
    setPage(1)
    fetchLogs()
  }

  const clearFilters = () => {
    setSearchQuery("")
    setActionFilter("ALL")
    setEntityTypeFilter("ALL")
    setDateFrom("")
    setDateTo("")
    setPage(1)
  }

  const hasActiveFilters = searchQuery || actionFilter !== "ALL" || entityTypeFilter !== "ALL" || dateFrom || dateTo

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Logs de Auditoría</h2>
        <p className="text-sm text-muted-foreground">
          Registro de todas las acciones críticas realizadas en el sistema.
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            {/* Búsqueda */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Buscar</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar en acciones..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-9 h-9"
                />
              </div>
            </div>

            {/* Acción */}
            <div className="min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Acción</label>
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1) }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas las acciones</SelectItem>
                  {filters.actions.map((action) => (
                    <SelectItem key={action} value={action}>
                      {getActionInfo(action).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Entidad */}
            <div className="min-w-[150px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Entidad</label>
              <Select value={entityTypeFilter} onValueChange={(v) => { setEntityTypeFilter(v); setPage(1) }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  {filters.entityTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {ENTITY_LABELS[type] || type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fecha desde */}
            <div className="min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Desde</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
                className="h-9"
              />
            </div>

            {/* Fecha hasta */}
            <div className="min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Hasta</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
                className="h-9"
              />
            </div>

            {/* Acciones */}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={fetchLogs} className="h-9">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              {hasActiveFilters && (
                <Button size="sm" variant="ghost" onClick={clearFilters} className="h-9">
                  <X className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {total > 0 ? `${total} registros encontrados` : "Sin registros"}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="h-8 w-8 mb-2" />
              <p className="text-sm">No hay logs de auditoría</p>
              {hasActiveFilters && (
                <p className="text-xs mt-1">Intenta ajustar los filtros</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Fecha</TableHead>
                  <TableHead className="w-[160px]">Usuario</TableHead>
                  <TableHead className="w-[180px]">Acción</TableHead>
                  <TableHead className="w-[100px]">Entidad</TableHead>
                  <TableHead>Detalles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const actionInfo = getActionInfo(log.action)
                  const details = formatDetails(log.details || {})

                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          {new Date(log.created_at).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                          })}{" "}
                          {new Date(log.created_at).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm truncate max-w-[130px]">
                            {log.users?.name || log.users?.email || "Sistema"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[11px] ${actionInfo.color}`}>
                          {actionInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {log.entity_type ? (ENTITY_LABELS[log.entity_type] || log.entity_type) : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {details.length > 0 ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                                <Info className="h-3 w-3 mr-1" />
                                Ver detalles
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-3" align="end">
                              <div className="space-y-1.5">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                  Detalles de la acción
                                </p>
                                {log.entity_id && (
                                  <p className="text-xs text-muted-foreground">
                                    ID: <code className="bg-muted px-1 rounded text-[10px]">{log.entity_id.slice(0, 8)}...</code>
                                  </p>
                                )}
                                {details.map((line, i) => (
                                  <p key={i} className="text-xs">{line}</p>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="h-7 px-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="h-7 px-2"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
