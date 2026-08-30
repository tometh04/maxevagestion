import { computeDunningStep, dunningIdempotencyKey, DUNNING_SLOTS } from "./dunning"
import { PAST_DUE_GRACE_DAYS } from "./access"

const DAY = 24 * 60 * 60 * 1000
const PERIOD_END = "2026-08-29T13:36:18.000Z"
const periodEndMs = new Date(PERIOD_END).getTime()

function stepAt(offsetDays: number) {
  return computeDunningStep({
    currentPeriodEndsAt: PERIOD_END,
    now: periodEndMs + offsetDays * DAY,
  })
}

describe("computeDunningStep", () => {
  it("sin current_period_ends_at no inventa una ventana", () => {
    expect(computeDunningStep({ currentPeriodEndsAt: null }).action).toBe("unknown")
    expect(computeDunningStep({ currentPeriodEndsAt: "no-es-fecha" }).action).toBe("unknown")
  })

  it("avisa el día 0, 2 y 4 de la gracia; calla el 1 y el 3", () => {
    expect(stepAt(0).action).toBe("send")
    expect(stepAt(1).action).toBe("none")
    expect(stepAt(2).action).toBe("send")
    expect(stepAt(3).action).toBe("none")
    expect(stepAt(4).action).toBe("send")
  })

  it("colapsa a un solo slot los avisos previos al vencimiento", () => {
    // Un rechazo que llega con días de anticipación no debe mandar un mail
    // por día: todos los días previos resuelven al mismo slot -1.
    for (const d of [-0.5, -1.2, -3, -7]) {
      const s = stepAt(d)
      expect(s.action).toBe("send")
      expect(s.slot).toBe(-1)
    }
  })

  it("al agotarse la gracia escala en vez de seguir mandando mails", () => {
    expect(stepAt(PAST_DUE_GRACE_DAYS).action).toBe("expired")
    expect(stepAt(PAST_DUE_GRACE_DAYS + 3).action).toBe("expired")
    expect(stepAt(PAST_DUE_GRACE_DAYS).daysLeft).toBe(0)
  })

  it("daysLeft refleja el acceso que queda y nunca es negativo", () => {
    expect(stepAt(0).daysLeft).toBe(PAST_DUE_GRACE_DAYS)
    expect(stepAt(4).daysLeft).toBe(1)
    expect(stepAt(99).daysLeft).toBe(0)
  })

  it("la ventana de aviso vive entera dentro de la gracia", () => {
    // Un slot fuera de la gracia mandaría un mail a alguien ya cortado.
    for (const slot of DUNNING_SLOTS) {
      expect(slot).toBeLessThan(PAST_DUE_GRACE_DAYS)
    }
  })
})

describe("dunningIdempotencyKey", () => {
  it("es estable para el mismo episodio y slot", () => {
    expect(dunningIdempotencyKey("org-1", PERIOD_END, 0)).toBe(
      dunningIdempotencyKey("org-1", PERIOD_END, 0)
    )
  })

  it("separa slots, orgs y episodios distintos", () => {
    const a = dunningIdempotencyKey("org-1", PERIOD_END, 0)
    expect(a).not.toBe(dunningIdempotencyKey("org-1", PERIOD_END, 2))
    expect(a).not.toBe(dunningIdempotencyKey("org-2", PERIOD_END, 0))
    // Un ciclo impago posterior arranca la cadencia de cero.
    expect(a).not.toBe(dunningIdempotencyKey("org-1", "2026-09-29T13:36:18.000Z", 0))
    expect(a).not.toBe(dunningIdempotencyKey("org-1", PERIOD_END, "expired"))
  })
})
