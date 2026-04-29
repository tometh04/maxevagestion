"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { ConvertLeadDialog } from "./convert-lead-dialog"
import { ServerPagination } from "@/components/ui/server-pagination"
import { useSortableData, SortableTableHead } from "@/components/ui/sortable-header"

const regionColors: Record<string, string> = {
  ARGENTINA: "bg-info",
  CARIBE: "bg-cyan-500",
  BRASIL: "bg-success",
  EUROPA: "bg-purple-500",
  EEUU: "bg-destructive",
  OTROS: "bg-gray-500",
  CRUCEROS: "bg-primary",
}

const statusLabels: Record<string, string> = {
  NEW: "Nuevo",
  IN_PROGRESS: "En Progreso",
  QUOTED: "Cotizado",
  WON: "Ganado",
  LOST: "Perdido",
}

interface Lead {
  id: string
  agency_id: string
  contact_name: string
  contact_phone: string
  contact_email: string | null
  destination: string
  region: string
  status: string
  trello_url: string | null
  created_at: string
  assigned_seller_id: string | null
  users?: { name: string; email: string } | null
  agencies?: { name: string } | null
}

interface LeadsTableProps {
  leads?: Lead[]
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
  onRefresh?: () => void
  agencyId?: string
  sellerId?: string
}

export function LeadsTable({
  leads: initialLeads,
  agencies,
  sellers,
  operators,
  onRefresh,
  agencyId,
  sellerId,
}: LeadsTableProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads || [])
  const [loading, setLoading] = useState(!initialLeads)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  // Estado de paginación server-side
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const useServerPagination = !initialLeads

  const { sortedData, sortConfig, requestSort } = useSortableData(leads, {
    key: "created_at",
    direction: "desc",
  })

  const fetchLeads = useCallback(async () => {
    if (!useServerPagination) return

    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (agencyId && agencyId !== "ALL") params.append("agencyId", agencyId)
      if (sellerId && sellerId !== "ALL") params.append("sellerId", sellerId)
      params.append("page", page.toString())
      params.append("limit", limit.toString())

      const response = await fetch(`/api/leads?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setLeads(data.leads || [])
        const pagination = data.pagination || {}
        setTotal(pagination.total || 0)
        setTotalPages(pagination.totalPages || 0)
        setHasMore(pagination.hasMore || false)
      }
    } catch (error) {
      console.error("Error fetching leads:", error)
    } finally {
      setLoading(false)
    }
  }, [useServerPagination, agencyId, sellerId, page, limit])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  useEffect(() => {
    if (initialLeads) {
      setLeads(initialLeads)
    }
  }, [initialLeads])

  const handleConvertClick = (lead: Lead) => {
    setSelectedLead(lead)
    setConvertDialogOpen(true)
  }

  const handleConvertSuccess = () => {
    onRefresh?.()
    if (useServerPagination) {
      fetchLeads()
    }
  }

  if (loading && useServerPagination) {
    return (
      <div className="rounded-md border">
        <div className="p-4">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-md border">
        <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="contact_name" sortConfig={sortConfig} onSort={requestSort}>
              Contacto
            </SortableTableHead>
            <SortableTableHead sortKey="destination" sortConfig={sortConfig} onSort={requestSort}>
              Destino
            </SortableTableHead>
            <SortableTableHead sortKey="region" sortConfig={sortConfig} onSort={requestSort}>
              Región
            </SortableTableHead>
            <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={requestSort}>
              Estado
            </SortableTableHead>
            <SortableTableHead sortKey="users.name" sortConfig={sortConfig} onSort={requestSort}>
              Vendedor
            </SortableTableHead>
            <SortableTableHead sortKey="created_at" sortConfig={sortConfig} onSort={requestSort}>
              Fecha
            </SortableTableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No hay leads
              </TableCell>
            </TableRow>
          ) : (
            sortedData.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{lead.contact_name}</div>
                    <div className="text-sm text-muted-foreground">{lead.contact_phone}</div>
                    {lead.contact_email && (
                      <div className="text-sm text-muted-foreground">{lead.contact_email}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell>{lead.destination}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={regionColors[lead.region] ? `${regionColors[lead.region]} text-white` : ""}
                  >
                    {lead.region}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{statusLabels[lead.status] || lead.status}</Badge>
                </TableCell>
                <TableCell>{lead.users?.name || "-"}</TableCell>
                <TableCell>
                  {format(new Date(lead.created_at), "dd/MM/yyyy", { locale: es })}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Link href={`/sales/leads?leadId=${lead.id}`}>
                      <Button variant="ghost" size="sm">
                        Ver
                      </Button>
                    </Link>
                    {lead.status !== "WON" && lead.status !== "LOST" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleConvertClick(lead)}
                      >
                        Convertir
                      </Button>
                    )}
                    {lead.trello_url && (
                      <a
                        href={lead.trello_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        </Table>
        </div>

        {useServerPagination && total > 0 && (
          <ServerPagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            hasMore={hasMore}
            onPageChange={setPage}
            onLimitChange={(newLimit) => {
              setLimit(newLimit)
              setPage(1)
            }}
            limitOptions={[25, 50, 100, 200]}
          />
        )}
      </div>

      {selectedLead && (
        <ConvertLeadDialog
          lead={selectedLead}
          agencies={agencies}
          sellers={sellers}
          operators={operators}
          open={convertDialogOpen}
          onOpenChange={setConvertDialogOpen}
          onSuccess={handleConvertSuccess}
        />
      )}
    </>
  )
}
