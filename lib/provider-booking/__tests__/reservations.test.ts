/** @jest-environment node */
import { listReservations, reservationFiltersSchema, syncReservations } from "../reservations"
import { bookingFormSchema, reservationJobStatus, syncProviderBooking } from "../booking"
import { resolveAgencyEmiliaCredential } from "@/lib/emilia/agency-credential"
import type { AgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import type { Database } from "@/lib/supabase/types"
import type { SupabaseClient } from "@supabase/supabase-js"

jest.mock("@/lib/emilia/agency-credential", () => ({ resolveAgencyEmiliaCredential: jest.fn() }))
const scope: AgencyPermissionScope = {
  module: "operations",
  permission: "read",
  userId: "seller",
  memberAgencyIds: ["full", "own"],
  agencyIds: ["full", "own"],
  fullAgencyIds: ["full"],
  ownAgencyIds: ["own"],
  permissionsByAgency: {}
}
function query(data: unknown = [], count = 0) {
  const q: any = {
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, count, error: null }).then(resolve),
    maybeSingle: jest.fn().mockResolvedValue({ data, error: null })
  }
  for (const method of [
    "select",
    "eq",
    "in",
    "or",
    "ilike",
    "gte",
    "lte",
    "order",
    "range",
    "update"
  ])
    q[method] = jest.fn(() => q)
  return q
}
const client = (from: jest.Mock) => ({ from }) as unknown as SupabaseClient<Database>

describe("reservation access and filters", () => {
  it("keeps mixed agency/seller scope while searching and paginating", async () => {
    const q = query()
    await listReservations(
      client(jest.fn(() => q)),
      "org",
      scope,
      reservationFiltersSchema.parse({ q: "Ada,or(id.eq.other)", page: 2 })
    )
    expect(q.eq).toHaveBeenCalledWith("org_id", "org")
    expect(q.or).toHaveBeenCalledTimes(1)
    expect(q.or).toHaveBeenCalledWith(
      "agency_id.in.(full),and(agency_id.in.(own),seller_id.eq.seller)"
    )
    expect(q.ilike).toHaveBeenCalledWith("search_text", "%Ada,or(id.eq.other)%")
    expect(q.range).toHaveBeenCalledWith(25, 49)
  })
  it("fails closed for no agencies even when pagination is applied", async () => {
    const q = query()
    await listReservations(
      client(jest.fn(() => q)),
      "org",
      { ...scope, fullAgencyIds: [], ownAgencyIds: [] },
      reservationFiltersSchema.parse({})
    )
    expect(q.eq).toHaveBeenCalledWith("id", expect.any(String))
    expect(q.range).toHaveBeenCalled()
  })
  it("never sends a denied job to the provider", async () => {
    const view = query([])
    const jobs = query([])
    const admin = client(jest.fn((table) => (table === "provider_reservations" ? view : jobs)))
    await syncReservations(admin, "org", scope, ["foreign-job"])
    expect(jobs.in).toHaveBeenCalledWith("id", [])
    expect(resolveAgencyEmiliaCredential).not.toHaveBeenCalled()
  })
  it("validates real dates and ordering", () => {
    expect(reservationFiltersSchema.safeParse({ from: "2026-02-31" }).success).toBe(false)
    expect(
      reservationFiltersSchema.safeParse({ from: "2026-09-05", to: "2026-09-01" }).success
    ).toBe(false)
  })
})

describe("provider state", () => {
  it("does not label an HTTP-created or ONRQ reservation as confirmed", () => {
    expect(
      reservationJobStatus("completed", [
        { client_item_id: "a", product: "flights", status: "confirmed", booking_id: "bkg_1" }
      ])
    ).toBe("PENDING")
    expect(
      reservationJobStatus("completed", [
        {
          client_item_id: "a",
          product: "flights",
          status: "confirmed",
          booking_id: "bkg_1",
          provider_status: "ONRQ"
        }
      ])
    ).toBe("PENDING")
    expect(
      reservationJobStatus("completed", [
        {
          client_item_id: "a",
          product: "flights",
          status: "confirmed",
          booking_id: "bkg_1",
          provider_status: "CNFD"
        }
      ])
    ).toBe("CONFIRMED")
    expect(
      reservationJobStatus("completed", [
        { client_item_id: "a", product: "flights", status: "confirmed", booking_id: "bkg_1" },
        { client_item_id: "b", product: "hotels", status: "failed" }
      ])
    ).toBe("PARTIAL")
  })
})

describe("snapshot synchronization", () => {
  const jobId = "11111111-1111-4111-8111-111111111111"
  const detail = {
    id: "bkg_1",
    type: "flight",
    provider: "lleego",
    status: "CNFD",
    locator: "ABC",
    agencyId: "delfos-agency",
    agencyName: "Agencia",
    priceTotal: "10.00",
    priceCurrency: "USD",
    createdAt: "2026-09-05"
  }
  const request_snapshot = {
    holder: {
      name: "Ada",
      surnames: ["Lovelace"],
      contact: {
        mails: ["ada@example.com"],
        phones: [{ country_pref: "+54", number: "1112345678" }]
      }
    },
    travellers: [{ type: "ADT", title: "Ms", name: "Ada", surnames: ["Lovelace"] }],
    items: []
  }
  it("rejects card numbers before a passenger snapshot can be persisted", () => {
    expect(
      bookingFormSchema.safeParse({
        holder: { ...request_snapshot.holder, name: "4111 1111 1111 1111" },
        travellers: request_snapshot.travellers
      }).success
    ).toBe(false)
    expect(
      bookingFormSchema.safeParse({
        holder: request_snapshot.holder,
        travellers: request_snapshot.travellers
      }).success
    ).toBe(true)
  })
  beforeEach(() => {
    jest.clearAllMocks()
    ;(resolveAgencyEmiliaCredential as jest.Mock).mockResolvedValue({ apiKey: "test-key" })
  })
  it("retains the last detail on partial failure and uses an org-scoped CAS", async () => {
    const previous = query({
      remote_job_id: jobId,
      updated_at: "previous-version",
      result: {
        status: "confirmed",
        items: [
          {
            client_item_id: "a",
            product: "flights",
            status: "confirmed",
            booking_id: "bkg_1",
            detail,
            detail_checked_at: "old-check"
          }
        ]
      }
    })
    const attempt = query()
    const write = query({ id: "tracking" })
    const admin = client(
      jest
        .fn()
        .mockReturnValueOnce(previous)
        .mockReturnValueOnce(attempt)
        .mockReturnValueOnce(write)
    )
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            schema_version: "provider-booking-details.v1",
            job_id: jobId,
            status: "completed",
            request_snapshot,
            result: {
              status: "confirmed",
              items: [
                {
                  client_item_id: "a",
                  product: "flights",
                  status: "confirmed",
                  booking_id: "bkg_1",
                  detail_unavailable: true
                }
              ]
            }
          })
        )
      )
    const result = await syncProviderBooking({
      admin,
      orgId: "org",
      agencyId: "agency",
      booking: { id: "tracking", remote_job_id: jobId }
    })
    expect(result.result.items[0].detail).toEqual(detail)
    expect(result.result.items[0].detail_unavailable).toBe(true)
    expect(result.status).toBe("PENDING")
    expect(write.eq).toHaveBeenCalledWith("updated_at", "previous-version")
    expect(write.eq).toHaveBeenCalledWith("org_id", "org")
    expect(write.eq).toHaveBeenCalledWith("agency_id", "agency")
  })
  it("rejects a response from a different job before saving a snapshot", async () => {
    const previous = query({ remote_job_id: jobId, updated_at: "version", result: null })
    const attempt = query()
    const from = jest.fn().mockReturnValueOnce(previous).mockReturnValueOnce(attempt)
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            schema_version: "provider-booking-details.v1",
            job_id: "22222222-2222-4222-8222-222222222222",
            status: "completed",
            request_snapshot,
            result: { status: "confirmed", items: [] }
          })
        )
      )
    await expect(
      syncProviderBooking({
        admin: client(from),
        orgId: "org",
        agencyId: "agency",
        booking: { id: "tracking", remote_job_id: jobId }
      })
    ).rejects.toThrow("no corresponde")
    expect(from).toHaveBeenCalledTimes(2)
  })
})
