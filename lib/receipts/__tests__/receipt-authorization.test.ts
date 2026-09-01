/**
 * @jest-environment node
 *
 * VIB-129 — "que los vendedores además de poder ver sus operaciones puedan
 * descargar sus recibos por su cuenta (además sirve para un doble control, si no
 * lo ven creado me piden a mí que registre esa venta) pero que no puedan generar
 * pagos ni cobros".
 *
 * La pestaña "Recibos" que se le muestra al vendedor se apoya en que el servidor
 * ya corta el acceso a recibos ajenos. Esa garantía no tenía test: si alguien la
 * saca "simplificando", la UI seguiría andando y un vendedor podría pedir por id
 * el recibo de la venta de un compañero.
 *
 * El alcance se verifica sobre `buildReceiptPdfData`, que es lo que usan tanto la
 * descarga como el envío por mail y por WhatsApp — los tres caminos.
 */

import { buildReceiptPdfData } from "../receipt-pdf-data"

const ORG_ID = "org-1"
const SELLER_ID = "seller-1"
const OTHER_SELLER_ID = "seller-2"

/** Devuelve un cliente Supabase que responde ese pago para cualquier consulta. */
function buildSupabase(payment: any) {
  return {
    from: () => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: payment, error: null }),
        then: (resolve: any) => resolve({ data: [], error: null }),
      }
      return builder
    },
  }
}

function paymentOf(sellerId: string | null) {
  return {
    id: "pay-1",
    amount: 1000,
    currency: "USD",
    direction: "INCOME",
    payer_type: "CUSTOMER",
    date_paid: "2026-08-01",
    operation_id: "op-1",
    operation_service_id: null,
    operations: {
      id: "op-1",
      seller_id: sellerId,
      file_code: "OP-1",
      destination: "Cancún",
      agencies: { id: "a1", name: "Rosario" },
    },
    operation_services: null,
  }
}

async function build(sellerIdOnOperation: string | null, user: { id: string; role: string }) {
  return buildReceiptPdfData({
    supabase: buildSupabase(paymentOf(sellerIdOnOperation)),
    paymentId: "pay-1",
    orgId: ORG_ID,
    user,
  })
}

describe("buildReceiptPdfData — alcance del vendedor (VIB-129)", () => {
  it("un SELLER NO puede ver el recibo de una operación de otro vendedor", async () => {
    const result = await build(OTHER_SELLER_ID, { id: SELLER_ID, role: "SELLER" })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
    expect(result.error).toMatch(/No autorizado/i)
  })

  it("un SELLER sí puede ver el recibo de SU operación", async () => {
    const result = await build(SELLER_ID, { id: SELLER_ID, role: "SELLER" })

    // Puede fallar más adelante por datos incompletos del mock, pero nunca por 403:
    // lo que se fija acá es que el alcance no lo bloquee.
    if (!result.ok) {
      expect(result.status).not.toBe(403)
    }
  })

  it("una operación sin vendedor asignado tampoco se le muestra al SELLER", async () => {
    // `null !== seller.id`, así que corta. Es lo correcto: sin dueño declarado no
    // se puede afirmar que la venta sea suya.
    const result = await build(null, { id: SELLER_ID, role: "SELLER" })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
  })

  it("un ADMIN ve el recibo aunque no sea el vendedor", async () => {
    const result = await build(OTHER_SELLER_ID, { id: "admin-1", role: "ADMIN" })

    if (!result.ok) {
      expect(result.status).not.toBe(403)
    }
  })

  it("el corte es por rol SELLER, no por el id: otros roles no quedan atrapados", async () => {
    for (const role of ["ADMIN", "SUPER_ADMIN", "CONTABLE", "ORG_OWNER"]) {
      const result = await build(OTHER_SELLER_ID, { id: "otro-1", role })
      if (!result.ok) {
        expect(result.status).not.toBe(403)
      }
    }
  })
})
