import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { toast } from "sonner"
import { QuotationBookingDialog } from "@/components/sales/quotation-booking-dialog"

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

describe("QuotationBookingDialog", () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it("reserva la opción exacta del refresh de precio confirmado", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { file_code: "OP-001", provider_booking: { job_id: "job-1" } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { status: "CONFIRMED", result: { status: "confirmed" } } }),
      })
    global.fetch = fetchMock as typeof fetch

    render(
      <QuotationBookingDialog
        open
        onOpenChange={jest.fn()}
        onQueued={jest.fn()}
        quotation={{
          id: "11111111-1111-4111-8111-111111111111",
          adults: 1,
          children: 0,
          infants: 0,
          quotation_options: [
            { id: "22222222-2222-4222-8222-222222222222", title: "Opción 1", total_amount: 1000 },
          ],
          price_confirmation: {
            confirmed: true,
            run_id: "33333333-3333-4333-8333-333333333333",
          },
        }}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Convertir y reservar" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, request] = fetchMock.mock.calls[0]
    const body = JSON.parse(request.body)
    expect(body.price_refresh_run_id).toBe("33333333-3333-4333-8333-333333333333")
    expect(body.option_id).toBe("22222222-2222-4222-8222-222222222222")
    expect(fetchMock.mock.calls[1][0]).toBe("/api/quotations/11111111-1111-4111-8111-111111111111/provider-booking")
    expect(toast.success).toHaveBeenCalledWith("Reserva confirmada en Delfos.")
  })
})
