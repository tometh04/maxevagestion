/**
 * Cada ancla que una guía referencia tiene que existir de verdad en el código.
 *
 * Es el error más silencioso de todo el sistema: un `target` con un typo, o un
 * `data-tour` que quedó sin poner, hace que el paso se saltee sin ningún aviso.
 * La guía sigue "funcionando" y nadie se entera de que perdió un paso.
 *
 * Pasó de verdad al escribir la guía de alta de operación: el paso de la fecha
 * máxima de pago pedía `op-new.pago-limite` y esa ancla nunca se había puesto.
 */

import { readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"
import { TOURS } from "../registry"
import { stepAnchorNames } from "../anchors"

const ROOT = process.cwd()
const SCAN_DIRS = ["components", "app"]
const SKIP = new Set(["node_modules", ".next", "__tests__", "dist"])

function collectAnchors(dir: string, found: Set<string>) {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    const stat = statSync(full)

    if (stat.isDirectory()) {
      collectAnchors(full, found)
      continue
    }
    if (!entry.endsWith(".tsx")) continue

    const source = readFileSync(full, "utf8")
    // Solo literales: un data-tour armado con template string no se puede
    // verificar estáticamente y hoy no existe ninguno.
    const re = /data-tour="([^"]+)"/g
    let match: RegExpExecArray | null
    while ((match = re.exec(source)) !== null) {
      found.add(match[1])
    }
  }
}

describe("las anclas referenciadas existen en el código", () => {
  const found = new Set<string>()
  for (const dir of SCAN_DIRS) collectAnchors(join(ROOT, dir), found)

  it("encuentra anclas para escanear (si no, el test no prueba nada)", () => {
    expect(found.size).toBeGreaterThan(20)
  })

  for (const tour of TOURS) {
    it(`«${tour.title}» apunta solo a anclas que existen`, () => {
      const faltantes: string[] = []
      for (const step of tour.steps) {
        for (const name of stepAnchorNames(step)) {
          if (!found.has(name)) faltantes.push(`${step.id} → ${name}`)
        }
      }
      expect(faltantes).toEqual([])
    })
  }
})
