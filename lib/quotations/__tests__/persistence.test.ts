import {
  insertQuotationOptionsOrThrow,
  QuotationStructurePersistenceError,
  type PreparedQuotationOption,
} from "../persistence"

interface SupabaseMockConfig {
  optionInsertErrors?: Record<number, string>
  itemInsertErrors?: Record<number, string>
  deleteError?: string
}

function createPreparedOptions(): PreparedQuotationOption[] {
  return [
    {
      title: "Opción 1",
      total_amount: 2500,
      calculated_total_amount: 2500,
      manual_total_amount: null,
      items: [
        {
          item_type: "FLIGHT",
          description: "Vuelo Rosario - San Andrés",
          quantity: 2,
          unit_price: 1250,
          sale_amount: 1250,
          cost_amount: 1000,
          cost_currency: "USD",
          subtotal: 2500,
          operator_id: null,
          generates_commission: false,
          provider: "Operador Test",
          destination_city: "San Andrés",
          hotel_name: null,
          hotel_stars: null,
          hotel_address: null,
          hotel_phone: null,
          hotel_photo_url: null,
          room_type: null,
          meal_plan: null,
          checkin_date: null,
          checkout_date: null,
          nights: null,
          rooms: 1,
          airline: "Aerolínea Test",
          flight_route: "ROS - ADZ",
          flight_date: "2026-05-29",
          flight_return_date: "2026-06-05",
          flight_stops: 0,
          flight_class: "ECONOMY",
          flight_screenshot_url: null,
          transfer_description: null,
          notes: null,
          admin_fee_percentage: 0,
          cost_calculation_mode: 'SIMPLE',
          gross_price: null,
          commission_percentage: 0,
        },
      ],
    },
    {
      title: "Opción 2",
      total_amount: 2600,
      calculated_total_amount: 2600,
      manual_total_amount: null,
      items: [],
    },
  ]
}

function createSupabaseMock(config: SupabaseMockConfig = {}) {
  let optionInsertCall = 0
  let itemInsertCall = 0

  const state = {
    optionInsertPayloads: [] as any[],
    itemInsertPayloads: [] as any[],
    deleteCalls: [] as Array<Record<string, unknown>>,
  }

  return {
    state,
    from(table: string) {
      if (table === "quotation_options") {
        return {
          insert(payload: any) {
            state.optionInsertPayloads.push(payload)
            const callNumber = ++optionInsertCall

            return {
              select() {
                return {
                  single: async () => {
                    const message = config.optionInsertErrors?.[callNumber]
                    if (message) {
                      return { data: null, error: { message } }
                    }

                    return {
                      data: { id: `opt-${callNumber}` },
                      error: null,
                    }
                  },
                }
              },
            }
          },
          delete() {
            return {
              in(field: string, values: string[]) {
                return {
                  eq: async (eqField: string, eqValue: string) => {
                    state.deleteCalls.push({
                      table,
                      field,
                      values,
                      eqField,
                      eqValue,
                    })

                    return {
                      error: config.deleteError ? { message: config.deleteError } : null,
                    }
                  },
                }
              },
            }
          },
        }
      }

      if (table === "quotation_items") {
        return {
          insert: async (payload: any) => {
            state.itemInsertPayloads.push(payload)
            const callNumber = ++itemInsertCall
            const message = config.itemInsertErrors?.[callNumber]

            return {
              error: message ? { message } : null,
            }
          },
        }
      }

      throw new Error(`Unexpected table mock: ${table}`)
    },
  }
}

describe("quotation persistence helpers", () => {
  it("persists quotation options and items successfully", async () => {
    const supabase = createSupabaseMock()
    const preparedOptions = createPreparedOptions()

    const result = await insertQuotationOptionsOrThrow({
      supabase,
      quotationId: "quote-1",
      currency: "USD",
      preparedOptions,
    })

    expect(result.optionIds).toEqual(["opt-1", "opt-2"])
    expect(supabase.state.optionInsertPayloads).toHaveLength(2)
    expect(supabase.state.itemInsertPayloads).toHaveLength(1)
    expect(supabase.state.itemInsertPayloads[0][0]).toMatchObject({
      quotation_id: "quote-1",
      option_id: "opt-1",
      currency: "USD",
      subtotal: 2500,
      flight_route: "ROS - ADZ",
    })
    expect(supabase.state.deleteCalls).toEqual([])
  })

  it("cleans up inserted options if a later option insert fails", async () => {
    const supabase = createSupabaseMock({
      optionInsertErrors: {
        2: "column quotation_options.calculated_total_amount does not exist",
      },
    })

    await expect(
      insertQuotationOptionsOrThrow({
        supabase,
        quotationId: "quote-2",
        currency: "USD",
        preparedOptions: createPreparedOptions(),
      })
    ).rejects.toMatchObject({
      name: "QuotationStructurePersistenceError",
      code: "option_insert_failed",
      context: expect.objectContaining({
        quotationId: "quote-2",
        optionNumber: 2,
      }),
    })

    expect(supabase.state.deleteCalls).toEqual([
      expect.objectContaining({
        table: "quotation_options",
        values: ["opt-1"],
        eqValue: "quote-2",
      }),
    ])
  })

  it("cleans up inserted options if item persistence fails", async () => {
    const supabase = createSupabaseMock({
      itemInsertErrors: {
        1: "insert into quotation_items failed",
      },
    })

    try {
      await insertQuotationOptionsOrThrow({
        supabase,
        quotationId: "quote-3",
        currency: "USD",
        preparedOptions: createPreparedOptions(),
      })
      throw new Error("Expected insertQuotationOptionsOrThrow to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(QuotationStructurePersistenceError)
      expect(error).toMatchObject({
        code: "item_insert_failed",
        context: expect.objectContaining({
          quotationId: "quote-3",
          optionId: "opt-1",
          optionNumber: 1,
          itemCount: 1,
        }),
      })
    }

    expect(supabase.state.deleteCalls).toEqual([
      expect.objectContaining({
        table: "quotation_options",
        values: ["opt-1"],
        eqValue: "quote-3",
      }),
    ])
  })
})
