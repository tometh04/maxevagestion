"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ExternalLink, DollarSign } from "lucide-react"
import Link from "next/link"
import { LeadDetailDialog } from "@/components/sales/lead-detail-dialog"

const statusColumns = [
  { id: "NEW", label: "Nuevo", color: "bg-orange-50 dark:bg-orange-950/30" },
  { id: "IN_PROGRESS", label: "En Progreso", color: "bg-orange-100 dark:bg-orange-900/30" },
  { id: "QUOTED", label: "Cotizado", color: "bg-amber-100 dark:bg-amber-900/30" },
  { id: "WON", label: "Ganado", color: "bg-green-100 dark:bg-green-900/30" },
  { id: "LOST", label: "Perdido", color: "bg-red-100 dark:bg-red-900/30" },
]

const regionColors: Record<string, string> = {
  ARGENTINA: "bg-blue-500",
  CARIBE: "bg-cyan-500",
  BRASIL: "bg-green-500",
  EUROPA: "bg-purple-500",
  EEUU: "bg-red-500",
  OTROS: "bg-gray-500",
  CRUCEROS: "bg-orange-500",
}

interface Lead {
  id: string
  contact_name: string
  contact_phone: string
  contact_email: string | null
  contact_instagram: string | null
  destination: string
  region: string
  status: string
  source: string
  trello_url: string | null
  trello_list_id?: string | null
  created_at?: string
  notes?: string | null
  assigned_seller_id: string | null
  has_deposit?: boolean
  deposit_amount?: number | null
  deposit_currency?: string | null
  users?: { name: string; email: string } | null
  agencies?: { name: string } | null
}

interface LeadsKanbanProps {
  leads: Lead[]
  agencies?: Array<{ id: string; name: string }>
  sellers?: Array<{ id: string; name: string }>
  onRefresh?: () => void
}

export function LeadsKanban({ leads, agencies = [], sellers = [], onRefresh }: LeadsKanbanProps) {
  const [draggedLead, setDraggedLead] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const leadsByStatus = statusColumns.reduce((acc, col) => {
    acc[col.id] = leads.filter((lead) => lead.status === col.id)
    return acc
  }, {} as Record<string, Lead[]>)

  const handleDragStart = (leadId: string) => {
    setDraggedLead(leadId)
  }

  const handleDrop = async (newStatus: string) => {
    if (!draggedLead) return

    try {
      await fetch("/api/leads/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: draggedLead, status: newStatus }),
      })
      window.location.reload()
    } catch (error) {
      console.error("Error updating status:", error)
    } finally {
      setDraggedLead(null)
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {statusColumns.map((column) => (
        <div key={column.id} className="flex min-w-[280px] flex-col">
          <div className={`rounded-t-lg p-3 ${column.color}`}>
            <h3 className="font-semibold">{column.label}</h3>
            <span className="text-sm text-muted-foreground">
              {leadsByStatus[column.id]?.length || 0}
            </span>
          </div>
          <ScrollArea className="h-[calc(100vh-250px)] rounded-b-lg border bg-muted/30">
            <div
              className="p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                handleDrop(column.id)
              }}
            >
              {leadsByStatus[column.id]?.map((lead) => (
                <Card
                  key={lead.id}
                  className="mb-2 cursor-move"
                  draggable
                  onDragStart={() => handleDragStart(lead.id)}
                >
                  <CardContent 
                    className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      if (!draggedLead) {
                        setSelectedLead(lead)
                        setDialogOpen(true)
                      }
                    }}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <span className="font-medium hover:underline">
                          {lead.contact_name}
                        </span>
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
                      <p className="text-sm text-muted-foreground">{lead.destination}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={regionColors[lead.region] ? `${regionColors[lead.region]} text-white border-0` : ""}
                        >
                          {lead.region}
                        </Badge>
                        {lead.has_deposit && lead.deposit_amount && (
                          <Badge variant="outline" className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/50">
                            <DollarSign className="h-3 w-3 mr-1" />
                            {lead.deposit_amount} {lead.deposit_currency || "ARS"}
                          </Badge>
                        )}
                      </div>
                      {lead.users && (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {lead.users.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .toUpperCase()
                                .slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-muted-foreground">{lead.users.name}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      ))}

      {selectedLead && (
        <LeadDetailDialog
          lead={selectedLead as any}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          agencies={agencies}
          sellers={sellers}
          onDelete={onRefresh}
          onConvert={onRefresh}
        />
      )}
    </div>
  )
}

