export interface CommercialPrice {
  amount: number
  currency: string
  validUntil: string | null
}

export interface CommercialTravelers {
  adults: number
  children: number
  infants: number
}

type SourceRecord = Record<string, unknown>

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0
}

function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null
}

export function operationToCommercialSnapshot(
  row: SourceRecord,
  includePrice: boolean
) {
  const operationAmount = amount(row.sale_amount_total)
  const currency =
    nullableString(row.sale_currency) ?? nullableString(row.currency)

  return {
    type: "operation" as const,
    destination: nullableString(row.destination),
    origin: nullableString(row.origin),
    departureDate: nullableString(row.departure_date),
    returnDate: nullableString(row.return_date),
    checkinDate: nullableString(row.checkin_date),
    checkoutDate: nullableString(row.checkout_date),
    productType: nullableString(row.product_type),
    hotelName: nullableString(row.hotel_name),
    airlineName: nullableString(row.airline_name),
    travelers: {
      adults: count(row.adults),
      children: count(row.children),
      infants: count(row.infants),
    } satisfies CommercialTravelers,
    price:
      includePrice && operationAmount !== null && currency
        ? ({
            amount: operationAmount,
            currency,
            validUntil: null,
          } satisfies CommercialPrice)
        : null,
  }
}

export function quotationToCommercialSnapshot(
  row: SourceRecord,
  includePrice: boolean
) {
  const quotationAmount = amount(row.total_amount)
  const currency = nullableString(row.currency)
  const validUntil = nullableString(row.valid_until)

  return {
    type: "quotation" as const,
    destination: nullableString(row.destination),
    origin: nullableString(row.origin),
    departureDate: nullableString(row.departure_date),
    returnDate: nullableString(row.return_date),
    region: nullableString(row.region),
    packageDescription: nullableString(row.package_description),
    travelers: {
      adults: count(row.adults),
      children: count(row.children),
      infants: count(row.infants),
    } satisfies CommercialTravelers,
    price:
      includePrice && quotationAmount !== null && currency
        ? ({
            amount: quotationAmount,
            currency,
            validUntil,
          } satisfies CommercialPrice)
        : null,
  }
}

export type OperationCommercialSnapshot = ReturnType<
  typeof operationToCommercialSnapshot
>
export type QuotationCommercialSnapshot = ReturnType<
  typeof quotationToCommercialSnapshot
>
export type GrowthCommercialSnapshot =
  | OperationCommercialSnapshot
  | QuotationCommercialSnapshot
  | null

