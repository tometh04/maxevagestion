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
  await getCurrentUser() // gate auth (RLS scopea la org en queries siguientes)
  const supabase = await createServerClient()

  // Get customer
  const { data: customer, error: customerError } = await (supabase.from("customers") as any)
    .select("*")
    .eq("id", id)
    .single()

  if (customerError || !customer) {
    notFound()
  }

  // operation_customers + operations + relaciones (single query, no duplicate)
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

  if (operationCustomersError) {
    console.error("[CustomerDetailPage] operation_customers fetch error:", operationCustomersError)
  }

  // Operation IDs for payments and documents
  const operationIds = (operationCustomers || []).map((oc: any) => oc.operation_id).filter(Boolean)

  // Pagos vinculados a operaciones del cliente
  let payments: any[] = []
  if (operationIds.length > 0) {
    const { data: paymentsData, error: paymentsError } = await supabase
      .from("payments")
      .select(`
        *,
        operations:operation_id(
          id,
          sale_currency,
          currency
        )
      `)
      .in("operation_id", operationIds)
      .eq("payer_type", "CUSTOMER")
      .order("date_due", { ascending: true })
    if (paymentsError) {
      console.error("[CustomerDetailPage] payments fetch error:", paymentsError)
    }
    payments = paymentsData || []
  }

  // Documentos: del cliente directo + de sus operaciones
  let documents: any[] = []

  const { data: customerDocs, error: customerDocsError } = await supabase
    .from("documents")
    .select("*")
    .eq("customer_id", id)
    .order("uploaded_at", { ascending: false })

  if (customerDocsError) {
    console.error("[CustomerDetailPage] customer documents fetch error:", customerDocsError)
  }
  if (customerDocs) {
    documents = [...documents, ...customerDocs]
  }

  if (operationIds.length > 0) {
    const { data: operationDocs, error: operationDocsError } = await supabase
      .from("documents")
      .select("*")
      .in("operation_id", operationIds)
      .order("uploaded_at", { ascending: false })

    if (operationDocsError) {
      console.error("[CustomerDetailPage] operation documents fetch error:", operationDocsError)
    }
    if (operationDocs) {
      for (const doc of operationDocs as any[]) {
        if (!documents.find((d: any) => d.id === (doc as any).id)) {
          documents.push(doc)
        }
      }
    }
  }

  documents.sort(
    (a: any, b: any) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
  )

  // Extraer operaciones desde operation_customers; el JOIN devuelve objeto único
  let operations: any[] = []
  if (operationCustomers && operationCustomers.length > 0) {
    operations = operationCustomers
      .map((oc: any) => {
        if (oc.operations && typeof oc.operations === "object" && !Array.isArray(oc.operations)) {
          return oc.operations
        }
        return null
      })
      .filter((op: any) => op !== null && op !== undefined)
  }

  // Fallback: si la relación devolvió null pero tenemos IDs, fetch directo
  if (operations.length === 0 && operationIds.length > 0) {
    const { data: directOperations, error: directOpsError } = await supabase
      .from("operations")
      .select(`
        *,
        sellers:seller_id(id, name),
        operators:operator_id(id, name),
        agencies:agency_id(id, name)
      `)
      .in("id", operationIds)
      .order("created_at", { ascending: false })

    if (directOpsError) {
      console.error("[CustomerDetailPage] direct operations fetch error:", directOpsError)
    } else if (directOperations && directOperations.length > 0) {
      operations = directOperations
    }
  }

  return (
    <CustomerDetailClient
      customer={customer}
      operations={operations}
      payments={payments}
      documents={documents || []}
    />
  )
}
