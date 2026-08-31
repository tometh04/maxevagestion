import {
  debeMostrarse,
  ventanaAbierta,
  alcanzaElRol,
  elegirModal,
} from "../modal-visibility"

const AHORA = "2026-09-05T12:00:00.000Z"

const base = {
  modal: true,
  modal_starts_at: null,
  modal_ends_at: null,
  modal_roles: null,
}

const ctx = { ahora: AHORA, rolesDelUsuario: ["CONTABLE"], descartado: false }

describe("ventana de exhibición", () => {
  it("sin fechas, se muestra: arranca al publicarse y no vence", () => {
    expect(ventanaAbierta({ modal_starts_at: null, modal_ends_at: null }, AHORA)).toBe(true)
  })

  it("no se muestra antes de la fecha de inicio", () => {
    expect(
      ventanaAbierta({ modal_starts_at: "2026-09-10T00:00:00.000Z", modal_ends_at: null }, AHORA)
    ).toBe(false)
  })

  it("no se muestra después de la fecha de fin", () => {
    expect(
      ventanaAbierta({ modal_starts_at: null, modal_ends_at: "2026-09-01T00:00:00.000Z" }, AHORA)
    ).toBe(false)
  })

  it("se muestra dentro de la ventana", () => {
    expect(
      ventanaAbierta(
        { modal_starts_at: "2026-09-01T00:00:00.000Z", modal_ends_at: "2026-09-15T00:00:00.000Z" },
        AHORA
      )
    ).toBe(true)
  })
})

describe("restricción por rol", () => {
  it("sin roles definidos lo ve cualquiera", () => {
    expect(alcanzaElRol(null, ["SELLER"])).toBe(true)
    expect(alcanzaElRol([], ["SELLER"])).toBe(true)
  })

  it("deja pasar al rol incluido y frena al que no", () => {
    expect(alcanzaElRol(["CONTABLE", "ADMIN"], ["CONTABLE"])).toBe(true)
    expect(alcanzaElRol(["CONTABLE", "ADMIN"], ["SELLER"])).toBe(false)
  })

  // Los roles suman, igual que en los permisos: no se pide que coincidan todos.
  it("a un usuario multi-rol le alcanza con que uno coincida", () => {
    expect(alcanzaElRol(["CONTABLE"], ["SELLER", "CONTABLE"])).toBe(true)
  })

  it("un usuario sin roles no entra en un anuncio restringido", () => {
    expect(alcanzaElRol(["CONTABLE"], [])).toBe(false)
  })
})

describe("decisión completa", () => {
  it("se muestra cuando todo da", () => {
    expect(debeMostrarse(base, ctx)).toBe(true)
  })

  it("una novedad común (sin modal) nunca interrumpe", () => {
    expect(debeMostrarse({ ...base, modal: false }, ctx)).toBe(false)
  })

  it("no se muestra si el usuario lo descartó", () => {
    expect(debeMostrarse(base, { ...ctx, descartado: true })).toBe(false)
  })

  // El descarte manda sobre todo lo demás: si alguien dijo que no se lo muestren
  // más, ninguna ventana ni ningún rol lo revive.
  it("el descarte pesa más que una ventana abierta y un rol que alcanza", () => {
    expect(
      debeMostrarse(
        { ...base, modal_roles: ["CONTABLE"], modal_ends_at: "2027-01-01T00:00:00.000Z" },
        { ...ctx, descartado: true }
      )
    ).toBe(false)
  })

  it("no se muestra a un rol que no está en la lista", () => {
    expect(
      debeMostrarse({ ...base, modal_roles: ["CONTABLE"] }, { ...ctx, rolesDelUsuario: ["SELLER"] })
    ).toBe(false)
  })
})

describe("cuál se muestra cuando hay varios", () => {
  const id = (a: any) => a.id

  it("elige el más reciente, no dos a la vez", () => {
    const elegido = elegirModal(
      [
        { id: "viejo", ...base, published_at: "2026-08-01T00:00:00.000Z" },
        { id: "nuevo", ...base, published_at: "2026-09-01T00:00:00.000Z" },
      ],
      ctx,
      new Set(),
      id
    )
    expect(elegido?.id).toBe("nuevo")
  })

  it("si el más reciente está descartado, muestra el anterior que corresponda", () => {
    const elegido = elegirModal(
      [
        { id: "viejo", ...base, published_at: "2026-08-01T00:00:00.000Z" },
        { id: "nuevo", ...base, published_at: "2026-09-01T00:00:00.000Z" },
      ],
      ctx,
      new Set(["nuevo"]),
      id
    )
    expect(elegido?.id).toBe("viejo")
  })

  it("devuelve null si ninguno corresponde", () => {
    const elegido = elegirModal(
      [{ id: "a", ...base, modal_roles: ["ADMIN"], published_at: "2026-09-01T00:00:00.000Z" }],
      { ...ctx, rolesDelUsuario: ["SELLER"] },
      new Set(),
      id
    )
    expect(elegido).toBeNull()
  })

  it("sin anuncios devuelve null", () => {
    expect(elegirModal([], ctx, new Set(), id)).toBeNull()
  })
})
