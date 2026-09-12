import { summarizeSegmentBaggage, type SegmentBaggage } from "../flight-baggage"

const baggage: SegmentBaggage = { checked: { included: true, pieces: 1 }, carry_on: { included: false }, personal_item: { included: null } }

it("resume inclusiones uniformes sin inventar franquicias", () => {
  expect(summarizeSegmentBaggage([{ baggage }, { baggage }])).toBe("Despachado: incluido · De mano: no incluido")
  expect(summarizeSegmentBaggage([{ baggage: { ...baggage, checked: { included: null } } }])).toContain("Despachado: a confirmar")
})

it("avisa diferencias de cantidad y por pasajero aunque la inclusión coincida", () => {
  expect(summarizeSegmentBaggage([{ baggage }, { baggage: { ...baggage, checked: { included: true, pieces: 2 } } }])).toBe("Equipaje: varía por tramo")
  expect(summarizeSegmentBaggage([{ baggage }, { baggage: { ...baggage, by_passenger_type: [{ passenger_type: "INF", checked: { included: false } }] } }])).toBe("Equipaje: varía por tramo")
})

it("distingue los datos ausentes de una diferencia confirmada", () => {
  expect(summarizeSegmentBaggage([{ baggage }, {}])).toBe("Equipaje: datos por confirmar por tramo")
  expect(summarizeSegmentBaggage([{}])).toBeNull()
  expect(summarizeSegmentBaggage([])).toBeNull()
})
