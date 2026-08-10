import {
  serviceKind,
  formatPassengerDetail,
  sanitizePassengerDetail,
} from "@/lib/operations/service-kind"

describe("serviceKind", () => {
  it("normaliza acentos y sinónimos", () => {
    expect(serviceKind("AÉREO")).toBe("FLIGHT")
    expect(serviceKind("vuelo")).toBe("FLIGHT")
    expect(serviceKind("Alojamiento")).toBe("HOTEL")
    expect(serviceKind("PAQUETE")).toBe("OTHER")
    expect(serviceKind(null)).toBe("OTHER")
  })
})

describe("formatPassengerDetail (VIB-111)", () => {
  it("arma el detalle de hotel con el rango de fechas en dd/MM/yyyy", () => {
    expect(
      formatPassengerDetail(
        {
          hotel_name: "NH Collection",
          room_type: "Doble",
          meal_plan: "Desayuno",
          checkin: "2026-09-01",
          checkout: "2026-09-08",
        },
        "HOTEL"
      )
    ).toBe("NH Collection · Doble · Desayuno · Del 01/09/2026 al 08/09/2026")
  })

  it("omite las partes vacías", () => {
    expect(formatPassengerDetail({ hotel_name: "Sheraton" }, "HOTEL")).toBe("Sheraton")
  })

  it("no muestra el rango si falta una de las dos fechas", () => {
    expect(
      formatPassengerDetail({ hotel_name: "Sheraton", checkin: "2026-09-01" }, "HOTEL")
    ).toBe("Sheraton")
  })

  it("arma el detalle de aéreo", () => {
    expect(
      formatPassengerDetail(
        { airline: "Aerolíneas", flight_info: "AR1234 EZE-MAD", flight_date: "2026-09-01" },
        "FLIGHT"
      )
    ).toBe("Aerolíneas · AR1234 EZE-MAD · 01/09/2026")
  })

  it("para los demás tipos usa el texto libre", () => {
    expect(formatPassengerDetail({ detail: "Paquete completo" }, "OTHER")).toBe(
      "Paquete completo"
    )
  })

  it("tolera null, undefined y valores no objeto", () => {
    expect(formatPassengerDetail(null, "HOTEL")).toBe("")
    expect(formatPassengerDetail(undefined, "FLIGHT")).toBe("")
    expect(formatPassengerDetail("texto suelto", "OTHER")).toBe("")
  })
})

describe("sanitizePassengerDetail", () => {
  it("descarta strings vacíos y devuelve null si no queda nada", () => {
    expect(sanitizePassengerDetail({ hotel_name: "  ", room_type: "" })).toBeNull()
    expect(sanitizePassengerDetail({ hotel_name: " NH ", room_type: "" })).toEqual({
      hotel_name: "NH",
    })
  })
})
