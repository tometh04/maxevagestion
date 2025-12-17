import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { CustomerDetailClient } from "@/components/customers/customer-detail-client"

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  // Get customer
  const { data: customer, error: customerError } = await (supabase.from("customers") as any)
    .select("*")
    .eq("id", id)
    .single()

  if (customerError || !customer) {
    notFound()
  }

  // Get operations for this customer
  const { data: operationCustomers, error: operationCustomersError } = await supabase
    .from("operation_customers")
    .select(`
      *,
      operations:operation_id(
        *,
        sellers:seller_id(id, name),
        operators:operator_id(id, name),
        agencies:agency_id(id, name)
      )
    `)
    .eq("customer_id", id)
    .order("created_at", { ascending: false })

  if (operationCustomersError) {
    console.error("[CustomerDetailPage] Error fetching operation_customers:", operationCustomersError)
  }

  // Get operation IDs for payments and documents
  const operationIds = (operationCustomers || []).map((oc: any) => oc.operation_id).filter(Boolean)
  
  // Get payments related to customer's operations
  let payments: any[] = []
  if (operationIds.length > 0) {
    const { data: paymentsData, error: paymentsError } = await supabase
      .from("payments")
      .select("*")
      .in("operation_id", operationIds)
      .eq("payer_type", "CUSTOMER")
      .order("date_due", { ascending: true })
    if (paymentsError) {
      console.error("[CustomerDetailPage] Error fetching payments:", paymentsError)
    }
    payments = paymentsData || []
  }

  // Get documents - incluir documentos del cliente Y de sus operaciones
  
  let documents: any[] = []
  
  // Documentos directamente vinculados al cliente
  const { data: customerDocs, error: customerDocsError } = await supabase
    .from("documents")
    .select("*")
    .eq("customer_id", id)
    .order("uploaded_at", { ascending: false })
  
  if (customerDocsError) {
    console.error("[CustomerDetailPage] Error fetching customer documents:", customerDocsError)
  }
  
  if (customerDocs) {
    documents = [...documents, ...customerDocs]
  }
  
  // Documentos de las operaciones del cliente
  if (operationIds.length > 0) {
    const { data: operationDocs, error: operationDocsError } = await supabase
      .from("documents")
      .select("*")
      .in("operation_id", operationIds)
      .order("uploaded_at", { ascending: false })
    
    if (operationDocsError) {
      console.error("[CustomerDetailPage] Error fetching operation documents:", operationDocsError)
    }
    
    if (operationDocs) {
      // Agregar documentos de operaciones que no estén ya en la lista
      for (const doc of operationDocs as any[]) {
        if (!documents.find((d: any) => d.id === (doc as any).id)) {
          documents.push(doc)
        }
      }
    }
  }
  
  // Log para debugging
  console.log(`[CustomerDetailPage] Customer ${id}:`, {
    operationCustomersCount: operationCustomers?.length || 0,
    operationIdsCount: operationIds.length,
    paymentsCount: payments.length,
    documentsCount: documents.length
  })
  
  // Ordenar todos los documentos por fecha
  documents.sort((a: any, b: any) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())

  // Extraer operaciones de operation_customers
  // En Supabase, cuando haces una relación con foreign key, devuelve un objeto único (no array)
  const operations = (operationCustomers || [])
    .map((oc: any) => {
      // oc.operations puede ser un objeto único o null
      if (oc.operations && typeof oc.operations === 'object' && !Array.isArray(oc.operations)) {
        return oc.operations
      }
      return null
    })
    .filter((op: any) => op !== null && op !== undefined)

  return (
    <CustomerDetailClient
      customer={customer}
      operations={operations}
      payments={payments}
      documents={documents || []}
    />
  )
}
