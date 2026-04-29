export type {
  AgencyId,
  ImportPipeline,
  ImportConfig,
  ImportResult,
  ImportError,
  ImportWarning,
  RollbackEntry,
  ExchangeRateConfig,
  PipelineFn,
} from "./types"

export { customersPipeline } from "./pipelines/customers"
export { operatorsPipeline } from "./pipelines/operators"
export { paymentsSueltoPipeline } from "./pipelines/payments-suelto"
export { cashMovementsPipeline } from "./pipelines/cash-movements"
export { operationsMasterPipeline } from "./pipelines/operations-master"
export { usersPipeline } from "./pipelines/users"

import type { ImportPipeline, PipelineFn } from "./types"
import { customersPipeline } from "./pipelines/customers"
import { operatorsPipeline } from "./pipelines/operators"
import { paymentsSueltoPipeline } from "./pipelines/payments-suelto"
import { cashMovementsPipeline } from "./pipelines/cash-movements"
import { operationsMasterPipeline } from "./pipelines/operations-master"
import { usersPipeline } from "./pipelines/users"

export const PIPELINES: Record<ImportPipeline, PipelineFn> = {
  "customers": customersPipeline,
  "operators": operatorsPipeline,
  "payments-suelto": paymentsSueltoPipeline,
  "cash-movements": cashMovementsPipeline,
  "operations-master": operationsMasterPipeline,
  "users": usersPipeline,
}
