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
  flight_details: Record<string, unknown> | null
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

export interface PersistQuotationOptionsArgs {
  supabase: any
  quotationId: string
  currency: string
  preparedOptions: PreparedQuotationOption[]
}

export interface PersistQuotationOptionsResult {
  optionIds: string[]
}

export class QuotationStructurePersistenceError extends Error {
  code: string
  context: Record<string, unknown>

  constructor(message: string, code: string, context: Record<string, unknown> = {}) {
    super(message)
    this.name = "QuotationStructurePersistenceError"
    this.code = code
    this.context = context
  }
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
    flight_details: rawItem?.flight_details ?? null,
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

function buildQuotationItemsInsertPayload(
  quotationId: string,
  optionId: string,
  items: PreparedQuotationItem[],
  currency: string
) {
  return items.map((item, idx) => ({
    quotation_id: quotationId,
    option_id: optionId,
    item_type: item.item_type || "OTHER",
    description: item.description || "",
    quantity: item.quantity || 1,
    unit_price: item.unit_price || item.sale_amount || 0,
    sale_amount: item.sale_amount || item.unit_price || 0,
    cost_amount: item.cost_amount || 0,
    cost_currency: item.cost_currency || currency,
    subtotal: item.subtotal || 0,
    currency,
    operator_id: item.operator_id || null,
    generates_commission: item.generates_commission || false,
    order_index: idx,
    notes: item.notes || null,
    destination_city: item.destination_city || null,
    hotel_name: item.hotel_name || null,
    hotel_stars: item.hotel_stars || null,
    hotel_address: item.hotel_address || null,
    hotel_phone: item.hotel_phone || null,
    hotel_photo_url: item.hotel_photo_url || null,
    room_type: item.room_type || null,
    meal_plan: item.meal_plan || null,
    checkin_date: item.checkin_date || null,
    checkout_date: item.checkout_date || null,
    nights: item.nights || null,
    rooms: item.rooms || 1,
    airline: item.airline || null,
    flight_route: item.flight_route || null,
    flight_date: item.flight_date || null,
    flight_return_date: item.flight_return_date || null,
    flight_stops: item.flight_stops != null ? Number(item.flight_stops) : 0,
    flight_class: item.flight_class || null,
    flight_details: item.flight_details ?? null,
    flight_screenshot_url: item.flight_screenshot_url || null,
    transfer_description: item.transfer_description || null,
  }))
}

export async function cleanupInsertedQuotationOptions(
  supabase: any,
  optionIds: string[],
  quotationId?: string
) {
  if (!Array.isArray(optionIds) || optionIds.length === 0) {
    return
  }

  const query = supabase.from("quotation_options").delete().in("id", optionIds)
  const scopedQuery = quotationId ? query.eq("quotation_id", quotationId) : query
  const { error } = await scopedQuery

  if (error) {
    throw new QuotationStructurePersistenceError(
      "No se pudo limpiar la estructura parcial de la cotización.",
      "cleanup_failed",
      { quotationId, optionIds, cause: error.message }
    )
  }
}

export async function insertQuotationOptionsOrThrow({
  supabase,
  quotationId,
  currency,
  preparedOptions,
}: PersistQuotationOptionsArgs): Promise<PersistQuotationOptionsResult> {
  const insertedOptionIds: string[] = []

  for (let i = 0; i < preparedOptions.length; i++) {
    const opt = preparedOptions[i]
    const optionNumber = i + 1

    const { data: option, error: optionError } = await supabase
      .from("quotation_options")
      .insert({
        quotation_id: quotationId,
        option_number: optionNumber,
        title: opt.title || `Opción ${optionNumber}`,
        total_amount: opt.total_amount,
        calculated_total_amount: opt.calculated_total_amount,
        manual_total_amount: opt.manual_total_amount,
      })
      .select()
      .single()

    if (optionError || !option) {
      try {
        await cleanupInsertedQuotationOptions(supabase, insertedOptionIds, quotationId)
      } catch (cleanupError) {
        throw cleanupError
      }

      throw new QuotationStructurePersistenceError(
        `No se pudo guardar la opción ${optionNumber} de la cotización.`,
        "option_insert_failed",
        {
          quotationId,
          optionNumber,
          optionTitle: opt.title,
          cause: optionError?.message || "option_insert_returned_empty",
        }
      )
    }

    insertedOptionIds.push(option.id)

    if (Array.isArray(opt.items) && opt.items.length > 0) {
      const itemsToInsert = buildQuotationItemsInsertPayload(quotationId, option.id, opt.items, currency)
      let { error: itemsError } = await supabase
        .from("quotation_items")
        .insert(itemsToInsert)

      // Resiliencia: si la migración de flight_details (jsonb) todavía no se
      // aplicó, el insert falla por columna inexistente. Reintentamos sin ese
      // campo para no romper la creación de la cotización (el resto sí se guarda).
      if (itemsError && /flight_details/i.test(itemsError.message || "")) {
        const stripped = itemsToInsert.map((it: any) => {
          const { flight_details, ...rest } = it
          return rest
        })
        ;({ error: itemsError } = await supabase.from("quotation_items").insert(stripped))
      }

      if (itemsError) {
        try {
          await cleanupInsertedQuotationOptions(supabase, insertedOptionIds, quotationId)
        } catch (cleanupError) {
          throw cleanupError
        }

        throw new QuotationStructurePersistenceError(
          `No se pudieron guardar los ítems de la opción ${optionNumber}.`,
          "item_insert_failed",
          {
            quotationId,
            optionId: option.id,
            optionNumber,
            itemCount: opt.items.length,
            cause: itemsError.message,
          }
        )
      }
    }
  }

  return { optionIds: insertedOptionIds }
}
