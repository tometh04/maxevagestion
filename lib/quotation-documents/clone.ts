/** Deep clone for the JSON-only quotation contracts (Node 16/Jest compatible). */
export function cloneQuotationJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
