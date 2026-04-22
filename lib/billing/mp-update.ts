import { shouldRequireMpReauth } from "./custom-plans"
import {
  fetchPreapproval,
  updatePreapproval,
  cancelPreapproval,
  createPreapproval,
  type CreatePreapprovalParams,
} from "./mercadopago"

export type ApplyPriceChangeAction =
  | "NO_PREAPPROVAL"
  | "UPDATED_IN_PLACE"
  | "REAUTH_REQUIRED"

export interface ApplyPriceChangeResult {
  action: ApplyPriceChangeAction
  /** Presente solo cuando action === REAUTH_REQUIRED */
  newPreapprovalId?: string
  checkoutUrl?: string
}

export interface ApplyPriceChangeInput {
  preapprovalId: string | null
  /** Monto actual conocido (último cobrado). Puede venir de DB para evitar fetch MP extra. */
  currentAmount: number
  newAmount: number
  /** Params para recrear el preapproval si hay que cancelar y volver a crear. */
  recreateParams: CreatePreapprovalParams
}

export async function applyPriceChange(
  input: ApplyPriceChangeInput
): Promise<ApplyPriceChangeResult> {
  if (!input.preapprovalId) {
    return { action: "NO_PREAPPROVAL" }
  }

  // Verificación del amount actual desde MP (source of truth).
  const mp = await fetchPreapproval(input.preapprovalId)
  const mpAmount =
    (mp?.auto_recurring?.transaction_amount as number | undefined) ?? input.currentAmount

  if (!shouldRequireMpReauth(mpAmount, input.newAmount)) {
    await updatePreapproval(input.preapprovalId, { transaction_amount: input.newAmount })
    return { action: "UPDATED_IN_PLACE" }
  }

  await cancelPreapproval(input.preapprovalId)
  const fresh = await createPreapproval(input.recreateParams)
  return {
    action: "REAUTH_REQUIRED",
    newPreapprovalId: fresh.id,
    checkoutUrl: fresh.init_point,
  }
}
