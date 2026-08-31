import { render, screen } from "@testing-library/react"
import { EmiliaPromptGuide } from "../emilia-prompt-guide"

describe("EmiliaPromptGuide", () => {
  it("explica con lenguaje concreto cómo preparar el primer pedido", () => {
    const { container } = render(<EmiliaPromptGuide />)

    expect(screen.getByRole("note", { name: /cómo pedirle una cotización a Emilia/i })).toBeInTheDocument()
    expect(screen.getByText(/origen, destino, fechas o noches, pasajeros/i)).toBeInTheDocument()
    expect(screen.getByText(/Buenos Aires a Cancún/i)).toBeInTheDocument()
    expect(container.querySelector('[data-tour="emilia.prompt-guide"]')).toBeInTheDocument()
  })
})
