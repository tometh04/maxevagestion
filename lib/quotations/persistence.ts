import {
  getQuotationOptionCalculatedTotal,
  getQuotationOptionCostTotal,
  normalizeManualQuotationTotal,
  roundQuotationMoney,
} from "@/lib/quotations/totals"

export interface PreparedQuotationItem {
  item_type: string
  description: string
  quantity: number
  unit_price: number
  sale_amount: number
  cost_amount: number
  cost_currency: string
  subtotal: number
  operator_id: string | null
  generates_commission: boolean
  provider: string | null
  destination_city: string | null
  hotel_name: string | null
  hotel_stars: number | null
  hotel_address: string | null
  hotel_phone: string | null
  hotel_photo_url: string | null
  room_type: string | null
  meal_plan: string | null
  checkin_date: string | null
  checkout_date: string | null
  nights: number | null
  rooms: number
  airline: string | null
  flight_route: string | null
  flight_date: string | null
  flight_return_date: string | null
  flight_stops: number
  flight_class: string | null
  flight_screenshot_url: string | null
  transfer_description: string | null
  notes: string | null
}

export interface PreparedQuotationOption {
  title: string
  total_amount: number
  calculated_total_amount: number
  manual_total_amount: number | null
  items: PreparedQuotationItem[]
}

function toOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function prepareQuotationItem(rawItem: any, fallbackCurrency: string): PreparedQuotationItem {
  const quantity = Math.max(1, Number(rawItem?.quantity || 1))
  const saleAmount = roundQuotationMoney(Number(rawItem?.sale_amount ?? rawItem?.unit_price ?? 0))
  const costAmount = roundQuotationMoney(Number(rawItem?.cost_amount || 0))

  return {
    item_type: rawItem?.item_type || "OTHER",
    description: rawItem?.description || "",
    quantity,
    unit_price: saleAmount,
    sale_amount: saleAmount,
    cost_amount: costAmount,
    cost_currency: rawItem?.cost_currency || fallbackCurrency,
    subtotal: roundQuotationMoney(saleAmount * quantity),
    operator_id: rawItem?.operator_id || null,
    generates_commission: Boolean(rawItem?.generates_commission),
    provider: rawItem?.provider || null,
    destination_city: rawItem?.destination_city || null,
    hotel_name: rawItem?.hotel_name || null,
    hotel_stars: toOptionalNumber(rawItem?.hotel_stars),
    hotel_address: rawItem?.hotel_address || null,
    hotel_phone: rawItem?.hotel_phone || null,
    hotel_photo_url: rawItem?.hotel_photo_url || null,
    room_type: rawItem?.room_type || null,
    meal_plan: rawItem?.meal_plan || null,
    checkin_date: rawItem?.checkin_date || null,
    checkout_date: rawItem?.checkout_date || null,
    nights: toOptionalNumber(rawItem?.nights),
    rooms: Math.max(1, Number(rawItem?.rooms || 1)),
    airline: rawItem?.airline || null,
    flight_route: rawItem?.flight_route || null,
    flight_date: rawItem?.flight_date || null,
    flight_return_date: rawItem?.flight_return_date || null,
    flight_stops: Math.max(0, Number(rawItem?.flight_stops ?? 0)),
    flight_class: rawItem?.flight_class || null,
    flight_screenshot_url: rawItem?.flight_screenshot_url || null,
    transfer_description: rawItem?.transfer_description || null,
    notes: rawItem?.notes || null,
  }
}

export function prepareQuotationOptionsForPersistence(rawOptions: any[], fallbackCurrency: string): PreparedQuotationOption[] {
  return (Array.isArray(rawOptions) ? rawOptions : []).map((rawOption: any, index: number) => {
    const title = rawOption?.title || `Opción ${index + 1}`
    const items = (Array.isArray(rawOption?.items) ? rawOption.items : []).map((item: any) =>
      prepareQuotationItem(item, fallbackCurrency)
    )

    const calculatedTotal = getQuotationOptionCalculatedTotal(items)
    const costTotal = getQuotationOptionCostTotal(items)
    const requestedTotal = normalizeManualQuotationTotal(rawOption?.total_amount)
    const explicitManualTotal = normalizeManualQuotationTotal(rawOption?.manual_total_amount)
    const manualTotal = explicitManualTotal ?? (
      requestedTotal != null && Math.abs(requestedTotal - calculatedTotal) > 0.001
        ? requestedTotal
        : null
    )

    if (manualTotal != null && manualTotal < costTotal) {
      throw new Error(`El precio final manual de "${title}" no puede quedar por debajo del costo total de la opción.`)
    }

    return {
      title,
      calculated_total_amount: calculatedTotal,
      manual_total_amount: manualTotal,
      total_amount: manualTotal ?? calculatedTotal,
      items,
    }
  })
}
