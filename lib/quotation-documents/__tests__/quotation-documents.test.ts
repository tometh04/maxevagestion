import {
  createDefaultManifest,
  cloneQuotationJson,
  getQuotationLayoutCatalog,
  KYO_2026_MANIFEST,
  KYO_FULL_ITINERARY_FIXTURE,
  quotationModelManifestSchema,
  renderQuotationDocument,
  VIBOOK_STANDARD_MANIFEST,
  withSelectedQuotationOption,
} from "@/lib/quotation-documents"

describe("quotation-documents deep module", () => {
  it("registers the system fallback and the reusable editorial layout", () => {
    expect(getQuotationLayoutCatalog()).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "vibook-standard-v1", version: 1 }),
      expect.objectContaining({ key: "editorial-right-rail-v1", version: 1 }),
    ]))
  })

  it("only accepts a safe manifest vocabulary", () => {
    expect(() => quotationModelManifestSchema.parse({
      ...KYO_2026_MANIFEST,
      html: "<script>alert(1)</script>",
    })).toThrow()

    expect(() => quotationModelManifestSchema.parse({
      ...KYO_2026_MANIFEST,
      assets: { backgroundPath: "https://attacker.example/template.html" },
    })).toThrow()
  })

  it("creates an independent manifest copy for authoring", () => {
    const first = createDefaultManifest("editorial-right-rail-v1")
    const second = createDefaultManifest("editorial-right-rail-v1")
    first.copy.documentTitle = "Cambio local"
    expect(second.copy.documentTitle).toBe("Propuesta de viaje")
  })

  it("overlays the live accepted option without mutating the issued snapshot", () => {
    const original = cloneQuotationJson(KYO_FULL_ITINERARY_FIXTURE)
    const selectedId = original.options[1].id
    const projected = withSelectedQuotationOption(original, selectedId)

    expect(projected.options.find(option => option.id === selectedId)?.selected).toBe(true)
    expect(projected.options.filter(option => option.selected)).toHaveLength(1)
    expect(original.options[1].selected).toBe(false)
  })

  it("renders the KYO reference as a multipage A4 document with its original artwork", () => {
    const document = renderQuotationDocument({
      model: KYO_FULL_ITINERARY_FIXTURE,
      manifest: KYO_2026_MANIFEST,
    })

    expect(document.layoutKey).toBe("editorial-right-rail-v1")
    expect(document.pageCount).toBeGreaterThanOrEqual(6)
    expect(document.html).toContain("/quotation-models/kyo-2026/background.jpg")
    expect(document.html).toContain("SAN PEDRO DE ATACAMA + SALAR DE UYUNI")
    expect(document.html).toContain("Información importante")
    expect(document.html).toContain("kyo-combined-closing")
    expect((document.html.match(/data-pdf-page=/g) || [])).toHaveLength(document.pageCount)
    expect(document.html).toMatch(/\.kyo-page::before\{[^}]*background-image/)
    expect(document.html.match(/\/quotation-models\/kyo-2026\/background\.jpg/g)).toHaveLength(1)
    expect(document.html).not.toContain("kyo-page-art")
  })

  it("renders every option instead of truncating at three", () => {
    const document = renderQuotationDocument({
      model: KYO_FULL_ITINERARY_FIXTURE,
      manifest: VIBOOK_STANDARD_MANIFEST,
    })

    expect(document.html).toContain("Programa recomendado")
    for (let option = 2; option <= 4; option += 1) expect(document.html).toContain(`Alternativa ${option}`)
  })

  it("does not multiply GROUP_TOTAL prices by passenger count", () => {
    const document = renderQuotationDocument({
      model: KYO_FULL_ITINERARY_FIXTURE,
      manifest: KYO_2026_MANIFEST,
    })

    expect(document.html).toContain("USD 5.050,00")
    expect(document.html).not.toContain("USD 10.100,00")
  })

  it("adds global services to the customer total and derives a per-person amount", () => {
    const model = cloneQuotationJson(KYO_FULL_ITINERARY_FIXTURE)
    model.commercial.pricingMode = "PER_PERSON"
    model.commercial.insuranceAmount = 100
    model.commercial.transferAmount = 50
    model.trip.adults = 2
    model.trip.children = 0
    model.trip.infants = 0
    model.options = model.options.slice(0, 1)
    model.options[0].totalAmount = 1_850

    const document = renderQuotationDocument({ model, manifest: KYO_2026_MANIFEST })
    expect(document.html).toContain("Precio por persona")
    expect(document.html).toContain("USD 1.000,00")
    expect(document.html).toContain("Precio total")
    expect(document.html).toContain("USD 2.000,00")
    expect(document.html).toContain("Seguro USD 100,00")
    expect(document.html).toContain("Traslado USD 50,00")
  })

  it("honours block visibility in the editorial layout", () => {
    const manifest = cloneQuotationJson(KYO_2026_MANIFEST)
    manifest.blocks = manifest.blocks.map(block => (
      ["flight-options", "itinerary", "pricing"].includes(block.kind)
        ? { ...block, visible: false }
        : block
    ))
    const document = renderQuotationDocument({ model: KYO_FULL_ITINERARY_FIXTURE, manifest })

    expect(document.html).not.toContain('class="kyo-flight-leg"')
    expect(document.html).not.toContain('class="kyo-itinerary"')
    expect(document.html).not.toContain('class="kyo-option-price"')
    expect(document.html).not.toContain('class="kyo-closing-price"')
  })

  it("escapes quotation content in every registered layout", () => {
    const unsafeModel = cloneQuotationJson(KYO_FULL_ITINERARY_FIXTURE)
    unsafeModel.identity.title = '<img src=x onerror="alert(1)">'
    unsafeModel.narrative.itinerary[0].description = "<script>alert(1)</script>"

    for (const manifest of [VIBOOK_STANDARD_MANIFEST, KYO_2026_MANIFEST]) {
      const document = renderQuotationDocument({ model: unsafeModel, manifest })
      expect(document.html).not.toContain('<script>alert(1)</script>')
      expect(document.html).not.toContain('<img src=x onerror="alert(1)">')
      expect(document.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    }
  })

  it("paginates a long itinerary without removing content", () => {
    const longModel = cloneQuotationJson(KYO_FULL_ITINERARY_FIXTURE)
    longModel.options = longModel.options.slice(0, 1)
    longModel.narrative.itinerary = Array.from({ length: 18 }, (_, index) => ({
      day: index + 1,
      title: `Jornada ${index + 1}`,
      description: `Contenido único ${index + 1}. ${"Detalle de la actividad y recomendaciones para el pasajero. ".repeat(16)}`,
    }))

    const document = renderQuotationDocument({ model: longModel, manifest: KYO_2026_MANIFEST })
    expect(document.pageCount).toBeGreaterThan(8)
    expect(document.html).toContain("Contenido único 1")
    expect(document.html).toContain("Contenido único 18")
  })

  it("fragments maximum-length editorial content instead of clipping it", () => {
    const model = cloneQuotationJson(KYO_FULL_ITINERARY_FIXTURE)
    const manifest = cloneQuotationJson(KYO_2026_MANIFEST)
    const baseline = renderQuotationDocument({ model, manifest: KYO_2026_MANIFEST })
    const sourceFlight = model.options[0].items.find(item => item.type === "FLIGHT")!
    const copyAtSchemaLimit = (seed: string, marker: string) => {
      const suffix = ` ${marker}`
      const contentLength = 1_000 - suffix.length
      return `${seed.repeat(Math.ceil(contentLength / seed.length)).slice(0, contentLength)}${suffix}`
    }

    model.narrative.overview = `OVERVIEW_START ${"relato extendido para validar paginación ".repeat(500)} OVERVIEW_END`
    model.narrative.recommendations = [`${"R".repeat(3_950)} LIST_END`]
    model.options[0].items.push(
      {
        ...sourceFlight,
        id: "flight-extra-2",
        flight: sourceFlight.flight ? { ...sourceFlight.flight, airline: "FLIGHT_TWO" } : sourceFlight.flight,
      },
      {
        ...sourceFlight,
        id: "flight-extra-3",
        flight: sourceFlight.flight ? { ...sourceFlight.flight, airline: "FLIGHT_THREE" } : sourceFlight.flight,
      },
      {
        id: "long-extra",
        type: "OTHER",
        description: `${"servicio detallado ".repeat(230)} OPTION_END`,
        quantity: 1,
      }
    )
    model.commercial.paymentSchedule = Array.from({ length: 24 }, (_, index) => ({
      label: `Cuota ${index + 1}`,
      amount: 100 + index,
      dueDate: "2026-09-05",
      notes: `${"nota comercial extensa ".repeat(45)}${index === 23 ? " CLOSING_END" : ""}`,
    }))
    manifest.copy.availabilityNote = copyAtSchemaLimit("disponibilidad extendida ", "AVAILABILITY_END")
    manifest.copy.priceDisclaimer = copyAtSchemaLimit("condición de precio extendida ", "DISCLAIMER_END")

    expect(manifest.copy.availabilityNote).toHaveLength(1_000)
    expect(manifest.copy.priceDisclaimer).toHaveLength(1_000)

    const document = renderQuotationDocument({ model, manifest })
    const pageAt = (marker: string) => (
      document.html.slice(0, document.html.indexOf(marker)).match(/data-pdf-page=/g) || []
    ).length

    expect(document.pageCount).toBeGreaterThan(baseline.pageCount + 10)
    expect(document.html).toContain("OVERVIEW_START")
    expect(document.html).toContain("OVERVIEW_END")
    expect(document.html).toContain("LIST_END")
    expect(document.html).toContain("OPTION_END")
    expect(document.html).toContain("FLIGHT_THREE")
    expect(document.html).toContain("AVAILABILITY_END")
    expect(document.html).toContain("DISCLAIMER_END")
    expect(document.html).toContain("CLOSING_END")
    expect(pageAt("OVERVIEW_END")).toBeGreaterThan(pageAt("OVERVIEW_START"))
    expect(pageAt("OPTION_END")).toBeGreaterThan(pageAt("OVERVIEW_END"))
    expect(pageAt("CLOSING_END")).toBeGreaterThan(pageAt("OPTION_END"))
  })

  it("fragments long content in the tenant-safe standard fallback too", () => {
    const model = cloneQuotationJson(KYO_FULL_ITINERARY_FIXTURE)
    const baseline = renderQuotationDocument({ model, manifest: VIBOOK_STANDARD_MANIFEST })
    model.narrative.overview = `STANDARD_OVERVIEW_START ${"resumen extenso ".repeat(450)} STANDARD_OVERVIEW_END`
    model.narrative.exclusions = [`${"X".repeat(3_950)} STANDARD_LIST_END`]
    model.options = model.options.slice(0, 1)
    model.options[0].items.push({
      id: "standard-long-item",
      type: "OTHER",
      description: `${"detalle del servicio ".repeat(210)} STANDARD_ITEM_END`,
      quantity: 1,
    })

    const document = renderQuotationDocument({ model, manifest: VIBOOK_STANDARD_MANIFEST })
    expect(document.pageCount).toBeGreaterThan(baseline.pageCount + 5)
    expect(document.html).toContain("STANDARD_OVERVIEW_END")
    expect(document.html).toContain("STANDARD_LIST_END")
    expect(document.html).toContain("STANDARD_ITEM_END")
  })
})
