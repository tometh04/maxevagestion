import {
  normalizeOperationPassengers,
  findCustomersOutsideOrg,
} from "@/lib/operations/operation-passengers"

describe("normalizeOperationPassengers (VIB-106)", () => {
  it("el titular explícito queda como MAIN y el resto como COMPANION", () => {
    const result = normalizeOperationPassengers({
      customerId: "c-main",
      passengers: [{ customer_id: "c-2" }, { customer_id: "c-3" }],
    })
    expect(result.rows).toEqual([
      { customer_id: "c-main", role: "MAIN" },
      { customer_id: "c-2", role: "COMPANION" },
      { customer_id: "c-3", role: "COMPANION" },
    ])
  })

  it("sin titular explícito promueve el primero de la lista", () => {
    const result = normalizeOperationPassengers({
      passengers: [{ customer_id: "c-1" }, { customer_id: "c-2" }],
    })
    expect(result.rows).toEqual([
      { customer_id: "c-1", role: "MAIN" },
      { customer_id: "c-2", role: "COMPANION" },
    ])
  })

  it("respeta el MAIN marcado en la lista aunque no sea el primero", () => {
    const result = normalizeOperationPassengers({
      passengers: [{ customer_id: "c-1" }, { customer_id: "c-2", role: "MAIN" }],
    })
    expect(result.rows).toEqual([
      { customer_id: "c-1", role: "COMPANION" },
      { customer_id: "c-2", role: "MAIN" },
    ])
  })

  it("dos MAIN distintos es error (no se adivina)", () => {
    // La DB tiene un único parcial por (operation_id) WHERE role='MAIN': si esto
    // pasara, el insert entero falla con un error de constraint ilegible.
    const result = normalizeOperationPassengers({
      customerId: "c-main",
      passengers: [{ customer_id: "c-2", role: "MAIN" }],
    })
    expect(result.error).toBe("Solo puede haber un pasajero principal")
    expect(result.rows).toEqual([])
  })

  it("deduplica repetidos conservando el orden", () => {
    const result = normalizeOperationPassengers({
      customerId: "c-main",
      passengers: [{ customer_id: "c-2" }, { customer_id: "c-main" }, { customer_id: "c-2" }],
    })
    expect(result.rows).toEqual([
      { customer_id: "c-main", role: "MAIN" },
      { customer_id: "c-2", role: "COMPANION" },
    ])
  })

  it("acepta ids sueltos además de objetos", () => {
    const result = normalizeOperationPassengers({ customerId: "c-main", passengers: ["c-2"] })
    expect(result.rows).toEqual([
      { customer_id: "c-main", role: "MAIN" },
      { customer_id: "c-2", role: "COMPANION" },
    ])
  })

  it("sin pasajeros devuelve lista vacía sin error", () => {
    expect(normalizeOperationPassengers({}).rows).toEqual([])
    expect(normalizeOperationPassengers({ customerId: null, passengers: [] }).rows).toEqual([])
  })

  it("rechaza pasajeros sin cliente válido", () => {
    expect(normalizeOperationPassengers({ passengers: [{ customer_id: "" }] }).error).toBe(
      "Hay un pasajero sin cliente válido"
    )
    expect(normalizeOperationPassengers({ passengers: [{ role: "COMPANION" }] }).error).toBe(
      "Hay un pasajero sin cliente válido"
    )
    expect(normalizeOperationPassengers({ customerId: "   " }).error).toBe(
      "El pasajero principal es inválido"
    )
  })

  it("rechaza un payload que no es lista", () => {
    expect(normalizeOperationPassengers({ passengers: "c-1" as any }).error).toBe(
      "El campo pasajeros debe ser una lista"
    )
  })

  it("aplica el tope de pasajeros", () => {
    const passengers = Array.from({ length: 26 }, (_, i) => ({ customer_id: `c-${i}` }))
    expect(normalizeOperationPassengers({ passengers }).error).toMatch(/no se pueden cargar más/i)
    expect(normalizeOperationPassengers({ passengers, maxPassengers: 30 }).rows).toHaveLength(26)
  })
})

describe("findCustomersOutsideOrg (VIB-106)", () => {
  function mockSupabase(foundIds: string[], error?: any) {
    const eq = jest.fn().mockResolvedValue({ data: foundIds.map((id) => ({ id })), error })
    const inFn = jest.fn().mockReturnValue({ eq })
    const select = jest.fn().mockReturnValue({ in: inFn })
    const from = jest.fn().mockReturnValue({ select })
    return { client: { from }, from, select, in: inFn, eq }
  }

  it("devuelve los clientes que no son de la org", async () => {
    const m = mockSupabase(["c-1"])
    await expect(findCustomersOutsideOrg(m.client, ["c-1", "c-ajeno"], "org-1")).resolves.toEqual([
      "c-ajeno",
    ])
    expect(m.from).toHaveBeenCalledWith("customers")
    expect(m.in).toHaveBeenCalledWith("id", ["c-1", "c-ajeno"])
    expect(m.eq).toHaveBeenCalledWith("org_id", "org-1")
  })

  it("no consulta si no hay ids", async () => {
    const m = mockSupabase([])
    await expect(findCustomersOutsideOrg(m.client, [], "org-1")).resolves.toEqual([])
    expect(m.from).not.toHaveBeenCalled()
  })

  it("ante un error de la query rechaza todos (no escribe a ciegas)", async () => {
    const m = mockSupabase([], { message: "boom" })
    await expect(findCustomersOutsideOrg(m.client, ["c-1"], "org-1")).resolves.toEqual(["c-1"])
  })
})
