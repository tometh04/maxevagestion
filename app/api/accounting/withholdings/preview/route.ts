import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  calculateWithholdings,
  loadWithholdingRules,
  type WithholdingRule,
} from "@/lib/accounting/withholding-rules"

/**
 * POST /api/accounting/withholdings/preview
 *
 * Calcula percepciones/retenciones aplicables sin persistir nada.
 * Multi-tenant: las reglas se cargan vía loadWithholdingRules() que respeta
 * RLS sobre `financial_settings` (cada org/agency ve solo sus reglas).
 *
 * Caso de uso principal: form de carga de purchase_invoices llama este endpoint
 * cuando cambia operator/amount, para autocompletar percepción IVA / IIBB.
 */

const InputSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.enum(["ARS", "USD"]).default("ARS"),
  type: z.enum(["OPERATOR_PAYMENT", "CUSTOMER_PAYMENT"]),
  counterpart_cuit: z.string().optional().nullable(),
  agency_id: z.string().uuid().optional().nullable(),
  destination: z.string().optional().nullable(),
  payment_method: z.string().optional().nullable(),
  /** Tipos a excluir del cálculo (para que el form descarte algunos si quiere) */
  excluded_types: z.array(z.string()).optional(),
})

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const parsed = InputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation", issues: parsed.error.issues },
        { status: 400 }
      )
    }

    const supabase = await createServerClient()

    // Cargar reglas (RLS por org filtra automáticamente)
    const rules = await loadWithholdingRules(
      supabase,
      parsed.data.agency_id ?? undefined
    )

    // Master toggle: rules vacío significa withholdings_enabled=false en la org
    if (rules.length === 0) {
      return NextResponse.json({
        withholdings: [],
        applied_rules: [],
        master_toggle_off: true,
      })
    }

    // Calcular
    const withholdings = calculateWithholdings(rules, {
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      type: parsed.data.type,
      counterpart_cuit: parsed.data.counterpart_cuit ?? undefined,
      destination: parsed.data.destination ?? undefined,
      payment_method: parsed.data.payment_method ?? undefined,
      excluded_types: parsed.data.excluded_types as any,
    })

    // Devolver también las reglas que aplicaron, para mostrar en banner
    const appliedRulesByType = new Map<string, WithholdingRule>()
    for (const rule of rules) {
      appliedRulesByType.set(rule.type, rule)
    }

    const applied_rules = withholdings.map((w) => ({
      type: w.type,
      rate: w.rate,
      min_amount: appliedRulesByType.get(w.type)?.min_amount ?? 0,
    }))

    return NextResponse.json({
      withholdings,
      applied_rules,
      master_toggle_off: false,
    })
  } catch (error: any) {
    console.error("Error in withholdings/preview:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
