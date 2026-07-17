"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  LifeBuoy, RefreshCw, MessageCircle, Building2, Mail,
  Clock, ChevronDown, Bug, Lightbulb, HelpCircle, ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/support/tickets?status=${filter}&category=${categoryFilter}`)
      const data = await res.json()
      setTickets(data.tickets || [])
    } catch {
      setTickets([])
    } finally {
      setLoading(false)
    }
  }, [filter, categoryFilter])

  useEffect(() => {
    fetchTickets()
  }, [fetchTickets])

  const updateStatus = async (ticketId: string, newStatus: string) => {
    try {
      await fetch("/api/admin/support/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticketId, status: newStatus }),
      })
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
      )
    } catch {}
  }

  const counts = {
    all: tickets.length,
    open: tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
  }

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
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-2xl font-bold">{counts.all}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Abiertos</p>
          <p className="text-2xl font-bold text-red-600">{counts.open}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">En progreso</p>
          <p className="text-2xl font-bold text-blue-600">{counts.in_progress}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-sm text-muted-foreground">Filtrar:</span>
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
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asunto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Organización</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="w-[120px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No hay tickets {filter !== "all" ? `con estado "${STATUS_CONFIG[filter]?.label}"` : ""}
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((ticket) => {
                const cfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open
                const catCfg = ticket.category ? CATEGORY_CONFIG[ticket.category] : null
                const CatIcon = catCfg?.icon
                const prioCfg = ticket.priority ? PRIORITY_CONFIG[ticket.priority] : null
                return (
                  <TableRow key={ticket.id} className="cursor-pointer hover:bg-accent/50" onClick={() => router.push(`/admin/tickets/${ticket.id}`)}>
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
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDate(ticket.created_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                            Cambiar
                            <ChevronDown className="h-3 w-3 ml-1" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                            <DropdownMenuItem
                              key={key}
                              disabled={ticket.status === key}
                              onClick={() => updateStatus(ticket.id, key)}
                            >
                              {val.label}
                            </DropdownMenuItem>
                          ))}
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
    </div>
  )
}
