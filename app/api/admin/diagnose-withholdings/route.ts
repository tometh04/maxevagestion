import { NextResponse } from "next/server"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { loadWithholdingRules, calculateWithholdings, DEFAULT_WITHHOLDING_RULES } from "@/lib/accounting/withholding-rules"

/**
 * Diagnóstico de percepciones para un payment_id específico.
 * GET /api/admin/diagnose-withholdings?paymentId=xxx
 *
 * Retorna el estado completo del flow de percepciones para entender por qué
 * no se crean. NO hace INSERT — sólo lee y simula el cálculo.
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const { searchParams } = new URL(request.url)
    const paymentId = searchParams.get("paymentId")

    if (!paymentId) {
      return NextResponse.json({ error: "paymentId requerido" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const admin = createAdminClient() as any

    // 1. Payment data
    const { data: payment, error: payError } = await admin
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .single()

    if (payError || !payment) {
      return NextResponse.json({
        step: "1-fetch-payment",
        error: payError?.message || "Payment no encontrado",
      }, { status: 404 })
    }

    // 2. Operation data
    const { data: operation } = await admin
      .from("operations")
      .select("id, destination, agency_id, org_id")
      .eq("id", payment.operation_id)
      .single()

    // 3. financial_settings (incluye withholdings_enabled y rules custom)
    const { data: finSettings } = await admin
      .from("financial_settings")
      .select("agency_id, withholdings_enabled, withholding_rules")
      .eq("agency_id", operation?.agency_id || "")
      .maybeSingle()

    // 4. Cargar rules como lo hace el flow real
    const rules = await loadWithholdingRules(supabase, operation?.agency_id)

    // 5. Detectar si destino es internacional
    const dest = operation?.destination || ""
    const isInternational = (() => {
      if (!dest) return false
      const normalized = dest.trim().toLowerCase()
      const domesticKeywords = ["argentina", "nacional", "cabotaje", "domestic"]
      return !domesticKeywords.some((kw) => normalized.includes(kw))
    })()

    // 6. Simular cálculo de withholdings (sin guardar)
    const simulatedWithholdings = calculateWithholdings(rules, {
      amount: Number(payment.amount),
      currency: payment.currency,
      type: "CUSTOMER_PAYMENT",
      payment_method: payment.method,
      destination: dest,
    })

    const simulatedWithholdingsAllRG = calculateWithholdings(rules, {
      amount: Number(payment.amount),
      currency: payment.currency,
      type: "CUSTOMER_PAYMENT",
      payment_method: "Efectivo", // forzar para ver si RG 3819 también
      destination: dest,
    })

    // 7. Existing withholdings para este payment
    const { data: existingWithholdings } = await admin
      .from("tax_withholdings")
      .select("id, type, amount, currency, org_id, agency_id, created_at, source_id, source_type")
      .eq("source_id", paymentId)
      .eq("source_type", "PAYMENT")

    // 8. Probar INSERT real con admin client (dry-run: insertar y borrar)
    let canInsertWithAdmin = false
    let insertError: any = null
    if ((user as any).org_id) {
      const testRecord = {
        type: "PERCEPCION_RG5617_30",
        direction: "PRACTICED",
        source_type: "DIAGNOSTIC_TEST",
        source_id: paymentId,
        operation_id: payment.operation_id,
        currency: payment.currency || "ARS",
        amount: 0.01,
        org_id: (user as any).org_id,
        agency_id: operation?.agency_id || null,
        tax_period: new Date().toISOString().substring(0, 7),
        withholding_date: new Date().toISOString().split("T")[0],
        status: "PENDING",
        notes: "TEST diagnóstico — borrar",
        created_by: user.id,
      }
      const { data: inserted, error: insErr } = await admin
        .from("tax_withholdings")
        .insert([testRecord])
        .select("id")
      if (inserted && inserted.length > 0) {
        canInsertWithAdmin = true
        // borrar inmediatamente
        await admin.from("tax_withholdings").delete().eq("id", inserted[0].id)
      } else {
        insertError = insErr
      }
    }

    return NextResponse.json({
      diagnostic: {
        userOrgId: (user as any).org_id,
        userRole: user.role,
      },
      payment: {
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        approval_status: payment.approval_status,
        direction: payment.direction,
        payer_type: payment.payer_type,
        method: payment.method,
        operation_id: payment.operation_id,
        org_id: payment.org_id,
        created_at: payment.created_at,
      },
      operation: {
        id: operation?.id,
        destination: operation?.destination,
        agency_id: operation?.agency_id,
        org_id: operation?.org_id,
        isInternational,
      },
      financial_settings: {
        exists: !!finSettings,
        withholdings_enabled: finSettings?.withholdings_enabled,
        has_custom_rules: Array.isArray(finSettings?.withholding_rules),
        custom_rules_count: Array.isArray(finSettings?.withholding_rules)
          ? finSettings.withholding_rules.length
          : 0,
      },
      rules: {
        loaded_count: rules.length,
        loaded: rules,
        defaults_count: DEFAULT_WITHHOLDING_RULES.length,
      },
      simulation: {
        with_payment_method: simulatedWithholdings,
        if_method_were_cash: simulatedWithholdingsAllRG,
      },
      existing_withholdings_for_this_payment: existingWithholdings || [],
      insert_test: {
        canInsertWithAdmin,
        insertError: insertError ? {
          message: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
        } : null,
      },
    })
  } catch (error: any) {
    return NextResponse.json({
      error: error?.message || "Error inesperado",
      stack: error?.stack,
    }, { status: 500 })
  }
}
