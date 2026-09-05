import "server-only"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import {
  applyAgencyPermissionScope,
  type AgencyPermissionScope
} from "@/lib/permissions/agency-scope-server"
import { bookingDetailSchema, reservationItemSchema } from "./detail-contract"
import { bookingFormSchema, syncProviderBooking } from "./booking"

export type ReservationRow = Omit<
  Database["public"]["Views"]["provider_reservations"]["Row"],
  "item" | "request_snapshot" | "org_id" | "updated_at" | "search_text"
>
export type ReservationList = {
  rows: ReservationRow[]
  total: number
  page: number
  pageSize: number
}
export type ReservationDetail = {
  reservation: ReservationRow
  item: z.infer<typeof reservationItemSchema> | null
  request: z.infer<typeof bookingFormSchema> | null
}

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  })
export const reservationFiltersSchema = z
  .object({
    q: z.string().trim().max(120).default(""),
    status: z.string().max(40).default(""),
    product: z.enum(["", "flights", "hotels"]).default(""),
    from: date.optional(),
    to: date.optional(),
    agency: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1)
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "Rango de fechas inválido"
  })
export type ReservationFilters = z.infer<typeof reservationFiltersSchema>
const columns =
  "id,booking_id,agency_id,quotation_id,operation_id,seller_id,file_code,agency_name,seller_name,job_status,created_at,synced_at,wholesaler,item_id,product,external_id,locator,status,reference,contact_name,destination,travel_date,price_total,price_currency,last_ticket_date,passenger_count,passengers_summary" as const

export async function listReservations(
  admin: SupabaseClient<Database>,
  orgId: string,
  scope: AgencyPermissionScope,
  filters: ReservationFilters
): Promise<ReservationList> {
  const pageSize = 25
  let query = applyAgencyPermissionScope(
    admin.from("provider_reservations").select(columns, { count: "exact" }).eq("org_id", orgId),
    scope
  )
  if (filters.product) query = query.eq("product", filters.product)
  if (filters.status) query = query.eq("status", filters.status)
  if (filters.agency) query = query.eq("agency_id", filters.agency)
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00-03:00`)
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999-03:00`)
  // Do not call .or() here: it would overwrite the mixed agency/seller scope.
  if (filters.q) {
    const term = filters.q.replace(/[\\%_]/g, (value) => `\\${value}`)
    query = query.ilike("search_text", `%${term}%`)
  }
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range((filters.page - 1) * pageSize, filters.page * pageSize - 1)
  if (error) throw new Error("No se pudieron cargar las reservas")
  return { rows: data ?? [], total: count ?? 0, page: filters.page, pageSize }
}

export async function getReservation(
  admin: SupabaseClient<Database>,
  orgId: string,
  scope: AgencyPermissionScope,
  id: string
): Promise<ReservationDetail | null> {
  const { data, error } = await applyAgencyPermissionScope(
    admin.from("provider_reservations").select("*").eq("org_id", orgId).eq("id", id),
    scope
  ).maybeSingle()
  if (error) throw new Error("No se pudo cargar la reserva")
  if (!data) return null
  const {
    item,
    request_snapshot,
    org_id: _org,
    updated_at: _updated,
    search_text: _search,
    ...reservation
  } = data
  const parsedItem = reservationItemSchema.safeParse(item)
  const parsedRequest = bookingFormSchema.safeParse(
    request_snapshot && { holder: request_snapshot.holder, travellers: request_snapshot.travellers }
  )
  // Validate nested projection again before serializing to the browser.
  if (parsedItem.success && parsedItem.data.detail)
    bookingDetailSchema.parse(parsedItem.data.detail)
  return {
    reservation,
    item: parsedItem.success ? parsedItem.data : null,
    request: parsedRequest.success ? parsedRequest.data : null
  }
}

export async function syncReservations(
  admin: SupabaseClient<Database>,
  orgId: string,
  scope: AgencyPermissionScope,
  bookingIds: string[]
) {
  const { data, error } = await applyAgencyPermissionScope(
    admin
      .from("provider_reservations")
      .select("booking_id,agency_id")
      .eq("org_id", orgId)
      .in("booking_id", bookingIds),
    scope
  )
  if (error) throw new Error("No se pudieron consultar las reservas")
  const allowed = Array.from(
    new Set<string>((data ?? []).map((row: { booking_id: string }) => row.booking_id))
  )
  const { data: jobs, error: jobsError } = await admin
    .from("quotation_provider_bookings")
    .select("id,agency_id,remote_job_id")
    .eq("org_id", orgId)
    .in("id", allowed)
  if (jobsError) throw new Error("No se pudieron consultar las reservas")
  const results = await Promise.allSettled(
    (jobs ?? []).map((booking) =>
      syncProviderBooking({ admin, orgId, agencyId: booking.agency_id, booking })
    )
  )
  return {
    updated: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
    unavailable: results.filter(
      (result) =>
        result.status === "fulfilled" &&
        result.value.result.items.some((item) => item.detail_unavailable)
    ).length
  }
}
