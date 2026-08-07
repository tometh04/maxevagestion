// /commissions renderiza la vista de admin o la de vendedor según permisos. Las
// anclas existen en ambas, pero el texto tiene que servir para las dos: el
// vendedor ve lo suyo, el admin ve el total de la agencia.

import type { TourDefinition } from "../types"

export const commissionsTour: TourDefinition = {
  id: "commissions",
  title: "Comisiones",
  scope: "user",
  match: ["/commissions"],
  autoStart: true,
  steps: [
    {
      id: "summary",
      target: "commissions.summary",
      route: "/commissions",
      title: "Lo que se debe",
      // CORREGIDO. Decía "se genera sola cuando la operación se cierra y el
      // cliente terminó de pagar". Se calcula sobre el margen y se recalcula al
      // crear o editar la operación; el cobro condiciona el PAGO, no la
      // generación.
      body: "El total de comisiones pendientes y ya pagadas del período. La comisión se calcula sobre el margen de la operación —venta menos costo del operador—, no sobre la venta.",
      details: [
        "Se recalcula sola cada vez que se crea o se edita la operación. Si alguien corrige el precio de venta o el costo del operador, la comisión se reescribe con el valor nuevo.",
        "Lo único que la protege es que ya esté pagada, tenga un pago parcial o haya sido saldada: en esos casos no se toca.",
        "Si el margen queda en cero o negativo, la comisión es cero. Nunca da negativo.",
      ],
      placement: "bottom",
    },
    {
      id: "threshold",
      title: "Por qué una comisión aparece pero no se cobra",
      body: "Una comisión puede estar generada y visible y aun así no poder pagarse todavía: la agencia define un umbral de cobranza (95% por defecto) que exige que la operación esté cobrada antes de liquidarla.",
      details: [
        "La idea es no pagar comisiones de plata que todavía no entró.",
        "En la vista de administración las comisiones bloqueadas aparecen con un aviso de “No cobrada aún”. En la vista de vendedor ese aviso no se muestra, así que si ves una comisión pendiente hace tiempo, lo más probable es que la operación todavía no esté cobrada.",
        "El umbral se configura en el tab Reglas. Puesto en 0% se paga aunque no esté cobrada.",
      ],
      route: "/commissions",
    },
    {
      id: "period",
      target: "commissions.period-selector",
      title: "Elegir el período",
      body: "Las comisiones se liquidan por mes. Cambiá el mes para ver lo que corresponde a cada liquidación.",
      placement: "bottom",
      align: "start",
    },
    {
      id: "tab-pending",
      target: "commissions.tab-pending",
      title: "Pendientes de pago",
      body: "El detalle de lo que todavía no se liquidó, con las operaciones que lo generan. En la vista de administración viene agrupado por vendedor y se despliega.",
      details: [
        "Al pagar solo se puede liquidar una moneda por vez: si elegís una comisión en otra moneda, se deselecciona lo anterior.",
        "El monto de cada comisión es editable, así que se pueden hacer pagos parciales.",
        "El pago genera un movimiento de caja que descuenta de la cuenta que elijas, y valida que haya saldo suficiente.",
      ],
      placement: "bottom",
      align: "start",
    },
    {
      id: "tab-history",
      target: "commissions.tab-history",
      title: "Historial",
      body: "Las liquidaciones ya pagadas, con fecha y monto. Sirve como respaldo ante cualquier reclamo.",
      placement: "bottom",
      align: "start",
    },
    {
      id: "shared-sale",
      title: "Ventas compartidas entre dos vendedores",
      body: "Cuando una operación tiene vendedor principal y secundario, el sistema reparte la comisión solo, según el perfil de cada uno. No hace falta calcularlo a mano.",
      details: [
        "La regla general es mitad y mitad: cada uno cobra la mitad de su propio porcentaje. Con 20% y 30%, cobran 10% y 15%.",
        "Si a un vendedor se lo marcó como que “absorbe”, ese cobra su porcentaje menos lo que cobró el otro. Es un techo, no un premio: con un socio de porcentaje alto puede terminar cobrando poco o nada.",
        "En modo automático los porcentajes que se escriban a mano en la operación no mandan: el sistema los deriva de los perfiles y los reescribe.",
      ],
      route: "/commissions",
    },
    {
      id: "tab-rules",
      target: "commissions.tab-rules",
      tone: "warning",
      title: "Reglas: cuidado con la precedencia",
      body: "Acá se definen los porcentajes por vendedor y por tipo de servicio, y el umbral de cobranza. Cambiarlos afecta las comisiones que se calculen de acá en adelante, no las ya generadas.",
      details: [
        "Una regla creada acá para un vendedor puntual le gana al porcentaje cargado en Configuración → Usuarios. Si editás el porcentaje del usuario y no cambia nada, es porque existe una regla que lo tapa.",
        "Un vendedor sin porcentaje configurado no cobra, y su comisión ni siquiera aparece en la lista. No hay un valor por defecto que lo cubra.",
      ],
      placement: "bottom",
      align: "start",
      requirePermission: { module: "commissions", permission: "write" },
      onMissing: "skip",
    },
  ],
}
