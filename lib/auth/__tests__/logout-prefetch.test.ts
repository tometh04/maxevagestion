/**
 * @jest-environment node
 *
 * Usa el `Request` global del runtime (Node 18+), que jsdom no expone.
 */
import { esPrefetchONavegacionRSC } from "../logout"

/**
 * El bug que este test congela: `app/admin/layout.tsx` tenia
 * `<Link href="/logout">`, Next lo prefetcheaba al entrar en viewport, y ese
 * prefetch — un GET real — cerraba la sesion sin que nadie tocara nada.
 * Reproducido en produccion: entrada de performance
 * `https://app.vibook.ai/logout?_rsc=12bvq` con initiator `fetch`, y la cookie
 * de auth ausente inmediatamente despues.
 */
const req = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { headers })

describe("esPrefetchONavegacionRSC", () => {
  it("reconoce el prefetch de Next por header", () => {
    expect(esPrefetchONavegacionRSC(req("https://x/logout", { "next-router-prefetch": "1" }))).toBe(true)
  })

  it("reconoce el prefetch por el query param _rsc — el caso que se vio en prod", () => {
    expect(esPrefetchONavegacionRSC(req("https://app.vibook.ai/logout?_rsc=12bvq"))).toBe(true)
  })

  it("reconoce una navegacion RSC", () => {
    expect(esPrefetchONavegacionRSC(req("https://x/logout", { rsc: "1" }))).toBe(true)
  })

  it("reconoce los prefetch de otros browsers", () => {
    expect(esPrefetchONavegacionRSC(req("https://x/logout", { purpose: "prefetch" }))).toBe(true)
    expect(esPrefetchONavegacionRSC(req("https://x/logout", { "x-moz": "prefetch" }))).toBe(true)
  })

  // Lo que NO puede pasar: que la guarda se coma un logout de verdad.
  it("deja pasar una navegacion normal del usuario", () => {
    expect(esPrefetchONavegacionRSC(req("https://app.vibook.ai/logout"))).toBe(false)
  })

  it("deja pasar aunque haya otros query params", () => {
    expect(esPrefetchONavegacionRSC(req("https://app.vibook.ai/logout?motivo=manual"))).toBe(false)
  })
})
