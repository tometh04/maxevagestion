import { resolveCommissionBase, type CommissionBaseConfig } from "@/lib/commissions/net-base"

const ENABLED: CommissionBaseConfig = { enabled: true, rate: 0.105, from: null }
const ENABLED_FROM_JUNE: CommissionBaseConfig = {
  enabled: true,
  rate: 0.105,
  from: "2026-06-01",
}

describe("resolveCommissionBase", () => {
  it("con config deshabilitada la base es la ganancia bruta", () => {
    const r = resolveCommissionBase(1000, "2026-06-15", { enabled: false, rate: 0.105, from: null })
    expect(r.applied).toBe(false)
    expect(r.base).toBe(1000)
    expect(r.netMargin).toBe(1000)
    expect(r.ivaAmount).toBe(0)
  })

  it("sin config también cae a bruta", () => {
    const r = resolveCommissionBase(1000, "2026-06-15", null)
    expect(r.applied).toBe(false)
    expect(r.base).toBe(1000)
  })

  it("activa descuenta el IVA: bruta 1000 → neta 895 al 10,5%", () => {
    const r = resolveCommissionBase(1000, "2026-06-15", ENABLED)
    expect(r.applied).toBe(true)
    expect(r.base).toBe(895)
    expect(r.netMargin).toBe(895)
    expect(r.ivaAmount).toBe(105)
    expect(r.grossMargin).toBe(1000)
  })

  it("respeta la fecha de corte: antes del corte no aplica", () => {
    const r = resolveCommissionBase(1000, "2026-05-31", ENABLED_FROM_JUNE)
    expect(r.applied).toBe(false)
    expect(r.base).toBe(1000)
  })

  it("respeta la fecha de corte: desde el corte inclusive aplica", () => {
    const r = resolveCommissionBase(1000, "2026-06-01", ENABLED_FROM_JUNE)
    expect(r.applied).toBe(true)
    expect(r.base).toBe(895)
  })

  it("con corte y fecha timestamp compara por día", () => {
    const r = resolveCommissionBase(1000, "2026-06-01T13:45:00Z", ENABLED_FROM_JUNE)
    expect(r.applied).toBe(true)
    expect(r.base).toBe(895)
  })

  it("con corte y sin fecha de operación no aplica (no bajamos por fecha desconocida)", () => {
    const r = resolveCommissionBase(1000, null, ENABLED_FROM_JUNE)
    expect(r.applied).toBe(false)
    expect(r.base).toBe(1000)
  })

  it("alícuota inválida (>=1 o <=0) cae a bruta", () => {
    expect(resolveCommissionBase(1000, "2026-06-15", { enabled: true, rate: 0, from: null }).base).toBe(1000)
    expect(resolveCommissionBase(1000, "2026-06-15", { enabled: true, rate: 1, from: null }).base).toBe(1000)
  })

  it("margen negativo mantiene el signo tras el factor", () => {
    const r = resolveCommissionBase(-1000, "2026-06-15", ENABLED)
    expect(r.applied).toBe(true)
    expect(r.base).toBe(-895)
  })

  it("redondea a 2 decimales", () => {
    // 1234.5 × 0.895 = 1104.8775 → 1104.88
    const r = resolveCommissionBase(1234.5, "2026-06-15", ENABLED)
    expect(r.base).toBe(1104.88)
  })
})
