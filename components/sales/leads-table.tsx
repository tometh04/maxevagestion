"use client"

import { useState } from "react"
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

const regionColors: Record<string, string> = {
  ARGENTINA: "bg-blue-500",
  CARIBE: "bg-cyan-500",
  BRASIL: "bg-green-500",
  EUROPA: "bg-purple-500",
  EEUU: "bg-red-500",
  OTROS: "bg-gray-500",
  CRUCEROS: "bg-orange-500",
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
  leads: Lead[]
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  onRefresh?: () => void
}

export function LeadsTable({ leads, agencies, sellers, onRefresh }: LeadsTableProps) {
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  const handleConvertClick = (lead: Lead) => {
    setSelectedLead(lead)
    setConvertDialogOpen(true)
  }

  const handleConvertSuccess = () => {
    onRefresh?.()
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contacto</TableHead>
            <TableHead>Destino</TableHead>
            <TableHead>Región</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No hay leads
              </TableCell>
            </TableRow>
          ) : (
            leads.map((lead) => (
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
                    <Link href={`/sales/leads/${lead.id}`}>
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

      {selectedLead && (
        <ConvertLeadDialog
          lead={selectedLead}
          agencies={agencies}
          sellers={sellers}
          open={convertDialogOpen}
          onOpenChange={setConvertDialogOpen}
          onSuccess={handleConvertSuccess}
        />
      )}
    </>
  )
}

