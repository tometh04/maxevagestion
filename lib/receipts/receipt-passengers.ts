interface ReceiptCustomerRecord {
  role?: string | null
  customers?: {
    first_name?: string | null
    last_name?: string | null
    address?: string | null
    city?: string | null
  } | null
}

interface BuildReceiptPassengerDetailsParams {
  operationCustomers?: ReceiptCustomerRecord[] | null
  leadContactName?: string | null
}

export interface ReceiptPassengerDetails {
  customerName: string
  customerLastName: string
  customerAddress: string
  customerCity: string
  passengerNamesText: string
}

function normalizeDisplayName(value?: string | null): string {
  return (value || "").replace(/\s+/g, " ").trim()
}

function buildCustomerDisplayName(customer?: ReceiptCustomerRecord["customers"]): string {
  if (!customer) return ""
  return normalizeDisplayName(`${customer.first_name || ""} ${customer.last_name || ""}`)
}

function getDisplayLastName(displayName: string): string {
  const parts = normalizeDisplayName(displayName).split(" ").filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 1] : ""
}

export function buildReceiptPassengerDetails({
  operationCustomers,
  leadContactName,
}: BuildReceiptPassengerDetailsParams): ReceiptPassengerDetails {
  const customerRecords = (operationCustomers || [])
    .filter((record) => record?.customers)
    .sort((left, right) => {
      if (left.role === "MAIN" && right.role !== "MAIN") return -1
      if (left.role !== "MAIN" && right.role === "MAIN") return 1
      return 0
    })

  const seenPassengerNames = new Set<string>()
  const passengerNames = customerRecords
    .map((record) => buildCustomerDisplayName(record.customers))
    .filter((name) => {
      if (!name) return false

      const normalizedKey = name.toLocaleLowerCase()
      if (seenPassengerNames.has(normalizedKey)) {
        return false
      }

      seenPassengerNames.add(normalizedKey)
      return true
    })

  const mainCustomer =
    customerRecords.find((record) => record.role === "MAIN")?.customers ||
    customerRecords[0]?.customers ||
    null

  const fallbackLeadName = normalizeDisplayName(leadContactName)
  const mainCustomerName = buildCustomerDisplayName(mainCustomer)
  const customerName = mainCustomerName || fallbackLeadName || "Cliente"
  const customerLastName = mainCustomer?.last_name || getDisplayLastName(customerName)
  const passengerNamesText =
    passengerNames.length > 0 ? passengerNames.join(", ") : fallbackLeadName || "Cliente"

  return {
    customerName,
    customerLastName,
    customerAddress: mainCustomer?.address || "",
    customerCity: mainCustomer?.city || "",
    passengerNamesText,
  }
}
