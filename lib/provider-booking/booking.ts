import "server-only"

import { randomUUID } from "node:crypto"
import { z } from "zod"
import { resolveAgencyEmiliaCredential } from "@/lib/emilia/agency-credential"
import { reservationResultSchema, type ReservationItem } from "./detail-contract"
import { containsCardData } from "./pan-detection"

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
}).strict().superRefine((value, ctx) => {
  if (containsCardData(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "No ingreses datos de tarjeta en la ficha de pasajeros" })
  value.travellers.forEach((entry, index) => {
  if (entry.type !== "ADT" && !entry.birth_date) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["travellers", index, "birth_date"], message: "La fecha de nacimiento es obligatoria" })
  })
})

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
  const { data: previous, error: readError } = await input.admin.from("quotation_provider_bookings")
    .select("result,updated_at,remote_job_id")
    .eq("id", input.booking.id).eq("org_id", input.orgId).eq("agency_id", input.agencyId).maybeSingle()
  if (readError || !previous || previous.remote_job_id !== input.booking.remote_job_id) throw new Error("Reserva no encontrada")
  const { error: attemptError } = await input.admin.from("quotation_provider_bookings")
    .update({ sync_attempted_at: new Date().toISOString() })
    .eq("id", input.booking.id).eq("org_id", input.orgId).eq("agency_id", input.agencyId)
  if (attemptError) throw new Error("No se pudo iniciar la actualización de la reserva")
  const credential = await resolveAgencyEmiliaCredential({ admin: input.admin, orgId: input.orgId, agencyId: input.agencyId })
  const response = await fetch(`${bookingUrl()}/${encodeURIComponent(input.booking.remote_job_id)}/details`, {
    headers: { authorization: `Bearer ${credential.apiKey}` },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  })
  const raw = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error("No se pudo consultar el estado de la reserva")
  const parsed = z.object({
    schema_version: z.literal("provider-booking-details.v1"), job_id: z.string().uuid(),
    status: z.enum(["queued", "processing", "completed", "failed"]), result: reservationResultSchema,
    request_snapshot: z.object({
      holder: bookingFormSchema.innerType().shape.holder,
      travellers: bookingFormSchema.innerType().shape.travellers,
      items: z.array(z.object({ client_item_id: z.string(), product: z.enum(["flights", "hotels"]), expected_price: z.object({ amount: z.number(), currency: z.string() }) })),
    }),
  }).safeParse(raw)
  if (!parsed.success) throw new Error("El estado de la reserva no cumple el contrato esperado")
  if (containsCardData(parsed.data.request_snapshot)) throw new Error("La ficha de pasajeros contiene datos no admitidos")
  if (parsed.data.job_id !== input.booking.remote_job_id) throw new Error("La respuesta no corresponde a la reserva")

  const result = parsed.data.result
  const old = reservationResultSchema.safeParse(previous.result)
  for (const item of result.items) {
    if (!item.detail && item.detail_unavailable && old.success) {
      const stored = old.data.items.find(entry => entry.client_item_id === item.client_item_id && entry.booking_id === item.booking_id)
      if (stored?.detail) { item.detail = stored.detail; item.detail_checked_at = stored.detail_checked_at }
    }
  }
  const status = reservationJobStatus(parsed.data.status, result.items)
  const now = new Date().toISOString()
  const { data: saved, error } = await input.admin
    .from("quotation_provider_bookings")
    .update({ status, result, request_snapshot: parsed.data.request_snapshot, synced_at: now, updated_at: now })
    .eq("id", input.booking.id)
    .eq("org_id", input.orgId)
    .eq("agency_id", input.agencyId)
    .eq("updated_at", previous.updated_at)
    .select("id")
    .maybeSingle()
  if (error) throw new Error("No se pudo guardar el estado de la reserva")
  return { status, result, concurrent_update: !saved }
}

export function reservationJobStatus(jobStatus: string, items: ReservationItem[]) {
  if (jobStatus === "queued") return "QUEUED"
  if (jobStatus === "processing") return "PROCESSING"
  const created = items.filter(item => item.booking_id)
  if (created.length && created.length < items.length) return "PARTIAL"
  if (created.length) return created.every(item => !item.detail_unavailable && ["CNFD", "confirmed"].includes(item.detail?.status ?? item.provider_status ?? "")) ? "CONFIRMED" : "PENDING"
  return items.some(item => item.status === "price_changed") ? "PRICE_CHANGED" : "FAILED"
}

export function bookingItemsFromQuotation(quotation: any, selectedOptionId?: string): Array<{
  client_item_id: string; product: "flights" | "hotels"; source: Record<string, unknown>; expected_price: { amount: number; currency: string }
}> {
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
