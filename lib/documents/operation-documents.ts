type SupabaseLike = {
  from: (table: string) => any
}

type OperationCustomerLike = {
  customer_id?: string | null
  customers?: { id?: string | null } | Array<{ id?: string | null }> | null
}

function getLinkedCustomerId(record: OperationCustomerLike): string | null {
  if (record.customer_id) return record.customer_id

  const customer = Array.isArray(record.customers) ? record.customers[0] : record.customers
  return customer?.id || null
}

function addUniqueDocument(
  documents: any[],
  seenIds: Set<string>,
  document: any,
  sourceFlags: Record<string, boolean>
) {
  if (!document?.id || seenIds.has(document.id)) return
  seenIds.add(document.id)
  documents.push({ ...document, ...sourceFlags })
}

export async function getOperationVisibleDocuments(
  supabase: SupabaseLike,
  {
    operationId,
    leadId,
    operationCustomers,
  }: {
    operationId: string
    leadId?: string | null
    operationCustomers?: OperationCustomerLike[] | null
  }
) {
  const documents: any[] = []
  const seenIds = new Set<string>()

  const { data: operationDocs } = await supabase
    .from("documents")
    .select("*")
    .eq("operation_id", operationId)
    .order("uploaded_at", { ascending: false })

  for (const doc of operationDocs || []) {
    addUniqueDocument(documents, seenIds, doc, {})
  }

  if (leadId) {
    const { data: leadDocs } = await supabase
      .from("documents")
      .select("*")
      .eq("lead_id", leadId)
      .order("uploaded_at", { ascending: false })

    for (const doc of leadDocs || []) {
      addUniqueDocument(documents, seenIds, doc, { fromLead: true })
    }
  }

  const customerIds = Array.from(
    new Set((operationCustomers || []).map(getLinkedCustomerId).filter(Boolean) as string[])
  )

  if (customerIds.length > 0) {
    const { data: customerDocs } = await supabase
      .from("documents")
      .select("*")
      .in("customer_id", customerIds)
      .order("uploaded_at", { ascending: false })

    for (const doc of customerDocs || []) {
      addUniqueDocument(documents, seenIds, doc, { fromCustomer: true })
    }
  }

  return documents.sort(
    (left, right) =>
      new Date(right.uploaded_at || 0).getTime() - new Date(left.uploaded_at || 0).getTime()
  )
}
