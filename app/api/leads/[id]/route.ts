import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  getOrCreateDefaultAccount,
} from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"
import {
  mapDepositMethodToLedgerMethod,
  getAccountTypeForDeposit,
} from "@/lib/accounting/deposit-utils"

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

    const supabase = await createServerClient()

    // Get current lead
    const { data: currentLead } = await supabase
      .from("leads")
      .select("*, agencies(name)")
      .eq("id", id)
      .single()

    if (!currentLead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
    }

    const lead = currentLead as any

    // Check permissions for SELLER:
    // - Can delete leads assigned to them
    // - Can delete unassigned leads
    // - Cannot delete leads assigned to OTHER sellers
    if (user.role === "SELLER") {
      const isAssignedToOther = lead.assigned_seller_id && lead.assigned_seller_id !== user.id
      if (isAssignedToOther) {
        return NextResponse.json({ error: "No puedes eliminar leads asignados a otros vendedores" }, { status: 403 })
      }
    }

    // Si el lead viene de Trello, no permitir eliminarlo desde aquí
    // Debe eliminarse desde Trello para mantener la sincronización
    if (lead.source === "Trello" && lead.external_id) {
      return NextResponse.json(
        { error: "No se puede eliminar un lead sincronizado con Trello. Elimínalo desde Trello." },
        { status: 400 }
      )
    }

    // Check if lead is linked to an operation
    const { data: operations } = await supabase
      .from("operations")
      .select("id")
      .eq("lead_id", id)
      .limit(1)

    if (operations && operations.length > 0) {
      return NextResponse.json(
        { error: "No se puede eliminar un lead que está vinculado a una operación" },
        { status: 400 }
      )
    }

    // Delete lead
    const { error } = await (supabase.from("leads") as any).delete().eq("id", id)

    if (error) {
      console.error("Error deleting lead:", error)
      return NextResponse.json({ error: "Error al eliminar lead" }, { status: 500 })
    }

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

    const supabase = await createServerClient()

    // Get current lead
    const { data: currentLead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .single()

    if (!currentLead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
    }

    const lead = currentLead as any

    // Check permissions for SELLER:
    // - Can edit leads assigned to them
    // - Can edit unassigned leads (to claim them)
    // - Cannot edit leads assigned to OTHER sellers
    if (user.role === "SELLER") {
      const isAssignedToMe = lead.assigned_seller_id === user.id
      const isUnassigned = lead.assigned_seller_id === null || lead.assigned_seller_id === undefined
      const isAssignedToOther = lead.assigned_seller_id && lead.assigned_seller_id !== user.id
      
      if (isAssignedToOther) {
        return NextResponse.json({ error: "No puedes editar leads asignados a otros vendedores" }, { status: 403 })
      }
    }

    // Si el lead está sincronizado con Trello (tiene external_id), solo permitir editar ciertos campos
    // Los leads de Manychat que crean tarjetas pero no están sincronizados pueden editarse completamente
    if (lead.source === "Trello" && lead.external_id) {
      // Solo permitir editar campos que no afectan la sincronización
      const allowedFields = ["assigned_seller_id", "notes"]
      const updateData: any = {}
      
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updateData[field] = body[field]
        }
      }

      updateData.updated_at = new Date().toISOString()

      const { error } = await (supabase.from("leads") as any)
        .update(updateData)
        .eq("id", id)

      if (error) {
        console.error("Error updating lead:", error)
        return NextResponse.json({ error: "Error al actualizar lead" }, { status: 500 })
      }

      return NextResponse.json({ success: true, lead: { id } })
    }

    // Lead no sincronizado con Trello (Manychat o Trello sin external_id) - permitir editar todos los campos
    const updateData: any = {
      ...body,
      updated_at: new Date().toISOString(),
    }

    // Remove fields that shouldn't be updated directly
    delete updateData.id
    delete updateData.created_at
    delete updateData.external_id
    delete updateData.trello_url
    // Para leads de Manychat, permitir actualizar list_name
    // Para leads de Trello sin external_id, NO permitir actualizar list_name (se sincroniza desde Trello)
    if (lead.source === "Trello" && !lead.external_id) {
      delete updateData.list_name
      delete updateData.trello_list_id
    }

    // Limpiar campos opcionales
    if (updateData.assigned_seller_id === "none" || updateData.assigned_seller_id === null) {
      updateData.assigned_seller_id = null
    }

    const { error } = await (supabase.from("leads") as any)
      .update(updateData)
      .eq("id", id)

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
              exchangeRate = await getExchangeRate(supabase, rateDate)

              if (!exchangeRate) {
                exchangeRate = await getLatestExchangeRate(supabase)
              }

              if (!exchangeRate) {
                console.warn(`No exchange rate found for ${rateDate.toISOString()}, using fallback 1000`)
                exchangeRate = 1000
              }
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
                console.log(`✅ Updated ledger movement for deposit of ${depositAmount} ${depositCurrency} for lead ${id}`)
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
              console.log(`✅ Created ledger movement for deposit of ${depositAmount} ${depositCurrency} for lead ${id}`)
            }
          } catch (error) {
            console.error("Error creating/updating ledger movement for deposit:", error)
          }
        } else if (previousHasDeposit && !hasDeposit && existingMovement) {
          const { error: deleteError } = await (supabase.from("ledger_movements") as any)
            .delete()
            .eq("id", (existingMovement as any).id)

          if (deleteError) {
            console.error("Error deleting ledger movement:", deleteError)
          } else {
            console.log(`✅ Deleted ledger movement for lead ${id} (deposit removed)`)
          }
        }
      }

    const { data: updatedLead } = await supabase
      .from("leads")
      .select("*, agencies(name), users:assigned_seller_id(name, email)")
      .eq("id", id)
      .single()

    return NextResponse.json({ success: true, lead: updatedLead })
  } catch (error: any) {
    console.error("Error in PATCH /api/leads/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al actualizar lead" }, { status: 500 })
  }
}

