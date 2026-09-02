import "server-only"

import { randomUUID } from "node:crypto"
import { z } from "zod"
import { resolveAgencyEmiliaCredential } from "@/lib/emilia/agency-credential"

const phone = z.object({ country_pref: z.string().min(1).max(8), number: z.string().min(5).max(20) }).strict()
const document = z.object({
  type: z.string().min(1).max(8), number: z.string().min(1).max(40), nationality: z.string().regex(/^[A-Z]{2}$/),
  country: z.string().regex(/^[A-Z]{2}$/), issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict()
const traveller = z.object({
  type: z.enum(["ADT", "CHD", "INF", "YCD", "YTH"]), title: z.enum(["Mr", "Mrs", "Ms", "Miss"]),
  name: z.string().min(1).max(80), surnames: z.array(z.string().min(1).max(80)).min(1).max(4),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), gender: z.string().min(1).max(20).optional(),
  documents: z.array(document).min(1).max(4).optional(),
}).strict()

export const bookingFormSchema = z.object({
  holder: z.object({
    name: z.string().min(1).max(80), surnames: z.array(z.string().min(1).max(80)).min(1).max(4),
    contact: z.object({ mails: z.array(z.string().email()).min(1).max(5), phones: z.array(phone).min(1).max(5) }).strict(),
  }).strict(),
  travellers: z.array(traveller).min(1).max(9),
}).strict().superRefine((value, ctx) => value.travellers.forEach((entry, index) => {
  if (entry.type !== "ADT" && !entry.birth_date) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["travellers", index, "birth_date"], message: "La fecha de nacimiento es obligatoria" })
}))

function bookingUrl() {
  const refresh = process.env.EMILIA_OFFER_REFRESH_URL?.trim() || "https://api.vibook.ai/v1/offer-refresh"
  return refresh.replace(/\/offer-refresh\/?$/, "/provider-bookings")
}

export async function enqueueProviderBooking(input: {
  admin: any
  orgId: string
  agencyId: string
  quotationId: string
  operationId: string
  form: z.infer<typeof bookingFormSchema>
  items: any[]
}) {
  const credential = await resolveAgencyEmiliaCredential({ admin: input.admin, orgId: input.orgId, agencyId: input.agencyId })
  const requestId = randomUUID()
  const response = await fetch(bookingUrl(), {
    method: "POST",
    headers: { authorization: `Bearer ${credential.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      schema_version: "provider-booking.v1",
      request_id: requestId,
      quotation_id: input.quotationId,
      operation_id: input.operationId,
      ...input.form,
      items: input.items,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  const payload = await response.json().catch(() => ({}))
  if (response.status !== 202 || typeof payload?.job_id !== "string") throw new Error(payload?.error?.message || "No se pudo encolar la reserva con el proveedor")
  return { requestId, jobId: payload.job_id, status: payload.status as string }
}

export function bookingItemsFromQuotation(quotation: any, selectedOptionId?: string) {
  const selected = (quotation.quotation_options || []).find((option: any) => selectedOptionId
    ? option.id === selectedOptionId
    : option.is_selected)
  const items = (quotation.quotation_items || []).filter((item: any) => item.option_id === selected?.id)
  return items.flatMap((item: any) => {
    const source = item.offer_source
    if (!source || !["FLIGHT", "HOTEL", "ACCOMMODATION"].includes(item.item_type) || String(item.provider).toUpperCase() !== "DELFOS") return []
    const amount = item.cost_basis === "COMMISSIONABLE_GROSS" ? Number(item.gross_price) : Number(item.cost_amount)
    if (!(amount > 0) || !["flights", "hotels"].includes(source.product)) return []
    return [{
      client_item_id: item.id,
      product: source.product,
      source,
      expected_price: { amount, currency: item.cost_currency || item.currency },
    }]
  })
}
