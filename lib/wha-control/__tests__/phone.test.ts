import {
  normalizePhoneDigits,
  phoneSearchFragment,
  phoneToWaJid,
} from "../phone"

describe("normalizePhoneDigits", () => {
  it("saca todo lo que no sea dígito", () => {
    expect(normalizePhoneDigits("+54 9 (341) 555-1234")).toBe("5493415551234")
  })
  it("saca el 00 internacional", () => {
    expect(normalizePhoneDigits("0054 9 341 5551234")).toBe("5493415551234")
  })
})

describe("phoneToWaJid", () => {
  it("549 completo queda igual", () => {
    expect(phoneToWaJid("+54 9 341 555 1234")).toBe("5493415551234@s.whatsapp.net")
  })
  it("54 sin 9 => inserta el 9", () => {
    expect(phoneToWaJid("54 341 555 1234")).toBe("5493415551234@s.whatsapp.net")
  })
  it("número local => prefija 549", () => {
    expect(phoneToWaJid("341 555 1234")).toBe("5493415551234@s.whatsapp.net")
  })
  it("local con 0 de área => saca el 0", () => {
    expect(phoneToWaJid("0341 5551234")).toBe("5493415551234@s.whatsapp.net")
  })
  it("otro país con código largo queda igual", () => {
    expect(phoneToWaJid("59891234567")).toBe("59891234567@s.whatsapp.net")
  })
  it("vacío o basura => null", () => {
    expect(phoneToWaJid("")).toBeNull()
    expect(phoneToWaJid("abc")).toBeNull()
    expect(phoneToWaJid("12")).toBeNull()
  })
})

describe("phoneSearchFragment", () => {
  it("devuelve los últimos 8 dígitos", () => {
    expect(phoneSearchFragment("+54 9 341 555-1234")).toBe("15551234")
  })
  it("números cortos devuelven lo que hay", () => {
    expect(phoneSearchFragment("5551234")).toBe("5551234")
  })
})
