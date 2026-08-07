// Todas las guías registradas. Agregar una es sumar el import y la entrada.
//
// El orden no importa: resolveTourForPath desempata por especificidad de ruta.

import type { TourDefinition } from "../types"
import { setupCuentaTour } from "./setup-cuenta"
import { operationsListTour } from "./operations-list"
import { operationDetailTour } from "./operation-detail"
import { billingAfipTour } from "./billing-afip"
import { cashSummaryTour } from "./cash-summary"
import { crmKanbanTour } from "./crm-kanban"
import { commissionsTour } from "./commissions"

export const ALL_TOURS: TourDefinition[] = [
  setupCuentaTour,
  operationsListTour,
  operationDetailTour,
  billingAfipTour,
  cashSummaryTour,
  crmKanbanTour,
  commissionsTour,
]

export {
  setupCuentaTour,
  operationsListTour,
  operationDetailTour,
  billingAfipTour,
  cashSummaryTour,
  crmKanbanTour,
  commissionsTour,
}
