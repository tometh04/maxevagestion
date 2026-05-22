"use client"

import { useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { LeadDetailDialog } from "@/components/sales/lead-detail-dialog"
import { AdvancedTagsSection } from "./advanced-tags-section"

type TagAssignment = {
  tag: {
    id: string
    label: string
    category: { name: string; color: string | null }
  } | null
}

/**
 * Shape completo del lead en modo advanced — incluye TODOS los campos que
 * el LeadDetailDialog (shared con Lozada) requiere para mostrar las acciones
 * completas (cotizar, convertir a operación, editar, archivar, etc.) MÁS las
 * tag_assignments custom del modo advanced.
 *
 * Tipado a propósito laxo (lo cargado en advanced-crm-kanban.tsx con select
 * relacional largo): el LeadDetailDialog hace cast a su propio shape interno.
 */
export type LeadAdvancedFull = {
  id: string
  contact_name: string
  contact_phone: string | null
  contact_email?: string | null
  contact_instagram?: string | null
  destination?: string
  region?: string
  status?: string
  source?: string | null
  trello_url?: string | null
  trello_list_id?: string | null
  trello_full_data?: Record<string, unknown> | null
  assigned_seller_id?: string | null
  agency_id?: string | null
  created_at?: string | null
  updated_at?: string | null
  notes: string | null
  quoted_price?: number | null
  has_deposit?: boolean | null
  deposit_amount?: number | null
  deposit_currency?: string | null
  deposit_method?: string | null
  deposit_date?: string | null
  archived_at?: string | null
  funnel_id: string | null
  agencies?: { name: string } | null
  users?: { name: string; email: string } | null
  assigned_seller: { name: string } | null
  tag_assignments: TagAssignment[]
  operations?: Array<{
    id: string
    file_code?: string
    destination: string
    status: string
    created_at?: string
    departure_date?: string
    sale_amount_total?: number
  }> | null
  customers?: Array<{
    customer: { id: string; first_name: string; last_name: string }
  }> | null
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
  lead: LeadAdvancedFull
  orgId: string
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  operators: Array<{
    id: string
    name: string
    admin_fee_percentage?: number | null
  }>
  /** Callback cuando el user arranca a arrastrar esta card. */
  onDragStart?: () => void
  /** Callback cuando suelta (drop o cancel). */
  onDragEnd?: () => void
  /** True mientras esta card está siendo arrastrada (para feedback visual). */
  isDragging?: boolean
}

export function LeadCardAdvanced({
  lead,
  orgId,
  agencies,
  sellers,
  operators,
  onDragStart,
  onDragEnd,
  isDragging,
}: LeadCardAdvancedProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  // Si el último click fue parte de un drag, NO abrimos el dialog. Usamos un
  // ref porque queremos chequear sincrónicamente en onClick sin re-render.
  const didDragRef = useRef(false)

  const tags = lead.tag_assignments
    .map((ta) => ta.tag)
    .filter((t): t is NonNullable<typeof t> => t !== null)

  // Adapta el lead advanced al shape estricto que espera el LeadDetailDialog
  // (Lozada-style). Campos opcionales que el query no carga se rellenan con
  // defaults sanos para que el tipo coincida.
  const leadForDialog = {
    ...lead,
    contact_phone: lead.contact_phone ?? "",
    contact_email: lead.contact_email ?? null,
    contact_instagram: lead.contact_instagram ?? null,
    destination: lead.destination ?? "A definir",
    region: lead.region ?? "OTROS",
    status: lead.status ?? "NEW",
    source: lead.source ?? "Callbell",
    trello_url: lead.trello_url ?? null,
    trello_list_id: lead.trello_list_id ?? null,
    assigned_seller_id: lead.assigned_seller_id ?? null,
    created_at: lead.created_at ?? new Date().toISOString(),
    // customers no se carga en advanced (no hay FK directa leads ↔ operation_customers).
    // El LeadDetailDialog lo trata como opcional/null.
    customers: null,
  }

  const tagsSection = (
    <AdvancedTagsSection
      orgId={orgId}
      leadId={lead.id}
      currentTags={tags}
      onSaved={() => window.location.reload()}
    />
  )

  return (
    <>
      <Card
        draggable
        onDragStart={(e) => {
          // Marcamos draggable y notificamos al kanban para que registre cuál
          // es el lead arrastrado y pueda hacer el drop.
          e.dataTransfer.effectAllowed = "move"
          // Algunos browsers requieren setData para que el drag funcione
          e.dataTransfer.setData("text/plain", lead.id)
          didDragRef.current = true
          onDragStart?.()
        }}
        onDragEnd={() => {
          onDragEnd?.()
          // Reset del flag después de un tick — onClick se dispara DESPUÉS de
          // onDragEnd y queremos que vea el flag para no abrir el dialog.
          setTimeout(() => {
            didDragRef.current = false
          }, 50)
        }}
        className={cn(
          "p-3 mb-2 cursor-pointer hover:shadow-md transition-shadow duration-150",
          isDragging && "opacity-40"
        )}
        onClick={() => {
          // Si vino de un drag, ignorar el click para no abrir el dialog.
          if (didDragRef.current) return
          setDialogOpen(true)
        }}
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
                className={cn(
                  "text-[10px] px-1.5 py-0 border",
                  getColorClass(tag.category.color ?? "gray")
                )}
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

      {/* Dialog COMPLETO con paridad de Lozada (cotizar, convertir, editar, etc.)
          + sección custom de tags inyectada como tagsSection. */}
      <LeadDetailDialog
        lead={leadForDialog as any}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        agencies={agencies}
        sellers={sellers}
        operators={operators}
        onDelete={() => window.location.reload()}
        onArchive={() => window.location.reload()}
        onConvert={() => window.location.reload()}
        tagsSection={tagsSection}
      />
    </>
  )
}
