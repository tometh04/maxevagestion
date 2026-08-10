// Guía de carga de un pago al operador.
//
// Comparte formulario con el cobro pero se llena en otro orden, porque acá el
// primer campo pisa a los demás: elegir la deuda reescribe monto y moneda.
//
// Y hay un caso que rompe en silencio y por eso tiene paso propio: cuando hay
// una sola deuda abierta, el sistema la autoselecciona pero NO sincroniza la
// moneda. Queda en USD aunque la deuda sea en pesos, y reelegir la misma deuda
// no lo arregla — hay que cambiar la moneda a mano.
//
// Todos los pasos van con requirePermission: sin cash.write el botón que abre
// este formulario ni siquiera se dibuja.

import type { TourDefinition } from "../types"

export const opPagoTour: TourDefinition = {
  id: "op-pago",
  title: "Registrar un pago al operador",
  kind: "form",
  scope: "user",
  match: ["/operations/[id]"],
  exclude: [
    "/operations/new",
    "/operations/billing",
    "/operations/statistics",
    "/operations/check-ins",
    "/operations/settings",
  ],
  autoStart: false,
  launchHint: "Abrí una operación y entrá al tab Pagos",
  steps: [
    {
      id: "intro",
      title: "Pago es plata que sale",
      body: "Acá registrás lo que le pagaste al mayorista para saldar la deuda de esta operación. Lo que te paga el pasajero va en “Registrar Cobro”.",
      details: [
        "Este formulario no existe para todos los usuarios: necesita permiso sobre la caja. Si no lo tenés, el botón directamente no aparece.",
        "Cada pago descuenta del saldo pendiente con ese operador y mueve la caja.",
      ],
      // Igual que en el cobro: sin el tab activo, el botón que abre el
      // formulario no existe todavía en el DOM.
      prepare: { click: "operation.tab-payments", settleMs: 400 },
      requirePermission: { module: "cash", permission: "write" },
    },
    {
      id: "deuda",
      target: "op-pago.deuda",
      tone: "warning",
      title: "Elegí la deuda primero",
      body: "Este campo va antes que todos los demás, porque al elegir una deuda el sistema completa solo el monto y la moneda.",
      details: [
        "Si cargaste el monto primero, elegir la deuda te lo pisa sin avisar. Es habitual cuando hacés un pago parcial: primero la deuda, después corregís el monto.",
        "Si la operación no tiene deudas abiertas, en lugar del selector vas a ver un texto y el botón de guardar queda deshabilitado. Las deudas se generan al cargar el costo del operador.",
      ],
      prepare: { click: "op-pago.boton", settleMs: 300 },
      placement: "bottom",
      align: "start",
      interactive: true,
      requirePermission: { module: "cash", permission: "write" },
      onMissing: "skip",
    },
    {
      id: "moneda",
      target: "op-pago.moneda",
      tone: "warning",
      title: "Verificá que coincida con la deuda",
      body: "Este campo arranca en USD. Si la deuda que elegiste es en pesos, cambialo a ARS a mano.",
      details: [
        "Cuando hay una sola deuda abierta el sistema la elige solo, pero no ajusta la moneda. Queda en USD aunque la deuda sea en pesos.",
        "En ese caso volver a elegir la misma deuda en la lista no arregla nada: el sistema no detecta que la reelegiste. Tenés que tocar este selector.",
        "Se nota en dos síntomas: aparece un campo de tipo de cambio que no debería, y la lista de cuentas te muestra solo cuentas en dólares.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
      requirePermission: { module: "cash", permission: "write" },
      onMissing: "skip",
    },
    {
      id: "monto",
      target: "op-pago.monto",
      title: "Cuánto le pagaste",
      body: "Viene con el total pendiente de la deuda. Cambialo si estás pagando solo una parte.",
      details: [
        "Nadie valida que no pagues de más. Lo único que te frena es que no haya saldo suficiente en la cuenta.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
      requirePermission: { module: "cash", permission: "write" },
      onMissing: "skip",
    },
    {
      id: "tipo-cambio",
      target: "op-pago.tipo-cambio",
      title: "Tipo de cambio",
      body: "Aparece cuando pagás en una moneda distinta a la de la deuda. Cargá el tipo de cambio real de la operación.",
      details: [
        "Acá el sistema no controla que el número sea razonable, a diferencia de lo que hace con los cobros. Un tipo de cambio mal puesto ensucia los montos en dólares de toda la operación, así que revisalo dos veces.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
      requirePermission: { module: "cash", permission: "write" },
      onMissing: "skip",
    },
    {
      id: "cuenta",
      target: "op-pago.cuenta",
      title: "De qué cuenta salió",
      body: "De acá se descuenta la plata. La lista muestra solo cuentas de la moneda elegida arriba.",
      details: [
        "Si no hay saldo suficiente en esa cuenta, el sistema no deja guardar.",
        "Como en el cobro: primero la moneda, después la cuenta. Cambiar la moneda con una cuenta ya elegida deja el dato viejo pegado.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
      requirePermission: { module: "cash", permission: "write" },
      onMissing: "skip",
    },
    {
      id: "metodo",
      target: "op-pago.metodo",
      title: "Cómo le pagaste",
      body: "Transferencia, efectivo, cheque. Sirve para rastrear el movimiento cuando el operador dice que no le llegó.",
      placement: "bottom",
      align: "start",
      interactive: true,
      requirePermission: { module: "cash", permission: "write" },
      onMissing: "skip",
    },
    {
      id: "fecha",
      target: "op-pago.fecha",
      title: "Cuándo lo pagaste",
      body: "Viene con hoy. Igual que en el cobro, no puede ser una fecha futura.",
      placement: "top",
      align: "start",
      interactive: true,
      requirePermission: { module: "cash", permission: "write" },
      onMissing: "skip",
    },
    {
      id: "notas",
      target: "op-pago.notas",
      title: "Número de comprobante",
      body: "Opcional, pero es lo que te salva cuando hay que reclamar: número de transferencia, de cheque o de recibo del operador.",
      placement: "top",
      align: "start",
      interactive: true,
      requirePermission: { module: "cash", permission: "write" },
      onMissing: "skip",
    },
    {
      id: "guardar",
      target: "op-pago.guardar",
      tone: "warning",
      title: "Registrar el pago",
      body: "Una sola vez. Descuenta de la cuenta y baja el saldo pendiente con el operador.",
      details: [
        "Igual que con los cobros, un doble click puede duplicar el pago. Si aparece el aviso de posible duplicado, leelo antes de forzar.",
        "Si el botón está gris es porque no hay ninguna deuda abierta para saldar.",
      ],
      placement: "top",
      align: "end",
      interactive: true,
      requirePermission: { module: "cash", permission: "write" },
      onMissing: "skip",
    },
  ],
}
