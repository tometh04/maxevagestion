import type { TourDefinition } from "../types"

const CAN_QUOTE = { module: "leads", permission: "write" } as const

export const cotizarEmiliaTour: TourDefinition = {
  id: "cotizar-emilia",
  title: "Cotizar con Emilia",
  kind: "form",
  scope: "user",
  match: ["/sales/crm-manychat"],
  autoStart: false,
  contextualAnchor: "emilia.prompt",
  launchHint: "Abrí un lead y elegí Más → Cotizar",
  steps: [
    {
      id: "pedido-completo",
      target: "emilia.prompt",
      title: "Empezá con el viaje completo",
      body: "Emilia puede buscar vuelos, hoteles o ambos. Revisá origen, destino, fechas, pasajeros y, para hoteles, preferencias como régimen y categoría.",
      details: [
        "Vuelo: “Cotizá vuelos ida y vuelta de Buenos Aires a Cancún del 10 al 17 de octubre para 2 adultos”.",
        "Hotel: “Cotizá hotel en Cancún del 10 al 17 de octubre para 2 adultos, all inclusive, de 4 estrellas o más”.",
        "Vuelo + hotel: “Cotizá vuelo y hotel a Aruba saliendo desde Buenos Aires el 5 de diciembre y volviendo el 20, para 2 adultos”.",
      ],
      requirePermission: CAN_QUOTE,
      placement: "top",
      onMissing: "center",
    },
    {
      id: "revisar-prompt",
      target: "emilia.prompt",
      title: "Revisá el pedido sugerido",
      body: "Corregí cualquier dato ambiguo y agregá tus prioridades. Emilia busca según lo que está escrito acá, no según lo que quedó implícito en la conversación con el cliente.",
      details: [
        "Si no tenés un dato, podés enviar igual: Emilia te va a pedir lo necesario para continuar.",
      ],
      requirePermission: CAN_QUOTE,
      placement: "top",
      interactive: true,
    },
    {
      id: "enviar-y-refinar",
      target: "emilia.send",
      title: "Filtrá, elegí y generá",
      body: "Cuando lleguen los resultados, usá los filtros, elegí un vuelo y las habitaciones que quieras cotizar, y después generá la cotización.",
      details: [
        "Vuelos: podés filtrar por precio máximo, escalas, aerolínea y mayorista.",
        "Hoteles: podés filtrar por total de habitación, categoría, régimen y mayorista.",
        "Revisá fechas, pasajeros y condiciones antes de generar la cotización. La selección final siempre queda bajo tu control.",
      ],
      requirePermission: CAN_QUOTE,
      placement: "top",
      align: "end",
      interactive: true,
    },
  ],
}
