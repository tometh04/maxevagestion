"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  LifeBuoy, RefreshCw, MessageCircle, Building2, Mail,
  Clock, ChevronDown, Bug, Lightbulb, HelpCircle, ExternalLink,
  Search, Trash2, X, AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface Ticket {
  id: string
  subject: string
  description: string
  status: string
  created_at: string
  updated_at: string
  user_email: string
  org_name: string | null
  conversation_id: string | null
  category: string | null
  severity: string | null
  priority: string | null
  linear_issue_url: string | null
  linear_identifier: string | null
}

interface Counts {
  total: number
  open: number
  in_progress: number
  urgent: number
}

interface OrgOption {
  id: string
  name: string
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "Abierto", variant: "destructive" },
  in_progress: { label: "En progreso", variant: "default" },
  resolved: { label: "Resuelto", variant: "secondary" },
  closed: { label: "Cerrado", variant: "outline" },
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Bug }> = {
  bug: { label: "Bug", icon: Bug },
  improvement: { label: "Mejora", icon: Lightbulb },
  question: { label: "Consulta", icon: HelpCircle },
}

const PRIORITY_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  urgent: { label: "Urgente", variant: "destructive" },
  high: { label: "Alta", variant: "default", className: "bg-orange-500 hover:bg-orange-500" },
  normal: { label: "Normal", variant: "secondary" },
  low: { label: "Baja", variant: "outline" },
}

const SEVERITY_LABELS: Record<string, string> = {
  low: "Baja", medium: "Media", high: "Alta", critical: "Crítica",
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function AdminTicketsPage() {
  const router = useRouter()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [counts, setCounts] = useState<Counts>({ total: 0, open: 0, in_progress: 0, urgent: 0 })
  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [filter, setFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [orgFilter, setOrgFilter] = useState("all")
  const [includeClosed, setIncludeClosed] = useState(false)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // Selección múltiple + borrado
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null)
  const [working, setWorking] = useState(false)

  // Debounce de la búsqueda para no pegarle a la API en cada tecla
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        status: filter,
        category: categoryFilter,
        priority: priorityFilter,
        org: orgFilter,
        includeClosed: String(includeClosed),
      })
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim())

      const res = await fetch(`/api/admin/support/tickets?${params.toString()}`)
      const data = await res.json()
      setTickets(data.tickets || [])
      if (data.counts) setCounts(data.counts)
      if (data.orgs) setOrgs(data.orgs)
    } catch {
      setTickets([])
    } finally {
      setLoading(false)
    }
  }, [filter, categoryFilter, priorityFilter, orgFilter, includeClosed, debouncedSearch])

  useEffect(() => {
    fetchTickets()
  }, [fetchTickets])

  // Al cambiar el listado, descartar selecciones de tickets que ya no están visibles
  useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(tickets.map((t) => t.id))
      const next = new Set(Array.from(prev).filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [tickets])

  const updateStatus = async (ticketIds: string[], newStatus: string) => {
    setWorking(true)
    try {
      await fetch("/api/admin/support/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ticketIds, status: newStatus }),
      })
      await fetchTickets()
      setSelected(new Set())
    } catch {}
    setWorking(false)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setWorking(true)
    try {
      await fetch("/api/admin/support/tickets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: deleteTarget.ids }),
      })
      await fetchTickets()
      setSelected(new Set())
    } catch {}
    setWorking(false)
    setDeleteTarget(null)
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allVisibleSelected = tickets.length > 0 && tickets.every((t) => selected.has(t.id))
  const toggleAll = () => {
    setSelected(allVisibleSelected ? new Set() : new Set(tickets.map((t) => t.id)))
  }

  const resetFilters = () => {
    setFilter("all")
    setCategoryFilter("all")
    setPriorityFilter("all")
    setOrgFilter("all")
    setSearch("")
    setIncludeClosed(false)
  }

  const hasActiveFilters =
    filter !== "all" || categoryFilter !== "all" || priorityFilter !== "all" ||
    orgFilter !== "all" || search.trim() !== "" || includeClosed

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <LifeBuoy className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Tickets de Soporte</h1>
            <p className="text-sm text-muted-foreground">
              Tickets enviados por usuarios de todas las organizaciones
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTickets} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-2xl font-bold">{counts.total}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Abiertos</p>
          <p className="text-2xl font-bold text-red-600">{counts.open}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">En progreso</p>
          <p className="text-2xl font-bold text-blue-600">{counts.in_progress}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Urgentes activos</p>
          <p className="text-2xl font-bold text-orange-600">{counts.urgent}</p>
        </div>
      </div>

      {/* Búsqueda + filtros */}
      <div className="space-y-3 mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por asunto, descripción o email..."
            className="pl-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="open">Abiertos</SelectItem>
              <SelectItem value="in_progress">En progreso</SelectItem>
              <SelectItem value="resolved">Resueltos</SelectItem>
              <SelectItem value="closed">Cerrados</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="bug">Bugs</SelectItem>
              <SelectItem value="improvement">Mejoras</SelectItem>
              <SelectItem value="question">Consultas</SelectItem>
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las prioridades</SelectItem>
              <SelectItem value="urgent">Urgente</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Baja</SelectItem>
            </SelectContent>
          </Select>

          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las agencias</SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={includeClosed}
              onCheckedChange={(v) => setIncludeClosed(v === true)}
            />
            Mostrar cerrados
          </label>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-3.5 w-3.5 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Barra de acciones masivas */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 border rounded-lg bg-accent/40">
          <span className="text-sm font-medium">
            {selected.size} {selected.size === 1 ? "seleccionado" : "seleccionados"}
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            disabled={working}
            onClick={() => updateStatus(Array.from(selected), "closed")}
          >
            Cerrar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={working}
            onClick={() =>
              setDeleteTarget({
                ids: Array.from(selected),
                label: `${selected.size} ticket${selected.size === 1 ? "" : "s"}`,
              })
            }
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Borrar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Cancelar
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Seleccionar todos"
                />
              </TableHead>
              <TableHead>Asunto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Agencia</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="w-[120px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  {hasActiveFilters
                    ? "No hay tickets que coincidan con los filtros"
                    : "No hay tickets"}
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((ticket) => {
                const cfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open
                const catCfg = ticket.category ? CATEGORY_CONFIG[ticket.category] : null
                const CatIcon = catCfg?.icon
                const prioCfg = ticket.priority ? PRIORITY_CONFIG[ticket.priority] : null
                const isSelected = selected.has(ticket.id)
                return (
                  <TableRow
                    key={ticket.id}
                    data-state={isSelected ? "selected" : undefined}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => router.push(`/admin/tickets/${ticket.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(ticket.id)}
                        aria-label="Seleccionar ticket"
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{ticket.subject}</p>
                        {ticket.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {ticket.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {ticket.conversation_id && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-primary">
                              <MessageCircle className="h-3 w-3" />
                              Con conversación IA
                            </span>
                          )}
                          {ticket.linear_issue_url && (
                            <a
                              href={ticket.linear_issue_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {ticket.linear_identifier || "Ver en Linear"}
                            </a>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {catCfg && CatIcon ? (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <CatIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          {catCfg.label}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {prioCfg ? (
                        <Badge variant={prioCfg.variant} className={prioCfg.className}>
                          {prioCfg.label}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {ticket.severity && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Sev: {SEVERITY_LABELS[ticket.severity] || ticket.severity}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate max-w-[180px]">{ticket.user_email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {ticket.org_name ? (
                        <div className="flex items-center gap-1.5 text-sm">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {ticket.org_name}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={cfg.variant} className="whitespace-nowrap">{cfg.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                        <Clock className="h-3 w-3" />
                        {formatDate(ticket.created_at)}
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                            Acciones
                            <ChevronDown className="h-3 w-3 ml-1" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                            <DropdownMenuItem
                              key={key}
                              disabled={ticket.status === key}
                              onClick={() => updateStatus([ticket.id], key)}
                            >
                              {val.label}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() =>
                              setDeleteTarget({ ids: [ticket.id], label: `"${ticket.subject}"` })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Borrar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Confirmación de borrado */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Borrar {deleteTarget?.label}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Se va a borrar {deleteTarget?.ids.length === 1 ? "el ticket" : "los tickets"} junto
                  con todas sus respuestas. Esta acción no se puede deshacer.
                </p>
                <p className="text-xs">
                  El issue vinculado en Linear <strong>no se toca</strong>: queda activo para el
                  equipo de desarrollo.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              disabled={working}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {working ? "Borrando..." : "Borrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
