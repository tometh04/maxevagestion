"use client"

import { useRouter } from "next/navigation"
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
 * Redirige automáticamente a la operación creada después de la conversión.
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
  const router = useRouter()

  const handleSuccess = (operationId?: string) => {
    // Llamar al callback original
    onSuccess()
    
    // Si hay un ID de operación, redirigir a la página de la operación
    if (operationId) {
      router.push(`/operations/${operationId}`)
    }
  }

  return (
    <NewOperationDialog
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={handleSuccess}
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