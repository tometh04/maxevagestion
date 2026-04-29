import { getLeadRegionForDestination } from "../destinations"

describe("getLeadRegionForDestination", () => {
  describe("CARIBE destinations", () => {
    it("should return CARIBE for Punta Cana", () => {
      expect(getLeadRegionForDestination("Punta Cana")).toBe("CARIBE")
    })

    it("should return CARIBE for Cancún", () => {
      expect(getLeadRegionForDestination("Cancún")).toBe("CARIBE")
    })

    it("should return CARIBE for Aruba", () => {
      expect(getLeadRegionForDestination("Aruba")).toBe("CARIBE")
    })

    it("should return CARIBE for Bayahibe", () => {
      expect(getLeadRegionForDestination("Bayahibe")).toBe("CARIBE")
    })

    it("should return CARIBE for Riviera Maya", () => {
      expect(getLeadRegionForDestination("Riviera Maya")).toBe("CARIBE")
    })

    it("should return CARIBE for La Habana", () => {
      expect(getLeadRegionForDestination("La Habana")).toBe("CARIBE")
    })

    it("should return CARIBE for Montego Bay", () => {
      expect(getLeadRegionForDestination("Montego Bay")).toBe("CARIBE")
    })

    it("should return CARIBE for Curazao", () => {
      expect(getLeadRegionForDestination("Curazao")).toBe("CARIBE")
    })
  })

  describe("EUROPA destinations", () => {
    it("should return EUROPA for París", () => {
      expect(getLeadRegionForDestination("París")).toBe("EUROPA")
    })

    it("should return EUROPA for Barcelona", () => {
      expect(getLeadRegionForDestination("Barcelona")).toBe("EUROPA")
    })

    it("should return EUROPA for Roma", () => {
      expect(getLeadRegionForDestination("Roma")).toBe("EUROPA")
    })
  })

  describe("ARGENTINA destinations", () => {
    it("should return ARGENTINA for Buenos Aires", () => {
      expect(getLeadRegionForDestination("Buenos Aires")).toBe("ARGENTINA")
    })

    it("should return ARGENTINA for Bariloche", () => {
      expect(getLeadRegionForDestination("Bariloche")).toBe("ARGENTINA")
    })

    it("should return ARGENTINA for Iguazú", () => {
      expect(getLeadRegionForDestination("Iguazú")).toBe("ARGENTINA")
    })

    it("should return ARGENTINA for Ushuaia", () => {
      expect(getLeadRegionForDestination("Ushuaia")).toBe("ARGENTINA")
    })

    it("should return ARGENTINA for Mendoza", () => {
      expect(getLeadRegionForDestination("Mendoza")).toBe("ARGENTINA")
    })
  })

  describe("EEUU destinations", () => {
    it("should return EEUU for Miami", () => {
      expect(getLeadRegionForDestination("Miami")).toBe("EEUU")
    })

    it("should return EEUU for Nueva York", () => {
      expect(getLeadRegionForDestination("Nueva York")).toBe("EEUU")
    })

    it("should return EEUU for Orlando", () => {
      expect(getLeadRegionForDestination("Orlando")).toBe("EEUU")
    })
  })

  describe("BRASIL destinations", () => {
    it("should return BRASIL for Río de Janeiro", () => {
      expect(getLeadRegionForDestination("Río de Janeiro")).toBe("BRASIL")
    })

    it("should return BRASIL for São Paulo", () => {
      expect(getLeadRegionForDestination("São Paulo")).toBe("BRASIL")
    })

    it("should return BRASIL for Salvador de Bahía", () => {
      expect(getLeadRegionForDestination("Salvador de Bahía")).toBe("BRASIL")
    })
  })

  describe("OTROS destinations (Pacífico, Centro América, etc.)", () => {
    it("should return OTROS for Los Cabos (Pacífico)", () => {
      expect(getLeadRegionForDestination("Los Cabos")).toBe("OTROS")
    })

    it("should return OTROS for Ciudad de México (Centro América)", () => {
      expect(getLeadRegionForDestination("Ciudad de México")).toBe("OTROS")
    })

    it("should return OTROS for Tokio (Asia)", () => {
      expect(getLeadRegionForDestination("Tokio")).toBe("OTROS")
    })
  })

  describe("case-insensitive and accent-insensitive matching", () => {
    it("should match lowercase input", () => {
      expect(getLeadRegionForDestination("punta cana")).toBe("CARIBE")
    })

    it("should match uppercase input", () => {
      expect(getLeadRegionForDestination("MIAMI")).toBe("EEUU")
    })

    it("should match mixed case input", () => {
      expect(getLeadRegionForDestination("Buenos aires")).toBe("ARGENTINA")
    })

    it("should match input without accents for Cancún", () => {
      expect(getLeadRegionForDestination("Cancun")).toBe("CARIBE")
    })

    it("should match input without accents for París", () => {
      expect(getLeadRegionForDestination("Paris")).toBe("EUROPA")
    })

    it("should match input without accents for Río de Janeiro", () => {
      expect(getLeadRegionForDestination("Rio de Janeiro")).toBe("BRASIL")
    })

    it("should match input without accents for São Paulo", () => {
      expect(getLeadRegionForDestination("Sao Paulo")).toBe("BRASIL")
    })

    it("should match input without accents for Iguazú", () => {
      expect(getLeadRegionForDestination("Iguazu")).toBe("ARGENTINA")
    })
  })

  describe("unknown and edge-case inputs", () => {
    it("should return null for an unknown city", () => {
      expect(getLeadRegionForDestination("Ciudad Ficticia XYZ")).toBeNull()
    })

    it("should return null for empty string", () => {
      expect(getLeadRegionForDestination("")).toBeNull()
    })

    it("should return null for random characters", () => {
      expect(getLeadRegionForDestination("!!!###")).toBeNull()
    })

    it("should return null for numbers only", () => {
      expect(getLeadRegionForDestination("12345")).toBeNull()
    })
  })
})
