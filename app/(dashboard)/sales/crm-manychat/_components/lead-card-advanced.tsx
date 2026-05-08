"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { TagAssignmentDialog } from "./tag-assignment-dialog"

type TagAssignment = {
  tag: {
    id: string
    label: string
    category: { name: string; color: string }
  } | null
}

type LeadAdvanced = {
  id: string
  contact_name: string
  contact_phone: string | null
  notes: string | null
  funnel_id: string | null
  assigned_seller: { name: string } | null
  tag_assignments: TagAssignment[]
}

const COLOR_MAP: Record<string, string> = {
  red: "bg-red-100 text-red-800 border-red-300",
  green: "bg-green-100 text-green-800 border-green-300",
  purple: "bg-purple-100 text-purple-800 border-purple-300",
  orange: "bg-orange-100 text-orange-800 border-orange-300",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-300",
  blue: "bg-blue-100 text-blue-800 border-blue-300",
  gray: "bg-gray-100 text-gray-800 border-gray-300",
}

function getColorClass(color: string): string {
  return COLOR_MAP[color] ?? COLOR_MAP.gray
}

interface LeadCardAdvancedProps {
  lead: LeadAdvanced
  orgId: string
}

export function LeadCardAdvanced({ lead, orgId }: LeadCardAdvancedProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const tags = lead.tag_assignments
    .map((ta) => ta.tag)
    .filter((t): t is NonNullable<typeof t> => t !== null)

  return (
    <>
      <Card
        className={cn("p-3 mb-2 cursor-pointer hover:shadow-md transition-shadow duration-150")}
        onClick={() => setDialogOpen(true)}
      >
        <p className="font-medium text-sm leading-tight">{lead.contact_name}</p>
        {lead.contact_phone && (
          <p className="text-xs text-muted-foreground mt-0.5">{lead.contact_phone}</p>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className={cn("text-[10px] px-1.5 py-0 border", getColorClass(tag.category.color))}
              >
                {tag.label}
              </Badge>
            ))}
          </div>
        )}
        {lead.assigned_seller && (
          <p className="text-[10px] text-muted-foreground mt-1.5">
            → {lead.assigned_seller.name}
          </p>
        )}
      </Card>
      <TagAssignmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        orgId={orgId}
        leadId={lead.id}
        onSaved={() => window.location.reload()}
      />
    </>
  )
}
