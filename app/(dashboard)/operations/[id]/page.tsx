import { getCurrentUser, getUserAgencies } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { OperationDetailClient } from "@/components/operations/operation-detail-client"

export default async function OperationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  // Get operation with related data
  const { data: operation, error: operationError } = await supabase
    .from("operations")
    .select(`
      *,
      sellers:seller_id(id, name, email),
      operators:operator_id(id, name, contact_email, contact_phone),
      agencies:agency_id(id, name, city),
      leads:lead_id(id, contact_name, destination, status)
    `)
    .eq("id", id)
    .single()

  if (operationError || !operation) {
    notFound()
  }

  // Type assertion for operation
  const op = operation as any

  // Check permissions
  const userRole = user.role as string
  if (userRole === "SELLER" && op.seller_id !== user.id) {
    notFound()
  }

  // Get customers
  const { data: operationCustomers } = await supabase
    .from("operation_customers")
    .select(`
      *,
      customers:customer_id(*)
    `)
    .eq("operation_id", id)

  // Get documents (de la operación Y del lead asociado si existe)
  const { data: opDocs } = await supabase
    .from("documents")
    .select("*")
    .eq("operation_id", id)
    .order("uploaded_at", { ascending: false })
  
  const documents: Array<any> = opDocs ? [...opDocs] : []
  
  // Si la operación tiene un lead asociado, traer también sus documentos
  if (op.lead_id) {
    const { data: leadDocs } = await supabase
      .from("documents")
      .select("*")
      .eq("lead_id", op.lead_id)
      .order("uploaded_at", { ascending: false })
    
    if (leadDocs) {
      // Agregar documentos del lead que no estén ya en la operación
      for (const doc of leadDocs) {
        if (!documents.find((d: any) => d.id === doc.id)) {
          documents.push({ ...doc, fromLead: true })
        }
      }
    }
  }
  
  // Ordenar todos por fecha
  documents.sort((a: any, b: any) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())

  // Get payments
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("operation_id", id)
    .order("date_due", { ascending: true })

  // Get alerts
  const { data: alerts } = await supabase
    .from("alerts")
    .select("*")
    .eq("operation_id", id)
    .order("date_due", { ascending: true })

  // Get agencies for edit dialog
  let agencies: Array<{ id: string; name: string }> = []
  if (userRole === "SUPER_ADMIN") {
    const { data } = await supabase.from("agencies").select("id, name").order("name")
    agencies = (data || []) as Array<{ id: string; name: string }>
  } else {
    const userAgencies = await getUserAgencies(user.id)
    agencies = userAgencies
      .filter((ua) => ua.agencies)
      .map((ua) => ({
        id: ua.agency_id,
        name: ua.agencies!.name,
      }))
  }

  // Get sellers for edit dialog
  const { data: sellersData } = await supabase
    .from("users")
    .select("id, name")
    .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
    .eq("is_active", true)
    .order("name")
  const sellers = (sellersData || []) as Array<{ id: string; name: string }>

  // Get operators for edit dialog
  const { data: operatorsData } = await supabase
    .from("operators")
    .select("id, name")
    .order("name")
  const operators = (operatorsData || []) as Array<{ id: string; name: string }>

  return (
    <OperationDetailClient
      operation={operation}
      customers={operationCustomers || []}
      documents={documents || []}
      payments={payments || []}
      alerts={alerts || []}
      agencies={agencies}
      sellers={sellers}
      operators={operators}
    />
  )
}
