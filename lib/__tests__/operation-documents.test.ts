import { getOperationVisibleDocuments } from "@/lib/documents/operation-documents"

function createDocumentsClient(documents: any[]) {
  return {
    from: () => {
      const state: { key?: string; value?: any; values?: string[] } = {}

      return {
        select() {
          return this
        },
        eq(key: string, value: any) {
          state.key = key
          state.value = value
          return this
        },
        in(key: string, values: string[]) {
          state.key = key
          state.values = values
          return this
        },
        async order() {
          const data = documents.filter((document) => {
            if (state.values) return state.values.includes(document[state.key!])
            return document[state.key!] === state.value
          })

          return { data }
        },
      }
    },
  }
}

describe("getOperationVisibleDocuments", () => {
  it("includes operation, lead and linked customer documents without duplicates", async () => {
    const documents = await getOperationVisibleDocuments(
      createDocumentsClient([
        { id: "op-doc", operation_id: "op-1", uploaded_at: "2026-04-29T10:00:00Z" },
        { id: "lead-doc", lead_id: "lead-1", uploaded_at: "2026-04-29T11:00:00Z" },
        { id: "customer-doc", customer_id: "customer-1", uploaded_at: "2026-04-29T12:00:00Z" },
        {
          id: "duplicate",
          operation_id: "op-1",
          customer_id: "customer-1",
          uploaded_at: "2026-04-29T13:00:00Z",
        },
      ]),
      {
        operationId: "op-1",
        leadId: "lead-1",
        operationCustomers: [{ customer_id: "customer-1" }],
      }
    )

    expect(documents.map((document) => document.id)).toEqual([
      "duplicate",
      "customer-doc",
      "lead-doc",
      "op-doc",
    ])
    expect(documents.find((document) => document.id === "lead-doc")).toMatchObject({
      fromLead: true,
    })
    expect(documents.find((document) => document.id === "customer-doc")).toMatchObject({
      fromCustomer: true,
    })
  })
})
