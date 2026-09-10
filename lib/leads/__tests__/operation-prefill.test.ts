import {
  buildLeadPrefill,
  cleanLeadDestination,
  selectUntouchedPrefill,
} from "@/lib/leads/operation-prefill"

describe("cleanLeadDestination", () => {
  it("descarta estados del pipeline que llegan en el campo destino", () => {
    expect(cleanLeadDestination("Presupuesto enviado")).toBe("")
    expect(cleanLeadDestination("WON")).toBe("")
    expect(cleanLeadDestination("Seguimiento")).toBe("")
  })

  it("descarta handles, emails, usernames y números", () => {
    expect(cleanLeadDestination("@juanviajes")).toBe("")
    expect(cleanLeadDestination("juan@gmail.com")).toBe("")
    expect(cleanLeadDestination("juanperez")).toBe("")
    expect(cleanLeadDestination("541199998888")).toBe("")
  })

  it("conserva un destino real", () => {
    expect(cleanLeadDestination("Cancún")).toBe("Cancún")
    expect(cleanLeadDestination("Rio de Janeiro")).toBe("Rio de Janeiro")
  })

  it("descarta destinos con dígitos o símbolos", () => {
    expect(cleanLeadDestination("Cancún x2")).toBe("")
    expect(cleanLeadDestination("Brasil - 3 noches")).toBe("")
  })

  it("tolera vacío y null", () => {
    expect(cleanLeadDestination(null)).toBe("")
    expect(cleanLeadDestination(undefined)).toBe("")
    expect(cleanLeadDestination("")).toBe("")
  })
})

describe("buildLeadPrefill", () => {
  it("mapea los campos del lead al formulario", () => {
    const prefill = buildLeadPrefill({
      agency_id: "ag-1",
      assigned_seller_id: "seller-1",
      destination: "Cancún",
      quoted_price: "3500.50",
      deposit_currency: "ARS",
      notes: "quiere salir en enero",
    })

    expect(prefill).toMatchObject({
      agency_id: "ag-1",
      seller_id: "seller-1",
      destination: "Cancún",
      sale_amount_total: 3500.5,
      currency: "ARS",
      sale_currency: "ARS",
      operator_cost_currency: "ARS",
      passenger_notes: "quiere salir en enero",
    })
  })

  it("cae en USD salvo que el lead diga ARS", () => {
    expect(buildLeadPrefill({ deposit_currency: null }).currency).toBe("USD")
    expect(buildLeadPrefill({ deposit_currency: "USD" }).currency).toBe("USD")
    expect(buildLeadPrefill({ deposit_currency: "ARS" }).currency).toBe("ARS")
  })

  it("ignora un presupuesto no numérico o negativo", () => {
    expect(buildLeadPrefill({ quoted_price: "no se" }).sale_amount_total).toBe(0)
    expect(buildLeadPrefill({ quoted_price: -100 }).sale_amount_total).toBe(0)
    expect(buildLeadPrefill({ quoted_price: null }).sale_amount_total).toBe(0)
  })

  it("no precarga una fecha de salida pasada", () => {
    // Una fecha vieja pasaría la validación del form y recién explotaría en el
    // submit, después de cargar todo.
    expect(buildLeadPrefill({ estimated_departure_date: "2020-01-01" }).departure_date)
      .toBeUndefined()
  })

  it("precarga una fecha de salida futura", () => {
    expect(buildLeadPrefill({ estimated_departure_date: "2090-01-01" }).departure_date)
      .toBeInstanceOf(Date)
  })
})

describe("selectUntouchedPrefill", () => {
  const prefill = buildLeadPrefill({
    agency_id: "ag-1",
    assigned_seller_id: "seller-1",
    destination: "Cancún",
    quoted_price: 3000,
    deposit_currency: "USD",
    notes: "nota del lead",
  })

  it("no pisa un campo que el usuario ya tocó", () => {
    const applied = selectUntouchedPrefill(prefill, {
      destination: true,
      sale_amount_total: true,
    })

    expect(applied.destination).toBeUndefined()
    expect(applied.sale_amount_total).toBeUndefined()
    // Lo no tocado sí se completa.
    expect(applied.passenger_notes).toBe("nota del lead")
    expect(applied.agency_id).toBe("ag-1")
  })

  it("con el formulario intacto aplica todo lo que el lead trae", () => {
    const applied = selectUntouchedPrefill(prefill, {})

    expect(applied).toMatchObject({
      agency_id: "ag-1",
      seller_id: "seller-1",
      destination: "Cancún",
      sale_amount_total: 3000,
      currency: "USD",
      passenger_notes: "nota del lead",
    })
  })

  it("un valor vacío del lead no borra lo que ya estaba", () => {
    const flaco = buildLeadPrefill({ destination: "@usuario", quoted_price: null, notes: null })
    const applied = selectUntouchedPrefill(flaco, {})

    expect(applied.destination).toBeUndefined()
    expect(applied.sale_amount_total).toBeUndefined()
    expect(applied.passenger_notes).toBeUndefined()
    // La moneda tiene default real, así que sí se aplica.
    expect(applied.currency).toBe("USD")
  })
})
