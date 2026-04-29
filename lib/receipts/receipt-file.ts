function normalizeReceiptFileSegment(value?: string | null): string {
  const normalized = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return normalized || "cliente"
}

export function buildReceiptFileName(customerLastName: string | null | undefined, receiptNumber: string): string {
  const safeLastName = normalizeReceiptFileSegment(customerLastName)
  const safeReceiptNumber = receiptNumber.replace(/[^A-Za-z0-9-]+/g, "-")
  return `recibo-${safeLastName}-${safeReceiptNumber}.pdf`
}
