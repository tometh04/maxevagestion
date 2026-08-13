import {
  emptyTourState,
  isTourUnseen,
  markTourFinished,
  markTourProgress,
  markTourStarted,
  sanitizeTourState,
  shouldAutoStart,
  TOUR_STATE_VERSION,
} from "../state"
import { TOUR_IDS } from "../registry"

const KNOWN = TOUR_IDS[0]

describe("sanitizeTourState", () => {
  it("devuelve estado vacío para entradas no-objeto", () => {
    for (const raw of [null, undefined, "x", 42, [], true]) {
      expect(sanitizeTourState(raw)).toEqual(emptyTourState())
    }
  })

  it("descarta tourIds que no están en el registry", () => {
    const result = sanitizeTourState({
      seenTours: {
        "tour-que-ya-no-existe": { status: "completed", lastStepIndex: 3 },
        [KNOWN]: { status: "completed", lastStepIndex: 3 },
      },
    })
    expect(Object.keys(result.seenTours)).toEqual([KNOWN])
  })

  it("coerciona lastStepIndex inválido a 0", () => {
    for (const bad of [-1, "3", 1.5, null, NaN]) {
      const result = sanitizeTourState({
        seenTours: { [KNOWN]: { status: "completed", lastStepIndex: bad } },
      })
      expect(result.seenTours[KNOWN].lastStepIndex).toBe(0)
    }
  })

  it("cae a in_progress con un status desconocido", () => {
    const result = sanitizeTourState({ seenTours: { [KNOWN]: { status: "vaya-a-saber" } } })
    expect(result.seenTours[KNOWN].status).toBe("in_progress")
  })

  it("solo acepta timestamps string", () => {
    const result = sanitizeTourState({
      seenTours: { [KNOWN]: { status: "completed", completedAt: 12345, startedAt: "2026-01-01" } },
    })
    expect(result.seenTours[KNOWN].completedAt).toBeNull()
    expect(result.seenTours[KNOWN].startedAt).toBe("2026-01-01")
  })

  it("exige toursDisabled estrictamente true", () => {
    expect(sanitizeTourState({ toursDisabled: "yes" }).toursDisabled).toBe(false)
    expect(sanitizeTourState({ toursDisabled: 1 }).toursDisabled).toBe(false)
    expect(sanitizeTourState({ toursDisabled: true }).toursDisabled).toBe(true)
  })

  it("descarta un seenTours que no sea objeto", () => {
    expect(sanitizeTourState({ seenTours: ["x"] }).seenTours).toEqual({})
    expect(sanitizeTourState({ seenTours: "x" }).seenTours).toEqual({})
  })

  it("sella la versión y descarta keys desconocidas", () => {
    const result = sanitizeTourState({ version: 99, hackeado: true }) as unknown as Record<
      string,
      unknown
    >
    expect(result.version).toBe(TOUR_STATE_VERSION)
    expect(result.hackeado).toBeUndefined()
  })

  it("es idempotente", () => {
    const raw = {
      seenTours: { [KNOWN]: { status: "completed", lastStepIndex: 2, completedAt: "2026-01-01" } },
      toursDisabled: true,
    }
    const once = sanitizeTourState(raw)
    expect(sanitizeTourState(once)).toEqual(once)
  })
})

describe("transiciones", () => {
  it("markTourStarted conserva el startedAt original", () => {
    const first = markTourStarted(emptyTourState(), KNOWN, "2026-01-01")
    const second = markTourStarted(first, KNOWN, "2026-02-02")
    expect(second.seenTours[KNOWN].startedAt).toBe("2026-01-01")
    expect(second.seenTours[KNOWN].status).toBe("in_progress")
  })

  it("markTourProgress no crea entradas para tours no arrancados", () => {
    const state = markTourProgress(emptyTourState(), KNOWN, 3)
    expect(state.seenTours[KNOWN]).toBeUndefined()
  })

  it("markTourFinished sella completedAt solo al completar", () => {
    const started = markTourStarted(emptyTourState(), KNOWN, "2026-01-01")
    const dismissed = markTourFinished(started, KNOWN, "dismissed", 2, "2026-01-02")
    expect(dismissed.seenTours[KNOWN].completedAt).toBeNull()
    expect(dismissed.seenTours[KNOWN].dismissedAt).toBe("2026-01-02")

    const completed = markTourFinished(started, KNOWN, "completed", 5, "2026-01-03")
    expect(completed.seenTours[KNOWN].completedAt).toBe("2026-01-03")
  })
})

describe("usuarios que ya venían usando el sistema", () => {
  // El backfill los marca 'preexisting' para no tirarles 6 guías encima al
  // publicar. La distinción con 'dismissed' es la que mantiene el punto rojo.
  const preexisting = {
    ...emptyTourState(),
    seenTours: {
      [KNOWN]: {
        status: "preexisting" as const,
        lastStepIndex: 0,
        startedAt: null,
        completedAt: null,
        dismissedAt: null,
      },
    },
  }

  it("no le auto-dispara la guía", () => {
    expect(shouldAutoStart(preexisting, KNOWN)).toBe(false)
  })

  it("pero la guía sigue contando como no vista", () => {
    expect(isTourUnseen(preexisting, KNOWN)).toBe(true)
  })

  it("una guía completada o descartada sí cuenta como vista", () => {
    const done = markTourFinished(emptyTourState(), KNOWN, "completed", 3, "2026-01-01")
    expect(isTourUnseen(done, KNOWN)).toBe(false)
    const dismissed = markTourFinished(emptyTourState(), KNOWN, "dismissed", 1, "2026-01-01")
    expect(isTourUnseen(dismissed, KNOWN)).toBe(false)
  })

  it("una guía que nunca tocó cuenta como no vista", () => {
    expect(isTourUnseen(emptyTourState(), KNOWN)).toBe(true)
  })

  it("sobrevive al sanitizador", () => {
    // Si el sanitizador no aceptara 'preexisting', el backfill se degradaría a
    // 'in_progress' en la primera lectura y las guías volverían a saltar.
    expect(sanitizeTourState(preexisting).seenTours[KNOWN].status).toBe("preexisting")
  })
})

describe("shouldAutoStart", () => {
  it("arranca solo si el usuario nunca vio la guía", () => {
    expect(shouldAutoStart(emptyTourState(), KNOWN)).toBe(true)
  })

  it("no vuelve a arrancar una guía cerrada a medias", () => {
    // in_progress significa que ya se la cruzó y la cerró: se retoma a mano
    // desde el menú, no insistiendo en cada visita.
    const started = markTourStarted(emptyTourState(), KNOWN, "2026-01-01")
    expect(shouldAutoStart(started, KNOWN)).toBe(false)
  })

  it("respeta el apagado global", () => {
    expect(shouldAutoStart({ ...emptyTourState(), toursDisabled: true }, KNOWN)).toBe(false)
  })
})
