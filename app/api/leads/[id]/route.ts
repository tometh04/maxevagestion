import { NextResponse } from "next/server"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  getOrCreateDefaultAccount,
  invalidateBalanceCache,
} from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate, getExchangeRateWithFallback } from "@/lib/accounting/exchange-rates"
import {
  mapDepositMethodToLedgerMethod,
  getAccountTypeForDeposit,
} from "@/lib/accounting/deposit-utils"
import { logAudit, getClientIP } from "@/lib/audit"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id } = await params

    if (!canPerformAction(user, "leads", "write")) {
      return NextResponse.json({ error: "No tiene permiso para eliminar leads" }, { status: 403 })
    }

    // Cross-tenant fix (2026-05-18): exigir org_id explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const userOrgId = (user as any).org_id as string

    const supabase = await createServerClient()

    // Get current lead — filtro org_id explícito, no confiar en RLS
    const { data: currentLead } = await (supabase
      .from("leads") as any)
      .select("*, agencies(name)")
      .eq("id", id)
      .eq("org_id", userOrgId)
      .single()

    if (!currentLead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
    }

    const lead = currentLead as any

    // Propiedad total sobre leads: cualquier usuario con permiso puede eliminar cualquier lead,
    // independientemente de si está asignado a otro vendedor o de su origen.
    // Única restricción de integridad: no se puede eliminar si está vinculado a una operación.

    // Check if lead is linked to an operation
    const { data: operations } = await (supabase
      .from("operations") as any)
      .select("id")
      .eq("lead_id", id)
      .eq("org_id", userOrgId)
      .limit(1)

    if (operations && operations.length > 0) {
      return NextResponse.json(
        { error: "No se puede eliminar un lead que está vinculado a una operación" },
        { status: 400 }
      )
    }

    // Delete lead — admin client para cascada sobre FKs, acotado SIEMPRE por
    // org_id validado arriba (defense-in-depth).
    // adminDb justificado: cascada FK puede tener triggers que requieren bypass.
    const adminClient = createAdminClient()
    const { error } = await (adminClient.from("leads") as any)
      .delete()
      .eq("id", id)
      .eq("org_id", userOrgId)

    if (error) {
      console.error("Error deleting lead:", error)
      return NextResponse.json({ error: "Error al eliminar lead" }, { status: 500 })
    }

    // Audit log — quién borró qué lead y sus datos clave
    logAudit(supabase, {
      user_id: user.id,
      user_email: user.email,
      action: "DELETE",
      entity_type: "lead",
      entity_id: id,
      details: {
        contact_name: lead?.contact_name || null,
        contact_phone: lead?.contact_phone || null,
        contact_email: lead?.contact_email || null,
        status: lead?.status || null,
        source: lead?.source || null,
        assigned_seller_id: lead?.assigned_seller_id || null,
        agency_id: lead?.agency_id || null,
        user_role: user.role,
      },
      ip_address: getClientIP(request) || undefined,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/leads/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al eliminar lead" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id } = await params
    const body = await request.json()

    if (!canPerformAction(user, "leads", "write")) {
      return NextResponse.json({ error: "No tiene permiso para editar leads" }, { status: 403 })
    }

    // Cross-tenant fix (2026-05-18): exigir org_id explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const userOrgId = (user as any).org_id as string

    const supabase = await createServerClient()

    // Get current lead — filtro org_id explícito
    const { data: currentLead } = await (supabase
      .from("leads") as any)
      .select("*")
      .eq("id", id)
      .eq("org_id", userOrgId)
      .single()

    if (!currentLead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
    }

    const lead = currentLead as any

    // Body anti-forge: no aceptar org_id ni agency_id del body
    delete body.org_id
    delete body.agency_id

    // Propiedad total: una vez en el sistema, el lead es nuestro.
    // Cualquier usuario con permiso puede editar cualquier campo de cualquier lead,
    // sin importar su origen ni a quién esté asignado.

    const updateData: any = {
      ...body,
      updated_at: new Date().toISOString(),
    }

    // Proteger campos del sistema que nunca deben modificarse directamente
    delete updateData.id
    delete updateData.created_at
    delete updateData.external_id  // ID externo legacy (Trello import) — no tocar
    delete updateData.trello_url   // legacy column — no tocar

    // Auto-asignar seller cuando se mueve a una lista con dueño
    if (body.list_name && body.list_name !== lead.list_name) {
      const { data: targetList } = await (supabase.from("manychat_list_order") as any)
        .select("seller_id")
        .eq("list_name", body.list_name)
        .eq("agency_id", lead.agency_id)
        .eq("org_id", userOrgId)
        .maybeSingle()

      if (targetList?.seller_id) {
        updateData.assigned_seller_id = targetList.seller_id
      }
    }

    // Limpiar campos opcionales
    if (updateData.assigned_seller_id === "none" || updateData.assigned_seller_id === null) {
      updateData.assigned_seller_id = null
    }
    if (updateData.deposit_account_id === "none" || updateData.deposit_account_id === null) {
      updateData.deposit_account_id = null
    }
    if (updateData.deposit_currency === "none" || updateData.deposit_currency === null) {
      updateData.deposit_currency = null
    }
    if (updateData.has_deposit === false) {
      updateData.deposit_amount = null
      updateData.deposit_currency = null
      updateData.deposit_method = null
      updateData.deposit_date = null
      updateData.deposit_account_id = null
    }

    // adminDb justificado: cross-org read after write para devolver el lead
    // enriquecido. UPDATE acotado por org_id validado arriba.
    const adminClient = createAdminClient()
    const { error } = await (adminClient.from("leads") as any)
      .update(updateData)
      .eq("id", id)
      .eq("org_id", userOrgId)

    if (error) {
      console.error("Error updating lead:", error)
      return NextResponse.json({ error: "Error al actualizar lead" }, { status: 500 })
    }

    // Manejar depósito si se envió (aunque ya no está en el formulario, puede venir en el body)
      const hasDeposit = updateData.has_deposit
      const depositAmount = updateData.deposit_amount
      const depositCurrency = updateData.deposit_currency
      const depositDate = updateData.deposit_date
      const depositMethod = updateData.deposit_method
      const depositAccountId = updateData.deposit_account_id
      const previousHasDeposit = lead.has_deposit

      const depositChanged = 
      hasDeposit !== undefined && (
        hasDeposit !== previousHasDeposit ||
        depositAmount !== lead.deposit_amount ||
        depositCurrency !== lead.deposit_currency ||
        depositDate !== lead.deposit_date
      )

      if (depositChanged) {
        // Buscar ledger movement existente para este lead
        const { data: existingMovement } = await supabase
          .from("ledger_movements")
          .select("id")
          .eq("lead_id", id)
          .eq("type", "INCOME")
          .maybeSingle()

        if (hasDeposit && depositAmount && depositCurrency && depositDate) {
          try {
            // Usar la cuenta seleccionada por el usuario, o buscar una por defecto
            let finalAccountId = depositAccountId
            if (!finalAccountId) {
              const accountType = getAccountTypeForDeposit(
                depositMethod,
                depositCurrency as "ARS" | "USD"
              )
              finalAccountId = await getOrCreateDefaultAccount(
                accountType,
                depositCurrency as "ARS" | "USD",
                user.id,
                supabase
              )
            }

            let exchangeRate: number | null = null
            if (depositCurrency === "USD") {
              const rateDate = depositDate ? new Date(depositDate) : new Date()
              const rateResult = await getExchangeRateWithFallback(supabase, rateDate, "leads-update")
              exchangeRate = rateResult.rate
            }

            const amountArsEquivalent = calculateARSEquivalent(
              depositAmount,
              depositCurrency as "ARS" | "USD",
              exchangeRate
            )

            // Mapear método de pago al método del ledger
            const method = mapDepositMethodToLedgerMethod(depositMethod)

            if (existingMovement) {
              const { error: updateError } = await (supabase.from("ledger_movements") as any)
                .update({
                  concept: `Depósito recibido de lead: ${lead.contact_name}`,
                  currency: depositCurrency,
                  amount_original: depositAmount,
                  exchange_rate: exchangeRate,
                  amount_ars_equivalent: amountArsEquivalent,
                  method: method,
                  account_id: finalAccountId,
                  notes: `Depósito recibido el ${depositDate}. Método: ${depositMethod || "No especificado"}`,
                })
                .eq("id", (existingMovement as any).id)

              if (updateError) {
                console.error("Error updating ledger movement:", updateError)
              } else {
              }
            } else {
              await createLedgerMovement(
                {
                  lead_id: id,
                  type: "INCOME",
                  concept: `Depósito recibido de lead: ${lead.contact_name}`,
                  currency: depositCurrency,
                  amount_original: depositAmount,
                  exchange_rate: exchangeRate,
                  amount_ars_equivalent: amountArsEquivalent,
                  method: method,
                  account_id: finalAccountId,
                  seller_id: lead.assigned_seller_id || (user.role === "SELLER" ? user.id : null),
                  receipt_number: null,
                  notes: `Depósito recibido el ${depositDate}. Método: ${depositMethod || "No especificado"}`,
                  created_by: user.id,
                },
                supabase
              )
            }
          } catch (error) {
            console.error("Error creating/updating ledger movement for deposit:", error)
          }
        } else if (previousHasDeposit && !hasDeposit && existingMovement) {
        const movementAccountId = (existingMovement as any).account_id
        const { error: deleteError } = await (supabase.from("ledger_movements") as any)
          .delete()
          .eq("id", (existingMovement as any).id)

        if (deleteError) {
          console.error("Error deleting ledger movement:", deleteError)
        } else {
          // Invalidar cache de balance de la cuenta afectada
          if (movementAccountId) invalidateBalanceCache(movementAccountId)
        }
      }
    }

    const { data: updatedLead } = await (adminClient.from("leads") as any)
      .select("*, agencies(name), users:assigned_seller_id(name, email)")
      .eq("id", id)
      .eq("org_id", userOrgId)
      .single()

    return NextResponse.json({ success: true, lead: updatedLead })
  } catch (error: any) {
    console.error("Error in PATCH /api/leads/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al actualizar lead" }, { status: 500 })
  }
}

