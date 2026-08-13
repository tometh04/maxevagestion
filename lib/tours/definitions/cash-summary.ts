import type { TourDefinition } from "../types"

export const cashSummaryTour: TourDefinition = {
  id: "cash-summary",
  title: "Caja y Bancos",
  scope: "user",
  match: ["/cash/summary"],
  autoStart: true,
  steps: [
    {
      id: "pago-vs-movimiento",
      route: "/cash/summary",
      title: "Primero: pago y movimiento no son lo mismo",
      body: "Un pago es un compromiso —una cuota que el cliente te debe, o que vos le debés al operador— y tiene fecha de vencimiento. Un movimiento es plata que efectivamente entró o salió de una cuenta.",
      details: [
        "Un pago puede existir hace meses sin que se haya movido un peso: está pendiente.",
        "“Marcar como pagado” es el puente entre los dos: ahí elegís de qué cuenta sale o entra la plata y recién ahí se crea el movimiento.",
        "También podés cargar un movimiento suelto, sin un pago detrás, para algo que no nace de una operación.",
      ],
    },
    {
      id: "tab-resumen",
      target: "cash.tab-resumen",
      route: "/cash/summary",
      title: "Resumen de caja",
      body: "El estado consolidado del dinero: cuánto entró, cuánto salió y con qué saldo quedó cada cuenta. Podés filtrar por agencia, cuenta y período.",
      details: [
        "Ojo con una diferencia importante: Ingresos y Egresos son del período que filtraste, pero “Balance” es el saldo de la cuenta hoy. No son comparables entre sí.",
        "Solo se listan las cuentas activas. Si te falta una, puede estar dada de baja.",
        "ARS y USD nunca se suman: siempre vas a ver los totales separados por moneda.",
      ],
      placement: "bottom",
      align: "start",
    },
    {
      id: "tab-cuentas",
      target: "cash.tab-cuentas",
      title: "Cuentas financieras",
      body: "Cada caja, banco, billetera o tarjeta con su saldo actual. Todo cobro y todo pago tiene que impactar en alguna de estas cuentas.",
      details: [
        "El tipo de cuenta define la moneda, y la cuenta pertenece a una agencia: si tenés varias sucursales, cada una necesita las suyas.",
        "Con “Transferir” movés plata entre cuentas propias. Si las dos cuentas son de distinta moneda, eso es una compra o venta de dólares y te va a pedir el tipo de cambio.",
        "Para corregir el saldo contra el extracto del banco, entrá a editar la cuenta y ajustá el saldo poniendo el motivo. El ajuste queda registrado como asiento, no pisa el número en silencio.",
      ],
      placement: "bottom",
      align: "start",
    },
    {
      id: "tab-pagos",
      target: "cash.tab-pagos",
      tone: "warning",
      title: "Pagos: fijate en el filtro de dirección",
      body: "Acá están los compromisos: cobros pendientes de clientes y pagos pendientes a operadores, con su vencimiento.",
      details: [
        "El filtro “Dirección” arranca en Egresos, así que al entrar ves solo los pagos a operadores. Si te parece que faltan los cobros de clientes, cambialo a “Ingresos y egresos”.",
        "Eliminar un pago que ya figura como pagado borra también el movimiento de caja asociado y cambia el saldo de la cuenta. No se puede deshacer.",
      ],
      placement: "bottom",
      align: "start",
    },
    {
      id: "tab-movimientos",
      target: "cash.tab-movimientos",
      title: "Movimientos",
      body: "El detalle de cada entrada y salida real, con la cuenta, la categoría y quién la cargó. Es la base para conciliar contra el extracto bancario.",
      details: [
        "Al cargar un movimiento hay un switch “Afecta saldo” que viene activado. Si lo apagás, el movimiento se ve en la lista pero no mueve el saldo de la cuenta: sirve para registrar algo informativo, y descuadra la caja si se apaga por error.",
        "Para corregir un movimiento mal cargado se usa “Reversar”, no se borra: queda el original tachado y un movimiento espejo. Así no se pierde el rastro.",
        "En el alta, el selector de cuenta solo muestra las de la moneda que elegiste. Si no ves tu cuenta, revisá la moneda.",
      ],
      placement: "bottom",
      align: "start",
    },
    {
      id: "conciliar",
      title: "Cómo conciliar contra el banco",
      body: "No hay una pantalla de conciliación aparte. Se hace combinando lo que ya viste: exportás los movimientos, los cruzás contra el extracto y corregís las diferencias.",
      details: [
        "Si un movimiento está mal, reversalo. Si hay una diferencia que no podés explicar movimiento por movimiento, ajustá el saldo de la cuenta dejando el motivo escrito.",
        "Cada ajuste sin motivo es un agujero en la auditoría: el campo está para llenarlo.",
      ],
      route: "/cash/summary",
    },
  ],
}
