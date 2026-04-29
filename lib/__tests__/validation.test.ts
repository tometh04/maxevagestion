import {
  schemas,
  createLeadSchema,
  createOperationSchema,
  aiCopilotSchema,
  validateQueryParams,
} from "../validation"

describe("Validation Schemas", () => {
  // ─── UUID ───────────────────────────────────────────────────────────
  describe("uuid", () => {
    it("should accept valid UUID v4", () => {
      expect(schemas.uuid.safeParse("550e8400-e29b-41d4-a716-446655440000").success).toBe(true)
    })

    it("should accept another valid UUID", () => {
      expect(schemas.uuid.safeParse("9ec9dbcf-5cdd-428f-a303-c3f79b06d0be").success).toBe(true)
    })

    it("should reject invalid UUID", () => {
      expect(schemas.uuid.safeParse("not-a-uuid").success).toBe(false)
    })

    it("should reject empty string", () => {
      expect(schemas.uuid.safeParse("").success).toBe(false)
    })

    it("should reject UUID missing segments", () => {
      expect(schemas.uuid.safeParse("550e8400-e29b-41d4").success).toBe(false)
    })
  })

  // ─── Email ──────────────────────────────────────────────────────────
  describe("email", () => {
    it("should accept valid email", () => {
      expect(schemas.email.safeParse("user@example.com").success).toBe(true)
    })

    it("should accept email with subdomain", () => {
      expect(schemas.email.safeParse("user@mail.example.com").success).toBe(true)
    })

    it("should accept email with plus sign", () => {
      expect(schemas.email.safeParse("user+tag@example.com").success).toBe(true)
    })

    it("should reject invalid email", () => {
      expect(schemas.email.safeParse("not-an-email").success).toBe(false)
    })

    it("should reject empty string", () => {
      expect(schemas.email.safeParse("").success).toBe(false)
    })

    it("should reject email without domain", () => {
      expect(schemas.email.safeParse("user@").success).toBe(false)
    })

    it("should reject email without @", () => {
      expect(schemas.email.safeParse("userexample.com").success).toBe(false)
    })
  })

  // ─── Date ───────────────────────────────────────────────────────────
  describe("date", () => {
    it("should accept YYYY-MM-DD format", () => {
      expect(schemas.date.safeParse("2026-03-30").success).toBe(true)
    })

    it("should accept any valid date string in YYYY-MM-DD", () => {
      expect(schemas.date.safeParse("2025-01-01").success).toBe(true)
      expect(schemas.date.safeParse("2030-12-31").success).toBe(true)
    })

    it("should reject DD/MM/YYYY format", () => {
      expect(schemas.date.safeParse("30/03/2026").success).toBe(false)
    })

    it("should reject single digit month/day", () => {
      expect(schemas.date.safeParse("2026-3-30").success).toBe(false)
      expect(schemas.date.safeParse("2026-03-1").success).toBe(false)
    })

    it("should reject non-date string", () => {
      expect(schemas.date.safeParse("not-a-date").success).toBe(false)
    })

    it("should reject ISO timestamp", () => {
      expect(schemas.date.safeParse("2026-03-30T12:00:00Z").success).toBe(false)
    })

    it("should reject empty string", () => {
      expect(schemas.date.safeParse("").success).toBe(false)
    })
  })

  // ─── Currency ───────────────────────────────────────────────────────
  describe("currency", () => {
    it("should accept ARS", () => {
      expect(schemas.currency.safeParse("ARS").success).toBe(true)
    })

    it("should accept USD", () => {
      expect(schemas.currency.safeParse("USD").success).toBe(true)
    })

    it("should reject EUR", () => {
      expect(schemas.currency.safeParse("EUR").success).toBe(false)
    })

    it("should reject BRL", () => {
      expect(schemas.currency.safeParse("BRL").success).toBe(false)
    })

    it("should reject lowercase", () => {
      expect(schemas.currency.safeParse("ars").success).toBe(false)
    })

    it("should produce correct error message", () => {
      const result = schemas.currency.safeParse("EUR")
      if (!result.success) {
        expect(result.error.errors[0].message).toBe("Moneda debe ser ARS o USD")
      }
    })
  })

  // ─── Lead Status ────────────────────────────────────────────────────
  describe("leadStatus", () => {
    it("should accept all valid statuses", () => {
      const validStatuses = ["NEW", "IN_PROGRESS", "QUOTED", "WON", "LOST"]
      validStatuses.forEach(status => {
        expect(schemas.leadStatus.safeParse(status).success).toBe(true)
      })
    })

    it("should reject invalid status", () => {
      expect(schemas.leadStatus.safeParse("INVALID").success).toBe(false)
    })

    it("should reject lowercase valid status", () => {
      expect(schemas.leadStatus.safeParse("new").success).toBe(false)
    })
  })

  // ─── Operation Status ──────────────────────────────────────────────
  describe("operationStatus", () => {
    it("should accept all valid statuses", () => {
      const valid = ["DRAFT", "RESERVED", "CONFIRMED", "CANCELLED", "COMPLETED"]
      valid.forEach(status => {
        expect(schemas.operationStatus.safeParse(status).success).toBe(true)
      })
    })

    it("should reject invalid status", () => {
      expect(schemas.operationStatus.safeParse("PENDING").success).toBe(false)
    })
  })

  // ─── Payment Direction ─────────────────────────────────────────────
  describe("paymentDirection", () => {
    it("should accept INCOME and EXPENSE", () => {
      expect(schemas.paymentDirection.safeParse("INCOME").success).toBe(true)
      expect(schemas.paymentDirection.safeParse("EXPENSE").success).toBe(true)
    })

    it("should reject TRANSFER", () => {
      expect(schemas.paymentDirection.safeParse("TRANSFER").success).toBe(false)
    })

    it("should produce correct error message", () => {
      const result = schemas.paymentDirection.safeParse("INVALID")
      if (!result.success) {
        expect(result.error.errors[0].message).toBe("Dirección debe ser INCOME o EXPENSE")
      }
    })
  })

  // ─── Payment Status ────────────────────────────────────────────────
  describe("paymentStatus", () => {
    it("should accept PENDING, PAID, OVERDUE", () => {
      expect(schemas.paymentStatus.safeParse("PENDING").success).toBe(true)
      expect(schemas.paymentStatus.safeParse("PAID").success).toBe(true)
      expect(schemas.paymentStatus.safeParse("OVERDUE").success).toBe(true)
    })

    it("should reject CANCELLED", () => {
      expect(schemas.paymentStatus.safeParse("CANCELLED").success).toBe(false)
    })
  })

  // ─── Positive Number ───────────────────────────────────────────────
  describe("positiveNumber", () => {
    it("should accept positive integers", () => {
      expect(schemas.positiveNumber.safeParse(100).success).toBe(true)
    })

    it("should accept positive decimals", () => {
      expect(schemas.positiveNumber.safeParse(0.01).success).toBe(true)
    })

    it("should reject zero", () => {
      expect(schemas.positiveNumber.safeParse(0).success).toBe(false)
    })

    it("should reject negative numbers", () => {
      expect(schemas.positiveNumber.safeParse(-1).success).toBe(false)
    })

    it("should reject strings", () => {
      expect(schemas.positiveNumber.safeParse("100").success).toBe(false)
    })
  })

  // ─── Non-negative Number ───────────────────────────────────────────
  describe("nonNegativeNumber", () => {
    it("should accept zero", () => {
      expect(schemas.nonNegativeNumber.safeParse(0).success).toBe(true)
    })

    it("should accept positive numbers", () => {
      expect(schemas.nonNegativeNumber.safeParse(100).success).toBe(true)
    })

    it("should reject negative numbers", () => {
      expect(schemas.nonNegativeNumber.safeParse(-1).success).toBe(false)
    })
  })

  // ─── Pagination ────────────────────────────────────────────────────
  describe("pagination", () => {
    it("should accept valid pagination", () => {
      const result = schemas.pagination.safeParse({ limit: 50, offset: 0 })
      expect(result.success).toBe(true)
    })

    it("should apply defaults when empty", () => {
      const result = schemas.pagination.safeParse({})
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.limit).toBe(100)
        expect(result.data.offset).toBe(0)
      }
    })

    it("should reject limit > 1000", () => {
      expect(schemas.pagination.safeParse({ limit: 5000, offset: 0 }).success).toBe(false)
    })

    it("should reject limit < 1", () => {
      expect(schemas.pagination.safeParse({ limit: 0, offset: 0 }).success).toBe(false)
    })

    it("should reject negative offset", () => {
      expect(schemas.pagination.safeParse({ limit: 10, offset: -1 }).success).toBe(false)
    })

    it("should coerce string numbers", () => {
      const result = schemas.pagination.safeParse({ limit: "50", offset: "10" })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.limit).toBe(50)
        expect(result.data.offset).toBe(10)
      }
    })
  })
})

// ─── Complex Schemas ─────────────────────────────────────────────────
describe("createLeadSchema", () => {
  const validLead = {
    contact_name: "Juan Pérez",
    agency_id: "550e8400-e29b-41d4-a716-446655440000",
  }

  it("should accept minimal valid lead", () => {
    expect(createLeadSchema.safeParse(validLead).success).toBe(true)
  })

  it("should accept lead with all optional fields", () => {
    const fullLead = {
      ...validLead,
      contact_phone: "+54 9 341 555 1234",
      contact_email: "juan@example.com",
      destination: "Cancún",
      region: "CARIBE",
      status: "NEW",
      notes: "Interested in all-inclusive",
      assigned_seller_id: "550e8400-e29b-41d4-a716-446655440001",
      quoted_price: 5000,
      has_deposit: true,
      deposit_amount: 1000,
      deposit_currency: "USD",
      deposit_method: "BANK",
      deposit_date: "2026-04-15",
    }
    expect(createLeadSchema.safeParse(fullLead).success).toBe(true)
  })

  it("should reject lead without contact_name", () => {
    const invalid = { agency_id: validLead.agency_id }
    expect(createLeadSchema.safeParse(invalid).success).toBe(false)
  })

  it("should reject lead with empty contact_name", () => {
    const invalid = { ...validLead, contact_name: "" }
    expect(createLeadSchema.safeParse(invalid).success).toBe(false)
  })

  it("should reject lead without agency_id", () => {
    const invalid = { contact_name: "Test" }
    expect(createLeadSchema.safeParse(invalid).success).toBe(false)
  })

  it("should reject lead with invalid agency_id", () => {
    const invalid = { contact_name: "Test", agency_id: "not-uuid" }
    expect(createLeadSchema.safeParse(invalid).success).toBe(false)
  })

  it("should accept empty string email (treated as optional)", () => {
    const lead = { ...validLead, contact_email: "" }
    expect(createLeadSchema.safeParse(lead).success).toBe(true)
  })

  it("should reject invalid email", () => {
    const lead = { ...validLead, contact_email: "not-email" }
    expect(createLeadSchema.safeParse(lead).success).toBe(false)
  })

  it("should reject invalid region", () => {
    const lead = { ...validLead, region: "ASIA" as any }
    expect(createLeadSchema.safeParse(lead).success).toBe(false)
  })

  it("should reject negative deposit_amount", () => {
    const lead = { ...validLead, deposit_amount: -100 }
    expect(createLeadSchema.safeParse(lead).success).toBe(false)
  })
})

describe("createOperationSchema", () => {
  const validOperation = {
    agency_id: "550e8400-e29b-41d4-a716-446655440000",
    seller_id: "550e8400-e29b-41d4-a716-446655440001",
    type: "PACKAGE" as const,
    origin: "Buenos Aires",
    destination: "Cancún",
    departure_date: "2026-07-15",
    sale_amount_total: 5000,
    currency: "USD" as const,
  }

  it("should accept minimal valid operation", () => {
    expect(createOperationSchema.safeParse(validOperation).success).toBe(true)
  })

  it("should reject operation without required fields", () => {
    expect(createOperationSchema.safeParse({}).success).toBe(false)
  })

  it("should reject operation with empty origin", () => {
    const invalid = { ...validOperation, origin: "" }
    expect(createOperationSchema.safeParse(invalid).success).toBe(false)
  })

  it("should reject zero sale_amount_total", () => {
    const invalid = { ...validOperation, sale_amount_total: 0 }
    expect(createOperationSchema.safeParse(invalid).success).toBe(false)
  })

  it("should reject negative sale_amount_total", () => {
    const invalid = { ...validOperation, sale_amount_total: -100 }
    expect(createOperationSchema.safeParse(invalid).success).toBe(false)
  })

  it("should accept valid operation type values", () => {
    const types = ["FLIGHT", "HOTEL", "PACKAGE", "CRUISE", "OTHER"] as const
    for (const type of types) {
      const op = { ...validOperation, type }
      expect(createOperationSchema.safeParse(op).success).toBe(true)
    }
  })

  it("should reject invalid operation type", () => {
    const invalid = { ...validOperation, type: "BUS" }
    expect(createOperationSchema.safeParse(invalid).success).toBe(false)
  })

  it("should reject invalid departure_date format", () => {
    const invalid = { ...validOperation, departure_date: "15/07/2026" }
    expect(createOperationSchema.safeParse(invalid).success).toBe(false)
  })

  it("should accept negative operator_cost (non-negative allows 0)", () => {
    const op = { ...validOperation, operator_cost: 0 }
    expect(createOperationSchema.safeParse(op).success).toBe(true)
  })

  it("should reject negative operator_cost", () => {
    const op = { ...validOperation, operator_cost: -500 }
    expect(createOperationSchema.safeParse(op).success).toBe(false)
  })
})

describe("aiCopilotSchema", () => {
  it("should accept valid message", () => {
    expect(aiCopilotSchema.safeParse({ message: "What are today's sales?" }).success).toBe(true)
  })

  it("should reject empty message", () => {
    expect(aiCopilotSchema.safeParse({ message: "" }).success).toBe(false)
  })

  it("should reject message over 1000 characters", () => {
    const longMsg = "a".repeat(1001)
    expect(aiCopilotSchema.safeParse({ message: longMsg }).success).toBe(false)
  })

  it("should accept message with optional agencyId", () => {
    const result = aiCopilotSchema.safeParse({
      message: "Show KPIs",
      agencyId: "550e8400-e29b-41d4-a716-446655440000",
    })
    expect(result.success).toBe(true)
  })

  it("should reject invalid agencyId UUID", () => {
    const result = aiCopilotSchema.safeParse({
      message: "Show KPIs",
      agencyId: "invalid",
    })
    expect(result.success).toBe(false)
  })
})

describe("validateQueryParams", () => {
  it("should parse valid query params", () => {
    const params = new URLSearchParams({ limit: "50", offset: "10" })
    const result = validateQueryParams(params, schemas.pagination)
    expect(result.limit).toBe(50)
    expect(result.offset).toBe(10)
  })

  it("should throw on invalid query params", () => {
    const params = new URLSearchParams({ limit: "invalid" })
    expect(() => validateQueryParams(params, schemas.pagination)).toThrow(
      "Validación de parámetros fallida"
    )
  })
})
