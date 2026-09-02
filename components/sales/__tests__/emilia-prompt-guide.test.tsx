import { render, screen } from "@testing-library/react"
import { EmiliaPromptGuide } from "../emilia-prompt-guide"

describe("EmiliaPromptGuide", () => {
  it("explica con lenguaje concreto cómo preparar el primer pedido", () => {
    const { container } = render(<EmiliaPromptGuide />)

    expect(screen.getByRole("note", { name: /cómo pedirle una cotización a Emilia/i })).toBeInTheDocument()
    expect(screen.getByText(/vuelos, hoteles o ambos/i)).toBeInTheDocument()
    expect(screen.getByText(/Cotizá vuelos ida y vuelta de Buenos Aires a Cancún/i)).toBeInTheDocument()
    expect(screen.getByText(/Cotizá hotel en Cancún/i)).toBeInTheDocument()
    expect(screen.getByText(/Cotizá vuelo y hotel a Aruba/i)).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/presupuesto|carry on/i)
    expect(container.querySelector('[data-tour="emilia.prompt-guide"]')).toBeInTheDocument()
  })
})
