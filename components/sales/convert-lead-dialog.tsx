"use client"

import { NewOperationDialog } from "@/components/operations/new-operation-dialog"

interface LeadData {
    id: string
  contact_name?: string | null
    contact_email?: string | null
    contact_phone?: string | null
  destination?: string | null
  agency_id?: string | null
  assigned_seller_id?: string | null
    notes?: string | null
  status?: string | null
  }

interface ConvertLeadDialogProps {
  lead: LeadData
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

/**
 * Componente que envuelve NewOperationDialog para convertir un lead a operación.
 * Usa exactamente el mismo formulario completo con todas las features (OCR, múltiples operadores, etc.).
 */
export function ConvertLeadDialog({
  lead,
  agencies,
  sellers,
  operators,
  open,
  onOpenChange,
  onSuccess,
}: ConvertLeadDialogProps) {
  return (
    <NewOperationDialog
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      agencies={agencies}
      sellers={sellers}
      operators={operators}
      lead={{
        id: lead.id,
        contact_name: lead.contact_name,
        contact_email: lead.contact_email,
        contact_phone: lead.contact_phone,
        destination: lead.destination,
        agency_id: lead.agency_id,
        assigned_seller_id: lead.assigned_seller_id,
        notes: lead.notes,
      }}
    />
  )
}