// Guía de carga de un cobro al pasajero.
//
// El orden de los pasos NO es el orden visual del formulario. Hay dos cascadas
// que obligan a llenarlo en un orden distinto al que se ve:
//
//   moneda -> cuenta financiera   (cambiar la moneda deja pegada la cuenta
//                                  vieja y el server rechaza sin decir cuál)
//   cuenta -> impuesto Ley 25413  (el bloque solo existe si la cuenta elegida
//                                  tiene tasa configurada, y corregir la
//                                  cuenta después borra el tilde)
//
// Y el default más caro del producto: el formulario arranca en USD aunque la
// operación esté vendida en pesos.

import type { TourDefinition } from "../types"

export const opCobroTour: TourDefinition = {
  id: "op-cobro",
  title: "Registrar un cobro",
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
      title: "Cobro es plata que entra",
      body: "Un cobro es plata que te da el pasajero: la seña, una cuota, el saldo final. No confundir con “Registrar Pago”, que es plata que sale hacia el operador.",
      details: [
        "El texto que aparece cuando todavía no hay movimientos dice que uses “Registrar Pago” tanto para lo que recibís del cliente como para lo que le pagás al operador. Está mal: para cobrar al pasajero es siempre “Registrar Cobro”.",
        "Lo que registres acá mueve la caja de verdad y baja la deuda del cliente. No es una anotación.",
      ],
    },
    {
      id: "monto",
      target: "op-cobro.monto",
      title: "Cuánto te pagó",
      body: "El importe que estás recibiendo ahora, no el total de la operación. Si te dan una seña, va la seña.",
      details: [
        "Nadie valida que el monto no supere lo que el cliente debe: se puede cobrar de más sin ningún aviso y la deuda queda en negativo.",
        "Acepta coma o punto para los decimales, da lo mismo.",
      ],
      prepare: { click: "op-cobro.boton", settleMs: 300 },
      placement: "bottom",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "moneda",
      target: "op-cobro.moneda",
      tone: "warning",
      title: "Revisá la moneda antes que nada",
      body: "Arranca siempre en USD, aunque la operación esté vendida en pesos. Es el error más caro de esta pantalla.",
      details: [
        "Cobrar $500.000 en efectivo y dejar el selector en USD registra un cobro de quinientos mil dólares. La caja y la deuda del cliente quedan destruidas y hay que corregirlo a mano.",
        "Y elegí la moneda ANTES que la cuenta: si después la cambiás, la cuenta que ya habías elegido queda pegada aunque desaparezca de la lista, y al guardar salta un error que no dice cuál cuenta reelegir.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "tipo-cambio",
      target: "op-cobro.tipo-cambio",
      title: "Tipo de cambio",
      body: "Aparece solo cuando cobrás en una moneda distinta a la de la venta. Poné el tipo de cambio real del día, no uno redondo.",
      details: [
        "Es cuántos pesos vale un dólar. Si ponés un número muy lejos del mercado el sistema te avisa antes de guardar.",
        "Si no aparece este campo es porque cobrás en la misma moneda de la venta y no hace falta convertir nada.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "cuenta",
      target: "op-cobro.cuenta",
      tone: "warning",
      title: "A qué cuenta entró",
      body: "Dónde quedó la plata: la caja en efectivo, el banco, la cuenta en dólares. De acá sale el movimiento de caja.",
      details: [
        "La lista muestra solo las cuentas de la moneda que elegiste arriba. Si aparece vacía, no hay ninguna cuenta activa en esa moneda: se crean en Configuración → Cuentas financieras.",
        "Elegila después de la moneda, nunca antes.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "metodo",
      target: "op-cobro.metodo",
      title: "Cómo te pagó",
      body: "Transferencia, efectivo, tarjeta. Es informativo para vos, pero conviene que sea fiel: es lo que después mirás cuando no cuadra la caja.",
      placement: "bottom",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "fecha",
      target: "op-cobro.fecha",
      title: "Cuándo lo recibiste",
      body: "Viene con la fecha de hoy. Cambiala si estás cargando un cobro de días atrás.",
      details: [
        "El calendario te deja elegir una fecha futura, pero el sistema la rechaza recién al guardar. No cargues cobros que todavía no ocurrieron.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "impuesto-ley",
      target: "op-cobro.impuesto-ley",
      title: "Impuesto al cheque",
      body: "Aparece solo si la cuenta que elegiste tiene configurada la tasa de la Ley 25413. Tildalo si el banco te descontó el impuesto sobre este movimiento.",
      details: [
        "Si tildás el impuesto y después corregís la cuenta, el tilde se borra solo. Volvé a marcarlo.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "percepciones",
      target: "op-cobro.percepciones",
      tone: "warning",
      title: "Percepciones: leelas antes de tildar",
      body: "Aparecen cuando el sistema considera que el destino es internacional. Tildarlas genera retenciones y asientos contables reales.",
      details: [
        "La detección del destino es por texto y es demasiado amplia: un viaje a Bariloche, Salta o Mendoza también cuenta como internacional y te ofrece la percepción del 30%. Si el viaje es dentro del país, no la tildes.",
        "Si venís de registrar otro cobro en la misma sesión, verificá que no hayan quedado tildadas de la vez anterior: el formulario no se limpia al cerrarlo.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "quien-abona",
      target: "op-cobro.quien-abona",
      title: "Quién de todos pagó",
      body: "Solo aparece si la operación tiene varios pasajeros cargados. Sirve para repartir lo cobrado entre ellos en Saldos por Pasajero.",
      placement: "top",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "guardar",
      target: "op-cobro.guardar",
      tone: "warning",
      title: "Registrar el cobro",
      body: "Tocalo una sola vez. No hay mensaje de confirmación: cuando termina, el diálogo se cierra y el cobro aparece en la lista.",
      details: [
        "Un doble click puede crear dos cobros. Si la conexión está lenta, esperá: no vuelvas a apretar.",
        "Si te avisa que puede ser un pago duplicado, leé la lista que te muestra antes de elegir “Crear igual”. Ese botón desactiva todos los controles.",
        "Si después el cobro aparece con “Esperando aprobación”, quedó registrado pero la plata todavía NO entró a la caja: alguien con permisos tiene que aprobarlo.",
      ],
      placement: "top",
      align: "end",
      interactive: true,
      onMissing: "skip",
    },
  ],
}
