// Todas las guías registradas. Agregar una es sumar el import y la entrada.
//
// El orden no importa: resolveTourForPath desempata por especificidad de ruta.
// Las de `kind: "form"` no participan de esa resolución — se llega a ellas
// encadenadas desde un paso o eligiéndolas en el menú.

import type { TourDefinition } from "../types"
import { setupCuentaTour } from "./setup-cuenta"
import { operationsListTour } from "./operations-list"
import { operationDetailTour } from "./operation-detail"
import { operationNewTour } from "./operation-new"
import { billingAfipTour } from "./billing-afip"
import { cashSummaryTour } from "./cash-summary"
import { crmKanbanTour } from "./crm-kanban"
import { leadNewTour } from "./lead-new"
import { commissionsTour } from "./commissions"
import { opPaxTour } from "./op-pax"
import { opCobroTour } from "./op-cobro"
import { opPagoTour } from "./op-pago"
import { billingNewTour } from "./billing-new"
import { cotizarEmiliaTour } from "./cotizar-emilia"
import { crmEmiliaDiscoveryTour } from "./crm-emilia-discovery"

export const ALL_TOURS: TourDefinition[] = [
  setupCuentaTour,
  operationsListTour,
  operationDetailTour,
  operationNewTour,
  opPaxTour,
  opCobroTour,
  opPagoTour,
  billingAfipTour,
  billingNewTour,
  cashSummaryTour,
  crmKanbanTour,
  leadNewTour,
  cotizarEmiliaTour,
  crmEmiliaDiscoveryTour,
  commissionsTour,
]

export {
  setupCuentaTour,
  operationsListTour,
  operationDetailTour,
  operationNewTour,
  opPaxTour,
  opCobroTour,
  opPagoTour,
  billingAfipTour,
  billingNewTour,
  cashSummaryTour,
  crmKanbanTour,
  leadNewTour,
  cotizarEmiliaTour,
  crmEmiliaDiscoveryTour,
  commissionsTour,
}
