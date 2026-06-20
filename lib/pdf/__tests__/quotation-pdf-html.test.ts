import {
  isHtmlQuotePdfEligible,
  renderQuotationHtmlDocument,
} from "@/lib/pdf/quotation-pdf-html"
import type { QuotationPresentationData } from "@/lib/quotations/presentation"

function makeQuotation(
  overrides: Partial<QuotationPresentationData> = {}
): QuotationPresentationData {
  return {
    quotation_number: "COT-100",
    destination: "Madrid",
    origin: "Buenos Aires",
    region: "EUROPA",
    departure_date: "2026-07-01",
    return_date: "2026-07-10",
    valid_until: "2026-06-30",
    adults: 2,
    children: 0,
    infants: 0,
    currency: "USD",
    pricing_mode: "GROUP_TOTAL",
    insurance_amount: 0,
    transfer_amount: 0,
    status: "DRAFT",
    created_at: "2026-06-20T12:00:00.000Z",
    seller_name: "Ana",
    agency_name: "Vibook",
    options: [
      {
        id: "option-1",
        option_number: 1,
        title: "Opción 1",
        total_amount: 2500,
        is_selected: false,
        items: [
          {
            id: "flight-1",
            item_type: "FLIGHT",
            description: "Vuelo a Madrid",
            quantity: 2,
            airline: "Aerolíneas <Test>",
            flight_date: "2026-07-01",
            flight_return_date: "2026-07-10",
            flight_details: {
              legs: [
                {
                  departure: {
                    city_code: "EZE",
                    city_name: "Buenos Aires",
                    time: "22:00",
                  },
                  arrival: {
                    city_code: "MAD",
                    city_name: "Madrid",
                    time: "14:00",
                  },
                  duration: "12h",
                  flight_type: "outbound",
                  layovers: [],
                },
              ],
            },
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe("quotation PDF HTML template selection", () => {
  it("uses the new template for structured flight quotations created from leads", () => {
    expect(isHtmlQuotePdfEligible(makeQuotation())).toBe(true)
  })

  it("keeps the legacy fallback for unsupported quotation items", () => {
    const quotation = makeQuotation({
      options: [
        {
          id: "option-1",
          option_number: 1,
          title: "Opción 1",
          total_amount: 300,
          is_selected: false,
          items: [
            {
              item_type: "EXCURSION",
              description: "City tour",
              quantity: 1,
            },
          ],
        },
      ],
    })

    expect(isHtmlQuotePdfEligible(quotation)).toBe(false)
  })

  it("renders the same branded HTML document used by the PDF download", () => {
    const html = renderQuotationHtmlDocument(makeQuotation(), {
      company_name: "Agencia Nueva",
      brand_color: "#f97316",
    })

    expect(html).toContain("data-pdf-page")
    expect(html).toContain("Agencia Nueva")
    expect(html).toContain("Aerolíneas &lt;Test&gt;")
    expect(html).not.toContain("Aerolíneas <Test>")
  })
})
