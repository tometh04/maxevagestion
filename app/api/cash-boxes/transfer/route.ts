import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { getExchangeRate } from "@/lib/accounting/exchange-rates"

/**
 * Transfiere dinero entre cajas
 * Sincroniza con: Cash Boxes (actualiza balances automáticamente)
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "cash", "write")) {
      return NextResponse.json({ error: "No tiene permiso para transferir entre cajas" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const {
      from_box_id,
      to_box_id,
      amount,
      currency,
      exchange_rate,
      transfer_date,
      reference,
      notes,
    } = body

    // Validate required fields
    if (!from_box_id || !to_box_id || !amount || amount <= 0 || !transfer_date) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Cannot transfer to same box
    if (from_box_id === to_box_id) {
      return NextResponse.json({ error: "No se puede transferir a la misma caja" }, { status: 400 })
    }

    // Get both boxes
    const { data: boxes } = await (supabase.from("cash_boxes") as any)
      .select("*")
      .in("id", [from_box_id, to_box_id])

    if (!boxes || boxes.length !== 2) {
      return NextResponse.json({ error: "Una o ambas cajas no fueron encontradas" }, { status: 404 })
    }

    const fromBox = boxes.find((b: any) => b.id === from_box_id) as any
    const toBox = boxes.find((b: any) => b.id === to_box_id) as any

    if (!fromBox || !toBox) {
      return NextResponse.json({ error: "Cajas no encontradas" }, { status: 404 })
    }

    // Check if boxes are active
    if (!fromBox.is_active || !toBox.is_active) {
      return NextResponse.json({ error: "Una o ambas cajas están inactivas" }, { status: 400 })
    }

    // Check balance if same currency
    if (fromBox.currency === currency && fromBox.current_balance < amount) {
      return NextResponse.json(
        { error: `Saldo insuficiente en caja origen. Disponible: ${fromBox.current_balance}` },
        { status: 400 }
      )
    }

    // Get agency_id from from_box
    const agencyId = fromBox.agency_id

    // Calculate exchange rate if needed
    let finalExchangeRate = exchange_rate
    if (fromBox.currency !== toBox.currency && !finalExchangeRate) {
      const rateDate = transfer_date ? new Date(transfer_date) : new Date()
      finalExchangeRate = await getExchangeRate(supabase, rateDate)
      if (!finalExchangeRate) {
        const { getLatestExchangeRate } = await import("@/lib/accounting/exchange-rates")
        finalExchangeRate = await getLatestExchangeRate(supabase)
      }
      if (!finalExchangeRate) {
        return NextResponse.json(
          { error: "No se pudo obtener tasa de cambio para la transferencia" },
          { status: 400 }
        )
      }
    }

    // Create transfer
    const transferData: Record<string, any> = {
      from_box_id,
      to_box_id,
      agency_id: agencyId,
      amount,
      currency,
      exchange_rate: finalExchangeRate || null,
      transfer_date,
      status: "COMPLETED", // Auto-complete transfers
      reference: reference || null,
      notes: notes || null,
      created_by: user.id,
    }

    const { data: transfer, error: transferError } = await (supabase.from("cash_transfers") as any)
      .insert(transferData)
      .select()
      .single()

    if (transferError) {
      console.error("Error creating transfer:", transferError)
      return NextResponse.json({ error: "Error al crear transferencia" }, { status: 500 })
    }

    // Fetch updated boxes (balances should be updated by trigger)
    const { data: updatedBoxes } = await (supabase.from("cash_boxes") as any)
      .select("*")
      .in("id", [from_box_id, to_box_id])

    return NextResponse.json(
      {
        transfer,
        fromBox: updatedBoxes?.find((b: any) => b.id === from_box_id),
        toBox: updatedBoxes?.find((b: any) => b.id === to_box_id),
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Error in POST /api/cash-boxes/transfer:", error)
    return NextResponse.json({ error: error.message || "Error al transferir entre cajas" }, { status: 500 })
  }
}

