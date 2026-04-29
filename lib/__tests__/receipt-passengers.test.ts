import { buildReceiptPassengerDetails } from "@/lib/receipts/receipt-passengers"

describe("receipt-passengers helpers", () => {
  it("prioritizes the main passenger and builds a deduplicated passenger list", () => {
    const details = buildReceiptPassengerDetails({
      operationCustomers: [
        {
          role: "COMPANION",
          customers: {
            first_name: "Ana",
            last_name: "Lopez",
            address: "Siempre Viva 123",
            city: "Rosario",
          },
        },
        {
          role: "MAIN",
          customers: {
            first_name: "Juan",
            last_name: "Perez",
            address: "Mitre 456",
            city: "Cordoba",
          },
        },
        {
          role: "COMPANION",
          customers: {
            first_name: "ana",
            last_name: "lopez",
          },
        },
      ],
    })

    expect(details).toEqual({
      customerName: "Juan Perez",
      customerLastName: "Perez",
      customerAddress: "Mitre 456",
      customerCity: "Cordoba",
      passengerNamesText: "Juan Perez, Ana Lopez",
    })
  })

  it("falls back to the lead contact name when the operation has no linked passengers", () => {
    const details = buildReceiptPassengerDetails({
      operationCustomers: [],
      leadContactName: "Maria Garcia",
    })

    expect(details).toEqual({
      customerName: "Maria Garcia",
      customerLastName: "Garcia",
      customerAddress: "",
      customerCity: "",
      passengerNamesText: "Maria Garcia",
    })
  })

  it("accepts Supabase relation payloads where customers is returned as an array", () => {
    const details = buildReceiptPassengerDetails({
      operationCustomers: [
        {
          role: "MAIN",
          customers: [
            {
              first_name: "Lucia",
              last_name: "Sosa",
              address: "San Martin 100",
              city: "Rosario",
            },
          ],
        },
      ] as any,
    })

    expect(details).toMatchObject({
      customerName: "Lucia Sosa",
      customerLastName: "Sosa",
      customerAddress: "San Martin 100",
      customerCity: "Rosario",
      passengerNamesText: "Lucia Sosa",
    })
  })

  it("uses Cliente only when there is no passenger or lead data", () => {
    const details = buildReceiptPassengerDetails({})

    expect(details).toEqual({
      customerName: "Cliente",
      customerLastName: "",
      customerAddress: "",
      customerCity: "",
      passengerNamesText: "Cliente",
    })
  })
})
