import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { CustomerDetailClient } from "@/components/customers/customer-detail-client"

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  // Get customer
  const { data: customer, error: customerError } = await (supabase.from("customers") as any)
    .select("*")
    .eq("id", params.id)
    .single()

  if (customerError || !customer) {
    notFound()
  }

  // Get operations for this customer
  const { data: operationCustomers } = await supabase
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
    .eq("customer_id", params.id)
    .order("created_at", { ascending: false })

  // Get payments related to customer's operations
  const operationIds = (operationCustomers || []).map((oc: any) => oc.operation_id)
  let payments: any[] = []
  if (operationIds.length > 0) {
    const { data: paymentsData } = await supabase
      .from("payments")
      .select("*")
      .in("operation_id", operationIds)
      .eq("payer_type", "CUSTOMER")
      .order("date_due", { ascending: true })
    payments = paymentsData || []
  }

  // Get documents
  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("customer_id", params.id)
    .order("uploaded_at", { ascending: false })

  const operations = (operationCustomers || []).map((oc: any) => oc.operations).filter(Boolean)

  return (
    <CustomerDetailClient
      customer={customer}
      operations={operations}
      payments={payments}
      documents={documents || []}
    />
  )
}
