"use client"

import { useMemo } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { MoreHorizontal, FileText, CheckCircle, XCircle, Clock, Send } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { QuotationDetailDialog } from "./quotation-detail-dialog"
import { useState } from "react"

const statusLabels: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  PENDING_APPROVAL: "Pendiente Aprobación",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  EXPIRED: "Expirada",
  CONVERTED: "Convertida",
}

const statusIcons: Record<string, any> = {
  DRAFT: FileText,
  SENT: Send,
  PENDING_APPROVAL: Clock,
  APPROVED: CheckCircle,
  REJECTED: XCircle,
  EXPIRED: Clock,
  CONVERTED: CheckCircle,
}

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-500",
  SENT: "bg-blue-500",
  PENDING_APPROVAL: "bg-yellow-500",
  APPROVED: "bg-amber-500",
  REJECTED: "bg-red-500",
  EXPIRED: "bg-orange-500",
  CONVERTED: "bg-purple-500",
}

interface Quotation {
  id: string
  quotation_number: string
  destination: string
  region: string
  status: string
  total_amount: number
  currency: string
  valid_until: string
  created_at: string
  lead_id: string | null
  agency_id: string
  seller_id: string
  operator_id: string | null
  operation_id: string | null
  leads?: { contact_name: string; destination: string; status: string } | null
  agencies?: { name: string } | null
  sellers?: { name: string; email: string } | null
  operators?: { name: string } | null
  operations?: { destination: string; status: string } | null
}

interface QuotationsTableProps {
  quotations: Quotation[]
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
  onRefresh?: () => void
}

export function QuotationsTable({
  quotations,
  agencies,
  sellers,
  operators,
  onRefresh,
}: QuotationsTableProps) {
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)

  const columns: ColumnDef<Quotation & { searchText: string }>[] = useMemo(
    () => [
      {
        accessorKey: "quotation_number",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Número" />
        ),
        cell: ({ row }) => (
          <div className="font-mono font-medium">{row.original.quotation_number}</div>
        ),
      },
      {
        accessorKey: "destination",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Destino" />
        ),
        cell: ({ row }) => (
          <div className="min-w-[150px]">{row.original.destination}</div>
        ),
      },
      {
        accessorKey: "leads.contact_name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Cliente" />
        ),
        cell: ({ row }) => (
          <div>{row.original.leads?.contact_name || "-"}</div>
        ),
        enableHiding: true,
        className: "hidden md:table-cell",
      },
      {
        accessorKey: "sellers.name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Vendedor" />
        ),
        cell: ({ row }) => (
          <div>{row.original.sellers?.name || "-"}</div>
        ),
        enableHiding: true,
        className: "hidden md:table-cell",
      },
      {
        accessorKey: "total_amount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Total" />
        ),
        cell: ({ row }) => (
          <div className="whitespace-nowrap font-medium">
            {row.original.currency}{" "}
            {row.original.total_amount.toLocaleString("es-AR", {
              minimumFractionDigits: 2,
            })}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Estado" />
        ),
        cell: ({ row }) => {
          const status = row.original.status
          const StatusIcon = statusIcons[status] || FileText
          return (
            <Badge
              variant="outline"
              className={statusColors[status] ? `${statusColors[status]} text-white` : ""}
            >
              <StatusIcon className="mr-1 h-3 w-3" />
              {statusLabels[status] || status}
            </Badge>
          )
        },
      },
      {
        accessorKey: "valid_until",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Válida hasta" />
        ),
        cell: ({ row }) => (
          <div className="text-sm whitespace-nowrap">
            {format(new Date(row.original.valid_until), "dd/MM/yyyy", {
              locale: es,
            })}
          </div>
        ),
        enableHiding: true,
        className: "hidden lg:table-cell",
      },
      {
        accessorKey: "searchText",
        header: () => null,
        cell: () => null,
        enableHiding: true,
        enableSorting: false,
        enableColumnFilter: true,
      },
      {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => {
          const quotation = row.original

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Abrir menú</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedQuotation(quotation)
                    setDetailDialogOpen(true)
                  }}
                >
                  Ver detalles
                </DropdownMenuItem>
                {quotation.status === "APPROVED" && !quotation.operation_id && (
                  <DropdownMenuItem
                    onClick={async () => {
                      // Convertir a operación
                      const response = await fetch(
                        `/api/quotations/${quotation.id}/convert`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({}),
                        }
                      )
                      if (response.ok) {
                        onRefresh?.()
                      }
                    }}
                  >
                    Convertir a operación
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [onRefresh]
  )

  return (
    <>
      <DataTable
        columns={columns}
        data={quotations.map((q) => ({
          ...q,
          searchText: `${q.quotation_number} ${q.destination} ${q.leads?.contact_name || ""} ${q.sellers?.name || ""} ${q.status}`.toLowerCase(),
        })) as (Quotation & { searchText: string })[]}
        searchKey="searchText"
        searchPlaceholder="Buscar por número, destino, cliente, vendedor o estado..."
      />

      {selectedQuotation && (
        <QuotationDetailDialog
          quotation={selectedQuotation}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          onRefresh={onRefresh}
          agencies={agencies}
          sellers={sellers}
          operators={operators}
        />
      )}
    </>
  )
}

