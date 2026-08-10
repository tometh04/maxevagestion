// Invariantes del registry. Es el test que atrapa las regresiones reales:
// alguien edita el copy de una guía, se equivoca en el nombre de un ancla o
// apunta a un módulo de permisos que no existe, y acá se cae.

import { TOURS } from "../registry"
import { ALL_MODULES } from "@/lib/permissions/resolved"
import { ONBOARDING_STEP_KEYS } from "@/lib/onboarding/steps"
import { ANCHOR_FORMAT, stepAnchorNames } from "../anchors"
import { tourLaunchPath } from "../entry"

describe("invariantes de las guías", () => {
  it("los ids de tour son únicos", () => {
    const ids = TOURS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("los ids de paso son únicos dentro de cada tour", () => {
    for (const tour of TOURS) {
      const ids = tour.steps.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it("cada tour tiene al menos un paso y un match", () => {
    for (const tour of TOURS) {
      expect(tour.steps.length).toBeGreaterThan(0)
      expect(tour.match.length).toBeGreaterThan(0)
    }
  })

  it("todas las anclas siguen el formato <area>.<elemento>", () => {
    for (const tour of TOURS) {
      for (const step of tour.steps) {
        for (const name of stepAnchorNames(step)) {
          expect(name).toMatch(ANCHOR_FORMAT)
        }
      }
    }
  })

  it("todo nextTour apunta a una guía que existe", () => {
    // Un nextTour roto deja un botón "Guiarme paso a paso" que no hace nada.
    const ids = new Set(TOURS.map((t) => t.id))
    for (const tour of TOURS) {
      for (const step of tour.steps) {
        if (step.nextTour) expect(ids.has(step.nextTour)).toBe(true)
      }
    }
  })

  it("las guías de formulario declaran launchHint", () => {
    // Sus anclas viven dentro de un diálogo: si no está abierto, el menú tiene
    // que poder explicar cómo llegar en vez de ofrecer un botón que falla.
    for (const tour of TOURS) {
      if (tour.kind !== "form") continue
      expect(Boolean(tour.launchHint)).toBe(true)
    }
  })

  it("cada guía se puede abrir desde el menú, o explica por qué no", () => {
    // Si no declara ruta de entrada ni pista, en el listado queda un ítem que
    // al clickearlo arranca la guía en una pantalla donde sus anclas no
    // existen: se saltea sola y se cierra sin que el usuario entienda nada.
    for (const tour of TOURS) {
      const launchable = Boolean(tourLaunchPath(tour))
      expect(launchable || Boolean(tour.launchHint)).toBe(true)
    }
  })

  it("tone y details son válidos", () => {
    for (const tour of TOURS) {
      for (const step of tour.steps) {
        if (step.tone) expect(["info", "warning"]).toContain(step.tone)
        // Un details vacío deja un "Ver más" que abre en blanco.
        if (step.details) {
          expect(step.details.length).toBeGreaterThan(0)
          expect(step.details.every((d) => d.trim().length > 0)).toBe(true)
        }
      }
    }
  })

  it("los permisos referenciados existen", () => {
    for (const tour of TOURS) {
      for (const step of tour.steps) {
        if (!step.requirePermission) continue
        expect(ALL_MODULES).toContain(step.requirePermission.module)
      }
    }
  })

  it("las rutas de match, exclude y route son absolutas", () => {
    for (const tour of TOURS) {
      for (const pattern of [...tour.match, ...(tour.exclude ?? [])]) {
        expect(pattern.startsWith("/")).toBe(true)
      }
      for (const step of tour.steps) {
        if (step.route) expect(step.route.startsWith("/")).toBe(true)
      }
    }
  })

  it("una guía de pantalla que auto-dispara es alcanzable desde el menú", () => {
    // Sin ruta de entrada ni launchHint, una guía queda listada pero muerta:
    // el botón del menú no sabe a dónde llevar y no hay texto que lo explique.
    for (const tour of TOURS) {
      if ((tour.kind ?? "screen") !== "screen" || !tour.autoStart) continue
      const alcanzable = Boolean(tour.steps[0]?.route) || Boolean(tour.launchHint)
      expect([tour.id, alcanzable]).toEqual([tour.id, true])
    }
  })

  it("solo el setup inicial es org-scoped, y sus keys coinciden con el checklist", () => {
    for (const tour of TOURS) {
      if (tour.scope !== "org") {
        expect(tour.steps.every((s) => !s.completesSetupKey)).toBe(true)
        continue
      }
      expect(tour.id).toBe("setup-cuenta")
      // Si divergen, el checklist del dashboard deja de reflejar el progreso.
      const keys = tour.steps.map((s) => s.completesSetupKey).filter(Boolean)
      expect(new Set(keys)).toEqual(new Set(ONBOARDING_STEP_KEYS))
      expect(tour.requireRoles?.length).toBeGreaterThan(0)
    }
  })
})
