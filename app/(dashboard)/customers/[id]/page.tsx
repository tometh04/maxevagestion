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
  // 🔴 CROSS-TENANT FIX (2026-05-21): filtros explícitos por org_id —
  // ver CLAUDE.md regla de oro. RLS está rota; no confiar.
  const { user } = await getCurrentUser()
  const userOrgId = (user as any).org_id
  const supabase = await createServerClient()

  // Get customer — scope a la org del user (404 enmascarado si pertenece a otro tenant)
  const { data: customer, error: customerError } = await (supabase.from("customers") as any)
    .select("*")
    .eq("id", id)
    .eq("org_id", userOrgId)
    .single()

  if (customerError || !customer) {
    notFound()
  }

  // operation_customers + operations — scope adicional por org_id del operation
  const { data: operationCustomers, error: operationCustomersError } = await supabase
    .from("operation_customers")
    .select(`
      *,
      operations:operation_id!inner(
        *,
        sellers:seller_id(id, name),
        operators:operator_id(id, name),
        agencies:agency_id(id, name)
      )
    `)
    .eq("customer_id", id)
    .eq("operations.org_id", userOrgId)

  if (operationCustomersError) {
    console.error("[CustomerDetailPage] operation_customers fetch error:", operationCustomersError)
  }

  // Operation IDs for payments and documents
  const operationIds = (operationCustomers || []).map((oc: any) => oc.operation_id).filter(Boolean)

  // Pagos vinculados a operaciones del cliente — scope por org_id
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
      .eq("org_id", userOrgId)
      .order("date_due", { ascending: true })
    if (paymentsError) {
      console.error("[CustomerDetailPage] payments fetch error:", paymentsError)
    }
    payments = paymentsData || []
  }

  // Documentos: del cliente directo + de sus operaciones — todos scoped por org
  let documents: any[] = []

  const { data: customerDocs, error: customerDocsError } = await supabase
    .from("documents")
    .select("*")
    .eq("customer_id", id)
    .eq("org_id", userOrgId)
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
      .eq("org_id", userOrgId)
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

  // Fallback: si la relación devolvió null pero tenemos IDs, fetch directo.
  // 🔴 CROSS-TENANT FIX (2026-05-21): scope por org_id también.
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
      .eq("org_id", userOrgId)
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
