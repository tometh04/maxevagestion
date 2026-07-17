import { act, render, screen } from "@testing-library/react"
import {
  GenerationProgress,
  estimatedGenerationProgress,
  generationStepIndex,
} from "@/components/growth-studio/generation-progress"

describe("GenerationProgress", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date("2026-07-16T12:00:00Z"))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("muestra progreso estimado y cambia la leyenda mientras genera una imagen", () => {
    render(<GenerationProgress kind="image" />)

    expect(
      screen.getByText("Creando una imagen que invite a viajar")
    ).toBeInTheDocument()
    expect(screen.getByText("Trazando el destino ideal…")).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "10")

    act(() => {
      jest.advanceTimersByTime(4_500)
    })

    expect(
      screen.getByText("Buscando una luz que despierte ganas de viajar…")
    ).toBeInTheDocument()
    expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))).toBeGreaterThan(10)
  })

  it("mantiene el progreso pendiente por debajo de 100%", () => {
    expect(estimatedGenerationProgress(0)).toBe(10)
    expect(estimatedGenerationProgress(300_000)).toBe(92)
    expect(generationStepIndex(300_000, 6)).toBe(5)
  })
})
