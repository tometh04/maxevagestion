import { parsearCamposDelModal, esRutaInterna } from "../modal-payload"

const ok = (r: ReturnType<typeof parsearCamposDelModal>) => {
  if (!r.ok) throw new Error(`Esperaba ok, vino: ${r.error}`)
  return r.campos
}

describe("destino del botón", () => {
  it("acepta una ruta interna", () => {
    expect(esRutaInterna("/finances/settings")).toBe(true)
  })

  // El campo lo carga un admin y termina en un enlace que el usuario clickea:
  // si aceptara cualquier host sería una redirección abierta desde el panel.
  it("rechaza una URL externa", () => {
    expect(esRutaInterna("https://sitio-que-no-es-vibook.com")).toBe(false)
  })

  it("rechaza el protocolo relativo, que sale del sitio igual", () => {
    expect(esRutaInterna("//sitio-que-no-es-vibook.com")).toBe(false)
  })

  it("rechaza javascript:", () => {
    expect(esRutaInterna("javascript:alert(1)")).toBe(false)
  })

  it("da un error explicando qué se espera", () => {
    const r = parsearCamposDelModal({
      modal: true,
      modal_cta_label: "Ir",
      modal_cta_href: "https://otro.com",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("ruta interna")
  })
})

describe("botón incompleto", () => {
  it("no acepta destino sin texto", () => {
    const r = parsearCamposDelModal({ modal: true, modal_cta_href: "/finances/settings" })
    expect(r.ok).toBe(false)
  })

  it("no acepta texto sin destino", () => {
    const r = parsearCamposDelModal({ modal: true, modal_cta_label: "Configurar" })
    expect(r.ok).toBe(false)
  })

  it("acepta los dos juntos", () => {
    const c = ok(
      parsearCamposDelModal({
        modal: true,
        modal_cta_label: "Configurar",
        modal_cta_href: "/finances/settings",
      })
    )
    expect(c.modal_cta_label).toBe("Configurar")
    expect(c.modal_cta_href).toBe("/finances/settings")
  })
})

describe("roles", () => {
  it("normaliza a mayúsculas y descarta vacíos", () => {
    const c = ok(parsearCamposDelModal({ modal: true, modal_roles: [" contable ", "", "ADMIN"] }))
    expect(c.modal_roles).toEqual(["CONTABLE", "ADMIN"])
  })

  it("rechaza un rol que no existe", () => {
    const r = parsearCamposDelModal({ modal: true, modal_roles: ["CONTADOR"] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("CONTADOR")
  })

  it("una lista vacía es null: lo ven todos", () => {
    expect(ok(parsearCamposDelModal({ modal: true, modal_roles: [] })).modal_roles).toBeNull()
  })
})

describe("ventana", () => {
  it("rechaza una fecha de fin anterior a la de inicio", () => {
    const r = parsearCamposDelModal({
      modal: true,
      modal_starts_at: "2026-09-10",
      modal_ends_at: "2026-09-01",
    })
    expect(r.ok).toBe(false)
  })

  it("ignora fechas que no se pueden interpretar en vez de romper", () => {
    expect(ok(parsearCamposDelModal({ modal: true, modal_starts_at: "no es fecha" })).modal_starts_at).toBeNull()
  })
})

describe("novedad común", () => {
  it("sin modal, todos los campos quedan apagados", () => {
    const c = ok(parsearCamposDelModal({}))
    expect(c).toEqual({
      release_version: null,
      modal: false,
      modal_starts_at: null,
      modal_ends_at: null,
      modal_roles: null,
      modal_cta_label: null,
      modal_cta_href: null,
    })
  })
})
