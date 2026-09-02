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

const providerBookingJobSchema = z.object({
  schema_version: z.literal("provider-booking-job.v1"),
  job_id: z.string().uuid(),
  status: z.enum(["queued", "processing", "completed", "failed"]),
  stage: z.string(),
  result: z.object({
    status: z.enum(["confirmed", "price_changed", "partial", "failed"]),
  }).passthrough().optional(),
  error: z.record(z.unknown()).optional(),
}).passthrough()

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

export async function syncProviderBooking(input: {
  admin: any
  orgId: string
  agencyId: string
  booking: { id: string; remote_job_id: string }
}) {
  const credential = await resolveAgencyEmiliaCredential({ admin: input.admin, orgId: input.orgId, agencyId: input.agencyId })
  const response = await fetch(`${bookingUrl()}/${input.booking.remote_job_id}`, {
    headers: { authorization: `Bearer ${credential.apiKey}` },
    signal: AbortSignal.timeout(15_000),
  })
  const raw = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error("No se pudo consultar el estado de la reserva")
  const parsed = providerBookingJobSchema.safeParse(raw)
  if (!parsed.success) throw new Error("El estado de la reserva no cumple el contrato esperado")

  const terminalStatus = parsed.data.status === "completed" ? parsed.data.result?.status : null
  const status = parsed.data.status === "queued" ? "QUEUED"
    : parsed.data.status === "processing" ? "PROCESSING"
      : parsed.data.status === "failed" ? "FAILED"
        : terminalStatus === "confirmed" ? "CONFIRMED"
          : terminalStatus === "price_changed" ? "PRICE_CHANGED"
            : terminalStatus === "partial" ? "PARTIAL"
              : "FAILED"
  const result = parsed.data.result ?? parsed.data.error ?? null
  const { error } = await input.admin
    .from("quotation_provider_bookings")
    .update({ status, result, updated_at: new Date().toISOString() })
    .eq("id", input.booking.id)
    .eq("org_id", input.orgId)
    .eq("agency_id", input.agencyId)
  if (error) throw new Error("No se pudo guardar el estado de la reserva")
  return { status, result }
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
