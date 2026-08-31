import type { TourDefinition } from "../types"

export const crmEmiliaDiscoveryTour: TourDefinition = {
  id: "crm-emilia-discovery",
  title: "Cotizar con Emilia",
  kind: "form",
  scope: "user",
  match: ["/sales/crm-manychat"],
  autoStart: false,
  launchHint: "Abrí el CRM de Ventas para ver esta novedad",
  steps: [
    {
      id: "cotizar-desde-lead",
      title: "Cotizá con Emilia desde el lead",
      body: "Abrí un lead y elegí “Más → Cotizar”. Emilia busca opciones reales y convierte lo que selecciones en una cotización.",
      requirePermission: { module: "leads", permission: "write" },
    },
  ],
}
