import { z } from "zod"

const text = z.string()
const nullableText = text.nullable().optional()
const money = z.object({ amount: text, currency: text })
const document = z.object({
  type: text.optional(),
  number: text.optional(),
  nationality: text.optional(),
  country: text.optional(),
  issueDate: text.optional(),
  expiryDate: text.optional()
})
const contact = z.object({
  mails: z.array(text),
  phones: z.array(z.object({ countryPref: text, number: text })),
  type: text.optional()
})
const profileFields = {
  name: text,
  title: text.optional(),
  gender: text.optional(),
  birthDate: text.optional(),
  age: z.number().optional(),
  contact: contact.optional(),
  documents: z.array(document).optional(),
  code: text.optional(),
  sourceId: text.optional(),
  inBooking: z.boolean().optional(),
  index: z.number().optional(),
  isUnaccompaniedMinor: z.boolean().optional()
}
const holder = z.object({ ...profileFields, surnames: z.array(text) })
const traveller = holder.extend({ type: text })
const guest = z.object({ ...profileFields, surname: text })

// Same allowlisted operational projection as Delfos. Unknown fields are stripped
// at both integration boundaries; raw responses and credentials never reach the UI.
export const bookingDetailSchema = z.object({
  id: text,
  type: z.enum(["flight", "hotel"]),
  provider: text,
  status: text,
  locator: text,
  reference: nullableText,
  contactName: nullableText,
  agencyId: text,
  agencyName: text,
  bookingGroupId: nullableText,
  priceTotal: text,
  priceCurrency: text,
  paymentMethod: nullableText,
  createdAt: text,
  confirmedAt: nullableText,
  cancelledAt: nullableText,
  hotelCode: nullableText,
  hotelName: nullableText,
  chainCode: nullableText,
  checkIn: nullableText,
  checkOut: nullableText,
  thirdLocator: nullableText,
  providerBookingId: nullableText,
  lastTicketDate: nullableText,
  requiresImmediateTicketing: z.boolean().nullable().optional(),
  roomTypeCode: text.optional(),
  ratePlanCode: text.optional(),
  mealPlanCodes: text.optional(),
  rooms: z.array(z.object({ adults: z.number(), childrenAges: z.array(z.number()) })).optional(),
  cancelPoliciesSnapshot: z.unknown().optional(),
  cancellationCost: money.optional(),
  guaranteePayment: money.optional(),
  guests: z.array(guest).optional(),
  guestsRequest: z.array(guest).optional(),
  guestsProviderEcho: z.array(guest).optional(),
  travellersEcho: z.array(traveller).optional(),
  travellersRequest: z.array(traveller).optional(),
  travellersProviderEcho: z.array(traveller).optional(),
  holderEcho: holder.nullable().optional(),
  holderRequest: holder.optional(),
  holderProviderEcho: holder.nullable().optional(),
  itinerary: z
    .object({
      segments: z.array(
        z.object({
          origin: text,
          dest: text,
          carrier: text,
          flightNumber: text,
          cabin: text.optional(),
          departureDateTime: text,
          arrivalDateTime: text
        })
      )
    })
    .optional(),
  fareBreakdown: z
    .object({
      fares: z.array(
        z.object({
          passengerType: text,
          passengerTypeNormalized: text.optional(),
          quantity: z.number().optional(),
          currency: text.optional(),
          base: text.optional(),
          totalTaxes: text.optional(),
          amount: text.optional(),
          total: text.optional()
        })
      ),
      taxes: z.array(
        z.object({
          passengerType: text,
          passengerTypeNormalized: text.optional(),
          code: text,
          amount: text,
          currency: text.optional()
        })
      )
    })
    .optional(),
  paymentFlags: z
    .object({
      paymentInBooking: z.boolean().optional(),
      needCardPaymentInBooking: z.boolean().optional(),
      paymentRedirectType: text.optional()
    })
    .optional(),
  bookingRequirements: z
    .object({
      needsDocumentInfo: z.boolean().optional(),
      needsContactAddress: z.boolean().optional(),
      needsRuc: z.boolean().optional(),
      needsCtcl: z.boolean().optional(),
      acceptedCardTypes: z.array(text).optional()
    })
    .optional(),
  paymentMethods: z
    .array(
      z.object({
        type: text.optional(),
        cash: z.boolean().optional(),
        cardApply: text.optional(),
        hasServiceFeeForTpv: z.boolean().optional(),
        includeServiceFeeCC: z.boolean().optional()
      })
    )
    .optional(),
  manualServices: z
    .array(
      z.object({
        id: text,
        serviceType: text,
        description: text,
        serviceProvider: nullableText,
        cost: text,
        currency: text,
        dateFrom: nullableText,
        dateTo: nullableText,
        notes: nullableText
      })
    )
    .optional(),
  servicesSubtotal: money.nullable().optional(),
  compositeTotal: money.nullable().optional(),
  fxNote: nullableText
})

export type BookingDetail = z.infer<typeof bookingDetailSchema>

export const reservationItemSchema = z.object({
  client_item_id: text,
  product: z.enum(["flights", "hotels"]),
  status: text,
  booking_id: text.optional(),
  locator: text.optional(),
  provider_status: text.optional(),
  previous_price: z.object({ amount: z.number(), currency: text }).optional(),
  current_price: z.object({ amount: z.number(), currency: text }).optional(),
  detail: bookingDetailSchema.optional(),
  detail_unavailable: z.boolean().optional(),
  detail_checked_at: text.optional()
})

export const reservationResultSchema = z.object({
  status: text,
  booking_group_id: text.nullable().optional(),
  items: z.array(reservationItemSchema)
})
export type ReservationItem = z.infer<typeof reservationItemSchema>
