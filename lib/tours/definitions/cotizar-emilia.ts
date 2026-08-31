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
      target: "emilia.prompt-guide",
      title: "Empezá con el viaje completo",
      body: "Emilia prepara una sugerencia con los datos del lead. Usala como base y completá lo que falte antes de buscar.",
      details: [
        "Un buen pedido incluye origen, destino, fechas o noches, pasajeros y las preferencias que cambian la búsqueda: equipaje, escalas, régimen, categoría o presupuesto.",
        "Ejemplo: “Quiero un vuelo ida y vuelta de Buenos Aires a Cancún del 10 al 17 de octubre para 2 adultos, con carry on, y hotel all inclusive de 4 estrellas o más”.",
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
      title: "Enviá y refiná los resultados",
      body: "Después de la primera búsqueda podés pedir cambios en lenguaje natural, por ejemplo vuelos directos, otro presupuesto o una zona de hotel diferente.",
      details: [
        "Revisá fechas, pasajeros y condiciones antes de generar la cotización. La selección final siempre queda bajo tu control.",
      ],
      requirePermission: CAN_QUOTE,
      placement: "top",
      align: "end",
      interactive: true,
    },
  ],
}
